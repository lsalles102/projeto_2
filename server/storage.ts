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
  type Payment,
  type InsertPayment,
  users,
  licenses,
  activationKeys,
  downloadLogs,
  passwordResetTokens,
  payments
} from "@shared/schema";
import { eq, and, gt, lt, sql } from 'drizzle-orm';
import { db } from './db';

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
  
  // HWID-based license operations
  getLicenseByHwid(hwid: string): Promise<License | undefined>;
  updateLicenseHeartbeat(licenseKey: string, hwid: string): Promise<License | undefined>;
  decrementLicenseTime(licenseId: number, minutes: number): Promise<License>;
  
  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined>;
  getPaymentByPreferenceId(preferenceId: string): Promise<Payment | undefined>;
  updatePayment(id: number, updates: Partial<Payment>): Promise<Payment>;
  getUserPayments(userId: number): Promise<Payment[]>;
  
  // Admin operations
  getAllUsers(): Promise<User[]>;
  getAllLicenses(): Promise<License[]>;
  getAllActivationKeys(): Promise<ActivationKey[]>;
  getAllPayments(): Promise<Payment[]>;
  getSystemStats(): Promise<{
    totalUsers: number;
    totalLicenses: number;
    activeLicenses: number;
    totalActivationKeys: number;
    unusedActivationKeys: number;
    totalDownloads: number;
    totalPayments: number;
    approvedPayments: number;
  }>;
  deleteActivationKey(id: number): Promise<void>;
  deleteUser(id: number): Promise<void>;
  deleteLicense(id: number): Promise<void>;
  deletePayment(id: number): Promise<void>;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: User[] = [];
  private licenses: License[] = [];
  private activationKeys: ActivationKey[] = [];
  private downloadLogs: DownloadLog[] = [];
  private passwordResetTokens: PasswordResetToken[] = [];
  private payments: Payment[] = [];
  private nextUserId = 1;
  private nextLicenseId = 1;
  private nextDownloadId = 1;
  private nextActivationKeyId = 1;
  private nextPasswordResetTokenId = 1;
  private nextPaymentId = 1;

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
      username: 'lsalles',
      password: preHashedPassword,
      firstName: 'Lucas',
      lastName: 'Salles',
      profileImageUrl: null,
      googleId: null,
      hwid: null,
      isAdmin: true,
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
        durationDays: keyData.plan === '7days' ? 7 : 15,
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
      username: userData.username,
      password: userData.password || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      googleId: userData.googleId || null,
      hwid: userData.hwid || null,
      isAdmin: userData.isAdmin || false,
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
      daysRemaining: licenseData.daysRemaining || 0,
      hoursRemaining: licenseData.hoursRemaining || 0,
      minutesRemaining: licenseData.minutesRemaining || 0,
      totalMinutesRemaining: licenseData.totalMinutesRemaining || 0,
      expiresAt: licenseData.expiresAt,
      activatedAt: licenseData.activatedAt || null,
      lastHeartbeat: licenseData.lastHeartbeat || null,
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
      durationDays: activationKeyData.durationDays,
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

  // Payment operations
  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    const payment: Payment = {
      id: this.nextPaymentId++,
      userId: paymentData.userId,
      mercadoPagoId: paymentData.mercadoPagoId || null,
      preferenceId: paymentData.preferenceId || null,
      externalReference: paymentData.externalReference,
      status: paymentData.status || 'pending',
      statusDetail: paymentData.statusDetail || null,
      transactionAmount: paymentData.transactionAmount,
      currency: paymentData.currency || 'BRL',
      plan: paymentData.plan,
      durationDays: paymentData.durationDays,
      payerEmail: paymentData.payerEmail || null,
      payerFirstName: paymentData.payerFirstName || null,
      payerLastName: paymentData.payerLastName || null,
      paymentMethodId: paymentData.paymentMethodId || null,
      notificationUrl: paymentData.notificationUrl || null,
      pixQrCode: paymentData.pixQrCode || null,
      pixQrCodeBase64: paymentData.pixQrCodeBase64 || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.payments.push(payment);
    return payment;
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.id === id);
  }

  async getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.externalReference === externalReference);
  }

  async getPaymentByPreferenceId(preferenceId: string): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.preferenceId === preferenceId);
  }

  async updatePayment(id: number, updates: Partial<Payment>): Promise<Payment> {
    const paymentIndex = this.payments.findIndex(payment => payment.id === id);
    if (paymentIndex === -1) {
      throw new Error("Payment não encontrado");
    }
    this.payments[paymentIndex] = {
      ...this.payments[paymentIndex],
      ...updates,
      updatedAt: new Date(),
    };
    return this.payments[paymentIndex];
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    return this.payments.filter(payment => payment.userId === userId);
  }

  // HWID-based license operations
  async getLicenseByHwid(hwid: string): Promise<License | undefined> {
    return this.licenses.find(license => license.hwid === hwid && license.status === 'active');
  }

  async updateLicenseHeartbeat(licenseKey: string, hwid: string): Promise<License | undefined> {
    const licenseIndex = this.licenses.findIndex(license => 
      license.key === licenseKey && license.hwid === hwid && license.status === 'active'
    );
    
    if (licenseIndex === -1) {
      return undefined;
    }

    // Update heartbeat and decrement 1 minute
    this.licenses[licenseIndex].lastHeartbeat = new Date();
    
    if ((this.licenses[licenseIndex].totalMinutesRemaining || 0) > 0) {
      this.licenses[licenseIndex].totalMinutesRemaining = (this.licenses[licenseIndex].totalMinutesRemaining || 0) - 1;
      
      // Recalculate days, hours, minutes
      const totalMinutes = this.licenses[licenseIndex].totalMinutesRemaining || 0;
      this.licenses[licenseIndex].daysRemaining = Math.floor(totalMinutes / (24 * 60));
      this.licenses[licenseIndex].hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
      this.licenses[licenseIndex].minutesRemaining = totalMinutes % 60;
      
      // Check if license expired
      if (totalMinutes <= 0) {
        this.licenses[licenseIndex].status = 'expired';
      }
    }

    return this.licenses[licenseIndex];
  }

  async decrementLicenseTime(licenseId: number, minutes: number): Promise<License> {
    const licenseIndex = this.licenses.findIndex(license => license.id === licenseId);
    if (licenseIndex === -1) {
      throw new Error('License not found');
    }

    const license = this.licenses[licenseIndex];
    license.totalMinutesRemaining = Math.max(0, (license.totalMinutesRemaining || 0) - minutes);
    
    // Recalculate days, hours, minutes
    const totalMinutes = license.totalMinutesRemaining || 0;
    license.daysRemaining = Math.floor(totalMinutes / (24 * 60));
    license.hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
    license.minutesRemaining = totalMinutes % 60;
    
    // Check if license expired
    if (totalMinutes <= 0) {
      license.status = 'expired';
    }

    return license;
  }

  // Admin operations
  async getAllUsers(): Promise<User[]> {
    return this.users;
  }

  async getAllLicenses(): Promise<License[]> {
    return this.licenses;
  }

  async getAllActivationKeys(): Promise<ActivationKey[]> {
    return this.activationKeys;
  }

  async getAllPayments(): Promise<Payment[]> {
    return this.payments;
  }

  async getSystemStats(): Promise<{
    totalUsers: number;
    totalLicenses: number;
    activeLicenses: number;
    totalActivationKeys: number;
    unusedActivationKeys: number;
    totalDownloads: number;
    totalPayments: number;
    approvedPayments: number;
  }> {
    return {
      totalUsers: this.users.length,
      totalLicenses: this.licenses.length,
      activeLicenses: this.licenses.filter(l => l.status === 'active').length,
      totalActivationKeys: this.activationKeys.length,
      unusedActivationKeys: this.activationKeys.filter(ak => !ak.isUsed).length,
      totalDownloads: this.downloadLogs.length,
      totalPayments: this.payments.length,
      approvedPayments: this.payments.filter(p => p.status === 'approved').length,
    };
  }

  async deleteActivationKey(id: number): Promise<void> {
    const index = this.activationKeys.findIndex(ak => ak.id === id);
    if (index !== -1) {
      this.activationKeys.splice(index, 1);
    }
  }

  async deleteUser(id: number): Promise<void> {
    const userIndex = this.users.findIndex(u => u.id === id);
    if (userIndex !== -1) {
      this.users.splice(userIndex, 1);
      // Also delete related data
      this.licenses = this.licenses.filter(l => l.userId !== id);
      this.downloadLogs = this.downloadLogs.filter(dl => dl.userId !== id);
      this.passwordResetTokens = this.passwordResetTokens.filter(prt => prt.userId !== id);
    }
  }

  async deleteLicense(id: number): Promise<void> {
    const index = this.licenses.findIndex(l => l.id === id);
    if (index !== -1) {
      this.licenses.splice(index, 1);
      // Also delete related download logs
      this.downloadLogs = this.downloadLogs.filter(dl => dl.licenseId !== id);
    }
  }

  async deletePayment(id: number): Promise<void> {
    const index = this.payments.findIndex(p => p.id === id);
    if (index !== -1) {
      this.payments.splice(index, 1);
    }
  }
}

// PostgreSQL storage implementation using Drizzle ORM
export class PostgresStorage implements IStorage {

  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.googleId, googleId));
    return result[0];
  }

  async createUser(userData: InsertUser): Promise<User> {
    const result = await db.insert(users).values(userData).returning();
    return result[0];
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getLicense(id: number): Promise<License | undefined> {
    const result = await db.select().from(licenses).where(eq(licenses.id, id));
    return result[0];
  }

  async getLicenseByUserId(userId: number): Promise<License | undefined> {
    const result = await db.select().from(licenses).where(eq(licenses.userId, userId));
    return result[0];
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    const result = await db.select().from(licenses).where(eq(licenses.key, key));
    return result[0];
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    const result = await db.insert(licenses).values(licenseData).returning();
    return result[0];
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    const result = await db.update(licenses).set(updates).where(eq(licenses.id, id)).returning();
    return result[0];
  }

  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    const result = await db.select().from(activationKeys).where(eq(activationKeys.key, key));
    return result[0];
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    const result = await db.insert(activationKeys).values(activationKeyData).returning();
    return result[0];
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    const result = await db.update(activationKeys)
      .set({ isUsed: true, usedBy: userId, usedAt: new Date() })
      .where(eq(activationKeys.key, key))
      .returning();
    return result[0];
  }

  async logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog> {
    const result = await db.insert(downloadLogs)
      .values({ userId, licenseId, fileName, downloadedAt: new Date() })
      .returning();
    return result[0];
  }

  async getUserDownloads(userId: number): Promise<DownloadLog[]> {
    return await db.select().from(downloadLogs).where(eq(downloadLogs.userId, userId));
  }

  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const result = await db.insert(passwordResetTokens).values(tokenData).returning();
    return result[0];
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const result = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, new Date())
      ));
    return result[0];
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken> {
    const result = await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token))
      .returning();
    return result[0];
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    await db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));
  }

  // Payment operations
  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    const result = await db.insert(payments).values(paymentData).returning();
    return result[0];
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const result = await db.select().from(payments).where(eq(payments.id, id));
    return result[0];
  }

  async getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined> {
    const result = await db.select().from(payments).where(eq(payments.externalReference, externalReference));
    return result[0];
  }

  async getPaymentByPreferenceId(preferenceId: string): Promise<Payment | undefined> {
    const result = await db.select().from(payments).where(eq(payments.preferenceId, preferenceId));
    return result[0];
  }

  async updatePayment(id: number, updates: Partial<Payment>): Promise<Payment> {
    const result = await db.update(payments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return result[0];
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.userId, userId));
  }

  // HWID-based license operations
  async getLicenseByHwid(hwid: string): Promise<License | undefined> {
    const result = await db.select()
      .from(licenses)
      .where(and(
        eq(licenses.hwid, hwid),
        eq(licenses.status, 'active')
      ));
    return result[0];
  }

  async updateLicenseHeartbeat(licenseKey: string, hwid: string): Promise<License | undefined> {
    // First get the current license
    const currentLicense = await db.select()
      .from(licenses)
      .where(and(
        eq(licenses.key, licenseKey),
        eq(licenses.hwid, hwid),
        eq(licenses.status, 'active')
      ));

    if (currentLicense.length === 0) {
      return undefined;
    }

    const license = currentLicense[0];
    let newTotalMinutes = Math.max(0, (license.totalMinutesRemaining || 0) - 1);
    let newStatus = license.status;

    // Calculate new time breakdown
    const days = Math.floor(newTotalMinutes / (24 * 60));
    const hours = Math.floor((newTotalMinutes % (24 * 60)) / 60);
    const minutes = newTotalMinutes % 60;

    // Check if license expired
    if (newTotalMinutes <= 0) {
      newStatus = 'expired';
    }

    // Update the license
    const result = await db.update(licenses)
      .set({
        lastHeartbeat: new Date(),
        totalMinutesRemaining: newTotalMinutes,
        daysRemaining: days,
        hoursRemaining: hours,
        minutesRemaining: minutes,
        status: newStatus
      })
      .where(eq(licenses.id, license.id))
      .returning();

    return result[0];
  }

  async decrementLicenseTime(licenseId: number, minutes: number): Promise<License> {
    const currentLicense = await db.select()
      .from(licenses)
      .where(eq(licenses.id, licenseId));

    if (currentLicense.length === 0) {
      throw new Error('License not found');
    }

    const license = currentLicense[0];
    const newTotalMinutes = Math.max(0, (license.totalMinutesRemaining || 0) - minutes);
    
    // Calculate new time breakdown
    const days = Math.floor(newTotalMinutes / (24 * 60));
    const hours = Math.floor((newTotalMinutes % (24 * 60)) / 60);
    const mins = newTotalMinutes % 60;

    // Check if license expired
    const newStatus = newTotalMinutes <= 0 ? 'expired' : license.status;

    const result = await db.update(licenses)
      .set({
        totalMinutesRemaining: newTotalMinutes,
        daysRemaining: days,
        hoursRemaining: hours,
        minutesRemaining: mins,
        status: newStatus
      })
      .where(eq(licenses.id, licenseId))
      .returning();

    return result[0];
  }

  // Admin operations
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getAllLicenses(): Promise<License[]> {
    return await db.select().from(licenses);
  }

  async getAllActivationKeys(): Promise<ActivationKey[]> {
    return await db.select().from(activationKeys);
  }

  async getAllPayments(): Promise<Payment[]> {
    return await db.select().from(payments);
  }

  async getSystemStats(): Promise<{
    totalUsers: number;
    totalLicenses: number;
    activeLicenses: number;
    totalActivationKeys: number;
    unusedActivationKeys: number;
    totalDownloads: number;
    totalPayments: number;
    approvedPayments: number;
  }> {
    const allUsers = await db.select().from(users);
    const allLicenses = await db.select().from(licenses);
    const activeLicenses = await db.select().from(licenses).where(eq(licenses.status, 'active'));
    const allKeys = await db.select().from(activationKeys);
    const unusedKeys = await db.select().from(activationKeys).where(eq(activationKeys.isUsed, false));
    const allDownloads = await db.select().from(downloadLogs);
    const allPayments = await db.select().from(payments);
    const approvedPayments = await db.select().from(payments).where(eq(payments.status, 'approved'));

    return {
      totalUsers: allUsers.length,
      totalLicenses: allLicenses.length,
      activeLicenses: activeLicenses.length,
      totalActivationKeys: allKeys.length,
      unusedActivationKeys: unusedKeys.length,
      totalDownloads: allDownloads.length,
      totalPayments: allPayments.length,
      approvedPayments: approvedPayments.length,
    };
  }

  async deleteActivationKey(id: number): Promise<void> {
    await db.delete(activationKeys).where(eq(activationKeys.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    // Delete related data first
    await db.delete(downloadLogs).where(eq(downloadLogs.userId, id));
    await db.delete(licenses).where(eq(licenses.userId, id));
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
    // Delete user
    await db.delete(users).where(eq(users.id, id));
  }

  async deleteLicense(id: number): Promise<void> {
    // Delete related download logs first
    await db.delete(downloadLogs).where(eq(downloadLogs.licenseId, id));
    // Delete license
    await db.delete(licenses).where(eq(licenses.id, id));
  }

  async deletePayment(id: number): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
  }
}

export const storage = new PostgresStorage();