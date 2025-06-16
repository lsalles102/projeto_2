import { Express, Request, Response, RequestHandler } from "express";
import { Server } from "http";
import { z } from "zod";
import { nanoid } from "nanoid";

import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken } from "./auth";
import { sendPasswordResetEmail, sendLicenseKeyEmail } from "./email";
import { createPixPayment, getPaymentInfo } from "./mercado-pago";
import { 
  registerSchema, 
  loginSchema, 
  licenseHeartbeatSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  contactSchema,
  updateUserSchema,
  createPixPaymentSchema,
  mercadoPagoWebhookSchema,
  activateKeySchema
} from "@shared/schema";

// Rate limiting
const rateLimit = (maxRequests: number, windowMs: number): RequestHandler => {
  const requests = new Map<string, number[]>();
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!requests.has(ip)) {
      requests.set(ip, []);
    }
    
    const userRequests = requests.get(ip)!;
    const validRequests = userRequests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({ message: "Muitas tentativas. Tente novamente mais tarde." });
    }
    
    validRequests.push(now);
    requests.set(ip, validRequests);
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  const server = await setupAuth(app);

  // Test payment simulation endpoint
  app.post("/api/test/simulate-payment", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { plan = "test", userEmail } = req.body;

      console.log(`=== SIMULAÇÃO DE PAGAMENTO INICIADA ===`);
      console.log(`Usuário: ${user.id} - ${user.email}`);
      console.log(`Plano solicitado: ${plan}`);

      const durationDays = plan === "test" ? 0.021 : plan === "7days" ? 7 : 15;
      const emailToUse = userEmail || user.email;

      // Create test payment record
      const testPayment = await storage.createPayment({
        userId: user.id,
        preferenceId: `test_pref_${Date.now()}`,
        externalReference: `test_${Date.now()}`,
        status: "approved",
        transactionAmount: plan === "test" ? 100 : plan === "7days" ? 1500 : 2500,
        currency: "BRL",
        plan,
        durationDays: durationDays.toString(),
        payerEmail: emailToUse,
        payerFirstName: user.firstName || "Test",
        payerLastName: user.lastName || "User",
        pixQrCode: "test_qr",
        pixQrCodeBase64: "test_qr_base64",
      });

      // Use simplified license system
      const { activateLicenseForUser } = await import('./license-simple');
      const result = await activateLicenseForUser(user.id, plan, durationDays);

      // Send email
      try {
        const planName = plan === "test" ? "Teste (30 minutos)" : 
                         plan === "7days" ? "7 Dias" : "15 Dias";
        
        await sendLicenseKeyEmail(emailToUse, result.licenseKey, planName);
        
        res.json({
          success: true,
          message: "Pagamento simulado, licença gerada e email enviado com sucesso",
          data: {
            userId: user.id,
            userEmail: emailToUse,
            licenseKey: result.licenseKey,
            plan,
            planName,
            paymentId: testPayment.id,
            licenseAction: result.action,
            emailSent: true
          }
        });
      } catch (emailError) {
        res.json({
          success: true,
          message: "Licença gerada mas houve erro no envio do email",
          data: {
            userId: user.id,
            userEmail: emailToUse,
            licenseKey: result.licenseKey,
            plan,
            paymentId: testPayment.id,
            licenseAction: result.action,
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

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já está em uso" });
      }

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

  // Login route
  app.post("/api/auth/login", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      const token = generateToken(parseInt(user.id));
      
      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ message: "Erro no login" });
        }

        res.json({
          user: { ...user, password: undefined },
          token
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Logout route
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Erro no logout" });
      }
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  // User profile
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    res.json({ user: { ...user, password: undefined } });
  });

  // Dashboard with license info
  app.get("/api/dashboard", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const currentUser = await storage.getUser(user.id);
      
      if (!currentUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const downloads = await storage.getUserDownloads(user.id);

      // Create license object from user data
      let license = null;
      if (currentUser.license_status === "ativa") {
        license = {
          status: currentUser.license_status,
          plan: currentUser.license_plan,
          expiresAt: currentUser.license_expires_at?.toISOString(),
          activatedAt: currentUser.license_activated_at?.toISOString(),
          totalMinutes: currentUser.license_total_minutes,
          remainingMinutes: currentUser.license_remaining_minutes,
          lastHeartbeat: currentUser.license_last_heartbeat?.toISOString()
        };
      }

      res.json({
        user: { ...currentUser, password: undefined },
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

  // PIX payment creation
  app.post("/api/payments/create-pix", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { plan, durationDays, payerEmail, payerFirstName, payerLastName } = 
        createPixPaymentSchema.parse(req.body);

      const pixData = await createPixPayment({
        userId: parseInt(user.id),
        plan,
        durationDays,
        payerEmail,
        payerFirstName,
        payerLastName
      });

      // Save payment to database
      console.log("Salvando pagamento no banco de dados...");
      const payment = await storage.createPayment({
        userId: user.id,
        preferenceId: pixData.preferenceId,
        externalReference: pixData.externalReference,
        status: "pending",
        transactionAmount: pixData.transactionAmount,
        currency: pixData.currency,
        plan,
        durationDays: durationDays.toString(),
        payerEmail,
        payerFirstName,
        payerLastName,
        pixQrCode: pixData.pixQrCode,
        pixQrCodeBase64: pixData.pixQrCodeBase64,
      });

      console.log(`✅ Pagamento salvo no banco: ID ${payment.id}`);
      
      res.json({
        success: true,
        payment: {
          id: payment.id,
          externalReference: pixData.externalReference,
          transactionAmount: pixData.transactionAmount,
          currency: pixData.currency,
          plan,
          durationDays: durationDays.toString(),
          status: "pending",
          pixQrCode: pixData.pixQrCode,
          pixQrCodeBase64: pixData.pixQrCodeBase64,
          preferenceId: pixData.preferenceId,
          createdAt: payment.createdAt
        },
        initPoint: pixData.initPoint
      });

    } catch (error) {
      console.error("Erro ao criar pagamento PIX:", error);
      res.status(500).json({ message: "Erro ao criar pagamento PIX" });
    }
  });

  // Webhook handler
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      console.log(`=== WEBHOOK MERCADO PAGO RECEBIDO ===`);
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log(`Body:`, JSON.stringify(req.body, null, 2));

      const webhookData = mercadoPagoWebhookSchema.parse(req.body);
      
      if (webhookData.type === 'payment' && webhookData.data?.id) {
        const paymentId = webhookData.data.id;
        console.log(`🔍 Processando pagamento ID: ${paymentId}`);
        
        const paymentInfo = await getPaymentInfo(paymentId);
        console.log(`📊 Status do pagamento: ${paymentInfo?.status}`);
        
        if (paymentInfo?.status === "approved") {
          console.log(`=== PAGAMENTO APROVADO! ===`);
          
          if (paymentInfo.external_reference) {
            const payment = await storage.getPaymentByExternalReference(paymentInfo.external_reference);
            
            if (payment) {
              const user = await storage.getUser(payment.userId);
              
              if (user) {
                // Activate license
                const { activateLicenseForUser } = await import('./license-simple');
                const result = await activateLicenseForUser(
                  user.id, 
                  payment.plan, 
                  parseFloat(payment.durationDays)
                );
                
                // Update payment status
                await storage.updatePaymentByExternalReference(
                  paymentInfo.external_reference,
                  { status: "approved" }
                );
                
                console.log(`✅ Licença ativada para usuário ${user.email}`);
                
                // Send email
                try {
                  const planName = payment.plan === "test" ? "Teste (30 minutos)" : 
                                   payment.plan === "7days" ? "7 Dias" : "15 Dias";
                  await sendLicenseKeyEmail(user.email, result.licenseKey, planName);
                } catch (emailError) {
                  console.error("Erro no envio de email:", emailError);
                }
              }
            }
          }
        }
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(200).json({ received: true, error: "Webhook processing failed" });
    }
  });

  // License heartbeat
  app.post("/api/license/heartbeat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { hwid } = licenseHeartbeatSchema.parse(req.body);

      const { processHeartbeat } = await import('./license-simple');
      const result = await processHeartbeat(user.id, hwid);

      if (result.success) {
        res.json({
          valid: true,
          remainingMinutes: result.remainingMinutes,
          message: result.message
        });
      } else {
        res.status(403).json({
          valid: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Heartbeat error:", error);
      res.status(500).json({ valid: false, message: "Erro interno" });
    }
  });

  return server;
}