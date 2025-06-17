# Correções Necessárias no Loader

## Problemas Identificados e Soluções

### 1. URL Incorreta
**Problema:** `API_URL = "https://www.fovdark.shop/"`
**Solução:** `API_URL = "https://fovdark.shop"`
- Remover o "www" da URL
- Remover a barra final

### 2. Endpoint de Login Incorreto
**Problema:** Usar `/api/login` com form data
**Solução:** Usar `/api/auth/login` com JSON
```python
# ANTES
r = requests.post(f"{API_URL}/api/login", data={"email": email, "password": senha})

# DEPOIS
r = requests.post(
    f"{API_URL}/api/auth/login", 
    json={"email": email, "password": senha},
    headers={"Content-Type": "application/json"}
)
```

### 3. Campo do Token Incorreto
**Problema:** Buscar `access_token`
**Solução:** Buscar `token`
```python
# ANTES
token = r.json()["access_token"]

# DEPOIS
response_data = r.json()
self.token = response_data["token"]
```

### 4. Endpoints da API Corretos
- **Login:** `/api/auth/login` (JSON)
- **Verificar Licença:** `/api/license/check` (GET com Authorization)
- **Salvar HWID:** `/api/hwid/save` (POST com JSON)

### 5. Headers de Autorização
```python
headers = {"Authorization": f"Bearer {token}"}
```

### 6. Tratamento de Erros Melhorado
- Verificar status code das respostas
- Extrair mensagens de erro do JSON
- Adicionar tratamento para ConnectionError e Timeout

## Arquivo Corrigido
O arquivo `loader_corrigido.py` contém todas as correções necessárias.

## Teste das Correções
1. As rotas da API foram ajustadas no servidor
2. Logs detalhados adicionados para debugging
3. Autenticação funcionando corretamente
4. Endpoints respondem conforme esperado pelo loader