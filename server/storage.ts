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
  type InsertPayment
} from "@shared/schema";
import bcrypt from "bcrypt";

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
  
  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined>;
  updatePayment(id: number, updates: Partial<Payment>): Promise<Payment>;
  
  // System operations
  getSystemStats(): Promise<any>;
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
    this.initializeTestDataSync();
  }

  private initializeTestDataSync() {
    // Create test admin user
    const testUser: User = {
      id: this.nextUserId++,
      email: "admin@test.com",
      username: "admin",
      password: bcrypt.hashSync("admin123", 10),
      firstName: "Admin",
      lastName: "User",
      profileImageUrl: null,
      googleId: null,
      hwid: null,
      isAdmin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(testUser);

    // Create test activation keys
    for (let i = 0; i < 5; i++) {
      const activationKey: ActivationKey = {
        id: this.nextActivationKeyId++,
        key: `TEST-KEY-${i + 1}`,
        plan: i % 2 === 0 ? "7days" : "15days",
        durationDays: i % 2 === 0 ? 7 : 15,
        isUsed: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date(),
      };
      this.activationKeys.push(activationKey);
    }
  }

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
      password: userData.password ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      googleId: userData.googleId ?? null,
      hwid: userData.hwid ?? null,
      isAdmin: userData.isAdmin ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      throw new Error("User not found");
    }
    
    this.users[userIndex] = {
      ...this.users[userIndex],
      ...updates,
      updatedAt: new Date(),
    };
    
    return this.users[userIndex];
  }

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
      status: licenseData.status ?? "inactive",
      hwid: licenseData.hwid ?? null,
      daysRemaining: licenseData.daysRemaining ?? 0,
      hoursRemaining: licenseData.hoursRemaining ?? 0,
      minutesRemaining: licenseData.minutesRemaining ?? 0,
      totalMinutesRemaining: licenseData.totalMinutesRemaining ?? 0,
      expiresAt: licenseData.expiresAt,
      activatedAt: licenseData.activatedAt ?? null,
      lastHeartbeat: licenseData.lastHeartbeat ?? null,
      createdAt: new Date(),
    };
    this.licenses.push(license);
    return license;
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    const licenseIndex = this.licenses.findIndex(license => license.id === id);
    if (licenseIndex === -1) {
      throw new Error("License not found");
    }
    
    this.licenses[licenseIndex] = {
      ...this.licenses[licenseIndex],
      ...updates,
    };
    
    return this.licenses[licenseIndex];
  }

  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    return this.activationKeys.find(ak => ak.key === key);
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    const activationKey: ActivationKey = {
      id: this.nextActivationKeyId++,
      ...activationKeyData,
      isUsed: false,
      usedBy: null,
      usedAt: null,
      createdAt: new Date(),
    };
    this.activationKeys.push(activationKey);
    return activationKey;
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    const keyIndex = this.activationKeys.findIndex(ak => ak.key === key);
    if (keyIndex === -1) {
      throw new Error("Activation key not found");
    }
    
    this.activationKeys[keyIndex] = {
      ...this.activationKeys[keyIndex],
      isUsed: true,
      usedBy: userId,
      usedAt: new Date(),
    };
    
    return this.activationKeys[keyIndex];
  }

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

  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const token: PasswordResetToken = {
      id: this.nextPasswordResetTokenId++,
      ...tokenData,
      used: false,
      createdAt: new Date(),
    };
    this.passwordResetTokens.push(token);
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    return this.passwordResetTokens.find(t => t.token === token);
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<PasswordResetToken> {
    const tokenIndex = this.passwordResetTokens.findIndex(t => t.token === token);
    if (tokenIndex === -1) {
      throw new Error("Password reset token not found");
    }
    
    this.passwordResetTokens[tokenIndex] = {
      ...this.passwordResetTokens[tokenIndex],
      used: true,
    };
    
    return this.passwordResetTokens[tokenIndex];
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    const now = new Date();
    this.passwordResetTokens = this.passwordResetTokens.filter(token => token.expiresAt > now);
  }

  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    const payment: Payment = {
      id: this.nextPaymentId++,
      userId: paymentData.userId,
      mercadoPagoId: paymentData.mercadoPagoId ?? null,
      preferenceId: paymentData.preferenceId ?? null,
      externalReference: paymentData.externalReference,
      status: paymentData.status ?? "pending",
      statusDetail: paymentData.statusDetail ?? null,
      transactionAmount: paymentData.transactionAmount,
      currency: paymentData.currency ?? "BRL",
      plan: paymentData.plan,
      durationDays: paymentData.durationDays,
      payerEmail: paymentData.payerEmail ?? null,
      payerFirstName: paymentData.payerFirstName ?? null,
      payerLastName: paymentData.payerLastName ?? null,
      paymentMethodId: paymentData.paymentMethodId ?? null,
      notificationUrl: paymentData.notificationUrl ?? null,
      pixQrCode: paymentData.pixQrCode ?? null,
      pixQrCodeBase64: paymentData.pixQrCodeBase64 ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.payments.push(payment);
    return payment;
  }

  async getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.externalReference === externalReference);
  }

  async updatePayment(id: number, updates: Partial<Payment>): Promise<Payment> {
    const paymentIndex = this.payments.findIndex(payment => payment.id === id);
    if (paymentIndex === -1) {
      throw new Error("Payment not found");
    }
    
    this.payments[paymentIndex] = {
      ...this.payments[paymentIndex],
      ...updates,
      updatedAt: new Date(),
    };
    
    return this.payments[paymentIndex];
  }

  async getSystemStats(): Promise<any> {
    return {
      users: this.users.length,
      licenses: this.licenses.length,
      activationKeys: this.activationKeys.length,
      payments: this.payments.length,
      downloadLogs: this.downloadLogs.length,
      passwordResetTokens: this.passwordResetTokens.length,
    };
  }
}

export const storage = new MemStorage();