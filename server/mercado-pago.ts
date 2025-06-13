import { MercadoPagoConfig, Preference } from 'mercadopago';
import { nanoid } from 'nanoid';

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
  options: {
    timeout: 5000,
    idempotencyKey: 'abc'
  }
});

const preference = new Preference(client);

// Preços dos planos em centavos (BRL)
export const PLAN_PRICES = {
  '7days': 19.90, // R$ 19,90
  '15days': 34.90, // R$ 34,90
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
  const transactionAmount = PLAN_PRICES[data.plan];
  
  // URL base da aplicação (usar variável de ambiente ou URL atual)
  const baseUrl = process.env.REPLIT_URL || 'http://localhost:5000';
  
  const preferenceData = {
    items: [
      {
        id: `license_${data.plan}`,
        title: `BloodStrike Cheat ${data.plan === '7days' ? '7 DIAS' : '15 DIAS'} - ${data.durationDays} dias`,
        description: `Acesso completo ao sistema por ${data.durationDays} dias`,
        category_id: 'software',
        quantity: 1,
        unit_price: transactionAmount, // Valor já em reais
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
      excluded_payment_methods: [],
      installments: 1,
    },
    external_reference: externalReference,
    notification_url: `${baseUrl}/api/payments/webhook`,
    back_urls: {
      success: `${baseUrl}/payment/success`,
      failure: `${baseUrl}/payment/failure`,
      pending: `${baseUrl}/payment/pending`,
    },
    auto_return: 'approved',
    binary_mode: true,
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
  };

  try {
    const response = await preference.create({
      body: preferenceData
    });

    if (!response.id) {
      throw new Error('Falha ao criar preferência no Mercado Pago');
    }

    // Extrair informações do PIX (se disponível na resposta)
    const pixQrCode = (response as any).point_of_interaction?.transaction_data?.qr_code || '';
    const pixQrCodeBase64 = (response as any).point_of_interaction?.transaction_data?.qr_code_base64 || '';

    return {
      preferenceId: response.id,
      externalReference,
      initPoint: response.init_point || '',
      pixQrCode,
      pixQrCodeBase64,
      transactionAmount,
      currency: 'BRL',
    };
  } catch (error) {
    console.error('Erro ao criar pagamento PIX:', error);
    throw new Error('Erro interno do servidor ao processar pagamento');
  }
}

export async function getPaymentInfo(paymentId: string) {
  try {
    // Aqui você pode usar a API do Mercado Pago para obter informações do pagamento
    // const payment = await mercadopago.payment.findById(paymentId);
    // return payment;
    
    // Por enquanto, retornamos null já que isso será usado principalmente via webhook
    return null;
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