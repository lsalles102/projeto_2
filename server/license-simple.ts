import { nanoid } from "nanoid";
import { storage } from "./storage";

/**
 * Sistema de licenças simplificado integrado ao usuário
 * Remove dependências externas e usa apenas o schema existente
 */

/**
 * Gera chave única de licença
 */
export function generateLicenseKey(): string {
  const randomPart = Math.random().toString(36).substr(2, 7).toUpperCase();
  return `FOV-${randomPart}`;
}

/**
 * Calcula data de expiração
 */
export function calculateExpirationDate(durationDays: number): Date {
  const now = new Date();
  
  if (durationDays < 1) {
    // Para planos de teste (30 minutos = 0.021 dias)
    const minutes = Math.round(durationDays * 24 * 60);
    now.setMinutes(now.getMinutes() + minutes);
  } else {
    // Para planos regulares
    now.setDate(now.getDate() + durationDays);
  }
  
  return now;
}

/**
 * Calcula total de minutos
 */
export function calculateTotalMinutes(durationDays: number): number {
  return Math.round(durationDays * 24 * 60);
}

/**
 * Ativa licença diretamente no usuário após pagamento aprovado
 */
export async function activateLicenseForUser(
  userId: string,
  plan: string,
  durationDays: number
) {
  const expiryDate = calculateExpirationDate(durationDays);
  const totalMinutes = calculateTotalMinutes(durationDays);
  const licenseKey = generateLicenseKey();
  
  console.log(`=== ATIVANDO LICENÇA INTEGRADA ===`);
  console.log(`Usuário: ${userId}`);
  console.log(`Plano: ${plan}`);
  console.log(`Duração: ${durationDays} dias`);
  console.log(`Chave: ${licenseKey}`);
  console.log(`Expira em: ${expiryDate.toISOString()}`);
  console.log(`Total minutos: ${totalMinutes}`);
  
  // Atualizar usuário com dados da licença
  const updatedUser = await storage.updateUser(userId, {
    license_status: "ativa",
    license_plan: plan,
    license_expires_at: expiryDate,
    license_activated_at: new Date(),
    license_total_minutes: totalMinutes,
    license_remaining_minutes: totalMinutes,
    license_last_heartbeat: new Date(),
    hwid: null // Reset HWID para nova ativação
  });
  
  console.log(`✅ LICENÇA ATIVADA NO USUÁRIO`);
  console.log(`Status: ${updatedUser.license_status}`);
  console.log(`Plano: ${updatedUser.license_plan}`);
  console.log(`Expira em: ${updatedUser.license_expires_at?.toISOString()}`);
  
  return { 
    success: true,
    user: updatedUser, 
    action: "ativada", 
    licenseKey,
    license: {
      key: licenseKey,
      plan: plan,
      status: "ativa",
      expiresAt: expiryDate,
      totalMinutes: totalMinutes,
      remainingMinutes: totalMinutes
    }
  };
}

/**
 * Verifica status da licença do usuário
 */
export async function checkUserLicenseStatus(userId: string) {
  const user = await storage.getUser(userId);
  if (!user) {
    return { success: false, message: "Usuário não encontrado" };
  }
  
  const now = new Date();
  let status = user.license_status || "sem_licenca";
  
  // Verificar se a licença expirou
  if (user.license_expires_at && now > user.license_expires_at) {
    if (status === "ativa") {
      // Marcar como expirada
      await storage.updateUser(userId, {
        license_status: "expirada",
        license_remaining_minutes: 0
      });
      status = "expirada";
    }
  }
  
  return {
    success: true,
    status: status,
    plan: user.license_plan,
    expiresAt: user.license_expires_at,
    remainingMinutes: user.license_remaining_minutes || 0,
    isActive: status === "ativa" && user.license_expires_at && now < user.license_expires_at
  };
}

/**
 * Processa heartbeat e decrementa tempo da licença
 */
export async function processHeartbeat(userId: string, hwid?: string): Promise<{ success: boolean; message: string; remainingMinutes?: number }> {
  const user = await storage.getUser(userId);
  if (!user) {
    return { success: false, message: "Usuário não encontrado" };
  }
  
  // Verificar se tem licença ativa
  if (user.license_status !== "ativa") {
    return { success: false, message: "Nenhuma licença ativa" };
  }
  
  const now = new Date();
  
  // Verificar se a licença já expirou
  if (user.license_expires_at && now > user.license_expires_at) {
    await storage.updateUser(userId, {
      license_status: "expirada",
      license_remaining_minutes: 0
    });
    return { success: false, message: "Licença expirada" };
  }
  
  // Verificar HWID se fornecido
  if (hwid) {
    if (user.hwid && user.hwid !== hwid) {
      return { success: false, message: "HWID não autorizado" };
    }
    
    // Definir HWID se não estiver definido
    if (!user.hwid) {
      await storage.updateUser(userId, { hwid });
    }
  }
  
  // Decrementar 1 minuto
  const newRemainingMinutes = Math.max(0, (user.license_remaining_minutes || 0) - 1);
  
  await storage.updateUser(userId, {
    license_remaining_minutes: newRemainingMinutes,
    license_last_heartbeat: now
  });
  
  // Se chegou a 0, marcar como expirada
  if (newRemainingMinutes === 0) {
    await storage.updateUser(userId, {
      license_status: "expirada"
    });
    return { success: false, message: "Licença expirada (tempo esgotado)", remainingMinutes: 0 };
  }
  
  return { 
    success: true, 
    message: "Heartbeat processado", 
    remainingMinutes: newRemainingMinutes 
  };
}