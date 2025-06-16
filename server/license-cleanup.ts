import { storage } from "./storage";
import { db } from "./db";
import { users, licenseHistory } from "@shared/schema";
import { eq, lt, and } from "drizzle-orm";

/**
 * Sistema de limpeza automática de licenças expiradas
 * Remove licenças vencidas e atualiza status dos usuários
 */
export class LicenseCleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    // Desabilitado temporariamente para evitar exclusão indevida de usuários
    console.log("🛑 Sistema de limpeza automática DESABILITADO para correções");
  }

  /**
   * Inicia o agendador de limpeza (executa a cada 5 minutos)
   */
  startCleanupScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Executa imediatamente
    this.performCleanup();

    // Agenda para executar a cada 5 minutos
    this.intervalId = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // 5 minutos

    console.log("🧹 Sistema de limpeza de licenças iniciado (executa a cada 5 minutos)");
  }

  /**
   * Para o agendador de limpeza
   */
  stopCleanupScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("🛑 Sistema de limpeza de licenças parado");
  }

  /**
   * Executa a limpeza de licenças expiradas
   */
  async performCleanup() {
    if (this.isRunning) {
      console.log("⏳ Limpeza já está em execução, pulando...");
      return;
    }

    this.isRunning = true;
    
    try {
      console.log("🧹 Iniciando limpeza de licenças expiradas...");
      
      const now = new Date();
      
      // 1. Encontrar licenças expiradas
      const expiredLicenses = await db.query.licenses.findMany({
        where: (licenses, { or, lt, eq, and }) => or(
          // Licenças com data de expiração passada
          lt(licenses.expiresAt, now),
          // Licenças com 0 minutos restantes
          and(
            eq(licenses.totalMinutesRemaining, 0),
            eq(licenses.status, 'active')
          )
        ),
      });

      console.log(`🔍 Encontradas ${expiredLicenses.length} licenças expiradas`);

      let deletedCount = 0;
      let updatedUsersCount = 0;

      for (const license of expiredLicenses) {
        try {
          // 2. Remover a licença do campo 'licenses' do usuário
          const user = await storage.getUser(license.userId);
          if (user && user.licenses) {
            // Remove a licença do objeto JSON do usuário
            const userLicenses = user.licenses as any;
            if (userLicenses && userLicenses.key === license.key) {
              await storage.updateUser(license.userId, {
                licenses: null // Remove a licença do usuário
              });
              updatedUsersCount++;
              console.log(`👤 Usuário ${user.email} teve licença removida`);
            }
          }

          // 3. Excluir a licença da tabela
          await db.delete(licenses).where(eq(licenses.id, license.id));
          deletedCount++;
          
          console.log(`🗑️ Licença ${license.key} (${license.plan}) excluída - Usuário: ${user?.email || 'N/A'}`);
          
        } catch (error) {
          console.error(`❌ Erro ao processar licença ${license.key}:`, error);
        }
      }

      // 4. Atualizar status de licenças próximas ao vencimento
      await this.updateExpiringLicenses();

      console.log(`✅ Limpeza concluída: ${deletedCount} licenças excluídas, ${updatedUsersCount} usuários atualizados`);
      
    } catch (error) {
      console.error("❌ Erro durante limpeza de licenças:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Atualiza licenças que estão próximas ao vencimento
   */
  private async updateExpiringLicenses() {
    try {
      // Encontrar licenças ativas com pouco tempo restante
      const expiringLicenses = await db.query.licenses.findMany({
        where: (licenses, { and, eq, lte }) => and(
          eq(licenses.status, 'active'),
          lte(licenses.totalMinutesRemaining, 1440) // 24 horas em minutos
        ),
      });

      console.log(`⏰ Encontradas ${expiringLicenses.length} licenças próximas ao vencimento`);

      for (const license of expiringLicenses) {
        if (license.totalMinutesRemaining && license.totalMinutesRemaining <= 0) {
          // Marcar como expirada se chegou a 0
          await db.update(licenses)
            .set({ 
              status: 'expired',
              totalMinutesRemaining: 0,
              daysRemaining: 0,
              hoursRemaining: 0,
              minutesRemaining: 0
            })
            .where(eq(licenses.id, license.id));
            
          console.log(`⏰ Licença ${license.key} marcada como expirada`);
        }
      }
    } catch (error) {
      console.error("❌ Erro ao atualizar licenças expirando:", error);
    }
  }

  /**
   * Executa uma limpeza manual
   */
  async manualCleanup() {
    console.log("🔧 Executando limpeza manual de licenças...");
    await this.performCleanup();
  }

  /**
   * Retorna estatísticas do sistema de limpeza
   */
  async getCleanupStats() {
    const now = new Date();
    
    const [totalLicenses, activeLicenses, expiredLicenses, expiringLicenses] = await Promise.all([
      db.query.licenses.findMany(),
      db.query.licenses.findMany({
        where: (licenses, { eq }) => eq(licenses.status, 'active'),
      }),
      db.query.licenses.findMany({
        where: (licenses, { or, lt, eq, and }) => or(
          lt(licenses.expiresAt, now),
          and(eq(licenses.totalMinutesRemaining, 0), eq(licenses.status, 'active'))
        ),
      }),
      db.query.licenses.findMany({
        where: (licenses, { and, eq, lte }) => and(
          eq(licenses.status, 'active'),
          lte(licenses.totalMinutesRemaining, 1440)
        ),
      })
    ]);

    return {
      total: totalLicenses.length,
      active: activeLicenses.length,
      expired: expiredLicenses.length,
      expiring: expiringLicenses.length,
      isRunning: this.isRunning,
      nextCleanup: this.intervalId ? 'Próxima limpeza em 5 minutos' : 'Parado'
    };
  }
}

// Instância singleton do serviço de limpeza
export const licenseCleanupService = new LicenseCleanupService();