#!/bin/bash

# Build script para o Render
echo "Instalando dependências..."
npm ci

echo "Construindo aplicação para produção..."
npm run build:prod

echo "Criando diretório público..."
mkdir -p public

echo "Copiando arquivos estáticos..."
if [ -d "dist/client" ]; then
  cp -r dist/client/* public/
  echo "Arquivos do cliente copiados para public/"
else
  echo "Diretório dist/client não encontrado, verificando dist..."
  if [ -d "dist" ]; then
    find dist -name "*.html" -o -name "*.css" -o -name "*.js" -o -name "*.png" -o -name "*.jpg" -o -name "*.svg" | while read file; do
      cp "$file" public/ 2>/dev/null || echo "Falha ao copiar $file"
    done
  fi
fi

echo "Build concluído!"
ls -la dist/
ls -la public/