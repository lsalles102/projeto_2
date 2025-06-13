import { loadMercadoPago } from '@mercadopago/sdk-js';

let mercadoPagoInstance: any = null;

export async function initMercadoPago() {
  if (mercadoPagoInstance) {
    return mercadoPagoInstance;
  }

  try {
    await loadMercadoPago();
    const mp = new (window as any).MercadoPago(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY, {
      locale: 'pt-BR'
    });
    
    mercadoPagoInstance = mp;
    return mp;
  } catch (error) {
    console.error('Erro ao inicializar MercadoPago:', error);
    throw error;
  }
}

export function getMercadoPago() {
  if (!mercadoPagoInstance) {
    throw new Error('MercadoPago não foi inicializado. Chame initMercadoPago() primeiro.');
  }
  return mercadoPagoInstance;
}