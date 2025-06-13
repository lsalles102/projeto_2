# FovDark - Software Licensing Platform

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database and email settings
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Access Application**
   - Frontend: http://localhost:5000
   - Test Login: test@example.com / password123

## Configuration

### Database
The application uses PostgreSQL. Update DATABASE_URL in your .env file.

### Email (Optional)
Configure SMTP settings for password reset functionality.

### Session Security
Set a strong SESSION_SECRET for production use.

## Development

- `npm run dev` - Start development server
- `npm run db:push` - Push schema changes to database
- `npm run build` - Build for production

## Authentication System

The application uses server-side authentication with sessions and JWT tokens. No external authentication providers required.

## Project Structure

- `client/` - React frontend
- `server/` - Express backend
- `shared/` - Shared types and schemas
- `storage.ts` - Database abstraction layer