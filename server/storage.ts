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
  getPaymentByPreferenceId(preferenceId: string): Promise<Payment | undefined>;
  getPayment(id: number): Promise<Payment | undefined>;
  updatePayment(id: number, updates: Partial<Payment>): Promise<Payment>;
  
  // System operations
  getSystemStats(): Promise<any>;
  
  // Admin operations
  getAllUsers(): Promise<User[]>;
  getAllLicenses(): Promise<License[]>;
  getAllActivationKeys(): Promise<ActivationKey[]>;
  getAllPayments(): Promise<Payment[]>;
  deleteUser(id: number): Promise<void>;
  deleteLicense(id: number): Promise<void>;
  deleteActivationKey(id: number): Promise<void>;
  
  // License management
  getLicenseByHwid(hwid: string): Promise<License | undefined>;
  updateLicenseHeartbeat(licenseKey: string, hwid: string): Promise<License | undefined>;
  decrementLicenseTime(licenseId: number, minutes: number): Promise<License>;
  
  // Payment operations
  getUserPayments(userId: number): Promise<Payment[]>;
  getPaymentByMercadoPagoId(mercadoPagoId: string): Promise<Payment | undefined>;
  getPendingPayments(): Promise<Payment[]>;
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

  async getPaymentByPreferenceId(preferenceId: string): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.preferenceId === preferenceId);
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.id === id);
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

  async getPaymentByMercadoPagoId(mercadoPagoId: string): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.mercadoPagoId === mercadoPagoId);
  }

  async getPendingPayments(): Promise<Payment[]> {
    return this.payments.filter(payment => payment.status === 'pending');
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    return this.payments.filter(payment => payment.userId === userId);
  }

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

  async deleteUser(id: number): Promise<void> {
    this.users = this.users.filter(user => user.id !== id);
  }

  async deleteLicense(id: number): Promise<void> {
    this.licenses = this.licenses.filter(license => license.id !== id);
  }

  async deleteActivationKey(id: number): Promise<void> {
    this.activationKeys = this.activationKeys.filter(key => key.id !== id);
  }

  async getLicenseByHwid(hwid: string): Promise<License | undefined> {
    return this.licenses.find(license => license.hwid === hwid);
  }

  async updateLicenseHeartbeat(licenseKey: string, hwid: string): Promise<License | undefined> {
    const license = this.licenses.find(l => l.key === licenseKey && l.hwid === hwid);
    if (!license) return undefined;

    if (license.totalMinutesRemaining && license.totalMinutesRemaining > 0) {
      license.totalMinutesRemaining -= 1;
      const totalMinutes = license.totalMinutesRemaining;
      license.daysRemaining = Math.floor(totalMinutes / (24 * 60));
      license.hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
      license.minutesRemaining = totalMinutes % 60;
      
      if (license.totalMinutesRemaining <= 0) {
        license.status = 'expired';
      }
    }
    
    return license;
  }

  async decrementLicenseTime(licenseId: number, minutes: number): Promise<License> {
    const license = this.licenses.find(l => l.id === licenseId);
    if (!license) throw new Error("License not found");

    if (license.totalMinutesRemaining) {
      license.totalMinutesRemaining = Math.max(0, license.totalMinutesRemaining - minutes);
      const totalMinutes = license.totalMinutesRemaining;
      license.daysRemaining = Math.floor(totalMinutes / (24 * 60));
      license.hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
      license.minutesRemaining = totalMinutes % 60;
      
      if (license.totalMinutesRemaining <= 0) {
        license.status = 'expired';
      }
    }
    
    return license;
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

export class PostgresStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const { db } = await import("./db");
    const result = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, id),
    });
    return result;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { db } = await import("./db");
    const result = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });
    return result;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const { db } = await import("./db");
    const result = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.googleId, googleId),
    });
    return result;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    
    const result = await db.insert(users).values({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("User not found");
    }
    
    return result[0];
  }

  async getLicense(id: number): Promise<License | undefined> {
    const { db } = await import("./db");
    const result = await db.query.licenses.findFirst({
      where: (licenses, { eq }) => eq(licenses.id, id),
    });
    return result;
  }

  async getLicenseByUserId(userId: number): Promise<License | undefined> {
    const { db } = await import("./db");
    const result = await db.query.licenses.findFirst({
      where: (licenses, { eq }) => eq(licenses.userId, userId),
    });
    return result;
  }

  async getLicenseByKey(key: string): Promise<License | undefined> {
    const { db } = await import("./db");
    const result = await db.query.licenses.findFirst({
      where: (licenses, { eq }) => eq(licenses.key, key),
    });
    return result;
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    const { db } = await import("./db");
    const { licenses } = await import("@shared/schema");
    
    const result = await db.insert(licenses).values({
      ...licenseData,
      createdAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async updateLicense(id: number, updates: Partial<License>): Promise<License> {
    const { db } = await import("./db");
    const { licenses } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.update(licenses)
      .set(updates)
      .where(eq(licenses.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("License not found");
    }
    
    return result[0];
  }

  async getActivationKey(key: string): Promise<ActivationKey | undefined> {
    const { db } = await import("./db");
    const result = await db.query.activationKeys.findFirst({
      where: (activationKeys, { eq }) => eq(activationKeys.key, key),
    });
    return result;
  }

  async createActivationKey(activationKeyData: InsertActivationKey): Promise<ActivationKey> {
    const { db } = await import("./db");
    const { activationKeys } = await import("@shared/schema");
    
    const result = await db.insert(activationKeys).values({
      ...activationKeyData,
      createdAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async markActivationKeyAsUsed(key: string, userId: number): Promise<ActivationKey> {
    const { db } = await import("./db");
    const { activationKeys } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.update(activationKeys)
      .set({
        isUsed: true,
        usedBy: userId,
        usedAt: new Date(),
      })
      .where(eq(activationKeys.key, key))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Activation key not found");
    }
    
    return result[0];
  }

  async logDownload(userId: number, licenseId: number, fileName: string): Promise<DownloadLog> {
    const { db } = await import("./db");
    const { downloadLogs } = await import("@shared/schema");
    
    const result = await db.insert(downloadLogs).values({
      userId,
      licenseId,
      fileName,
      downloadedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async getUserDownloads(userId: number): Promise<DownloadLog[]> {
    const { db } = await import("./db");
    const result = await db.query.downloadLogs.findMany({
      where: (downloadLogs, { eq }) => eq(downloadLogs.userId, userId),
      orderBy: (downloadLogs, { desc }) => desc(downloadLogs.downloadedAt),
    });
    return result;
  }

  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const { db } = await import("./db");
    const { passwordResetTokens } = await import("@shared/schema");
    
    const result = await db.insert(passwordResetTokens).values({
      ...tokenData,
      createdAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const { db } = await import("./db");
    const result = await db.query.passwordResetTokens.findFirst({
      where: (passwordResetTokens, { eq }) => eq(passwordResetTokens.token, token),
    });
    return result;
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
      throw new Error("Password reset token not found");
    }
    
    return result[0];
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    const { db } = await import("./db");
    const { passwordResetTokens } = await import("@shared/schema");
    const { lt } = await import("drizzle-orm");
    
    await db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));
  }

  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    
    const result = await db.insert(payments).values({
      ...paymentData,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    return result[0];
  }

  async getPaymentByExternalReference(externalReference: string): Promise<Payment | undefined> {
    const { db } = await import("./db");
    const result = await db.query.payments.findFirst({
      where: (payments, { eq }) => eq(payments.externalReference, externalReference),
    });
    return result;
  }

  async getPaymentByPreferenceId(preferenceId: string): Promise<Payment | undefined> {
    const { db } = await import("./db");
    const result = await db.query.payments.findFirst({
      where: (payments, { eq }) => eq(payments.preferenceId, preferenceId),
    });
    return result;
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const { db } = await import("./db");
    const result = await db.query.payments.findFirst({
      where: (payments, { eq }) => eq(payments.id, id),
    });
    return result;
  }

  async updatePayment(id: number, updates: Partial<Payment>): Promise<Payment> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.update(payments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Payment not found");
    }
    
    return result[0];
  }

  async getSystemStats(): Promise<any> {
    const { db } = await import("./db");
    const { count } = await import("drizzle-orm");
    const { users, licenses, activationKeys, payments, downloadLogs, passwordResetTokens } = await import("@shared/schema");
    
    const [usersCount, licensesCount, activationKeysCount, paymentsCount, downloadLogsCount, passwordResetTokensCount] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(licenses),
      db.select({ count: count() }).from(activationKeys),
      db.select({ count: count() }).from(payments),
      db.select({ count: count() }).from(downloadLogs),
      db.select({ count: count() }).from(passwordResetTokens),
    ]);
    
    return {
      users: usersCount[0].count,
      licenses: licensesCount[0].count,
      activationKeys: activationKeysCount[0].count,
      payments: paymentsCount[0].count,
      downloadLogs: downloadLogsCount[0].count,
      passwordResetTokens: passwordResetTokensCount[0].count,
    };
  }

  // Admin operations
  async getAllUsers(): Promise<User[]> {
    const { db } = await import("./db");
    const result = await db.query.users.findMany({
      orderBy: (users, { desc }) => desc(users.createdAt),
    });
    return result;
  }

  async getAllLicenses(): Promise<License[]> {
    const { db } = await import("./db");
    const result = await db.query.licenses.findMany({
      orderBy: (licenses, { desc }) => desc(licenses.createdAt),
    });
    return result;
  }

  async getAllActivationKeys(): Promise<ActivationKey[]> {
    const { db } = await import("./db");
    const result = await db.query.activationKeys.findMany({
      orderBy: (activationKeys, { desc }) => desc(activationKeys.createdAt),
    });
    return result;
  }

  async getAllPayments(): Promise<Payment[]> {
    const { db } = await import("./db");
    const result = await db.query.payments.findMany({
      orderBy: (payments, { desc }) => desc(payments.createdAt),
    });
    return result;
  }

  async deleteUser(id: number): Promise<void> {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    await db.delete(users).where(eq(users.id, id));
  }

  async deleteLicense(id: number): Promise<void> {
    const { db } = await import("./db");
    const { licenses } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    await db.delete(licenses).where(eq(licenses.id, id));
  }

  async deleteActivationKey(id: number): Promise<void> {
    const { db } = await import("./db");
    const { activationKeys } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    await db.delete(activationKeys).where(eq(activationKeys.id, id));
  }

  // License management  
  async getLicenseByHwid(hwid: string): Promise<License | undefined> {
    const { db } = await import("./db");
    const result = await db.query.licenses.findFirst({
      where: (licenses, { eq }) => eq(licenses.hwid, hwid),
    });
    return result;
  }

  async updateLicenseHeartbeat(licenseKey: string, hwid: string): Promise<License | undefined> {
    const { db } = await import("./db");
    const { licenses } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    
    // Find license by key and hwid
    const existingLicense = await db.query.licenses.findFirst({
      where: (licenses, { eq, and }) => and(
        eq(licenses.key, licenseKey),
        eq(licenses.hwid, hwid)
      ),
    });
    
    if (!existingLicense || existingLicense.status !== 'active') {
      return undefined;
    }
    
    // Decrement 1 minute from license
    const totalMinutes = (existingLicense.totalMinutesRemaining || 0) - 1;
    
    if (totalMinutes <= 0) {
      // License expired
      const result = await db.update(licenses)
        .set({
          status: 'expired',
          totalMinutesRemaining: 0,
          daysRemaining: 0,
          hoursRemaining: 0,
          minutesRemaining: 0,
          lastHeartbeat: new Date(),
        })
        .where(eq(licenses.id, existingLicense.id))
        .returning();
        
      return result[0];
    }
    
    // Calculate remaining time
    const daysRemaining = Math.floor(totalMinutes / (24 * 60));
    const hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutesRemaining = totalMinutes % 60;
    
    const result = await db.update(licenses)
      .set({
        totalMinutesRemaining: totalMinutes,
        daysRemaining,
        hoursRemaining,
        minutesRemaining,
        lastHeartbeat: new Date(),
      })
      .where(eq(licenses.id, existingLicense.id))
      .returning();
      
    return result[0];
  }

  async decrementLicenseTime(licenseId: number, minutes: number): Promise<License> {
    const { db } = await import("./db");
    const { licenses } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const existingLicense = await this.getLicense(licenseId);
    if (!existingLicense) {
      throw new Error("License not found");
    }
    
    const totalMinutes = Math.max(0, (existingLicense.totalMinutesRemaining || 0) - minutes);
    const daysRemaining = Math.floor(totalMinutes / (24 * 60));
    const hoursRemaining = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutesRemaining = totalMinutes % 60;
    
    const result = await db.update(licenses)
      .set({
        totalMinutesRemaining: totalMinutes,
        daysRemaining,
        hoursRemaining,
        minutesRemaining,
        status: totalMinutes <= 0 ? 'expired' : existingLicense.status,
      })
      .where(eq(licenses.id, licenseId))
      .returning();
      
    return result[0];
  }

  // Payment operations
  async getUserPayments(userId: number): Promise<Payment[]> {
    const { db } = await import("./db");
    const result = await db.query.payments.findMany({
      where: (payments, { eq }) => eq(payments.userId, userId),
      orderBy: (payments, { desc }) => desc(payments.createdAt),
    });
    return result;
  }

  async getPaymentByMercadoPagoId(mercadoPagoId: string): Promise<Payment | undefined> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.query.payments.findFirst({
      where: eq(payments.mercadoPagoId, mercadoPagoId),
    });
    return result;
  }

  async getPendingPayments(): Promise<Payment[]> {
    const { db } = await import("./db");
    const { payments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = await db.query.payments.findMany({
      where: eq(payments.status, 'pending'),
      orderBy: (payments, { desc }) => desc(payments.createdAt),
    });
    return result;
  }
}

export const storage = new PostgresStorage();