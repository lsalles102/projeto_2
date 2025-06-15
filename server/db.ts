import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const finalUrl = process.env.DATABASE_URL;

// Configure postgres connection for production deployment
const isProduction = process.env.NODE_ENV === 'production';

const client = postgres(finalUrl!, {
  max: isProduction ? 20 : 10,
  idle_timeout: isProduction ? 30 : 20,
  connect_timeout: isProduction ? 30 : 10,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  prepare: false, // Disable prepared statements for better compatibility
});

export const db = drizzle(client, { schema });