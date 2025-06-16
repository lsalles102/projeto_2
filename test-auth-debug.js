// Script para testar autenticação e criação de pagamento PIX
const fetch = require('node-fetch');

async function testAuth() {
  try {
    console.log('=== TESTANDO AUTENTICAÇÃO E PAGAMENTO PIX ===');
    
    // 1. Primeiro, testar login
    console.log('1. Fazendo login...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'lsalles102@gmail.com',
        password: 'admin123'
      })
    });
    
    console.log('Status do login:', loginResponse.status);
    const loginResult = await loginResponse.text();
    console.log('Resposta do login:', loginResult);
    
    // Extrair cookies da sessão
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('Cookies recebidos:', cookies);
    
    if (loginResponse.status === 200) {
      // 2. Testar criação de pagamento PIX com session
      console.log('\n2. Testando criação de pagamento PIX...');
      const paymentResponse = await fetch('http://localhost:5000/api/payments/create-pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies || '' // Usar os cookies da sessão
        },
        body: JSON.stringify({
          plan: 'test',
          durationDays: 0.021,
          payerEmail: 'test@example.com',
          payerFirstName: 'Test',
          payerLastName: 'User'
        })
      });
      
      console.log('Status do pagamento:', paymentResponse.status);
      const paymentResult = await paymentResponse.text();
      console.log('Resposta do pagamento:', paymentResult);
    }
    
  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

testAuth();