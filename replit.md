# FovDark License Management System

## Project Overview
Sistema de gerenciamento de licenças para cheats/hacks com interface administrativa completa, integração com Supabase e Mercado Pago.

## Recent Changes
- ✓ 2025-06-24 21:03: Migração completa do Replit Agent para ambiente Replit finalizada
- ✓ 2025-06-24 21:03: Sistema de autenticação JWT corrigido e funcional
- ✓ 2025-06-24 21:03: CORS configurado para ambiente de produção e desenvolvimento
- ✓ 2025-06-24 21:03: Logs detalhados implementados para debug de autenticação
- ✓ 2025-06-24 21:03: Tokens JWT sendo enviados corretamente nas requisições
- ✓ 2025-06-24 21:03: Dashboard e rotas protegidas funcionando perfeitamente
- ✓ 2025-06-24 21:03: Sistema de licenças operacional com monitoramento automático
- ✓ 2025-06-24 21:03: Integração Mercado Pago mantida e funcional
- ✓ 2025-06-24 21:03: Projeto pronto para ambiente de produção Render
- ✓ 2025-06-24 22:05: Problema de tokens não enviados em requisições resolvido
- ✓ 2025-06-24 22:05: Sistema de pagamento PIX unificado e testado
- ✓ 2025-06-24 22:05: Autenticação funcionando em todas as páginas
- ✓ 2025-06-24 22:05: Criação de pagamentos testada e confirmada (ID: 61)
- ✓ 2025-06-24 23:23: Sistema de download com licença ativa corrigido
- ✓ 2025-06-24 23:23: Autenticação JWT funcionando em endpoint de download
- ✓ 2025-06-24 23:23: API unificada com tokens automáticos em todas as requisições
- ✓ 2025-06-24 23:23: Fluxo completo testado: login → pagamento → ativação → download

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