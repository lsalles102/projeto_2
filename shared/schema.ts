import { pgTable, text, varchar, timestamp, jsonb, index, serial, boolean, integer, decimal, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for authentication (using auth schema for Supabase compatibility)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table (extending Supabase auth.users)
export const users = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(),
  is_admin: boolean("is_admin").default(false).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  hwid: varchar("hwid"),
  
  // Sistema simplificado de licenças - integrado ao usuário
  license_status: varchar("license_status").default("sem_licenca"), // "ativa", "expirada", "sem_licenca"
  license_plan: varchar("license_plan"), // "test", "7days", "15days"
  license_expires_at: timestamp("license_expires_at"),
  license_activated_at: timestamp("license_activated_at"),
  license_total_minutes: integer("license_total_minutes").default(0),
  license_remaining_minutes: integer("license_remaining_minutes").default(0),
  license_last_heartbeat: timestamp("license_last_heartbeat"),
  
  // Campos mantidos para compatibilidade
  username: varchar("username"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
});

// Tabela para histórico de licenças (opcional, para auditoria)
export const licenseHistory = pgTable("license_history", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  action: varchar("action").notNull(), // "activated", "expired", "extended", "revoked"
  plan: varchar("plan").notNull(),
  minutes_added: integer("minutes_added").default(0),
  previous_status: varchar("previous_status"),
  new_status: varchar("new_status"),
  payment_id: varchar("payment_id"), // Referência ao pagamento que ativou
  admin_id: uuid("admin_id").references(() => users.id), // Se foi ação de admin
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
});

// Download logs
export const downloadLogs = pgTable("download_logs", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  fileName: varchar("file_name").notNull(),
  downloadedAt: timestamp("downloaded_at").defaultNow(),
});

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  token: varchar("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// HWID reset logs for tracking and rate limiting
export const hwidResetLogs = pgTable("hwid_reset_logs", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  oldHwid: varchar("old_hwid"),
  newHwid: varchar("new_hwid"),
  resetType: varchar("reset_type").notNull(), // 'manual', 'support', 'auto'
  resetReason: text("reset_reason"),
  adminId: uuid("admin_id").references(() => users.id), // Admin que autorizou o reset
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mercado Pago payments table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  mercadoPagoId: varchar("mercado_pago_id").unique(), // ID do pagamento no Mercado Pago
  preferenceId: varchar("preference_id").unique(), // ID da preferência criada
  externalReference: varchar("external_reference").unique().notNull(), // Referência externa única
  status: varchar("status").notNull().default("pending"), // pending, approved, rejected, cancelled
  statusDetail: varchar("status_detail"), // Detalhe do status
  transactionAmount: integer("transaction_amount").notNull(), // Valor em centavos
  currency: varchar("currency").notNull().default("BRL"),
  plan: varchar("plan").notNull(), // basic, premium, vip
  durationDays: decimal("duration_days", { precision: 10, scale: 6 }).notNull(),
  payerEmail: varchar("payer_email"),
  payerFirstName: varchar("payer_first_name"),
  payerLastName: varchar("payer_last_name"),
  paymentMethodId: varchar("payment_method_id"), // pix, credit_card, etc
  notificationUrl: varchar("notification_url"),
  pixQrCode: text("pix_qr_code"), // Código QR do PIX
  pixQrCodeBase64: text("pix_qr_code_base64"), // QR Code em base64
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Schema validations
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  created_at: true,
  updated_at: true,
}).extend({
  username: z.string().optional(),
});

export const createUserSchema = insertUserSchema;

export const insertLicenseHistorySchema = createInsertSchema(licenseHistory).omit({
  id: true,
  created_at: true,
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido").max(254, "Email muito longo"),
  password: z.string().min(1, "Senha é obrigatória").max(128, "Senha muito longa"),
});

export const registerSchema = z.object({
  email: z.string().email("Email inválido").max(254, "Email muito longo"),
  password: z.string()
    .min(3, "Senha deve ter pelo menos 3 caracteres")
    .max(128, "Senha muito longa"),
  firstName: z.string()
    .min(1, "Nome é obrigatório")
    .max(50, "Nome muito longo"),
  lastName: z.string()
    .min(1, "Sobrenome é obrigatório")
    .max(50, "Sobrenome muito longo"),
});

// Schema para heartbeat do sistema de licenças
export const licenseHeartbeatSchema = z.object({
  hwid: z.string().min(1, "HWID é obrigatório"),
});

export const licenseStatusSchema = z.object({
  hwid: z.string().min(1),
});

export const heartbeatSchema = z.object({
  hwid: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string()
    .min(3, "Senha deve ter pelo menos 3 caracteres")
    .max(128, "Senha muito longa"),
  confirmPassword: z.string().min(3),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: z.string()
    .min(8, "Nova senha deve ter pelo menos 8 caracteres")
    .max(128, "Nova senha muito longa")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, 
      "Nova senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial (@$!%*?&)"),
  confirmPassword: z.string().min(8, "Confirmação de senha é obrigatória"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const contactSchema = z.object({
  name: z.string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome muito longo")
    .regex(/^[A-Za-zÀ-ÿ\s]+$/, "Nome deve conter apenas letras"),
  email: z.string().email("Email inválido").max(254, "Email muito longo"),
  subject: z.string()
    .min(1, "Assunto é obrigatório")
    .max(200, "Assunto muito longo"),
  message: z.string()
    .min(10, "Mensagem deve ter pelo menos 10 caracteres")
    .max(2000, "Mensagem muito longa"),
});

// Admin schemas (activation keys removed - now automatic after payment)

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  isAdmin: z.boolean().optional(),
});

export const updateLicenseSchema = z.object({
  status: z.enum(["inactive", "active", "expired", "revoked"]).optional(),
  daysRemaining: z.number().min(0).optional(),
  hoursRemaining: z.number().min(0).max(23).optional(),
  minutesRemaining: z.number().min(0).max(59).optional(),
});

// HWID protection schemas para o novo sistema
export const updateHwidSchema = z.object({
  hwid: z.string().min(1, "HWID é obrigatório").max(255, "HWID muito longo"),
});

export const resetHwidSchema = z.object({
  reason: z.string().min(10, "Motivo deve ter pelo menos 10 caracteres").max(500, "Motivo muito longo"),
});

export const adminResetHwidSchema = z.object({
  userId: z.string().min(1, "ID do usuário é obrigatório"),
  reason: z.string().min(10, "Motivo deve ter pelo menos 10 caracteres").max(500, "Motivo muito longo"),
  newHwid: z.string().optional(), // Se fornecido, força um HWID específico
});

export const activateKeySchema = z.object({
  key: z.string().min(1, "Chave é obrigatória"),
});

// User License schema for the new centralized license system (no keys - automatic activation)
export const userLicenseSchema = z.object({
  plan: z.enum(["test", "7days", "15days"]),
  status: z.enum(["sem_licenca", "ativa", "expirada"]),
  hwid: z.string().optional(),
  daysRemaining: z.number().min(0).default(0),
  hoursRemaining: z.number().min(0).max(23).default(0),
  minutesRemaining: z.number().min(0).max(59).default(0),
  totalMinutesRemaining: z.number().min(0).default(0),
  expiresAt: z.string().optional(), // ISO date string
  activatedAt: z.string().optional(), // ISO date string
  lastHeartbeat: z.string().optional(), // ISO date string
});

export type UserLicense = z.infer<typeof userLicenseSchema>;

// PIX payment schemas
export const createPixPaymentSchema = z.object({
  plan: z.enum(["test", "7days", "15days"]),
  durationDays: z.number().min(0.001).max(365), // Permitir valores decimais para plano de teste (30 minutos = 0.021 dias)
  payerEmail: z.string().email(),
  payerFirstName: z.string().min(1),
  payerLastName: z.string().min(1),
});

export const mercadoPagoWebhookSchema = z.object({
  id: z.number().optional(),
  live_mode: z.boolean().optional(),
  type: z.string(),
  date_created: z.string().optional(),
  application_id: z.union([z.number(), z.string()]).optional(),
  user_id: z.union([z.number(), z.string()]).optional(),
  version: z.number().optional(),
  api_version: z.string().optional(),
  action: z.string().optional(),
  data: z.object({
    id: z.string(),
  }).optional(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LicenseHistory = typeof licenseHistory.$inferSelect;
export type InsertLicenseHistory = z.infer<typeof insertLicenseHistorySchema>;
export type DownloadLog = typeof downloadLogs.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type HwidResetLog = typeof hwidResetLogs.$inferSelect;
export type InsertHwidResetLog = typeof hwidResetLogs.$inferInsert;


