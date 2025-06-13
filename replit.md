# FovDark - Software Licensing Platform

## Overview

FovDark is a comprehensive software licensing platform designed specifically for gaming tools and cheats, particularly focused on BloodStrike. The application provides a complete licensing system with user authentication, payment processing, and software distribution capabilities.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: Shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS with custom gaming-themed design system
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES Modules
- **Authentication**: Passport.js with local strategy and session management
- **Session Storage**: PostgreSQL-backed session store
- **Password Security**: bcrypt for password hashing
- **API Design**: RESTful API with comprehensive error handling

### Database Architecture
- **Primary Database**: PostgreSQL with Drizzle ORM (Supabase hosted)
- **Connection**: Supabase PostgreSQL with postgres-js connection pooling
- **Schema Management**: Drizzle Kit for migrations and schema evolution
- **Session Management**: PostgreSQL session store for authentication
- **Hosting**: Render for application deployment
- **Database Provider**: Supabase for PostgreSQL database services

## Key Components

### Authentication System
- Server-side session-based authentication with JWT tokens
- Password reset functionality with email notifications
- Hardware ID (HWID) binding for license security
- Role-based access control (admin/user permissions)

### License Management
- Activation key system with time-based licenses
- Hardware binding to prevent sharing
- Heartbeat system for real-time license validation
- Multiple plan tiers (7-day, 15-day) with different features

### User Interface
- Dark-themed gaming aesthetic with neon accents
- Responsive design optimized for desktop and mobile
- Custom color scheme using CSS variables
- Gaming-focused typography (Orbitron, Rajdhani fonts)

### Payment Integration
- Stripe integration for payment processing
- Multiple payment methods supported
- Automated license activation upon payment
- Checkout flow with plan selection

## Data Flow

### User Registration/Login
1. User submits credentials through React form
2. Form validation using Zod schemas
3. Backend authentication via Passport.js
4. Session creation and JWT token generation
5. Client-side state update and redirect

### License Activation
1. User enters activation key in dashboard
2. HWID generation on client-side
3. Server validates key and binds to HWID
4. License status update in database
5. Real-time heartbeat system activation

### Software Download
1. License validation check
2. HWID verification
3. Download logging for analytics
4. Secure file serving from protected directory

## External Dependencies

### Core Dependencies
- **@supabase/supabase-js**: Supabase client for PostgreSQL
- **postgres**: PostgreSQL driver for Node.js
- **drizzle-orm**: Type-safe database ORM
- **passport**: Authentication middleware
- **bcrypt**: Password hashing
- **jsonwebtoken**: JWT token management
- **nodemailer**: Email functionality

### Frontend Dependencies
- **@tanstack/react-query**: Server state management
- **@hookform/resolvers**: Form validation
- **@radix-ui/react-***: UI component primitives
- **wouter**: Lightweight routing
- **zod**: Schema validation

### Development Dependencies
- **vite**: Build tool and dev server
- **typescript**: Type checking
- **tailwindcss**: CSS framework
- **tsx**: TypeScript execution for development

## Deployment Strategy

### Production Configuration
- **Hosting Provider**: Render for application deployment
- **Database Provider**: Supabase for PostgreSQL services
- **Runtime**: Node.js 20 with web module support
- **Development**: `npm run dev` starts both frontend and backend
- **Production**: `npm run build` followed by `npm run start`
- **Port Configuration**: Internal port 5000, external port 80
- **Auto-scaling**: Configured for autoscale deployment

### Build Process
1. Vite builds the React frontend to `dist/public`
2. esbuild bundles the Express server to `dist/index.js`
3. Static assets served from the dist directory
4. Environment variables loaded from `.env` file

### Database Management
- Drizzle migrations stored in `./migrations` directory
- Schema defined in `shared/schema.ts`
- Database push via `npm run db:push` command

## Changelog

- June 13, 2025. Initial setup
- June 13, 2025. Migrated from Neon to Supabase for PostgreSQL database
- June 13, 2025. Comprehensive code review and bug fixes completed
- June 13, 2025. Updated database connection to use postgres-js driver
- June 13, 2025. Fixed username field requirements in user schema
- June 13, 2025. Completed migration to Replit environment
- June 13, 2025. Fixed admin authentication system and session management
- June 13, 2025. Translated all error messages to Portuguese
- June 13, 2025. Admin login credentials: lsalles102@gmail.com / admin123
- June 13, 2025. Fixed user registration issue - migrated from MemStorage to PostgresStorage
- June 13, 2025. Successfully verified Supabase database integration and user creation
- June 13, 2025. Completed migration from Replit Agent to Replit environment
- June 13, 2025. Added profile update and password change functionality to settings
- June 13, 2025. Removed theme interface selection from system preferences
- June 13, 2025. Removed system preferences section entirely, keeping only Profile and Security tabs
- June 13, 2025. Modified license activation to remove HWID field from user interface
- June 13, 2025. HWID now collected automatically by loader via /api/licenses/set-hwid endpoint
- June 13, 2025. Added "pending" license status until HWID is set by loader

## User Preferences

Preferred communication style: Simple, everyday language.