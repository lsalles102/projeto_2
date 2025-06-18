import { storage } from "./storage";
// bcrypt removed - using plain text passwords

// Função para criar usuário admin de teste
export async function createTestAdmin() {
  try {
    console.log("=== CRIANDO USUÁRIO ADMIN DE TESTE ===");
    
    // Verificar se admin já existe
    const existingAdmin = await storage.getUserByEmail("lsalles102@gmail.com");
    if (existingAdmin) {
      console.log("✅ Admin já existe:", existingAdmin.email);
      return existingAdmin;
    }
    
    // Criar admin
    const adminUser = await storage.createUser({
      email: "lsalles102@gmail.com",
      username: "admin",
      password: "SenhaCorrigida@123",
      firstName: "Admin",
      lastName: "FovDark",
      is_admin: true
    });
    
    console.log("✅ Admin criado com sucesso:", adminUser.email);
    return adminUser;
  } catch (error) {
    console.error("❌ Erro ao criar admin:", error);
    throw error;
  }
}

// Função para testar registro de usuário
export async function testUserRegistration() {
  try {
    console.log("=== TESTANDO REGISTRO DE USUÁRIO ===");
    
    const testEmail = `test${Date.now()}@example.com`;
    const hashedPassword = await bcrypt.hash("123456", 10);
    
    const user = await storage.createUser({
      email: testEmail,
      username: `test${Date.now()}`,
      password: hashedPassword,
      firstName: "Teste",
      lastName: "Usuario"
    });
    
    console.log("✅ Usuário teste criado:", user.email);
    return user;
  } catch (error) {
    console.error("❌ Erro no teste de registro:", error);
    throw error;
  }
}

// Função para verificar banco de dados
export async function checkDatabase() {
  try {
    console.log("=== VERIFICANDO BANCO DE DADOS ===");
    
    const stats = await storage.getSystemStats();
    console.log("Estatísticas do banco:", stats);
    
    const allUsers = await storage.getAllUsers();
    console.log(`Total de usuários: ${allUsers.length}`);
    
    return { stats, userCount: allUsers.length };
  } catch (error) {
    console.error("❌ Erro ao verificar banco:", error);
    throw error;
  }
}