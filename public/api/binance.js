export async function fetchBalances() {
  return fetch("/balances").then((x) => x.json());
}

export async function fetchRaw() {
  return fetch("/raw")
    .then((x) => x.json())
    .catch(() => null);
}

export async function fetchOrders() {
  return fetch("/orders").then((x) => x.json());
}
