// server.js

// Carrega .env apenas se existir (desenvolvimento)
try {
  process.loadEnvFile();
} catch (e) {
  // Em produção, variáveis vêm do sistema
}
import express from "express";
import crypto from "node:crypto";
import fetch from "node-fetch";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "url";

// Servir arquivos estáticos (coloque seu .html na pasta 'public')
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Livereload apenas em desenvolvimento
if (process.env.NODE_ENV !== "production") {
  try {
    const livereload = (await import("livereload")).default;
    const connectLivereload = (await import("connect-livereload")).default;

    const liveReloadServer = livereload.createServer({
      exts: ["js", "css", "html", "jpg", "png", "jpeg", "gif", "svg"],
    });
    liveReloadServer.watch(path.join(__dirname, "public"));
    app.use(connectLivereload());
    console.log("📡 Livereload ativado");
  } catch (e) {
    // Ignora se não tiver instalado em produção
  }
}

app.use(express.static(path.join(__dirname, "public")));
// Serve a pasta public inteira no caminho /site
app.use("/site", express.static(path.join(__dirname, "public")));

// Opcional: redireciona /site para o index.html automaticamente
app.get("/site", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

const {
  BINANCE_API_KEY: DEFAULT_API_KEY,
  BINANCE_API_SECRET: DEFAULT_API_SECRET,
} = process.env;
const BASE_URL = "https://api.binance.com";

// Middleware para extrair credenciais (do header ou env)
function getCredentials(req) {
  const headerKey = req.headers["x-binance-api-key"];
  const headerSecret = req.headers["x-binance-api-secret"];

  return {
    apiKey: headerKey || DEFAULT_API_KEY,
    apiSecret: headerSecret || DEFAULT_API_SECRET,
  };
}

// Valida se as credenciais existem
function validateCredentials(credentials) {
  if (!credentials.apiKey || !credentials.apiSecret) {
    throw new Error("Credenciais da Binance não fornecidas");
  }
  return true;
}

app.listen(PORT, onStartup());

function onStartup() {
  console.log(`🚀 API rodando em:
   • http://localhost:${PORT}/balances          (carteira filtrada)
   • http://localhost:${PORT}/raw               (dados crus da Binance)
   • http://localhost:${PORT}/orders            (ordens abertas agrupadas por ativo)
   • http://localhost:${PORT}/orders/:asset     (ordens abertas para ativo específico)
   • http://localhost:${PORT}/site              (dashboard com HTML/CSS/JS)
  `);
}

// -----------------------------------------------------------------------------
// ROTAS
// -----------------------------------------------------------------------------

// 🔥 NOVO: retorna o JSON cru da Binance
app.get("/raw", async (req, res) => {
  try {
    const credentials = getCredentials(req);
    validateCredentials(credentials);
    const data = await getRawBinanceAccount(credentials);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// Rota refinada com cálculos
app.get("/balances", async (req, res) => {
  try {
    const credentials = getCredentials(req);
    validateCredentials(credentials);
    const data = await buildWalletData(credentials);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/avg-buy-prices", async (req, res) => {
  try {
    const credentials = getCredentials(req);
    validateCredentials(credentials);
    const data = await buildAvgBuyPrices(credentials);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.get("/orders", async (req, res) => {
  try {
    const credentials = getCredentials(req);
    validateCredentials(credentials);
    const orders = await getOpenOrders(credentials);
    const grouped = groupOrdersByAsset(orders);
    res.json(grouped);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.get("/orders/:asset", async (req, res) => {
  try {
    const credentials = getCredentials(req);
    validateCredentials(credentials);
    const asset = req.params.asset.toUpperCase();

    const orders = await getOpenOrders(credentials);
    const grouped = groupOrdersByAsset(orders);

    res.json(grouped[asset] || []);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function signQuery(query, apiSecret) {
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
}

// Retorna dados crus da Binance (inclui balances, permissões, etc.)
async function getRawBinanceAccount(credentials) {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = signQuery(query, credentials.apiSecret);

  const url = `${BASE_URL}/api/v3/account?${query}&signature=${signature}`;
  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": credentials.apiKey },
  });

  if (!res.ok) throw new Error(await res.text());

  return await res.json();
}

// Saldo da conta (para /balances)
async function getAccountBalances(credentials) {
  const data = await getRawBinanceAccount(credentials);
  return data.balances;
}

// Busca TODAS as cotações
async function getAllPrices() {
  const res = await fetch(`${BASE_URL}/api/v3/ticker/price`);
  if (!res.ok) throw new Error(await res.text());

  const list = await res.json();
  const priceMap = {};
  for (const item of list) {
    priceMap[item.symbol] = Number(item.price);
  }
  return priceMap;
}

function sortByPercentage(rows) {
  return rows.sort((a, b) => b.pct - a.pct);
}

// Monta dados refinados (rota /balances)
async function buildWalletData(credentials) {
  const balances = await getAccountBalances(credentials);

  const nonZero = balances.filter(
    (b) => Number(b.free) > 0 || Number(b.locked) > 0
  );

  const allPrices = await getAllPrices();

  const rows = [];

  for (const b of nonZero) {
    const asset = b.asset;

    let price = 1;
    if (asset !== "USDT" && asset !== "BUSD") {
      price = allPrices[asset + "USDT"] || null;
    }

    if (price === null) continue;

    const free = Number(b.free);
    const locked = Number(b.locked);

    const freeUSDT = free * price;
    const lockedUSDT = locked * price;
    const totalUSDT = freeUSDT + lockedUSDT;

    rows.push({
      asset,
      freeUSDT,
      lockedUSDT,
      totalUSDT,
    });
  }

  const totalWalletUSDT = rows.reduce((acc, r) => acc + r.totalUSDT, 0);

  const processed = rows.map((r) => ({
    ...r,
    pct: (r.totalUSDT / totalWalletUSDT) * 100,
  }));

  return {
    total_usdt: totalWalletUSDT,
    assets: sortByPercentage(processed),
  };
}

async function getOpenOrders(credentials) {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = signQuery(query, credentials.apiSecret);

  const url = `${BASE_URL}/api/v3/openOrders?${query}&signature=${signature}`;

  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": credentials.apiKey },
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

function groupOrdersByAsset(orders) {
  const map = {};

  for (const order of orders) {
    // extrai ativo base — assume pares padrão tipo BTCUSDT, ETHBTC, etc
    const asset = order.symbol.replace(/USDT|BTC|ETH|BNB|BUSD|FDUSD|TRY$/, "");

    if (!map[asset]) map[asset] = [];
    map[asset].push(order);
  }

  return map;
}

async function getMyTrades(symbol, credentials) {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}&symbol=${symbol}&limit=1000`;
  const signature = signQuery(query, credentials.apiSecret);

  const url = `${BASE_URL}/api/v3/myTrades?${query}&signature=${signature}`;

  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": credentials.apiKey },
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function buildAvgBuyPrices(credentials) {
  const balances = await getAccountBalances(credentials);
  const assets = balances
    .filter(
      (b) =>
        (Number(b.free) > 0 || Number(b.locked) > 0) &&
        b.asset !== "USDT" &&
        b.asset !== "BUSD"
    )
    .map((b) => b.asset);

  const priceMap = {};

  for (const asset of assets) {
    const symbol = `${asset}USDT`;
    try {
      const trades = await getMyTrades(symbol, credentials);
      const buys = trades.filter((t) => t.isBuyer);

      const totalQty = buys.reduce(
        (sum, t) => sum + Number(t.qty || t.executedQty || 0),
        0
      );
      const totalCost = buys.reduce(
        (sum, t) => sum + Number(t.price) * Number(t.qty || t.executedQty || 0),
        0
      );

      priceMap[asset] = totalQty > 0 ? totalCost / totalQty : null;
    } catch (err) {
      priceMap[asset] = null;
    }
  }

  return priceMap;
}
