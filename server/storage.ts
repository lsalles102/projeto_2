import {
  users,
  licenses,
  activationKeys,
  downloadLogs,
  type User,
  type InsertUser,
  type License,
  type InsertLicense,
  type ActivationKey,
  type InsertActivationKey,
  type DownloadLog
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        updatedAt: new Date(),
      })
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // License operations
  async getLicense(id: number): Promise<License | undefined> {
    const [license] = await db.select().from(licenses).where(eq(licenses.id, id));
    return license;
  }

  async getLicenseByUserId(userId: number): Promise<License | undefined> {
    const [license] = await db.select().from(licenses).where(eq(licenses.userId, userId));
    return license;
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    const [license] = await db.select().from(licenses).where(eq(licenses.key, key));
    return license;
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    const [license] = await db
      .insert(licenses)
      .values(licenseData)
      .returning();
    return license;
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    const [license] = await db
      .update(licenses)
      .set(updates)
      .where(eq(licenses.id, id))
      .returning();
    return license;
  }

  // Activation key operations
  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    const [activationKey] = await db.select().from(activationKeys).where(eq(activationKeys.key, key));
    return activationKey;
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    const [activationKey] = await db
      .insert(activationKeys)
      .values(activationKeyData)
      .returning();
    return activationKey;
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    const [activationKey] = await db
      .update(activationKeys)
      .set({
        isUsed: true,
        usedBy: userId,
        usedAt: new Date(),
      })
      .where(eq(activationKeys.key, key))
      .returning();
    return activationKey;
  }

  // Download operations
  async logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog> {
    const [downloadLog] = await db
      .insert(downloadLogs)
      .values({
        userId,
        licenseId,
        fileName,
      })
      .returning();
    return downloadLog;
  }

  async getUserDownloads(userId: number): Promise<DownloadLog[]> {
    return await db.select().from(downloadLogs).where(eq(downloadLogs.userId, userId));
  }
}

export const storage = new DatabaseStorage();
