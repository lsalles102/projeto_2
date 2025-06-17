import { useState, useEffect, useRef } from 'react';

interface LicenseTimerData {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isActive: boolean;
}

export function useLicenseTimer(initialMinutes: number = 0, isActive: boolean = false): LicenseTimerData {
  const [totalSeconds, setTotalSeconds] = useState(initialMinutes * 60);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Atualiza o total de segundos quando initialMinutes muda
    setTotalSeconds(initialMinutes * 60);
  }, [initialMinutes]);

  useEffect(() => {
    if (isActive && totalSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setTotalSeconds(prev => {
          if (prev <= 1) {
            // Limpa o intervalo quando chega a zero
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Limpa o intervalo se não está ativo ou chegou a zero
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Cleanup no unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, totalSeconds]);

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