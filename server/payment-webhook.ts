import { Request, Response } from "express";
import { storage } from "./storage";
import { getPaymentInfo, validateWebhookSignature } from "./mercado-pago";
import { licenseService } from "./license-service";
import { securityAudit } from "./security-audit";
import { sendLicenseKeyEmail } from "./email";
import { mercadoPagoWebhookSchema } from "@shared/schema";

/**
 * Novo webhook do Mercado Pago para ativação direta de licenças
 * Remove sistema de chaves de ativação
 * Ativa licença diretamente na conta do usuário após pagamento aprovado
 */
export async function handlePaymentWebhook(req: Request, res: Response) {
  try {
    console.log(`=== WEBHOOK MERCADO PAGO RECEBIDO ===`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Body:`, JSON.stringify(req.body, null, 2));
    
    // Validar estrutura do webhook
    const validation = mercadoPagoWebhookSchema.safeParse(req.body);
    if (!validation.success) {
      console.log(`❌ Webhook com estrutura inválida:`, validation.error.errors);
      return res.status(200).json({ received: true, error: "Invalid webhook structure" });
    }

    const { type, data } = validation.data;

    // Processar apenas webhooks de pagamento
    if (type === "payment" && data?.id) {
      const paymentId = data.id;
      console.log(`🔍 Processando pagamento ID: ${paymentId}`);

      // Buscar informações do pagamento no Mercado Pago
      const paymentInfo = await getPaymentInfo(paymentId);
      console.log(`📊 Status do pagamento: ${paymentInfo?.status}`);

      if (paymentInfo?.status === "approved") {
        console.log(`✅ PAGAMENTO APROVADO - Iniciando ativação de licença`);

        // Buscar pagamento na base de dados
        const payment = await storage.getPaymentByExternalReference(paymentInfo.external_reference);
        if (!payment) {
          console.log(`❌ Pagamento não encontrado na base de dados: ${paymentInfo.external_reference}`);
          return res.status(200).json({ received: true, error: "Payment not found in database" });
        }

        // Validar se usuário existe
        const user = await storage.getUser(payment.userId);
        if (!user) {
          console.log(`❌ Usuário não encontrado: ${payment.userId}`);
          return res.status(200).json({ received: true, error: "User not found" });
        }

        console.log(`👤 Usuário encontrado: ${user.email} (ID: ${user.id})`);
        console.log(`💳 Plano adquirido: ${payment.plan}`);

        // Ativar licença diretamente na conta do usuário
        const activationResult = await licenseService.activateLicenseForUser(
          user.id,
          payment.plan,
          paymentId
        );

        if (activationResult.success) {
          // Atualizar status do pagamento
          await storage.updatePaymentByExternalReference(paymentInfo.external_reference, {
            mercadoPagoId: paymentId,
            status: 'approved',
            transactionAmount: Math.round(paymentInfo.transaction_amount * 100), // Converter para centavos
            paymentMethodId: paymentInfo.payment_method_id || 'pix',
          });

          // Registrar auditoria de segurança
          securityAudit.logPaymentApproved(user.id, user.email, paymentId, "direct_activation");
          securityAudit.logWebhookProcessed(paymentId, user.id, true, { 
            plan: payment.plan, 
            activation: "direct_to_user_account" 
          });

          // Enviar email de confirmação (sem chave de licença)
          const planName = payment.plan === "test" ? "Teste (30 minutos)" : 
                           payment.plan === "7days" ? "7 Dias" : "15 Dias";

          try {
            // Email personalizado para novo sistema sem chaves
            await sendLicenseConfirmationEmail(user.email, planName, user.firstName || user.username || "Cliente");
            console.log(`📧 Email de confirmação enviado para: ${user.email}`);
          } catch (emailError) {
            console.error(`❌ Falha no envio de email:`, emailError);
            console.log(`✅ Licença permanece ativa - usuário pode verificar no dashboard`);
          }

          console.log(`✅ LICENÇA ATIVADA COM SUCESSO!`);
          console.log(`Usuário: ${user.email} (ID: ${user.id})`);
          console.log(`Plano: ${payment.plan}`);
          console.log(`Status: Licença ativa na conta do usuário`);

        } else {
          console.log(`❌ Falha na ativação da licença: ${activationResult.message}`);
          securityAudit.logWebhookProcessed(paymentId, user.id, false, { 
            error: activationResult.message 
          });
        }

      } else {
        console.log(`ℹ️ Pagamento não aprovado - Status: ${paymentInfo?.status || 'unknown'}`);
      }

    } else {
      console.log(`ℹ️ Webhook ignorado - Tipo: ${type}, Data: ${data?.id || 'N/A'}`);
    }

    // Sempre retornar 200 para evitar retries do Mercado Pago
    res.status(200).json({ received: true });

  } catch (error) {
    console.error("❌ ERRO CRÍTICO NO WEBHOOK:", error);
    if (error instanceof Error) {
      console.error("Stack trace:", error.stack);
    }
    // Sempre retornar 200 para evitar retries do webhook
    res.status(200).json({ received: true, error: "Webhook processing failed" });
  }
}

/**
 * Envia email de confirmação de licença ativada (sem chave)
 */
async function sendLicenseConfirmationEmail(email: string, planName: string, userName: string) {
  // Implementar email personalizado para o novo sistema
  // Por enquanto, usar o sistema existente adaptado
  try {
    await sendLicenseKeyEmail(email, "ATIVADA_AUTOMATICAMENTE", planName);
  } catch (error) {
    console.error("Erro ao enviar email de confirmação:", error);
    throw error;
  }
}