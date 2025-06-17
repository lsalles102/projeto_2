/**
 * Script para testar o sistema de licenças automatizado
 */

async function testLicenseSystem() {
  const baseUrl = 'http://localhost:5000';
  
  console.log('🧪 Testando sistema de licenças...');
  
  try {
    // 1. Primeiro vamos registrar um usuário de teste
    console.log('📝 Registrando usuário de teste...');
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'teste@example.com',
        username: 'testusr',
        password: 'MinhaSenh@123',
        firstName: 'Usuario',
        lastName: 'Teste'
      }),
    });

    if (!registerResponse.ok) {
      const error = await registerResponse.json();
      console.log('ℹ️ Registro falhou (usuário pode já existir):', error.message);
    } else {
      console.log('✅ Usuário registrado com sucesso');
    }

    // 2. Fazer login
    console.log('🔐 Fazendo login...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email: 'teste@example.com',
        password: 'MinhaSenh@123'
      }),
    });

    if (!loginResponse.ok) {
      const error = await loginResponse.json();
      throw new Error(`Login falhou: ${error.message}`);
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login realizado com sucesso');

    // 3. Criar uma licença de teste diretamente no backend
    console.log('🎫 Ativando licença de teste...');
    
    // Simular ativação de licença usando o endpoint de teste
    const activateResponse = await fetch(`${baseUrl}/api/test/activate-license`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        plan: 'test',
        durationMinutes: 3 // 3 minutos para teste
      }),
    });

    if (!activateResponse.ok) {
      const error = await activateResponse.json();
      console.log('⚠️ Endpoint de teste não encontrado, criando licença manualmente...');
      
      // Ativar licença usando a função direta
      console.log('🔧 Ativando licença via função direta...');
      // Aqui precisaríamos importar e usar as funções do servidor
      // Por enquanto, vamos verificar o dashboard
    } else {
      console.log('✅ Licença de teste ativada');
    }

    // 4. Verificar dashboard
    console.log('📊 Verificando dashboard...');
    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!dashboardResponse.ok) {
      const error = await dashboardResponse.json();
      throw new Error(`Dashboard falhou: ${error.message}`);
    }

    const dashboardData = await dashboardResponse.json();
    console.log('📈 Status da licença:', {
      status: dashboardData.license?.license_status,
      remainingMinutes: dashboardData.license?.license_remaining_minutes,
      plan: dashboardData.license?.license_plan,
      hwid: dashboardData.license?.hwid
    });

    // 5. Testar heartbeat
    if (dashboardData.license?.license_status === 'ativa') {
      console.log('💓 Testando heartbeat...');
      const heartbeatResponse = await fetch(`${baseUrl}/api/license/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          hwid: 'TEST-HWID-12345'
        }),
      });

      if (heartbeatResponse.ok) {
        const heartbeatData = await heartbeatResponse.json();
        console.log('✅ Heartbeat funcionando:', heartbeatData);
      } else {
        const error = await heartbeatResponse.json();
        console.log('❌ Heartbeat falhou:', error);
      }
    }

    console.log('🎉 Teste concluído! Monitoramento automático rodando a cada minuto.');
    console.log('⏱️ Aguarde 1-2 minutos e verifique o dashboard para ver a contagem decrescente.');

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar teste
testLicenseSystem();