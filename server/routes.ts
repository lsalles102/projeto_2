import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, generateToken, hashPassword } from "./auth";
import { registerSchema, loginSchema, activateKeySchema } from "@shared/schema";
import crypto from "crypto";

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

      // Hash password and create user
      const hashedPassword = await hashPassword(userData.password);
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
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

  app.get("/api/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"]
  }));

  app.get("/api/auth/google/callback", 
    passport.authenticate("google", { failureRedirect: "/login?error=google" }),
    (req, res) => {
      res.redirect("/dashboard");
    }
  );

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

      // Create license
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month from now

      const license = await storage.createLicense({
        userId: user.id,
        key,
        plan: activationKey.plan,
        status: "active",
        hwid,
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
      
      if (!["basic", "premium", "vip"].includes(plan)) {
        return res.status(400).json({ message: "Invalid plan type" });
      }

      const keys = [];
      for (let i = 0; i < count; i++) {
        const key = `FOVD-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const activationKey = await storage.createActivationKey({
          key,
          plan,
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

  const httpServer = createServer(app);
  return httpServer;
}
