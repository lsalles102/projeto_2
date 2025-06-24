# FovDark License Management System

## Project Overview
Sistema de gerenciamento de licenças para cheats/hacks com interface administrativa completa, integração com Supabase e Mercado Pago.

## Recent Changes
- ✓ 2025-06-24 19:37: Migração completa do Replit Agent para ambiente Replit
- ✓ 2025-06-24 19:40: PostgreSQL configurado e funcionando localmente
- ✓ 2025-06-24 19:45: Sistema de rotas API restaurado e operacional
- ✓ 2025-06-24 19:49: Rotas de pagamento PIX configuradas para produção (https://fovdark.shop)
- ✓ 2025-06-24 19:49: Webhook Mercado Pago funcional em produção e desenvolvimento
- ✓ 2025-06-24 19:49: CORS configurado para domínio de produção
- ✓ 2025-06-24 19:49: Sistema de pagamentos totalmente operacional com QR Code PIX
- ✓ 2025-06-24 19:54: Problema de exclusão de usuários no Supabase resolvido
- ✓ 2025-06-24 19:54: Função SQL segura criada para deletar usuários respeitando foreign keys
- ✓ 2025-06-24 19:55: Usuários regulares restaurados, admins extras removidos
- ✓ 2025-06-24 19:55: Mantido apenas admin@fovdark.com como administrador principal
- ✓ 2025-06-24 19:56: Senhas dos usuários regulares corrigidas para "senha123"

## User Preferences
- Comunicação em português brasileiro
- Foco em segurança e separação cliente/servidor
- Uso do Supabase como banco de dados principal
- Integração com Mercado Pago para pagamentos

## Project Architecture
### Backend (Node.js/Express)
- Autenticação JWT + Passport
- Sistema de licenças integrado
- Webhook Mercado Pago configurado para https://fovdark.shop
- API REST para frontend
- Rotas de pagamento: /api/payments/create-pix e /api/payments/pix
- CORS configurado para produção e desenvolvimento

### Frontend (React/Vite)
- Dashboard de usuário
- Painel administrativo
- Sistema de autenticação
- Interface para downloads

### Database (PostgreSQL/Supabase)
- Usuários e permissões (1 administrador, 5 usuários regulares)
- Licenças e pagamentos (29 registros de pagamento)
- Configurações do sistema
- Logs de auditoria
- Função SQL segura para limpeza de dados (delete_user_safely)

## Key Features
- Sistema centralizado de licenças
- Monitoramento automático de expiração
- Painel admin para gerenciar usuários e configurações
- Download seguro com verificação de licença
- Integração completa com Mercado Pago