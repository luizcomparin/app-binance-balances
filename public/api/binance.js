export async function fetchBalances() {
  return fetch("/balances").then((x) => x.json());
}

export async function fetchRaw() {
  return fetch("/raw")
    .then((x) => x.json())
    .catch(() => null);
}

export async function fetchPositions() {
  const res = await fetch("/positions");
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || res.statusText);
  return json;
}

async function getJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || res.statusText);
  return json;
}

export async function fetchExecutedOrders() {
  return getJson("/executed-orders");
}

// Velas de um tamanho específico (1h|4h|1d|1w|1M); before (ms) = página anterior a esse instante
export async function fetchKlines(asset, interval, { before = null, limit = 1000 } = {}) {
  const extra = before ? `&before=${before}` : "";
  return getJson(
    `/price-chart/${encodeURIComponent(asset)}?interval=${encodeURIComponent(interval)}&limit=${limit}${extra}`
  );
}

// Histórico de ordens de uma moeda: { orders, errors } (ordens encerradas, com as execuções)
export async function fetchOrderHistory(asset) {
  return getJson(`/order-history/${encodeURIComponent(asset)}`);
}

// Mapa de liquidação estimado (futuros perpétuos): { available, levels, segments, ratios, ... }
export async function fetchLiquidationMap(asset) {
  return getJson(`/liquidation-map/${encodeURIComponent(asset)}`);
}

// Dados de futuros (open interest, long/short, funding) no período 1h|4h|1d
export async function fetchFuturesData(asset, period) {
  return getJson(`/futures-data/${encodeURIComponent(asset)}?period=${period}`);
}

// Histórico de trades (execuções) de uma moeda: { trades, errors }
export async function fetchAssetTrades(asset) {
  return getJson(`/trade-history/${encodeURIComponent(asset)}`);
}

export async function fetchOpenOrdersForAsset(asset) {
  const json = await getJson(`/orders/${encodeURIComponent(asset)}`);
  return Array.isArray(json) ? json : [];
}

export async function fetchOrders() {
  return fetch("/orders").then((x) => x.json());
}
