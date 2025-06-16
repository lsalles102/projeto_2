import { storage } from './storage';
import { db } from './db';
import { users } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';

/**
 * Sistema centralizado de gerenciamento de licenças
 * Unificado e simplificado para eliminar fragmentação
 */

export interface LicenseStatus {
  isActive: boolean;
  status: string;
  plan?: string;
  expiresAt?: Date;
  totalMinutes?: number;
  remainingMinutes?: number;
  hwid?: string;
  lastHeartbeat?: Date;
}

export class LicenseManager {
  /**
   * Ativa licença para usuário após pagamento aprovado
   */
  async activateLicense(
    userId: string,
    plan: "test" | "7days" | "15days",
    durationDays: number
  ): Promise<boolean> {
    try {
      const totalMinutes = Math.floor(durationDays * 24 * 60);
      const expiresAt = new Date(Date.now() + (durationDays * 24 * 60 * 60 * 1000));

      await storage.updateUser(userId, {
        license_status: "ativa",
        license_plan: plan,
        license_expires_at: expiresAt,
        license_activated_at: new Date(),
        license_total_minutes: totalMinutes,
        license_remaining_minutes: totalMinutes,
        license_last_heartbeat: new Date()
      });

      console.log(`✅ Licença ativada: usuário ${userId}, plano ${plan}, ${totalMinutes} minutos`);
      return true;
    } catch (error) {
      console.error('Erro ao ativar licença:', error);
      return false;
    }
  }

  /**
   * Verifica status da licença do usuário
   */
  async checkLicenseStatus(userId: string): Promise<LicenseStatus> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { isActive: false, status: "usuario_nao_encontrado" };
      }

      // Verifica se tem licença
      if (!user.license_status || user.license_status === "sem_licenca") {
        return { isActive: false, status: "sem_licenca" };
      }

      // Verifica se já expirou por data
      if (user.license_expires_at && new Date() > user.license_expires_at) {
        await this.expireLicense(userId, "tempo_expirado");
        return { isActive: false, status: "expirada" };
      }

      // Verifica se já expirou por minutos
      if (user.license_remaining_minutes !== null && user.license_remaining_minutes <= 0) {
        await this.expireLicense(userId, "minutos_esgotados");
        return { isActive: false, status: "expirada" };
      }

      return {
        isActive: user.license_status === "ativa",
        status: user.license_status,
        plan: user.license_plan || undefined,
        expiresAt: user.license_expires_at || undefined,
        totalMinutes: user.license_total_minutes || undefined,
        remainingMinutes: user.license_remaining_minutes || undefined,
        hwid: user.hwid || undefined,
        lastHeartbeat: user.license_last_heartbeat || undefined
      };
    } catch (error) {
      console.error('Erro ao verificar status da licença:', error);
      return { isActive: false, status: "erro_sistema" };
    }
  }

  /**
   * Processa heartbeat e decrementa tempo da licença
   */
  async processHeartbeat(userId: string, hwid?: string): Promise<{
    success: boolean;
    message: string;
    remainingMinutes?: number;
  }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, message: "Usuário não encontrado" };
      }

      // Verifica se tem licença ativa
      if (user.license_status !== "ativa") {
        return { success: false, message: "Licença não ativa" };
      }

      // Verifica HWID se fornecido
      if (hwid && user.hwid && user.hwid !== hwid) {
        return { success: false, message: "HWID não corresponde" };
      }

      // Define HWID se não estiver definido
      if (hwid && !user.hwid) {
        await storage.updateUser(userId, { hwid });
      }

      // Verifica se ainda tem minutos
      const remainingMinutes = user.license_remaining_minutes || 0;
      if (remainingMinutes <= 0) {
        await this.expireLicense(userId, "minutos_esgotados");
        return { success: false, message: "Licença expirada - sem minutos" };
      }

      // Decrementa 1 minuto
      const newRemainingMinutes = Math.max(0, remainingMinutes - 1);
      
      await storage.updateUser(userId, {
        license_remaining_minutes: newRemainingMinutes,
        license_last_heartbeat: new Date()
      });

      // Se chegou a 0, expira a licença
      if (newRemainingMinutes === 0) {
        await this.expireLicense(userId, "minutos_esgotados");
        return { success: false, message: "Licença expirada - tempo esgotado" };
      }

      return {
        success: true,
        message: "Heartbeat processado",
        remainingMinutes: newRemainingMinutes
      };
    } catch (error) {
      console.error('Erro no heartbeat:', error);
      return { success: false, message: "Erro interno do servidor" };
    }
  }

  /**
   * Expira licença do usuário
   */
  private async expireLicense(userId: string, reason: string): Promise<void> {
    try {
      await storage.updateUser(userId, {
        license_status: "expirada",
        license_remaining_minutes: 0
      });

      console.log(`⏰ Licença expirada para usuário ${userId}: ${reason}`);
    } catch (error) {
      console.error('Erro ao expirar licença:', error);
    }
  }

  /**
   * Limpeza automática de licenças expiradas
   */
  async cleanupExpiredLicenses(): Promise<void> {
    try {
      const now = new Date();
      
      // Buscar licenças expiradas por data
      const expiredByDate = await db.select()
        .from(users)
        .where(
          and(
            eq(users.license_status, "ativa"),
            lt(users.license_expires_at, now)
          )
        );

      // Buscar licenças sem minutos
      const expiredByMinutes = await db.select()
        .from(users)
        .where(
          and(
            eq(users.license_status, "ativa"),
            eq(users.license_remaining_minutes, 0)
          )
        );

      const allExpired = [...expiredByDate, ...expiredByMinutes];
      
      for (const user of allExpired) {
        await this.expireLicense(user.id, "limpeza_automatica");
      }

      if (allExpired.length > 0) {
        console.log(`🧹 Limpeza automática: ${allExpired.length} licenças expiradas`);
      }
    } catch (error) {
      console.error('Erro na limpeza automática:', error);
    }
  }

  /**
   * Estatísticas do sistema de licenças
   */
  async getStats(): Promise<{
    totalUsers: number;
    activeLicenses: number;
    expiredLicenses: number;
    noLicenses: number;
  }> {
    try {
      const allUsers = await db.select().from(users);
      
      return {
        totalUsers: allUsers.length,
        activeLicenses: allUsers.filter(u => u.license_status === "ativa").length,
        expiredLicenses: allUsers.filter(u => u.license_status === "expirada").length,
        noLicenses: allUsers.filter(u => !u.license_status || u.license_status === "sem_licenca").length
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      return { totalUsers: 0, activeLicenses: 0, expiredLicenses: 0, noLicenses: 0 };
    }
  }
}

export const licenseManager = new LicenseManager();

// Iniciar limpeza automática a cada 5 minutos
setInterval(() => {
  licenseManager.cleanupExpiredLicenses();
}, 5 * 60 * 1000);

console.log('🔐 Sistema centralizado de licenças inicializado');