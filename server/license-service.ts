import { storage } from "./storage";
import { db } from "./db";
import { users, licenseHistory, payments } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";

/**
 * Novo sistema de licenças integrado ao usuário
 * Remove o sistema de chaves de ativação
 * Licenças são ativadas diretamente na conta após pagamento aprovado
 */
export class LicenseService {
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    console.log("🔐 Sistema de controle de status de licença ativo");
  }

  /**
   * Calcula duração em minutos baseado no plano
   */
  private getPlanDurationMinutes(plan: string): number {
    switch (plan) {
      case "test":
        return 30; // 30 minutos para teste
      case "7days":
        return 7 * 24 * 60; // 7 dias em minutos
      case "15days":
        return 15 * 24 * 60; // 15 dias em minutos
      default:
        return 0;
    }
  }

  /**
   * Ativa licença diretamente na conta do usuário após pagamento aprovado
   */
  async activateLicenseForUser(
    userId: string, 
    plan: string, 
    paymentId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const durationMinutes = this.getPlanDurationMinutes(plan);
      if (durationMinutes === 0) {
        return { success: false, message: "Plano inválido" };
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      // Buscar usuário atual
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) {
        return { success: false, message: "Usuário não encontrado" };
      }

      const currentUser = user[0];
      let newTotalMinutes = durationMinutes;

      // Se já tem licença ativa, soma o tempo restante
      if (currentUser.license_status === "ativa" && currentUser.license_remaining_minutes > 0) {
        newTotalMinutes += currentUser.license_remaining_minutes;
      }

      // Atualizar usuário com licença ativa
      await db.update(users)
        .set({
          license_status: "ativa",
          license_plan: plan,
          license_expires_at: expiresAt,
          license_activated_at: now,
          license_total_minutes: newTotalMinutes,
          license_remaining_minutes: newTotalMinutes,
          updated_at: now
        })
        .where(eq(users.id, userId));

      // Registrar no histórico
      await db.insert(licenseHistory).values({
        userId: userId,
        action: "activated",
        plan: plan,
        minutes_added: durationMinutes,
        previous_status: currentUser.license_status || "sem_licenca",
        new_status: "ativa",
        payment_id: paymentId,
        notes: `Licença ativada automaticamente após pagamento aprovado. Duração: ${durationMinutes} minutos`
      });

      console.log(`✅ Licença ativada para usuário ${userId}: ${plan} (${durationMinutes} minutos)`);
      return { 
        success: true, 
        message: `Licença ${plan} ativada com sucesso! Duração: ${durationMinutes} minutos` 
      };

    } catch (error) {
      console.error("❌ Erro ao ativar licença:", error);
      return { success: false, message: "Erro interno ao ativar licença" };
    }
  }

  /**
   * Verifica status da licença do usuário
   */
  async checkUserLicense(userId: string, hwid?: string): Promise<{
    status: string;
    plan?: string;
    remainingMinutes: number;
    expiresAt?: Date;
    isValid: boolean;
  }> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) {
        return { status: "sem_licenca", remainingMinutes: 0, isValid: false };
      }

      const currentUser = user[0];
      const now = new Date();

      // Se não tem licença
      if (!currentUser.license_status || currentUser.license_status === "sem_licenca") {
        return { status: "sem_licenca", remainingMinutes: 0, isValid: false };
      }

      // Se licença expirou por tempo
      if (currentUser.license_expires_at && now > currentUser.license_expires_at) {
        await this.expireLicense(userId, "tempo_expirado");
        return { status: "expirada", remainingMinutes: 0, isValid: false };
      }

      // Se não tem minutos restantes
      if (currentUser.license_remaining_minutes <= 0) {
        await this.expireLicense(userId, "minutos_esgotados");
        return { status: "expirada", remainingMinutes: 0, isValid: false };
      }

      // Atualizar HWID se fornecido e diferente
      if (hwid && currentUser.hwid !== hwid) {
        await db.update(users)
          .set({ hwid: hwid, updated_at: now })
          .where(eq(users.id, userId));
      }

      // Atualizar último heartbeat
      await db.update(users)
        .set({ license_last_heartbeat: now })
        .where(eq(users.id, userId));

      return {
        status: currentUser.license_status,
        plan: currentUser.license_plan || undefined,
        remainingMinutes: currentUser.license_remaining_minutes || 0,
        expiresAt: currentUser.license_expires_at || undefined,
        isValid: currentUser.license_status === "ativa"
      };

    } catch (error) {
      console.error("❌ Erro ao verificar licença:", error);
      return { status: "erro", remainingMinutes: 0, isValid: false };
    }
  }

  /**
   * Decrementa tempo da licença (chamado pelo heartbeat)
   */
  async decrementLicenseTime(userId: string, minutesToDecrement: number = 1): Promise<boolean> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) return false;

      const currentUser = user[0];
      if (currentUser.license_status !== "ativa" || !currentUser.license_remaining_minutes) {
        return false;
      }

      const newRemainingMinutes = Math.max(0, currentUser.license_remaining_minutes - minutesToDecrement);
      
      await db.update(users)
        .set({
          license_remaining_minutes: newRemainingMinutes,
          license_last_heartbeat: new Date(),
          updated_at: new Date()
        })
        .where(eq(users.id, userId));

      // Se esgotou os minutos, expirar licença
      if (newRemainingMinutes <= 0) {
        await this.expireLicense(userId, "minutos_esgotados");
      }

      return true;
    } catch (error) {
      console.error("❌ Erro ao decrementar tempo de licença:", error);
      return false;
    }
  }

  /**
   * Expira licença do usuário
   */
  private async expireLicense(userId: string, reason: string): Promise<void> {
    try {
      const now = new Date();
      
      await db.update(users)
        .set({
          license_status: "expirada",
          license_remaining_minutes: 0,
          updated_at: now
        })
        .where(eq(users.id, userId));

      // Registrar no histórico
      await db.insert(licenseHistory).values({
        userId: userId,
        action: "expired",
        plan: "expired",
        minutes_added: 0,
        previous_status: "ativa",
        new_status: "expirada",
        notes: `Licença expirada automaticamente. Motivo: ${reason}`
      });

      console.log(`⏰ Licença expirada para usuário ${userId}: ${reason}`);
    } catch (error) {
      console.error("❌ Erro ao expirar licença:", error);
    }
  }

  /**
   * Inicia sistema de limpeza automática
   */
  startCleanupScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Executa a cada 1 minuto para verificar licenças
    this.intervalId = setInterval(() => {
      this.performCleanup();
    }, 60 * 1000); // 1 minuto

    console.log("🧹 Sistema de limpeza automática de licenças inicializado");
  }

  /**
   * Executa limpeza automática
   */
  private async performCleanup() {
    try {
      const now = new Date();
      
      // Buscar usuários com licenças que expiraram por tempo
      const expiredUsers = await db.select()
        .from(users)
        .where(
          and(
            eq(users.license_status, "ativa"),
            lt(users.license_expires_at, now)
          )
        );

      for (const user of expiredUsers) {
        await this.expireLicense(user.id, "tempo_expirado");
      }

      // Buscar usuários sem minutos restantes
      const noMinutesUsers = await db.select()
        .from(users)
        .where(
          and(
            eq(users.license_status, "ativa"),
            eq(users.license_remaining_minutes, 0)
          )
        );

      for (const user of noMinutesUsers) {
        await this.expireLicense(user.id, "minutos_esgotados");
      }

    } catch (error) {
      console.error("❌ Erro na limpeza automática:", error);
    }
  }

  /**
   * Para o sistema de limpeza
   */
  stopCleanupScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("🛑 Sistema de limpeza de licenças parado");
  }

  /**
   * Estatísticas do sistema
   */
  async getSystemStats() {
    try {
      const stats = await db.select().from(users);
      
      const activeCount = stats.filter(u => u.license_status === "ativa").length;
      const expiredCount = stats.filter(u => u.license_status === "expirada").length;
      const noLicenseCount = stats.filter(u => !u.license_status || u.license_status === "sem_licenca").length;

      return {
        total: stats.length,
        active: activeCount,
        expired: expiredCount,
        noLicense: noLicenseCount,
        plans: {
          test: stats.filter(u => u.license_plan === "test" && u.license_status === "ativa").length,
          "7days": stats.filter(u => u.license_plan === "7days" && u.license_status === "ativa").length,
          "15days": stats.filter(u => u.license_plan === "15days" && u.license_status === "ativa").length,
        }
      };
    } catch (error) {
      console.error("❌ Erro ao obter estatísticas:", error);
      return null;
    }
  }
}

export const licenseService = new LicenseService();