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
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  if (isProduction) {
    console.error('❌ JWT_SECRET não configurado em produção!');
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('⚠️ Using default JWT secret in development - CHANGE IN PRODUCTION');
  return "dev-jwt-secret-never-use-in-production";
})();

export function getSession() {
  const sessionSecret = process.env.SESSION_SECRET || (() => {
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
    if (isProduction) {
      console.error('❌ SESSION_SECRET não configurado em produção!');
      throw new Error('SESSION_SECRET environment variable is required in production');
    }
    console.warn('⚠️ Using default session secret in development - CHANGE IN PRODUCTION');
    return "dev-session-secret-never-use-in-production";
  })();

  // Configurar store PostgreSQL para sessões
  const PgSession = ConnectPgSimple(session);
  
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  const sessionConfig: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Manter false para compatibilidade
      sameSite: 'lax', // Configuração padrão
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
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
    // Verificar token JWT no header Authorization
    const authHeader = req.headers.authorization;
    console.log(`Auth: Verificando autenticação para ${req.method} ${req.path}`);
    console.log(`Auth: Authorization header:`, authHeader ? authHeader.substring(0, 20) + '...' : 'undefined');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error(`Auth: Token não encontrado. Headers: ${JSON.stringify(req.headers.authorization)}`);
      console.error(`Auth: Todas as headers:`, Object.keys(req.headers));
      return res.status(401).json({ message: "Não autorizado" });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      console.error('Auth: Token vazio após split');
      return res.status(401).json({ message: "Token inválido" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      console.log(`Auth: Token válido para usuário: ${decoded.userId}`);
    } catch (jwtError) {
      console.error('Auth: Erro na verificação JWT:', jwtError);
      return res.status(401).json({ message: "Token inválido ou expirado" });
    }
    
    // Buscar usuário no banco
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      console.error('Auth: Usuário não encontrado para ID:', decoded.userId);
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    console.log(`Auth: Usuário autenticado com sucesso: ${user.email}`);
    // Adicionar usuário à requisição
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth: Erro geral na autenticação:', error);
    res.status(401).json({ message: "Erro de autenticação" });
  }
};

export function generateToken(userId: string): string {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  const expiresIn = isProduction ? "24h" : "7d"; // Mais conservador em produção
  console.log(`JWT: Gerando token com expiração de ${expiresIn}`);
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

// Password hashing removed - storing plain text passwords
