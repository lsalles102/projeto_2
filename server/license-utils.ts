import { nanoid } from "nanoid";
import { storage } from "./storage";

/**
 * Generates a unique activation key with retry mechanism
 * Format: FOV-XXXXXXX (7 random characters after FOV-)
 */
export async function generateUniqueActivationKey(): Promise<string> {
  const maxAttempts = 10;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Generate key in format FOV-XXXXXXX
    const randomPart = Math.random().toString(36).substr(2, 7).toUpperCase();
    const key = `FOV-${randomPart}`;
    
    console.log(`✅ Chave única gerada na tentativa ${attempt}: ${key}`);
    return key;
  }
  
  throw new Error(`Falha ao gerar chave única após ${maxAttempts} tentativas`);
}

/**
 * Calculates expiration date based on plan and duration
 */
export function calculateExpirationDate(durationDays: number): Date {
  const now = new Date();
  
  if (durationDays < 1) {
    // For test plans (30 minutes = 0.021 days)
    const minutes = Math.round(durationDays * 24 * 60);
    now.setMinutes(now.getMinutes() + minutes);
  } else {
    // For regular plans
    now.setDate(now.getDate() + durationDays);
  }
  
  return now;
}

/**
 * Calculates total minutes from duration in days
 */
export function calculateTotalMinutes(durationDays: number): number {
  if (durationDays < 1) {
    // For test plans (30 minutes)
    return Math.round(durationDays * 24 * 60);
  } else {
    // For regular plans
    return durationDays * 24 * 60;
  }
}

/**
 * Creates or updates license for user after payment approval
 * Chave é gerada e vinculada diretamente ao usuário
 * VALIDAÇÃO DE SEGURANÇA: Apenas o usuário que efetuou o pagamento pode receber a licença
 */
export async function createOrUpdateLicense(
  userId: number,
  plan: string,
  durationDays: number,
  requesterUserId?: number // ID do usuário que está solicitando (para validação extra)
) {
  // VALIDAÇÃO DE SEGURANÇA: Se um ID solicitante foi fornecido, deve ser o mesmo
  if (requesterUserId && requesterUserId !== userId) {
    console.error(`❌ TENTATIVA DE FRAUDE DETECTADA NA CRIAÇÃO DE LICENÇA!`);
    console.error(`Usuário da licença: ${userId}`);
    console.error(`Usuário solicitante: ${requesterUserId}`);
    throw new Error(`SECURITY: License can only be created for the requesting user`);
  }
  const expiryDate = calculateExpirationDate(durationDays);
  const totalMinutes = calculateTotalMinutes(durationDays);
  
  // Generate unique license key for this user
  const licenseKey = await generateUniqueActivationKey();
  
  console.log(`=== PROCESSANDO LICENÇA ===`);
  console.log(`Usuário: ${userId}`);
  console.log(`Plano: ${plan}`);
  console.log(`Duração: ${durationDays} dias`);
  console.log(`Chave gerada: ${licenseKey}`);
  console.log(`Expira em: ${expiryDate.toISOString()}`);
  console.log(`Total minutos: ${totalMinutes}`);
  
  // Check if user already has a license
  const existingLicense = await storage.getLicenseByUserId(userId);
  
  if (existingLicense) {
    console.log(`=== RENOVANDO LICENÇA EXISTENTE ===`);
    console.log(`Licença atual: ${existingLicense.key} (Status: ${existingLicense.status})`);
    
    const updatedLicense = await storage.updateLicense(existingLicense.id, {
      key: licenseKey,
      plan,
      status: "active",
      expiresAt: expiryDate,
      totalMinutesRemaining: totalMinutes,
      daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
      hoursRemaining: Math.ceil(totalMinutes / 60),
      minutesRemaining: totalMinutes,
      activatedAt: new Date(),
      hwid: null // Reset HWID para nova ativação
    });
    
    console.log(`✅ LICENÇA RENOVADA - Nova chave: ${licenseKey}`);
    console.log(`Nova expiração: ${expiryDate.toISOString()}`);
    
    return { license: updatedLicense, action: "renovada", licenseKey };
  } else {
    console.log(`=== CRIANDO NOVA LICENÇA ===`);
    
    const newLicense = await storage.createLicense({
      userId,
      key: licenseKey,
      plan,
      status: "active",
      expiresAt: expiryDate,
      totalMinutesRemaining: totalMinutes,
      daysRemaining: Math.ceil(totalMinutes / (24 * 60)),
      hoursRemaining: Math.ceil(totalMinutes / 60),
      minutesRemaining: totalMinutes,
      activatedAt: new Date(),
    });
    
    console.log(`✅ NOVA LICENÇA CRIADA - Chave: ${licenseKey}`);
    console.log(`Expira em: ${expiryDate.toISOString()}`);
    
    return { license: newLicense, action: "criada", licenseKey };
  }
}

/**
 * Validates and cleans email address
 */
export function validateAndCleanEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  
  // Remove spaces and quotes
  const cleaned = email.trim().replace(/['"]+/g, '').replace(/\s+/g, '');
  
  // Reject masked emails
  if (cleaned.includes('XXXXX') || /^X+$/.test(cleaned) || cleaned === '') {
    return null;
  }
  
  // Check if contains @ and .
  if (!cleaned.includes('@') || !cleaned.includes('.')) {
    return null;
  }
  
  // Validate format with simple regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) {
    return null;
  }
  
  return cleaned;
}

/**
 * Finds best available email for sending license key
 */
export async function findBestEmailForUser(
  user: any,
  paymentInfo: any
): Promise<string | null> {
  console.log(`=== SELECIONANDO EMAIL VÁLIDO PARA ENVIO ===`);
  
  // 1. Validate user email
  const userEmailClean = validateAndCleanEmail(user.email);
  console.log(`[EMAIL] Email do usuário: "${user.email}" → ${userEmailClean ? 'VÁLIDO' : 'INVÁLIDO'}`);
  
  // 2. Validate Mercado Pago email
  const mpEmailClean = validateAndCleanEmail(paymentInfo.payer?.email);
  console.log(`[EMAIL] Email do Mercado Pago: "${paymentInfo.payer?.email || 'N/A'}" → ${mpEmailClean ? 'VÁLIDO' : 'INVÁLIDO'}`);
  
  // 3. Choose best available email (prioritize user)
  let emailToUse = userEmailClean || mpEmailClean;
  
  // 4. If both invalid, search in original payment
  if (!emailToUse && paymentInfo.external_reference) {
    console.log(`[EMAIL] Buscando email no pagamento original...`);
    try {
      const originalPayment = await storage.getPaymentByExternalReference(paymentInfo.external_reference);
      if (originalPayment?.payerEmail) {
        const originalEmailClean = validateAndCleanEmail(originalPayment.payerEmail);
        if (originalEmailClean) {
          emailToUse = originalEmailClean;
          console.log(`[EMAIL] Email encontrado no pagamento: "${originalEmailClean}" → VÁLIDO`);
        } else {
          console.log(`[EMAIL] Email do pagamento inválido: "${originalPayment.payerEmail}"`);
        }
      } else {
        console.log(`[EMAIL] Pagamento não encontrado ou sem email`);
      }
    } catch (searchError) {
      console.log(`[EMAIL] Erro ao buscar pagamento original:`, searchError);
    }
  }
  
  return emailToUse;
}

/**
 * Validates HWID for manual activation
 */
export function validateHwid(hwid: string): boolean {
  if (!hwid || typeof hwid !== 'string') return false;
  
  // HWID should be between 10-255 characters
  if (hwid.length < 10 || hwid.length > 255) return false;
  
  // HWID should contain only alphanumeric characters, hyphens, and underscores
  const hwidRegex = /^[a-zA-Z0-9\-_]+$/;
  return hwidRegex.test(hwid);
}

/**
 * Activates license manually with HWID protection
 * This looks for an existing license with the key, not activation_keys table
 */
export async function activateLicenseManually(
  licenseKey: string,
  hwid: string,
  userId: number
): Promise<{ success: boolean; message: string; license?: any }> {
  try {
    console.log(`=== ATIVAÇÃO MANUAL INICIADA ===`);
    console.log(`Chave: ${licenseKey}`);
    console.log(`HWID: ${hwid}`);
    console.log(`Usuário: ${userId}`);
    
    // 1. Validate HWID format
    if (!validateHwid(hwid)) {
      return {
        success: false,
        message: "HWID inválido. Deve conter apenas letras, números, hífens e underscores, com 10-255 caracteres."
      };
    }
    
    // 2. Check if license with this key exists and belongs to this user
    const existingLicense = await storage.getLicenseByKey(licenseKey);
    if (!existingLicense) {
      return {
        success: false,
        message: "Chave de licença não encontrada."
      };
    }
    
    if (existingLicense.userId !== userId) {
      return {
        success: false,
        message: "Esta chave não pertence ao seu usuário."
      };
    }
    
    // 3. Check if HWID is already in use by another license
    const existingLicenseWithHwid = await storage.getLicenseByHwid(hwid);
    if (existingLicenseWithHwid && existingLicenseWithHwid.id !== existingLicense.id) {
      return {
        success: false,
        message: "Este dispositivo já está vinculado a outra licença."
      };
    }
    
    // 4. Check if license is still valid (not expired)
    const now = new Date();
    if (new Date(existingLicense.expiresAt) < now) {
      return {
        success: false,
        message: "Esta licença já expirou."
      };
    }
    
    // 5. Update license with HWID
    const license = await storage.updateLicense(existingLicense.id, {
      hwid: hwid,
      status: "active",
      activatedAt: new Date(),
    });
    
    console.log(`✅ LICENÇA ATIVADA MANUALMENTE`);
    console.log(`Chave: ${licenseKey}`);
    console.log(`HWID: ${hwid}`);
    console.log(`Plano: ${existingLicense.plan}`);
    console.log(`Expira em: ${existingLicense.expiresAt}`);
    
    const planName = existingLicense.plan === "test" ? "Teste (30 minutos)" : 
                     existingLicense.plan === "7days" ? "7 Dias" : "15 Dias";
    
    return {
      success: true,
      message: `Licença ativada com sucesso! Plano: ${planName}, válida até ${new Date(existingLicense.expiresAt).toLocaleDateString('pt-BR')}.`,
      license
    };
    
  } catch (error) {
    console.error("❌ ERRO NA ATIVAÇÃO MANUAL:", error);
    return {
      success: false,
      message: "Erro interno durante a ativação. Tente novamente."
    };
  }
}