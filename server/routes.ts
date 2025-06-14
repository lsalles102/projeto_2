import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken, verifyToken } from "./auth";
import { registerSchema, createUserSchema, loginSchema, activateKeySchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, contactSchema, licenseStatusSchema, heartbeatSchema, createActivationKeySchema, updateUserSchema, updateLicenseSchema, createPixPaymentSchema, mercadoPagoWebhookSchema } from "@shared/schema";
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
      // Test database connection
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

  // Test Mercado Pago credentials
  app.get("/api/test-mercadopago", async (req, res) => {
    try {
      const testPaymentData = createPixPaymentSchema.parse({
        plan: "7days",
        durationDays: 7,
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
          amount: pixResponse.transactionAmount / 100,
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

  // Test email connection endpoint
  app.get("/api/test-email", async (req, res) => {
    try {
      const { testEmailConnection } = await import("./email");
      const isConnected = await testEmailConnection();
      
      res.json({
        status: isConnected ? "connected" : "error",
        timestamp: new Date().toISOString(),
        message: isConnected ? "Conexão de email funcionando" : "Erro na conexão de email"
      });
    } catch (error) {
      console.error("Email test error:", error);
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        message: "Falha ao testar conexão de email",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Setup authentication
  await setupAuth(app);

  // Auth routes with rate limiting
  app.post("/api/auth/register", rateLimit(5, 15 * 60 * 1000), async (req, res) => { // 5 attempts per 15 minutes
    try {
      const userData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Usuário já existe" });
      }

      // Hash password before storing
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      
      // Generate username from first and last name with sanitization
      const username = `${userData.firstName}${userData.lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 50); // Limit length
      
      const user = await storage.createUser({
        ...userData,
        username,
        password: hashedPassword,
      });

      // Generate JWT token
      const token = generateToken(user.id);
      
      // Log the user in
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Falha no login após registro" });
        }
        res.json({ user: { ...user, password: undefined }, token });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Registration error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ message: "Falha no registro" });
    }
  });

  app.post("/api/auth/login", rateLimit(10, 15 * 60 * 1000), (req, res, next) => { // 10 attempts per 15 minutes
    try {
      loginSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
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

  // Google auth routes disabled - requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
  app.get("/api/auth/google", (req, res) => {
    res.status(503).json({ message: "Google authentication not configured" });
  });

  app.get("/api/auth/google/callback", (req, res) => {
    res.redirect("/login?error=google_not_configured");
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Falha no logout" });
      }
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  app.get("/api/auth/user", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Não autorizado" });
      }
      
      const user = req.user as any;
      const userWithLicense = await storage.getUser(user.id);
      const license = await storage.getLicenseByUserId(user.id);
      
      res.json({
        ...userWithLicense,
        password: undefined,
        license,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(401).json({ message: "Não autorizado" });
    }
  });

  // Update profile route
  app.patch("/api/auth/profile", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const updateData = z.object({
        firstName: z.string().min(1, "Nome é obrigatório"),
        lastName: z.string().min(1, "Sobrenome é obrigatório"),
        email: z.string().email("Email inválido"),
      }).parse(req.body);

      // Check if email is already in use by another user
      if (updateData.email !== user.email) {
        const existingUser = await storage.getUserByEmail(updateData.email);
        if (existingUser && existingUser.id !== user.id) {
          return res.status(400).json({ message: "Este email já está em uso" });
        }
      }

      const updatedUser = await storage.updateUser(user.id, updateData);
      res.json({ 
        user: { ...updatedUser, password: undefined },
        message: "Perfil atualizado com sucesso" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Erro ao atualizar perfil" });
    }
  });

  // Change password route
  app.patch("/api/auth/password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const passwordData = z.object({
        currentPassword: z.string().min(1, "Senha atual é obrigatória"),
        newPassword: z.string().min(6, "Nova senha deve ter pelo menos 6 caracteres"),
        confirmPassword: z.string().min(1, "Confirmação de senha é obrigatória"),
      }).refine(data => data.newPassword === data.confirmPassword, {
        message: "As senhas não coincidem",
        path: ["confirmPassword"],
      }).parse(req.body);

      // Get current user with password
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(passwordData.currentPassword, currentUser.password || "");
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(passwordData.newPassword, 12);

      // Update password
      await storage.updateUser(user.id, { password: hashedNewPassword });

      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Change password error:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // Dashboard route
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

  // License routes
  app.post("/api/licenses/activate", isAuthenticated, async (req, res) => {
    try {
      const { key } = activateKeySchema.parse(req.body);
      const user = req.user as any;

      // Check if user already has an active license
      const existingLicense = await storage.getLicenseByUserId(user.id);
      if (existingLicense && existingLicense.status === "active") {
        return res.status(400).json({ message: "Usuário já possui uma licença ativa" });
      }

      // Validate activation key
      const activationKey = await storage.getActivationKey(key);
      if (!activationKey || activationKey.isUsed) {
        return res.status(400).json({ message: "Chave de ativação inválida ou já utilizada" });
      }

      // Create license with correct duration and time tracking (HWID will be set by loader)
      const totalMinutes = activationKey.durationDays * 24 * 60;
      const daysRemaining = Math.floor(totalMinutes / (24 * 60));
      const hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
      const minutesRemaining = totalMinutes % 60;
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + activationKey.durationDays);

      const license = await storage.createLicense({
        userId: user.id,
        key,
        plan: activationKey.plan,
        status: "pending", // Status pending until HWID is set by loader
        hwid: null, // Will be set by loader
        daysRemaining,
        hoursRemaining,
        minutesRemaining,
        totalMinutesRemaining: totalMinutes,
        expiresAt,
        activatedAt: new Date(),
      });

      // Mark activation key as used
      await storage.markActivationKeyAsUsed(key, user.id);

      res.json({ 
        license,
        message: "Licença ativada com sucesso! Use o loader para vincular ao seu PC."
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("License activation error:", error);
      res.status(500).json({ message: "Falha na ativação da licença" });
    }
  });

  // Route for loader to set HWID and activate license
  app.post("/api/licenses/set-hwid", async (req, res) => {
    try {
      const { licenseKey, hwid, userId } = z.object({
        licenseKey: z.string().min(1),
        hwid: z.string().min(1),
        userId: z.number()
      }).parse(req.body);

      // Find license by key and user
      const license = await storage.getLicenseByUserId(userId);
      if (!license || license.key !== licenseKey) {
        return res.status(404).json({ message: "Licença não encontrada" });
      }

      if (license.status !== "pending") {
        return res.status(400).json({ message: "Licença já foi ativada" });
      }

      // Update license with HWID and activate
      const updatedLicense = await storage.updateLicense(license.id, {
        hwid,
        status: "active",
        lastHeartbeat: new Date()
      });

      // Update user HWID
      await storage.updateUser(userId, { hwid });

      res.json({ 
        license: updatedLicense,
        message: "HWID vinculado e licença ativada com sucesso"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Set HWID error:", error);
      res.status(500).json({ message: "Falha ao vincular HWID" });
    }
  });

  // Route for loader to update HWID for existing active license
  app.post("/api/licenses/update-hwid", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { hwid } = z.object({
        hwid: z.string().min(1)
      }).parse(req.body);

      // Find user's active license
      const license = await storage.getLicenseByUserId(user.id);
      if (!license) {
        return res.status(404).json({ message: "Nenhuma licença encontrada" });
      }

      if (license.status !== "active") {
        return res.status(400).json({ message: "Licença não está ativa" });
      }

      // Check if license is expired
      const isExpired = new Date() > license.expiresAt;
      if (isExpired) {
        await storage.updateLicense(license.id, { status: "expired" });
        return res.status(400).json({ message: "Licença expirada" });
      }

      // If license already has a different HWID, check if we should allow update
      if (license.hwid && license.hwid !== hwid) {
        // For security, we can be strict about HWID changes
        // But for now, allow updates for better user experience
        console.log(`HWID change detected for user ${user.id}: ${license.hwid} -> ${hwid}`);
      }

      // Update license with new HWID and heartbeat
      const updatedLicense = await storage.updateLicense(license.id, {
        hwid,
        lastHeartbeat: new Date()
      });

      // Also update user HWID
      await storage.updateUser(user.id, { hwid });

      res.json({ 
        license: updatedLicense,
        message: "HWID atualizado com sucesso"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update HWID error:", error);
      res.status(500).json({ message: "Falha ao atualizar HWID" });
    }
  });

  app.get("/api/licenses/validate", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const license = await storage.getLicenseByUserId(user.id);

      if (!license) {
        return res.status(404).json({ message: "Nenhuma licença encontrada" });
      }

      // Check if license is expired
      const isExpired = new Date() > license.expiresAt;
      if (isExpired && license.status === "active") {
        await storage.updateLicense(license.id, { status: "expired" });
        license.status = "expired";
      }

      res.json({ license, isValid: license.status === "active" && !isExpired });
    } catch (error) {
      console.error("License validation error:", error);
      res.status(500).json({ message: "Falha na validação da licença" });
    }
  });

  // Download routes
  app.get("/api/download/cheat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      console.log("Download request from user:", user.id, user.email);
      
      const license = await storage.getLicenseByUserId(user.id);
      console.log("User license:", license ? { id: license.id, status: license.status, expiresAt: license.expiresAt } : "No license found");

      if (!license || license.status !== "active") {
        return res.status(403).json({ message: "Licença ativa necessária para download" });
      }

      // Check if license is expired
      const now = new Date();
      const isExpired = now > license.expiresAt;
      if (isExpired) {
        await storage.updateLicense(license.id, { status: "expired" });
        return res.status(403).json({ message: "Licença expirada" });
      }

      // Log the download
      const fileName = "FovDarkloader.exe";
      await storage.logDownload(user.id, license.id, fileName);

      // Use direct Supabase Storage link (can be configured via environment variable)
      const supabaseDownloadUrl = process.env.DOWNLOAD_URL || "https://tkghgqliyjtovttpuael.supabase.co/storage/v1/object/sign/arquivos/FovDarkloader.exe?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYzBjODc1ZS05NThmLTQyMGMtYjY3OS1lNDkxYTdmNmNhZWMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhcnF1aXZvcy9Gb3ZEYXJrbG9hZGVyLmV4ZSIsImlhdCI6MTc0OTkyMDMzNCwiZXhwIjoxNzgxNDU2MzM0fQ.C0hNoVrwxINjd_bve57G0bYCD7HdRBuQrm62ICq3o5g";
      
      res.json({
        message: "Download autorizado",
        fileName,
        downloadUrl: supabaseDownloadUrl,
        version: "2.4.1",
        size: "26.5 MB",
      });
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Falha no download" });
    }
  });

  // Secure file download endpoint
  app.get("/api/download/file/:token/:filename", async (req, res) => {
    try {
      const { token, filename } = req.params;
      
      // Verify token
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ message: "Invalid download token" });
      }

      // Verify user has active license
      const license = await storage.getLicenseByUserId(decoded.userId);
      if (!license || license.status !== 'active') {
        return res.status(403).json({ message: "No active license" });
      }

      const path = require('path');
      const fs = require('fs');
      
      // Determinar caminho correto do arquivo baseado no ambiente
      let filePath;
      if (process.env.NODE_ENV === 'production') {
        filePath = path.join(process.cwd(), 'server', 'downloads', filename);
      } else {
        filePath = path.join(__dirname, 'downloads', filename);
      }
      
      console.log('Download file path:', filePath);
      console.log('File exists:', fs.existsSync(filePath));
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error('File not found at path:', filePath);
        return res.status(404).json({ message: "File not found" });
      }

      // Set headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Length', fs.statSync(filePath).size);
      
      // Send file with absolute path
      const absolutePath = path.resolve(filePath);
      console.log('Sending file from absolute path:', absolutePath);
      res.sendFile(absolutePath);
    } catch (error) {
      console.error("Secure download error:", error);
      res.status(500).json({ message: "Download failed" });
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

  // Admin dashboard data
  app.get("/api/admin/dashboard", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await storage.getSystemStats();
      const users = await storage.getAllUsers();
      const licenses = await storage.getAllLicenses();
      const activationKeys = await storage.getAllActivationKeys();

      res.json({
        stats,
        users: users.map(u => ({ ...u, password: undefined })),
        licenses,
        activationKeys,
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
          isUsed: false,
        });
        keys.push(activationKey);
      }

      res.json({ keys, message: `${quantity} chaves criadas com sucesso` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Key generation error:", error);
      res.status(500).json({ message: "Erro ao gerar chaves" });
    }
  });

  // Admin - Update user
  app.patch("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const updates = updateUserSchema.parse(req.body);
      
      const updatedUser = await storage.updateUser(userId, updates);
      res.json({ user: { ...updatedUser, password: undefined }, message: "Usuário atualizado" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update user error:", error);
      res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
  });

  // Admin - Update license
  app.patch("/api/admin/licenses/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      const updates = updateLicenseSchema.parse(req.body);
      
      // Calculate total minutes if time components are updated
      if (updates.daysRemaining !== undefined || updates.hoursRemaining !== undefined || updates.minutesRemaining !== undefined) {
        const days = updates.daysRemaining || 0;
        const hours = updates.hoursRemaining || 0;
        const minutes = updates.minutesRemaining || 0;
        (updates as any).totalMinutesRemaining = (days * 24 * 60) + (hours * 60) + minutes;
      }
      
      const updatedLicense = await storage.updateLicense(licenseId, updates);
      res.json({ license: updatedLicense, message: "Licença atualizada" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update license error:", error);
      res.status(500).json({ message: "Erro ao atualizar licença" });
    }
  });

  // Admin - Delete user
  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const currentUser = req.user as any;
      
      if (userId === currentUser.id) {
        return res.status(400).json({ message: "Não é possível deletar sua própria conta" });
      }
      
      await storage.deleteUser(userId);
      res.json({ message: "Usuário deletado com sucesso" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Erro ao deletar usuário" });
    }
  });

  // Admin - Delete license
  app.delete("/api/admin/licenses/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      await storage.deleteLicense(licenseId);
      res.json({ message: "Licença deletada com sucesso" });
    } catch (error) {
      console.error("Delete license error:", error);
      res.status(500).json({ message: "Erro ao deletar licença" });
    }
  });

  // Admin - Delete activation key
  app.delete("/api/admin/keys/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const keyId = parseInt(req.params.id);
      await storage.deleteActivationKey(keyId);
      res.json({ message: "Chave de ativação deletada com sucesso" });
    } catch (error) {
      console.error("Delete activation key error:", error);
      res.status(500).json({ message: "Erro ao deletar chave de ativação" });
    }
  });

  // Password reset routes
  app.post("/api/auth/forgot-password", async (req, res) => {
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

      // Create reset URL - Use Replit URL for correct routing
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      // Configure email transporter (SMTP)
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.hostinger.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false
        },
        debug: true, // Enable debug output
        logger: true // Log information in console
      });

      // Verify SMTP connection
      try {
        await transporter.verify();
        console.log('SMTP server ready to accept messages');
      } catch (verifyError) {
        console.error('SMTP verification failed:', verifyError);
      }

      // Send email
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Redefinição de senha - FovDark',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Redefinição de senha</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #1a1a1a; color: #00ff88; padding: 20px; text-align: center; }
              .content { background: #f9f9f9; padding: 30px; }
              .button { display: inline-block; background: #00ff88; color: #000; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { background: #e9e9e9; padding: 15px; text-align: center; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>FovDark</h1>
              </div>
              <div class="content">
                <h2>Redefinição de senha</h2>
                <p>Olá,</p>
                <p>Você solicitou a redefinição de sua senha. Clique no botão abaixo para redefinir sua senha:</p>
                <a href="${resetUrl}" class="button">Redefinir Senha</a>
                <p>Ou copie e cole este link no seu navegador:</p>
                <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 3px;">${resetUrl}</p>
                <p><strong>Este link expira em 15 minutos.</strong></p>
                <p>Se você não solicitou esta redefinição, ignore este email com segurança.</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Password reset email sent to: ${email}`);
        console.log(`Message ID: ${info.messageId}`);
        console.log(`Reset URL: ${resetUrl}`);
      } catch (emailError) {
        console.error('Email sending error:', emailError);
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

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);
      
      // Verify reset token
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Token inválido ou expirado" });
      }

      // Get user
      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(400).json({ message: "Usuário não encontrado" });
      }

      // Update user password (plain text)
      await storage.updateUser(user.id, { password: password });

      // Mark token as used
      await storage.markPasswordResetTokenAsUsed(token);

      // Clean up expired tokens
      await storage.deleteExpiredPasswordResetTokens();

      res.json({ message: "Senha redefinida com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // User dashboard data
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

  // Contact form route
  app.post("/api/contact", async (req, res) => {
    try {
      const contactData = contactSchema.parse(req.body);
      console.log(`[CONTACT] New message from: ${contactData.email}`);
      
      // Configure email transporter (same as password reset)
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
        to: process.env.SUPPORT_EMAIL || 'contato@suportefovdark.shop',
        subject: `[FovDark Support] ${contactData.subject}`,
        html: `
          <h2>Nova mensagem de contato</h2>
          <p><strong>Nome:</strong> ${contactData.name}</p>
          <p><strong>Email:</strong> ${contactData.email}</p>
          <p><strong>Assunto:</strong> ${contactData.subject}</p>
          <p><strong>Mensagem:</strong></p>
          <p>${contactData.message.replace(/\n/g, '<br>')}</p>
          <hr>
          <p><small>Enviado em: ${new Date().toLocaleString('pt-BR')}</small></p>
        `,
      };

      // Confirmation email to user
      const userMailOptions = {
        from: process.env.SMTP_USER,
        to: contactData.email,
        subject: 'Mensagem recebida - FovDark Support',
        html: `
          <h2>Obrigado por entrar em contato!</h2>
          <p>Olá ${contactData.name},</p>
          <p>Recebemos sua mensagem sobre: <strong>${contactData.subject}</strong></p>
          <p>Nossa equipe de suporte analisará sua solicitação e responderá em breve.</p>
          <p>Tempo médio de resposta: 24-48 horas</p>
          <hr>
          <p>Sua mensagem:</p>
          <p><em>${contactData.message}</em></p>
          <hr>
          <p>Atenciosamente,<br>Equipe FovDark</p>
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
          message: "Erro ao enviar email. Tente novamente ou use nosso Discord.",
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

  // HWID-based license system routes
  
  // Check license status by HWID (for loader)
  app.post("/api/licenses/status", async (req, res) => {
    try {
      const { hwid } = licenseStatusSchema.parse(req.body);
      
      const license = await storage.getLicenseByHwid(hwid);
      
      if (!license) {
        return res.status(404).json({ 
          message: "No active license found for this hardware", 
          valid: false 
        });
      }

      // Check if license has expired
      const now = new Date();
      if (license.status === 'expired' || license.expiresAt < now || (license.totalMinutesRemaining || 0) <= 0) {
        return res.json({
          message: "License expired",
          valid: false,
          timeRemaining: {
            days: 0,
            hours: 0,
            minutes: 0
          }
        });
      }

      res.json({
        valid: true,
        plan: license.plan,
        timeRemaining: {
          days: license.daysRemaining || 0,
          hours: license.hoursRemaining || 0,
          minutes: license.minutesRemaining || 0
        },
        expiresAt: license.expiresAt
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("License status check error:", error);
      res.status(500).json({ message: "License status check failed" });
    }
  });

  // Heartbeat endpoint (decrements time and updates last activity)
  app.post("/api/licenses/heartbeat", async (req, res) => {
    try {
      const { licenseKey, hwid } = heartbeatSchema.parse(req.body);
      
      const updatedLicense = await storage.updateLicenseHeartbeat(licenseKey, hwid);
      
      if (!updatedLicense) {
        return res.status(404).json({ 
          message: "License not found or invalid", 
          valid: false 
        });
      }

      // Return current status
      const valid = updatedLicense.status === 'active' && (updatedLicense.totalMinutesRemaining || 0) > 0;
      
      res.json({
        valid,
        timeRemaining: {
          days: updatedLicense.daysRemaining || 0,
          hours: updatedLicense.hoursRemaining || 0,
          minutes: updatedLicense.minutesRemaining || 0
        },
        status: updatedLicense.status
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("License heartbeat error:", error);
      res.status(500).json({ message: "License heartbeat failed" });
    }
  });

  // Admin endpoint to manually decrement time
  app.post("/api/admin/licenses/:id/decrement", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { minutes } = req.body;
      
      if (!minutes || minutes < 1) {
        return res.status(400).json({ message: "Invalid minutes value" });
      }

      const updatedLicense = await storage.decrementLicenseTime(parseInt(id), minutes);
      
      res.json({
        license: updatedLicense,
        message: `Decremented ${minutes} minutes from license`
      });
    } catch (error) {
      console.error("License time decrement error:", error);
      res.status(500).json({ message: "Time decrement failed" });
    }
  });

  // User profile update routes
  app.patch("/api/user/profile", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { username, email } = req.body;

      // Check if email is already taken by another user
      if (email !== user.email) {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== user.id) {
          return res.status(400).json({ message: "Email já está em uso" });
        }
      }

      const updatedUser = await storage.updateUser(user.id, { username, email });
      res.json({ user: { ...updatedUser, password: undefined } });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Erro ao atualizar perfil" });
    }
  });

  app.patch("/api/auth/password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword, confirmPassword } = changePasswordSchema.parse(req.body);

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, { password: hashedPassword });
      
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Password change error:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // PIX Payment routes
  app.post("/api/payments/pix/create", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const paymentData = createPixPaymentSchema.parse(req.body);

      // Verificar se o usuário já tem uma licença ativa (exceto para plano de teste)
      const existingLicense = await storage.getLicenseByUserId(user.id);
      if (existingLicense && existingLicense.status === "active" && (paymentData.plan as string) !== "test") {
        return res.status(400).json({ 
          message: "Você já possui uma licença ativa. Aguarde o vencimento para adquirir uma nova." 
        });
      }

      // Criar referência externa única
      const externalReference = `payment_${user.id}_${nanoid()}`;
      
      // Para plano de teste, ajustar durationDays para fins de processamento interno
      let adjustedDurationDays = paymentData.durationDays;
      if (paymentData.plan === 'test') {
        // O plano de teste usa 30 minutos, mas o durationDays pode vir como decimal
        adjustedDurationDays = 0.021; // 30 minutos = 0.021 dias
        console.log('🔧 Plano de teste detectado, ajustando durationDays para:', adjustedDurationDays);
      }
      
      // Criar preferência no Mercado Pago
      const pixResponse = await createPixPayment({
        userId: user.id,
        plan: paymentData.plan,
        durationDays: adjustedDurationDays,
        payerEmail: paymentData.payerEmail,
        payerFirstName: paymentData.payerFirstName,
        payerLastName: paymentData.payerLastName,
      });

      // Salvar pagamento no banco de dados
      const payment = await storage.createPayment({
        userId: user.id,
        externalReference: externalReference,
        preferenceId: pixResponse.preferenceId,
        status: 'pending',
        transactionAmount: pixResponse.transactionAmount,
        currency: pixResponse.currency,
        plan: paymentData.plan,
        durationDays: adjustedDurationDays, // Usar o valor ajustado para plano de teste
        payerEmail: paymentData.payerEmail,
        payerFirstName: paymentData.payerFirstName,
        payerLastName: paymentData.payerLastName,
        paymentMethodId: 'pix',
        pixQrCode: pixResponse.pixQrCode,
        pixQrCodeBase64: pixResponse.pixQrCodeBase64,
        notificationUrl: `${getBaseUrl()}/api/payments/webhook`,
      });

      res.json({
        paymentId: payment.id,
        preferenceId: pixResponse.preferenceId,
        initPoint: pixResponse.initPoint,
        pixQrCode: pixResponse.pixQrCode,
        pixQrCodeBase64: pixResponse.pixQrCodeBase64,
        amount: pixResponse.transactionAmount / 100, // Converter centavos para reais
        currency: pixResponse.currency,
        externalReference: externalReference,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("PIX payment creation error:", error);
      if (error instanceof Error) {
        console.error("Error stack:", error.stack);
        console.error("Error details:", {
          message: error.message,
          name: error.name,
          cause: error.cause
        });
        res.status(500).json({ message: "Erro ao criar pagamento PIX", error: error.message });
      } else {
        console.error("Unknown error:", error);
        res.status(500).json({ message: "Erro ao criar pagamento PIX", error: "Erro desconhecido" });
      }
    }
  });

  // Webhook do Mercado Pago
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      console.log('Webhook body recebido:', JSON.stringify(req.body, null, 2));
      console.log('Webhook headers:', JSON.stringify(req.headers, null, 2));
      
      // Verificar se o corpo da requisição tem os campos necessários
      if (!req.body || typeof req.body !== 'object') {
        console.warn('Webhook inválido - corpo vazio ou inválido');
        return res.status(200).send('OK'); // Retornar 200 para evitar re-tentativas
      }

      // Tratamento flexível para diferentes formatos de webhook do Mercado Pago
      let webhookData;
      
      // Verificar diferentes formatos possíveis de webhook
      if (req.body.type && req.body.data && req.body.data.id) {
        // Formato padrão
        webhookData = {
          type: req.body.type,
          data: { id: req.body.data.id }
        };
      } else if (req.body.action && req.body.api_version && req.body.data && req.body.data.id) {
        // Formato alternativo com action
        webhookData = {
          type: 'payment',
          data: { id: req.body.data.id }
        };
      } else if (req.body.id) {
        // Formato simplificado - apenas ID do pagamento
        webhookData = {
          type: 'payment',
          data: { id: req.body.id.toString() }
        };
      } else {
        console.warn('Webhook não contém dados essenciais. Corpo:', JSON.stringify(req.body, null, 2));
        return res.status(200).send('OK');
      }
      
      console.log('Dados do webhook processados:', JSON.stringify(webhookData, null, 2));
      
      console.log('Webhook recebido:', JSON.stringify(webhookData, null, 2));

      if (webhookData.type === 'payment') {
        const paymentId = webhookData.data.id;
        
        // Buscar informações do pagamento no Mercado Pago
        // Por enquanto, vamos simular a aprovação para desenvolvimento
        console.log(`Processando pagamento: ${paymentId}`);
        
        // Buscar pagamento local pelo ID externo ou preferência
        // Para webhook real, você precisaria fazer uma consulta ao MP API
        // const mercadoPagoPayment = await getPaymentInfo(paymentId);
        
        // Buscar status real do pagamento no Mercado Pago
        const { getPaymentInfo } = await import("./mercado-pago");
        let paymentStatus = 'pending';
        
        try {
          const mercadoPagoPayment = await getPaymentInfo(paymentId);
          paymentStatus = mercadoPagoPayment?.status || 'pending';
          console.log(`Status do pagamento ${paymentId}: ${paymentStatus}`);
        } catch (error) {
          console.error('Erro ao buscar pagamento no Mercado Pago:', error);
          // Para webhook, assumir aprovado se não conseguir verificar
          console.warn('⚠️ Assumindo pagamento aprovado devido a erro na consulta');
          paymentStatus = 'approved';
        }
        
        if (paymentStatus === 'approved') {
          // Tentar encontrar pagamento local por diferentes métodos
          let payment = await storage.getPaymentByPreferenceId(webhookData.data.id);
          
          // Se não encontrar por preferenceId, tentar por mercadoPagoId
          if (!payment) {
            payment = await storage.getPaymentByMercadoPagoId(paymentId);
          }
          
          // Se ainda não encontrar, buscar o pagamento mais recente pendente
          if (!payment) {
            const pendingPayments = await storage.getPendingPayments();
            console.log(`Procurando entre ${pendingPayments.length} pagamentos pendentes`);
            if (pendingPayments.length > 0) {
              // Pegar o pagamento pendente mais recente
              payment = pendingPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
              console.log(`Usando pagamento pendente mais recente: ${payment.id}`);
            }
          }
          
          if (payment && payment.status === 'pending') {
            // Atualizar status do pagamento
            await storage.updatePayment(payment.id, {
              status: 'approved',
              mercadoPagoId: paymentId,
            });

            // Criar licença para o usuário
            let totalMinutes;
            if (payment.plan === 'test') {
              // Plano teste: apenas 30 minutos
              totalMinutes = 30;
            } else {
              // Outros planos: usar durationDays
              totalMinutes = payment.durationDays * 24 * 60;
            }
            
            const daysRemaining = Math.floor(totalMinutes / (24 * 60));
            const hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
            const minutesRemaining = totalMinutes % 60;
            
            const expiresAt = new Date();
            if (payment.plan === 'test') {
              // Plano teste expira em 30 minutos
              expiresAt.setMinutes(expiresAt.getMinutes() + 30);
            } else {
              // Outros planos usam durationDays
              expiresAt.setDate(expiresAt.getDate() + payment.durationDays);
            }

            // Gerar chave da licença
            const licenseKey = `MP-${payment.plan.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

            await storage.createLicense({
              userId: payment.userId,
              key: licenseKey,
              plan: payment.plan,
              status: "active",
              daysRemaining,
              hoursRemaining,
              minutesRemaining,
              totalMinutesRemaining: totalMinutes,
              expiresAt,
              activatedAt: new Date(),
            });

            console.log(`Licença criada para usuário ${payment.userId}: ${licenseKey}`);

            // Enviar email automático com chave de licença
            try {
              const user = await storage.getUser(payment.userId);
              if (user) {
                const planName = payment.plan === 'test' ? 'TESTE (30 MIN)' : payment.plan === '7days' ? '7 DIAS' : '15 DIAS';
                await sendLicenseKeyEmail(user.email, licenseKey, planName);
                console.log(`Email com chave de licença enviado para: ${user.email}`);
              }
            } catch (emailError) {
              console.error('Erro ao enviar email com chave de licença:', emailError);
              // Não falhar o webhook por erro de email
            }
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ message: "Erro ao processar webhook" });
    }
  });

  // Verificar status do pagamento
  app.get("/api/payments/:id/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const paymentId = parseInt(req.params.id);
      
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

  // Listar pagamentos do usuário
  app.get("/api/payments", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const payments = await storage.getUserPayments(user.id);
      
      const paymentsFormatted = payments.map(payment => ({
        id: payment.id,
        status: payment.status,
        amount: payment.transactionAmount / 100,
        currency: payment.currency,
        plan: payment.plan,
        durationDays: payment.durationDays,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      }));

      res.json({ payments: paymentsFormatted });
    } catch (error) {
      console.error("User payments fetch error:", error);
      res.status(500).json({ message: "Erro ao buscar pagamentos" });
    }
  });

  // Admin - Listar todos os pagamentos
  app.get("/api/admin/payments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const payments = await storage.getAllPayments();
      res.json({ payments });
    } catch (error) {
      console.error("Admin payments fetch error:", error);
      res.status(500).json({ message: "Erro ao buscar pagamentos" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
