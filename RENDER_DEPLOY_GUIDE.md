# Guia de Deploy no Render - FovDark

## Problema Atual
Sistema funciona perfeitamente em desenvolvimento mas falha no Render com erro 401 "Não autorizado" após login.

## Causa Raiz Identificada
1. **Variáveis de ambiente ausentes**: JWT_SECRET e SESSION_SECRET não configurados no Render
2. **CORS restritivo**: Configuração inadequada para produção
3. **Tokens JWT**: Expiração e validação problemática em produção

## Configurações Necessárias no Render

### Environment Variables (OBRIGATÓRIAS)
```
JWT_SECRET=sua_chave_jwt_super_secreta_aqui_min_32_chars
SESSION_SECRET=sua_chave_sessao_super_secreta_aqui_min_32_chars
NODE_ENV=production
DATABASE_URL=(já configurado)
MERCADO_PAGO_ACCESS_TOKEN=(já configurado)
```

### Como Configurar no Render
1. Acesse o dashboard do serviço no Render
2. Vá em "Environment" 
3. Adicione as variáveis:
   - `JWT_SECRET`: Use um gerador online para criar uma string de 64 caracteres
   - `SESSION_SECRET`: Use outro gerador para criar uma string de 64 caracteres

### Como Gerar Valores Seguros
```bash
# Gerar JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Gerar SESSION_SECRET  
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Exemplo de Valores (GERE SEUS PRÓPRIOS)
```
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
SESSION_SECRET=z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z3y2x1w0v9u8
```

## Checklist de Deploy
- [ ] Configurar JWT_SECRET no Render
- [ ] Configurar SESSION_SECRET no Render  
- [ ] Verificar DATABASE_URL funcionando
- [ ] Confirmar MERCADO_PAGO_ACCESS_TOKEN
- [ ] Testar login em produção
- [ ] Testar pagamentos PIX
- [ ] Verificar webhook Mercado Pago

## URLs de Produção
- Site: https://fovdark.shop
- API: https://fovdark.shop/api/
- Webhook: https://fovdark.shop/api/payments/webhook

## Testes de Validação
```bash
# 1. Testar login
curl -X POST https://fovdark.shop/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lsalles102@gmail.com","password":"C@pitulo4v3"}'

# 2. Usar o token retornado para testar dashboard
curl -X GET https://fovdark.shop/api/dashboard \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"

# 3. Testar criação de pagamento PIX
curl -X POST https://fovdark.shop/api/payments/create-pix \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{"plan":"test","payerEmail":"test@test.com","payerFirstName":"Test","payerLastName":"User"}'
```

## Status
❌ JWT_SECRET não configurado no Render
❌ SESSION_SECRET não configurado no Render
✅ Sistema funcionando localmente
✅ Correções implementadas
✅ CORS configurado para produção
✅ Logs de debug implementados
⏳ Aguardando configuração no Render

## Solução Imediata
Configure as duas variáveis de ambiente no Render e o sistema funcionará imediatamente. O problema não é de código, mas de configuração de produção.