import { Express, Request, Response, RequestHandler } from "express";
import { Server } from "http";
import { z } from "zod";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";

import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken } from "./auth";
import { sendPasswordResetEmail, sendLicenseKeyEmail } from "./email";
import { createPixPayment, getPaymentInfo } from "./mercado-pago";
import { licenseManager } from "./license-manager";
import { handlePaymentWebhook } from "./payment-webhook";
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
  activateKeySchema,
} from "@shared/schema";

// Rate limiting
const rateLimit = (maxRequests: number, windowMs: number): RequestHandler => {
  const requests = new Map<string, number[]>();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();

    if (!requests.has(ip)) {
      requests.set(ip, []);
    }

    const userRequests = requests.get(ip)!;
    const validRequests = userRequests.filter((time) => now - time < windowMs);

    if (validRequests.length >= maxRequests) {
      return res
        .status(429)
        .json({ message: "Muitas tentativas. Tente novamente mais tarde." });
    }

    validRequests.push(now);
    requests.set(ip, validRequests);
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  const server = await setupAuth(app);

  // Admin middleware - definido antes do uso
  const isAdmin: RequestHandler = (req, res, next) => {
    const user = req.user as any;
    if (!user) {
      return res.status(403).json({ message: "Acesso negado. Usuário não autenticado." });
    }

    const isUserAdmin = user.is_admin === true || user.isAdmin === true;
    if (!isUserAdmin) {
      return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
    }

    next();
  };

  // Force approve payment for development/testing
  app.post("/api/test/force-approve-payment", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { paymentId } = req.body;
      
      if (!paymentId) {
        return res.status(400).json({ message: "Payment ID is required" });
      }

      console.log(`🔧 === FORÇANDO APROVAÇÃO DE PAGAMENTO ===`);
      console.log(`Payment ID: ${paymentId}`);

      // Get payment from database
      const { db } = await import("./db");
      const { payments } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const paymentResult = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      const payment = paymentResult[0];

      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      console.log(`💳 Pagamento encontrado: ${payment.externalReference}`);

      // Get user
      const user = await storage.getUser(payment.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`👤 Usuário: ${user.email}`);

      // Activate license
      const { activateLicenseForUser } = await import("./license-simple");
      const result = await activateLicenseForUser(
        user.id,
        payment.plan,
        parseFloat(payment.durationDays),
      );

      // Update payment status with unique mercado_pago_id
      const uniqueMercadoPagoId = `FORCE_APPROVED_${Date.now()}_${paymentId}`;
      await db.update(payments)
        .set({
          status: "approved",
          mercadoPagoId: uniqueMercadoPagoId,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId));

      console.log(`✅ Licença ativada para usuário ${user.email}`);
      console.log(`🔑 License Key: ${result.licenseKey}`);

      res.json({
        success: true,
        message: "Payment approved and license activated",
        licenseKey: result.licenseKey,
        user: user.email,
        plan: payment.plan
      });

    } catch (error) {
      console.error("❌ Erro ao forçar aprovação:", error);
      res.status(500).json({
        success: false,
        message: "Error forcing payment approval",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create admin user endpoint for debugging
  app.post("/api/test/create-admin", async (req, res) => {
    try {
      console.log("=== CRIANDO USUÁRIO ADMIN ===");
      
      // Check if admin already exists
      const existingAdmin = await storage.getUserByEmail("admin@fovdark.com");
      if (existingAdmin) {
        console.log("✅ Admin já existe:", existingAdmin.email);
        return res.json({
          success: true,
          message: "Admin já existe",
          user: {
            id: existingAdmin.id,
            email: existingAdmin.email,
            is_admin: existingAdmin.is_admin
          }
        });
      }
      
      // Create admin user
      const adminUser = await storage.createUser({
        email: "admin@fovdark.com",
        username: "admin",
        password: "admin123",
        firstName: "Admin",
        lastName: "FovDark",
        is_admin: true
      });
      
      console.log("✅ Admin criado:", adminUser.email);
      
      res.json({
        success: true,
        message: "Usuário administrador criado com sucesso",
        user: {
          id: adminUser.id,
          email: adminUser.email,
          is_admin: adminUser.is_admin
        },
        credentials: {
          email: "admin@fovdark.com",
          password: "admin123"
        }
      });
    } catch (error) {
      console.error("❌ Erro ao criar admin:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao criar administrador",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Fix admin user endpoint
  app.post("/api/test/fix-admin", async (req, res) => {
    try {
      console.log("=== CORRIGINDO USUÁRIO ADMIN ===");
      
      const adminUser = await storage.getUserByEmail("admin@fovdark.com");
      if (!adminUser) {
        return res.status(404).json({
          success: false,
          message: "Usuário admin não encontrado"
        });
      }
      
      // Update user to be admin
      const updatedUser = await storage.updateUser(adminUser.id, {
        is_admin: true
      });
      
      console.log("✅ Admin corrigido:", updatedUser.email);
      
      res.json({
        success: true,
        message: "Usuário administrador corrigido com sucesso",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          is_admin: updatedUser.is_admin
        }
      });
    } catch (error) {
      console.error("❌ Erro ao corrigir admin:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao corrigir administrador",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create test user for testing delete functionality
  app.post("/api/test/create-test-user", async (req, res) => {
    try {
      const testUser = await storage.createUser({
        email: `test${Date.now()}@example.com`,
        username: `test${Date.now()}`,
        password: "123456",
        firstName: "Test",
        lastName: "User",
        is_admin: false
      });
      
      res.json({
        success: true,
        message: "Usuário de teste criado",
        user: {
          id: testUser.id,
          email: testUser.email,
          firstName: testUser.firstName,
          lastName: testUser.lastName
        }
      });
    } catch (error) {
      console.error("❌ Erro ao criar usuário de teste:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao criar usuário de teste",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test payment simulation endpoint - MELHORADO
  app.post("/api/test/simulate-payment", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { plan = "test", userEmail } = req.body;

      console.log(`🧪 === SIMULAÇÃO DE PAGAMENTO INICIADA ===`);
      console.log(`👤 Usuário: ${user.id} - ${user.email}`);
      console.log(`📦 Plano solicitado: ${plan}`);

      const durationDays = plan === "test" ? 0.021 : plan === "7days" ? 7 : 15;
      const emailToUse = userEmail || user.email;

      // Create test payment record
      const testPayment = await storage.createPayment({
        userId: user.id,
        preferenceId: `test_pref_${Date.now()}`,
        externalReference: `test_${Date.now()}`,
        status: "approved",
        transactionAmount:
          plan === "test" ? 100 : plan === "7days" ? 990 : 1890,
        currency: "BRL",
        plan,
        durationDays: durationDays.toString(),
        payerEmail: emailToUse,
        payerFirstName: user.firstName || "Test",
        payerLastName: user.lastName || "User",
        pixQrCode: "test_qr",
        pixQrCodeBase64: "test_qr_base64",
      });

      console.log(`💳 Pagamento de teste criado: ID ${testPayment.id}`);

      // Use simplified license system
      const { activateLicenseForUser } = await import("./license-simple");
      const result = await activateLicenseForUser(user.id, plan, durationDays);

      console.log(`🔓 Resultado da ativação:`, result);

      // Verify license was activated by checking user again
      const updatedUser = await storage.getUser(user.id);
      console.log(`✅ Verificação pós-ativação:`);
      console.log(`Status: ${updatedUser?.license_status}`);
      console.log(`Plano: ${updatedUser?.license_plan}`);
      console.log(`Expira em: ${updatedUser?.license_expires_at}`);

      res.json({
        success: true,
        message: "Pagamento simulado e licença ativada com sucesso",
        data: {
          userId: user.id,
          userEmail: emailToUse,
          paymentId: testPayment.id,
          licenseKey: result.licenseKey,
          plan,
          licenseAction: result.action,
          userStatus: {
            license_status: updatedUser?.license_status,
            license_plan: updatedUser?.license_plan,
            license_expires_at: updatedUser?.license_expires_at,
            license_remaining_minutes: updatedUser?.license_remaining_minutes,
          },
        },
      });
    } catch (error) {
      console.error("❌ Erro na simulação de pagamento:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno na simulação",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  });

  // Registration route
  app.post(
    "/api/auth/register",
    rateLimit(5, 15 * 60 * 1000),
    async (req, res) => {
      try {
        const { email, password, firstName, lastName } = registerSchema.parse(
          req.body,
        );

        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
          return res.status(400).json({ message: "Email já está em uso" });
        }

        // Generate username from email and firstName
        const username = `${firstName.toLowerCase()}_${email.split("@")[0]}`;

        const user = await storage.createUser({
          email,
          username,
          password: password,
          firstName,
          lastName,
        });

        // Auto-login after registration
        req.login(user, (err) => {
          if (err) {
            console.error("Auto-login error:", err);
            return res.status(201).json({
              user: { ...user, password: undefined },
              message: "Usuário criado com sucesso",
            });
          }

          const token = generateToken(user.id);
          res.status(201).json({
            user: { ...user, password: undefined },
            token,
            message: "Usuário criado e logado com sucesso",
          });
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Registration error:", error);
        res.status(500).json({ message: "Erro interno do servidor" });
      }
    },
  );

  // Login route (JSON format)
  app.post(
    "/api/auth/login",
    rateLimit(10, 15 * 60 * 1000),
    async (req, res) => {
      try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await storage.getUserByEmail(email);
        if (!user || user.password !== password) {
          return res.status(401).json({ message: "Credenciais inválidas" });
        }

        const token = generateToken(user.id);

        req.login(user, (err) => {
          if (err) {
            console.error("Login error:", err);
            return res.status(500).json({ message: "Erro no login" });
          }

          res.json({
            user: {
              ...user,
              password: undefined,
              isAdmin: user.is_admin, // Mapear is_admin para isAdmin para o frontend
            },
            token,
          });
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Login error:", error);
        res.status(500).json({ message: "Erro interno do servidor" });
      }
    },
  );

  // Login route for loader (form data format)
  app.post("/api/login", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      const email = req.body.email;
      const password = req.body.password;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email e senha são obrigatórios" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      const token = generateToken(user.id);

      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ message: "Erro no login" });
        }

        res.json({
          access_token: token,
          user: {
            ...user,
            password: undefined,
            isAdmin: user.is_admin,
          },
        });
      });
    } catch (error) {
      console.error("Loader login error:", error);
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
    try {
      const user = req.user as any;
      console.log(`Auth: Retornando dados do usuário: ${user.email}`);
      res.json({
        user: {
          ...user,
          password: undefined,
          isAdmin: user.is_admin, // Mapear is_admin para isAdmin para o frontend
        },
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Erro ao buscar dados do usuário" });
    }
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

      // Create license object from user data - CORRIGIDO
      console.log(`📊 Dashboard - Status da licença do usuário ${user.id}:`);
      console.log(`license_status: ${currentUser.license_status}`);
      console.log(`license_plan: ${currentUser.license_plan}`);
      console.log(`license_expires_at: ${currentUser.license_expires_at}`);
      console.log(
        `license_remaining_minutes: ${currentUser.license_remaining_minutes}`,
      );

      let license = {
        status: currentUser.license_status || "sem_licenca",
        license_status: currentUser.license_status || "sem_licenca",
        plan: currentUser.license_plan,
        license_plan: currentUser.license_plan,
        expiresAt: currentUser.license_expires_at?.toISOString(),
        license_expires_at: currentUser.license_expires_at?.toISOString(),
        activatedAt: currentUser.license_activated_at?.toISOString(),
        license_activated_at: currentUser.license_activated_at?.toISOString(),
        totalMinutes: currentUser.license_total_minutes || 0,
        license_total_minutes: currentUser.license_total_minutes || 0,
        remainingMinutes: currentUser.license_remaining_minutes || 0,
        license_remaining_minutes: currentUser.license_remaining_minutes || 0,
        lastHeartbeat: currentUser.license_last_heartbeat?.toISOString(),
        license_last_heartbeat:
          currentUser.license_last_heartbeat?.toISOString(),
        hwid: currentUser.hwid,
      };

      res.json({
        user: {
          ...currentUser,
          password: undefined,
          isAdmin: currentUser.is_admin, // Mapear is_admin para isAdmin para o frontend
        },
        license,
        downloads,
        stats: {
          totalDownloads: downloads.length,
          lastDownload: downloads[downloads.length - 1]?.downloadedAt,
        },
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Erro ao carregar dashboard" });
    }
  });

  // ÚNICA ROTA DE PAGAMENTO PIX - FUNCIONAL
  app.post("/api/payments/create-pix", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      console.log(`PIX: Usuário ${user.email} criando pagamento`);
      
      const { plan, payerEmail, payerFirstName, payerLastName } = req.body;
      
      if (!plan || !payerEmail || !payerFirstName || !payerLastName) {
        return res.status(400).json({
          success: false,
          message: "Dados obrigatórios em falta"
        });
      }

      const durationDays = plan === "test" ? 0.021 : plan === "7days" ? 7 : 15;
      
      const pixData = await createPixPayment({
        userId: user.id,
        plan,
        durationDays,
        payerEmail,
        payerFirstName,
        payerLastName,
      });

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

      console.log(`PIX: Pagamento criado ID ${payment.id}`);

      res.json({
        success: true,
        payment: {
          id: payment.id,
          externalReference: pixData.externalReference,
          transactionAmount: pixData.transactionAmount,
          currency: pixData.currency,
          plan,
          status: "pending",
          pixQrCode: pixData.pixQrCode,
          pixQrCodeBase64: pixData.pixQrCodeBase64,
          preferenceId: pixData.preferenceId,
          createdAt: payment.createdAt,
        },
        initPoint: pixData.initPoint,
      });
    } catch (error) {
      console.error("PIX: Erro -", error);
      res.status(500).json({ 
        success: false,
        message: "Erro ao criar pagamento",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Webhook Mercado Pago
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      console.log("WEBHOOK recebido:", JSON.stringify(req.body, null, 2));

      let paymentId;
      if (req.body.data?.id) {
        paymentId = req.body.data.id;
      } else if (req.body.resource) {
        paymentId = req.body.resource;
      } else {
        return res.json({ received: true });
      }

      console.log(`🔍 Processando pagamento: ${paymentId}`);
      
      const paymentInfo = await getPaymentInfo(paymentId);
      console.log(`📊 Status: ${paymentInfo?.status}`);
      console.log(`🔗 External Reference: ${paymentInfo?.external_reference}`);

        if (paymentInfo?.status === "approved") {
          console.log(`🎉 === PAGAMENTO APROVADO NO MERCADO PAGO! ===`);

          if (paymentInfo.external_reference) {
            const payment = await storage.getPaymentByExternalReference(
              paymentInfo.external_reference,
            );

            if (payment) {
              console.log(`💳 Pagamento encontrado no banco: ID ${payment.id}`);
              const user = await storage.getUser(payment.userId);

              if (user) {
                console.log(
                  `👤 Usuário encontrado: ${user.email} (ID: ${user.id})`,
                );

                // Activate license using simplified system
                const { activateLicenseForUser } = await import(
                  "./license-simple"
                );
                const result = await activateLicenseForUser(
                  user.id,
                  payment.plan,
                  parseFloat(payment.durationDays),
                );

                // Update payment status
                await storage.updatePaymentByExternalReference(
                  paymentInfo.external_reference,
                  {
                    status: "approved",
                    mercadoPagoId: paymentId,
                  },
                );

                console.log(`✅ Licença ativada para usuário ${user.email}`);
                console.log(`🔑 License Key: ${result.licenseKey}`);

                // Send email notification
                try {
                  const planName =
                    payment.plan === "test"
                      ? "Teste (30 minutos)"
                      : payment.plan === "7days"
                        ? "7 Dias"
                        : "15 Dias";
                  await sendLicenseKeyEmail(
                    user.email,
                    result.licenseKey,
                    planName,
                  );
                  console.log(
                    `📧 Email de confirmação enviado para ${user.email}`,
                  );
                } catch (emailError) {
                  console.error("❌ Erro no envio de email:", emailError);
                }
              } else {
                console.log(`❌ Usuário não encontrado: ${payment.userId}`);
              }
            } else {
              console.log(
                `❌ Pagamento não encontrado para external_reference: ${paymentInfo.external_reference}`,
              );
            }
          } else {
            console.log(`❌ External reference não encontrada no pagamento MP`);
          }
        } else {
          console.log(`ℹ️ Pagamento não aprovado - Status: ${paymentInfo?.status}`);
        }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("❌ Erro crítico no webhook:", error);
      res
        .status(200)
        .json({ received: true, error: "Webhook processing failed" });
    }
  });

  // Payment status endpoint - simplified approach
  app.get(
    "/api/payments/:paymentId/status",
    isAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as any;
        const { paymentId } = req.params;

        console.log(
          `Verificando status do pagamento ${paymentId} para usuário ${user.id}`,
        );

        // Get all payments for this user and find the one requested
        const allPayments = await storage.getAllPayments();
        const payment = allPayments.find(
          (p) => p.id === parseInt(paymentId) && p.userId === user.id,
        );

        if (!payment) {
          return res.status(404).json({ message: "Pagamento não encontrado" });
        }

        // Also check current user license status
        const currentUser = await storage.getUser(user.id);
        const hasActiveLicense = currentUser?.license_status === "ativa";

        console.log(
          `Status: ${payment.status}, Licença ativa: ${hasActiveLicense}`,
        );

        res.json({
          id: payment.id,
          status: payment.status,
          plan: payment.plan,
          transactionAmount: payment.transactionAmount,
          currency: payment.currency,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          hasActiveLicense,
        });
      } catch (error) {
        console.error("Error checking payment status:", error);
        res.status(500).json({ message: "Erro interno" });
      }
    },
  );

  // License heartbeat
  app.post("/api/license/heartbeat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { hwid } = licenseHeartbeatSchema.parse(req.body);

      const { processHeartbeat } = await import("./license-simple");
      const result = await processHeartbeat(user.id, hwid);

      if (result.success) {
        res.json({
          valid: true,
          remainingMinutes: result.remainingMinutes,
          message: result.message,
        });
      } else {
        res.status(403).json({
          valid: false,
          message: result.message,
        });
      }
    } catch (error) {
      console.error("Heartbeat error:", error);
      res.status(500).json({ valid: false, message: "Erro interno" });
    }
  });

  // Endpoint para verificar licença (usado pelo loader)
  app.get("/api/license/check", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      console.log(
        `🔍 [LOADER] Verificando licença para usuário: ${user.id} (${user.email})`,
      );

      const currentUser = await storage.getUser(user.id);

      if (!currentUser) {
        console.log(`❌ [LOADER] Usuário não encontrado: ${user.id}`);
        return res
          .status(404)
          .json({ valid: false, message: "Usuário não encontrado" });
      }

      const now = new Date();
      const isActive =
        currentUser.license_status === "ativa" &&
        currentUser.license_expires_at &&
        new Date(currentUser.license_expires_at) > now;

      console.log(
        `📊 [LOADER] Status da licença: ${currentUser.license_status}`,
      );
      console.log(`📅 [LOADER] Expira em: ${currentUser.license_expires_at}`);
      console.log(`✅ [LOADER] Licença ativa: ${isActive}`);

      if (!isActive) {
        return res.json({
          valid: false,
          message:
            currentUser.license_status === "expirada"
              ? "Licença expirada"
              : "Licença inativa",
        });
      }

      // Calcular dias restantes
      const expiresAt = currentUser.license_expires_at || new Date();
      const msRemaining = new Date(expiresAt).getTime() - now.getTime();
      const daysRemaining = Math.max(
        0,
        Math.ceil(msRemaining / (1000 * 60 * 60 * 24)),
      );

      console.log(`⏱️ [LOADER] Dias restantes: ${daysRemaining}`);

      res.json({
        valid: true,
        message: "Licença ativa",
        days_remaining: daysRemaining,
        plan: currentUser.license_plan,
        expires_at: currentUser.license_expires_at,
      });
    } catch (error) {
      console.error("❌ [LOADER] Erro ao verificar licença:", error);
      res.status(500).json({ valid: false, message: "Erro interno" });
    }
  });

  // Endpoint para salvar HWID (usado pelo loader)
  app.post("/api/hwid/save", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { hwid } = req.body;

      console.log(
        `🔒 [LOADER] Tentativa de salvar HWID para usuário: ${user.id} (${user.email})`,
      );
      console.log(`💻 [LOADER] HWID recebido: ${hwid}`);

      if (!hwid) {
        return res.status(400).json({ message: "HWID é obrigatório" });
      }

      // Verificar se o usuário tem licença ativa
      const currentUser = await storage.getUser(user.id);
      if (!currentUser || currentUser.license_status !== "ativa") {
        console.log(
          `❌ [LOADER] Licença inativa para usuário ${user.id}: ${currentUser?.license_status}`,
        );
        return res.status(403).json({ message: "Licença inativa" });
      }

      // Verificar se já tem HWID registrado e é diferente
      if (currentUser.hwid && currentUser.hwid !== hwid) {
        console.log(
          `🚫 [LOADER] HWID não autorizado. Registrado: ${currentUser.hwid}, Tentativa: ${hwid}`,
        );
        return res.status(403).json({
          message:
            "HWID não autorizado. Entre em contato com o suporte para resetar.",
        });
      }

      // Salvar/atualizar HWID
      await storage.updateUser(user.id, { hwid });
      console.log(`✅ [LOADER] HWID salvo com sucesso para usuário ${user.id}`);

      res.json({ message: "HWID salvo com sucesso" });
    } catch (error) {
      console.error("❌ [LOADER] Erro ao salvar HWID:", error);
      res.status(500).json({ message: "Erro interno" });
    }
  });



  // Add webhook endpoint for MercadoPago
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    await handlePaymentWebhook(req, res);
  });

  // Alternative webhook endpoint for MercadoPago
  app.post("/api/payments/webhook", async (req, res) => {
    await handlePaymentWebhook(req, res);
  });

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      const stats = await storage.getSystemStats();
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
        stats
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add license status endpoint
  app.get("/api/license/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const currentUser = await storage.getUser(user.id);

      if (!currentUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const isActive =
        currentUser.license_status === "ativa" &&
        currentUser.license_expires_at &&
        new Date(currentUser.license_expires_at) > new Date();

      res.json({
        license: {
          status: currentUser.license_status,
          plan: currentUser.license_plan,
          expiresAt: currentUser.license_expires_at,
          remainingMinutes: currentUser.license_remaining_minutes,
          isActive,
        },
        isActive,
      });
    } catch (error) {
      console.error("License status error:", error);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Simple license activation test endpoint
  app.post("/api/test/activate-license", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      console.log(`🧪 Teste de ativação de licença para usuário: ${user.id}`);

      const { activateLicenseForUser } = await import("./license-simple");
      const result = await activateLicenseForUser(user.id, "test", 0.021);

      // Verificar se foi ativada
      const updatedUser = await storage.getUser(user.id);

      res.json({
        success: true,
        message: "Licença de teste ativada",
        licenseKey: result.licenseKey,
        userStatus: {
          license_status: updatedUser?.license_status,
          license_plan: updatedUser?.license_plan,
          license_expires_at: updatedUser?.license_expires_at,
          license_remaining_minutes: updatedUser?.license_remaining_minutes,
        },
      });
    } catch (error) {
      console.error("Erro ao ativar licença de teste:", error);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Download endpoint corrigido para o novo sistema de licenças
  app.get("/api/download/cheat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      console.log(
        `📁 Download solicitado pelo usuário: ${user.id} - ${user.email}`,
      );

      // Verificar licença usando o novo sistema integrado
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      console.log(`🔍 Verificando licença:`);
      console.log(`Status: ${currentUser.license_status}`);
      console.log(`Plano: ${currentUser.license_plan}`);
      console.log(`Expira em: ${currentUser.license_expires_at}`);
      console.log(
        `Minutos restantes: ${currentUser.license_remaining_minutes}`,
      );

      // Verificar se a licença está ativa
      const isLicenseActive =
        currentUser.license_status === "ativa" &&
        currentUser.license_expires_at &&
        new Date(currentUser.license_expires_at) > new Date() &&
        (currentUser.license_remaining_minutes || 0) > 0;

      if (!isLicenseActive) {
        console.log(`❌ Licença inativa ou expirada`);
        return res.status(403).json({
          message: "Licença ativa necessária para download",
          details: {
            status: currentUser.license_status,
            expired: currentUser.license_expires_at
              ? new Date(currentUser.license_expires_at) <= new Date()
              : true,
            remainingMinutes: currentUser.license_remaining_minutes,
          },
        });
      }

      console.log(`✅ Licença válida - autorizando download`);

      // Log do download
      await storage.logDownload(user.id, "FovDarkloader.exe");

      // URL de download segura (configurável via variável de ambiente)
      const downloadUrl =
        process.env.DOWNLOAD_URL ||
        "https://tkghgqliyjtovttpuael.supabase.co/storage/v1/object/sign/arquivos/FovDarkloader.exe?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYzBjODc1ZS05NThmLTQyMGMtYjY3OS1lNDkxYTdmNmNhZWMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhcnF1aXZvcy9Gb3ZEYXJrbG9hZGVyLmV4ZSIsImlhdCI6MTc1MDM3Mjk0NCwiZXhwIjoxNzgxOTA4OTQ0fQ.7ljfEt4nzV8juJgZejA7btU3paVWLh1AHE0oXa3B8AU";

      res.json({
        message: "Download autorizado",
        fileName: "FovDarkloader.exe",
        downloadUrl: downloadUrl,
        version: "2.4.1",
        size: "26.5 MB",
        license: {
          plan: currentUser.license_plan,
          remainingMinutes: currentUser.license_remaining_minutes,
          expiresAt: currentUser.license_expires_at,
        },
      });

      console.log(`📥 Download autorizado para ${user.email}`);
    } catch (error) {
      console.error("❌ Erro no download:", error);
      res.status(500).json({ message: "Falha no download" });
    }
  });

  // Endpoint público para o loader verificar status da licença (sem autenticação)
  app.post(
    "/api/loader/license-status",
    rateLimit(30, 60 * 1000),
    async (req, res) => {
      try {
        const { hwid } = req.body;

        if (!hwid) {
          return res.status(400).json({
            valid: false,
            message: "HWID é obrigatório",
          });
        }

        // Buscar usuário pelo HWID
        const allUsers = await storage.getAllUsers();
        const user = allUsers.find((u) => u.hwid === hwid);

        if (!user) {
          return res.json({
            valid: false,
            message: "HWID não registrado",
          });
        }

        const now = new Date();
        const isLicenseActive =
          user.license_status === "ativa" &&
          user.license_expires_at &&
          new Date(user.license_expires_at) > now;

        if (!isLicenseActive) {
          return res.json({
            valid: false,
            message:
              user.license_status === "expirada"
                ? "Licença expirada"
                : "Licença inativa",
            status: user.license_status || "sem_licenca",
          });
        }

        // Calcular tempo restante
        const expiresAt = user.license_expires_at
          ? new Date(user.license_expires_at)
          : new Date();
        const remainingMs = expiresAt.getTime() - now.getTime();
        const totalMinutesRemaining = Math.max(
          0,
          Math.floor(remainingMs / (1000 * 60)),
        );
        const daysRemaining = Math.floor(totalMinutesRemaining / (24 * 60));
        const hoursRemaining = Math.floor(
          (totalMinutesRemaining % (24 * 60)) / 60,
        );
        const minutesRemaining = totalMinutesRemaining % 60;

        res.json({
          valid: true,
          message: "Licença ativa",
          status: user.license_status,
          plan: user.license_plan,
          timeRemaining: {
            days: daysRemaining,
            hours: hoursRemaining,
            minutes: minutesRemaining,
            totalMinutes: totalMinutesRemaining,
          },
          expiresAt: user.license_expires_at,
          userEmail: user.email, // Para identificação
        });
      } catch (error) {
        console.error("[LOADER] Erro ao verificar status da licença:", error);
        res.status(500).json({
          valid: false,
          message: "Erro interno do servidor",
        });
      }
    },
  );

  // Endpoint público para o loader enviar heartbeat (sem autenticação)
  app.post(
    "/api/loader/heartbeat",
    rateLimit(60, 60 * 1000),
    async (req, res) => {
      try {
        const { hwid } = req.body;

        if (!hwid) {
          return res.status(400).json({
            valid: false,
            message: "HWID é obrigatório",
          });
        }

        // Buscar usuário pelo HWID
        const allUsers = await storage.getAllUsers();
        const user = allUsers.find((u) => u.hwid === hwid);

        if (!user) {
          return res.json({
            valid: false,
            message: "HWID não registrado",
          });
        }

        try {
          // Processar heartbeat usando o sistema existente
          const { processHeartbeat } = await import("./license-simple");
          const result = await processHeartbeat(user.id, hwid);

          if (result.success) {
            const updatedUser = await storage.getUser(user.id);
            res.json({
              valid: true,
              remainingMinutes: result.remainingMinutes,
              message: result.message,
              timeRemaining: {
                totalMinutes: updatedUser?.license_remaining_minutes || 0,
                days: Math.floor(
                  (updatedUser?.license_remaining_minutes || 0) / (24 * 60),
                ),
                hours: Math.floor(
                  ((updatedUser?.license_remaining_minutes || 0) % (24 * 60)) /
                    60,
                ),
                minutes: (updatedUser?.license_remaining_minutes || 0) % 60,
              },
            });
          } else {
            res.json({
              valid: false,
              message: result.message,
            });
          }
        } catch (heartbeatError) {
          console.error(
            "[LOADER] Erro no processamento do heartbeat:",
            heartbeatError,
          );
          res.json({
            valid: false,
            message: "Erro ao processar heartbeat",
          });
        }
      } catch (error) {
        console.error("[LOADER] Erro no heartbeat:", error);
        res.status(500).json({
          valid: false,
          message: "Erro interno do servidor",
        });
      }
    },
  );

  // Endpoint de teste para simular licença ativa (apenas para desenvolvimento)
  app.post(
    "/api/test/create-test-license",
    rateLimit(5, 60 * 1000),
    async (req, res) => {
      try {
        const { hwid, email, plan = "test", durationMinutes = 30 } = req.body;

        if (!hwid || !email) {
          return res.status(400).json({
            message: "HWID e email são obrigatórios",
          });
        }

        // Buscar ou criar usuário
        let user = (await storage.getAllUsers()).find((u) => u.email === email);

        if (!user) {
          // Criar usuário de teste
          const newUser = await storage.createUser({
            email,
            password: "test123", // Hash será aplicado automaticamente
            firstName: "Test",
            lastName: "User",
            username: email.split("@")[0],
          });
          user = newUser;
        }

        // Ativar licença
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

        await storage.updateUser(user.id, {
          hwid,
          license_status: "ativa",
          license_plan: plan,
          license_expires_at: expiresAt,
          license_remaining_minutes: durationMinutes,
          license_total_minutes: durationMinutes,
          license_activated_at: now,
        });

        res.json({
          success: true,
          message: "Licença de teste criada com sucesso",
          user: {
            email: user.email,
            hwid,
            license_status: "ativa",
            license_plan: plan,
            license_expires_at: expiresAt,
            license_remaining_minutes: durationMinutes,
          },
        });
      } catch (error) {
        console.error("[TEST] Erro ao criar licença de teste:", error);
        res.status(500).json({
          message: "Erro interno do servidor",
        });
      }
    },
  );



  // Admin dashboard data
  app.get(
    "/api/admin/dashboard",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const stats = await storage.getSystemStats();
        const users = await storage.getAllUsers();
        const payments = await storage.getAllPayments();

        // Buscar configurações do sistema do Supabase
        const downloadUrlSetting =
          await storage.getSystemSetting("download_url");
        const downloadUrl = downloadUrlSetting?.value || "";

        console.log(
          `[ADMIN DASHBOARD] Download URL do Supabase: ${downloadUrl}`,
        );

        res.json({
          stats,
          users: users.map((u) => ({
            ...u,
            password: undefined, // Remove senha da resposta
            isAdmin: u.is_admin, // Corrigir nome do campo
          })),
          payments,
          settings: {
            downloadUrl,
          },
        });
      } catch (error) {
        console.error("Admin dashboard error:", error);
        res
          .status(500)
          .json({ message: "Erro ao carregar dashboard administrativo" });
      }
    },
  );

  // Admin - Atualizar usuário
  app.patch(
    "/api/admin/users/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const userId = req.params.id;
        const updates = updateUserSchema.parse(req.body);

        // Converter isAdmin para is_admin se necessário
        const dbUpdates: any = { ...updates };
        if ("isAdmin" in updates) {
          dbUpdates.is_admin = updates.isAdmin;
          delete dbUpdates.isAdmin;
        }

        const updatedUser = await storage.updateUser(userId, dbUpdates);

        res.json({
          ...updatedUser,
          password: undefined,
          isAdmin: updatedUser.is_admin,
        });
      } catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({ message: "Erro ao atualizar usuário" });
      }
    },
  );

  // Admin - Deletar usuário
  app.delete(
    "/api/admin/users/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const userId = req.params.id;
        const currentUser = req.user as any;

        if (userId === currentUser.id) {
          return res
            .status(400)
            .json({ message: "Não é possível deletar sua própria conta" });
        }

        await storage.deleteUser(userId);
        res.json({ message: "Usuário deletado com sucesso" });
      } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Erro ao deletar usuário" });
      }
    },
  );

  // Admin - Atualizar licença de usuário
  app.patch(
    "/api/admin/users/:id/license",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const userId = req.params.id;
        const { status, daysRemaining, hoursRemaining, minutesRemaining } =
          req.body;

        const updates: any = {};

        if (status) {
          updates.license_status = status;
        }

        if (
          daysRemaining !== undefined ||
          hoursRemaining !== undefined ||
          minutesRemaining !== undefined
        ) {
          const days = daysRemaining || 0;
          const hours = hoursRemaining || 0;
          const minutes = minutesRemaining || 0;
          const totalMinutes = days * 24 * 60 + hours * 60 + minutes;

          updates.license_remaining_minutes = totalMinutes;
          updates.license_total_minutes = totalMinutes;

          if (totalMinutes > 0) {
            const now = new Date();
            updates.license_expires_at = new Date(
              now.getTime() + totalMinutes * 60 * 1000,
            );
          }
        }

        const updatedUser = await storage.updateUser(userId, updates);

        res.json({
          ...updatedUser,
          password: undefined,
          isAdmin: updatedUser.is_admin,
        });
      } catch (error) {
        console.error("Update license error:", error);
        res.status(500).json({ message: "Erro ao atualizar licença" });
      }
    },
  );

  // Password reset routes
  app.post(
    "/api/auth/forgot-password",
    rateLimit(3, 15 * 60 * 1000),
    async (req, res) => {
      try {
        const { email } = forgotPasswordSchema.parse(req.body);
        console.log(`[FORGOT PASSWORD] Processing request for: ${email}`);

        // Check if user exists
        const user = await storage.getUserByEmail(email);
        console.log(`[FORGOT PASSWORD] User found: ${!!user}`);

        if (!user) {
          console.log(
            `[FORGOT PASSWORD] User not found, returning standard message`,
          );
          return res.json({
            message:
              "Se o email existir em nosso sistema, você receberá instruções de redefinição.",
          });
        }

        // Generate reset token
        const crypto = await import("crypto");
        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Store reset token
        await storage.createPasswordResetToken({
          userId: user.id,
          token: resetToken,
          expiresAt,
        });

        // Create reset URL - SEMPRE usar fovdark.shop em produção
        const baseUrl =
          process.env.NODE_ENV === "production"
            ? "https://fovdark.shop"
            : process.env.REPLIT_DEV_DOMAIN
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : "http://localhost:5000";

        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

        // Send reset email
        try {
          await sendPasswordResetEmail(email, resetToken);
          console.log(`Password reset email sent to: ${email}`);
          console.log(
            `Reset URL: https://fovdark.shop/reset-password?token=${resetToken}`,
          );
        } catch (emailError) {
          console.error("Email sending error:", emailError);
          // Still return success to not reveal if email exists
        }

        res.json({
          message:
            "Se o email existir em nosso sistema, você receberá instruções de redefinição.",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Email inválido", errors: error.errors });
        }
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Erro interno do servidor" });
      }
    },
  );

  app.post(
    "/api/auth/reset-password",
    rateLimit(5, 15 * 60 * 1000),
    async (req, res) => {
      try {
        console.log(`[RESET PASSWORD] Dados recebidos:`, req.body);

        const { token, password, confirmPassword } = resetPasswordSchema.parse(
          req.body,
        );
        console.log(
          `[RESET PASSWORD] Token: ${token}, Password length: ${password?.length}`,
        );

        // Verify reset token
        console.log(`[RESET PASSWORD] Verificando token no banco...`);
        const resetToken = await storage.getPasswordResetToken(token);
        console.log(`[RESET PASSWORD] Token encontrado:`, !!resetToken);

        if (!resetToken) {
          console.log(`[RESET PASSWORD] Token não encontrado ou expirado`);
          return res
            .status(400)
            .json({ message: "Token inválido ou expirado" });
        }

        console.log(
          `[RESET PASSWORD] Token válido, expira em:`,
          resetToken.expiresAt,
        );
        console.log(`[RESET PASSWORD] Token usado:`, resetToken.used);

        // Get user
        console.log(
          `[RESET PASSWORD] Buscando usuário com ID: ${resetToken.userId}`,
        );
        const user = await storage.getUser(resetToken.userId);
        console.log(`[RESET PASSWORD] Usuário encontrado:`, !!user);

        if (!user) {
          console.log(`[RESET PASSWORD] Usuário não encontrado para o token`);
          return res.status(400).json({ message: "Usuário não encontrado" });
        }

        // Update user password (plain text as per current system)
        console.log(
          `[RESET PASSWORD] Atualizando senha do usuário: ${user.email}`,
        );
        await storage.updateUser(user.id, { password: password });

        // Mark token as used
        console.log(`[RESET PASSWORD] Marcando token como usado`);
        await storage.markPasswordResetTokenAsUsed(token);

        // Clean up expired tokens
        console.log(`[RESET PASSWORD] Limpando tokens expirados`);
        await storage.deleteExpiredPasswordResetTokens();

        console.log(
          `[RESET PASSWORD] Password reset successful for user: ${user.email}`,
        );
        res.json({ message: "Senha redefinida com sucesso" });
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error(`[RESET PASSWORD] Erro de validação:`, error.errors);
          return res
            .status(400)
            .json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("[RESET PASSWORD] Erro geral:", error);
        res.status(500).json({ message: "Erro interno do servidor" });
      }
    },
  );

  // Endpoint de teste para criar token de reset válido
  app.post("/api/debug/create-reset-token", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email é obrigatório" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Gerar token de reset
      const crypto = await import("crypto");
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Salvar token
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });

      // URL de reset
      const baseUrl = "https://fovdark.shop";
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      console.log(`[TEST PASSWORD RESET] Token gerado: ${resetToken}`);
      console.log(`[TEST PASSWORD RESET] URL de reset: ${resetUrl}`);

      res.json({
        success: true,
        message: "Token de reset gerado com sucesso",
        resetToken,
        resetUrl,
        expiresAt,
      });
    } catch (error) {
      console.error("[TEST PASSWORD RESET] Erro:", error);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Debug endpoint para verificar tokens de reset
  app.get("/api/debug/reset-tokens", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { passwordResetTokens, users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const tokens = await db
        .select({
          id: passwordResetTokens.id,
          token: passwordResetTokens.token,
          used: passwordResetTokens.used,
          expiresAt: passwordResetTokens.expiresAt,
          createdAt: passwordResetTokens.createdAt,
          userEmail: users.email,
        })
        .from(passwordResetTokens)
        .leftJoin(users, eq(passwordResetTokens.userId, users.id));

      res.json({ tokens });
    } catch (error) {
      console.error("[DEBUG] Erro ao buscar tokens:", error);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Change password route - FIXED ENDPOINT
  app.patch("/api/auth/password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword, confirmPassword } =
        changePasswordSchema.parse(req.body);

      console.log(`[CHANGE PASSWORD] Request for user: ${user.email}`);

      // Get current user from database
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Verify current password (plain text comparison as per current system)
      if (currentUser.password !== currentPassword) {
        console.log(
          `[CHANGE PASSWORD] Current password mismatch for user: ${user.email}`,
        );
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Update password
      await storage.updateUser(user.id, { password: newPassword });

      console.log(
        `[CHANGE PASSWORD] Password updated successfully for user: ${user.email}`,
      );
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("[CHANGE PASSWORD] Error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Legacy change password route for compatibility
  app.post("/api/users/change-password", isAuthenticated, async (req, res) => {
    try {
      console.log(
        `[CHANGE PASSWORD] Request received from user:`,
        req.user ? (req.user as any).id : "Not authenticated",
      );
      console.log(
        `[CHANGE PASSWORD] Request body keys:`,
        Object.keys(req.body),
      );

      const user = req.user as any;
      const { currentPassword, newPassword } = changePasswordSchema.parse(
        req.body,
      );

      // Get current user
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        console.log(`[CHANGE PASSWORD] User not found: ${user.id}`);
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      console.log(`[CHANGE PASSWORD] Current user found: ${currentUser.email}`);
      console.log(
        `[CHANGE PASSWORD] Comparing passwords - Current in DB: ${currentUser.password.substring(0, 5)}...`,
      );

      // Verify current password (plain text comparison)
      if (currentUser.password !== currentPassword) {
        console.log(
          `[CHANGE PASSWORD] Password mismatch for user: ${currentUser.email}`,
        );
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Update password (plain text)
      await storage.updateUser(user.id, { password: newPassword });

      console.log(
        `[CHANGE PASSWORD] Password changed successfully for user: ${currentUser.email}`,
      );
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.log(`[CHANGE PASSWORD] Validation error:`, error.errors);
        return res
          .status(400)
          .json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("[CHANGE PASSWORD] Unexpected error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Admin - Atualizar link de download (AGORA SALVA NO SUPABASE)
  app.post(
    "/api/admin/settings/download-url",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const { downloadUrl } = req.body;

        if (!downloadUrl || typeof downloadUrl !== "string") {
          return res
            .status(400)
            .json({ message: "URL de download é obrigatória" });
        }

        // Validar se é uma URL válida
        try {
          new URL(downloadUrl);
        } catch {
          return res.status(400).json({ message: "URL inválida" });
        }

        const user = req.user as any;
        console.log(
          `[ADMIN] Salvando link de download no Supabase por admin: ${user.email}`,
        );
        console.log(`[ADMIN] Novo link: ${downloadUrl}`);

        // Salvar diretamente no Supabase usando SQL
        const { db } = await import("./db");
        const { systemSettings } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        await db
          .update(systemSettings)
          .set({
            value: downloadUrl,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.key, "download_url"));

        console.log(`[ADMIN] Link salvo com sucesso no Supabase!`);

        res.json({
          message: "Link de download atualizado com sucesso no Supabase",
          downloadUrl: downloadUrl,
        });
      } catch (error) {
        console.error("Update download URL error:", error);
        res.status(500).json({ message: "Erro ao atualizar link de download" });
      }
    },
  );

  // Endpoint de teste para validar sistema de senha
  app.post("/api/test/password-reset", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email é obrigatório" });
      }

      console.log(`[TEST PASSWORD RESET] Iniciando teste para: ${email}`);

      // Verificar se usuário existe
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Gerar token de reset
      const crypto = await import("crypto");
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Salvar token
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });

      // URL de reset
      const baseUrl = "https://fovdark.shop";
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      console.log(`[TEST PASSWORD RESET] Token gerado: ${resetToken}`);
      console.log(`[TEST PASSWORD RESET] URL de reset: ${resetUrl}`);

      res.json({
        success: true,
        message: "Token de reset gerado com sucesso",
        resetToken,
        resetUrl,
        expiresAt,
      });
    } catch (error) {
      console.error("[TEST PASSWORD RESET] Erro:", error);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Contact form endpoint
  app.post("/api/contact", rateLimit(5, 15 * 60 * 1000), async (req, res) => {
    try {
      console.log(
        `[CONTACT] Dados recebidos:`,
        JSON.stringify(req.body, null, 2),
      );

      // Validar se o body está presente e não está vazio
      if (!req.body || Object.keys(req.body).length === 0) {
        console.error(`[CONTACT] Body vazio ou inválido`);
        return res.status(400).json({
          message: "Dados não fornecidos",
          error: true,
        });
      }

      const contactData = contactSchema.parse(req.body);

      console.log(
        `[CONTACT] Nova mensagem de contato de: ${contactData.email}`,
      );
      console.log(`[CONTACT] Assunto: ${contactData.subject}`);

      // Enviar email usando o sistema existente
      const { sendContactEmail } = await import("./email");

      const emailResult = await sendContactEmail(
        contactData.email,
        contactData.name,
        contactData.subject,
        contactData.message,
      );

      if (emailResult.success) {
        console.log(
          `[CONTACT] Email enviado com sucesso para: ${contactData.email}`,
        );
        res.json({
          message:
            "Mensagem enviada com sucesso! Você receberá uma confirmação por email.",
          success: true,
        });
      } else {
        console.error(`[CONTACT] Erro ao enviar email:`, emailResult.error);
        res.status(500).json({
          message:
            "Erro ao enviar email. Tente novamente ou use nosso Discord.",
          error: true,
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`[CONTACT] Erro de validação:`, error.errors);
        return res.status(400).json({
          message: "Dados inválidos",
          errors: error.errors,
        });
      }
      console.error("Contact form error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  return server;
}
