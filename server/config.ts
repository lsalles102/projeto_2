// Configuração centralizada para URLs e ambiente
export function getBaseUrl(): string {
  // Se estiver no Render (produção), usar a URL oficial
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return 'https://fovdark.shop';
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
  return `${getBaseUrl()}/api/payments/webhook`;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || !!process.env.RENDER;
}