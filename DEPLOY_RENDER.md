# Deploy no Render - Guia de Solução

## Problema Identificado
O erro `Cannot find package 'vite'` acontece porque o Render estava tentando executar o arquivo de desenvolvimento (`server/index.ts`) ao invés do arquivo de produção (`server/index.prod.ts`).

## Solução Implementada

### 1. Configuração do render.yaml
```yaml
services:
  - type: web
    name: rest-express
    env: node
    buildCommand: chmod +x build.sh && ./build.sh
    startCommand: npm run start:prod
    envVars:
      - key: NODE_ENV
        value: production
```

### 2. Script de Build Personalizado (build.sh)
- Instala dependências
- Executa `npm run build:prod` (usa `server/index.prod.ts`)
- Cria diretório público para arquivos estáticos
- Copia arquivos do frontend para o diretório correto

### 3. Dockerfile (alternativa)
Caso prefira usar Docker no Render:
- Usa Node.js 20
- Instala dependências de desenvolvimento para o build
- Remove dependências de desenvolvimento após o build
- Configura corretamente os arquivos estáticos

## Como usar no Render

### Opção 1: render.yaml (Recomendado)
1. Faça commit dos arquivos `render.yaml` e `build.sh`
2. No Render, conecte seu repositório
3. O Render detectará automaticamente o `render.yaml`

### Opção 2: Configuração Manual
1. Build Command: `npm install && npm run build:prod`
2. Start Command: `npm run start:prod`
3. Environment: `NODE_ENV=production`

### Opção 3: Docker
1. Use o Dockerfile fornecido
2. Configure o Render para usar Docker

## Variáveis de Ambiente Necessárias
No Render, configure estas variáveis OBRIGATÓRIAS:

### Variáveis de Segurança (OBRIGATÓRIAS)
- `NODE_ENV=production`
- `JWT_SECRET=` (gere uma string aleatória de 64 caracteres)
- `SESSION_SECRET=` (gere uma string aleatória de 64 caracteres)

### Variáveis do Banco de Dados
- `DATABASE_URL=` (URL do PostgreSQL no Supabase)

### Variáveis de Email (se usar funcionalidade de email)
- `SENDGRID_API_KEY=` (opcional)
- `FROM_EMAIL=` (opcional)

### Variáveis do Mercado Pago (se usar pagamentos)
- `MERCADO_PAGO_ACCESS_TOKEN=` (opcional)
- `MERCADO_PAGO_PUBLIC_KEY=` (opcional)

## Como Gerar Secrets Seguros
Execute no terminal:
```bash
# Para JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Para SESSION_SECRET  
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Verificação
Após o deploy, verifique:
- A aplicação inicia sem erros de módulo
- Arquivos estáticos são servidos corretamente
- APIs respondem adequadamente