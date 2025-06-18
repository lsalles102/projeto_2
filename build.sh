#!/bin/bash

# Build script para o Render
echo "Instalando dependências..."
npm ci

echo "Construindo aplicação para produção..."
npm run build:prod

echo "Criando diretório público..."
mkdir -p public

echo "Copiando arquivos estáticos..."
if [ -d "dist/public" ]; then
  cp -r dist/public/* public/ 2>/dev/null || echo "Falha ao copiar de dist/public"
  echo "Arquivos copiados de dist/public/"
elif [ -d "dist/client" ]; then
  cp -r dist/client/* public/ 2>/dev/null || echo "Falha ao copiar de dist/client"
  echo "Arquivos copiados de dist/client/"
else
  echo "Criando index.html básico para fallback..."
  echo '<!DOCTYPE html><html><head><title>FovDark</title></head><body><h1>FovDark API</h1><p>API está funcionando!</p></body></html>' > public/index.html
fi

echo "Build concluído!"
ls -la dist/
ls -la public/