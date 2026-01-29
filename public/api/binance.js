export async function fetchBalances() {
  return fetch("http://localhost:3000/balances").then((x) => x.json());
}

export async function fetchRaw() {
  return fetch("http://localhost:3000/raw")
    .then((x) => x.json())
    .catch(() => null);
}

export async function fetchOrders() {
  return fetch("http://localhost:3000/orders").then((x) => x.json());
}
