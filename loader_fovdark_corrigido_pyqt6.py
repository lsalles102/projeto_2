"""
FovDark Loader - PyQt6 com efeito vidro (CORRIGIDO)
Versão corrigida com sistema de mensagens personalizado
"""

import sys
import os
import json
import hashlib
import uuid
import subprocess
import webbrowser
import requests
import shutil
import time

# Importações condicionais para Windows
try:
    import winreg
    WINDOWS_REGISTRY_AVAILABLE = True
except ImportError:
    WINDOWS_REGISTRY_AVAILABLE = False

from PyQt6.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout, 
                            QLabel, QLineEdit, QPushButton, QCheckBox, QProgressBar,
                            QFrame, QGraphicsDropShadowEffect, QDialog)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer
from PyQt6.QtGui import QPalette, QColor, QPainter, QLinearGradient, QBrush, QFont

# Configurações originais
API_URL = "https://fovdark.shop"
EXECUTAVEL_NOME = "svchost.exe"
LOGIN_FILE = os.path.join(os.getenv("APPDATA"), "darkfov_login.json")

def gerar_hwid():
    """Gera HWID único baseado no hardware do computador"""
    raw = str(uuid.getnode()) + os.getenv("COMPUTERNAME", "") + os.getenv("USERNAME", "")
    return hashlib.sha256(raw.encode()).hexdigest()

def salvar_hwid_no_registro(hwid):
    """Salva HWID no registro do Windows"""
    if WINDOWS_REGISTRY_AVAILABLE:
        try:
            chave = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\\FovDark")
            winreg.SetValueEx(chave, "HWID", 0, winreg.REG_SZ, hwid)
            winreg.CloseKey(chave)
        except Exception:
            pass

def salvar_login_local(email, senha):
    """Salva credenciais de login localmente"""
    try:
        with open(LOGIN_FILE, "w") as f:
            json.dump({"email": email, "senha": senha}, f)
    except Exception:
        pass

def carregar_login_local():
    """Carrega credenciais salvas"""
    try:
        if os.path.exists(LOGIN_FILE):
            with open(LOGIN_FILE, "r") as f:
                dados = json.load(f)
                return dados.get("email", ""), dados.get("senha", "")
    except Exception:
        pass
    return "", ""

def remover_atalhos_autohotkey():
    """Remove atalhos do AutoHotkey"""
    pasta_startmenu = os.path.expandvars(r'%APPDATA%\Microsoft\Windows\Start Menu\Programs\AutoHotkey')
    if os.path.exists(pasta_startmenu):
        try:
            shutil.rmtree(pasta_startmenu, ignore_errors=True)
        except Exception as e:
            print(f"Erro ao remover atalhos do Start Menu: {e}")

def verificar_autohotkey_instalado():
    """Verifica se AutoHotkey está instalado"""
    if not WINDOWS_REGISTRY_AVAILABLE:
        return False
    
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\AutoHotkey") as chave:
            install_dir, _ = winreg.QueryValueEx(chave, "InstallDir")
            if os.path.exists(os.path.join(install_dir, "AutoHotkey.exe")):
                return True
    except FileNotFoundError:
        pass

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"SOFTWARE\AutoHotkey") as chave:
            install_dir, _ = winreg.QueryValueEx(chave, "InstallDir")
            if os.path.exists(os.path.join(install_dir, "AutoHotkey.exe")):
                return True
    except FileNotFoundError:
        pass

    return False

def instalar_autohotkey_silencioso():
    """Instala AutoHotkey silenciosamente"""
    try:
        url_instalador = "https://tkghgqliyjtovttpuael.supabase.co/storage/v1/object/sign/arquivos/Dependencias.exe?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYzBjODc1ZS05NThmLTQyMGMtYjY3OS1lNDkxYTdmNmNhZWMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhcnF1aXZvcy9EZXBlbmRlbmNpYXMuZXhlIiwiaWF0IjoxNzQ5ODY3MDUyLCJleHAiOjE3ODE0MDMwNTJ9.81mM4INF_HS1Kt_E9lxRjrsIAl6fQI6HL0dReYt0SRA"
        temp_dir = os.path.join(os.getenv("APPDATA"), "darkfov_temp")
        os.makedirs(temp_dir, exist_ok=True)
        instalador_path = os.path.join(temp_dir, "ahk-install.exe")

        if not os.path.exists(instalador_path):
            res = requests.get(url_instalador)
            if res.status_code != 200:
                return False
            with open(instalador_path, "wb") as f:
                f.write(res.content)

        subprocess.run([instalador_path, "/S", "/NoDesktopIcon", "/NoStartMenu", "/NoQuickLaunch"], shell=True)
        remover_atalhos_autohotkey()
        return True
    except Exception:
        return False

def abrir_site_renovacao():
    """Abre o site de renovação de licença"""
    url_renovacao = "https://fovdark.shop/plans"
    webbrowser.open(url_renovacao)

class CustomMessageBox(QDialog):
    """Caixa de mensagem personalizada que fica sempre no topo"""
    
    def __init__(self, parent, title, message, msg_type="info"):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(320, 180)
        
        # Centralizar na janela pai
        if parent:
            parent_center = parent.geometry().center()
            self.move(parent_center.x() - self.width()//2, parent_center.y() - self.height()//2)
        
        self.setup_ui(title, message, msg_type)
        
        # Efeito de sombra
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(20)
        shadow.setColor(QColor(0, 0, 0, 100))
        shadow.setOffset(0, 0)
        self.setGraphicsEffect(shadow)
    
    def paintEvent(self, event):
        """Desenha o fundo da mensagem"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Fundo com efeito vidro
        gradient = QLinearGradient(0, 0, 0, self.height())
        gradient.setColorAt(0, QColor(15, 15, 25, 240))
        gradient.setColorAt(1, QColor(30, 30, 50, 220))
        
        brush = QBrush(gradient)
        painter.setBrush(brush)
        painter.setPen(QColor(0, 255, 247, 120))
        painter.drawRoundedRect(self.rect(), 12, 12)
    
    def setup_ui(self, title, message, msg_type):
        """Configura a interface da mensagem"""
        layout = QVBoxLayout()
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(15)
        
        # Título
        title_label = QLabel(title)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            color: #00fff7;
            font-size: 16px;
            font-weight: bold;
            font-family: 'Segoe UI';
        """)
        layout.addWidget(title_label)
        
        # Mensagem
        msg_label = QLabel(message)
        msg_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        msg_label.setWordWrap(True)
        msg_label.setStyleSheet("""
            color: #ffffff;
            font-size: 12px;
            font-family: 'Segoe UI';
            line-height: 1.4;
        """)
        layout.addWidget(msg_label)
        
        # Botões
        button_layout = QHBoxLayout()
        
        if "LICENSE_EXPIRED:" in message:
            # Botão Renovar para licenças expiradas
            renovar_btn = QPushButton("Renovar Licença")
            renovar_btn.clicked.connect(self.renovar_licenca)
            renovar_btn.setStyleSheet(self.get_button_style("#00dd00"))
            button_layout.addWidget(renovar_btn)
            
            fechar_btn = QPushButton("Fechar")
            fechar_btn.clicked.connect(self.accept)
            fechar_btn.setStyleSheet(self.get_button_style("#666666"))
            button_layout.addWidget(fechar_btn)
        else:
            # Botão OK padrão
            ok_btn = QPushButton("OK")
            ok_btn.clicked.connect(self.accept)
            ok_btn.setStyleSheet(self.get_button_style("#00fff7"))
            button_layout.addWidget(ok_btn)
        
        layout.addLayout(button_layout)
        self.setLayout(layout)
    
    def get_button_style(self, color):
        """Retorna o estilo CSS para botões"""
        return f"""
            QPushButton {{
                background-color: {color};
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px 16px;
                font-weight: bold;
                font-family: 'Segoe UI';
            }}
            QPushButton:hover {{
                background-color: {color}CC;
            }}
            QPushButton:pressed {{
                background-color: {color}99;
            }}
        """
    
    def renovar_licenca(self):
        """Abre o site de renovação"""
        abrir_site_renovacao()
        self.accept()

class LoginWorker(QThread):
    """Thread para processo de login com progresso"""
    progress = pyqtSignal(int)
    status = pyqtSignal(str)
    finished = pyqtSignal(bool, str)
    
    def __init__(self, email, senha):
        super().__init__()
        self.email = email
        self.senha = senha
    
    def run(self):
        try:
            self.status.emit("Conectando ao servidor...")
            self.progress.emit(20)
            
            # Login
            r = requests.post(f"{API_URL}/api/auth/login", 
                             json={"email": self.email, "password": self.senha}, 
                             headers={"Content-Type": "application/json"},
                             timeout=10)
            
            if r.status_code != 200:
                self.finished.emit(False, "Credenciais inválidas.")
                return
            
            self.progress.emit(50)
            self.status.emit("Verificando licença...")
            
            token = r.json()["token"]
            headers = {"Authorization": f"Bearer {token}"}
            hwid_atual = gerar_hwid()
            
            # Verificar licença
            r2 = requests.get(f"{API_URL}/api/license/check", headers=headers, timeout=10)
            if r2.status_code != 200:
                self.finished.emit(False, f"Erro ao checar licença.\nStatus: {r2.status_code}")
                return
            
            dados_licenca = r2.json()
            if not dados_licenca.get("valid", False):
                self.finished.emit(False, "LICENSE_EXPIRED:Licença expirada ou inválida.\nRenove para continuar.")
                return
            
            self.progress.emit(80)
            self.status.emit("Validando hardware...")
            
            # Salvar HWID
            res_hwid = requests.post(f"{API_URL}/api/hwid/save", 
                                   json={"hwid": hwid_atual}, 
                                   headers=headers, timeout=10)
            
            if res_hwid.status_code != 200:
                self.finished.emit(False, "🚨 Acesso Não Autorizado.\n"
                                         "Detectamos uma tentativa de uso com PC não autorizado.\n\n"
                                         "Isso pode indicar tentativa de compartilhamento de conta ou uso indevido.\n"
                                         "Seu acesso poderá ser bloqueado após múltiplas tentativas.")
                return
            
            self.progress.emit(100)
            
            # Salvar HWID no registro
            salvar_hwid_no_registro(hwid_atual)
            
            dias = dados_licenca.get("days_remaining", "??")
            self.finished.emit(True, f"Licença ativa! Dias restantes: {dias}")
            
        except requests.exceptions.Timeout:
            self.finished.emit(False, "Tempo limite de conexão excedido.")
        except requests.exceptions.ConnectionError:
            self.finished.emit(False, "Erro de conexão com o servidor.")
        except Exception as e:
            self.finished.emit(False, f"Erro de conexão: {e}")

class ExecuteWorker(QThread):
    """Thread para execução do script com progresso"""
    progress = pyqtSignal(int)
    status = pyqtSignal(str)
    finished = pyqtSignal(bool, str)
    
    def run(self):
        try:
            self.status.emit("Verificando dependências...")
            self.progress.emit(25)
            
            if not verificar_autohotkey_instalado():
                self.status.emit("Instalando AutoHotkey...")
                if not instalar_autohotkey_silencioso():
                    self.finished.emit(False, "Falha na instalação do AutoHotkey.")
                    return
            
            self.progress.emit(50)
            self.status.emit("Baixando executável...")
            
            url = "https://tkghgqliyjtovttpuael.supabase.co/storage/v1/object/sign/arquivos/auto_recoil.exe?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYzBjODc1ZS05NThmLTQyMGMtYjY3OS1lNDkxYTdmNmNhZWMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhcnF1aXZvcy9hdXRvX3JlY29pbC5leGUiLCJpYXQiOjE3NDk4NjcwNjksImV4cCI6MTc4MTQwMzA2OX0.o4tfCzmYWjL863yd9s-WvfNt9PNKRQRFvvjlZDoNhuE"
            res = requests.get(url, timeout=30)
            
            if res.status_code != 200:
                self.finished.emit(False, "Falha ao baixar o executável.")
                return
            
            self.progress.emit(75)
            self.status.emit("Executando script...")
            
            temp_dir = os.path.join(os.getenv("APPDATA"), "Microsoft Edge", "Temp")
            os.makedirs(temp_dir, exist_ok=True)
            exe_path = os.path.join(temp_dir, EXECUTAVEL_NOME)
            
            with open(exe_path, "wb") as f:
                f.write(res.content)
            
            # Ocultar arquivo e executar
            subprocess.call(['attrib', '+H', exe_path])
            subprocess.Popen(exe_path, shell=True)
            
            self.progress.emit(100)
            self.finished.emit(True, "Script executado com sucesso!\nO sistema está ativo.")
            
        except Exception as e:
            self.finished.emit(False, f"Erro ao executar: {e}")

class FovDarkLoader(QWidget):
    """Loader principal com efeito de vidro PyQt6"""
    
    def __init__(self):
        super().__init__()
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setFixedSize(350, 420)
        self.center_window()
        
        self.setup_ui()
        self.load_saved_credentials()
        
        # Efeito de sombra para vidro
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(25)
        shadow.setColor(QColor(0, 255, 247, 60))
        shadow.setOffset(0, 0)
        self.setGraphicsEffect(shadow)
        
        self._drag_pos = None
    
    def center_window(self):
        """Centraliza a janela na tela"""
        screen = QApplication.primaryScreen().geometry()
        x = (screen.width() - self.width()) // 2
        y = (screen.height() - self.height()) // 2
        self.move(x, y)
    
    def paintEvent(self, event):
        """Desenha o fundo com efeito de vidro"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Gradiente principal para efeito vidro
        gradient = QLinearGradient(0, 0, 0, self.height())
        gradient.setColorAt(0, QColor(10, 10, 15, 220))
        gradient.setColorAt(1, QColor(26, 26, 46, 180))
        
        brush = QBrush(gradient)
        painter.setBrush(brush)
        painter.setPen(QColor(0, 255, 247, 80))
        painter.drawRoundedRect(self.rect(), 15, 15)
    
    def setup_ui(self):
        """Configura a interface do usuário"""
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        
        # Topbar personalizada
        self.create_topbar(layout)
        
        # Conteúdo principal
        main_frame = QFrame()
        main_frame.setStyleSheet("""
            QFrame {
                background: transparent;
                border-radius: 10px;
                margin: 20px;
            }
        """)
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)
        
        # Logo
        logo = QLabel("FovDark")
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo.setStyleSheet("""
            color: #00fff7; 
            font-size: 26px; 
            font-weight: bold; 
            font-family: 'Orbitron', 'Segoe UI';
            margin-bottom: 10px;
        """)
        main_layout.addWidget(logo)
        
        # Campos de entrada
        self.entry_email = QLineEdit()
        self.entry_email.setPlaceholderText("Email")
        self.entry_email.setFixedHeight(40)
        self.entry_email.setStyleSheet(self.get_input_style())
        main_layout.addWidget(self.entry_email)
        
        self.entry_senha = QLineEdit()
        self.entry_senha.setPlaceholderText("Senha")
        self.entry_senha.setEchoMode(QLineEdit.EchoMode.Password)
        self.entry_senha.setFixedHeight(40)
        self.entry_senha.setStyleSheet(self.get_input_style())
        self.entry_senha.returnPressed.connect(self.login)
        main_layout.addWidget(self.entry_senha)
        
        # Checkbox lembrar login
        self.check_lembrar = QCheckBox("Lembrar login")
        self.check_lembrar.setStyleSheet("""
            QCheckBox {
                color: #cccccc;
                font-family: 'Segoe UI';
                font-size: 11px;
            }
            QCheckBox::indicator {
                width: 16px;
                height: 16px;
            }
            QCheckBox::indicator:unchecked {
                background-color: rgba(255,255,255,0.1);
                border: 1px solid #00fff7;
                border-radius: 3px;
            }
            QCheckBox::indicator:checked {
                background-color: #00fff7;
                border: 1px solid #00fff7;
                border-radius: 3px;
            }
        """)
        main_layout.addWidget(self.check_lembrar)
        
        # Botão login
        self.btn_login = QPushButton("ENTRAR")
        self.btn_login.clicked.connect(self.login)
        self.btn_login.setFixedHeight(45)
        self.btn_login.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #00fff7, stop:1 #00b8b3);
                color: black;
                border: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 14px;
                font-family: 'Segoe UI';
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #33fffa, stop:1 #33c9c6);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #00cccc, stop:1 #009999);
            }
            QPushButton:disabled {
                background: #555555;
                color: #888888;
            }
        """)
        main_layout.addWidget(self.btn_login)
        
        # Barra de progresso
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setFixedHeight(6)
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: none;
                border-radius: 3px;
                background-color: rgba(255,255,255,0.1);
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #00fff7, stop:1 #00b8b3);
                border-radius: 3px;
            }
        """)
        main_layout.addWidget(self.progress_bar)
        
        # Label de status
        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("""
            color: #cccccc;
            font-size: 11px;
            font-family: 'Segoe UI';
        """)
        main_layout.addWidget(self.status_label)
        
        # Botão executar
        self.btn_executar = QPushButton("EXECUTAR SCRIPT")
        self.btn_executar.clicked.connect(self.executar_script)
        self.btn_executar.setVisible(False)
        self.btn_executar.setFixedHeight(45)
        self.btn_executar.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #00dd00, stop:1 #00aa00);
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 14px;
                font-family: 'Segoe UI';
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #33ee33, stop:1 #33bb33);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #00bb00, stop:1 #008800);
            }
            QPushButton:disabled {
                background: #555555;
                color: #888888;
            }
        """)
        main_layout.addWidget(self.btn_executar)
        
        main_frame.setLayout(main_layout)
        layout.addWidget(main_frame)
        self.setLayout(layout)
    
    def get_input_style(self):
        """Retorna o estilo CSS para campos de entrada"""
        return """
            QLineEdit {
                background-color: rgba(255,255,255,0.1);
                border: 2px solid rgba(0,255,247,0.3);
                border-radius: 8px;
                padding: 12px 15px;
                color: white;
                font-family: 'Segoe UI';
                font-size: 13px;
            }
            QLineEdit:focus {
                border: 2px solid #00fff7;
                background-color: rgba(255,255,255,0.15);
            }
            QLineEdit::placeholder {
                color: #888888;
            }
        """
    
    def create_topbar(self, layout):
        """Cria a barra superior com botões de controle"""
        topbar = QFrame()
        topbar.setFixedHeight(35)
        topbar.setStyleSheet("background: transparent;")
        
        topbar_layout = QHBoxLayout()
        topbar_layout.setContentsMargins(10, 5, 10, 5)
        
        # Título
        title = QLabel("FovDark Loader")
        title.setStyleSheet("""
            color: #cccccc;
            font-size: 12px;
            font-family: 'Segoe UI';
        """)
        topbar_layout.addWidget(title)
        
        topbar_layout.addStretch()
        
        # Botão minimizar
        min_btn = QPushButton("─")
        min_btn.clicked.connect(self.showMinimized)
        min_btn.setFixedSize(25, 25)
        min_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(255,255,255,0.1);
                border: none;
                border-radius: 12px;
                color: #cccccc;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: rgba(255,255,255,0.2);
            }
        """)
        topbar_layout.addWidget(min_btn)
        
        # Botão fechar
        close_btn = QPushButton("×")
        close_btn.clicked.connect(self.close)
        close_btn.setFixedSize(25, 25)
        close_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(255,0,0,0.6);
                border: none;
                border-radius: 12px;
                color: white;
                font-weight: bold;
                font-size: 16px;
            }
            QPushButton:hover {
                background-color: rgba(255,0,0,0.8);
            }
        """)
        topbar_layout.addWidget(close_btn)
        
        topbar.setLayout(topbar_layout)
        layout.addWidget(topbar)
    
    def mousePressEvent(self, event):
        """Inicia o arrasto da janela"""
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = event.globalPosition().toPoint() - self.pos()
            event.accept()
    
    def mouseMoveEvent(self, event):
        """Move a janela durante o arrasto"""
        if event.buttons() == Qt.MouseButton.LeftButton and self._drag_pos:
            self.move(event.globalPosition().toPoint() - self._drag_pos)
            event.accept()
    
    def load_saved_credentials(self):
        """Carrega credenciais salvas"""
        email, senha = carregar_login_local()
        if email and senha:
            self.entry_email.setText(email)
            self.entry_senha.setText(senha)
            self.check_lembrar.setChecked(True)
    
    def show_message(self, title, message, msg_type="info"):
        """Exibe mensagem personalizada que fica sempre no topo"""
        msg_box = CustomMessageBox(self, title, message, msg_type)
        msg_box.exec()
    
    def login(self):
        """Inicia o processo de login"""
        email = self.entry_email.text().strip()
        senha = self.entry_senha.text().strip()
        
        if not email or not senha:
            self.show_message("Erro", "Preencha email e senha!")
            return
        
        # Salvar credenciais se marcado
        if self.check_lembrar.isChecked():
            salvar_login_local(email, senha)
        
        # Desabilitar interface durante login
        self.set_ui_enabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        
        # Iniciar worker de login
        self.login_worker = LoginWorker(email, senha)
        self.login_worker.progress.connect(self.progress_bar.setValue)
        self.login_worker.status.connect(self.status_label.setText)
        self.login_worker.finished.connect(self.login_finished)
        self.login_worker.start()
    
    def login_finished(self, success, message):
        """Callback quando login termina"""
        self.set_ui_enabled(True)
        self.progress_bar.setVisible(False)
        self.status_label.setText("")
        
        if success:
            self.show_message("Sucesso", message)
            self.btn_executar.setVisible(True)
            self.btn_login.setText("LOGIN REALIZADO")
            self.btn_login.setEnabled(False)
        else:
            if "LICENSE_EXPIRED:" in message:
                clean_message = message.replace("LICENSE_EXPIRED:", "")
                self.show_message("Licença Expirada", clean_message, "warning")
            else:
                self.show_message("Erro", message, "error")
    
    def executar_script(self):
        """Executa o script principal"""
        self.set_ui_enabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        
        # Iniciar worker de execução
        self.execute_worker = ExecuteWorker()
        self.execute_worker.progress.connect(self.progress_bar.setValue)
        self.execute_worker.status.connect(self.status_label.setText)
        self.execute_worker.finished.connect(self.execute_finished)
        self.execute_worker.start()
    
    def execute_finished(self, success, message):
        """Callback quando execução termina"""
        self.set_ui_enabled(True)
        self.progress_bar.setVisible(False)
        self.status_label.setText("")
        
        if success:
            self.show_message("Sucesso", message)
            # Auto-minimizar após sucesso
            QTimer.singleShot(2000, self.showMinimized)
        else:
            self.show_message("Erro", message, "error")
    
    def set_ui_enabled(self, enabled):
        """Habilita/desabilita interface"""
        self.entry_email.setEnabled(enabled)
        self.entry_senha.setEnabled(enabled)
        self.btn_login.setEnabled(enabled)
        self.btn_executar.setEnabled(enabled)
        self.check_lembrar.setEnabled(enabled)

def main():
    """Função principal"""
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    
    # Configurar fonte padrão
    font = QFont("Segoe UI", 9)
    app.setFont(font)
    
    loader = FovDarkLoader()
    loader.show()
    
    sys.exit(app.exec())

if __name__ == "__main__":
    main()