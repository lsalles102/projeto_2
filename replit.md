# FovDark License Management System

## Project Overview
Sistema de gerenciamento de licenças para cheats/hacks com interface administrativa completa, integração com Supabase e Mercado Pago.

## Recent Changes
- ✓ 2025-01-24 17:12: Migração completa do Replit Agent para ambiente Replit padrão
- ✓ 2025-01-24 17:12: Usuário admin criado (admin@fovdark.com / admin123)
- ✓ 2025-01-24 17:13: Sistema de autenticação administrativo funcionando
- ✓ 2025-01-24 17:13: Painel admin com controle de URL de download operacional
- ✓ 2025-01-24 17:44: Sistema de pagamentos PIX funcionando com Mercado Pago
- ✓ 2025-01-24 17:45: Corrigido redirecionamento para Mercado Pago
- ✓ 2025-01-24 17:46: Adicionados botões de redirecionamento e página de falha de pagamento
- ✓ 2025-01-24 18:10: Corrigido problema de autenticação no frontend
- ✓ 2025-01-24 18:10: Sistema de pagamentos totalmente funcional e testado
- ✓ 2025-01-24 18:43: Preços atualizados - 7 dias: R$ 9,90 / 15 dias: R$ 18,90
- ✓ 2025-01-24 18:53: Diagnosticado Render - API funcionando, PIX gerando, precisando de redeploy do frontend

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