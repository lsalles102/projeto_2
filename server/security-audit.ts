/**
 * Sistema de auditoria e segurança para prevenir fraudes
 * Monitora tentativas de acesso não autorizado e atividades suspeitas
 */

export interface SecurityEvent {
  timestamp: Date;
  userId?: string | number;
  userEmail?: string;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: any;
  ipAddress?: string;
  userAgent?: string;
}

class SecurityAudit {
  private events: SecurityEvent[] = [];

  /**
   * Registra evento de segurança
   */
  logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>) {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date()
    };

    this.events.push(securityEvent);
    
    // Log no console baseado na severidade
    const logLevel = event.severity === 'CRITICAL' ? 'error' : 
                    event.severity === 'HIGH' ? 'warn' : 'log';
    
    console[logLevel](`[SECURITY ${event.severity}] ${event.eventType}:`, event.details);
    
    // Para eventos críticos, fazer log detalhado
    if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
      console.error(`=== ALERTA DE SEGURANÇA ===`);
      console.error(`Tipo: ${event.eventType}`);
      console.error(`Usuário: ${event.userId || 'N/A'} (${event.userEmail || 'N/A'})`);
      console.error(`IP: ${event.ipAddress || 'N/A'}`);
      console.error(`Timestamp: ${securityEvent.timestamp.toISOString()}`);
      console.error(`Detalhes:`, event.details);
      console.error(`========================`);
    }
  }

  /**
   * Valida se o usuário tem permissão para receber uma licença
   */
  validateLicenseOwnership(paymentUserId: number, requestingUserId: number): {
    valid: boolean;
    reason?: string;
  } {
    if (paymentUserId !== requestingUserId) {
      this.logSecurityEvent({
        userId: requestingUserId,
        eventType: 'UNAUTHORIZED_LICENSE_ACCESS',
        severity: 'CRITICAL',
        details: {
          paymentUserId,
          requestingUserId,
          message: 'Tentativa de acesso a licença de outro usuário'
        }
      });

      return {
        valid: false,
        reason: 'Usuário não autorizado a receber esta licença'
      };
    }

    return { valid: true };
  }

  /**
   * Registra tentativa de pagamento
   */
  logPaymentAttempt(userId: string | number, userEmail: string, plan: string, amount: number, ipAddress?: string) {
    this.logSecurityEvent({
      userId,
      userEmail,
      eventType: 'PAYMENT_ATTEMPT',
      severity: 'LOW',
      details: {
        plan,
        amount,
        timestamp: new Date().toISOString()
      },
      ipAddress
    });
  }

  /**
   * Registra pagamento aprovado
   */
  logPaymentApproved(userId: string | number, userEmail: string, paymentId: string, licenseKey: string) {
    this.logSecurityEvent({
      userId,
      userEmail,
      eventType: 'PAYMENT_APPROVED',
      severity: 'LOW',
      details: {
        paymentId,
        licenseKey,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Registra webhook processado
   */
  logWebhookProcessed(paymentId: string, userId: string | number, success: boolean, details?: any) {
    this.logSecurityEvent({
      userId,
      eventType: 'WEBHOOK_PROCESSED',
      severity: success ? 'LOW' : 'HIGH',
      details: {
        paymentId,
        success,
        details,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Registra tentativa de ativação de licença
   */
  logLicenseActivation(userId: string | number, userEmail: string, licenseKey: string, success: boolean, reason?: string) {
    this.logSecurityEvent({
      userId,
      userEmail,
      eventType: 'LICENSE_ACTIVATION',
      severity: success ? 'LOW' : 'MEDIUM',
      details: {
        licenseKey,
        success,
        reason,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Obtém eventos de segurança dos últimos dias
   */
  getRecentEvents(days: number = 7): SecurityEvent[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return this.events.filter(event => event.timestamp >= cutoff);
  }

  /**
   * Obtém estatísticas de segurança
   */
  getSecurityStats() {
    const recentEvents = this.getRecentEvents();
    
    return {
      totalEvents: recentEvents.length,
      criticalEvents: recentEvents.filter(e => e.severity === 'CRITICAL').length,
      highEvents: recentEvents.filter(e => e.severity === 'HIGH').length,
      mediumEvents: recentEvents.filter(e => e.severity === 'MEDIUM').length,
      lowEvents: recentEvents.filter(e => e.severity === 'LOW').length,
      eventTypes: this.groupByEventType(recentEvents)
    };
  }

  private groupByEventType(events: SecurityEvent[]): Record<string, number> {
    return events.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

// Instância singleton
export const securityAudit = new SecurityAudit();