// Script de debug para testar a criação de pagamento PIX
const fetch = require('node-fetch');

async function testPixPayment() {
  try {
    console.log('Testando criação de pagamento PIX...');
    
    const response = await fetch('http://localhost:5000/api/payments/create-pix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=test-session'
      },
      body: JSON.stringify({
        plan: 'test',
        durationDays: 0.021,
        payerEmail: 'test@example.com',
        payerFirstName: 'Test',
        payerLastName: 'User'
      })
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers.raw());
    
    const result = await response.text();
    console.log('Response:', result);
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

testPixPayment();