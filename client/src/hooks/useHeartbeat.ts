import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getHWID } from "@/lib/authUtils";

interface HeartbeatResponse {
  valid: boolean;
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
  };
  status: string;
}

export function useHeartbeat(license: any, onLicenseExpired?: () => void) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!license || license.status !== 'active') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      try {
        const response = await apiRequest("POST", "/api/licenses/heartbeat", {
          licenseKey: license.key,
          hwid: getHWID()
        });

        const data = await response.json() as HeartbeatResponse;
        
        if (!data.valid && onLicenseExpired) {
          onLicenseExpired();
        }
      } catch (error) {
        console.error("Heartbeat failed:", error);
        if (onLicenseExpired) {
          onLicenseExpired();
        }
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval to send heartbeat every minute
    intervalRef.current = setInterval(sendHeartbeat, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [license, onLicenseExpired]);

  return {
    isActive: !!intervalRef.current
  };
}