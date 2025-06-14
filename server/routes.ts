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

  // Registration route
  app.post("/api/auth/register", rateLimit(5, 15 * 60 * 1000), async (req, res) => {
    try {
      const { email, username, password, firstName, lastName } = registerSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já está em uso" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        username,
        password: hashedPassword,
        firstName,
        lastName,
      });

      res.status(201).json({ 
        user: { ...user, password: undefined },
        message: "Usuário criado com sucesso" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Registration error:", error);
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
      const user = req.user as any;
      const requestData = createPixPaymentSchema.parse(req.body);
      
      const paymentData = {
        userId: user.id,
        plan: requestData.plan,
        durationDays: requestData.durationDays,
        payerEmail: requestData.payerEmail,
        payerFirstName: requestData.payerFirstName,
        payerLastName: requestData.payerLastName,
      };
      
      // Create PIX payment with MercadoPago
      const pixPayment = await createPixPayment(paymentData);
      
      // Store payment in database
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

      res.json({
        ...pixPayment,
        paymentId: payment.id
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados de pagamento inválidos", errors: error.errors });
      }
      console.error("PIX payment creation error:", error);
      res.status(500).json({ message: "Erro ao criar pagamento PIX" });
    }
  });

  // MercadoPago webhook - FIXED for automatic license activation
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
        // Try to process as a general webhook notification
        webhookData = { type: "payment" };
        paymentId = null;
      }
      
      if (webhookData.type === "payment" && paymentId) {
        console.log(`Processando pagamento ID: ${paymentId}`);
        
        // Get payment info from MercadoPago
        const paymentInfo = await getPaymentInfo(paymentId);
        
        console.log("Informações do pagamento:", JSON.stringify(paymentInfo, null, 2));
        
        if (paymentInfo && paymentInfo.status === "approved") {
          console.log(`✅ PAGAMENTO APROVADO! External Reference: ${paymentInfo.external_reference}`);
          console.log(`Valor: ${paymentInfo.transaction_amount}, Moeda: ${paymentInfo.currency_id}`);
          console.log(`Comprador: ${paymentInfo.payer?.email || 'N/A'}`);
          
          // Find payment in database by external_reference
          let payment = null;
          
          if (paymentInfo.external_reference) {
            console.log(`Buscando pagamento por external_reference: ${paymentInfo.external_reference}`);
            payment = await storage.getPaymentByExternalReference(paymentInfo.external_reference);
            console.log(`Pagamento encontrado por external_reference: ${payment ? 'SIM' : 'NÃO'}`);
          }
          
          // If not found by external_reference, try by mercadoPagoId
          if (!payment) {
            console.log(`Buscando pagamento por mercadoPagoId: ${paymentId}`);
            payment = await storage.getPaymentByMercadoPagoId(paymentId);
            console.log(`Pagamento encontrado por mercadoPagoId: ${payment ? 'SIM' : 'NÃO'}`);
          }
          
          // If still not found, try to find by email for renewal cases
          if (!payment && paymentInfo.payer?.email) {
            console.log(`Buscando usuário por email: ${paymentInfo.payer.email}`);
            const user = await storage.getUserByEmail(paymentInfo.payer.email);
            
            if (user) {
              console.log(`Usuário encontrado: ${user.id} - ${user.email}`);
              
              // Check for recent pending payments from this user
              const pendingPayments = await storage.getPendingPayments();
              const userPendingPayments = pendingPayments.filter(p => p.userId === user.id);
              
              console.log(`Pagamentos pendentes do usuário: ${userPendingPayments.length}`);
              
              if (userPendingPayments.length > 0) {
                payment = userPendingPayments.sort((a, b) => {
                  const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return dateB - dateA;
                })[0];
                console.log(`Usando pagamento pendente do usuário: ${payment.id}`);
              }
            }
          }
          
          // If still not found, try to find the most recent pending payment
          if (!payment) {
            console.log(`Buscando pagamentos pendentes gerais...`);
            const pendingPayments = await storage.getPendingPayments();
            console.log(`Pagamentos pendentes encontrados: ${pendingPayments.length}`);
            
            if (pendingPayments.length > 0) {
              payment = pendingPayments.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              })[0];
              console.log(`Usando pagamento pendente mais recente: ${payment.id}`);
            }
          }
          
          if (payment && payment.status === "pending") {
            console.log(`Pagamento encontrado no banco: ID ${payment.id}, Status atual: ${payment.status}`);
            
            // Update payment status
            await storage.updatePayment(payment.id, {
              status: "approved",
              mercadoPagoId: paymentId,
              statusDetail: paymentInfo.status_detail,
            });

            // Create activation key
            const activationKey = `FOVD-${payment.plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
            
            console.log(`Criando chave de ativação: ${activationKey}`);
            
            await storage.createActivationKey({
              key: activationKey,
              plan: payment.plan,
              durationDays: payment.durationDays,
            });

            // CRIAR/ATUALIZAR LICENÇA AUTOMATICAMENTE - CORRIGIDO
            try {
              // Check if user already has a license
              const existingLicense = await storage.getLicenseByUserId(payment.userId);
              
              if (existingLicense) {
                console.log(`=== RENOVANDO LICENÇA EXISTENTE ===`);
                console.log(`Licença atual - ID: ${existingLicense.id}, Chave: ${existingLicense.key}, Status: ${existingLicense.status}`);
                console.log(`Expira em: ${existingLicense.expiresAt}, Plano: ${existingLicense.plan}`);
                console.log(`Nova chave: ${activationKey}, Novo plano: ${payment.plan}`);
                
                // SEMPRE usar data atual como base para renovação (não somar tempo)
                const now = new Date();
                let newExpiryDate: Date;
                let totalMinutes: number;
                
                if (payment.plan === "test") {
                  // 30 minutes for test
                  newExpiryDate = new Date(now.getTime() + (30 * 60 * 1000));
                  totalMinutes = 30;
                } else {
                  // Add days for other plans
                  newExpiryDate = new Date(now.getTime() + (payment.durationDays * 24 * 60 * 60 * 1000));
                  totalMinutes = payment.durationDays * 24 * 60;
                }
                
                console.log(`Data de expiração calculada: ${newExpiryDate.toISOString()}`);
                
                // Update existing license with new key and expiration
                const updateData = {
                  key: activationKey,
                  plan: payment.plan,
                  status: "active" as const,
                  expiresAt: newExpiryDate,
                  totalMinutesRemaining: totalMinutes,
                  daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
                  hoursRemaining: Math.ceil(totalMinutes / 60),
                  minutesRemaining: totalMinutes,
                  activatedAt: new Date(),
                  hwid: null // Reset HWID para permitir nova ativação
                };
                
                console.log(`Atualizando licença com dados:`, updateData);
                
                const updatedLicense = await storage.updateLicense(existingLicense.id, updateData);
                
                console.log(`✅ LICENÇA RENOVADA COM SUCESSO!`);
                console.log(`ID: ${updatedLicense.id}, Nova chave: ${updatedLicense.key}`);
                console.log(`Status: ${updatedLicense.status}, Expira: ${updatedLicense.expiresAt}`);
                
              } else {
                console.log("Criando nova licença para o usuário");
                
                // Create new license
                let expiryDate: Date;
                let totalMinutes: number;
                
                if (payment.plan === "test") {
                  // 30 minutes for test
                  expiryDate = new Date(Date.now() + (30 * 60 * 1000));
                  totalMinutes = 30;
                } else {
                  // Add days for other plans
                  expiryDate = new Date(Date.now() + (payment.durationDays * 24 * 60 * 60 * 1000));
                  totalMinutes = payment.durationDays * 24 * 60;
                }
                
                await storage.createLicense({
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
                
                console.log(`✅ Nova licença criada até: ${expiryDate.toISOString()}`);
              }
            } catch (licenseError) {
              console.error("Erro ao criar/atualizar licença:", licenseError);
            }

            // Send license key via email - SEMPRE enviar nova chave
            if (payment.payerEmail) {
              try {
                const planName = payment.plan === "test" ? "Teste (30 minutos)" : 
                                 payment.plan === "7days" ? "7 Dias" : "15 Dias";
                
                console.log(`=== ENVIANDO EMAIL COM NOVA CHAVE ===`);
                console.log(`Email destino: ${payment.payerEmail}`);
                console.log(`Chave: ${activationKey}`);
                console.log(`Plano: ${planName}`);
                
                await sendLicenseKeyEmail(payment.payerEmail, activationKey, planName);
                console.log(`✅ EMAIL ENVIADO COM SUCESSO PARA: ${payment.payerEmail}`);
              } catch (emailError) {
                console.error("❌ ERRO CRÍTICO AO ENVIAR EMAIL:");
                console.error("Detalhes do erro:", emailError);
                console.error("Chave que deveria ser enviada:", activationKey);
                console.error("Email que deveria receber:", payment.payerEmail);
                
                // Log para debug em produção
                console.error("=== FALHA NO ENVIO DE EMAIL - CHAVE NÃO ENTREGUE ===");
              }
            } else {
              console.log("❌ Email do pagador não encontrado - não será possível enviar chave");
              console.log("Dados do pagamento:", {
                userId: payment.userId,
                payerEmail: payment.payerEmail,
                payerFirstName: payment.payerFirstName,
                payerLastName: payment.payerLastName
              });
            }

            console.log(`✅ PAGAMENTO PROCESSADO COM SUCESSO - Chave: ${activationKey}`);
          } else {
            console.error(`❌ PAGAMENTO NÃO ENCONTRADO OU JÁ PROCESSADO`);
            console.error(`Status do pagamento encontrado: ${payment?.status || 'N/A'}`);
            console.error(`PaymentId buscado: ${paymentId}`);
            console.error(`External reference: ${paymentInfo.external_reference}`);
            
            // Tentar criar um pagamento retroativo se não encontrado
            if (!payment && paymentInfo.payer?.email) {
              console.log(`Tentando criar pagamento retroativo para: ${paymentInfo.payer.email}`);
              
              try {
                // Encontrar usuário pelo email
                const user = await storage.getUserByEmail(paymentInfo.payer.email);
                
                if (user) {
                  console.log(`Usuário encontrado: ${user.id} - ${user.email}`);
                  
                  // Determinar plano baseado no valor
                  let plan = "test";
                  let durationDays = 0.021;
                  const transactionAmount = paymentInfo.transaction_amount ?? 100;
                  
                  if (transactionAmount >= 500) { // R$ 5,00 ou mais
                    plan = "7days";
                    durationDays = 7;
                  } else if (transactionAmount >= 1000) { // R$ 10,00 ou mais
                    plan = "15days";
                    durationDays = 15;
                  }
                  
                  // Criar pagamento retroativo
                  const retroPayment = await storage.createPayment({
                    userId: user.id,
                    plan,
                    durationDays,
                    transactionAmount,
                    currency: paymentInfo.currency_id || "BRL",
                    status: "approved",
                    mercadoPagoId: paymentId,
                    externalReference: paymentInfo.external_reference || `RETRO-${paymentId}`,
                    statusDetail: paymentInfo.status_detail || "accredited",
                    payerEmail: paymentInfo.payer.email,
                    payerFirstName: paymentInfo.payer.first_name || "Usuario",
                    payerLastName: paymentInfo.payer.last_name || "FovDark",
                  });
                  
                  console.log(`Pagamento retroativo criado: ${retroPayment.id}`);
                  
                  // Processar este pagamento agora
                  payment = retroPayment;
                  
                  // Continuar com o fluxo normal de processamento
                  const activationKey = `FOVD-${plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
                  
                  await storage.createActivationKey({
                    key: activationKey,
                    plan,
                    durationDays,
                  });
                  
                  // Verificar licença existente
                  const existingLicense = await storage.getLicenseByUserId(user.id);
                  
                  if (existingLicense) {
                    console.log(`=== RENOVANDO LICENÇA RETROATIVA ===`);
                    
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
                    
                    console.log(`✅ LICENÇA RENOVADA RETROATIVAMENTE`);
                  } else {
                    // Criar nova licença
                    const now = new Date();
                    let expiryDate: Date;
                    let totalMinutes: number;
                    
                    if (plan === "test") {
                      expiryDate = new Date(now.getTime() + (30 * 60 * 1000));
                      totalMinutes = 30;
                    } else {
                      expiryDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
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
                    
                    console.log(`✅ NOVA LICENÇA CRIADA RETROATIVAMENTE`);
                  }
                  
                  // Enviar email com a nova chave
                  const planName = plan === "test" ? "Teste (30 minutos)" : 
                                   plan === "7days" ? "7 Dias" : "15 Dias";
                  
                  try {
                    console.log(`=== ENVIANDO EMAIL RETROATIVO ===`);
                    await sendLicenseKeyEmail(paymentInfo.payer.email, activationKey, planName);
                    console.log(`✅ EMAIL RETROATIVO ENVIADO COM SUCESSO`);
                  } catch (emailError) {
                    console.error("❌ ERRO AO ENVIAR EMAIL RETROATIVO:", emailError);
                  }
                  
                } else {
                  console.error(`Usuário não encontrado para email: ${paymentInfo.payer.email}`);
                }
              } catch (retroError) {
                console.error("Erro ao criar pagamento retroativo:", retroError);
              }
            }
          }
        } else {
          console.log(`Pagamento não aprovado. Status: ${paymentInfo?.status || 'unknown'}`);
        }
      } else {
        console.log(`Tipo de webhook ignorado ou ID de pagamento não encontrado`);
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("❌ ERRO NO WEBHOOK:", error);
      if (error instanceof Error) {
        console.error("Stack trace:", error.stack);
      }
      // Always return 200 to prevent webhook retries
      res.status(200).json({ received: true, error: "Webhook processing failed" });
    }
  });

  // User profile endpoints
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    res.json({ user: { ...user, password: undefined } });
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

      // Check if activation key exists and is not used
      const activationKey = await storage.getActivationKey(key);
      if (!activationKey) {
        return res.status(404).json({ message: "Chave de ativação não encontrada" });
      }

      if (activationKey.isUsed) {
        return res.status(400).json({ message: "Chave de ativação já foi utilizada" });
      }

      // Buscar licença existente para sobrescrever
      const existingLicense = await storage.getLicenseByUserId(user.id);

      // Calculate expiration date based on plan
      let totalMinutes: number;
      if (activationKey.plan === "test") {
        // Test plan: 30 minutes
        totalMinutes = 30;
      } else {
        // Other plans: use durationDays
        totalMinutes = activationKey.durationDays * 24 * 60;
      }

      const expiresAt = new Date();
      if (activationKey.plan === "test") {
        expiresAt.setMinutes(expiresAt.getMinutes() + 30);
      } else {
        expiresAt.setDate(expiresAt.getDate() + activationKey.durationDays);
      }

      // SEMPRE sobrescrever licença existente ou criar nova
      if (existingLicense) {
        console.log(`=== SOBRESCREVENDO LICENÇA EXISTENTE ===`);
        console.log(`Usuário: ${user.id}, Licença atual: ${existingLicense.key}`);
        console.log(`Nova chave: ${key}, Novo plano: ${activationKey.plan}`);
        
        await storage.updateLicense(existingLicense.id, {
          key: key, // Sobrescrever com nova chave
          status: "active",
          plan: activationKey.plan,
          expiresAt,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
          hwid: null, // Reset HWID para permitir nova ativação
        });
        
        console.log(`✅ LICENÇA SOBRESCRITA COM SUCESSO`);
      } else {
        console.log(`=== CRIANDO NOVA LICENÇA ===`);
        console.log(`Usuário: ${user.id}, Chave: ${key}, Plano: ${activationKey.plan}`);
        
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

      res.json({ message: "Licença ativada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Chave inválida", errors: error.errors });
      }
      console.error("License activation error:", error);
      res.status(500).json({ message: "Erro ao ativar licença" });
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
        durationDays: 0.021, // 30 minutes
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

      // Create activation key
      const activationKey = `FOVD-TEST-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      
      await storage.createActivationKey({
        key: activationKey,
        plan: "test",
        durationDays: 0.021,
      });

      // Create/update license automatically
      const existingLicense = await storage.getLicenseByUserId(user.id);
      
      if (existingLicense) {
        // Renew existing license
        const currentExpiry = new Date(existingLicense.expiresAt);
        const now = new Date();
        const startDate = currentExpiry > now ? currentExpiry : now;
        const newExpiryDate = new Date(startDate.getTime() + (30 * 60 * 1000)); // 30 minutes
        
        await storage.updateLicense(existingLicense.id, {
          status: "active",
          expiresAt: newExpiryDate,
          totalMinutesRemaining: (existingLicense.totalMinutesRemaining || 0) + 30,
          daysRemaining: 1,
          hoursRemaining: 1,
          minutesRemaining: 30,
          activatedAt: new Date(),
        });
        
        res.json({
          success: true,
          message: "Licença renovada com sucesso via teste manual",
          license: {
            key: existingLicense.key,
            expiresAt: newExpiryDate,
            status: "active"
          },
          activationKey,
          testPaymentId: testPayment.id
        });
      } else {
        // Create new license
        const expiryDate = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes
        
        const newLicense = await storage.createLicense({
          userId: user.id,
          key: activationKey,
          plan: "test",
          status: "active",
          expiresAt: expiryDate,
          totalMinutesRemaining: 30,
          daysRemaining: 1,
          hoursRemaining: 1,
          minutesRemaining: 30,
          activatedAt: new Date(),
        });
        
        res.json({
          success: true,
          message: "Nova licença criada com sucesso via teste manual",
          license: {
            key: newLicense.key,
            expiresAt: expiryDate,
            status: "active"
          },
          activationKey,
          testPaymentId: testPayment.id
        });
      }
      
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
      await storage.createActivationKey({
        key: activationKey,
        plan,
        durationDays: plan === "test" ? 0.021 : (plan === "7days" ? 7 : 15),
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

  const httpServer = createServer(app);
  return httpServer;
}