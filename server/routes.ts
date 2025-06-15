import { Express, Request, Response, RequestHandler } from "express";
import { Server } from "http";

import { z } from "zod";
import passport from "passport";
import crypto from "crypto";
import { nanoid } from "nanoid";

import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken } from "./auth";
import { sendPasswordResetEmail, sendLicenseKeyEmail } from "./email";
import { createPixPayment, getPaymentInfo, validateWebhookSignature } from "./mercado-pago";
import { licenseCleanupService } from "./license-cleanup";
import { securityAudit } from "./security-audit";
import { 
  registerSchema, 
  loginSchema, 
  activateKeySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  contactSchema,
  createActivationKeySchema,
  updateUserSchema,
  updateLicenseSchema,
  createPixPaymentSchema,
  mercadoPagoWebhookSchema
} from "@shared/schema";

class SecurityLog {
  logFailedLogin(ip: string, email: string) {
    console.log(`[SECURITY] Failed login attempt - IP: ${ip}, Email: ${email}`);
  }

  logSuspiciousActivity(ip: string, type: string, details: any) {
    console.log(`[SECURITY] Suspicious activity - IP: ${ip}, Type: ${type}, Details:`, details);
  }
}

const securityLog = new SecurityLog();

const rateLimit = (maxRequests: number, windowMs: number): RequestHandler => {
  const requests = new Map<string, number[]>();
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!requests.has(ip)) {
      requests.set(ip, []);
    }
    
    const userRequests = requests.get(ip)!;
    const windowStart = now - windowMs;
    
    const validRequests = userRequests.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({ message: "Muitas tentativas. Tente novamente mais tarde." });
    }
    
    validRequests.push(now);
    requests.set(ip, validRequests);
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication first
  await setupAuth(app);

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
        message: "Database connection failed",
        timestamp: new Date().toISOString()
      });
    }
  });

  const isAdmin: RequestHandler = (req, res, next) => {
    const user = req.user as any;
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
    }
    next();
  };

  // Test payment simulation endpoint
  app.post("/api/test/simulate-payment", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { plan = "test", userEmail } = req.body;

      console.log(`=== SIMULAÇÃO DE PAGAMENTO INICIADA ===`);
      console.log(`Usuário: ${user.id} - ${user.email}`);
      console.log(`Plano solicitado: ${plan}`);
      console.log(`Email fornecido: ${userEmail || 'N/A'}`);

      // Determine duration and email
      const durationDays = plan === "test" ? 0.021 : plan === "7days" ? 7 : 15;
      const emailToUse = userEmail || user.email;

      console.log(`Duração calculada: ${durationDays} dias`);
      console.log(`Email que será usado: ${emailToUse}`);

      // Create test payment record
      const testPayment = await storage.createPayment({
        userId: user.id,
        preferenceId: `test_pref_${Date.now()}`,
        externalReference: `test_${Date.now()}`,
        status: "approved",
        transactionAmount: plan === "test" ? 100 : plan === "7days" ? 1500 : 2500,
        currency: "BRL",
        plan,
        durationDays,
        payerEmail: emailToUse,
        payerFirstName: user.firstName || "Test",
        payerLastName: user.lastName || "User",
        pixQrCode: "test_qr",
        pixQrCodeBase64: "test_qr_base64",
      });

      console.log(`Pagamento teste criado: ID ${testPayment.id}`);

      // Use license utilities for robust key generation and license creation
      const { createOrUpdateLicense } = await import('./license-utils');

      // Create/update license automatically using utilities
      const { license, action, licenseKey } = await createOrUpdateLicense(
        user.id,
        plan,
        durationDays
      );

      console.log(`Nova licença criada para usuário ${user.id}`);

      // Test email sending
      try {
        const planName = plan === "test" ? "Teste (30 minutos)" : 
                         plan === "7days" ? "7 Dias" : "15 Dias";
        
        console.log(`=== ENVIANDO EMAIL COM CHAVE DE LICENÇA ===`);
        console.log(`Email destino: ${emailToUse}`);
        console.log(`Chave: ${licenseKey}`);
        console.log(`Plano: ${planName}`);
        
        await sendLicenseKeyEmail(emailToUse, licenseKey, planName);
        console.log(`✅ EMAIL ENVIADO COM SUCESSO PARA: ${emailToUse}`);
        
        res.json({
          success: true,
          message: "Pagamento simulado, licença gerada e email enviado com sucesso",
          data: {
            userId: user.id,
            userEmail: emailToUse,
            licenseKey,
            plan,
            planName,
            paymentId: testPayment.id,
            licenseAction: action,
            emailSent: true
          }
        });
      } catch (emailError) {
        console.error("❌ ERRO CRÍTICO AO ENVIAR EMAIL:");
        console.error("Detalhes do erro:", emailError);
        console.error("Chave que deveria ser enviada:", licenseKey);
        console.error("Email que deveria receber:", emailToUse);
        
        res.json({
          success: true,
          message: "Licença gerada mas houve erro no envio do email",
          data: {
            userId: user.id,
            userEmail: emailToUse,
            licenseKey,
            plan,
            paymentId: testPayment.id,
            licenseAction: action,
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
      const { email, username, password, firstName, lastName } = registerSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já está em uso" });
      }

      // Create user with plain password (no encryption)
      const user = await storage.createUser({
        email,
        username,
        password: password,
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

      // Create reset URL - Corrigindo para usar a URL base correta
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000';
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      // Send reset email
      try {
        await sendPasswordResetEmail(email, resetToken);
        console.log(`[FORGOT PASSWORD] Password reset email sent to: ${email}`);
        console.log(`[FORGOT PASSWORD] Reset URL: ${resetUrl}`);
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
      const { token, password } = resetPasswordSchema.parse(req.body);
      
      // Verify reset token
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken || resetToken.used) {
        return res.status(400).json({ message: "Token inválido ou expirado" });
      }

      // Check if token has expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Token expirado" });
      }

      // Get user
      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(400).json({ message: "Usuário não encontrado" });
      }

      // Update user password (no encryption)
      await storage.updateUser(user.id, { password: password });

      // Mark token as used
      await storage.markPasswordResetTokenAsUsed(token);

      // Clean up expired tokens
      await storage.deleteExpiredPasswordResetTokens();

      console.log(`[RESET PASSWORD] Password successfully reset for user: ${user.email}`);
      res.json({ message: "Senha redefinida com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // PIX Payment creation
  app.post("/api/payments/create-pix", isAuthenticated, rateLimit(5, 60 * 1000), async (req, res) => {
    try {
      console.log("=== INÍCIO DA CRIAÇÃO DE PAGAMENTO PIX ===");
      const user = req.user as any;
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      
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
      
      // Registrar tentativa de pagamento para auditoria
      securityAudit.logPaymentAttempt(
        user.id, 
        user.email, 
        requestData.plan, 
        requestData.plan === 'test' ? 100 : requestData.plan === '7days' ? 1500 : 2500,
        clientIp
      );
      
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
        success: true,
        payment: {
          id: payment.id,
          externalReference: payment.externalReference,
          transactionAmount: payment.transactionAmount,
          currency: payment.currency,
          plan: payment.plan,
          durationDays: payment.durationDays,
          status: payment.status,
          pixQrCode: payment.pixQrCode,
          pixQrCodeBase64: payment.pixQrCodeBase64,
          preferenceId: payment.preferenceId,
          createdAt: payment.createdAt
        },
        initPoint: pixPayment.initPoint
      };

      res.json(response);
    } catch (error) {
      console.error("❌ ERRO NA CRIAÇÃO DO PAGAMENTO PIX:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false,
          message: "Dados inválidos", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        success: false,
        message: "Erro interno ao criar pagamento",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Webhook do Mercado Pago para processar pagamentos aprovados
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      console.log("=== WEBHOOK MERCADO PAGO RECEBIDO ===");
      console.log("Headers:", JSON.stringify(req.headers, null, 2));
      console.log("Body:", JSON.stringify(req.body, null, 2));
      
      const signature = req.headers['x-signature'];
      const requestId = req.headers['x-request-id'];
      
      console.log("Signature:", signature);
      console.log("Request ID:", requestId);
      
      // PROCESSAR APENAS WEBHOOKS DE PAGAMENTO
      const webhookData = req.body;
      if (webhookData.type === "payment" && webhookData.data?.id) {
        const paymentId = webhookData.data.id;
        console.log(`=== PROCESSANDO PAGAMENTO ${paymentId} ===`);
        
        // BUSCAR INFORMAÇÕES DO PAGAMENTO NO MERCADO PAGO
        console.log("Buscando informações do pagamento no Mercado Pago...");
        const paymentInfo = await getPaymentInfo(paymentId);
        if (!paymentInfo) {
          console.log(`❌ Não foi possível obter informações do pagamento ${paymentId}`);
          return res.status(200).json({ received: true, error: "Payment info not found" });
        }
        console.log("Informações do pagamento:", JSON.stringify(paymentInfo, null, 2));
        
        // VERIFICAR SE O PAGAMENTO FOI APROVADO
        if (paymentInfo?.status === "approved") {
          console.log(`=== PAGAMENTO APROVADO! ===`);
          console.log(`Valor: R$ ${paymentInfo.transaction_amount}`);
          console.log(`External Reference: ${paymentInfo.external_reference}`);
          
          // VALIDAR EXTERNAL REFERENCE
          if (!paymentInfo.external_reference) {
            console.log(`❌ External reference não encontrada no pagamento`);
            return res.status(200).json({ received: true, error: "External reference missing" });
          }
          
          // USAR SISTEMA ROBUSTO DE VALIDAÇÃO E ATIVAÇÃO
          const { validateAndActivateLicense } = await import('./payment-license-validator');
          const { findBestEmailForUser } = await import('./license-utils');
          
          const validationResult = await validateAndActivateLicense(
            paymentId,
            paymentInfo.external_reference,
            paymentInfo.transaction_amount,
            paymentInfo.payer?.email
          );
          
          if (!validationResult.success) {
            console.error(`❌ FALHA NA VALIDAÇÃO/ATIVAÇÃO: ${validationResult.message}`);
            return res.status(200).json({ 
              received: true, 
              error: "License validation/activation failed",
              details: validationResult.message 
            });
          }
          
          console.log(`✅ LICENÇA ATIVADA COM SUCESSO!`);
          console.log(`Usuário: ${validationResult.userEmail} (ID: ${validationResult.userId})`);
          console.log(`Chave: ${validationResult.licenseKey}`);
          
          // ENVIAR EMAIL COM A CHAVE DE LICENÇA
          if (validationResult.userId && validationResult.licenseKey) {
            const user = await storage.getUser(validationResult.userId);
            const license = await storage.getLicenseByKey(validationResult.licenseKey);
            
            if (user && license) {
              const planName = license.plan === "test" ? "Teste (30 minutos)" : 
                               license.plan === "7days" ? "7 Dias" : "15 Dias";
              
              // Buscar melhor email disponível
              const emailToUse = await findBestEmailForUser(user, paymentInfo);
              
              if (!emailToUse) {
                console.warn(`[EMAIL] ⚠️ Nenhum email válido encontrado para envio`);
                console.log(`[EMAIL] ✅ Licença ativada no sistema - usuário pode fazer login para verificar`);
                
                console.log(`=== LICENÇA ATIVADA SEM EMAIL ===`);
                console.log(`Usuário ID: ${user.id}`);
                console.log(`Email cadastrado: ${user.email}`);
                console.log(`Chave gerada: ${validationResult.licenseKey}`);
                console.log(`Plano: ${planName}`);
                console.log(`Válida até: ${license.expiresAt}`);
                console.log(`Status: ATIVA - Disponível no dashboard`);
              } else {
                console.log(`[EMAIL] ✅ Email selecionado para envio: "${emailToUse}"`);
                
                try {
                  const { sendLicenseKeyEmail } = await import('./email');
                  await sendLicenseKeyEmail(emailToUse, validationResult.licenseKey, planName);
                  console.log(`[EMAIL] ✅ Email enviado com sucesso para: ${emailToUse}`);
                } catch (emailError) {
                  console.error(`[EMAIL] ❌ Falha no envio para ${emailToUse}:`, emailError);
                  console.log(`[EMAIL] ✅ Licença permanece ativa no sistema - usuário pode fazer login`);
                }
              }
            }
          }
          
          console.log(`=== WEBHOOK PROCESSADO COM SUCESSO! ===`);
          console.log(`Pagamento: ${paymentId} (R$ ${(paymentInfo.transaction_amount || 0)/100})`);
          console.log(`Usuário: ${validationResult.userEmail}`);
          console.log(`Chave gerada: ${validationResult.licenseKey}`);
          console.log(`Status: LICENÇA ATIVA E VINCULADA AO USUÁRIO CORRETO`);
          
        } else {
          console.log(`=== PAGAMENTO NÃO APROVADO ===`);
          console.log(`Status: ${paymentInfo?.status || 'unknown'}`);
        }
      } else {
        console.log(`=== WEBHOOK IGNORADO ===`);
        console.log(`Tipo não é payment ou ID não encontrado`);
      }
      
      // SEMPRE RETORNAR 200 PARA EVITAR RETRIES DO MERCADO PAGO
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
    const user = req.user as any;
    res.json({ user: { ...user, password: undefined } });
  });

  app.get("/api/dashboard", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      console.log(`=== CARREGANDO DASHBOARD PARA USUÁRIO ${user.id} ===`);
      
      // Use new centralized license system
      const { getUserLicense } = await import('./user-license');
      const license = await getUserLicense(user.id);
      const downloads = await storage.getUserDownloads(user.id);

      if (license) {
        console.log(`Licença encontrada - Chave: ${license.key}`);
        console.log(`Status: ${license.status}, Plano: ${license.plan}`);
        console.log(`Expira em: ${license.expiresAt}`);
        console.log(`Tempo atual: ${new Date().toISOString()}`);
        console.log(`Expirada? ${new Date(license.expiresAt) < new Date()}`);
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
        }
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Erro ao carregar dashboard" });
    }
  });

  // Activate license with key (without HWID for dashboard use)
  app.post("/api/license/activate", isAuthenticated, rateLimit(5, 60 * 1000), async (req, res) => {
    try {
      const user = req.user as any;
      const { key } = activateKeySchema.parse(req.body);

      console.log(`=== INICIANDO ATIVAÇÃO DE LICENÇA ===`);
      console.log(`Usuário: ${user.id} (${user.email})`);
      console.log(`Chave solicitada: ${key}`);

      // Use new centralized license system
      const { activateLicenseKeyForUser } = await import('./user-license');
      const result = await activateLicenseKeyForUser(user.id, key);

      if (result.success) {
        console.log(`✅ Licença ativada com sucesso: ${key}`);
        res.json({ 
          message: "Licença ativada com sucesso",
          license: result.license 
        });
      } else {
        console.log(`❌ Falha na ativação: ${result.message}`);
        res.status(400).json({ message: result.message });
      }
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

      // Use new centralized license system
      const { activateLicenseKeyForUser } = await import('./user-license');
      const result = await activateLicenseKeyForUser(user.id, key, hwid);

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

  // License heartbeat endpoint for loader
  app.post("/api/licenses/heartbeat", rateLimit(60, 60 * 1000), async (req, res) => {
    try {
      const { licenseKey, hwid } = req.body;

      if (!licenseKey || !hwid) {
        return res.status(400).json({ message: "License key e HWID são obrigatórios" });
      }

      const { updateLicenseHeartbeat } = await import('./user-license');
      const result = await updateLicenseHeartbeat(licenseKey, hwid);

      if (result.success) {
        res.json({
          valid: true,
          license: result.license,
          message: result.message
        });
      } else {
        res.status(400).json({
          valid: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Heartbeat error:", error);
      res.status(500).json({
        valid: false,
        message: "Erro interno no servidor"
      });
    }
  });

  // Set HWID endpoint for loader
  app.post("/api/licenses/set-hwid", rateLimit(10, 60 * 1000), async (req, res) => {
    try {
      const { licenseKey, hwid } = req.body;

      if (!licenseKey || !hwid) {
        return res.status(400).json({ message: "License key e HWID são obrigatórios" });
      }

      const { getUserByLicenseKey, activateUserLicense } = await import('./user-license');
      const result = await getUserByLicenseKey(licenseKey);

      if (!result) {
        return res.status(404).json({ message: "Licença não encontrada" });
      }

      const { user, license } = result;

      if (license.status === "expired") {
        return res.status(400).json({ message: "Licença expirada" });
      }

      if (license.hwid && license.hwid !== hwid) {
        return res.status(400).json({ message: "HWID já vinculado a outro dispositivo" });
      }

      // Activate license with HWID
      const activationResult = await activateUserLicense(user.id, licenseKey, hwid);

      if (activationResult.success) {
        res.json({
          success: true,
          message: "HWID definido com sucesso",
          license: activationResult.license
        });
      } else {
        res.status(400).json({
          success: false,
          message: activationResult.message
        });
      }
    } catch (error) {
      console.error("Set HWID error:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno no servidor"
      });
    }
  });

  // Admin routes for license cleanup system
  app.get('/api/admin/cleanup-stats', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await licenseCleanupService.getCleanupStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting cleanup stats:", error);
      res.status(500).json({ message: "Erro ao obter estatísticas de limpeza" });
    }
  });

  app.post('/api/admin/manual-cleanup', isAuthenticated, isAdmin, async (req, res) => {
    try {
      await licenseCleanupService.manualCleanup();
      res.json({ message: "Limpeza manual executada com sucesso" });
    } catch (error) {
      console.error("Error during manual cleanup:", error);
      res.status(500).json({ message: "Erro durante limpeza manual" });
    }
  });

  // Security audit routes
  app.get('/api/admin/security-stats', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = securityAudit.getSecurityStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting security stats:", error);
      res.status(500).json({ message: "Erro ao obter estatísticas de segurança" });
    }
  });

  app.get('/api/admin/security-events', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const events = securityAudit.getRecentEvents(days);
      res.json(events);
    } catch (error) {
      console.error("Error getting security events:", error);
      res.status(500).json({ message: "Erro ao obter eventos de segurança" });
    }
  });

  // Initialize systems
  console.log("🧹 Sistema de limpeza automática de licenças inicializado");
  console.log("🔒 Sistema de auditoria de segurança inicializado");

  return {} as Server;
}