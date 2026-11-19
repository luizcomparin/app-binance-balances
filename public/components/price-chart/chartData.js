// Dados do gráfico de preço: velas (OHLC) e suas ordens executadas, com cache curto no cliente.
import { fetchPriceChart, fetchExecutedOrders } from "../../api/binance.js";

// Cache por moeda+período: trocar Linha/Velas nunca refaz requisição,
// e voltar a um período já visto dentro de 60s também não.
const CLIENT_CACHE_MS = 60 * 1000;
const chartCache = new Map();

export async function getChartData(asset, range) {
  const key = `${asset}|${range}`;
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.at < CLIENT_CACHE_MS) return hit.data;
  const data = await fetchPriceChart(asset, range);
  chartCache.set(key, { at: Date.now(), data });
  return data;
}

// Suas ordens executadas (todas as moedas) — uma requisição por minuto no máximo.
// O servidor já tem o histórico de trades em cache (é o mesmo do cálculo do P&L).
const myOrders = { at: 0, list: null, loading: null };

export function loadMyOrders() {
  if (myOrders.list && Date.now() - myOrders.at < CLIENT_CACHE_MS) return Promise.resolve(myOrders.list);
  if (myOrders.loading) return myOrders.loading;
  myOrders.loading = fetchExecutedOrders()
    .then((data) => {
      myOrders.list = data.orders || [];
      myOrders.at = Date.now();
      return myOrders.list;
    })
    .catch(() => myOrders.list || [])
    .finally(() => {
      myOrders.loading = null;
    });
  return myOrders.loading;
}

/**
 * Encaixa cada ordem da moeda na vela/ponto do gráfico em que ela aconteceu.
 * Retorna { buys, sells }, cada item = { idx (índice da vela), y (preço USDT), order }.
 */
export function ordersOnChart(points, asset) {
  if (!myOrders.list || !points.length) return { buys: [], sells: [] };
  const buys = [];
  const sells = [];
  const first = points[0].time;
  const step = points.length > 1 ? points[1].time - points[0].time : 0;
  const last = points.at(-1).time + step;

  for (const o of myOrders.list) {
    if (o.baseAsset !== asset || !o.qty || o.time < first || o.time > last) continue;
    // busca binária: última vela com time <= o.time
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (points[mid].time <= o.time) lo = mid;
      else hi = mid - 1;
    }
    (o.side === "BUY" ? buys : sells).push({ idx: lo, y: o.totalUSDT / o.qty, order: o });
  }
  return { buys, sells };
}
