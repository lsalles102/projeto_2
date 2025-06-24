// Configuração centralizada para URLs e ambiente
export function getBaseUrl(): string {
  // Prioridade 1: Produção no Render (https://fovdark.shop)
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return 'https://fovdark.shop';
  }
  
  // Prioridade 2: Replit environment
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Prioridade 3: Fallback para REPL_SLUG + REPL_OWNER
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  // Prioridade 4: Desenvolvimento local
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}`;
}

export function getWebhookUrl(): string {
  const webhookUrl = `${getBaseUrl()}/api/payments/webhook`;
  console.log(`Webhook URL configurada: ${webhookUrl}`);
  return webhookUrl;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || !!process.env.RENDER;
}