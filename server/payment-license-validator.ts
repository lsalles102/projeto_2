/**
 * Sistema de validação e ativação automática de licenças
 * Garante que apenas o usuário correto receba a licença após pagamento aprovado
 */

import { storage } from "./storage";
import { securityAudit } from "./security-audit";
import { createOrUpdateLicense } from "./license-utils";

export interface PaymentValidationResult {
  success: boolean;
  message: string;
  userId?: number;
  userEmail?: string;
  licenseKey?: string;
  licenseId?: number;
}

/**
 * Valida se o pagamento pertence ao usuário correto e ativa a licença
 */
export async function validateAndActivateLicense(
  paymentId: string,
  externalReference: string,
  paymentAmount: number,
  payerEmail?: string
): Promise<PaymentValidationResult> {
  try {
    console.log(`=== INICIANDO VALIDAÇÃO DE PAGAMENTO ===`);
    console.log(`Payment ID: ${paymentId}`);
    console.log(`External Reference: ${externalReference}`);
    console.log(`Amount: R$ ${paymentAmount / 100}`);
    console.log(`Payer Email: ${payerEmail || 'N/A'}`);

    // Buscar pagamento no banco de dados local
    const paymentRecord = await storage.getPaymentByExternalReference(externalReference);
    
    if (!paymentRecord) {
      console.error(`❌ Pagamento não encontrado no banco: ${externalReference}`);
      return {
        success: false,
        message: `Payment record not found for external reference: ${externalReference}`
      };
    }

    console.log(`✅ Pagamento encontrado no banco:`);
    console.log(`- ID: ${paymentRecord.id}`);
    console.log(`- User ID: ${paymentRecord.userId}`);
    console.log(`- Plan: ${paymentRecord.plan}`);
    console.log(`- Amount: R$ ${paymentRecord.transactionAmount / 100}`);
    console.log(`- Status: ${paymentRecord.status}`);

    // Buscar dados do usuário
    const user = await storage.getUser(paymentRecord.userId);
    if (!user) {
      console.error(`❌ Usuário não encontrado: ${paymentRecord.userId}`);
      return {
        success: false,
        message: `User not found: ${paymentRecord.userId}`
      };
    }

    console.log(`✅ Usuário encontrado:`);
    console.log(`- ID: ${user.id}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Nome: ${user.firstName} ${user.lastName}`);

    // VALIDAÇÃO DE SEGURANÇA: Verificar se o valor do pagamento confere
    if (Math.abs(paymentRecord.transactionAmount - paymentAmount) > 1) { // Tolerância de 1 centavo
      console.error(`❌ VALOR DO PAGAMENTO NÃO CONFERE!`);
      console.error(`Esperado: R$ ${paymentRecord.transactionAmount / 100}`);
      console.error(`Recebido: R$ ${paymentAmount / 100}`);
      
      securityAudit.logSecurityEvent({
        eventType: 'PAYMENT_AMOUNT_MISMATCH',
        severity: 'HIGH',
        userId: user.id,
        userEmail: user.email,
        details: {
          paymentId,
          expectedAmount: paymentRecord.transactionAmount,
          receivedAmount: paymentAmount,
          externalReference
        }
      });
      
      return {
        success: false,
        message: 'Payment amount mismatch detected'
      };
    }

    // VALIDAÇÃO DE SEGURANÇA: Verificar se o pagamento ainda não foi processado
    if (paymentRecord.status === 'approved') {
      console.log(`⚠️ Pagamento já foi processado anteriormente`);
      
      // Verificar se a licença ainda existe e está ativa
      const existingLicense = await storage.getLicenseByUserId(user.id);
      if (existingLicense && existingLicense.status === 'active') {
        console.log(`✅ Licença já existe e está ativa: ${existingLicense.key}`);
        return {
          success: true,
          message: 'Payment already processed, license already active',
          userId: user.id,
          userEmail: user.email,
          licenseKey: existingLicense.key,
          licenseId: existingLicense.id
        };
      }
    }

    // Atualizar status do pagamento
    await storage.updatePayment(paymentRecord.id, {
      status: "approved",
      mercadoPagoId: paymentId,
      statusDetail: "accredited",
    });

    console.log(`✅ Status do pagamento atualizado para APROVADO`);

    // Registrar tentativa de ativação
    securityAudit.logPaymentApproved(user.id, user.email, paymentId, 'PENDING_LICENSE_CREATION');

    // CRIAR/RENOVAR LICENÇA PARA O USUÁRIO CORRETO
    console.log(`=== CRIANDO/RENOVANDO LICENÇA ===`);
    console.log(`Usuário alvo: ${user.id} (${user.email})`);
    console.log(`Plano: ${paymentRecord.plan}`);
    console.log(`Duração: ${paymentRecord.durationDays} dias`);

    const licenseResult = await createOrUpdateLicense(
      user.id, // ID do usuário que efetuou o pagamento
      paymentRecord.plan as "test" | "7days" | "15days",
      paymentRecord.durationDays,
      user.id // ID do solicitante (mesmo usuário para validação)
    );

    if (!licenseResult || !licenseResult.licenseKey) {
      console.error(`❌ Erro ao criar/renovar licença`);
      
      securityAudit.logLicenseActivation(
        user.id, 
        user.email, 
        'N/A', 
        false, 
        'License creation failed'
      );

      return {
        success: false,
        message: 'Failed to create/renew license'
      };
    }

    const { license, licenseKey, action } = licenseResult;

    console.log(`✅ LICENÇA ${action.toUpperCase()} COM SUCESSO!`);
    console.log(`- Chave: ${licenseKey}`);
    console.log(`- Status: ${license.status}`);
    console.log(`- Expira em: ${license.expiresAt}`);
    console.log(`- Minutos restantes: ${license.minutesRemaining}`);

    // Registrar sucesso na auditoria
    securityAudit.logLicenseActivation(
      user.id,
      user.email,
      licenseKey,
      true,
      `License ${action} successfully`
    );

    securityAudit.logWebhookProcessed(paymentId, user.id, true, {
      licenseKey,
      plan: paymentRecord.plan,
      action,
      externalReference
    });

    console.log(`=== VALIDAÇÃO E ATIVAÇÃO CONCLUÍDA ===`);

    return {
      success: true,
      message: `License ${action} successfully`,
      userId: user.id,
      userEmail: user.email,
      licenseKey,
      licenseId: license.id
    };

  } catch (error) {
    console.error(`❌ ERRO CRÍTICO NA VALIDAÇÃO:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    securityAudit.logSecurityEvent({
      eventType: 'PAYMENT_VALIDATION_ERROR',
      severity: 'CRITICAL',
      details: {
        paymentId,
        externalReference,
        error: errorMessage
      }
    });

    return {
      success: false,
      message: `Critical error during validation: ${errorMessage}`
    };
  }
}

/**
 * Verifica se uma licença pertence ao usuário correto
 */
export async function validateLicenseOwnership(
  licenseKey: string,
  userId: number
): Promise<{ isValid: boolean; license?: any; message: string }> {
  try {
    const license = await storage.getLicenseByKey(licenseKey);
    
    if (!license) {
      return {
        isValid: false,
        message: 'License not found'
      };
    }

    if (license.userId !== userId) {
      console.error(`❌ TENTATIVA DE ACESSO A LICENÇA DE OUTRO USUÁRIO!`);
      console.error(`Licença pertence ao usuário: ${license.userId}`);
      console.error(`Usuário tentando acessar: ${userId}`);
      
      securityAudit.logSecurityEvent({
        eventType: 'UNAUTHORIZED_LICENSE_ACCESS',
        severity: 'HIGH',
        userId,
        details: {
          licenseKey,
          actualUserId: license.userId,
          requestingUserId: userId
        }
      });

      return {
        isValid: false,
        message: 'Unauthorized access to license'
      };
    }

    return {
      isValid: true,
      license,
      message: 'License ownership validated'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error validating license ownership:', errorMessage);
    return {
      isValid: false,
      message: 'Error during validation'
    };
  }
}

/**
 * Força a ativação de uma licença para um usuário específico (apenas admin)
 */
export async function forceActivateLicenseForUser(
  userId: number,
  plan: "test" | "7days" | "15days",
  durationDays: number,
  adminUserId: number
): Promise<PaymentValidationResult> {
  try {
    // Verificar se o solicitante é admin
    const admin = await storage.getUser(adminUserId);
    if (!admin || !admin.isAdmin) {
      return {
        success: false,
        message: 'Only administrators can force activate licenses'
      };
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return {
        success: false,
        message: 'Target user not found'
      };
    }

    console.log(`=== ATIVAÇÃO FORÇADA PELO ADMIN ===`);
    console.log(`Admin: ${admin.email}`);
    console.log(`Usuário alvo: ${user.email}`);
    console.log(`Plano: ${plan}`);

    const licenseResult = await createOrUpdateLicense(
      userId,
      plan,
      durationDays,
      adminUserId // Admin como solicitante
    );

    if (!licenseResult) {
      return {
        success: false,
        message: 'Failed to create license'
      };
    }

    // Registrar na auditoria
    securityAudit.logSecurityEvent({
      eventType: 'ADMIN_FORCE_ACTIVATION',
      severity: 'MEDIUM',
      userId: adminUserId,
      userEmail: admin.email,
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        plan,
        durationDays,
        licenseKey: licenseResult.licenseKey
      }
    });

    return {
      success: true,
      message: `License ${licenseResult.action} by administrator`,
      userId,
      userEmail: user.email,
      licenseKey: licenseResult.licenseKey,
      licenseId: licenseResult.license.id
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in force activation:', errorMessage);
    return {
      success: false,
      message: `Error: ${errorMessage}`
    };
  }
}