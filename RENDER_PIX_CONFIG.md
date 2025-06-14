# Configuração PIX Mercado Pago no Render

## ✅ Passos para Configurar PIX no Render

### 1. Variáveis de Ambiente Obrigatórias

No painel do Render, adicione estas variáveis em **Settings → Environment**:

```
# Mercado Pago (OBRIGATÓRIO para PIX)
MERCADO_PAGO_ACCESS_TOKEN=seu_token_de_producao_aqui
MERCADO_PAGO_PUBLIC_KEY=sua_chave_publica_aqui

# Segurança (já configurados)
JWT_SECRET=2e69fbebc3d2a6f476bb87918331d6365ceee1098e6b3029b305139c4088e4fd118f3b88b4e2f408fc9201eaffb87124a7fb3cead1e1da0c3d98054be452ddc1
SESSION_SECRET=810c3855ddd2d9b21b33bc1b82ce6e24fd5d635f9e41f5f14feed9f16fc540f51a5ce1f63199bc0319aff20e644f70ebaf7fd54cd568d5c3ac49912fd5c42fc1

# Ambiente
NODE_ENV=production
RENDER=true

# Banco de Dados
DATABASE_URL=sua_url_supabase_postgresql
```

### 2. Como Obter Token do Mercado Pago

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers)
2. Faça login na sua conta
3. Vá em **Suas aplicações**
4. Selecione sua aplicação ou crie uma nova
5. Na aba **Credenciais**:
   - **Access Token de Produção** → use para `MERCADO_PAGO_ACCESS_TOKEN`
   - **Chave Pública de Produção** → use para `MERCADO_PAGO_PUBLIC_KEY`

### 3. Configuração de Webhooks no Mercado Pago

1. No painel do Mercado Pago, vá em **Webhooks**
2. Adicione esta URL: `https://fovdark.shop/api/payments/webhook`
3. Selecione o evento: **payments**
4. Salve a configuração

### 4. Verificação Pós-Deploy

Após configurar e fazer deploy, teste:

```bash
# Teste de health check
curl https://fovdark.shop/api/health

# Teste de criação PIX (após fazer login)
curl -X POST https://fovdark.shop/api/payments/create-pix \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=sua_sessao" \
  -d '{
    "plan": "test",
    "durationDays": 0.021,
    "payerEmail": "test@example.com",
    "payerFirstName": "Test",
    "payerLastName": "User"
  }'
```

### 5. Troubleshooting PIX

Se o PIX não funcionar:

1. **Verifique variáveis**: Certifique-se que `MERCADO_PAGO_ACCESS_TOKEN` está definido
2. **Verifique logs**: No Render, vá em **Logs** e procure por erros do Mercado Pago
3. **Teste credenciais**: Use o token de sandbox primeiro para testar
4. **Webhook URL**: Confirme que https://fovdark.shop/api/payments/webhook está acessível

### 6. URLs Configuradas

O sistema agora usa automaticamente:
- **Produção (Render)**: `https://fovdark.shop`
- **Desenvolvimento (Replit)**: URL automática do Replit
- **Local**: `http://localhost:5000`

### 7. Status de Funcionamento

✅ Preferência de pagamento criada corretamente
✅ URLs de webhook configuradas automaticamente
✅ Integração com Supabase PostgreSQL
✅ Sistema de notificações funcionando
✅ Processamento automático de pagamentos aprovados