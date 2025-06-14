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

      // Generate token
      const token = generateToken(user.id);

      res.status(201).json({
        message: "Usuário criado com sucesso",
        user: { ...user, password: undefined },
        token,
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
  app.post("/api/auth/login", rateLimit(10, 15 * 60 * 1000), (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
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

  // Logout route
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Falha no logout" });
      }
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  // Get current user
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      res.json({ ...fullUser, password: undefined });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Admin middleware
  const isAdmin: RequestHandler = (req, res, next) => {
    const user = req.user as any;
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
    }
    next();
  };

  // User dashboard data
  app.get("/api/dashboard", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userWithLicense = await storage.getUser(user.id);
      const license = await storage.getLicenseByUserId(user.id);
      const downloads = await storage.getUserDownloads(user.id);
      
      // Calculate stats
      const stats = {
        totalDownloads: downloads.length,
        licenseStatus: license ? license.status : "inactive",
        remainingTime: license ? {
          days: license.daysRemaining || 0,
          hours: license.hoursRemaining || 0,
          minutes: license.minutesRemaining || 0,
        } : null,
      };
      
      res.json({
        user: { ...userWithLicense, password: undefined },
        license,
        downloads,
        stats,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ message: "Falha ao carregar dados do dashboard" });
    }
  });

  // License activation
  app.post("/api/licenses/activate", isAuthenticated, async (req, res) => {
    try {
      const { key } = activateKeySchema.parse(req.body);
      const user = req.user as any;

      // Check if user already has an active license
      const existingLicense = await storage.getLicenseByUserId(user.id);
      if (existingLicense && existingLicense.status === "active") {
        return res.status(400).json({ message: "Usuário já possui uma licença ativa" });
      }

      // Get activation key
      const activationKey = await storage.getActivationKey(key);
      if (!activationKey) {
        return res.status(404).json({ message: "Chave de ativação inválida" });
      }

      if (activationKey.isUsed) {
        return res.status(400).json({ message: "Chave de ativação já foi utilizada" });
      }

      // Create license
      const licenseKey = `LIC-${Date.now()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
      const expiresAt = new Date();
      
      // Calculate expiration based on duration
      if (activationKey.plan === "test") {
        expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes for test
      } else {
        expiresAt.setDate(expiresAt.getDate() + activationKey.durationDays);
      }

      const totalMinutes = activationKey.plan === "test" ? 30 : activationKey.durationDays * 24 * 60;
      
      const license = await storage.createLicense({
        userId: user.id,
        key: licenseKey,
        plan: activationKey.plan,
        status: "pending", // Pending until HWID is set
        daysRemaining: activationKey.plan === "test" ? 0 : activationKey.durationDays,
        hoursRemaining: activationKey.plan === "test" ? 0 : 0,
        minutesRemaining: activationKey.plan === "test" ? 30 : 0,
        totalMinutesRemaining: totalMinutes,
        expiresAt,
      });

      // Mark activation key as used
      await storage.markActivationKeyAsUsed(key, user.id);

      res.json({ 
        message: "Licença ativada com sucesso! Use o loader para definir seu HWID.", 
        license: { ...license, key: licenseKey } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Activate license error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Download cheat
  app.get("/api/download/cheat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const license = await storage.getLicenseByUserId(user.id);

      if (!license) {
        return res.status(403).json({ message: "Nenhuma licença encontrada" });
      }

      if (license.status !== "active") {
        return res.status(403).json({ message: "Licença não está ativa" });
      }

      // Check if license is expired
      if (new Date() > license.expiresAt) {
        await storage.updateLicense(license.id, { status: "expired" });
        return res.status(403).json({ message: "Licença expirou" });
      }

      // Log download
      await storage.logDownload(user.id, license.id, "BloodStrike_Cheat.exe");

      // Get download URL from environment or use default
      const downloadUrl = process.env.DOWNLOAD_URL || "https://wgzpkqkpxobrpwmegrnm.supabase.co/storage/v1/object/public/downloads/BloodStrike_Cheat.exe";
      
      res.json({ 
        downloadUrl,
        fileName: "BloodStrike_Cheat.exe",
        message: "Download autorizado" 
      });
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Erro no download" });
    }
  });

  // 🔐 SECURE HWID UPDATE - Only allows HWID update if empty or null
  app.post("/api/licenses/update-hwid", rateLimit(10, 5 * 60 * 1000), async (req, res) => {
    try {
      const { licenseKey, hwid } = updateHwidSchema.parse(req.body);

      // Find license by key
      const license = await storage.getLicenseByKey(licenseKey);
      if (!license) {
        securityLog.logSuspiciousActivity(req.ip!, "invalid_license_key", { licenseKey });
        return res.status(404).json({ message: "Licença não encontrada" });
      }

      // Check if license is active
      if (license.status !== "active") {
        return res.status(400).json({ message: "Licença não está ativa" });
      }

      // Check if license is expired
      const isExpired = new Date() > license.expiresAt;
      if (isExpired) {
        await storage.updateLicense(license.id, { status: "expired" });
        return res.status(400).json({ message: "Licença expirada" });
      }

      // 🚫 CRITICAL SECURITY: Block HWID update if already set
      if (license.hwid && license.hwid.trim() !== "") {
        securityLog.logSuspiciousActivity(req.ip!, "blocked_hwid_change_attempt", {
          licenseId: license.id,
          currentHwid: license.hwid,
          attemptedHwid: hwid
        });
        return res.status(403).json({ 
          message: "HWID já vinculado. Use o endpoint de reset para alterar."
        });
      }

      // Update license with HWID (first time only)
      const updatedLicense = await storage.updateLicense(license.id, {
        hwid,
        lastHeartbeat: new Date()
      });

      // Log successful HWID binding
      await storage.createHwidResetLog({
        userId: license.userId,
        licenseId: license.id,
        oldHwid: null,
        newHwid: hwid,
        resetType: "auto",
        resetReason: "Initial HWID binding"
      });

      res.json({ 
        license: updatedLicense,
        message: "HWID vinculado com sucesso"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update HWID error:", error);
      res.status(500).json({ message: "Falha ao vincular HWID" });
    }
  });

  // 🕓 USER HWID RESET REQUEST (with 7-day cooldown)
  app.post("/api/licenses/request-hwid-reset", isAuthenticated, rateLimit(3, 24 * 60 * 60 * 1000), async (req, res) => {
    try {
      const user = req.user as any;
      const { licenseKey, reason } = resetHwidSchema.parse(req.body);

      // Find license
      const license = await storage.getLicenseByKey(licenseKey);
      if (!license || license.userId !== user.id) {
        return res.status(404).json({ message: "Licença não encontrada" });
      }

      // Check if reset is allowed (7-day cooldown)
      const canReset = await storage.canResetHwid(user.id, license.id);
      if (!canReset) {
        const lastReset = await storage.getLastHwidReset(user.id, license.id);
        const nextResetDate = new Date(lastReset!.createdAt);
        nextResetDate.setDate(nextResetDate.getDate() + 7);
        
        return res.status(429).json({ 
          message: "Reset de HWID permitido apenas 1x a cada 7 dias",
          nextResetDate: nextResetDate.toISOString()
        });
      }

      // Perform reset (clear HWID)
      const oldHwid = license.hwid;
      const updatedLicense = await storage.updateLicenseHwid(license.id, null);

      // Log the reset
      await storage.createHwidResetLog({
        userId: user.id,
        licenseId: license.id,
        oldHwid,
        newHwid: null,
        resetType: "manual",
        resetReason: reason
      });

      res.json({ 
        message: "HWID resetado com sucesso. Você pode vincular um novo HWID agora.",
        license: updatedLicense
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("HWID reset request error:", error);
      res.status(500).json({ message: "Falha ao resetar HWID" });
    }
  });

  // 🔐 ADMIN HWID RESET (support only)
  app.post("/api/admin/licenses/reset-hwid", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const admin = req.user as any;
      const { licenseId, reason, newHwid } = adminResetHwidSchema.parse(req.body);

      // Find license
      const license = await storage.getLicense(licenseId);
      if (!license) {
        return res.status(404).json({ message: "Licença não encontrada" });
      }

      // Perform reset
      const oldHwid = license.hwid;
      const updatedLicense = await storage.updateLicenseHwid(licenseId, newHwid || null);

      // Log the admin reset
      await storage.createHwidResetLog({
        userId: license.userId,
        licenseId,
        oldHwid,
        newHwid: newHwid || null,
        resetType: "support",
        resetReason: reason,
        adminId: admin.id
      });

      res.json({ 
        message: "HWID resetado pelo suporte",
        license: updatedLicense
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Admin HWID reset error:", error);
      res.status(500).json({ message: "Falha ao resetar HWID" });
    }
  });

  // 📊 GET HWID RESET HISTORY (admin only)
  app.get("/api/admin/licenses/:licenseId/hwid-history", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const licenseId = parseInt(req.params.licenseId);
      if (isNaN(licenseId)) {
        return res.status(400).json({ message: "ID de licença inválido" });
      }

      const history = await storage.getHwidResetHistory(licenseId);
      res.json(history);
    } catch (error) {
      console.error("Get HWID history error:", error);
      res.status(500).json({ message: "Falha ao buscar histórico" });
    }
  });

  // 🔐 SECURE LICENSE VALIDATION WITH HWID CHECK (FREQUENT DATABASE VERIFICATION)
  app.post("/api/licenses/validate", rateLimit(20, 60 * 1000), async (req, res) => {
    try {
      const { licenseKey, hwid } = z.object({
        licenseKey: z.string().min(1),
        hwid: z.string().min(1)
      }).parse(req.body);

      // FREQUENT DATABASE CHECK: Always fetch fresh data from database
      const license = await storage.getLicenseByKey(licenseKey);
      if (!license) {
        securityLog.logSuspiciousActivity(req.ip!, "invalid_license_validation", { licenseKey });
        return res.status(404).json({ message: "Licença não encontrada" });
      }

      // FREQUENT CHECK: Verify user still exists and is valid
      const user = await storage.getUser(license.userId);
      if (!user) {
        securityLog.logSuspiciousActivity(req.ip!, "orphaned_license", { licenseId: license.id });
        return res.status(404).json({ message: "Usuário da licença não encontrado" });
      }

      // FREQUENT CHECK: Cross-validate license status in real-time
      if (license.status !== "active") {
        return res.status(400).json({ message: "Licença não está ativa" });
      }

      // FREQUENT CHECK: Real-time expiration verification
      const now = new Date();
      const isExpired = now > license.expiresAt;
      if (isExpired) {
        // Immediately update expired status in database
        await storage.updateLicense(license.id, { status: "expired" });
        return res.status(400).json({ message: "Licença expirada" });
      }

      // FREQUENT CHECK: Verify HWID hasn't been tampered with
      const freshLicenseCheck = await storage.getLicense(license.id);
      if (!freshLicenseCheck || freshLicenseCheck.hwid !== license.hwid) {
        securityLog.logSuspiciousActivity(req.ip!, "license_tampering_detected", {
          licenseId: license.id,
          originalHwid: license.hwid,
          currentHwid: freshLicenseCheck?.hwid
        });
        return res.status(403).json({ message: "Inconsistência detectada na licença" });
      }

      // 🔐 CRITICAL HWID VALIDATION WITH FREQUENT CHECK
      if (license.hwid && license.hwid !== hwid) {
        // Additional check: Verify if HWID was recently reset
        const recentReset = await storage.getLastHwidReset(license.userId, license.id);
        if (recentReset && new Date(recentReset.createdAt).getTime() > (Date.now() - 5 * 60 * 1000)) {
          // If reset was within last 5 minutes, allow HWID to be empty for re-binding
          if (!license.hwid || license.hwid.trim() === "") {
            return res.json({
              valid: true,
              requiresHwidBinding: true,
              message: "HWID precisa ser vinculado novamente"
            });
          }
        }
        
        securityLog.logSuspiciousActivity(req.ip!, "hwid_mismatch", {
          licenseId: license.id,
          expectedHwid: license.hwid,
          providedHwid: hwid,
          userId: license.userId
        });
        return res.status(403).json({ message: "HWID não autorizado" });
      }

      // FREQUENT CHECK: Update heartbeat and verify timing consistency
      const lastHeartbeat = license.lastHeartbeat;
      const timeSinceLastHeartbeat = lastHeartbeat ? now.getTime() - new Date(lastHeartbeat).getTime() : 0;
      
      // Detect suspicious rapid requests (less than 10 seconds apart)
      if (timeSinceLastHeartbeat < 10000 && timeSinceLastHeartbeat > 0) {
        securityLog.logSuspiciousActivity(req.ip!, "rapid_validation_requests", {
          licenseId: license.id,
          timeBetweenRequests: timeSinceLastHeartbeat
        });
      }

      // Update heartbeat with database verification
      await storage.updateLicense(license.id, { lastHeartbeat: now });

      // FREQUENT CHECK: Verify the update was successful
      const updatedLicense = await storage.getLicense(license.id);
      if (!updatedLicense || !updatedLicense.lastHeartbeat) {
        securityLog.logSuspiciousActivity(req.ip!, "heartbeat_update_failed", { licenseId: license.id });
        return res.status(500).json({ message: "Falha na atualização do heartbeat" });
      }

      res.json({
        valid: true,
        license: {
          id: license.id,
          plan: license.plan,
          status: license.status,
          expiresAt: license.expiresAt,
          daysRemaining: license.daysRemaining,
          hoursRemaining: license.hoursRemaining,
          minutesRemaining: license.minutesRemaining,
          lastVerified: now.toISOString()
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("License validation error:", error);
      res.status(500).json({ message: "Falha na validação" });
    }
  });

  // 🕐 FREQUENT DATABASE INTEGRITY CHECK ENDPOINT
  app.post("/api/licenses/heartbeat", rateLimit(30, 60 * 1000), async (req, res) => {
    try {
      const { licenseKey, hwid } = heartbeatSchema.parse(req.body);

      // Fresh database lookup every time
      const license = await storage.getLicenseByKey(licenseKey);
      if (!license) {
        return res.status(404).json({ message: "Licença não encontrada" });
      }

      // Real-time status verification
      if (license.status !== "active") {
        return res.status(400).json({ 
          message: "Licença inativa",
          status: license.status 
        });
      }

      // Continuous expiration monitoring
      const now = new Date();
      if (now > license.expiresAt) {
        await storage.updateLicense(license.id, { status: "expired" });
        return res.status(400).json({ message: "Licença expirou" });
      }

      // HWID consistency check
      if (license.hwid !== hwid) {
        securityLog.logSuspiciousActivity(req.ip!, "heartbeat_hwid_mismatch", {
          licenseId: license.id,
          expectedHwid: license.hwid,
          providedHwid: hwid
        });
        return res.status(403).json({ message: "HWID inválido" });
      }

      // Time decrement with database verification
      const updatedLicense = await storage.updateLicenseHeartbeat(licenseKey, hwid);
      if (!updatedLicense) {
        return res.status(500).json({ message: "Falha na atualização" });
      }

      // Double-check the update was applied correctly
      const verificationLicense = await storage.getLicense(license.id);
      if (!verificationLicense) {
        securityLog.logSuspiciousActivity(req.ip!, "license_disappeared", { licenseId: license.id });
        return res.status(500).json({ message: "Erro crítico: licença não encontrada após atualização" });
      }

      res.json({
        valid: true,
        timeRemaining: {
          days: updatedLicense.daysRemaining,
          hours: updatedLicense.hoursRemaining,
          minutes: updatedLicense.minutesRemaining,
          totalMinutes: updatedLicense.totalMinutesRemaining
        },
        status: updatedLicense.status,
        nextCheckIn: new Date(Date.now() + 60000).toISOString() // Next check in 1 minute
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Heartbeat error:", error);
      res.status(500).json({ message: "Falha no heartbeat" });
    }
  });

  // Admin dashboard data
  app.get("/api/admin/dashboard", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await storage.getSystemStats();
      const users = await storage.getAllUsers();
      const licenses = await storage.getAllLicenses();
      const activationKeys = await storage.getAllActivationKeys();
      const payments = await storage.getAllPayments();

      res.json({
        stats,
        users: users.map(u => ({ ...u, password: undefined })),
        licenses,
        activationKeys,
        payments,
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);
      res.status(500).json({ message: "Erro ao carregar dashboard administrativo" });
    }
  });

  // Admin - Create activation keys
  app.post("/api/admin/keys", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { plan, durationDays, quantity } = createActivationKeySchema.parse(req.body);
      
      const keys = [];
      for (let i = 0; i < quantity; i++) {
        const key = `FOVD-${plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const activationKey = await storage.createActivationKey({
          key,
          plan,
          durationDays,
        });
        keys.push(activationKey);
      }

      res.json({
        message: `${quantity} chave(s) de ativação criada(s) com sucesso`,
        keys,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Create keys error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Admin - Delete user
  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteUser(id);
      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Erro ao excluir usuário" });
    }
  });

  // Admin - Delete license
  app.delete("/api/admin/licenses/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLicense(id);
      res.json({ message: "Licença excluída com sucesso" });
    } catch (error) {
      console.error("Delete license error:", error);
      res.status(500).json({ message: "Erro ao excluir licença" });
    }
  });

  // Admin - Update license
  app.patch("/api/admin/licenses/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = updateLicenseSchema.parse(req.body);
      
      const license = await storage.updateLicense(id, updates);
      res.json({ message: "Licença atualizada com sucesso", license });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update license error:", error);
      res.status(500).json({ message: "Erro ao atualizar licença" });
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

  // MercadoPago webhook
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      console.log("=== WEBHOOK MERCADO PAGO RECEBIDO ===");
      console.log("Headers:", req.headers);
      console.log("Body:", JSON.stringify(req.body, null, 2));
      
      // Validate webhook data with flexible schema
      const webhookData = mercadoPagoWebhookSchema.parse(req.body);
      
      if (webhookData.type === "payment") {
        const paymentId = webhookData.data?.id;
        
        if (paymentId) {
          console.log(`Processando pagamento ID: ${paymentId}`);
          
          // Get payment info from MercadoPago
          const { getPaymentInfo } = await import("./mercado-pago");
          const paymentInfo = await getPaymentInfo(paymentId);
          
          console.log("Informações do pagamento:", JSON.stringify(paymentInfo, null, 2));
          
          if (paymentInfo && paymentInfo.status === "approved") {
            console.log(`Pagamento aprovado! External Reference: ${paymentInfo.external_reference}`);
            
            // Find payment in database
            const payment = await storage.getPaymentByExternalReference(paymentInfo.external_reference || "");
            
            if (payment) {
              console.log(`Pagamento encontrado no banco: ID ${payment.id}, Status atual: ${payment.status}`);
              
              // Check if payment is already processed
              if (payment.status === "approved") {
                console.log("Pagamento já foi processado anteriormente");
                return res.status(200).json({ received: true, message: "Payment already processed" });
              }
              
              // Update payment status
              await storage.updatePayment(payment.id, {
                status: "approved",
                mercadoPagoId: paymentId,
                statusDetail: paymentInfo.status_detail,
              });

              // Create activation key and send email
              const activationKey = `FOVD-${payment.plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
              
              console.log(`Criando chave de ativação: ${activationKey}`);
              
              await storage.createActivationKey({
                key: activationKey,
                plan: payment.plan,
                durationDays: payment.durationDays,
              });

              // CRIAR/ATUALIZAR LICENÇA AUTOMATICAMENTE
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
                  
                  console.log(`Licença renovada até: ${newExpiryDate.toISOString()}`);
                  
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
                  
                  console.log(`Nova licença criada até: ${expiryDate.toISOString()}`);
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
              console.error(`❌ Pagamento não encontrado no banco com external_reference: ${paymentInfo.external_reference}`);
            }
          } else {
            console.log(`Pagamento não aprovado. Status: ${paymentInfo?.status || 'unknown'}`);
          }
        } else {
          console.log("ID do pagamento não encontrado no webhook");
        }
      } else {
        console.log(`Tipo de webhook ignorado: ${webhookData.type}`);
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

  // Test webhook processing manually
  app.post("/api/test-webhook", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Simulate a successful payment webhook
      const testPaymentId = `test_payment_${Date.now()}`;
      const testExternalRef = `test_${Date.now()}`;
      
      // Create a test payment first
      const testPayment = await storage.createPayment({
        userId: user.id,
        preferenceId: `test_pref_${Date.now()}`,
        externalReference: testExternalRef,
        status: "pending",
        transactionAmount: 500, // R$ 5,00
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
        mercadoPagoId: testPaymentId,
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
          testPaymentId
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
          testPaymentId
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

  // Check payment and license status
  app.get("/api/debug/payment-status/:userId", isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const currentUser = req.user as any;
      
      // Only allow users to check their own status or admins to check any
      if (currentUser.id !== userId && !currentUser.isAdmin) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const payments = await storage.getUserPayments(userId);
      const license = await storage.getLicenseByUserId(userId);
      const user = await storage.getUser(userId);
      
      res.json({
        user: {
          id: user?.id,
          email: user?.email,
          username: user?.username
        },
        license: license ? {
          id: license.id,
          key: license.key,
          plan: license.plan,
          status: license.status,
          expiresAt: license.expiresAt,
          totalMinutesRemaining: license.totalMinutesRemaining,
          isExpired: new Date() > new Date(license.expiresAt)
        } : null,
        payments: payments.map(p => ({
          id: p.id,
          status: p.status,
          plan: p.plan,
          transactionAmount: p.transactionAmount,
          externalReference: p.externalReference,
          mercadoPagoId: p.mercadoPagoId,
          createdAt: p.createdAt
        })),
        summary: {
          totalPayments: payments.length,
          approvedPayments: payments.filter(p => p.status === "approved").length,
          pendingPayments: payments.filter(p => p.status === "pending").length,
          hasActiveLicense: license?.status === "active" && new Date() < new Date(license.expiresAt),
        }
      });
    } catch (error) {
      console.error("Erro ao verificar status:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Test Mercado Pago credentials
  app.get("/api/test-mercadopago", async (req, res) => {
    try {
      const testPaymentData = createPixPaymentSchema.parse({
        plan: "test",
        durationDays: 0.021,
        payerEmail: "test@fovdark.com",
        payerFirstName: "Test",
        payerLastName: "User"
      });

      const pixResponse = await createPixPayment({
        userId: 999,
        ...testPaymentData
      });

      res.json({
        status: "success",
        message: "Mercado Pago está funcionando corretamente",
        data: {
          preferenceId: pixResponse.preferenceId,
          hasPixQr: !!pixResponse.pixQrCode,
          amount: pixResponse.transactionAmount,
          currency: pixResponse.currency
        }
      });
    } catch (error) {
      console.error("Erro ao testar Mercado Pago:", error);
      res.status(500).json({
        status: "error",
        message: "Erro na integração com Mercado Pago",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Payment status check by external reference
  app.get("/api/payments/check-status", isAuthenticated, async (req, res) => {
    try {
      const { ref } = req.query;
      
      if (!ref || typeof ref !== 'string') {
        return res.status(400).json({ message: "Referência externa é obrigatória" });
      }

      // Find payment in database by external reference
      const payment = await storage.getPaymentByExternalReference(ref);
      
      if (!payment) {
        return res.status(404).json({ message: "Pagamento não encontrado" });
      }

      res.json({
        status: payment.status,
        statusDetail: payment.statusDetail,
        transactionAmount: payment.transactionAmount,
        plan: payment.plan,
        durationDays: payment.durationDays
      });
    } catch (error) {
      console.error("Error checking payment status:", error);
      res.status(500).json({ message: "Erro ao verificar status do pagamento" });
    }
  });

  // Payment status check by payment ID
  app.get("/api/payments/:paymentId/status", isAuthenticated, async (req, res) => {
    try {
      const { paymentId } = req.params;
      const paymentInfo = await getPaymentInfo(paymentId);
      
      if (!paymentInfo) {
        return res.status(404).json({ message: "Pagamento não encontrado" });
      }

      res.json({
        status: paymentInfo.status,
        statusDetail: paymentInfo.status_detail,
        transactionAmount: paymentInfo.transaction_amount,
        dateCreated: paymentInfo.date_created,
        dateApproved: paymentInfo.date_approved
      });
    } catch (error) {
      console.error("Error checking payment status:", error);
      res.status(500).json({ message: "Erro ao verificar status do pagamento" });
    }
  });

  // User settings routes
  app.patch("/api/users/profile", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const updates = updateUserSchema.parse(req.body);
      
      const updatedUser = await storage.updateUser(user.id, updates);
      res.json({ 
        message: "Perfil atualizado com sucesso", 
        user: { ...updatedUser, password: undefined } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Erro ao atualizar perfil" });
    }
  });

  app.post("/api/users/change-password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      
      // Verify current password
      const dbUser = await storage.getUser(user.id);
      if (!dbUser || !dbUser.password) {
        return res.status(400).json({ message: "Senha não encontrada" });
      }
      
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, dbUser.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      await storage.updateUser(user.id, { password: hashedPassword });
      
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Change password error:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // Contact form route
  app.post("/api/contact", async (req, res) => {
    try {
      const contactData = contactSchema.parse(req.body);
      console.log(`[CONTACT] New message from: ${contactData.email}`);
      
      // Configure email transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.hostinger.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false
        },
      });

      // Email to support team
      const supportMailOptions = {
        from: process.env.SMTP_USER,
        to: 'contato@suportefovdark.shop',
        subject: `[FovDark Support] ${contactData.subject}`,
        html: `
          <h2>Nova mensagem de contato</h2>
          <p><strong>Nome:</strong> ${contactData.name}</p>
          <p><strong>Email:</strong> ${contactData.email}</p>
          <p><strong>Assunto:</strong> ${contactData.subject}</p>
          <p><strong>Mensagem:</strong></p>
          <p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${contactData.message}</p>
          <hr>
          <p><small>Enviado através do formulário de contato do FovDark</small></p>
        `,
      };

      // Confirmation email to user
      const userMailOptions = {
        from: process.env.SMTP_USER,
        to: contactData.email,
        subject: 'Confirmação - Mensagem recebida pela FovDark',
        html: `
          <h2>Obrigado pelo contato!</h2>
          <p>Olá ${contactData.name},</p>
          <p>Recebemos sua mensagem sobre: <strong>${contactData.subject}</strong></p>
          <p>Nossa equipe analisará sua solicitação e responderá em breve através deste email.</p>
          <p>Tempo médio de resposta: 24 horas</p>
          <hr>
          <p>Atenciosamente,<br>Equipe FovDark<br>contato@suportefovdark.shop</p>
        `,
      };

      try {
        // Send both emails
        await Promise.all([
          transporter.sendMail(supportMailOptions),
          transporter.sendMail(userMailOptions)
        ]);
        
        console.log(`[CONTACT] Emails sent successfully for: ${contactData.email}`);
        res.json({ 
          message: "Mensagem enviada com sucesso! Você receberá uma confirmação por email.",
          success: true 
        });
      } catch (emailError) {
        console.error('Contact email sending error:', emailError);
        res.status(500).json({ 
          message: "Erro ao enviar email. Tente novamente ou envie diretamente para contato@suportefovdark.shop",
          error: true 
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dados inválidos", 
          errors: error.errors 
        });
      }
      console.error("Contact form error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  const server = createServer(app);
  return server;
}