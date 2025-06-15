import { pgTable, text, varchar, timestamp, jsonb, index, serial, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email").unique().notNull(),
  username: varchar("username").notNull(),
  password: varchar("password"), // nullable for OAuth users
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  hwid: varchar("hwid"),
  licenses: jsonb("licenses"), // Objeto JSON com informações da licença ativa do usuário
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Licenses table
export const licenses = pgTable("licenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  key: varchar("key").unique().notNull(),
  plan: varchar("plan").notNull(), // basic, premium, vip
  status: varchar("status").notNull().default("inactive"), // inactive, active, expired, revoked
  hwid: varchar("hwid"), // Hardware ID vinculado à licença
  daysRemaining: integer("days_remaining").default(0),
  hoursRemaining: integer("hours_remaining").default(0),
  minutesRemaining: integer("minutes_remaining").default(0),
  totalMinutesRemaining: integer("total_minutes_remaining").default(0), // Para facilitar cálculos
  expiresAt: timestamp("expires_at").notNull(),
  activatedAt: timestamp("activated_at"),
  lastHeartbeat: timestamp("last_heartbeat"), // Última vez que o loader verificou a licença
  createdAt: timestamp("created_at").defaultNow(),
});

// Activation keys table (before they're used)
export const activationKeys = pgTable("activation_keys", {
  id: serial("id").primaryKey(),
  key: varchar("key").unique().notNull(),
  plan: varchar("plan").notNull(),
  durationDays: integer("duration_days").notNull().default(30), // Duração em dias da licença
  isUsed: boolean("is_used").default(false),
  usedBy: integer("used_by").references(() => users.id),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Download logs
export const downloadLogs = pgTable("download_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  licenseId: integer("license_id").references(() => licenses.id).notNull(),
  fileName: varchar("file_name").notNull(),
  downloadedAt: timestamp("downloaded_at").defaultNow(),
});

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  token: varchar("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// HWID reset logs for tracking and rate limiting
export const hwidResetLogs = pgTable("hwid_reset_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  licenseId: integer("license_id").references(() => licenses.id).notNull(),
  oldHwid: varchar("old_hwid"),
  newHwid: varchar("new_hwid"),
  resetType: varchar("reset_type").notNull(), // 'manual', 'support', 'auto'
  resetReason: text("reset_reason"),
  adminId: integer("admin_id").references(() => users.id), // Admin que autorizou o reset
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mercado Pago payments table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  mercadoPagoId: varchar("mercado_pago_id").unique(), // ID do pagamento no Mercado Pago
  preferenceId: varchar("preference_id").unique(), // ID da preferência criada
  externalReference: varchar("external_reference").unique().notNull(), // Referência externa única
  status: varchar("status").notNull().default("pending"), // pending, approved, rejected, cancelled
  statusDetail: varchar("status_detail"), // Detalhe do status
  transactionAmount: integer("transaction_amount").notNull(), // Valor em centavos
  currency: varchar("currency").notNull().default("BRL"),
  plan: varchar("plan").notNull(), // basic, premium, vip
  durationDays: integer("duration_days").notNull(),
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
  createdAt: true,
  updatedAt: true,
});

export const createUserSchema = insertUserSchema.omit({
  username: true,
});

export const insertLicenseSchema = createInsertSchema(licenses).omit({
  id: true,
  createdAt: true,
});

export const insertActivationKeySchema = createInsertSchema(activationKeys).omit({
  id: true,
  createdAt: true,
  usedAt: true,
}).extend({
  durationDays: z.number().min(1).default(30),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido").max(254, "Email muito longo"),
  password: z.string().min(1, "Senha é obrigatória").max(128, "Senha muito longa"),
});

export const registerSchema = z.object({
  email: z.string().email("Email inválido").max(254, "Email muito longo"),
  username: z.string().optional(), // Será gerado automaticamente
  password: z.string()
    .min(6, "Senha deve ter pelo menos 6 caracteres")
    .max(128, "Senha muito longa"),
  firstName: z.string()
    .min(1, "Nome é obrigatório")
    .max(50, "Nome muito longo")
    .regex(/^[A-Za-zÀ-ÿ\s]+$/, "Nome deve conter apenas letras"),
  lastName: z.string()
    .min(1, "Sobrenome é obrigatório")
    .max(50, "Sobrenome muito longo")
    .regex(/^[A-Za-zÀ-ÿ\s]+$/, "Sobrenome deve conter apenas letras"),
});

export const activateKeySchema = z.object({
  key: z.string()
    .min(1, "Chave de ativação é obrigatória")
    .max(100, "Chave muito longa")
    .regex(/^[A-Za-z0-9\-_]+$/, "Chave contém caracteres inválidos"),
});

export const licenseStatusSchema = z.object({
  hwid: z.string().min(1),
});

export const heartbeatSchema = z.object({
  licenseKey: z.string().min(1),
  hwid: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: z.string().min(6, "Nova senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string().min(6, "Confirmação de senha é obrigatória"),
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

// Admin schemas
export const createActivationKeySchema = z.object({
  plan: z.enum(["test", "7days", "15days"]),
  durationDays: z.number().min(1).max(365),
  quantity: z.number().min(1).max(100).default(1),
});

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

// HWID protection schemas
export const updateHwidSchema = z.object({
  licenseKey: z.string().min(1, "Chave de licença é obrigatória"),
  hwid: z.string().min(1, "HWID é obrigatório").max(255, "HWID muito longo"),
});

export const resetHwidSchema = z.object({
  licenseKey: z.string().min(1, "Chave de licença é obrigatória"),
  reason: z.string().min(10, "Motivo deve ter pelo menos 10 caracteres").max(500, "Motivo muito longo"),
});

export const adminResetHwidSchema = z.object({
  licenseId: z.number().min(1, "ID da licença é obrigatório"),
  reason: z.string().min(10, "Motivo deve ter pelo menos 10 caracteres").max(500, "Motivo muito longo"),
  newHwid: z.string().optional(), // Se fornecido, força um HWID específico
});

// User License schema for the new centralized license system
export const userLicenseSchema = z.object({
  key: z.string(),
  plan: z.enum(["test", "7days", "15days"]),
  status: z.enum(["inactive", "active", "expired", "pending"]).default("pending"),
  hwid: z.string().optional(),
  daysRemaining: z.number().min(0).default(0),
  hoursRemaining: z.number().min(0).max(23).default(0),
  minutesRemaining: z.number().min(0).max(59).default(0),
  totalMinutesRemaining: z.number().min(0).default(0),
  expiresAt: z.string(), // ISO date string
  activatedAt: z.string().optional(), // ISO date string
  lastHeartbeat: z.string().optional(), // ISO date string
  createdAt: z.string(), // ISO date string
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
export type License = typeof licenses.$inferSelect;
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type ActivationKey = typeof activationKeys.$inferSelect;
export type InsertActivationKey = z.infer<typeof insertActivationKeySchema>;
export type DownloadLog = typeof downloadLogs.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type HwidResetLog = typeof hwidResetLogs.$inferSelect;
export type InsertHwidResetLog = typeof hwidResetLogs.$inferInsert;
