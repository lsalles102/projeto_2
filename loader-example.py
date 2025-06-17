#!/usr/bin/env python3
"""
Exemplo de como o loader FovDark deve verificar o status da licença
Este código mostra como integrar com a API do servidor para validação
"""

import requests
import time
import hashlib
import platform
import uuid
import json

class FovDarkLicenseChecker:
    def __init__(self, server_url="http://localhost:5000"):
        self.server_url = server_url
        self.hwid = self.generate_hwid()
        
    def generate_hwid(self):
        """Gera HWID único baseado no hardware do computador"""
        # Combinar informações do sistema para gerar HWID único
        system_info = f"{platform.node()}-{platform.processor()}-{platform.system()}"
        mac_address = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff) 
                               for elements in range(0,2*6,2)][::-1])
        combined = f"{system_info}-{mac_address}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16].upper()
    
    def check_license_status(self):
        """Verifica o status da licença no servidor"""
        try:
            response = requests.post(
                f"{self.server_url}/api/loader/license-status",
                json={"hwid": self.hwid},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data
            else:
                return {"valid": False, "message": f"Erro HTTP {response.status_code}"}
                
        except requests.exceptions.RequestException as e:
            return {"valid": False, "message": f"Erro de conexão: {str(e)}"}
    
    def send_heartbeat(self):
        """Envia heartbeat para o servidor (decrementa 1 minuto da licença)"""
        try:
            response = requests.post(
                f"{self.server_url}/api/loader/heartbeat",
                json={"hwid": self.hwid},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data
            else:
                return {"valid": False, "message": f"Erro HTTP {response.status_code}"}
                
        except requests.exceptions.RequestException as e:
            return {"valid": False, "message": f"Erro de conexão: {str(e)}"}
    
    def start_license_monitoring(self):
        """Inicia o monitoramento contínuo da licença"""
        print(f"[FOVDARK] Iniciando verificação de licença...")
        print(f"[FOVDARK] HWID: {self.hwid}")
        
        # Verificação inicial
        status = self.check_license_status()
        
        if not status.get("valid"):
            print(f"[ERRO] {status.get('message')}")
            return False
        
        print(f"[OK] Licença válida - Plano: {status.get('plan')}")
        print(f"[OK] Tempo restante: {status.get('timeRemaining', {}).get('days', 0)}d {status.get('timeRemaining', {}).get('hours', 0)}h {status.get('timeRemaining', {}).get('minutes', 0)}m")
        
        # Loop de heartbeat (a cada 60 segundos)
        while True:
            time.sleep(60)  # Aguarda 1 minuto
            
            heartbeat = self.send_heartbeat()
            
            if not heartbeat.get("valid"):
                print(f"[ERRO] Licença expirada ou inválida: {heartbeat.get('message')}")
                return False
            
            remaining = heartbeat.get("timeRemaining", {})
            print(f"[HEARTBEAT] Tempo restante: {remaining.get('days', 0)}d {remaining.get('hours', 0)}h {remaining.get('minutes', 0)}m")
            
            # Se chegou a 0 minutos, para o cheat
            if remaining.get("totalMinutes", 0) <= 0:
                print("[ERRO] Licença expirada!")
                return False

def main():
    """Função principal do loader"""
    print("=== FovDark Loader - Sistema de Licenças ===")
    
    # Inicializar verificador de licença
    license_checker = FovDarkLicenseChecker()
    
    # Verificar se a licença é válida antes de iniciar o cheat
    if license_checker.start_license_monitoring():
        print("[OK] Iniciando cheat...")
        # Aqui seria iniciado o cheat propriamente dito
    else:
        print("[ERRO] Não é possível iniciar - licença inválida")
        input("Pressione Enter para sair...")

if __name__ == "__main__":
    main()