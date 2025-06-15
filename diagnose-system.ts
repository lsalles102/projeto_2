import { storage } from "./server/storage.js";
import bcrypt from "bcrypt";

async function diagnoseSystem() {
  try {
    console.log("=== DIAGNÓSTICO COMPLETO DO SISTEMA ===");
    
    // 1. Verificar conexão com banco
    console.log("1. Verificando conexão com banco de dados...");
    const stats = await storage.getSystemStats();
    console.log("✅ Banco conectado. Stats:", stats);
    
    // 2. Verificar usuários existentes
    console.log("\n2. Verificando usuários existentes...");
    const allUsers = await storage.getAllUsers();
    console.log(`Total de usuários: ${allUsers.length}`);
    
    for (const user of allUsers.slice(0, 5)) {
      console.log(`- ${user.email} (ID: ${user.id}, Admin: ${user.isAdmin || false})`);
    }
    
    // 3. Verificar admin
    console.log("\n3. Verificando usuário admin...");
    let adminUser = await storage.getUserByEmail("lsalles102@gmail.com");
    
    if (!adminUser) {
      console.log("Admin não encontrado, criando...");
      const hashedPassword = await bcrypt.hash("admin123", 10);
      adminUser = await storage.createUser({
        email: "lsalles102@gmail.com",
        username: "admin",
        password: hashedPassword,
        firstName: "Admin",
        lastName: "FovDark",
        isAdmin: true
      });
      console.log("✅ Admin criado:", adminUser.email);
    } else {
      console.log("✅ Admin encontrado:", adminUser.email);
    }
    
    // 4. Testar criação de usuário
    console.log("\n4. Testando criação de usuário normal...");
    const testEmail = `teste_${Date.now()}@example.com`;
    const hashedPassword = await bcrypt.hash("123456", 10);
    
    try {
      const testUser = await storage.createUser({
        email: testEmail,
        username: `teste_${Date.now()}`,
        password: hashedPassword,
        firstName: "Usuario",
        lastName: "Teste"
      });
      console.log("✅ Usuário teste criado:", testUser.email);
      
      // Remover usuário teste
      await storage.deleteUser(testUser.id);
      console.log("✅ Usuário teste removido");
    } catch (error) {
      console.error("❌ Erro ao criar usuário teste:", error);
    }
    
    // 5. Verificar licenças
    console.log("\n5. Verificando licenças...");
    const allLicenses = await storage.getAllLicenses();
    console.log(`Total de licenças: ${allLicenses.length}`);
    
    // 6. Verificar pagamentos
    console.log("\n6. Verificando pagamentos...");
    const allPayments = await storage.getAllPayments();
    console.log(`Total de pagamentos: ${allPayments.length}`);
    
    console.log("\n=== DIAGNÓSTICO CONCLUÍDO COM SUCESSO ===");
    return true;
    
  } catch (error) {
    console.error("❌ ERRO NO DIAGNÓSTICO:", error);
    return false;
  }
}

// Executar diagnóstico
diagnoseSystem().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("Erro fatal:", error);
  process.exit(1);
});