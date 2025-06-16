import { storage } from "./storage";
import { generateUniqueActivationKey, calculateExpirationDate, calculateTotalMinutes } from "./license-utils";
import { UserLicense, userLicenseSchema } from "@shared/schema";
import { nanoid } from "nanoid";

/**
 * Creates a new license for a user and stores it in the licenses column
 */
export async function createUserLicense(
  userId: number,
  plan: "test" | "7days" | "15days",
  durationDays: number
): Promise<{ success: boolean; license?: UserLicense; message: string }> {
  try {
    const user = await storage.getUser(userId);
    if (!user) {
      return { success: false, message: "Usuário não encontrado" };
    }

    // Generate unique license key
    const licenseKey = await generateUniqueActivationKey();
    const expiresAt = calculateExpirationDate(durationDays);
    const totalMinutes = calculateTotalMinutes(durationDays);

    const newLicense: UserLicense = {
      key: licenseKey,
      plan,
      status: "active", // Ativa imediatamente após pagamento confirmado
      daysRemaining: Math.floor(durationDays),
      hoursRemaining: Math.floor((durationDays % 1) * 24),
      minutesRemaining: Math.floor(((durationDays % 1) * 24 % 1) * 60),
      totalMinutesRemaining: totalMinutes,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(), // Ativada no momento do pagamento
    };

    // Update user with new license and status_license field
    await storage.updateUser(userId, { 
      licenses: newLicense,
      status_license: "ativa" // Licença ativa após pagamento confirmado
    });

    console.log(`✓ Nova licença criada para usuário ${userId}: ${licenseKey} (${plan}, ${durationDays} dias)`);

    return {
      success: true,
      license: newLicense,
      message: "Licença criada com sucesso"
    };
  } catch (error) {
    console.error("Erro ao criar licença do usuário:", error);
    return { success: false, message: "Erro interno ao criar licença" };
  }
}

/**
 * Activates a user license with HWID
 */
export async function activateUserLicense(
  userId: number,
  licenseKey: string,
  hwid: string
): Promise<{ success: boolean; license?: UserLicense; message: string }> {
  try {
    const user = await storage.getUser(userId);
    if (!user) {
      return { success: false, message: "Usuário não encontrado" };
    }

    const currentLicense = user.licenses as UserLicense;
    if (!currentLicense || currentLicense.key !== licenseKey) {
      return { success: false, message: "Licença não encontrada para este usuário" };
    }

    if (currentLicense.status === "expired") {
      return { success: false, message: "Licença expirada" };
    }

    if (currentLicense.hwid && currentLicense.hwid !== hwid) {
      return { success: false, message: "HWID já vinculado a outro dispositivo" };
    }

    // Activate the license
    const activatedLicense: UserLicense = {
      ...currentLicense,
      status: "active",
      hwid,
      activatedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    };

    await storage.updateUser(userId, { 
      licenses: activatedLicense,
      status_license: "ativa" // Sincronizar status da licença
    });

    console.log(`✓ Licença ativada: ${licenseKey} para usuário ${userId} com HWID: ${hwid}`);

    return {
      success: true,
      license: activatedLicense,
      message: "Licença ativada com sucesso"
    };
  } catch (error) {
    console.error("Erro ao ativar licença:", error);
    return { success: false, message: "Erro interno ao ativar licença" };
  }
}

/**
 * Gets user's current license
 */
export async function getUserLicense(userId: number): Promise<UserLicense | null> {
  try {
    const user = await storage.getUser(userId);
    if (!user || !user.licenses) {
      return null;
    }

    const license = user.licenses as UserLicense;
    
    // Check if license is expired
    const now = new Date();
    const expiresAt = new Date(license.expiresAt);
    
    if (now > expiresAt && license.status !== "expired") {
      // Mark as expired
      const expiredLicense: UserLicense = {
        ...license,
        status: "expired",
        totalMinutesRemaining: 0,
        daysRemaining: 0,
        hoursRemaining: 0,
        minutesRemaining: 0,
      };

      await storage.updateUser(userId, { 
        licenses: expiredLicense,
        status_license: "expirada" // Sincronizar status da licença expirada
      });
      return expiredLicense;
    }

    return license;
  } catch (error) {
    console.error("Erro ao buscar licença do usuário:", error);
    return null;
  }
}

/**
 * Gets user license by license key
 */
export async function getUserByLicenseKey(licenseKey: string): Promise<{ user: any; license: UserLicense } | null> {
  try {
    // Search through all users to find the one with this license key
    const allUsers = await storage.getAllUsers();
    
    for (const user of allUsers) {
      if (user.licenses) {
        const license = user.licenses as UserLicense;
        if (license.key === licenseKey) {
          return { user, license };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Erro ao buscar usuário por chave de licença:", error);
    return null;
  }
}

/**
 * Updates license heartbeat
 */
export async function updateLicenseHeartbeat(
  licenseKey: string,
  hwid: string
): Promise<{ success: boolean; license?: UserLicense; message: string }> {
  try {
    const result = await getUserByLicenseKey(licenseKey);
    if (!result) {
      return { success: false, message: "Licença não encontrada" };
    }

    const { user, license } = result;

    if (license.status !== "active") {
      return { success: false, message: "Licença não está ativa" };
    }

    if (license.hwid !== hwid) {
      return { success: false, message: "HWID não corresponde" };
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(license.expiresAt);
    
    if (now > expiresAt) {
      const expiredLicense: UserLicense = {
        ...license,
        status: "expired",
        totalMinutesRemaining: 0,
        daysRemaining: 0,
        hoursRemaining: 0,
        minutesRemaining: 0,
      };

      await storage.updateUser(user.id, { licenses: expiredLicense });
      return { success: false, message: "Licença expirada" };
    }

    // Update heartbeat and calculate remaining time
    const remainingMs = expiresAt.getTime() - now.getTime();
    const totalMinutesRemaining = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
    const daysRemaining = Math.floor(totalMinutesRemaining / (24 * 60));
    const hoursRemaining = Math.floor((totalMinutesRemaining % (24 * 60)) / 60);
    const minutesRemaining = totalMinutesRemaining % 60;

    const updatedLicense: UserLicense = {
      ...license,
      lastHeartbeat: now.toISOString(),
      totalMinutesRemaining,
      daysRemaining,
      hoursRemaining,
      minutesRemaining,
    };

    await storage.updateUser(user.id, { licenses: updatedLicense });

    return {
      success: true,
      license: updatedLicense,
      message: "Heartbeat atualizado"
    };
  } catch (error) {
    console.error("Erro ao atualizar heartbeat:", error);
    return { success: false, message: "Erro interno" };
  }
}

/**
 * Activates a license key manually (when user enters it in dashboard)
 */
export async function activateLicenseKeyForUser(
  userId: number,
  licenseKey: string,
  hwid?: string
): Promise<{ success: boolean; license?: UserLicense; message: string }> {
  try {
    // Check if this is an existing license key from activation_keys table
    const activationKey = await storage.getActivationKey(licenseKey);
    
    if (activationKey && !activationKey.isUsed) {
      // Create new license from activation key
      const result = await createUserLicense(userId, activationKey.plan as any, activationKey.durationDays);
      
      if (result.success && result.license) {
        // Mark activation key as used
        await storage.markActivationKeyAsUsed(licenseKey, userId);
        
        // If HWID provided, activate immediately
        if (hwid) {
          return await activateUserLicense(userId, result.license.key, hwid);
        }
        
        return result;
      }
    }

    // Check if user already has this license
    const user = await storage.getUser(userId);
    if (user?.licenses) {
      const license = user.licenses as UserLicense;
      if (license.key === licenseKey) {
        if (hwid && license.status === "pending") {
          return await activateUserLicense(userId, licenseKey, hwid);
        }
        return { success: true, license, message: "Licença já está associada a este usuário" };
      }
    }

    return { success: false, message: "Chave de licença inválida ou já utilizada" };
  } catch (error) {
    console.error("Erro ao ativar chave de licença:", error);
    return { success: false, message: "Erro interno ao ativar licença" };
  }
}

/**
 * Extends/renews a user's license
 */
export async function renewUserLicense(
  userId: number,
  plan: "test" | "7days" | "15days",
  durationDays: number
): Promise<{ success: boolean; license?: UserLicense; message: string }> {
  try {
    const currentLicense = await getUserLicense(userId);
    
    if (currentLicense) {
      // Extend current license
      const currentExpiry = new Date(currentLicense.expiresAt);
      const now = new Date();
      const startFrom = currentExpiry > now ? currentExpiry : now;
      
      const newExpiry = new Date(startFrom.getTime() + (durationDays * 24 * 60 * 60 * 1000));
      const additionalMinutes = calculateTotalMinutes(durationDays);
      
      const renewedLicense: UserLicense = {
        ...currentLicense,
        plan, // Update plan if different
        status: currentLicense.hwid ? "active" : "pending",
        totalMinutesRemaining: currentLicense.totalMinutesRemaining + additionalMinutes,
        expiresAt: newExpiry.toISOString(),
      };

      // Recalculate days/hours/minutes
      const remainingMs = newExpiry.getTime() - now.getTime();
      const totalMinutesRemaining = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
      renewedLicense.daysRemaining = Math.floor(totalMinutesRemaining / (24 * 60));
      renewedLicense.hoursRemaining = Math.floor((totalMinutesRemaining % (24 * 60)) / 60);
      renewedLicense.minutesRemaining = totalMinutesRemaining % 60;
      renewedLicense.totalMinutesRemaining = totalMinutesRemaining;

      await storage.updateUser(userId, { licenses: renewedLicense });

      console.log(`✓ Licença renovada para usuário ${userId}: +${durationDays} dias`);

      return {
        success: true,
        license: renewedLicense,
        message: "Licença renovada com sucesso"
      };
    } else {
      // Create new license
      return await createUserLicense(userId, plan, durationDays);
    }
  } catch (error) {
    console.error("Erro ao renovar licença:", error);
    return { success: false, message: "Erro interno ao renovar licença" };
  }
}