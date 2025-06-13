import {
  type User,
  type InsertUser,
  type License,
  type InsertLicense,
  type ActivationKey,
  type InsertActivationKey,
  type DownloadLog,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  users,
  licenses,
  activationKeys,
  downloadLogs,
  passwordResetTokens
} from "@shared/schema";
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { eq, and, gt, lt } from 'drizzle-orm';
import * as schema from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: User[] = [];
  private licenses: License[] = [];
  private activationKeys: ActivationKey[] = [];
  private downloadLogs: DownloadLog[] = [];
  private passwordResetTokens: PasswordResetToken[] = [];
  private nextUserId = 1;
  private nextLicenseId = 1;
  private nextDownloadId = 1;
  private nextActivationKeyId = 1;
  private nextPasswordResetTokenId = 1;

  constructor() {
    // Initialize test data synchronously with pre-hashed password
    this.initializeTestDataSync();
  }

  private initializeTestDataSync() {
    // Pre-hashed password for 'capajack' using bcrypt with salt rounds 10
    const preHashedPassword = '$2b$10$p19sgJ4wwPZO6UdBcB3I8OmnsGfNPGtcgXUglkEHuKTA1ON2b2PCm';
    
    const testUser: User = {
      id: 1,
      email: 'lsalles102@gmail.com',
      password: preHashedPassword,
      firstName: 'Lucas',
      lastName: 'Salles',
      profileImageUrl: null,
      googleId: null,
      hwid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.users.push(testUser);
    this.nextUserId = 2;

    // Create some test activation keys
    const testKeys = [
      { key: 'FOVD-TEST-7DAY-001', plan: '7days' as const },
      { key: 'FOVD-TEST-15DAY-001', plan: '15days' as const },
      { key: 'FOVD-DEMO-7DAY-001', plan: '7days' as const },
    ];

    for (const keyData of testKeys) {
      const activationKey: ActivationKey = {
        id: this.nextActivationKeyId++,
        key: keyData.key,
        plan: keyData.plan,
        isUsed: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date(),
      };
      this.activationKeys.push(activationKey);
    }
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.find(user => user.email === email);
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return this.users.find(user => user.googleId === googleId);
  }

  async createUser(userData: InsertUser): Promise<User> {
    const user: User = {
      id: this.nextUserId++,
      email: userData.email,
      password: userData.password || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      googleId: userData.googleId || null,
      hwid: userData.hwid || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    this.users[userIndex] = {
      ...this.users[userIndex],
      ...updates,
      updatedAt: new Date(),
    };
    return this.users[userIndex];
  }

  // License operations
  async getLicense(id: number): Promise<License | undefined> {
    return this.licenses.find(license => license.id === id);
  }

  async getLicenseByUserId(userId: number): Promise<License | undefined> {
    return this.licenses.find(license => license.userId === userId);
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    return this.licenses.find(license => license.key === key);
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    const license: License = {
      id: this.nextLicenseId++,
      userId: licenseData.userId,
      key: licenseData.key,
      plan: licenseData.plan,
      status: licenseData.status || "inactive",
      hwid: licenseData.hwid || null,
      expiresAt: licenseData.expiresAt,
      activatedAt: licenseData.activatedAt || null,
      createdAt: new Date(),
    };
    this.licenses.push(license);
    return license;
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    const licenseIndex = this.licenses.findIndex(license => license.id === id);
    if (licenseIndex === -1) {
      throw new Error('License not found');
    }
    
    this.licenses[licenseIndex] = {
      ...this.licenses[licenseIndex],
      ...updates,
    };
    return this.licenses[licenseIndex];
  }

  // Activation key operations
  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    return this.activationKeys.find(ak => ak.key === key);
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    const activationKey: ActivationKey = {
      id: this.nextActivationKeyId++,
      key: activationKeyData.key,
      plan: activationKeyData.plan,
      createdAt: new Date(),
      isUsed: false,
      usedBy: null,
      usedAt: null,
    };
    this.activationKeys.push(activationKey);
    return activationKey;
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    const akIndex = this.activationKeys.findIndex(ak => ak.key === key);
    if (akIndex === -1) {
      throw new Error('Activation key not found');
    }
    
    this.activationKeys[akIndex] = {
      ...this.activationKeys[akIndex],
      isUsed: true,
      usedBy: userId,
      usedAt: new Date(),
    };
    return this.activationKeys[akIndex];
  }

  // Download operations
  async logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog> {
    const downloadLog: DownloadLog = {
      id: this.nextDownloadId++,
      userId,
      licenseId,
      fileName,
      downloadedAt: new Date(),
    };
    this.downloadLogs.push(downloadLog);
    return downloadLog;
  }

  async getUserDownloads(userId: number): Promise<DownloadLog[]> {
    return this.downloadLogs.filter(log => log.userId === userId);
  }

  // Password reset operations
  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const token: PasswordResetToken = {
      id: this.nextPasswordResetTokenId++,
      userId: tokenData.userId,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      used: false,
      createdAt: new Date(),
    };
    this.passwordResetTokens.push(token);
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    return this.passwordResetTokens.find(t => t.token === token && !t.used && t.expiresAt > new Date());
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken> {
    const tokenIndex = this.passwordResetTokens.findIndex(t => t.token === token);
    if (tokenIndex === -1) {
      throw new Error("Token não encontrado");
    }
    this.passwordResetTokens[tokenIndex] = {
      ...this.passwordResetTokens[tokenIndex],
      used: true,
    };
    return this.passwordResetTokens[tokenIndex];
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    const now = new Date();
    this.passwordResetTokens = this.passwordResetTokens.filter(t => t.expiresAt > now);
  }
}

// PostgreSQL storage implementation using Drizzle ORM
export class PostgresStorage implements IStorage {
  private db = drizzle({ client: pool, schema });

  async getUser(id: number): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.googleId, googleId));
    return result[0];
  }

  async createUser(userData: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(userData).returning();
    return result[0];
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const result = await this.db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getLicense(id: number): Promise<License | undefined> {
    const result = await this.db.select().from(licenses).where(eq(licenses.id, id));
    return result[0];
  }

  async getLicenseByUserId(userId: number): Promise<License | undefined> {
    const result = await this.db.select().from(licenses).where(eq(licenses.userId, userId));
    return result[0];
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    const result = await this.db.select().from(licenses).where(eq(licenses.key, key));
    return result[0];
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    const result = await this.db.insert(licenses).values(licenseData).returning();
    return result[0];
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    const result = await this.db.update(licenses).set(updates).where(eq(licenses.id, id)).returning();
    return result[0];
  }

  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    const result = await this.db.select().from(activationKeys).where(eq(activationKeys.key, key));
    return result[0];
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    const result = await this.db.insert(activationKeys).values(activationKeyData).returning();
    return result[0];
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    const result = await this.db.update(activationKeys)
      .set({ isUsed: true, usedBy: userId, usedAt: new Date() })
      .where(eq(activationKeys.key, key))
      .returning();
    return result[0];
  }

  async logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog> {
    const result = await this.db.insert(downloadLogs)
      .values({ userId, licenseId, fileName, downloadedAt: new Date() })
      .returning();
    return result[0];
  }

  async getUserDownloads(userId: number): Promise<DownloadLog[]> {
    return await this.db.select().from(downloadLogs).where(eq(downloadLogs.userId, userId));
  }

  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const result = await this.db.insert(passwordResetTokens).values(tokenData).returning();
    return result[0];
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const result = await this.db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, new Date())
      ));
    return result[0];
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken> {
    const result = await this.db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token))
      .returning();
    return result[0];
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    await this.db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));
  }
}

export const storage = new PostgresStorage();