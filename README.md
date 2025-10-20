# 🌍 AliExpress Dropshipper Helper (Node/Express)

**🇬🇧 English + 🇧🇷 Português Bilingual Documentation**

---

## 🇬🇧 English

A simple **Node.js + Express** server for integration with the **AliExpress Dropshipper (IOP) API**.  
Handles OAuth authentication, automatically saves and refreshes tokens, and provides ready-to-use endpoints for categories, products, and shipping.

### 🖥️ Front-end
https://github.com/fabionevs/react-aliexpress-dropshipping-api

---

### 🚀 Installation

```bash
npm install
```

---

### ⚙️ Configuration (.env)

Create a `.env` file in the root directory:

```env
APP_PORT=3000
AE_APP_KEY=your_app_key
AE_APP_SECRET=your_app_secret
AE_REDIRECT_URI=https://your-domain.com/oauth/callback

# Optional (default: ./ae_token.json)
# AE_TOKEN_FILE=./ae_token.json
```

---

### ▶️ Run the Server

```bash
node index.js
```

Server available at:

```
http://localhost:3000
```

---

### 🌐 Endpoints

#### 🩺 Health Check
```http
GET /
```
Returns server info, token data, and time synchronization.

#### 🔐 OAuth
```http
GET /auth
```
Redirects to the AliExpress authorization page.

```http
GET /oauth/callback?code=...&state=...
```
Authorization callback. Exchanges the `code` for an `access_token` and saves it to `ae_token.json`.

```http
POST /auth/refresh
```
Forces manual token refresh using `refresh_token`.

#### 📦 Dropshipper (requires valid token)
```http
GET /ds/categories?parent_id=0&lang=EN
```
Returns a list of categories (`parent_id=0` by default).

```http
GET /ds/products/recommended?country=BR&currency=BRL&lang=PT&page=1&size=20
```
Fetches recommended products (`aliexpress.ds.recommend.feed.get`).

```http
GET /ds/products/:id?country=BR&currency=BRL&lang=PT
```
Returns product details (`productDetails`).

```http
GET /ds/frete/:id/:sku?qnt=1&country=BR&currency=BRL&lang=PT
```
Checks shipping options (`aliexpress.ds.freight.query`).

---

### 💻 Usage Examples

```bash
# Start OAuth
open "http://localhost:3000/auth"

# Check status
curl http://localhost:3000/

# Refresh token manually
curl -X POST http://localhost:3000/auth/refresh

# List categories
curl "http://localhost:3000/ds/categories?parent_id=0&lang=EN"

# Recommended products
curl "http://localhost:3000/ds/products/recommended?country=BR&currency=BRL&lang=PT&page=1&size=20"

# Product details
curl "http://localhost:3000/ds/products/1005001234567890?country=BR&currency=BRL&lang=PT"

# Shipping options
curl "http://localhost:3000/ds/frete/1005001234567890/2000000000000001?qnt=1&country=BR&currency=BRL&lang=PT"
```

---

### 🧠 Notes

- All `/ds/*` endpoints require a valid token.
- The server automatically refreshes tokens if `refresh_token` exists.
- Syncs time with AliExpress server to prevent `IllegalTimestamp` errors.
- Default token file: `./ae_token.json`.

---

### ⚠️ Security

- Do **not** version `.env` or `ae_token.json`.
- Adjust CORS settings to allow only trusted domains.
- Secure the server if exposed publicly.

---

### 📄 License & Credits

MIT — free to use and modify.

https://github.com/moh3a/ae_sdk

---

---

## 🇧🇷 Português

Servidor simples em **Node.js + Express** para integração com a **API Dropshipper (IOP)** do AliExpress.  
Realiza autenticação OAuth, salva e renova tokens automaticamente e fornece endpoints prontos para categorias, produtos e frete.

### 🖥️ Front-end
https://github.com/fabionevs/react-aliexpress-dropshipping-api

---

### 🚀 Instalação

```bash
npm install
```

---

### ⚙️ Configuração (.env)

Crie um arquivo `.env` na raiz do projeto:

```env
APP_PORT=3000
AE_APP_KEY=seu_app_key
AE_APP_SECRET=seu_app_secret
AE_REDIRECT_URI=https://seu-dominio.com/oauth/callback

# Opcional (padrão: ./ae_token.json)
# AE_TOKEN_FILE=./ae_token.json
```

---

### ▶️ Executar o servidor

```bash
node index.js
```

A aplicação estará disponível em:

```
http://localhost:3000
```

---

### 🌐 Endpoints

#### 🩺 Health Check
```http
GET /
```
Retorna informações do servidor, token e sincronização de tempo.

#### 🔐 OAuth
```http
GET /auth
```
Redireciona para a tela de autorização da AliExpress.

```http
GET /oauth/callback?code=...&state=...
```
Callback da autorização. Troca o `code` por um `access_token` e salva no arquivo `ae_token.json`.

```http
POST /auth/refresh
```
Força a renovação manual do token utilizando o `refresh_token`.

#### 📦 Dropshipper (requer token válido)
```http
GET /ds/categories?parent_id=0&lang=EN
```
Retorna lista de categorias (por padrão `parent_id=0`).

```http
GET /ds/products/recommended?country=BR&currency=BRL&lang=PT&page=1&size=20
```
Retorna lista de produtos recomendados (`aliexpress.ds.recommend.feed.get`).

```http
GET /ds/products/:id?country=BR&currency=BRL&lang=PT
```
Retorna detalhes de um produto (`productDetails`).

```http
GET /ds/frete/:id/:sku?qnt=1&country=BR&currency=BRL&lang=PT
```
Consulta opções de frete (`aliexpress.ds.freight.query`).

---

### 💻 Exemplos de uso

```bash
# Iniciar OAuth
open "http://localhost:3000/auth"

# Verificar status
curl http://localhost:3000/

# Renovar token manualmente
curl -X POST http://localhost:3000/auth/refresh

# Listar categorias
curl "http://localhost:3000/ds/categories?parent_id=0&lang=EN"

# Produtos recomendados
curl "http://localhost:3000/ds/products/recommended?country=BR&currency=BRL&lang=PT&page=1&size=20"

# Detalhes de produto
curl "http://localhost:3000/ds/products/1005001234567890?country=BR&currency=BRL&lang=PT"

# Consultar frete
curl "http://localhost:3000/ds/frete/1005001234567890/2000000000000001?qnt=1&country=BR&currency=BRL&lang=PT"
```

---

### 🧠 Observações

- Todos os endpoints `/ds/*` exigem token válido.
- O servidor renova tokens automaticamente se o `refresh_token` existir.
- Sincroniza o horário com o servidor da AliExpress para evitar `IllegalTimestamp`.
- Arquivo de token padrão: `./ae_token.json`.

---

### ⚠️ Segurança

- **Não** versione `.env` ou `ae_token.json`.
- Ajuste o CORS no código para permitir apenas domínios confiáveis.
- Proteja o servidor se for usado publicamente.

---

### 📄 Licença e Créditos

MIT — uso livre, modifique conforme necessário.

https://github.com/moh3a/ae_sdk
