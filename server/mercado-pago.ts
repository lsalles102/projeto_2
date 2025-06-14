import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { nanoid } from 'nanoid';
import { getBaseUrl } from './config';

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
  'test': 100, // R$ 1,00 em centavos (valor mínimo do Mercado Pago)
  '7days': 1990, // R$ 19,90 em centavos
  '15days': 3490, // R$ 34,90 em centavos
} as const;

export interface CreatePixPaymentData {
  userId: number;
  plan: 'test' | '7days' | '15days';
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
  
  console.log('CreatePixPayment called with data:', JSON.stringify(data, null, 2));
  console.log('Transaction amount:', transactionAmount);
  console.log('External reference:', externalReference);
  
  // Validar se o valor está correto para o plano de teste
  if (data.plan === 'test' && transactionAmount !== 1.00) {
    console.error('⚠️ ERRO: Valor incorreto para plano de teste:', transactionAmount);
  }
  
  // URL base da aplicação
  const baseUrl = getBaseUrl();

  try {
    // Verificar se o token de acesso está configurado
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado');
    }

    // Criar preferência de pagamento com PIX - incluindo todos os campos recomendados pelo MP
    const preferenceData = {
      items: [
        {
          id: `license_${data.plan}_${Date.now()}`, // ID único do item
          title: `FovDark Cheat ${data.plan === 'test' ? 'TESTE (30 MIN)' : data.plan === '7days' ? '7 DIAS' : '15 DIAS'}`, // Nome do item
          description: `Acesso completo ao FovDark Cheat por ${data.plan === 'test' ? '30 minutos' : data.durationDays + ' dias'}. Sistema profissional de cheats para games com suporte técnico incluído.`, // Descrição detalhada
          category_id: 'software', // Categoria do item
          quantity: 1, // Quantidade do produto/serviço
          unit_price: transactionAmount, // Preço do item
        }
      ],
      payer: {
        email: data.payerEmail,
        first_name: data.payerFirstName,
        last_name: data.payerLastName,
      },
      payment_methods: {
        excluded_payment_methods: [
          { id: 'master' },
          { id: 'visa' },
          { id: 'amex' },
          { id: 'diners' },
          { id: 'elo' },
          { id: 'hipercard' },
        ],
        excluded_payment_types: [
          { id: 'credit_card' },
          { id: 'debit_card' },
          { id: 'ticket' },
        ],
        installments: 1,
      },
      external_reference: externalReference,
      notification_url: `${baseUrl}/api/payments/webhook`,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
      back_urls: {
        success: `${baseUrl}/payment/success`,
        failure: `${baseUrl}/payment`,
        pending: `${baseUrl}/payment`,
      },
    };

    console.log('Criando preferência Mercado Pago:', JSON.stringify(preferenceData, null, 2));

    const prefResponse = await preference.create({
      body: preferenceData
    });

    console.log('Resposta da preferência:', JSON.stringify(prefResponse, null, 2));

    if (!prefResponse.id) {
      throw new Error('Falha ao criar preferência no Mercado Pago');
    }

    // Tentar criar pagamento PIX diretamente para obter QR Code
    let pixQrCode = '';
    let pixQrCodeBase64 = '';

    try {
      const paymentData = {
        transaction_amount: transactionAmount,
        description: `Acesso completo ao FovDark Cheat por ${data.plan === 'test' ? '30 minutos' : data.durationDays + ' dias'}. Sistema profissional de cheats para games com suporte técnico incluído.`,
        payment_method_id: 'pix',
        payer: {
          email: data.payerEmail, // Email do comprador
          first_name: data.payerFirstName, // Nome do comprador
          last_name: data.payerLastName, // Sobrenome do comprador
        },
        external_reference: externalReference,
        notification_url: process.env.NODE_ENV === 'production' ? `https://fovdark.shop/api/payments/webhook` : undefined,
        // Informações adicionais do item para melhorar aprovação
        additional_info: {
          items: [
            {
              id: `license_${data.plan}_${Date.now()}`, // Código do item
              title: `FovDark Cheat ${data.plan === 'test' ? 'TESTE (30 MIN)' : data.plan === '7days' ? '7 DIAS' : '15 DIAS'}`, // Nome do item
              description: `Acesso completo ao FovDark Cheat por ${data.plan === 'test' ? '30 minutos' : data.durationDays + ' dias'}. Sistema profissional de cheats para games com suporte técnico incluído.`, // Descrição do item
              category_id: 'software', // Categoria do item
              quantity: 1, // Quantidade do produto/serviço
              unit_price: transactionAmount, // Preço do item
            }
          ]
        }
      };

      console.log('Criando pagamento PIX:', JSON.stringify(paymentData, null, 2));

      const pixResponse = await payment.create({
        body: paymentData
      });

      console.log('Resposta do pagamento PIX:', JSON.stringify(pixResponse, null, 2));

      pixQrCode = pixResponse.point_of_interaction?.transaction_data?.qr_code || '';
      pixQrCodeBase64 = pixResponse.point_of_interaction?.transaction_data?.qr_code_base64 || '';
    } catch (pixError) {
      console.warn('Erro ao criar pagamento PIX direto, usando apenas preferência:', pixError);
    }

    return {
      preferenceId: prefResponse.id,
      externalReference,
      initPoint: prefResponse.init_point || '',
      pixQrCode,
      pixQrCodeBase64,
      transactionAmount: PLAN_PRICES[data.plan], // Retornar em centavos
      currency: 'BRL',
    };
  } catch (error) {
    console.error('Erro ao criar pagamento PIX:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    throw new Error(`Erro ao processar pagamento PIX: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
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