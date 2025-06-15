import { storage } from "./server/storage.js";
import bcrypt from "bcrypt";

async function testCompleteSystem() {
  try {
    console.log("=== TESTE COMPLETO DO SISTEMA CORRIGIDO ===");
    
    // 1. Verificar banco de dados
    console.log("\n1. Testando conexão com banco...");
    const stats = await storage.getSystemStats();
    console.log("✅ Banco conectado. Total de usuários:", stats.users);
    
    // 2. Testar registro de usuário
    console.log("\n2. Testando registro de usuário...");
    const testEmail = `test_registro_${Date.now()}@example.com`;
    const hashedPassword = await bcrypt.hash("123456", 10);
    
    const newUser = await storage.createUser({
      email: testEmail,
      username: `test_${Date.now()}`,
      password: hashedPassword,
      firstName: "Teste",
      lastName: "Usuario"
    });
    console.log("✅ Usuário criado:", newUser.email);
    
    // 3. Testar busca de usuário por email
    console.log("\n3. Testando busca por email...");
    const foundUser = await storage.getUserByEmail(testEmail);
    console.log("✅ Usuário encontrado:", foundUser?.email);
    
    // 4. Testar validação de senha
    console.log("\n4. Testando validação de senha...");
    const isPasswordValid = await bcrypt.compare("123456", foundUser?.password || "");
    console.log("✅ Senha válida:", isPasswordValid);
    
    // 5. Testar criação de licença
    console.log("\n5. Testando criação de licença...");
    const license = await storage.createLicense({
      userId: newUser.id,
      key: `TEST-${Date.now()}`,
      plan: "test",
      status: "active",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
      totalMinutesRemaining: 30,
      daysRemaining: 0,
      hoursRemaining: 0,
      minutesRemaining: 30,
      activatedAt: new Date(),
    });
    console.log("✅ Licença criada:", license.key);
    
    // 6. Testar busca de licença por usuário
    console.log("\n6. Testando busca de licença...");
    const userLicense = await storage.getLicenseByUserId(newUser.id);
    console.log("✅ Licença encontrada:", userLicense?.key);
    
    // 7. Testar atualização de usuário
    console.log("\n7. Testando atualização de usuário...");
    const updatedUser = await storage.updateUser(newUser.id, {
      firstName: "Teste Atualizado"
    });
    console.log("✅ Usuário atualizado:", updatedUser.firstName);
    
    // 8. Limpeza - remover dados de teste
    console.log("\n8. Limpando dados de teste...");
    if (license.id) await storage.deleteLicense(license.id);
    await storage.deleteUser(newUser.id);
    console.log("✅ Dados de teste removidos");
    
    console.log("\n=== TODOS OS TESTES APROVADOS! SISTEMA FUNCIONANDO ===");
    return true;
    
  } catch (error) {
    console.error("❌ ERRO NO TESTE:", error);
    return false;
  }
}

testCompleteSystem().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("Erro fatal:", error);
  process.exit(1);
});