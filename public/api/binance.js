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

export async function fetchPriceChart(asset, range, before = null) {
  const extra = before ? `&before=${before}` : "";
  return getJson(`/price-chart/${encodeURIComponent(asset)}?range=${encodeURIComponent(range)}${extra}`);
}

export async function fetchOpenOrdersForAsset(asset) {
  const json = await getJson(`/orders/${encodeURIComponent(asset)}`);
  return Array.isArray(json) ? json : [];
}

export async function fetchOrders() {
  return fetch("/orders").then((x) => x.json());
}
