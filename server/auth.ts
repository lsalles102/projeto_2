import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";

import jwt from "jsonwebtoken";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { db } from "./db";
import type { User } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('⚠️ Using default JWT secret in development - CHANGE IN PRODUCTION');
  return "dev-jwt-secret-never-use-in-production";
})();

export function getSession() {
  const sessionSecret = process.env.SESSION_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET environment variable is required in production');
    }
    console.warn('⚠️ Using default session secret in development - CHANGE IN PRODUCTION');
    return "dev-session-secret-never-use-in-production";
  })();

  // Configurar store PostgreSQL para sessões
  const PgSession = ConnectPgSimple(session);
  
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionConfig: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Disable secure for compatibility
      sameSite: 'lax', // Use lax for better compatibility
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 semana
      // Remove domain restriction for compatibility
    },
  };

  // Usar PostgreSQL store apenas se DATABASE_URL estiver disponível
  if (process.env.DATABASE_URL) {
    sessionConfig.store = new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'sessions',
      createTableIfMissing: true,
    });
  } else {
    console.warn('⚠️ Using MemoryStore for sessions - not recommended for production');
  }

  return session(sessionConfig);
}

export async function setupAuth(app: Express): Promise<any> {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Local Strategy
  passport.use(new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user || !user.password) {
          return done(null, false, { message: "Credenciais inválidas" });
        }

        // Compare passwords directly (no encryption)
        if (password !== user.password) {
          return done(null, false, { message: "Credenciais inválidas" });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));



  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      // Certificar que isAdmin está disponível no objeto user
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
  
  return app;
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    // Primeiro, verificar autenticação via sessão do Passport
    if (req.isAuthenticated() && req.user) {
      return next();
    }

    // Se não autenticado via sessão, verificar token JWT no header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (decoded) {
        // Buscar usuário pelo ID do token
        const user = await storage.getUser(decoded.userId);
        if (user) {
          req.user = user;
          return next();
        }
      }
    }

    res.status(401).json({ message: "Não autorizado" });
  } catch (error) {
    console.error("Erro no middleware de autenticação:", error);
    res.status(401).json({ message: "Não autorizado" });
  }
};

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

// Password hashing removed - storing plain text passwords
