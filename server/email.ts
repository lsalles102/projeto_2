import nodemailer from 'nodemailer';

// Create email transporter
const createTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER || 'contato@suportefovdark.shop';
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
  
  const resetUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Redefinição de Senha',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Redefinição de Senha</h2>
        <p>Você solicitou a redefinição de sua senha.</p>
        <p>Clique no link abaixo para redefinir sua senha:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Redefinir Senha
        </a>
        <p>Este link expirará em 1 hora.</p>
        <p>Se você não solicitou esta redefinição, ignore este email.</p>
      </div>
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

// Função para buscar email alternativo no banco de dados
async function findUserEmailFromDatabase(licenseKey: string): Promise<string | null> {
  try {
    // Importar storage dinamicamente para evitar dependência circular
    const { storage } = await import('./storage');
    
    // Buscar licença pela chave
    const license = await storage.getLicenseByKey(licenseKey);
    if (!license) {
      console.log(`[EMAIL] Licença não encontrada para chave: ${licenseKey}`);
      return null;
    }
    
    // Buscar usuário pela licença
    const user = await storage.getUser(license.userId);
    if (!user || !user.email) {
      console.log(`[EMAIL] Usuário não encontrado ou sem email para licença: ${licenseKey}`);
      return null;
    }
    
    console.log(`[EMAIL] Email encontrado no banco: ${user.email}`);
    return user.email;
    
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
  console.log(`[EMAIL] Iniciando envio de email de licença`);
  console.log(`[EMAIL] Email recebido: "${email}"`);
  console.log(`[EMAIL] Chave de licença: "${licenseKey}"`);
  console.log(`[EMAIL] Plano: "${planName}"`);
  
  // 1. VALIDAR PARÂMETROS OBRIGATÓRIOS
  if (!licenseKey || licenseKey.trim() === '') {
    console.error(`[EMAIL] ❌ ERRO: Chave de licença está vazia`);
    throw new Error('Chave de licença não pode estar vazia');
  }
  
  if (!planName || planName.trim() === '') {
    console.error(`[EMAIL] ❌ ERRO: Nome do plano está vazio`);
    throw new Error('Nome do plano não pode estar vazio');
  }
  
  // 2. DETERMINAR EMAIL VÁLIDO PARA ENVIO
  let finalEmail: string | null = null;
  
  // Tentar usar o email fornecido primeiro
  if (email && isValidEmail(email)) {
    finalEmail = email.trim().replace(/['"]+/g, '').replace(/\s+/g, '');
    console.log(`[EMAIL] ✅ Email do Mercado Pago válido: "${finalEmail}"`);
  } else {
    console.log(`[EMAIL] ⚠️ Email do Mercado Pago inválido ou mascarado: "${email}"`);
    
    // Tentar buscar email alternativo no banco de dados
    const dbEmail = await findUserEmailFromDatabase(licenseKey);
    if (dbEmail && isValidEmail(dbEmail)) {
      finalEmail = dbEmail;
      console.log(`[EMAIL] ✅ Email encontrado no banco de dados: "${finalEmail}"`);
    } else {
      console.log(`[EMAIL] ❌ Email do banco também inválido ou não encontrado`);
    }
  }
  
  // 3. VERIFICAR SE TEMOS UM EMAIL VÁLIDO
  if (!finalEmail) {
    const errorMsg = `Não foi possível encontrar um email válido para envio. Email MP: "${email}", Chave: "${licenseKey}"`;
    console.error(`[EMAIL] ❌ ERRO CRÍTICO: ${errorMsg}`);
    
    // Registrar falha mas não quebrar o fluxo
    console.log(`[EMAIL] ⚠️ Registrando falha de envio mas continuando processamento`);
    throw new Error(errorMsg);
  }
  
  // 4. PREPARAR E ENVIAR EMAIL
  const transporter = createTransporter();
  const fromEmail = process.env.SMTP_USER || 'contato@suportefovdark.shop';
  
  const mailOptions = {
    from: `"FovDark" <${fromEmail}>`,
    to: finalEmail,
    subject: 'Sua Chave de Licença FovDark - Ativação Confirmada',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1a1a1a; color: #ffffff; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00ff88; margin: 0;">FovDark</h1>
          <p style="color: #888; margin: 5px 0;">Software Licensing Platform</p>
        </div>
        
        <h2 style="color: #00ff88;">Pagamento Confirmado!</h2>
        <p>Parabéns! Seu pagamento foi processado com sucesso.</p>
        
        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #00ff88; margin-top: 0;">Detalhes da Compra:</h3>
          <p><strong>Plano:</strong> ${planName}</p>
          <p><strong>Sua Chave de Licença:</strong></p>
          <div style="background-color: #000; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 18px; letter-spacing: 2px; text-align: center; color: #00ff88; border: 2px solid #00ff88;">
            <strong>${licenseKey}</strong>
          </div>
        </div>
        
        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #00ff88; margin-top: 0;">Como Ativar:</h3>
          <ol style="color: #cccccc;">
            <li>Faça login em sua conta no FovDark</li>
            <li>Vá para o Dashboard</li>
            <li>Insira sua chave de licença no campo "Ativar Licença"</li>
            <li>Clique em "Ativar" para começar a usar</li>
          </ol>
        </div>
        
        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #ff6b6b; margin-top: 0;">⚠️ Importante:</h3>
          <ul style="color: #cccccc;">
            <li>Guarde esta chave em local seguro</li>
            <li>Não compartilhe sua chave com terceiros</li>
            <li>A chave será vinculada ao seu hardware após ativação</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #333;">
          <p style="color: #888; font-size: 14px;">
            Se você tiver dúvidas, entre em contato conosco.<br>
            Obrigado por escolher FovDark!
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