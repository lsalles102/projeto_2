import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { nanoid } from 'nanoid';

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
  options: {
    timeout: 5000,
  }
});

const preference = new Preference(client);
const payment = new Payment(client);

// Preços dos planos em centavos (BRL)
export const PLAN_PRICES = {
  '7days': 1990, // R$ 19,90 em centavos
  '15days': 3490, // R$ 34,90 em centavos
} as const;

export interface CreatePixPaymentData {
  userId: number;
  plan: '7days' | '15days';
  durationDays: number;
  payerEmail: string;
  payerFirstName: string;
  payerLastName: string;
}

export interface PixPaymentResponse {
  preferenceId: string;
  externalReference: string;
  initPoint: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  transactionAmount: number;
  currency: string;
}

export async function createPixPayment(data: CreatePixPaymentData): Promise<PixPaymentResponse> {
  const externalReference = `payment_${nanoid()}`;
  const transactionAmount = PLAN_PRICES[data.plan] / 100; // Converter centavos para reais
  
  // URL base da aplicação
  const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.REPLIT_URL || 'http://localhost:5000';
  
  const paymentData = {
    transaction_amount: transactionAmount,
    description: `BloodStrike Cheat ${data.plan === '7days' ? '7 DIAS' : '15 DIAS'} - ${data.durationDays} dias`,
    payment_method_id: 'pix',
    payer: {
      email: data.payerEmail,
      first_name: data.payerFirstName,
      last_name: data.payerLastName,
    },
    external_reference: externalReference,
    notification_url: `${baseUrl}/api/payments/webhook`,
    date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
  };

  try {
    // Criar pagamento PIX diretamente
    const response = await payment.create({
      body: paymentData
    });

    if (!response.id) {
      throw new Error('Falha ao criar pagamento PIX no Mercado Pago');
    }

    // Extrair informações do PIX
    const pixQrCode = response.point_of_interaction?.transaction_data?.qr_code || '';
    const pixQrCodeBase64 = response.point_of_interaction?.transaction_data?.qr_code_base64 || '';
    const ticketUrl = response.point_of_interaction?.transaction_data?.ticket_url || '';

    // Se não tiver QR Code direto, criar uma preferência como fallback
    let initPoint = '';
    let preferenceId = '';
    
    if (!pixQrCode) {
      const preferenceData = {
        items: [
          {
            id: `license_${data.plan}`,
            title: `BloodStrike Cheat ${data.plan === '7days' ? '7 DIAS' : '15 DIAS'}`,
            description: `Acesso completo ao sistema por ${data.durationDays} dias`,
            category_id: 'software',
            quantity: 1,
            unit_price: transactionAmount,
          }
        ],
        payer: {
          email: data.payerEmail,
          first_name: data.payerFirstName,
          last_name: data.payerLastName,
        },
        payment_methods: {
          excluded_payment_types: [
            { id: 'credit_card' },
            { id: 'debit_card' },
            { id: 'ticket' }
          ],
        },
        external_reference: externalReference,
        notification_url: `${baseUrl}/api/payments/webhook`,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };

      const prefResponse = await preference.create({
        body: preferenceData
      });
      
      initPoint = prefResponse.init_point || '';
      preferenceId = prefResponse.id || '';
    }

    return {
      preferenceId: preferenceId || response.id.toString(),
      externalReference,
      initPoint,
      pixQrCode: pixQrCode || ticketUrl,
      pixQrCodeBase64,
      transactionAmount: PLAN_PRICES[data.plan], // Retornar em centavos
      currency: 'BRL',
    };
  } catch (error) {
    console.error('Erro ao criar pagamento PIX:', error);
    throw new Error('Erro interno do servidor ao processar pagamento');
  }
}

export async function getPaymentInfo(paymentId: string) {
  try {
    const response = await payment.get({ id: paymentId });
    return response;
  } catch (error) {
    console.error('Erro ao obter informações do pagamento:', error);
    return null;
  }
}

export function validateWebhookSignature(body: string, signature: string): boolean {
  // Implementar validação de assinatura do webhook se necessário
  // Por enquanto, retornamos true para desenvolvimento
  return true;
}