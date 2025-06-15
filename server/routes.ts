import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken, verifyToken } from "./auth";
import { registerSchema, createUserSchema, loginSchema, activateKeySchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, contactSchema, licenseStatusSchema, heartbeatSchema, createActivationKeySchema, updateUserSchema, updateLicenseSchema, createPixPaymentSchema, mercadoPagoWebhookSchema, updateHwidSchema, resetHwidSchema, adminResetHwidSchema } from "@shared/schema";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createPixPayment, getPaymentInfo, PLAN_PRICES } from "./mercado-pago";
import { nanoid } from "nanoid";
import bcrypt from "bcrypt";
import { sendLicenseKeyEmail } from "./email";
import { getBaseUrl } from "./config";
import { generateUniqueActivationKey, createOrUpdateLicense } from "./license-utils";

// Rate limiting map
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Security logging system
const securityLog = {
  logSuspiciousActivity: (ip: string, event: string, details: any) => {
    console.warn(`[SECURITY] ${new Date().toISOString()} - IP: ${ip} - Event: ${event}`, details);
  },
  logFailedLogin: (ip: string, email: string) => {
    console.warn(`[AUTH] ${new Date().toISOString()} - Failed login attempt - IP: ${ip} - Email: ${email}`);
  },
  logRateLimit: (ip: string, endpoint: string) => {
    console.warn(`[RATE_LIMIT] ${new Date().toISOString()} - Rate limit exceeded - IP: ${ip} - Endpoint: ${endpoint}`);
  }
};

// Rate limiting middleware
const rateLimit = (maxRequests: number, windowMs: number): RequestHandler => {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    const record = rateLimitMap.get(key);
    
    if (!record || record.resetTime < windowStart) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (record.count >= maxRequests) {
      securityLog.logRateLimit(key, req.path);
      return res.status(429).json({ 
        message: "Muitas tentativas. Tente novamente em alguns minutos.",
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }
    
    record.count++;
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for monitoring
  app.get("/api/health", async (req, res) => {
    try {
      await storage.getSystemStats();
      res.status(200).json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        database: "connected",
        environment: process.env.NODE_ENV || "development"
      });
    } catch (error) {
      res.status(503).json({ 
        status: "error", 
        timestamp: new Date().toISOString(),
        database: "disconnected"
      });
    }
  });

  // Setup authentication
  await setupAuth(app);

  // Admin middleware
  const isAdmin: RequestHandler = (req, res, next) => {
    const user = req.user as any;
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    next();
  };

  // Endpoint de teste para simular webhook do Mercado Pago
  app.post("/api/test/simulate-webhook", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { userEmail, plan = "test", transactionAmount = 100 } = req.body;
      
      if (!userEmail) {
        return res.status(400).json({ message: "Email do usuário é obrigatório" });
      }

      console.log(`=== SIMULANDO WEBHOOK DO MERCADO PAGO ===`);
      console.log(`Email: ${userEmail}, Plano: ${plan}, Valor: R$ ${transactionAmount/100}`);
      
      // Simular dados do webhook
      const mockPaymentId = `TEST-${Date.now()}`;
      const mockWebhookData = {
        type: "payment",
        data: {
          id: mockPaymentId
        }
      };
      
      // Simular dados do pagamento aprovado
      const mockPaymentInfo = {
        id: mockPaymentId,
        status: "approved",
        status_detail: "accredited",
        transaction_amount: transactionAmount,
        currency_id: "BRL",
        external_reference: `TEST-REF-${Date.now()}`,
        payer: {
          email: userEmail,
          first_name: "Usuario",
          last_name: "Teste"
        }
      };
      
      console.log("Dados simulados do pagamento:", JSON.stringify(mockPaymentInfo, null, 2));
      
      // Encontrar usuário pelo email
      const user = await storage.getUserByEmail(userEmail);
      
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      console.log(`✅ Usuário encontrado: ${user.id} - ${user.email}`);
      
      // Determinar plano baseado no valor
      let finalPlan = "test";
      let durationDays = 1;
      
      if (transactionAmount >= 1000) { // R$ 10,00 ou mais
        finalPlan = "15days";
        durationDays = 15;
      } else if (transactionAmount >= 500) { // R$ 5,00 ou mais  
        finalPlan = "7days";
        durationDays = 7;
      } else {
        finalPlan = "test";
        durationDays = 1;
      }
      
      console.log(`Plano determinado: ${finalPlan} (${durationDays} dias)`);
      
      // Criar pagamento de teste
      const payment = await storage.createPayment({
        userId: user.id,
        plan: finalPlan,
        durationDays,
        transactionAmount,
        currency: "BRL",
        status: "approved",
        mercadoPagoId: mockPaymentId,
        externalReference: mockPaymentInfo.external_reference,
        statusDetail: "accredited",
        payerEmail: userEmail,
        payerFirstName: "Usuario",
        payerLastName: "Teste",
      });
      
      console.log(`✅ Pagamento criado: ${payment.id}`);
      
      // Gerar chave de ativação
      const activationKey = `FOVD-${finalPlan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      console.log(`🔑 Gerando chave: ${activationKey}`);
      
      await storage.createActivationKey({
        key: activationKey,
        plan: finalPlan,
        durationDays,
      });
      
      // Criar ou atualizar licença
      const existingLicense = await storage.getLicenseByUserId(user.id);
      
      const now = new Date();
      let expiryDate: Date;
      let totalMinutes: number;
      
      if (finalPlan === "test") {
        expiryDate = new Date(now.getTime() + (30 * 60 * 1000)); // 30 minutos
        totalMinutes = 30;
      } else {
        expiryDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
        totalMinutes = durationDays * 24 * 60;
      }
      
      if (existingLicense) {
        console.log(`=== RENOVANDO LICENÇA EXISTENTE ===`);
        
        await storage.updateLicense(existingLicense.id, {
          key: activationKey,
          plan: finalPlan,
          status: "active",
          expiresAt: expiryDate,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
          hwid: null
        });
        
        console.log(`✅ LICENÇA RENOVADA - Nova chave: ${activationKey}`);
      } else {
        console.log(`=== CRIANDO NOVA LICENÇA ===`);
        
        await storage.createLicense({
          userId: user.id,
          key: activationKey,
          plan: finalPlan,
          status: "active",
          expiresAt: expiryDate,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
        });
        
        console.log(`✅ NOVA LICENÇA CRIADA - Chave: ${activationKey}`);
      }
      
      // Enviar email
      const planName = finalPlan === "test" ? "Teste (30 minutos)" : 
                       finalPlan === "7days" ? "7 Dias" : "15 Dias";
      
      try {
        console.log(`=== ENVIANDO EMAIL DE TESTE ===`);
        await sendLicenseKeyEmail(userEmail, activationKey, planName);
        console.log(`✅ EMAIL ENVIADO COM SUCESSO!`);
        
        res.json({
          success: true,
          message: "Webhook simulado com sucesso!",
          data: {
            paymentId: mockPaymentId,
            user: user.email,
            plan: finalPlan,
            licenseKey: activationKey,
            expiresAt: expiryDate.toISOString(),
            emailSent: true
          }
        });
      } catch (emailError) {
        console.error("❌ ERRO AO ENVIAR EMAIL:", emailError);
        
        res.json({
          success: true,
          message: "Webhook simulado com sucesso, mas falha no email",
          data: {
            paymentId: mockPaymentId,
            user: user.email,
            plan: finalPlan,
            licenseKey: activationKey,
            expiresAt: expiryDate.toISOString(),
            emailSent: false,
            emailError: emailError instanceof Error ? emailError.message : "Erro desconhecido"
          }
        });
      }
      
    } catch (error) {
      console.error("❌ ERRO NA SIMULAÇÃO:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao simular webhook",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Endpoint de teste para simular confirmação de pagamento e geração de licença
  app.post("/api/test/simulate-payment", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { userEmail, plan = "test" } = req.body;
      
      if (!userEmail) {
        return res.status(400).json({ message: "Email do usuário é obrigatório" });
      }

      console.log(`=== SIMULANDO CONFIRMAÇÃO DE PAGAMENTO E GERAÇÃO DE LICENÇA ===`);
      console.log(`Email: ${userEmail}, Plano: ${plan}`);

      // Encontrar usuário pelo email
      const user = await storage.getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Determinar duração baseada no plano
      let durationDays = 1;
      let transactionAmount = 100;
      
      if (plan === "7days") {
        durationDays = 7;
        transactionAmount = 500;
      } else if (plan === "15days") {
        durationDays = 15;
        transactionAmount = 1000;
      }

      // Criar pagamento aprovado no banco
      const paymentId = `SIMULATION-${Date.now()}`;
      const testPayment = await storage.createPayment({
        userId: user.id,
        plan,
        durationDays,
        transactionAmount,
        currency: "BRL",
        status: "approved",
        mercadoPagoId: paymentId,
        externalReference: `SIM-${paymentId}`,
        statusDetail: "accredited",
        payerEmail: userEmail,
        payerFirstName: user.firstName || "Teste",
        payerLastName: user.lastName || "Usuario",
      });

      console.log(`Pagamento simulado criado: ${testPayment.id}`);

      // Gerar chave de ativação
      const activationKey = `FOVD-${plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      
      await storage.createActivationKey({
        key: activationKey,
        plan,
        durationDays,
      });

      console.log(`Chave de ativação gerada: ${activationKey}`);

      // Processar licença (renovar existente ou criar nova)
      const existingLicense = await storage.getLicenseByUserId(user.id);
      
      if (existingLicense) {
        console.log(`=== RENOVANDO LICENÇA EXISTENTE ===`);
        const now = new Date();
        let newExpiryDate: Date;
        let totalMinutes: number;
        
        if (plan === "test") {
          newExpiryDate = new Date(now.getTime() + (30 * 60 * 1000));
          totalMinutes = 30;
        } else {
          newExpiryDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
          totalMinutes = durationDays * 24 * 60;
        }
        
        await storage.updateLicense(existingLicense.id, {
          key: activationKey,
          plan,
          status: "active",
          expiresAt: newExpiryDate,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
          hwid: null
        });
        
        console.log(`Licença renovada para usuário ${user.id}`);
      } else {
        console.log(`=== CRIANDO NOVA LICENÇA ===`);
        let expiryDate: Date;
        let totalMinutes: number;
        
        if (plan === "test") {
          expiryDate = new Date(Date.now() + (30 * 60 * 1000));
          totalMinutes = 30;
        } else {
          expiryDate = new Date(Date.now() + (durationDays * 24 * 60 * 60 * 1000));
          totalMinutes = durationDays * 24 * 60;
        }
        
        await storage.createLicense({
          userId: user.id,
          key: activationKey,
          plan,
          status: "active",
          expiresAt: expiryDate,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
        });
        
        console.log(`Nova licença criada para usuário ${user.id}`);
      }

      // Testar envio de email
      try {
        const planName = plan === "test" ? "Teste (30 minutos)" : 
                         plan === "7days" ? "7 Dias" : "15 Dias";
        
        console.log(`=== ENVIANDO EMAIL COM CHAVE DE LICENÇA ===`);
        console.log(`Email destino: ${userEmail}`);
        console.log(`Chave: ${activationKey}`);
        console.log(`Plano: ${planName}`);
        
        await sendLicenseKeyEmail(userEmail, activationKey, planName);
        console.log(`✅ EMAIL ENVIADO COM SUCESSO PARA: ${userEmail}`);
        
        res.json({
          success: true,
          message: "Pagamento simulado, licença gerada e email enviado com sucesso",
          data: {
            userId: user.id,
            userEmail,
            activationKey,
            plan,
            planName,
            paymentId: testPayment.id,
            licenseAction: existingLicense ? "renovada" : "criada",
            emailSent: true
          }
        });
      } catch (emailError) {
        console.error("❌ ERRO CRÍTICO AO ENVIAR EMAIL:");
        console.error("Detalhes do erro:", emailError);
        console.error("Chave que deveria ser enviada:", activationKey);
        console.error("Email que deveria receber:", userEmail);
        
        res.json({
          success: true,
          message: "Licença gerada mas houve erro no envio do email",
          data: {
            userId: user.id,
            userEmail,
            activationKey,
            plan,
            paymentId: testPayment.id,
            licenseAction: existingLicense ? "renovada" : "criada",
            emailSent: false,
            emailError: emailError instanceof Error ? emailError.message : "Erro desconhecido"
          }
        });
      }

    } catch (error) {
      console.error("Erro na simulação de pagamento:", error);
      res.status(500).json({ 
        success: false,
        message: "Erro interno na simulação",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });



  // Registration route
  app.post("/api/auth/register", rateLimit(5, 15 * 60 * 1000), async (req, res) => {
    try {
      console.log("=== TENTATIVA DE REGISTRO ===");
      console.log("Dados recebidos:", JSON.stringify(req.body, null, 2));
      
      const { email, password, firstName, lastName } = registerSchema.parse(req.body);
      console.log("Dados validados com sucesso");

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        console.log("Email já existe:", email);
        return res.status(400).json({ message: "Email já está em uso" });
      }

      // Generate username from first and last name
      const username = `${firstName || ''}${lastName || ''}`.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9]/g, '') // Remove caracteres especiais
        .substring(0, 20) + Math.floor(Math.random() * 1000);

      console.log("Username gerado:", username);

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log("Senha hasheada com sucesso");

      // Create user
      const user = await storage.createUser({
        email,
        username,
        password: hashedPassword,
        firstName,
        lastName,
      });

      console.log("✅ Usuário criado com sucesso:", user.email);

      // Automatically log the user in after registration
      req.login(user, (err) => {
        if (err) {
          console.error("Erro no login automático:", err);
          return res.status(201).json({ 
            user: { ...user, password: undefined },
            message: "Usuário criado com sucesso. Faça login para continuar." 
          });
        }
        
        const token = generateToken(user.id);
        res.status(201).json({ 
          user: { ...user, password: undefined },
          token,
          message: "Usuário criado e logado com sucesso" 
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Erro de validação:", error.errors);
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Erro no registro:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", rateLimit(10, 15 * 60 * 1000), (req, res, next) => {
    try {
      loginSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      return res.status(400).json({ message: "Dados inválidos" });
    }

    passport.authenticate("local", (err: any, user: any, info: any) => {
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      
      if (err) {
        securityLog.logSuspiciousActivity(clientIp, "AUTH_ERROR", { error: err.message });
        return res.status(500).json({ message: "Erro de autenticação" });
      }
      if (!user) {
        securityLog.logFailedLogin(clientIp, req.body.email);
        return res.status(401).json({ message: info?.message || "Credenciais inválidas" });
      }

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Falha no login" });
        }
        
        const token = generateToken(user.id);
        res.json({ user: { ...user, password: undefined }, token });
      });
    })(req, res, next);
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Falha no logout" });
      }
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
          return res.status(500).json({ message: "Falha ao destruir sessão" });
        }
        res.clearCookie('connect.sid');
        res.json({ message: "Logout realizado com sucesso" });
      });
    });
  });

  // PIX Payment creation
  app.post("/api/payments/create-pix", isAuthenticated, rateLimit(5, 60 * 1000), async (req, res) => {
    try {
      console.log("=== INÍCIO DA CRIAÇÃO DE PAGAMENTO PIX ===");
      const user = req.user as any;
      console.log(`Usuário autenticado: ${user.id} - ${user.email}`);
      console.log("Dados recebidos:", JSON.stringify(req.body, null, 2));
      
      const requestData = createPixPaymentSchema.parse(req.body);
      console.log("Dados validados:", JSON.stringify(requestData, null, 2));
      
      const paymentData = {
        userId: user.id,
        plan: requestData.plan,
        durationDays: requestData.durationDays,
        payerEmail: requestData.payerEmail,
        payerFirstName: requestData.payerFirstName,
        payerLastName: requestData.payerLastName,
      };
      
      console.log("Dados do pagamento preparados:", JSON.stringify(paymentData, null, 2));
      
      // Create PIX payment with MercadoPago
      console.log("Criando pagamento no Mercado Pago...");
      const pixPayment = await createPixPayment(paymentData);
      console.log("Resposta do Mercado Pago:", JSON.stringify(pixPayment, null, 2));
      
      // Store payment in database
      console.log("Salvando pagamento no banco de dados...");
      const payment = await storage.createPayment({
        userId: user.id,
        preferenceId: pixPayment.preferenceId,
        externalReference: pixPayment.externalReference,
        status: "pending",
        transactionAmount: pixPayment.transactionAmount,
        currency: pixPayment.currency,
        plan: paymentData.plan,
        durationDays: paymentData.durationDays,
        payerEmail: paymentData.payerEmail,
        payerFirstName: paymentData.payerFirstName,
        payerLastName: paymentData.payerLastName,
        pixQrCode: pixPayment.pixQrCode,
        pixQrCodeBase64: pixPayment.pixQrCodeBase64,
      });
      
      console.log(`✅ Pagamento salvo no banco: ID ${payment.id}`);
      console.log("=== PAGAMENTO PIX CRIADO COM SUCESSO ===");

      const response = {
        ...pixPayment,
        paymentId: payment.id
      };
      
      console.log("Resposta final:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("❌ ERRO NA CRIAÇÃO DO PAGAMENTO PIX:");
      console.error("Detalhes do erro:", error);
      if (error instanceof Error) {
        console.error("Stack trace:", error.stack);
      }
      
      if (error instanceof z.ZodError) {
        console.error("Erro de validação Zod:", error.errors);
        return res.status(400).json({ message: "Dados de pagamento inválidos", errors: error.errors });
      }
      
      res.status(500).json({ message: "Erro ao criar pagamento PIX" });
    }
  });

  // MercadoPago webhook - CORRIGIDO para criação automática de usuários e licenças
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      console.log("=== WEBHOOK MERCADO PAGO RECEBIDO ===");
      console.log("Headers:", req.headers);
      console.log("Body:", JSON.stringify(req.body, null, 2));
      
      // Handle different webhook formats from MercadoPago
      let webhookData;
      let paymentId;
      
      // Try to extract payment ID from different possible formats
      if (req.body.type === "payment" && req.body.data?.id) {
        // Standard format
        webhookData = { type: "payment" };
        paymentId = req.body.data.id.toString();
      } else if (req.body.action && req.body.data?.id) {
        // Alternative format with action
        webhookData = { type: "payment" };
        paymentId = req.body.data.id.toString();
      } else if (req.body.id) {
        // Simple format - just payment ID
        webhookData = { type: "payment" };
        paymentId = req.body.id.toString();
      } else {
        console.log("Formato de webhook não reconhecido, tentando processar mesmo assim");
        webhookData = { type: "payment" };
        paymentId = null;
      }
      
      if (webhookData.type === "payment" && paymentId) {
        console.log(`=== PROCESSANDO PAGAMENTO ID: ${paymentId} ===`);
        
        // Get payment info from MercadoPago
        const paymentInfo = await getPaymentInfo(paymentId);
        console.log("=== INFORMAÇÕES DO PAGAMENTO ===");
        console.log("Status:", paymentInfo?.status);
        console.log("Valor:", paymentInfo?.transaction_amount);
        console.log("Email:", paymentInfo?.payer?.email);
        
        if (paymentInfo && paymentInfo.status === "approved") {
          console.log(`✅ PAGAMENTO APROVADO!`);
          console.log(`External Reference: ${paymentInfo.external_reference}`);
          console.log(`Valor: R$ ${(paymentInfo.transaction_amount || 0)/100}`);
          console.log(`Comprador: ${paymentInfo.payer?.email || 'N/A'}`);
          
          // Verificar se email está presente
          if (!paymentInfo.payer?.email || paymentInfo.payer.email.trim() === '') {
            console.error("[WEBHOOK] ❌ Erro crítico: Email do pagador vazio no webhook recebido do Mercado Pago.");
            console.error("[WEBHOOK] Dados do payer:", JSON.stringify(paymentInfo.payer, null, 2));
            res.status(200).json({ received: true });
            return;
          }
          
          console.log(`=== PROCESSANDO PAGAMENTO APROVADO ===`);
          console.log(`Email do comprador: ${paymentInfo.payer.email}`);
          
          // 1. ENCONTRAR OU CRIAR USUÁRIO AUTOMATICAMENTE
          let user = await storage.getUserByEmail(paymentInfo.payer.email);
          
          if (user) {
            console.log(`✅ Usuário encontrado: ${user.id} - ${user.email}`);
          } else {
            console.log(`=== CRIANDO USUÁRIO AUTOMATICAMENTE ===`);
            
            // Extrair username do email (parte antes do @)
            const username = paymentInfo.payer.email.split('@')[0];
            
            // Gerar senha aleatória
            const randomPassword = crypto.randomBytes(8).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            
            // Criar usuário automaticamente
            user = await storage.createUser({
              email: paymentInfo.payer.email,
              username: username,
              firstName: paymentInfo.payer.first_name || "Novo",
              lastName: paymentInfo.payer.last_name || "Usuário", 
              password: hashedPassword
            });
            
            console.log(`✅ Usuário criado automaticamente: ${user.id} - ${user.email}`);
            console.log(`Username gerado: ${username}`);
            console.log(`Nome: ${user.firstName} ${user.lastName}`);
          }
          
          // 2. DETERMINAR PLANO BASEADO NO VALOR
          let plan = "test";
          let durationDays = 1;
          const transactionAmount = paymentInfo.transaction_amount ?? 100;
          
          if (transactionAmount >= 1000) { // R$ 10,00 ou mais
            plan = "15days";
            durationDays = 15;
          } else if (transactionAmount >= 500) { // R$ 5,00 ou mais  
            plan = "7days";
            durationDays = 7;
          } else {
            plan = "test";
            durationDays = 1; // 30 minutos na prática
          }
          
          console.log(`=== PLANO DETERMINADO ===`);
          console.log(`Plano: ${plan} (${durationDays} dias)`);
          console.log(`Valor: R$ ${transactionAmount/100}`);
          
          // 3. VERIFICAR PAGAMENTO EXISTENTE
          console.log(`=== VERIFICANDO PAGAMENTO EXISTENTE ===`);
          let payment = null;
          if (paymentInfo.external_reference) {
            payment = await storage.getPaymentByExternalReference(paymentInfo.external_reference);
            console.log(`Busca por external_reference: ${payment ? 'Encontrado' : 'Não encontrado'}`);
          }
          if (!payment && paymentId) {
            payment = await storage.getPaymentByMercadoPagoId(paymentId);
            console.log(`Busca por mercadoPagoId: ${payment ? 'Encontrado' : 'Não encontrado'}`);
          }
          
          // 4. CRIAR OU ATUALIZAR PAGAMENTO NO BANCO
          if (!payment) {
            console.log(`=== CRIANDO NOVO REGISTRO DE PAGAMENTO ===`);
            payment = await storage.createPayment({
              userId: user.id,
              plan,
              durationDays,
              transactionAmount,
              currency: paymentInfo.currency_id || "BRL",
              status: "approved",
              mercadoPagoId: paymentId,
              externalReference: paymentInfo.external_reference || `WEBHOOK-${paymentId}`,
              statusDetail: paymentInfo.status_detail || "approved",
              payerEmail: paymentInfo.payer.email,
              payerFirstName: paymentInfo.payer.first_name || "Usuario",
              payerLastName: paymentInfo.payer.last_name || "FovDark",
            });
            console.log(`✅ Pagamento salvo no banco - ID: ${payment.id}`);
          } else if (payment.status === "pending") {
            console.log(`=== ATUALIZANDO PAGAMENTO PENDENTE ===`);
            await storage.updatePayment(payment.id, {
              status: "approved",
              mercadoPagoId: paymentId,
              statusDetail: paymentInfo.status_detail || "approved",
            });
            console.log(`✅ Pagamento atualizado para aprovado - ID: ${payment.id}`);
          } else {
            console.log(`=== PAGAMENTO JÁ PROCESSADO ===`);
            console.log(`ID: ${payment.id}, Status: ${payment.status}`);
            console.log(`Processando mesmo assim para garantir entrega da licença...`);
          }
          
          // 5. GERAR CHAVE DE ATIVAÇÃO (seguindo o padrão FOVD-PLANO-TIMESTAMP-RANDOM)
          const activationKey = `FOVD-${plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
          console.log(`=== GERANDO CHAVE DE ATIVAÇÃO ===`);
          console.log(`Chave: ${activationKey}`);
          console.log(`Usuário ID: ${user.id} - Email: ${user.email}`);
          
          await storage.createActivationKey({
            key: activationKey,
            plan,
            durationDays,
            isUsed: true, // Marcar como usada imediatamente
            usedBy: user.id, // Vincular ao usuário correto
            usedAt: new Date(),
          });
          console.log(`✅ Chave de ativação salva no banco - Vinculada ao usuário ${user.id}`);
          
          // 6. CRIAR OU ATUALIZAR LICENÇA DO USUÁRIO
          const existingLicense = await storage.getLicenseByUserId(user.id);
          
          const now = new Date();
          let expiryDate: Date;
          let totalMinutes: number;
          
          if (plan === "test") {
            expiryDate = new Date(now.getTime() + (30 * 60 * 1000)); // 30 minutos
            totalMinutes = 30;
          } else {
            expiryDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
            totalMinutes = durationDays * 24 * 60;
          }
          
          if (existingLicense) {
            console.log(`=== RENOVANDO LICENÇA EXISTENTE ===`);
            console.log(`Licença atual: ${existingLicense.key} (Status: ${existingLicense.status})`);
            
            await storage.updateLicense(existingLicense.id, {
              key: activationKey,
              plan,
              status: "active",
              expiresAt: expiryDate,
              totalMinutesRemaining: totalMinutes,
              daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
              hoursRemaining: Math.ceil(totalMinutes / 60),
              minutesRemaining: totalMinutes,
              activatedAt: new Date(),
              hwid: null // Reset HWID para nova ativação
            });
            
            console.log(`✅ LICENÇA RENOVADA - Nova chave: ${activationKey}`);
            console.log(`Nova expiração: ${expiryDate.toISOString()}`);
          } else {
            console.log(`=== CRIANDO NOVA LICENÇA ===`);
            
            await storage.createLicense({
              userId: user.id,
              key: activationKey,
              plan,
              status: "active",
              expiresAt: expiryDate,
              totalMinutesRemaining: totalMinutes,
              daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
              hoursRemaining: Math.ceil(totalMinutes / 60),
              minutesRemaining: totalMinutes,
              activatedAt: new Date(),
            });
            
            console.log(`✅ NOVA LICENÇA CRIADA - Chave: ${activationKey}`);
            console.log(`Expira em: ${expiryDate.toISOString()}`);
          }
          
          // 7. ENVIAR EMAIL COM A CHAVE DE LICENÇA
          const planName = plan === "test" ? "Teste (30 minutos)" : 
                           plan === "7days" ? "7 Dias" : "15 Dias";
          
          // 7. SISTEMA ROBUSTO DE SELEÇÃO DE EMAIL
          console.log(`=== SELECIONANDO EMAIL VÁLIDO PARA ENVIO ===`);
          
          // Função robusta para validar e limpar email
          const validateAndCleanEmail = (email: string | null | undefined): string | null => {
            if (!email || typeof email !== 'string') return null;
            
            // Remover espaços e aspas
            const cleaned = email.trim().replace(/['"]+/g, '').replace(/\s+/g, '');
            
            // Rejeitar emails mascarados
            if (cleaned.includes('XXXXX') || /^X+$/.test(cleaned) || cleaned === '') {
              return null;
            }
            
            // Verificar se contém @ e .
            if (!cleaned.includes('@') || !cleaned.includes('.')) {
              return null;
            }
            
            // Validar formato com regex simples
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(cleaned)) {
              return null;
            }
            
            return cleaned;
          };
          
          // 1. Validar email do usuário no banco
          const userEmailClean = validateAndCleanEmail(user.email);
          console.log(`[EMAIL] Email do usuário: "${user.email}" → ${userEmailClean ? 'VÁLIDO' : 'INVÁLIDO'}`);
          
          // 2. Validar email do Mercado Pago
          const mpEmailClean = validateAndCleanEmail(paymentInfo.payer?.email);
          console.log(`[EMAIL] Email do Mercado Pago: "${paymentInfo.payer?.email || 'N/A'}" → ${mpEmailClean ? 'VÁLIDO' : 'INVÁLIDO'}`);
          
          // 3. Escolher o melhor email disponível (priorizar usuário)
          let emailToUse = userEmailClean || mpEmailClean;
          
          // 4. Se ambos inválidos, buscar no pagamento original
          if (!emailToUse && paymentInfo.external_reference) {
            console.log(`[EMAIL] Buscando email no pagamento original...`);
            try {
              const originalPayment = await storage.getPaymentByExternalReference(paymentInfo.external_reference);
              if (originalPayment?.payerEmail) {
                const originalEmailClean = validateAndCleanEmail(originalPayment.payerEmail);
                if (originalEmailClean) {
                  emailToUse = originalEmailClean;
                  console.log(`[EMAIL] Email encontrado no pagamento: "${originalEmailClean}" → VÁLIDO`);
                } else {
                  console.log(`[EMAIL] Email do pagamento inválido: "${originalPayment.payerEmail}"`);
                }
              } else {
                console.log(`[EMAIL] Pagamento não encontrado ou sem email`);
              }
            } catch (searchError) {
              console.log(`[EMAIL] Erro ao buscar pagamento original:`, searchError);
            }
          }
          
          // 5. Tentar envio se email válido encontrado
          if (!emailToUse) {
            console.warn(`[EMAIL] ⚠️ Nenhum email válido encontrado para envio`);
            console.log(`[EMAIL] - Email usuário: "${user.email}"`);
            console.log(`[EMAIL] - Email Mercado Pago: "${paymentInfo.payer?.email || 'N/A'}"`);
            console.log(`[EMAIL] - External reference: "${paymentInfo.external_reference || 'N/A'}"`);
            console.log(`[EMAIL] ✅ Licença ativada no sistema - usuário pode fazer login para verificar`);
            
            // Log estruturado para monitoramento
            console.log(`=== LICENÇA ATIVADA SEM EMAIL ===`);
            console.log(`Usuário ID: ${user.id}`);
            console.log(`Email cadastrado: ${user.email}`);
            console.log(`Chave gerada: ${activationKey}`);
            console.log(`Plano: ${planName}`);
            console.log(`Válida até: ${expiryDate.toISOString()}`);
            console.log(`Status: ATIVA - Disponível no dashboard`);
          } else {
            console.log(`[EMAIL] ✅ Email selecionado para envio: "${emailToUse}"`);
            
            try {
              // Importar função de envio e tentar enviar
              const { sendLicenseKeyEmail } = await import('./email');
              await sendLicenseKeyEmail(emailToUse, activationKey, planName);
              console.log(`[EMAIL] ✅ Email enviado com sucesso para: ${emailToUse}`);
            } catch (emailError) {
              console.error(`[EMAIL] ❌ Falha no envio para ${emailToUse}:`, emailError);
              console.log(`[EMAIL] ✅ Licença permanece ativa no sistema - usuário pode fazer login`);
            }
          }
          
          console.log(`=== WEBHOOK PROCESSADO COM SUCESSO! ===`);
          console.log(`Pagamento: ${paymentId} (R$ ${transactionAmount/100})`);
          console.log(`Usuário: ${user.email}`);
          console.log(`Chave gerada: ${activationKey}`);
          console.log(`Válida até: ${expiryDate.toISOString()}`);
          
        } else {
          console.log(`=== PAGAMENTO NÃO APROVADO ===`);
          console.log(`Status: ${paymentInfo?.status || 'unknown'}`);
        }
      } else {
        console.log(`=== WEBHOOK IGNORADO ===`);
        console.log(`Tipo não é payment ou ID não encontrado`);
      }
      
      // 8. SEMPRE RETORNAR 200 PARA EVITAR RETRIES DO MERCADO PAGO
      res.status(200).json({ received: true });
      
    } catch (error) {
      console.error("❌ ERRO CRÍTICO NO WEBHOOK:", error);
      if (error instanceof Error) {
        console.error("Stack trace:", error.stack);
      }
      // Sempre retornar 200 para evitar retries do webhook
      res.status(200).json({ received: true, error: "Webhook processing failed" });
    }
  });

  // User profile endpoints
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Buscar dados atualizados do usuário
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      // Buscar licença do usuário
      const license = await storage.getLicenseByUserId(user.id);
      
      res.json({ 
        user: { ...currentUser, password: undefined },
        license 
      });
    } catch (error) {
      console.error("Erro ao buscar dados do usuário:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get("/api/dashboard", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      console.log(`=== CARREGANDO DASHBOARD PARA USUÁRIO ${user.id} ===`);
      
      const license = await storage.getLicenseByUserId(user.id);
      const downloads = await storage.getUserDownloads(user.id);

      if (license) {
        console.log(`Licença encontrada - ID: ${license.id}, Chave: ${license.key}`);
        console.log(`Status: ${license.status}, Plano: ${license.plan}`);
        console.log(`Expira em: ${license.expiresAt}`);
        console.log(`Tempo atual: ${new Date().toISOString()}`);
        console.log(`Expirada? ${new Date(license.expiresAt) < new Date()}`);
        
        // Verificar se a licença está realmente expirada e atualizar status se necessário
        const isExpired = new Date(license.expiresAt) < new Date();
        if (isExpired && license.status === "active") {
          console.log(`Licença expirada detectada, atualizando status...`);
          await storage.updateLicense(license.id, { status: "expired" });
          license.status = "expired";
        }
      } else {
        console.log(`Nenhuma licença encontrada para o usuário ${user.id}`);
      }

      res.json({
        user: { ...user, password: undefined },
        license,
        downloads,
        stats: {
          totalDownloads: downloads.length,
          lastDownload: downloads[downloads.length - 1]?.downloadedAt,
        },
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // Payment status check endpoint
  app.get("/api/payments/:id/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const paymentId = parseInt(req.params.id);
      
      if (isNaN(paymentId)) {
        return res.status(400).json({ message: "ID de pagamento inválido" });
      }
      
      const payment = await storage.getPayment(paymentId);
      
      if (!payment || payment.userId !== user.id) {
        return res.status(404).json({ message: "Pagamento não encontrado" });
      }

      res.json({
        id: payment.id,
        status: payment.status,
        statusDetail: payment.statusDetail,
        amount: payment.transactionAmount / 100,
        currency: payment.currency,
        plan: payment.plan,
        durationDays: payment.durationDays,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });
    } catch (error) {
      console.error("Payment status check error:", error);
      res.status(500).json({ message: "Erro ao verificar status do pagamento" });
    }
  });

  // Check payment status by external reference
  app.get("/api/payments/status/:externalReference", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const externalReference = req.params.externalReference;
      
      const payment = await storage.getPaymentByExternalReference(externalReference);
      
      if (!payment || payment.userId !== user.id) {
        return res.status(404).json({ message: "Pagamento não encontrado" });
      }

      res.json({
        id: payment.id,
        status: payment.status,
        statusDetail: payment.statusDetail,
        amount: payment.transactionAmount / 100,
        currency: payment.currency,
        plan: payment.plan,
        durationDays: payment.durationDays,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });
    } catch (error) {
      console.error("Payment status check error:", error);
      res.status(500).json({ message: "Erro ao verificar status do pagamento" });
    }
  });

  // Get user payments
  app.get("/api/payments", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const payments = await storage.getUserPayments(user.id);
      
      const paymentsFormatted = payments.map(payment => ({
        id: payment.id,
        status: payment.status,
        statusDetail: payment.statusDetail,
        amount: payment.transactionAmount / 100,
        currency: payment.currency,
        plan: payment.plan,
        durationDays: payment.durationDays,
        externalReference: payment.externalReference,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      }));

      res.json({ payments: paymentsFormatted });
    } catch (error) {
      console.error("User payments fetch error:", error);
      res.status(500).json({ message: "Erro ao buscar pagamentos" });
    }
  });

  // License activation endpoint
  app.post("/api/licenses/activate", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { key } = activateKeySchema.parse(req.body);

      console.log(`=== INICIANDO ATIVAÇÃO DE LICENÇA ===`);
      console.log(`Usuário: ${user.id} (${user.email})`);
      console.log(`Chave solicitada: ${key}`);

      // Check if activation key exists and is not used
      const activationKey = await storage.getActivationKey(key);
      if (!activationKey) {
        console.log(`❌ Chave de ativação não encontrada: ${key}`);
        return res.status(404).json({ message: "Chave de ativação não encontrada" });
      }

      if (activationKey.isUsed) {
        console.log(`❌ Chave já foi utilizada: ${key}`);
        return res.status(400).json({ message: "Chave de ativação já foi utilizada" });
      }

      console.log(`✅ Chave válida encontrada - Plano: ${activationKey.plan}, Duração: ${activationKey.durationDays} dias`);

      // Verificar se a chave já está sendo usada por outro usuário (constraint check)
      const existingLicenseWithKey = await storage.getLicenseByKey(key);
      if (existingLicenseWithKey && existingLicenseWithKey.userId !== user.id) {
        console.log(`❌ Chave já está vinculada a outro usuário: ${existingLicenseWithKey.userId}`);
        return res.status(400).json({ message: "Esta chave já está vinculada a outro usuário" });
      }

      // Buscar licença existente do usuário atual
      const userExistingLicense = await storage.getLicenseByUserId(user.id);

      // Calculate expiration date based on plan
      let totalMinutes: number;
      if (activationKey.plan === "test") {
        totalMinutes = 30; // Test plan: 30 minutes
      } else {
        totalMinutes = activationKey.durationDays * 24 * 60;
      }

      const expiresAt = new Date();
      if (activationKey.plan === "test") {
        expiresAt.setMinutes(expiresAt.getMinutes() + 30);
      } else {
        expiresAt.setDate(expiresAt.getDate() + activationKey.durationDays);
      }

      console.log(`Tempo calculado: ${totalMinutes} minutos, expira em: ${expiresAt.toISOString()}`);

      // Se o usuário já tem licença, sobrescrever. Se não, criar nova.
      if (userExistingLicense) {
        console.log(`=== ATUALIZANDO LICENÇA EXISTENTE DO USUÁRIO ===`);
        console.log(`Licença atual: ${userExistingLicense.key} → Nova: ${key}`);
        
        await storage.updateLicense(userExistingLicense.id, {
          key: key,
          status: "active",
          plan: activationKey.plan,
          expiresAt,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
          hwid: null, // Reset HWID para nova ativação
        });
        
        console.log(`✅ LICENÇA ATUALIZADA COM SUCESSO`);
      } else if (existingLicenseWithKey) {
        // Se a chave existe mas é do usuário atual, apenas ativar/atualizar
        console.log(`=== REATIVANDO LICENÇA EXISTENTE COM ESTA CHAVE ===`);
        
        await storage.updateLicense(existingLicenseWithKey.id, {
          userId: user.id, // Garantir que é do usuário atual
          status: "active",
          plan: activationKey.plan,
          expiresAt,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
          hwid: null,
        });
        
        console.log(`✅ LICENÇA REATIVADA COM SUCESSO`);
      } else {
        console.log(`=== CRIANDO NOVA LICENÇA ===`);
        
        await storage.createLicense({
          userId: user.id,
          key,
          plan: activationKey.plan,
          status: "active",
          expiresAt,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
        });
        
        console.log(`✅ NOVA LICENÇA CRIADA COM SUCESSO`);
      }

      // Mark activation key as used
      await storage.markActivationKeyAsUsed(key, user.id);
      console.log(`✅ Chave marcada como utilizada`);

      res.json({ message: "Licença ativada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Chave inválida", errors: error.errors });
      }
      console.error("License activation error:", error);
      res.status(500).json({ message: "Erro ao ativar licença" });
    }
  });

  // Manual activation with HWID protection
  app.post("/api/license/activate-manual", isAuthenticated, rateLimit(5, 60 * 1000), async (req, res) => {
    try {
      const user = req.user as any;
      const { key, hwid } = req.body;

      // Validate input
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ message: "Chave de ativação é obrigatória" });
      }
      
      if (!hwid || typeof hwid !== 'string') {
        return res.status(400).json({ message: "HWID é obrigatório" });
      }

      console.log(`=== ATIVAÇÃO MANUAL COM HWID ===`);
      console.log(`Usuário: ${user.id} (${user.email})`);
      console.log(`Chave: ${key}`);
      console.log(`HWID: ${hwid}`);

      // Use license utilities for activation
      const { activateLicenseManually } = await import('./license-utils');
      const result = await activateLicenseManually(key, hwid, user.id);

      if (result.success) {
        res.json({ 
          success: true,
          message: result.message,
          license: result.license
        });
      } else {
        res.status(400).json({ 
          success: false,
          message: result.message 
        });
      }
    } catch (error) {
      console.error("Manual license activation error:", error);
      res.status(500).json({ 
        success: false,
        message: "Erro interno durante a ativação" 
      });
    }
  });

  // Test webhook endpoint for manual testing
  app.post("/api/test-webhook-activation", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Create a test payment
      const testPayment = await storage.createPayment({
        userId: user.id,
        preferenceId: `test_pref_${Date.now()}`,
        externalReference: `test_${Date.now()}`,
        status: "pending",
        transactionAmount: 100, // R$ 1,00
        currency: "BRL",
        plan: "test",
        durationDays: 1, // Para teste, usar 1 dia no banco mas 30 min na lógica
        payerEmail: user.email,
        payerFirstName: user.firstName || "Test",
        payerLastName: user.lastName || "User",
        pixQrCode: "test_qr",
        pixQrCodeBase64: "test_qr_base64",
      });

      // Simulate webhook processing
      await storage.updatePayment(testPayment.id, {
        status: "approved",
        mercadoPagoId: `test_mp_${Date.now()}`,
        statusDetail: "accredited",
      });

      // Use license utilities for robust key generation and license creation
      
      const activationKey = await generateUniqueActivationKey();
      
      // Create activation key in database for tracking
      await storage.createActivationKey({
        key: activationKey,
        plan: "test",
        durationDays: 0.021, // 30 minutes as decimal days
      });

      // Create/update license automatically using utilities
      const { license, action } = await createOrUpdateLicense(
        user.id,
        "test",
        0.021 // 30 minutes
      );

      res.json({
        success: true,
        message: `Licença ${action} com sucesso via teste manual`,
        license: {
          key: license.key,
          expiresAt: license.expiresAt,
          status: license.status,
          plan: license.plan,
          totalMinutesRemaining: license.totalMinutesRemaining
        },
        activationKey,
        testPaymentId: testPayment.id,
        action
      });
      
    } catch (error) {
      console.error("Erro no teste de webhook:", error);
      res.status(500).json({ 
        success: false,
        message: "Erro ao processar teste de ativação",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Endpoint para simular webhook do Mercado Pago (para teste)
  app.post("/api/test/webhook", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { paymentId, userId } = req.body;
      
      if (!paymentId || !userId) {
        return res.status(400).json({ message: "paymentId e userId são obrigatórios" });
      }
      
      console.log(`=== SIMULANDO WEBHOOK PARA PAGAMENTO ${paymentId} ===`);
      
      // Buscar pagamento no banco
      const payment = await storage.getPaymentByMercadoPagoId(paymentId);
      
      if (!payment) {
        return res.status(404).json({ message: "Pagamento não encontrado" });
      }
      
      if (payment.status !== "pending") {
        return res.status(400).json({ message: `Pagamento já processado com status: ${payment.status}` });
      }
      
      console.log(`Pagamento encontrado: ID ${payment.id}, Usuário: ${payment.userId}, Plano: ${payment.plan}`);
      
      // Atualizar status do pagamento
      await storage.updatePayment(payment.id, {
        status: "approved",
        statusDetail: "accredited",
      });
      
      // Criar chave de ativação
      const activationKey = `FOVD-${payment.plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      
      await storage.createActivationKey({
        key: activationKey,
        plan: payment.plan,
        durationDays: payment.durationDays,
      });
      
      // Verificar licença existente
      const existingLicense = await storage.getLicenseByUserId(payment.userId);
      
      if (existingLicense) {
        console.log(`=== RENOVANDO LICENÇA EXISTENTE ===`);
        console.log(`Licença atual - ID: ${existingLicense.id}, Status: ${existingLicense.status}`);
        
        const now = new Date();
        let newExpiryDate: Date;
        let totalMinutes: number;
        
        if (payment.plan === "test") {
          newExpiryDate = new Date(now.getTime() + (30 * 60 * 1000));
          totalMinutes = 30;
        } else {
          newExpiryDate = new Date(now.getTime() + (payment.durationDays * 24 * 60 * 60 * 1000));
          totalMinutes = payment.durationDays * 24 * 60;
        }
        
        const updatedLicense = await storage.updateLicense(existingLicense.id, {
          key: activationKey,
          plan: payment.plan,
          status: "active",
          expiresAt: newExpiryDate,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
          hwid: null
        });
        
        console.log(`✅ LICENÇA RENOVADA: ${updatedLicense.key}, Expira: ${updatedLicense.expiresAt}`);
        
        res.json({
          success: true,
          message: "Licença renovada com sucesso",
          payment: {
            id: payment.id,
            status: "approved",
            plan: payment.plan
          },
          license: {
            id: updatedLicense.id,
            key: updatedLicense.key,
            status: updatedLicense.status,
            expiresAt: updatedLicense.expiresAt,
            plan: updatedLicense.plan
          },
          activationKey
        });
        
      } else {
        // Criar nova licença
        const now = new Date();
        let expiryDate: Date;
        let totalMinutes: number;
        
        if (payment.plan === "test") {
          expiryDate = new Date(now.getTime() + (30 * 60 * 1000));
          totalMinutes = 30;
        } else {
          expiryDate = new Date(now.getTime() + (payment.durationDays * 24 * 60 * 60 * 1000));
          totalMinutes = payment.durationDays * 24 * 60;
        }
        
        const newLicense = await storage.createLicense({
          userId: payment.userId,
          key: activationKey,
          plan: payment.plan,
          status: "active",
          expiresAt: expiryDate,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
        });
        
        console.log(`✅ NOVA LICENÇA CRIADA: ${newLicense.key}, Expira: ${newLicense.expiresAt}`);
        
        res.json({
          success: true,
          message: "Nova licença criada com sucesso",
          payment: {
            id: payment.id,
            status: "approved",
            plan: payment.plan
          },
          license: {
            id: newLicense.id,
            key: newLicense.key,
            status: newLicense.status,
            expiresAt: newLicense.expiresAt,
            plan: newLicense.plan
          },
          activationKey
        });
      }
      
    } catch (error) {
      console.error("Erro no teste de webhook:", error);
      res.status(500).json({ 
        success: false,
        message: "Erro ao processar webhook de teste",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Endpoint de teste para simular renovação de licença expirada
  app.post("/api/test/renew-license", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Primeiro, vamos expirar a licença atual se existir
      const existingLicense = await storage.getLicenseByUserId(user.id);
      if (existingLicense) {
        console.log(`Expirando licença atual: ${existingLicense.key}`);
        await storage.updateLicense(existingLicense.id, {
          status: "expired",
          expiresAt: new Date(Date.now() - 1000), // 1 segundo atrás
          totalMinutesRemaining: 0,
          daysRemaining: 0,
          hoursRemaining: 0,
          minutesRemaining: 0,
        });
      }
      
      // Agora simular uma nova compra
      const testPayment = await storage.createPayment({
        userId: user.id,
        plan: "test",
        durationDays: 0.021,
        transactionAmount: 100,
        currency: "BRL",
        status: "pending",
        externalReference: `TEST-RENEW-${Date.now()}`,
        payerEmail: user.email,
        payerFirstName: user.name || "Usuário",
        payerLastName: "Teste",
      });
      
      // Simular aprovação do pagamento (como seria feito pelo webhook)
      await storage.updatePayment(testPayment.id, {
        status: "approved",
        mercadoPagoId: `TEST-${Date.now()}`,
        statusDetail: "accredited",
      });
      
      // Criar nova chave de ativação
      const newActivationKey = `FOVD-RENEWED-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      
      await storage.createActivationKey({
        key: newActivationKey,
        plan: "test",
        durationDays: 0.021,
      });
      
      // Renovar a licença (como seria feito pelo webhook)
      if (existingLicense) {
        const newExpiryDate = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutos
        
        await storage.updateLicense(existingLicense.id, {
          key: newActivationKey, // Nova chave
          plan: "test",
          status: "active",
          expiresAt: newExpiryDate,
          totalMinutesRemaining: 30,
          daysRemaining: 1,
          hoursRemaining: 1,
          minutesRemaining: 30,
          activatedAt: new Date(),
        });
        
        console.log(`✅ Licença renovada: ${existingLicense.key} -> ${newActivationKey}`);
        
        res.json({
          success: true,
          message: "Licença renovada com sucesso - teste de renovação completo",
          oldKey: existingLicense.key,
          newKey: newActivationKey,
          expiresAt: newExpiryDate,
          testPaymentId: testPayment.id
        });
      } else {
        res.json({
          success: false,
          message: "Nenhuma licença encontrada para renovar"
        });
      }
      
    } catch (error) {
      console.error("Erro no teste de renovação:", error);
      res.status(500).json({ 
        success: false,
        message: "Erro ao processar teste de renovação",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Endpoint para testar envio de email (admin only)
  app.post("/api/test/email", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { email, licenseKey, planName } = req.body;
      
      if (!email || !licenseKey || !planName) {
        return res.status(400).json({ 
          message: "email, licenseKey e planName são obrigatórios",
          example: {
            email: "teste@exemplo.com",
            licenseKey: "FOVD-TEST-123456",
            planName: "Teste (30 minutos)"
          }
        });
      }
      
      console.log(`=== TESTE DE EMAIL INICIADO ===`);
      console.log(`Email: ${email}`);
      console.log(`Chave: ${licenseKey}`);
      console.log(`Plano: ${planName}`);
      
      await sendLicenseKeyEmail(email, licenseKey, planName);
      
      res.json({
        success: true,
        message: `Email de teste enviado com sucesso para ${email}`,
        details: {
          email,
          licenseKey,
          planName,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("Erro no teste de email:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao enviar email de teste",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Debug endpoint para verificar status de licenças e pagamentos de um usuário
  app.get("/api/debug/user/:userId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "ID de usuário inválido" });
      }
      
      const user = await storage.getUser(userId);
      const license = await storage.getLicenseByUserId(userId);
      const payments = await storage.getUserPayments(userId);
      
      res.json({
        user: user ? { ...user, password: undefined } : null,
        license,
        payments: payments.map(p => ({
          id: p.id,
          status: p.status,
          plan: p.plan,
          amount: p.transactionAmount / 100,
          externalReference: p.externalReference,
          mercadoPagoId: p.mercadoPagoId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        })),
        debug: {
          hasUser: !!user,
          hasLicense: !!license,
          licenseExpired: license ? new Date(license.expiresAt) < new Date() : null,
          licenseExpiresAt: license ? license.expiresAt : null,
          paymentsCount: payments.length,
          currentTime: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Change password endpoint
  app.post("/api/users/change-password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Senha atual e nova senha são obrigatórias" });
      }

      // Get user from database to check current password
      const dbUser = await storage.getUser(user.id);
      if (!dbUser || !dbUser.password) {
        return res.status(404).json({ message: "Usuário não encontrado ou sem senha configurada" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, dbUser.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await storage.updateUser(user.id, { password: hashedNewPassword });

      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // Endpoint correto para mudança de senha (usado pelo frontend)
  app.post("/api/users/change-password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword } = req.body;

      console.log(`=== MUDANÇA DE SENHA - Usuário: ${user.email} ===`);

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Senha atual e nova senha são obrigatórias" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Nova senha deve ter pelo menos 6 caracteres" });
      }

      // Get current user with password
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentUser.password || "");
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await storage.updateUser(user.id, { password: hashedNewPassword });

      console.log(`✅ Senha alterada com sucesso para usuário ${user.email}`);
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // Endpoint de teste para verificar geração e envio de chaves
  app.post("/api/test/generate-key", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { email, plan = "test" } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email é obrigatório" });
      }
      
      console.log(`=== TESTE: GERANDO CHAVE DE LICENÇA ===`);
      console.log(`Email: ${email}, Plano: ${plan}`);
      
      // Gerar chave de ativação
      const activationKey = `FOVD-${plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      console.log(`Chave gerada: ${activationKey}`);
      
      // Criar chave no banco
      const durationDays = plan === "test" ? 1 : (plan === "7days" ? 7 : 15); // Para teste, usar 1 dia no banco mas 30 min na lógica
      await storage.createActivationKey({
        key: activationKey,
        plan,
        durationDays,
      });
      
      // Enviar email
      const planName = plan === "test" ? "Teste (30 minutos)" : 
                       plan === "7days" ? "7 Dias" : "15 Dias";
      
      try {
        console.log(`=== TESTE: ENVIANDO EMAIL ===`);
        await sendLicenseKeyEmail(email, activationKey, planName);
        console.log(`✅ EMAIL ENVIADO COM SUCESSO`);
        
        res.json({
          success: true,
          message: "Chave gerada e email enviado com sucesso",
          activationKey,
          email,
          plan: planName
        });
      } catch (emailError) {
        console.error("❌ ERRO AO ENVIAR EMAIL:", emailError);
        res.json({
          success: false,
          message: "Chave gerada mas falha no envio do email",
          activationKey,
          email,
          plan: planName,
          emailError: emailError instanceof Error ? emailError.message : "Erro desconhecido"
        });
      }
      
    } catch (error) {
      console.error("Erro no teste de geração de chave:", error);
      res.status(500).json({ 
        success: false,
        message: "Erro ao gerar chave de teste",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Admin endpoint para visualizar chaves de licença recentes
  app.get("/api/admin/recent-licenses", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const licenses = await storage.getAllLicenses();
      const users = await storage.getAllUsers();
      
      const recentData = licenses
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 50)
        .map(license => {
          const user = users.find(u => u.id === license.userId);
          return {
            licenseId: license.id,
            userId: license.userId,
            userEmail: user?.email || 'N/A',
            userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'N/A',
            licenseKey: license.key,
            plan: license.plan,
            status: license.status,
            expiresAt: license.expiresAt,
            activatedAt: license.activatedAt,
            createdAt: license.createdAt,
            totalMinutesRemaining: license.totalMinutesRemaining,
            hwid: license.hwid || 'Não vinculado'
          };
        });
      
      res.json({ recentLicenses: recentData });
    } catch (error) {
      console.error("Admin recent licenses error:", error);
      res.status(500).json({ message: "Erro ao buscar licenças recentes" });
    }
  });

  // Admin endpoint para reenviar email de licença manualmente
  app.post("/api/admin/resend-license-email", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { licenseId, customEmail } = req.body;
      
      if (!licenseId) {
        return res.status(400).json({ message: "ID da licença é obrigatório" });
      }
      
      const license = await storage.getLicense(licenseId);
      if (!license) {
        return res.status(404).json({ message: "Licença não encontrada" });
      }
      
      const user = await storage.getUser(license.userId);
      if (!user) {
        return res.status(404).json({ message: "Usuário da licença não encontrado" });
      }
      
      const emailToUse = customEmail || user.email;
      
      if (!emailToUse || !emailToUse.includes('@')) {
        return res.status(400).json({ message: "Email válido é obrigatório" });
      }
      
      const planName = license.plan === "test" ? "Teste (30 minutos)" : 
                       license.plan === "7days" ? "7 Dias" : "15 Dias";
      
      console.log(`[ADMIN] Reenviando email de licença:`);
      console.log(`- Licença: ${license.key}`);
      console.log(`- Usuário: ${user.email} (ID: ${user.id})`);
      console.log(`- Email destino: ${emailToUse}`);
      console.log(`- Plano: ${planName}`);
      
      await sendLicenseKeyEmail(emailToUse, license.key, planName);
      
      console.log(`✅ Email reenviado com sucesso pelo admin`);
      res.json({ 
        success: true, 
        message: "Email reenviado com sucesso",
        emailSent: emailToUse,
        licenseKey: license.key
      });
      
    } catch (error) {
      console.error("Erro ao reenviar email:", error);
      res.status(500).json({ 
        message: "Erro ao reenviar email", 
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Admin endpoint para buscar pagamentos órfãos (sem licença associada)
  app.get("/api/admin/orphan-payments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const payments = await storage.getAllPayments();
      const licenses = await storage.getAllLicenses();
      const users = await storage.getAllUsers();
      
      const orphanPayments = payments
        .filter(payment => 
          payment.status === "approved" && 
          !licenses.some(license => license.userId === payment.userId && 
            license.createdAt && payment.createdAt &&
            new Date(license.createdAt) >= new Date(payment.createdAt))
        )
        .map(payment => {
          const user = users.find(u => u.id === payment.userId);
          return {
            paymentId: payment.id,
            userId: payment.userId,
            userEmail: user?.email || 'N/A',
            userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'N/A',
            plan: payment.plan,
            amount: payment.transactionAmount / 100,
            status: payment.status,
            externalReference: payment.externalReference,
            payerEmail: payment.payerEmail,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt
          };
        })
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
      
      res.json({ orphanPayments });
    } catch (error) {
      console.error("Erro ao buscar pagamentos órfãos:", error);
      res.status(500).json({ message: "Erro ao buscar pagamentos órfãos" });
    }
  });

  // Password reset routes
  app.post("/api/auth/forgot-password", rateLimit(3, 15 * 60 * 1000), async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      console.log(`[FORGOT PASSWORD] Processing request for: ${email}`);
      
      // Check if user exists
      const user = await storage.getUserByEmail(email);
      console.log(`[FORGOT PASSWORD] User found: ${!!user}`);
      
      if (!user) {
        console.log(`[FORGOT PASSWORD] User not found, returning standard message`);
        return res.json({ message: "Se o email existir em nosso sistema, você receberá instruções de redefinição." });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store reset token
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });

      // Create reset URL
      const resetUrl = `${getBaseUrl()}/reset-password/${resetToken}`;
      console.log(`[FORGOT PASSWORD] Reset URL generated: ${resetUrl}`);

      // Send password reset email
      try {
        const { sendPasswordResetEmail } = await import('./email');
        await sendPasswordResetEmail(email, resetToken);
        console.log(`[FORGOT PASSWORD] Password reset email sent to: ${email}`);
      } catch (emailError) {
        console.error('[FORGOT PASSWORD] Email sending error:', emailError);
        // Still return success to not reveal if email exists
      }

      res.json({ message: "Se o email existir em nosso sistema, você receberá instruções de redefinição." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Email inválido", errors: error.errors });
      }
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post("/api/auth/reset-password", rateLimit(5, 15 * 60 * 1000), async (req, res) => {
    try {
      const { token, password, confirmPassword } = resetPasswordSchema.parse(req.body);
      
      // Verify reset token
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken || resetToken.used) {
        return res.status(400).json({ message: "Token inválido ou expirado" });
      }

      // Check if token is expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Token expirado" });
      }

      // Get user
      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(400).json({ message: "Usuário não encontrado" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user password
      await storage.updateUser(user.id, { password: hashedPassword });

      // Mark token as used
      await storage.markPasswordResetTokenAsUsed(token);

      console.log(`[RESET PASSWORD] Password reset successful for user: ${user.email}`);
      res.json({ message: "Senha redefinida com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Change password endpoint (for authenticated users)
  app.post("/api/auth/change-password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword, confirmPassword } = changePasswordSchema.parse(req.body);

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update user password
      await storage.updateUser(user.id, { password: hashedNewPassword });

      console.log(`[CHANGE PASSWORD] Password changed successfully for user: ${user.email}`);
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Change password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}