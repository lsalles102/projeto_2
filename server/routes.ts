import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken } from "./auth";
import { registerSchema, loginSchema, activateKeySchema, forgotPasswordSchema, resetPasswordSchema, contactSchema, licenseStatusSchema, heartbeatSchema } from "@shared/schema";
import crypto from "crypto";
import nodemailer from "nodemailer";



export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Store password as plain text
      const user = await storage.createUser({
        ...userData,
        password: userData.password,
      });

      // Generate JWT token
      const token = generateToken(user.id);
      
      // Log the user in
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed after registration" });
        }
        res.json({ user: { ...user, password: undefined }, token });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    try {
      loginSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
    }

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
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
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userWithLicense = await storage.getUser(user.id);
      const license = await storage.getLicenseByUserId(user.id);
      
      res.json({
        user: { ...userWithLicense, password: undefined },
        license,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // License routes
  app.post("/api/licenses/activate", isAuthenticated, async (req, res) => {
    try {
      const { key, hwid } = activateKeySchema.parse(req.body);
      const user = req.user as any;

      // Check if user already has an active license
      const existingLicense = await storage.getLicenseByUserId(user.id);
      if (existingLicense && existingLicense.status === "active") {
        return res.status(400).json({ message: "User already has an active license" });
      }

      // Validate activation key
      const activationKey = await storage.getActivationKey(key);
      if (!activationKey || activationKey.isUsed) {
        return res.status(400).json({ message: "Invalid or already used activation key" });
      }

      // Create license with correct duration and time tracking
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
        status: "active",
        hwid,
        daysRemaining,
        hoursRemaining,
        minutesRemaining,
        totalMinutesRemaining: totalMinutes,
        expiresAt,
        activatedAt: new Date(),
      });

      // Mark activation key as used
      await storage.markActivationKeyAsUsed(key, user.id);

      // Update user HWID
      await storage.updateUser(user.id, { hwid });

      res.json({ license });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("License activation error:", error);
      res.status(500).json({ message: "License activation failed" });
    }
  });

  app.get("/api/licenses/validate", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const license = await storage.getLicenseByUserId(user.id);

      if (!license) {
        return res.status(404).json({ message: "No license found" });
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
      res.status(500).json({ message: "License validation failed" });
    }
  });

  // Download routes
  app.get("/api/download/cheat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const license = await storage.getLicenseByUserId(user.id);

      if (!license || license.status !== "active") {
        return res.status(403).json({ message: "Valid license required for download" });
      }

      // Check if license is expired
      const isExpired = new Date() > license.expiresAt;
      if (isExpired) {
        await storage.updateLicense(license.id, { status: "expired" });
        return res.status(403).json({ message: "License has expired" });
      }

      // Log the download
      await storage.logDownload(user.id, license.id, "FovDark_Cheat_v2.4.1.zip");

      // In a real implementation, you would serve the actual file
      // For now, we'll return download info
      res.json({
        message: "Download authorized",
        fileName: "FovDark_Cheat_v2.4.1.zip",
        downloadUrl: "/downloads/FovDark_Cheat_v2.4.1.zip", // This would be a real file path
        version: "2.4.1",
        size: "15.2 MB",
      });
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Download failed" });
    }
  });

  // Admin routes (for creating activation keys)
  app.post("/api/admin/keys", async (req, res) => {
    try {
      const { plan, count = 1 } = req.body;
      
      if (!["7days", "15days"].includes(plan)) {
        return res.status(400).json({ message: "Invalid plan type" });
      }

      const keys = [];
      for (let i = 0; i < count; i++) {
        const key = `FOVD-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const activationKey = await storage.createActivationKey({
          key,
          plan,
          durationDays: plan === "7days" ? 7 : 15,
          isUsed: false,
        });
        keys.push(activationKey);
      }

      res.json({ keys });
    } catch (error) {
      console.error("Key generation error:", error);
      res.status(500).json({ message: "Key generation failed" });
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

  const httpServer = createServer(app);
  return httpServer;
}
