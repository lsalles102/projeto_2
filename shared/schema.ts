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
  password: varchar("password"), // nullable for OAuth users
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  hwid: varchar("hwid"),
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
  hwid: varchar("hwid"),
  expiresAt: timestamp("expires_at").notNull(),
  activatedAt: timestamp("activated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Activation keys table (before they're used)
export const activationKeys = pgTable("activation_keys", {
  id: serial("id").primaryKey(),
  key: varchar("key").unique().notNull(),
  plan: varchar("plan").notNull(),
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

// Schema validations
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLicenseSchema = createInsertSchema(licenses).omit({
  id: true,
  createdAt: true,
});

export const insertActivationKeySchema = createInsertSchema(activationKeys).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export const activateKeySchema = z.object({
  key: z.string().min(1),
  hwid: z.string().min(1),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type License = typeof licenses.$inferSelect;
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type ActivationKey = typeof activationKeys.$inferSelect;
export type InsertActivationKey = z.infer<typeof insertActivationKeySchema>;
export type DownloadLog = typeof downloadLogs.$inferSelect;
