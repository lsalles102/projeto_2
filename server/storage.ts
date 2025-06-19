import {
  type User,
  type InsertUser,
  type DownloadLog,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type Payment,
  type InsertPayment,
  type HwidResetLog,
  type InsertHwidResetLog
} from "@shared/schema";

export interface SystemSetting {
  id: number;
  key: string;
  value: string;
  description?: string;
  updatedBy?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface IStorage {
  // User operations (with integrated license system)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  
  // Download operations
  logDownload(userId: string, fileName: string): Promise<DownloadLog>;
  getUserDownloads(userId: string): Promise<DownloadLog[]>;
  
  // Password reset operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken>;
  deleteExpiredPasswordResetTokens(): Promise<void>;
  
  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentById(id: number): Promise<Payment | undefined>;
  getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined>;
  updatePaymentByExternalReference(externalReference: string, updates: Partial<Payment>): Promise<Payment>;
  
  // HWID reset operations
  logHwidReset(log: InsertHwidResetLog): Promise<HwidResetLog>;
  getUserHwidResets(userId: string): Promise<HwidResetLog[]>;
  
  // Admin operations
  getAllUsers(): Promise<User[]>;
  getAllPayments(): Promise<Payment[]>;
  getSystemStats(): Promise<any>;
  deleteUser(id: string): Promise<void>;
  
  // System settings operations
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  setSystemSetting(key: string, value: string, updatedBy?: string, description?: string): Promise<SystemSetting>;
  getAllSystemSettings(): Promise<SystemSetting[]>;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    try {
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getUser:", error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getUserByEmail:", error);
      return undefined;
    }
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    
    const result = await db.insert(users).values({
      ...user,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning();
    
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.update(users)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error('User not found');
    }
    
    return result[0];
  }

  async logDownload(userId: string, fileName: string): Promise<DownloadLog> {
    const { db } = await import("./db");
    const { downloadLogs } = await import("@shared/schema");
    
    const result = await db.insert(downloadLogs).values({
      userId,
      fileName,
      downloadedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async getUserDownloads(userId: string): Promise<DownloadLog[]> {
    const { db } = await import("./db");
    const { downloadLogs } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    return await db.select().from(downloadLogs).where(eq(downloadLogs.userId, userId));
  }

  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const { db } = await import("./db");
    const { passwordResetTokens } = await import("@shared/schema");
    
    const result = await db.insert(passwordResetTokens).values({
      ...token,
      createdAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const { db } = await import("./db");
    const { passwordResetTokens } = await import("@shared/schema");
    const { eq, and, gt } = await import("drizzle-orm");
    
    const result = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, new Date())
      ))
      .limit(1);
    
    return result[0];
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken> {
    const { db } = await import("./db");
    const { passwordResetTokens } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token))
      .returning();
    
    if (result.length === 0) {
      throw new Error('Password reset token not found');
    }
    
    return result[0];
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    const { db } = await import("./db");
    const { passwordResetTokens } = await import("@shared/schema");
    const { or, lt, eq } = await import("drizzle-orm");
    
    try {
      const result = await db.delete(passwordResetTokens)
        .where(or(
          lt(passwordResetTokens.expiresAt, new Date()),
          eq(passwordResetTokens.used, true)
        ))
        .returning();
      
      console.log(`[CLEANUP] Removidos ${result.length} tokens de reset expirados/usados`);
    } catch (error) {
      console.error("[CLEANUP] Erro ao limpar tokens de reset:", error);
    }
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    
    const result = await db.insert(payments).values({
      ...payment,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async getPaymentById(id: number): Promise<Payment | undefined> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.select().from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    
    return result[0];
  }

  async getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.select().from(payments)
      .where(eq(payments.externalReference, externalReference))
      .limit(1);
    
    return result[0];
  }

  async updatePaymentByExternalReference(externalReference: string, updates: Partial<Payment>): Promise<Payment> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.update(payments)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(payments.externalReference, externalReference))
      .returning();
    
    if (result.length === 0) {
      throw new Error('Payment not found');
    }
    
    return result[0];
  }

  async logHwidReset(log: InsertHwidResetLog): Promise<HwidResetLog> {
    const { db } = await import("./db");
    const { hwidResetLogs } = await import("@shared/schema");
    
    const result = await db.insert(hwidResetLogs).values({
      ...log,
      createdAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async getUserHwidResets(userId: string): Promise<HwidResetLog[]> {
    const { db } = await import("./db");
    const { hwidResetLogs } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    return await db.select().from(hwidResetLogs).where(eq(hwidResetLogs.userId, userId));
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      
      return await db.select().from(users);
    } catch (error) {
      console.error("Database error in getAllUsers:", error);
      return [];
    }
  }

  async getAllPayments(): Promise<Payment[]> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    
    return await db.select().from(payments);
  }

  async getSystemStats(): Promise<any> {
    const { db } = await import("./db");
    const { users, payments } = await import("@shared/schema");
    const { eq, and, gte } = await import("drizzle-orm");
    
    const totalUsers = await db.select().from(users);
    const activeLicenses = await db.select().from(users)
      .where(and(
        eq(users.license_status, "ativa"),
        gte(users.license_expires_at, new Date())
      ));
    
    const allPayments = await db.select().from(payments);
    const approvedPayments = allPayments.filter(p => p.status === "approved");
    
    return {
      totalUsers: totalUsers.length,
      activeLicenses: activeLicenses.length,
      totalPayments: allPayments.length,
      approvedPayments: approvedPayments.length,
      totalRevenue: approvedPayments.reduce((sum, p) => sum + (p.transactionAmount || 0), 0) / 100, // Convert from cents
      monthlyRevenue: approvedPayments
        .filter(p => p.createdAt && new Date(p.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .reduce((sum, p) => sum + (p.transactionAmount || 0), 0) / 100
    };
  }

  async deleteUser(id: string): Promise<void> {
    const { db } = await import("./db");
    const { users, downloadLogs, passwordResetTokens, payments, hwidResetLogs } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    // Delete related data first to maintain referential integrity
    await db.delete(downloadLogs).where(eq(downloadLogs.userId, id));
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
    await db.delete(payments).where(eq(payments.userId, id));
    await db.delete(hwidResetLogs).where(eq(hwidResetLogs.userId, id));
    
    // Finally delete the user
    const result = await db.delete(users).where(eq(users.id, id));
    
    // No PostgreSQL, o resultado do delete pode não ter rowCount
    // Verificamos se o usuário existia antes de tentar deletar
    const userExists = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (userExists.length === 0) {
      // User was successfully deleted or didn't exist
      console.log(`Usuário ${id} deletado com sucesso`);
    }
  }

  // System settings operations
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    try {
      const { db } = await import("./db");
      const { systemSettings } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
      
      if (result.length === 0) {
        return undefined;
      }
      
      const row = result[0];
      return {
        id: row.id,
        key: row.key,
        value: row.value,
        description: row.description || undefined,
        updatedBy: row.updatedBy || undefined,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt
      };
    } catch (error) {
      console.error(`Erro ao buscar configuração ${key}:`, error);
      return undefined;
    }
  }

  async setSystemSetting(key: string, value: string, updatedBy?: string, description?: string): Promise<SystemSetting> {
    try {
      const { db } = await import("./db");
      const { systemSettings } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      // Verificar se a configuração já existe
      const existing = await this.getSystemSetting(key);
      
      let result;
      if (existing) {
        // Atualizar configuração existente
        result = await db.update(systemSettings)
          .set({
            value: value,
            description: description || existing.description,
            updatedBy: updatedBy,
            updatedAt: new Date()
          })
          .where(eq(systemSettings.key, key))
          .returning();
      } else {
        // Criar nova configuração
        result = await db.insert(systemSettings)
          .values({
            key: key,
            value: value,
            description: description,
            updatedBy: updatedBy
          })
          .returning();
      }
      
      const row = result[0];
      return {
        id: row.id,
        key: row.key,
        value: row.value,
        description: row.description || undefined,
        updatedBy: row.updatedBy || undefined,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt
      };
    } catch (error) {
      console.error(`Erro ao definir configuração ${key}:`, error);
      throw error;
    }
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    try {
      const { db } = await import("./db");
      const { systemSettings } = await import("@shared/schema");
      
      const result = await db.select().from(systemSettings).orderBy(systemSettings.key);
      
      return result.map((row) => ({
        id: row.id,
        key: row.key,
        value: row.value,
        description: row.description || undefined,
        updatedBy: row.updatedBy || undefined,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt
      }));
    } catch (error) {
      console.error("Erro ao buscar todas as configurações:", error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();