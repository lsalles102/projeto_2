# Guia de Deploy no Render

Este guia explica como fazer o deploy da aplicação FovDark no Render de forma robusta.

## Pré-requisitos

1. Conta no [Render](https://render.com)
2. Banco de dados Supabase configurado
3. Repositório Git com o código

## Configuração do Banco de Dados

### Opção 1: Usar Supabase (Recomendado)
1. Acesse [Supabase Dashboard](https://supabase.com/dashboard)
2. Crie um novo projeto
3. Na seção "Settings" > "Database", copie a "Connection string"
4. Use essa URL como `DATABASE_URL`

### Opção 2: PostgreSQL do Render
1. No Render, crie um novo PostgreSQL Database
2. Use as credenciais fornecidas

## Deploy da Aplicação

### 1. Conectar Repositório
- No Render Dashboard, clique em "New +"
- Selecione "Web Service"
- Conecte seu repositório GitHub/GitLab

### 2. Configurações do Serviço
```
Name: fovdark-app
Environment: Node
Build Command: npm install && npm run build
Start Command: npm start
```

### 3. Variáveis de Ambiente Obrigatórias
```
NODE_ENV=production
DATABASE_URL=sua_url_do_supabase_ou_render
SESSION_SECRET=sua_chave_secreta_aleatoria
JWT_SECRET=sua_chave_jwt_secreta
```

### 4. Variáveis de Ambiente Opcionais
```
# Google OAuth
GOOGLE_CLIENT_ID=seu_google_client_id
GOOGLE_CLIENT_SECRET=seu_google_client_secret

# Email (para recuperação de senha)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_de_app

# Mercado Pago (para pagamentos)
MERCADO_PAGO_ACCESS_TOKEN=seu_token_mp
MERCADO_PAGO_WEBHOOK_SECRET=sua_chave_webhook
```

### 5. Configurações Avançadas
```
Health Check Path: /api/health
Auto-Deploy: Yes
```

## Checklist de Deploy

- [ ] Banco de dados configurado e acessível
- [ ] Todas as variáveis de ambiente definidas
- [ ] Health check endpoint funcionando
- [ ] Build do frontend executado com sucesso
- [ ] Migrações de banco aplicadas
- [ ] SSL configurado automaticamente pelo Render

## Monitoramento

### Health Check
A aplicação possui um endpoint `/api/health` que retorna:
```json
{
  "status": "ok",
  "timestamp": "2025-06-13T20:32:48.638Z",
  "database": "connected"
}
```

### Logs
- Acesse os logs em tempo real no Render Dashboard
- Monitore métricas de CPU e memória
- Configure alertas para erros

## Domínio Personalizado (Opcional)

1. No Render Dashboard, vá para seu serviço
2. Clique em "Settings" > "Custom Domains"
3. Adicione seu domínio
4. Configure os registros DNS conforme instruído

## Troubleshooting

### Erro de Conexão com Banco
- Verifique se `DATABASE_URL` está correta
- Teste a conexão usando `/api/health`
- Certifique-se que o IP do Render está liberado no Supabase

### Build Falha
- Verifique se todas as dependências estão no `package.json`
- Confirme que `npm run build` funciona localmente
- Revise os logs de build no Render

### Aplicação não Inicia
- Verifique se `PORT` está definida corretamente (Render define automaticamente)
- Confirme que todas as variáveis de ambiente estão configuradas
- Revise os logs de runtime

## Recursos Adicionais

- [Documentação do Render](https://render.com/docs)
- [Documentação do Supabase](https://supabase.com/docs)
- Health Check: `https://seu-app.onrender.com/api/health`