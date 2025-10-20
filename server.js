// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { DateTime } = require('luxon');
const { DropshipperClient } = require('ae_sdk');
const cors = require('cors');

/* =================== ENV =================== */
const {
  APP_PORT = 3000,
  AE_APP_KEY,
  AE_APP_SECRET,
  AE_REDIRECT_URI,
  AE_TOKEN_FILE,
} = process.env;

if (!AE_APP_KEY || !AE_APP_SECRET || !AE_REDIRECT_URI) {
  console.error('[CONFIG] Defina AE_APP_KEY, AE_APP_SECRET e AE_REDIRECT_URI no .env');
  process.exit(1);
}

/* =================== CONSTANTES =================== */
const AE_API_ORIGIN = 'https://api-sg.aliexpress.com';
const OAUTH_AUTHORIZE = `${AE_API_ORIGIN}/oauth/authorize`;
const SYS_BASE = `${AE_API_ORIGIN}/rest`;
const TOKEN_CREATE_PATH = '/auth/token/create';
const TOKEN_REFRESH_PATH = '/auth/token/refresh';

// Router DS sempre em /rest (NÃO concatenar método no path)
const ROUTER_PATH = '/rest';

const TOKEN_PATH = AE_TOKEN_FILE
  ? path.resolve(AE_TOKEN_FILE)
  : path.resolve(__dirname, 'ae_token.json');

/* =================== APP =================== */
const app = express();
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // ou coloque o domínio específico
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

/* =================== TOKEN STORE =================== */
const store = { access_token: null, refresh_token: null, expire_time: 0 };


async function loadTokenFromDisk() {
  try {
    const raw = await fsp.readFile(TOKEN_PATH, 'utf8');
    const data = JSON.parse(raw);
    store.access_token = data.access_token || null;
    store.refresh_token = data.refresh_token || null;
    store.expire_time = Number(data.expire_time || 0);
    console.log(`[TOKEN] Carregado de ${TOKEN_PATH} (expira: ${store.expire_time || 'n/a'})`);
  } catch { }
}

async function saveTokenToDisk() {
  const data = {
    access_token: store.access_token,
    refresh_token: store.refresh_token,
    expire_time: store.expire_time,
    saved_at: Date.now(),
  };
  await fsp.writeFile(TOKEN_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[TOKEN] Salvo em ${TOKEN_PATH}`);
}

function setTokenFromResponse(resp) {
  const access_token = resp?.access_token;
  const refresh_token = resp?.refresh_token;
  let expire_time = Number(resp?.expire_time || 0);
  if (!expire_time && resp?.expires_in) {
    expire_time = Math.floor(Date.now() / 1000) + Number(resp.expires_in);
  }
  if (!access_token) throw new Error('Resposta sem access_token');

  store.access_token = access_token;
  store.refresh_token = refresh_token || store.refresh_token;
  store.expire_time = expire_time || store.expire_time;
  return saveTokenToDisk();
}

function tokenValid() {
  if (!store.access_token) return false;
  if (!store.expire_time) return true;
  const now = Math.floor(Date.now() / 1000);
  return (store.expire_time - now) > 120;
}

/* =================== TIME SYNC =================== */
const Time = {
  offsetMs: 0,
  lastSync: 0,
  async sync() {
    try {
      const resp = await axios.head(SYS_BASE, {
        timeout: 5000, validateStatus: () => true,
        httpAgent: new http.Agent({ keepAlive: true }),
        httpsAgent: new https.Agent({ keepAlive: true }),
      });
      const dateHeader = resp.headers?.date || resp.headers?.Date;
      if (dateHeader) {
        const serverMs = Date.parse(dateHeader);
        const localMs = Date.now();
        this.offsetMs = serverMs - localMs;
        this.lastSync = localMs;
        console.log(`[TIME] Sync OK. Skew: ${Math.round(this.offsetMs / 1000)}s`);
      } else {
        console.warn('[TIME] Cabeçalho Date ausente; usando relógio local');
      }
    } catch (e) {
      console.warn('[TIME] Falha no sync; usando relógio local:', e.message);
    }
  },
  nowMs() { return Date.now() + this.offsetMs; },
  beijingTimestamp() {
    return DateTime.fromMillis(this.nowMs()).setZone('Asia/Shanghai').toFormat('yyyy-LL-dd HH:mm:ss');
  },
  skewSeconds() { return Math.round(this.offsetMs / 1000); }
};

/* =================== HELPERS =================== */
function makeState(len = 16) {
  return crypto.randomBytes(16).toString('hex').slice(0, len);
}

/* ===== Assinatura estilo IOP (igual ao SDK PHP) ===== */
// DS: NÃO prefixa path; System (/auth/...) prefixa.
function signIOP(apiName, params, secret) {
  const kv = { ...params };
  Object.keys(kv).forEach(k => (kv[k] == null) && delete kv[k]);
  const keys = Object.keys(kv).filter(k => k !== 'sign').sort();

  let toSign = '';
  if (apiName.includes('/')) toSign += apiName; // só System
  for (const k of keys) toSign += k + String(kv[k]);

  return crypto.createHmac('sha256', secret).update(toSign, 'utf8').digest('hex').toUpperCase();
}

/* ===== System API (rest + path) ===== */
function signSystem(apiPath, params, secret) {
  const keys = Object.keys(params).filter(k => k !== 'sign' && params[k] !== undefined).sort();
  const concat = keys.map(k => k + String(params[k])).join('');
  const toSign = apiPath + concat;
  const sign = crypto.createHmac('sha256', secret).update(toSign, 'utf8').digest('hex').toUpperCase();
  return { sign, toSign };
}

async function systemCall(apiPath, extra = {}, httpMethod = 'POST') {
  const url = `${SYS_BASE}${apiPath}`;
  const base = {
    app_key: AE_APP_KEY, sign_method: 'sha256',
    timestamp: String(Time.nowMs()), ...extra,
  };
  base.sign = signSystem(apiPath, base, AE_APP_SECRET).sign;

  const cfg = {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    timeout: 20000,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
    validateStatus: () => true,
  };
  const body = qs.stringify(base);
  const resp = (httpMethod === 'GET')
    ? await axios.get(`${url}?${qs.stringify(base)}`, cfg)
    : await axios.post(url, body, cfg);

  const data = resp.data;
  const illegal = d =>
    d?.code === 'IllegalTimestamp' || d?.error_response?.code === 'IllegalTimestamp' ||
    (typeof d === 'string' && /IllegalTimestamp/i.test(d));

  if (illegal(data)) {
    await Time.sync();
    base.timestamp = String(Time.nowMs());
    base.sign = signSystem(apiPath, base, AE_APP_SECRET).sign;
    return (httpMethod === 'GET')
      ? (await axios.get(`${url}?${qs.stringify(base)}`, cfg)).data
      : (await axios.post(url, qs.stringify(base), cfg)).data;
  }
  return data;
}

async function createAccessToken(code) { return systemCall(TOKEN_CREATE_PATH, { code }, 'POST'); }
async function refreshAccessToken(refresh) { return systemCall(TOKEN_REFRESH_PATH, { refresh_token: refresh }, 'POST'); }

/* ===== Axios cliente dedicado (evita poluição de URL) ===== */
const dsClient = axios.create({
  baseURL: AE_API_ORIGIN, // SEM método no path
  timeout: 30000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  validateStatus: () => true,
});

/* ========== DS Router call (GET com tudo na query) ========== */
let __lastSignDebug = null;

async function topCall(method, accessToken, apiParams = {}) {
  if (!accessToken) throw new Error('Sem access_token. Faça /auth');

  // Sys params idênticos ao PHP (sem v)
  const sys = {
    app_key: AE_APP_KEY,
    sign_method: 'sha256',
    timestamp: String(Time.nowMs()), // 13 dígitos (ms)
    method: method,
    partner_id: 'iop-sdk-node-20250902',
    simplify: 'true',
    format: 'json',
    access_token: accessToken,
  };

  // Assina sobre {api+sys} (ordenado), sem path
  const allParams = { ...apiParams, ...sys };
  const sign = signIOP(method, allParams, AE_APP_SECRET);
  const query = { ...allParams, sign };

  // Guarda debug (token ofuscado)
  const debugQS = new URLSearchParams(query);
  console.log('debug', debugQS)
  if (debugQS.has('access_token')) debugQS.set('access_token', '***');
  __lastSignDebug = {
    method,
    path: ROUTER_PATH,
    final_url_preview: `${ROUTER_PATH}?${debugQS.toString()}`,
    keys_sorted_for_sign: Object.keys(allParams).filter(k => k !== 'sign').sort(),
    timestamp_ms: sys.timestamp,
  };

  // Importante: GET em /rest com TODA a query (sys+api+sign), exatamente como o SDK PHP (curl_get)
  const resp = await dsClient.get(ROUTER_PATH, { params: query, paramsSerializer: p => qs.stringify(p) });
  console.log('resp', resp)
  // Log NÃO sensível
  console.log(
    '[DS OUT] GET',
    ROUTER_PATH,
    'qs:',
    `?${debugQS.toString()}`
  );

  const data = resp.data;

  // Retry em IllegalTimestamp
  const illegalTs =
    data?.code === 'IllegalTimestamp' ||
    data?.error_response?.code === 'IllegalTimestamp' ||
    (typeof data === 'string' && /IllegalTimestamp/i.test(data));

  if (illegalTs) {
    await Time.sync();
    sys.timestamp = String(Time.nowMs());
    const query2 = { ...apiParams, ...sys, sign: signIOP(method, { ...apiParams, ...sys }, AE_APP_SECRET) };
    const debugQS2 = new URLSearchParams(query2);
    if (debugQS2.has('access_token')) debugQS2.set('access_token', '***');
    __lastSignDebug.retry = {
      final_url_preview: `${ROUTER_PATH}?${debugQS2.toString()}`,
      timestamp_ms: sys.timestamp,
    };
    const resp2 = await dsClient.get(ROUTER_PATH, { params: query2, paramsSerializer: p => qs.stringify(p) });
    return (typeof resp2.data === 'string') ? { _raw_text: resp2.data, _status: resp2.status } : resp2.data;
  }

  return (typeof data === 'string') ? { _raw_text: data, _status: resp.status } : data;
}

/* =================== TOKEN FLOW =================== */
async function ensureTokenOr401(res) {
  await loadTokenFromDisk();
  if (tokenValid()) return true;
  if (!store.refresh_token) {
    res.status(401).json({ ok: false, error: 'Sem token válido. Abra /auth para autorizar.' });
    return false;
  }
  try {
    const data = await refreshAccessToken(store.refresh_token);
    if (!data?.access_token) throw new Error('refresh sem access_token');
    await setTokenFromResponse(data);
    return true;
  } catch {
    res.status(401).json({ ok: false, error: 'Falha ao renovar token. Refaça /auth.' });
    return false;
  }
}

/* =================== ROTAS =================== */
// OAuth start
app.get('/auth', (req, res) => {
  const state = makeState(16);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: AE_APP_KEY,
    redirect_uri: AE_REDIRECT_URI,
    state,
  }).toString();
  res.redirect(`${OAUTH_AUTHORIZE}?${params}`);
});

// OAuth callback
const usedCodes = new Set();
app.get('/oauth/callback', async (req, res) => {
  try {
    const url = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) return res.status(400).send('Faltou ?code=');
    if (!/^[a-z0-9]+$/i.test(state || '')) return res.status(400).send('State inválido.');
    if (usedCodes.has(code)) return res.status(400).send('Code já usado. Gere outro em /auth');
    usedCodes.add(code);

    const data = await createAccessToken(code);
    if (!data?.access_token) return res.status(400).send({ ok: false, data });

    await setTokenFromResponse(data);

    res.send({
      ok: true,
      access_token_preview: store.access_token.slice(0, 8) + '…',
      expire_time: store.expire_time,
      token_file: TOKEN_PATH,
    });
  } catch (err) {
    res.status(500).send({ ok: false, error: err?.response?.data || err.message || 'oauth_error' });
  }
});

// Refresh
app.post('/auth/refresh', async (req, res) => {
  try {
    await loadTokenFromDisk();
    if (!store.refresh_token) return res.status(400).send('Sem refresh_token salvo.');
    const data = await refreshAccessToken(store.refresh_token);
    if (!data?.access_token) return res.status(502).send({ ok: false, data });

    await setTokenFromResponse(data);

    res.send({
      ok: true,
      access_token_preview: store.access_token.slice(0, 8) + '…',
      expire_time: store.expire_time,
      token_file: TOKEN_PATH,
    });
  } catch (err) {
    res.status(500).send({ ok: false, error: err?.response?.data || err.message || 'refresh_error' });
  }
});

/* ======= DS: CATEGORIAS / PRODUTOS ======= */
app.get('/ds/categories', async (req, res) => {
  if (!(await ensureTokenOr401(res))) return;

  const parent_id = req.query.parent_id != null ? String(req.query.parent_id) : '0';
  const target_language = (req.query.lang || 'EN').toUpperCase();

  const data = await topCall('aliexpress.ds.category.get', store.access_token, {
    parent_category_id: parent_id,
    target_language,
  });

  if (data?.error_response) return res.status(502).json({ ok: false, error: data.error_response });
  const result = data?.aliexpress_ds_category_get_response?.result;
  if (!result) return res.status(502).json({ ok: false, msg: 'Sem result', raw: data });

  const items = (result.categories || []).map(c => ({
    category_id: c.category_id, name: c.category_name,
    parent_id: c.parent_id, level: c.level, leaf: c.is_leaf,
  }));
  res.json({ ok: true, count: items.length, items });
});

// RECOMMENDED (antes de :id)
app.get('/ds/products/recommended', async (req, res) => {
  if (!(await ensureTokenOr401(res))) return;

  const ship_to_country = (req.query.country || 'BR').toUpperCase();
  const target_currency = (req.query.currency || 'BRL').toUpperCase();
  const target_language = (req.query.lang || 'PT').toUpperCase();
  const feed_name = req.query.feed || 'DS bestseller';
  const sort = req.query.sort || 'volumeDesc';
  const category_id = req.query.cat ? String(req.query.cat) : undefined;
  const page_no = Math.max(1, Number(req.query.page || 1));
  const page_size = Math.min(50, Math.max(1, Number(req.query.size || 20)));

  const extra = { ship_to_country, target_currency, target_language, page_no, page_size, sort, feed_name };
  if (category_id) extra.category_id = category_id;

  const app_key = AE_APP_KEY.toString();
  const app_secret = AE_APP_SECRET.toString();
  const session = store.access_token;
  const client = new DropshipperClient({
    app_key,
    app_secret,
    session, // access_token
  });
  const direta = await client.callAPIDirectly('aliexpress.ds.recommend.feed.get', extra);
  res.json(direta);
});

// Detalhe — só numérico
app.get('/ds/products/:id', async (req, res) => {
  if (!(await ensureTokenOr401(res))) return;

  const pid = String(req.params.id);
  const app_key = AE_APP_KEY.toString();
  const app_secret = AE_APP_SECRET.toString();
  const session = store.access_token;
  const client = new DropshipperClient({
    app_key,
    app_secret,
    session, // access_token
  });
  const data = await client.productDetails({
    product_id: pid,
    ship_to_country: (req.query.country || 'BR').toUpperCase(),
    target_currency: (req.query.currency || 'BRL').toUpperCase(),
    target_language: (req.query.lang || 'PT').toUpperCase(),
  });

  res.json({ ok: true, data });
});

app.get('/ds/frete/:id/:sku', async (req, res) => {
  if (!(await ensureTokenOr401(res))) return;

  const pid = String(req.params.id);
  const skuid = String(req.params.sku);

  const client = new DropshipperClient({
    app_key: AE_APP_KEY,
    app_secret: AE_APP_SECRET,
    session: store.access_token, // access_token
  });

  const product = await client.productDetails({
    product_id: pid,
    ship_to_country: (req.query.country || 'BR').toUpperCase(),
    target_currency: (req.query.currency || 'BRL').toUpperCase(),
    target_language: (req.query.lang || 'PT').toUpperCase(),
  });

  const queryDeliveryReq = {
    shipToCountry: "BR",
    productId: pid,
    quantity: req.query.qnt,
    currency: "BRL",
    locale: 'pt_BR',
    language: 'pt_BR',
    selectedSkuId: skuid,
    cityCode: "Brasilia"
  };

  const direta = await client.callAPIDirectly(
    "aliexpress.ds.freight.query",
    {
      queryDeliveryReq: JSON.stringify(queryDeliveryReq) // <-- precisa ser string
    }
  );

  res.json({ ok: true, direta });
});


/* =================== HEALTH / DEBUG =================== */
app.get('/', async (req, res) => {
  await loadTokenFromDisk();
  res.json({
    status: 'ok',
    has_token: Boolean(store.access_token),
    token_expires_at: store.expire_time || null,
    token_file: TOKEN_PATH,
    time_skew_seconds: Time.skewSeconds(),
    last_time_sync_ms: Time.lastSync || null,
  });
});

/* =================== START =================== */
(async () => {
  await loadTokenFromDisk();
  await Time.sync();
  setInterval(() => Time.sync(), 15 * 60 * 1000);

  try {
    if (!tokenValid() && store.refresh_token) {
      const data = await refreshAccessToken(store.refresh_token);
      if (data?.access_token) await setTokenFromResponse(data);
    }
  } catch (e) {
    console.warn('[TOKEN] Não foi possível renovar no boot:', e?.message);
  }

  app.listen(APP_PORT, () => {
    console.log(`🚀 AE app em http://localhost:${APP_PORT}`);
    console.log('• GET  /auth  → autoriza');
  });
})();
