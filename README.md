# AliExpress Dropshipper Helper (Node/Express)

Servidor simples em **Node.js + Express** para integração com a **API Dropshipper (IOP)** do AliExpress.  
Realiza autenticação OAuth, salva e renova tokens automaticamente e fornece endpoints prontos para categorias, produtos e frete.

## 🚀 Front-end


https://github.com/fabionevs/react-aliexpress-dropshipping-api

---

## 🚀 Instalação

```bash
npm install
```

---

## ⚙️ Configuração (.env)

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

## ▶️ Executar o servidor

```bash
node index.js
```

A aplicação iniciará em:

```
http://localhost:3000
```

---

## 🌐 Endpoints

### 🩺 Health Check
```http
GET /
```
Retorna informações do servidor, token e sincronização de tempo.

---

### 🔐 OAuth
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

---

### 📦 Dropshipper (requer token válido)
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

## 💻 Exemplos de uso

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

## 🧠 Observações

- Todos os endpoints `/ds/*` exigem token válido.
- O servidor renova tokens automaticamente se o `refresh_token` existir.
- Sincroniza o horário com o servidor da AliExpress para evitar `IllegalTimestamp`.
- Arquivo de token padrão: `./ae_token.json`.

---

## ⚠️ Segurança

- **Não** versione `.env` ou `ae_token.json`.
- Ajuste o CORS no código para permitir apenas domínios confiáveis.
- Proteja o servidor se for usado publicamente.

---

## 📄 Licença

MIT — uso livre, modifique conforme necessário.
