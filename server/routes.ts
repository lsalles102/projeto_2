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
      await storage.createPayment({
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

      res.json(pixPayment);
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
        console.log("Formato de webhook não reconhecido");
        return res.status(200).json({ received: true });
      }
      
      if (webhookData.type === "payment" && paymentId) {
        console.log(`Processando pagamento ID: ${paymentId}`);
        
        // Get payment info from MercadoPago
        const paymentInfo = await getPaymentInfo(paymentId);
        
        console.log("Informações do pagamento:", JSON.stringify(paymentInfo, null, 2));
        
        if (paymentInfo && paymentInfo.status === "approved") {
          console.log(`✅ Pagamento aprovado! External Reference: ${paymentInfo.external_reference}`);
          
          // Find payment in database by external_reference
          let payment = null;
          
          if (paymentInfo.external_reference) {
            payment = await storage.getPaymentByExternalReference(paymentInfo.external_reference);
          }
          
          // If not found by external_reference, try by mercadoPagoId
          if (!payment) {
            payment = await storage.getPaymentByMercadoPagoId(paymentId);
          }
          
          // If still not found, try to find the most recent pending payment
          if (!payment) {
            const pendingPayments = await storage.getPendingPayments();
            if (pendingPayments.length > 0) {
              payment = pendingPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
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
                console.log(`Renovando licença existente: ${existingLicense.key}`);
                
                // Calculate new expiration date
                const currentExpiry = new Date(existingLicense.expiresAt);
                const now = new Date();
                const startDate = currentExpiry > now ? currentExpiry : now;
                
                let newExpiryDate: Date;
                let totalMinutes: number;
                
                if (payment.plan === "test") {
                  // 30 minutes for test
                  newExpiryDate = new Date(startDate.getTime() + (30 * 60 * 1000));
                  totalMinutes = 30;
                } else {
                  // Add days for other plans
                  newExpiryDate = new Date(startDate.getTime() + (payment.durationDays * 24 * 60 * 60 * 1000));
                  totalMinutes = payment.durationDays * 24 * 60;
                }
                
                await storage.updateLicense(existingLicense.id, {
                  status: "active",
                  expiresAt: newExpiryDate,
                  totalMinutesRemaining: (existingLicense.totalMinutesRemaining || 0) + totalMinutes,
                  daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
                  hoursRemaining: Math.ceil(totalMinutes / 60),
                  minutesRemaining: totalMinutes,
                  activatedAt: new Date(),
                });
                
                console.log(`✅ Licença renovada até: ${newExpiryDate.toISOString()}`);
                
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

            // Send license key via email
            if (payment.payerEmail) {
              try {
                const planName = payment.plan === "test" ? "Teste (30 minutos)" : 
                                 payment.plan === "7days" ? "7 Dias" : "15 Dias";
                                 
                await sendLicenseKeyEmail(payment.payerEmail, activationKey, planName);
                console.log(`Email enviado para: ${payment.payerEmail}`);
              } catch (emailError) {
                console.error("Erro ao enviar email:", emailError);
              }
            }

            console.log(`✅ PAGAMENTO PROCESSADO COM SUCESSO - Chave: ${activationKey}`);
          } else {
            console.error(`❌ Pagamento não encontrado no banco ou já processado`);
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
      const license = await storage.getLicenseByUserId(user.id);
      const downloads = await storage.getUserDownloads(user.id);

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

      // Check if user already has an active license
      const existingLicense = await storage.getLicenseByUserId(user.id);
      if (existingLicense && existingLicense.status === "active") {
        return res.status(400).json({ message: "Usuário já possui uma licença ativa" });
      }

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

      // Create or update license
      if (existingLicense) {
        await storage.updateLicense(existingLicense.id, {
          status: "active",
          plan: activationKey.plan,
          expiresAt,
          totalMinutesRemaining: totalMinutes,
          daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
          hoursRemaining: Math.ceil(totalMinutes / 60),
          minutesRemaining: totalMinutes,
          activatedAt: new Date(),
        });
      } else {
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

  const httpServer = createServer(app);
  return httpServer;
}