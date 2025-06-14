import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken, verifyToken } from "./auth";
import { registerSchema, createUserSchema, loginSchema, activateKeySchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, contactSchema, licenseStatusSchema, heartbeatSchema, createActivationKeySchema, updateUserSchema, updateLicenseSchema, createPixPaymentSchema, mercadoPagoWebhookSchema, updateHwidSchema, resetHwidSchema, adminResetHwidSchema } from "@shared/schema";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createPixPayment, PLAN_PRICES } from "./mercado-pago";
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

  const server = createServer(app);
  return server;
}