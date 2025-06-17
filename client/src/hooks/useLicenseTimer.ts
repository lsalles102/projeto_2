import { useState, useEffect, useRef } from 'react';

interface LicenseTimerData {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isActive: boolean;
}

export function useLicenseTimer(initialMinutes: number = 0, isActive: boolean = false, hwid?: string): LicenseTimerData {
  const [totalSeconds, setTotalSeconds] = useState(initialMinutes * 60);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatRef = useRef<number>(0);

  useEffect(() => {
    // Atualiza o total de segundos quando initialMinutes muda
    setTotalSeconds(initialMinutes * 60);
  }, [initialMinutes]);

  // Função para enviar heartbeat ao servidor
  const sendHeartbeat = async () => {
    if (!hwid || !isActive) return;
    
    try {
      const response = await fetch('/api/license/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ hwid }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.remainingMinutes !== undefined) {
          // Sincroniza com o servidor se houver diferença significativa (mais de 2 minutos)
          const serverSeconds = data.remainingMinutes * 60;
          const currentSeconds = totalSeconds;
          if (Math.abs(serverSeconds - currentSeconds) > 120) {
            setTotalSeconds(serverSeconds);
          }
        }
      } else if (response.status === 401 || response.status === 403) {
        // Usuário não autenticado ou sem permissão - parar heartbeat
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      }
    } catch (error) {
      // Silenciar erros de rede para evitar spam no console
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return; // Erro de conectividade - ignora
      }
      console.error('Erro ao enviar heartbeat:', error);
    }
  };

  useEffect(() => {
    if (isActive && totalSeconds > 0) {
      // Timer para atualizar a interface a cada segundo
      intervalRef.current = setInterval(() => {
        setTotalSeconds(prev => {
          if (prev <= 1) {
            // Limpa os intervalos quando chega a zero
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            if (heartbeatRef.current) {
              clearInterval(heartbeatRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Heartbeat para sincronizar com o servidor a cada minuto
      heartbeatRef.current = setInterval(() => {
        sendHeartbeat();
      }, 60000); // 60 segundos

      // Enviar heartbeat inicial
      sendHeartbeat();
    } else {
      // Limpa os intervalos se não está ativo ou chegou a zero
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }

    // Cleanup no unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [isActive, totalSeconds, hwid]);

  // Calcula dias, horas, minutos e segundos
  const days = Math.floor(totalSeconds / 86400); // 86400 segundos em um dia
  const hours = Math.floor((totalSeconds % 86400) / 3600); // 3600 segundos em uma hora
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    totalSeconds,
    isActive: isActive && totalSeconds > 0
  };
}