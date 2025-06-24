# FovDark License Management System

## Project Overview
Sistema de gerenciamento de licenças para cheats/hacks com interface administrativa completa, integração com Supabase e Mercado Pago.

## Recent Changes
- ✓ 2025-06-24 19:37: Migração completa do Replit Agent para ambiente Replit padrão
- ✓ 2025-06-24 19:40: Configuração PostgreSQL local para desenvolvimento
- ✓ 2025-06-24 19:45: Sistema de rotas API corrigido e funcionando
- ✓ 2025-06-24 19:45: Endpoint de pagamentos PIX /api/payments/pix adicionado
- ✓ 2025-06-24 19:45: Sistema de autenticação JWT operacional
- ✓ 2025-06-24 19:45: Banco de dados limpo e otimizado
- ✓ 2025-06-24 19:45: Health check endpoint /api/health funcionando
- ✓ 2025-06-24 19:45: Sistema de monitoramento de licenças ativo
- ✓ 2025-06-24 19:45: Webhook Mercado Pago configurado corretamente

## User Preferences
- Comunicação em português brasileiro
- Foco em segurança e separação cliente/servidor
- Uso do Supabase como banco de dados principal
- Integração com Mercado Pago para pagamentos

## Project Architecture
### Backend (Node.js/Express)
- Autenticação JWT + Passport
- Sistema de licenças integrado
- Webhook Mercado Pago
- API REST para frontend

### Frontend (React/Vite)
- Dashboard de usuário
- Painel administrativo
- Sistema de autenticação
- Interface para downloads

### Database (Supabase)
- Usuários e permissões
- Licenças e pagamentos
- Configurações do sistema
- Logs de auditoria

## Key Features
- Sistema centralizado de licenças
- Monitoramento automático de expiração
- Painel admin para gerenciar usuários e configurações
- Download seguro com verificação de licença
- Integração completa com Mercado Pago