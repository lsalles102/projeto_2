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
import { eq, and, gt } from "drizzle-orm";

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

// PostgreSQL storage implementation using Drizzle
export class PostgresStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    try {
      const result = await db.execute(`SELECT * FROM users WHERE id = $1`, [id]);
      return result.rows[0] as User | undefined;
    } catch (error) {
      console.error('Error getting user:', error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.execute(`SELECT * FROM users WHERE email = $1`, [email]);
      return result.rows[0] as User | undefined;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return undefined;
    }
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    try {
      const result = await db.execute(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
      return result.rows[0] as User | undefined;
    } catch (error) {
      console.error('Error getting user by google id:', error);
      return undefined;
    }
  }

  async createUser(userData: InsertUser): Promise<User> {
    try {
      const result = await db.execute(`
        INSERT INTO users (email, password, first_name, last_name, profile_image_url, google_id, hwid)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        userData.email,
        userData.password || null,
        userData.firstName || null,
        userData.lastName || null,
        userData.profileImageUrl || null,
        userData.googleId || null,
        userData.hwid || null
      ]);
      return result.rows[0] as User;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    try {
      const setParts = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id') {
          const dbKey = key === 'firstName' ? 'first_name' : 
                       key === 'lastName' ? 'last_name' :
                       key === 'profileImageUrl' ? 'profile_image_url' :
                       key === 'googleId' ? 'google_id' :
                       key === 'createdAt' ? 'created_at' :
                       key === 'updatedAt' ? 'updated_at' : key;
          setParts.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      setParts.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await db.execute(`
        UPDATE users SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);
      
      return result.rows[0] as User;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // License operations
  async getLicense(id: number): Promise<License | undefined> {
    try {
      const result = await db.execute(`SELECT * FROM licenses WHERE id = $1`, [id]);
      return result.rows[0] as License | undefined;
    } catch (error) {
      console.error('Error getting license:', error);
      return undefined;
    }
  }

  async getLicenseByUserId(userId: number): Promise<License | undefined> {
    try {
      const result = await db.execute(`SELECT * FROM licenses WHERE user_id = $1`, [userId]);
      return result.rows[0] as License | undefined;
    } catch (error) {
      console.error('Error getting license by user id:', error);
      return undefined;
    }
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    try {
      const result = await db.execute(`SELECT * FROM licenses WHERE key = $1`, [key]);
      return result.rows[0] as License | undefined;
    } catch (error) {
      console.error('Error getting license by key:', error);
      return undefined;
    }
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    try {
      const result = await db.execute(`
        INSERT INTO licenses (user_id, key, plan, status, hwid, expires_at, activated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        licenseData.userId,
        licenseData.key,
        licenseData.plan,
        licenseData.status || 'active',
        licenseData.hwid || null,
        licenseData.expiresAt,
        licenseData.activatedAt || new Date()
      ]);
      return result.rows[0] as License;
    } catch (error) {
      console.error('Error creating license:', error);
      throw error;
    }
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    try {
      const setParts = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id') {
          const dbKey = key === 'userId' ? 'user_id' :
                       key === 'expiresAt' ? 'expires_at' :
                       key === 'activatedAt' ? 'activated_at' : key;
          setParts.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      values.push(id);

      const result = await db.execute(`
        UPDATE licenses SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);
      
      return result.rows[0] as License;
    } catch (error) {
      console.error('Error updating license:', error);
      throw error;
    }
  }

  // Activation key operations
  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    try {
      const result = await db.execute(`SELECT * FROM activation_keys WHERE key = $1`, [key]);
      return result.rows[0] as ActivationKey | undefined;
    } catch (error) {
      console.error('Error getting activation key:', error);
      return undefined;
    }
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    try {
      const result = await db.execute(`
        INSERT INTO activation_keys (key, plan, is_used, used_by, used_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        activationKeyData.key,
        activationKeyData.plan,
        activationKeyData.isUsed || false,
        activationKeyData.usedBy || null,
        activationKeyData.usedAt || null
      ]);
      return result.rows[0] as ActivationKey;
    } catch (error) {
      console.error('Error creating activation key:', error);
      throw error;
    }
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    try {
      const result = await db.execute(`
        UPDATE activation_keys 
        SET is_used = true, used_by = $1, used_at = CURRENT_TIMESTAMP
        WHERE key = $2
        RETURNING *
      `, [userId, key]);
      return result.rows[0] as ActivationKey;
    } catch (error) {
      console.error('Error marking activation key as used:', error);
      throw error;
    }
  }

  // Download operations
  async logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog> {
    try {
      const result = await db.execute(`
        INSERT INTO download_logs (user_id, license_id, file_name)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userId, licenseId, fileName]);
      return result.rows[0] as DownloadLog;
    } catch (error) {
      console.error('Error logging download:', error);
      throw error;
    }
  }

  async getUserDownloads(userId: number): Promise<DownloadLog[]> {
    try {
      const result = await db.execute(`
        SELECT * FROM download_logs 
        WHERE user_id = $1 
        ORDER BY downloaded_at DESC
      `, [userId]);
      return result.rows as DownloadLog[];
    } catch (error) {
      console.error('Error getting user downloads:', error);
      return [];
    }
  }

  // Password reset operations
  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    try {
      const result = await db.execute(`
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [tokenData.userId, tokenData.token, tokenData.expiresAt]);
      return result.rows[0] as PasswordResetToken;
    } catch (error) {
      console.error('Error creating password reset token:', error);
      throw error;
    }
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    try {
      const result = await db.execute(`
        SELECT * FROM password_reset_tokens 
        WHERE token = $1 AND used = false AND expires_at > CURRENT_TIMESTAMP
      `, [token]);
      return result.rows[0] as PasswordResetToken | undefined;
    } catch (error) {
      console.error('Error getting password reset token:', error);
      return undefined;
    }
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken> {
    try {
      const result = await db.execute(`
        UPDATE password_reset_tokens 
        SET used = true
        WHERE token = $1
        RETURNING *
      `, [token]);
      return result.rows[0] as PasswordResetToken;
    } catch (error) {
      console.error('Error marking password reset token as used:', error);
      throw error;
    }
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    try {
      await db.execute(`
        DELETE FROM password_reset_tokens 
        WHERE expires_at < CURRENT_TIMESTAMP OR used = true
      `);
    } catch (error) {
      console.error('Error deleting expired password reset tokens:', error);
    }
  }
}

export const storage = new PostgresStorage();

// Add some test activation keys for development
(async () => {
  await storage.createActivationKey({
    key: "FOVD-TEST-7DAY-001",
    plan: "7days",
    isUsed: false,
  });
  
  await storage.createActivationKey({
    key: "FOVD-TEST-15DAY-001", 
    plan: "15days",
    isUsed: false,
  });
  
  await storage.createActivationKey({
    key: "FOVD-DEMO-7DAY-002",
    plan: "7days", 
    isUsed: false,
  });
})();