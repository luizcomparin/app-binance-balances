// binance-balances.js

// Carrega .env apenas se existir (desenvolvimento)
try {
  process.loadEnvFile();
} catch (e) {
  // Em produção, variáveis vêm do sistema
}
import crypto from "node:crypto";
import fetch from "node-fetch";

const { BINANCE_API_KEY, BINANCE_API_SECRET } = process.env;
const BASE_URL = "https://api.binance.com";

if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
  console.error(
    "Erro: defina BINANCE_API_KEY e BINANCE_API_SECRET no arquivo .env"
  );
  process.exit(1);
}

function signQuery(query) {
  return crypto
    .createHmac("sha256", BINANCE_API_SECRET)
    .update(query)
    .digest("hex");
}

async function getAccountBalances() {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = signQuery(query);

  const res = await fetch(
    `${BASE_URL}/api/v3/account?${query}&signature=${signature}`,
    {
      headers: { "X-MBX-APIKEY": BINANCE_API_KEY },
    }
  );

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).balances;
}

async function getPriceInUSDT(asset) {
  if (asset === "USDT") return 1;
  if (asset === "BUSD") return 1;

  const symbol = asset + "USDT";
  const res = await fetch(`${BASE_URL}/api/v3/ticker/price?symbol=${symbol}`);

  if (!res.ok) return null;

  return Number((await res.json()).price);
}

// 🔥 Função de ordenação: ordena pela maior porcentagem da carteira
function sortByPercentage(rows) {
  return rows.sort((a, b) => b.pct - a.pct);
}

(async () => {
  const balances = await getAccountBalances();
  const nonZero = balances.filter(
    (b) => Number(b.free) > 0 || Number(b.locked) > 0
  );

  const prices = {};
  await Promise.all(
    nonZero.map(async (b) => {
      prices[b.asset] = await getPriceInUSDT(b.asset);
    })
  );

  const rows = nonZero
    .filter((b) => prices[b.asset] !== null)
    .map((b) => {
      const free = Number(b.free);
      const locked = Number(b.locked);
      const price = prices[b.asset];

      const freeUSDT = free * price;
      const lockedUSDT = locked * price;
      const totalUSDT = freeUSDT + lockedUSDT;

      return {
        asset: b.asset,
        freeUSDT,
        lockedUSDT,
        totalUSDT,
      };
    });

  const totalWalletUSDT = rows.reduce((acc, r) => acc + r.totalUSDT, 0);

  // Agora adicionamos a porcentagem e ordenamos
  const processed = rows.map((r) => ({
    ...r,
    pct: (r.totalUSDT / totalWalletUSDT) * 100,
  }));

  // Ordena pelo maior peso da carteira
  const sorted = sortByPercentage(processed);

  console.log("nome | total_usdt | % | livre_usdt | travado_usdt");
  console.log("-------------------------------------------------------");

  for (const r of sorted) {
    console.log(
      `${r.asset} | ${r.totalUSDT.toFixed(2)} | ${r.pct.toFixed(
        2
      )}% | ${r.freeUSDT.toFixed(2)} | ${r.lockedUSDT.toFixed(2)}`
    );
  }

  console.log("-------------------------------------------------------");
  console.log("Total da carteira em USDT:", totalWalletUSDT.toFixed(2));
})();
