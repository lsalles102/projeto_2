import {
  type User,
  type InsertUser,
  type License,
  type InsertLicense,
  type ActivationKey,
  type InsertActivationKey,
  type DownloadLog,
  type PasswordResetToken,
  type InsertPasswordResetToken
} from "@shared/schema";
import bcrypt from "bcrypt";
import { db } from "./db";
import { users, licenses, activationKeys, downloadLogs, passwordResetTokens } from "@shared/schema";
import { eq, and, gt, lt, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  
  // License operations
  getLicense(id: number): Promise<License | undefined>;
  getLicenseByUserId(userId: number): Promise<License | undefined>;
  getLicenseByKey(key: string): Promise<License | undefined>;
  createLicense(license: InsertLicense): Promise<License>;
  updateLicense(id: number, updates: Partial<License>): Promise<License>;
  
  // Activation key operations
  getActivationKey(key: string): Promise<ActivationKey | undefined>;
  createActivationKey(activationKey: InsertActivationKey): Promise<ActivationKey>;
  markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey>;
  
  // Download operations
  logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog>;
  getUserDownloads(userId: number): Promise<DownloadLog[]>;
  
  // Password reset operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken>;
  deleteExpiredPasswordResetTokens(): Promise<void>;
}

// PostgreSQL storage implementation
export class PostgresStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    try {
      const result = await db.query.users.findFirst({
        where: eq(users.id, id)
      });
      return result;
    } catch (error) {
      console.error('Error getting user:', error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.query.users.findFirst({
        where: eq(users.email, email)
      });
      return result;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return undefined;
    }
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    try {
      const result = await db.query.users.findFirst({
        where: eq(users.googleId, googleId)
      });
      return result;
    } catch (error) {
      console.error('Error getting user by google id:', error);
      return undefined;
    }
  }

  async createUser(userData: InsertUser): Promise<User> {
    try {
      const [result] = await db.insert(users)
        .values(userData)
        .returning();
      return result;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    try {
      const [result] = await db.update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // License operations
  async getLicense(id: number): Promise<License | undefined> {
    try {
      const result = await db.query.licenses.findFirst({
        where: eq(licenses.id, id)
      });
      return result;
    } catch (error) {
      console.error('Error getting license:', error);
      return undefined;
    }
  }

  async getLicenseByUserId(userId: number): Promise<License | undefined> {
    try {
      const result = await db.query.licenses.findFirst({
        where: eq(licenses.userId, userId)
      });
      return result;
    } catch (error) {
      console.error('Error getting license by user id:', error);
      return undefined;
    }
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    try {
      const result = await db.query.licenses.findFirst({
        where: eq(licenses.licenseKey, key)
      });
      return result;
    } catch (error) {
      console.error('Error getting license by key:', error);
      return undefined;
    }
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    try {
      const [result] = await db.insert(licenses)
        .values(licenseData)
        .returning();
      return result;
    } catch (error) {
      console.error('Error creating license:', error);
      throw error;
    }
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    try {
      const [result] = await db.update(licenses)
        .set(updates)
        .where(eq(licenses.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error('Error updating license:', error);
      throw error;
    }
  }

  // Activation key operations
  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    try {
      const result = await db.query.activationKeys.findFirst({
        where: eq(activationKeys.key, key)
      });
      return result;
    } catch (error) {
      console.error('Error getting activation key:', error);
      return undefined;
    }
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    try {
      const [result] = await db.insert(activationKeys)
        .values(activationKeyData)
        .returning();
      return result;
    } catch (error) {
      console.error('Error creating activation key:', error);
      throw error;
    }
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    try {
      const [result] = await db.update(activationKeys)
        .set({
          isUsed: true,
          usedBy: userId,
          usedAt: new Date()
        })
        .where(eq(activationKeys.key, key))
        .returning();
      return result;
    } catch (error) {
      console.error('Error marking activation key as used:', error);
      throw error;
    }
  }

  // Download operations
  async logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog> {
    try {
      const [result] = await db.insert(downloadLogs)
        .values({
          userId,
          licenseId,
          fileName,
          downloadedAt: new Date()
        })
        .returning();
      return result;
    } catch (error) {
      console.error('Error logging download:', error);
      throw error;
    }
  }

  async getUserDownloads(userId: number): Promise<DownloadLog[]> {
    try {
      const result = await db.query.downloadLogs.findMany({
        where: eq(downloadLogs.userId, userId),
        orderBy: [desc(downloadLogs.downloadedAt)]
      });
      return result;
    } catch (error) {
      console.error('Error getting user downloads:', error);
      return [];
    }
  }

  // Password reset operations
  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    try {
      const [result] = await db.insert(passwordResetTokens)
        .values(tokenData)
        .returning();
      return result;
    } catch (error) {
      console.error('Error creating password reset token:', error);
      throw error;
    }
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    try {
      const result = await db.query.passwordResetTokens.findFirst({
        where: eq(passwordResetTokens.token, token)
      });
      return result;
    } catch (error) {
      console.error('Error getting password reset token:', error);
      return undefined;
    }
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken> {
    try {
      const [result] = await db.update(passwordResetTokens)
        .set({ isUsed: true })
        .where(eq(passwordResetTokens.token, token))
        .returning();
      return result;
    } catch (error) {
      console.error('Error marking password reset token as used:', error);
      throw error;
    }
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    try {
      await db.delete(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, new Date()));
    } catch (error) {
      console.error('Error deleting expired password reset tokens:', error);
    }
  }
}

export const storage = new PostgresStorage();