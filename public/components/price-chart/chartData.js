// Dados do gráfico de preço: velas (OHLC) e suas ordens executadas, com cache curto no cliente.
import { fetchKlines, fetchExecutedOrders, fetchOpenOrdersForAsset } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { executedTotalOnChart, orderPriceOnChart } from "./chartQuote.js";

const CLIENT_CACHE_MS = 60 * 1000;
// páginas antigas não mudam mais: podem ficar mais tempo em cache
const OLDER_PAGE_CACHE_MS = 10 * 60 * 1000;
export const KLINES_PAGE = 1000;

// Cache por moeda + tamanho de vela + página: trocar Linha/Velas nunca refaz requisição,
// e voltar a uma combinação já vista dentro do prazo também não.
const chartCache = new Map();

// Uma página de velas (as mais recentes, ou as anteriores a `before` em ms)
export async function getKlines(asset, interval, before = null) {
  const key = `${asset}|${interval}|${before || ""}`;
  const ttl = before ? OLDER_PAGE_CACHE_MS : CLIENT_CACHE_MS;
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const data = await fetchKlines(asset, interval, { before, limit: KLINES_PAGE });
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

// Ordens abertas por moeda, já convertidas para a cotação do gráfico (USDT; BRL no USDT/BRL, ver
// chartQuote.js): { buys, sells, all, error }, cada item de buys/sells = { priceUSDT (preço na cotação do
// gráfico), qty, order }; all = lista crua de todas as ordens (null se a requisição falhou, com o
// motivo em error). Falhas não entram no cache: chamar de novo tenta de novo.
const openOrdersCache = new Map();

export async function loadOpenOrders(asset) {
  const hit = openOrdersCache.get(asset);
  if (hit && Date.now() - hit.at < CLIENT_CACHE_MS) return hit.data;

  let error = null;
  const raw = await fetchOpenOrdersForAsset(asset).catch((err) => {
    error = err?.message || "erro desconhecido";
    return null;
  });
  // falhou: sem cache, all = null (a tabela mostra o erro); com cache, devolve os dados antigos marcados
  // como desatualizados (stale + horário + motivo), para a tabela avisar em vez de mostrá-los como atuais
  if (!raw) return hit ? { ...hit.data, stale: true, staleAt: hit.at, error } : { buys: [], sells: [], all: null, error };

  const buys = [];
  const sells = [];
  for (const o of raw) {
    const price = Number(o.price) || Number(o.stopPrice) || 0;
    const qty = Number(o.remainingQty ?? o.origQty) || 0;
    const chartPrice = orderPriceOnChart(asset, { price, quoteAsset: o.quoteAsset, quotePriceUSDT: o.quotePriceUSDT }, state.usdtBrlPrice);
    if (!chartPrice || !qty) continue;
    const item = { priceUSDT: chartPrice, qty, order: o };
    (o.side === "BUY" ? buys : sells).push(item);
  }
  const data = { buys, sells, all: raw };
  openOrdersCache.set(asset, { at: Date.now(), data });
  return data;
}

// Botão Atualizar do topo: descarta o cache do cliente da moeda (velas mais recentes e ordens abertas)
// e das suas ordens executadas. Páginas antigas de velas ficam, porque não mudam mais.
export function invalidateAssetCache(asset) {
  for (const key of chartCache.keys()) {
    if (key.startsWith(`${asset}|`) && key.endsWith("|")) chartCache.delete(key);
  }
  openOrdersCache.delete(asset);
  myOrders.at = 0;
}

/**
 * Encaixa cada ordem da moeda na vela/ponto do gráfico em que ela aconteceu.
 * Retorna { buys, sells }, cada item = { idx (índice da vela), y (preço na cotação do gráfico), order }.
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
    // sem valor na cotação do gráfico (sem cotação) não há preço para posicionar o marcador
    const total = executedTotalOnChart(asset, o, state.usdtBrlPrice);
    if (total == null) continue;
    // busca binária: última vela com time <= o.time
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (points[mid].time <= o.time) lo = mid;
      else hi = mid - 1;
    }
    (o.side === "BUY" ? buys : sells).push({ idx: lo, y: total / o.qty, order: o });
  }
  return { buys, sells };
}
