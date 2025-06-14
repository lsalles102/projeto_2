# Correção do Erro de Deploy no Render

## ❌ Problema
O deploy falhou com erro: `JWT_SECRET environment variable is required in production`

## ✅ Solução - Configurar Variáveis de Ambiente no Render

### 1. Acesse seu projeto no Render
1. Faça login no [Render.com](https://render.com)
2. Selecione seu projeto FovDark
3. Vá em **Settings** → **Environment**

### 2. Adicione estas variáveis OBRIGATÓRIAS:

#### Variáveis de Segurança (CRÍTICAS)
```
JWT_SECRET=2e69fbebc3d2a6f476bb87918331d6365ceee1098e6b3029b305139c4088e4fd118f3b88b4e2f408fc9201eaffb87124a7fb3cead1e1da0c3d98054be452ddc1

SESSION_SECRET=810c3855ddd2d9b21b33bc1b82ce6e24fd5d635f9e41f5f14feed9f16fc540f51a5ce1f63199bc0319aff20e644f70ebaf7fd54cd568d5c3ac49912fd5c42fc1

NODE_ENV=production
```

#### Variável do Banco de Dados
```
DATABASE_URL=(sua URL do Supabase PostgreSQL)
```

### 3. Variáveis Opcionais (se usar)

#### Email (SendGrid)
```
SENDGRID_API_KEY=(sua chave da SendGrid)
FROM_EMAIL=noreply@fovdark.com
```

#### Mercado Pago
```
MERCADO_PAGO_ACCESS_TOKEN=(seu token do Mercado Pago)
MERCADO_PAGO_PUBLIC_KEY=(sua chave pública do Mercado Pago)
```

### 4. Como Adicionar no Render
1. Clique em **Add Environment Variable**
2. Cole o nome da variável (ex: `JWT_SECRET`)
3. Cole o valor correspondente
4. Clique **Save**
5. Repita para todas as variáveis

### 5. Fazer Novo Deploy
Após configurar todas as variáveis:
1. Vá na aba **Deploys**
2. Clique **Deploy Latest Commit**
3. Aguarde o deploy completar

## ⚠️ IMPORTANTE
- NÃO compartilhe os valores JWT_SECRET e SESSION_SECRET com ninguém
- Estes valores já foram gerados de forma segura para você
- Se precisar gerar novos, execute: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

## 🔍 Verificação de Sucesso
Após o deploy, verifique se:
- [ ] Aplicação inicia sem erros
- [ ] Homepage carrega corretamente
- [ ] Login/registro funcionam
- [ ] Banco de dados conecta

## 📞 Se Ainda Não Funcionar
Se o erro persistir:
1. Verifique se todas as variáveis foram salvas corretamente
2. Confirme se a URL do DATABASE_URL está correta
3. Tente um novo deploy manual