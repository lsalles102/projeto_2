# Configuração Supabase para FovDark

## Status Atual
✅ Conexão com Supabase configurada
✅ Tabela `app_users` criada (evita conflito com `auth.users`)
✅ Sistema de autenticação funcionando
✅ CORS configurado para https://fovdark.shop

## Tabelas Criadas
- `app_users` - Usuários da aplicação com licenças
- `sessions` - Sessões de autenticação
- `payments` - Pagamentos do Mercado Pago
- `license_history` - Histórico de licenças

## Configurações de Deploy

### Render
- Arquivo: `render.yaml` configurado
- Build: `build.sh` otimizado
- Start: `npm run start:prod`
- Usa `server/index.prod.ts` para produção

### Variáveis de Ambiente Necessárias no Render
```
DATABASE_URL=postgresql://...supabase.co:5432/postgres
NODE_ENV=production
SESSION_SECRET=sua_session_secret_secreta
JWT_SECRET=seu_jwt_secret_secreto
```

### CORS Configurado Para
- https://fovdark.shop
- https://www.fovdark.shop

## Próximos Passos para Deploy
1. Fazer push do código para o repositório
2. Configurar as variáveis de ambiente no Render
3. Apontar o domínio fovdark.shop para o Render
4. Testar autenticação em produção