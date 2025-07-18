import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { licenseService } from "./license-service";
import { licenseMonitor } from "./license-monitor";
import path from "path";
import fs from "fs";

const app = express();

// Trust proxy for Render deployment
app.set("trust proxy", 1);

// Add proper error handling for malformed JSON
app.use(express.json({
  limit: '10mb'
}));

// Add error handler for JSON parsing errors
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('JSON parsing error:', err.message);
    return res.status(400).json({ 
      message: 'Formato JSON inválido',
      error: true 
    });
  }
  next(err);
});

app.use(express.urlencoded({ extended: false }));

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (error.message.includes('EADDRINUSE') || error.message.includes('listen')) {
    process.exit(1);
  }
});

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function serveStatic(app: express.Express) {
  // Tenta primeiro dist/public, depois public, depois fallback
  const possiblePaths = [
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "dist", "client")
  ];

  let distPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      distPath = testPath;
      console.log(`Frontend encontrado em: ${distPath}`);
      break;
    }
  }

  if (!distPath) {
    console.warn(`Frontend não encontrado. Testados: ${possiblePaths.join(', ')}`);
    app.use("/", (_req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>FovDark - Sistema de Licenças</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 600px; margin: 0 auto; }
            .status { padding: 20px; background: #f0f0f0; border-radius: 8px; }
            .api-status { color: #28a745; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>FovDark - Sistema de Licenças</h1>
            <div class="status">
              <h2 class="api-status">✓ API Funcionando</h2>
              <p>Sistema backend operacional em https://fovdark.shop</p>
              <p>Frontend em construção - API endpoints disponíveis</p>
            </div>
          </div>
        </body>
        </html>
      `);
    });
    return;
  }

  app.use(express.static(distPath));

  // Serve React app for all non-API routes
  app.get("*", (req, res) => {
    // Don't interfere with API routes
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ message: "API endpoint not found" });
    }
    
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      // Ensure proper headers for SPA
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ message: "Frontend index.html not found" });
    }
  });
}

// CORS e Security headers middleware for production
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://fovdark.shop',
    'https://www.fovdark.shop'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin as string)) {
    res.setHeader('Access-Control-Allow-Origin', origin as string);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  res.removeHeader('X-Powered-By');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(app);
  
  // Start license monitoring in production
  licenseMonitor.start();
  log("License monitoring started in production");

  serveStatic(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Error ${status}: ${message}`);
    res.status(status).json({ message });
  });

  const PORT = parseInt(process.env.PORT || "5000", 10);
  app.listen(PORT, "0.0.0.0", () => {
    log(`Production server running on port ${PORT}`);
  });
})();