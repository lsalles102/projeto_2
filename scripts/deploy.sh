#!/bin/bash

# Deploy script for Render
set -e

echo "🚀 Iniciando processo de deploy..."

# Verificar se NODE_ENV está definido
if [ -z "$NODE_ENV" ]; then
  export NODE_ENV=production
fi

echo "✅ NODE_ENV definido como: $NODE_ENV"

# Verificar se DATABASE_URL está definido
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Erro: DATABASE_URL não está definido"
  exit 1
fi

echo "✅ DATABASE_URL está configurado"

# Instalar dependências
echo "📦 Instalando dependências..."
npm ci --only=production

# Build da aplicação
echo "🔨 Construindo aplicação..."
npm run build

# Verificar se o build foi bem-sucedido
if [ ! -d "dist" ]; then
  echo "❌ Erro: Build falhou - diretório dist não encontrado"
  exit 1
fi

echo "✅ Build concluído com sucesso"

# Executar migrações de banco de dados (se necessário)
echo "🗄️ Executando migrações de banco..."
npm run db:push || echo "⚠️ Migrações falharam ou já aplicadas"

echo "🎉 Deploy concluído! Iniciando aplicação..."

# Iniciar aplicação
exec npm start