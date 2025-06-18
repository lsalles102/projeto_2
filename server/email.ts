import nodemailer from 'nodemailer';

// Create email transporter
const createTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_FROM || 'contato@suportefovdark.shop';
  const pass = process.env.SMTP_PASS;
  
  console.log(`[EMAIL] Configurando transporter - Host: ${host}, Port: ${port}, User: ${user ? 'configurado' : 'não configurado'}`);
  
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    },
    debug: true,
    logger: true
  });
};

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const transporter = createTransporter();
  
  // Use getBaseUrl from config for correct URL construction
  const { getBaseUrl } = await import('./config');
  const resetUrl = `${getBaseUrl()}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: process.env.SMTP_FROM || 'contato@suportefovdark.shop',
    to: email,
    subject: 'Redefinição de Senha - FovDark',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Redefinição de Senha</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 28px;">FovDark</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Sistema de Licenças</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #8b00ff 0%, #ff1493 100%); padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
            <h2 style="color: white; margin: 0 0 15px 0; font-size: 24px;">Redefinição de Senha</h2>
            <p style="color: white; margin: 0; font-size: 16px; opacity: 0.9;">Solicitação de nova senha recebida</p>
          </div>
          
          <div style="padding: 0 20px;">
            <p style="color: #333; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              Você solicitou a redefinição de sua senha. Clique no botão abaixo para criar uma nova senha:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: linear-gradient(135deg, #8b00ff 0%, #ff1493 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(139, 0, 255, 0.4);">
                🔑 Redefinir Senha
              </a>
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="color: #856404; margin: 0; font-size: 14px;">
                <strong>⚠️ Importante:</strong> Este link expira em 15 minutos por segurança.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 15px;">
              Se o botão não funcionar, copie e cole este link no seu navegador:
            </p>
            <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 12px; color: #495057;">
              ${resetUrl}
            </p>
            
            <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Se você não solicitou esta redefinição, pode ignorar este email com segurança. Sua senha atual permanecerá inalterada.
              </p>
              <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
                Este é um email automático, não responda.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de redefinição enviado para:', email);
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    throw new Error('Falha ao enviar email de redefinição');
  }
}

// Função para validar email
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  
  // Remover espaços e caracteres inválidos
  const cleanEmail = email.trim().replace(/['"]+/g, '').replace(/\s+/g, '');
  
  // Verificar se é email mascarado
  if (cleanEmail.includes('XXXXX') || /^X+$/.test(cleanEmail)) return false;
  
  // Verificar formato básico
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleanEmail);
}

// Função para buscar email alternativo no banco de dados (não mais necessária com o novo sistema)
async function findUserEmailFromDatabase(licenseKey: string): Promise<string | null> {
  try {
    console.log(`[EMAIL] Sistema simplificado - não é mais necessário buscar por chave de licença`);
    return null;
  } catch (error) {
    console.error(`[EMAIL] Erro ao buscar email no banco:`, error);
    return null;
  }
}

// Nova função para tentar envio robusto sem quebrar o fluxo
export async function sendLicenseKeyEmailRobust(email: string, licenseKey: string, planName: string): Promise<{ success: boolean; error?: string }> {
  try {
    await sendLicenseKeyEmail(email, licenseKey, planName);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`[EMAIL] ❌ Falha no envio robusto:`, errorMessage);
    
    // Registrar falha detalhadamente mas não quebrar
    console.log(`[EMAIL] ⚠️ REGISTRO DE FALHA - SISTEMA CONTINUARÁ FUNCIONANDO`);
    console.log(`[EMAIL] - Email tentado: "${email}"`);
    console.log(`[EMAIL] - Chave de licença: "${licenseKey}"`);
    console.log(`[EMAIL] - Plano: "${planName}"`);
    console.log(`[EMAIL] - Erro: ${errorMessage}`);
    console.log(`[EMAIL] - Timestamp: ${new Date().toISOString()}`);
    console.log(`[EMAIL] ℹ️ Usuário pode fazer login no sistema para ver sua licença ativada`);
    
    return { success: false, error: errorMessage };
  }
}

export async function sendLicenseKeyEmail(email: string, licenseKey: string, planName: string) {
  console.log(`[EMAIL] Iniciando envio de email de confirmação de licença`);
  console.log(`[EMAIL] Email recebido: "${email}"`);
  console.log(`[EMAIL] Plano: "${planName}"`);
  
  // 1. VALIDAR PARÂMETROS OBRIGATÓRIOS
  if (!planName || planName.trim() === '') {
    console.error(`[EMAIL] ❌ ERRO: Nome do plano está vazio`);
    throw new Error('Nome do plano não pode estar vazio');
  }
  
  // 2. DETERMINAR EMAIL VÁLIDO PARA ENVIO
  let finalEmail: string | null = null;
  
  // Tentar usar o email fornecido primeiro
  if (email && isValidEmail(email)) {
    finalEmail = email.trim().replace(/['"]+/g, '').replace(/\s+/g, '');
    console.log(`[EMAIL] ✅ Email válido: "${finalEmail}"`);
  } else {
    console.log(`[EMAIL] ⚠️ Email inválido ou mascarado: "${email}"`);
  }
  
  // 3. VERIFICAR SE TEMOS UM EMAIL VÁLIDO
  if (!finalEmail) {
    const errorMsg = `Não foi possível encontrar um email válido para envio. Email: "${email}"`;
    console.error(`[EMAIL] ❌ ERRO CRÍTICO: ${errorMsg}`);
    
    // Registrar falha mas não quebrar o fluxo
    console.log(`[EMAIL] ⚠️ Registrando falha de envio mas continuando processamento`);
    throw new Error(errorMsg);
  }
  
  // Determinar duração da licença baseada no plano
  let licenseDuration = '';
  let licenseMinutes = 0;
  
  switch (planName.toLowerCase()) {
    case 'teste (30 minutos)':
    case 'test':
      licenseDuration = '30 minutos';
      licenseMinutes = 30;
      break;
    case '7 dias':
    case '7days':
      licenseDuration = '7 dias';
      licenseMinutes = 7 * 24 * 60;
      break;
    case '15 dias':
    case '15days':
      licenseDuration = '15 dias';
      licenseMinutes = 15 * 24 * 60;
      break;
    default:
      licenseDuration = planName;
      licenseMinutes = 0;
  }
  
  // 4. PREPARAR E ENVIAR EMAIL
  const transporter = createTransporter();
  const fromEmail = process.env.SMTP_FROM || 'contato@suportefovdark.shop';
  
  const mailOptions = {
    from: `"FovDark" <${fromEmail}>`,
    to: finalEmail,
    subject: 'Licença FovDark Ativada - Pagamento Confirmado',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000000; color: #ffffff; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #8b00ff; margin: 0; text-shadow: 0 0 10px #8b00ff;">FovDark</h1>
          <p style="color: #888; margin: 5px 0;">Sistema de Licenças</p>
        </div>
        
        <h2 style="color: #8b00ff; text-shadow: 0 0 10px #8b00ff;">Licença Ativada com Sucesso!</h2>
        <p>Parabéns! Seu pagamento foi confirmado e sua licença já está ativa em sua conta.</p>
        
        <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #8b00ff;">
          <h3 style="color: #ff1493; margin-top: 0; text-shadow: 0 0 10px #ff1493;">Detalhes da Licença:</h3>
          <p><strong>Plano:</strong> ${planName}</p>
          <p><strong>Tempo de Licença:</strong> ${licenseDuration}</p>
          <p><strong>Status:</strong> <span style="color: #8b00ff; text-shadow: 0 0 5px #8b00ff;">ATIVA</span></p>
        </div>
        
        <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ff1493;">
          <h3 style="color: #ff1493; margin-top: 0; text-shadow: 0 0 10px #ff1493;">Como Acessar e Fazer Download:</h3>
          <ol style="color: #cccccc; line-height: 1.6;">
            <li><strong>Faça login em sua conta no FovDark</strong><br>
                <span style="color: #888; font-size: 14px;">Acesse o site e entre com suas credenciais</span></li>
            <li><strong>Vá para o Dashboard</strong><br>
                <span style="color: #888; font-size: 14px;">Você verá sua licença ativa e o tempo restante</span></li>
            <li><strong>Baixe o software</strong><br>
                <span style="color: #888; font-size: 14px;">Use o botão de download disponível no dashboard</span></li>
            <li><strong>Execute o programa</strong><br>
                <span style="color: #888; font-size: 14px;">O software detectará automaticamente sua licença ativa</span></li>
          </ol>
        </div>
        
        <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #8b00ff;">
          <h3 style="color: #8b00ff; margin-top: 0; text-shadow: 0 0 10px #8b00ff;">Informações Importantes:</h3>
          <ul style="color: #cccccc; line-height: 1.6;">
            <li>Sua licença está vinculada à sua conta e será ativada automaticamente</li>
            <li>O tempo de licença começa a contar a partir da primeira utilização</li>
            <li>Você pode verificar o tempo restante a qualquer momento no dashboard</li>
            <li>Não é necessário inserir chaves de ativação - tudo é automático</li>
          </ul>
        </div>
        
        <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ff1493;">
          <h3 style="color: #ff1493; margin-top: 0; text-shadow: 0 0 10px #ff1493;">Suporte</h3>
          <p style="color: #cccccc; margin: 0;">
            Se você tiver alguma dúvida ou problema, entre em contato conosco através do site.
            Nossa equipe está pronta para ajudar!
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #333;">
          <p style="color: #888; font-size: 14px;">
            Obrigado por escolher FovDark!<br>
            Aproveite sua licença e tenha uma ótima experiência.
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 10px;">
            Este é um email automático, não responda.
          </p>
        </div>
      </div>
    `,
  };

  try {
    console.log(`[EMAIL] ✅ Enviando email para: "${finalEmail}"`);
    const result = await transporter.sendMail(mailOptions);
    
    console.log(`[EMAIL] ✅ EMAIL ENVIADO COM SUCESSO!`);
    console.log(`[EMAIL] Destinatário: ${finalEmail}`);
    console.log(`[EMAIL] Message ID: ${result.messageId}`);
    
    return result;
    
  } catch (error) {
    console.error(`[EMAIL] ❌ ERRO AO ENVIAR EMAIL`);
    console.error(`[EMAIL] Destinatário: "${finalEmail}"`);
    console.error(`[EMAIL] Erro:`, error);
    
    // Log detalhado para debug
    if (error instanceof Error) {
      console.error(`[EMAIL] Mensagem: ${error.message}`);
      if (error.message.includes('No recipients defined')) {
        console.error(`[EMAIL] ❌ ERRO: No recipients defined - verificar configuração`);
      }
    }
    
    throw new Error(`Falha ao enviar email: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

export async function sendContactEmail(
  email: string, 
  name: string, 
  subject: string, 
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter();
    const fromEmail = process.env.SMTP_FROM || 'contato@suportefovdark.shop';
    const supportEmail = process.env.SUPPORT_EMAIL || 'contato@suportefovdark.shop';

    // Email para o suporte
    const supportMailOptions = {
      from: `"FovDark Contact" <${fromEmail}>`,
      to: supportEmail,
      subject: `[SUPORTE] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000000; color: #ffffff; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #8b00ff; margin: 0; text-shadow: 0 0 10px #8b00ff;">FovDark</h1>
            <p style="color: #888; margin: 5px 0;">Nova Mensagem de Suporte</p>
          </div>
          
          <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #8b00ff;">
            <h3 style="color: #8b00ff; margin-top: 0;">Detalhes do Contato:</h3>
            <p><strong>Nome:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Assunto:</strong> ${subject}</p>
            <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
          </div>
          
          <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ff1493;">
            <h3 style="color: #ff1493; margin-top: 0;">Mensagem:</h3>
            <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
          </div>
        </div>
      `,
    };

    // Email de confirmação para o usuário
    const userMailOptions = {
      from: `"FovDark Support" <${fromEmail}>`,
      to: email,
      subject: 'Mensagem recebida - FovDark Support',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000000; color: #ffffff; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #8b00ff; margin: 0; text-shadow: 0 0 10px #8b00ff;">FovDark</h1>
            <p style="color: #888; margin: 5px 0;">Confirmação de Recebimento</p>
          </div>
          
          <h2 style="color: #8b00ff; text-shadow: 0 0 10px #8b00ff;">Obrigado por entrar em contato!</h2>
          <p>Olá ${name},</p>
          <p>Recebemos sua mensagem sobre: <strong>${subject}</strong></p>
          
          <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #8b00ff;">
            <p>Nossa equipe de suporte analisará sua solicitação e responderá em breve.</p>
            <p><strong>Tempo médio de resposta:</strong> 24-48 horas</p>
          </div>
          
          <div style="background-color: #111111; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ff1493;">
            <h3 style="color: #ff1493; margin-top: 0;">Para suporte mais rápido:</h3>
            <p>Você também pode entrar em contato conosco através do nosso Discord para suporte em tempo real.</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #333;">
            <p style="color: #888; font-size: 14px;">
              Atenciosamente,<br>
              Equipe FovDark
            </p>
          </div>
        </div>
      `,
    };

    // Enviar ambos os emails
    await Promise.all([
      transporter.sendMail(supportMailOptions),
      transporter.sendMail(userMailOptions)
    ]);

    console.log(`[CONTACT] Emails enviados com sucesso para: ${email}`);
    return { success: true };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[CONTACT] Erro ao enviar email de contato:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function testEmailConnection() {
  try {
    const transporter = createTransporter();
    console.log('Testando conexão SMTP com:', {
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: process.env.SMTP_PORT || '587',
      user: process.env.SMTP_USER || 'não configurado'
    });
    await transporter.verify();
    console.log('Conexão de email verificada com sucesso');
    return true;
  } catch (error) {
    console.error('Erro na conexão de email:', error);
    return false;
  }
}