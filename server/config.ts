// Configuração centralizada para URLs e ambiente
export function getBaseUrl(): string {
  // Se estiver no Render (produção), usar a URL oficial
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return 'https://fovdark.shop';
  }
  
  // Replit environment - usar a URL correta do domínio
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Desenvolvimento local - usar URL externa do Replit para webhooks
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  // Fallback para desenvolvimento local
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