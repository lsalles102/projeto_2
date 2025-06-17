/**
 * Sistema de monitoramento automático de licenças
 * Decrementa tempo das licenças ativas a cada minuto
 * Funciona independente do frontend
 */

import { eq, and, gt } from 'drizzle-orm';
import { db } from './db';
import { users } from '../shared/schema';

export class LicenseMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    console.log('🔧 Sistema de monitoramento de licenças inicializado');
  }

  /**
   * Inicia o monitoramento automático (executa a cada minuto)
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Monitoramento já está rodando');
      return;
    }

    console.log('🚀 Iniciando monitoramento automático de licenças...');
    this.isRunning = true;

    // Executa imediatamente e depois a cada minuto
    this.processActiveLicenses();
    
    this.intervalId = setInterval(() => {
      this.processActiveLicenses();
    }, 60000); // 60 segundos
  }

  /**
   * Para o monitoramento automático
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ Monitoramento de licenças parado');
  }

  /**
   * Processa todas as licenças ativas e decrementa o tempo
   */
  private async processActiveLicenses() {
    try {
      const now = new Date();
      
      // Buscar todos os usuários com licenças ativas
      const activeLicenses = await db.select()
        .from(users)
        .where(
          and(
            eq(users.license_status, 'ativa'),
            gt(users.license_remaining_minutes, 0)
          )
        );

      if (activeLicenses.length === 0) {
        console.log('💤 Nenhuma licença ativa para processar');
        return;
      }

      console.log(`⏱️ Processando ${activeLicenses.length} licenças ativas...`);

      for (const user of activeLicenses) {
        await this.decrementUserLicense(user.id, now);
      }

      console.log(`✅ Processamento concluído: ${activeLicenses.length} licenças atualizadas`);
    } catch (error) {
      console.error('❌ Erro ao processar licenças ativas:', error);
    }
  }

  /**
   * Decrementa 1 minuto da licença do usuário
   */
  private async decrementUserLicense(userId: string, now: Date) {
    try {
      // Buscar dados atuais do usuário
      const [currentUser] = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!currentUser) return;

      // Verificar se a licença já expirou por data
      if (currentUser.license_expires_at && now > currentUser.license_expires_at) {
        await this.expireUserLicense(userId, 'data_expirada');
        return;
      }

      // Decrementar 1 minuto
      const newRemainingMinutes = Math.max(0, (currentUser.license_remaining_minutes || 0) - 1);

      // Atualizar no banco de dados
      await db.update(users)
        .set({
          license_remaining_minutes: newRemainingMinutes,
          license_last_heartbeat: now,
          updated_at: now
        })
        .where(eq(users.id, userId));

      // Se chegou a 0, expirar a licença
      if (newRemainingMinutes === 0) {
        await this.expireUserLicense(userId, 'tempo_esgotado');
      } else {
        console.log(`⏳ Usuário ${userId}: ${newRemainingMinutes} minutos restantes`);
      }
    } catch (error) {
      console.error(`❌ Erro ao decrementar licença do usuário ${userId}:`, error);
    }
  }

  /**
   * Expira a licença do usuário
   */
  private async expireUserLicense(userId: string, reason: string) {
    try {
      await db.update(users)
        .set({
          license_status: 'expirada',
          license_remaining_minutes: 0,
          updated_at: new Date()
        })
        .where(eq(users.id, userId));

      console.log(`🔴 Licença expirada para usuário ${userId}: ${reason}`);
    } catch (error) {
      console.error(`❌ Erro ao expirar licença do usuário ${userId}:`, error);
    }
  }

  /**
   * Retorna estatísticas do monitoramento
   */
  async getStats() {
    try {
      const now = new Date();
      
      const [totalActive, totalExpired, totalUsers] = await Promise.all([
        db.select({ count: users.id })
          .from(users)
          .where(
            and(
              eq(users.license_status, 'ativa'),
              gt(users.license_remaining_minutes, 0)
            )
          ),
        db.select({ count: users.id })
          .from(users)
          .where(eq(users.license_status, 'expirada')),
        db.select({ count: users.id }).from(users)
      ]);

      return {
        isRunning: this.isRunning,
        activeLicenses: totalActive.length,
        expiredLicenses: totalExpired.length,
        totalUsers: totalUsers.length,
        nextCheck: this.isRunning ? 'Próximo em 1 minuto' : 'Parado'
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return {
        isRunning: this.isRunning,
        activeLicenses: 0,
        expiredLicenses: 0,
        totalUsers: 0,
        nextCheck: 'Erro'
      };
    }
  }
}

// Instância global do monitor
export const licenseMonitor = new LicenseMonitor();