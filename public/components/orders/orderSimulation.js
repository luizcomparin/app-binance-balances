// Simulação na aba Ordens Abertas: como fica a carteira se todas as ordens filtradas executarem.
// Vendas: recebe o total da ordem no lugar do valor de mercado atual da moeda.
// Compras: gasta USDT e recebe moeda valendo o preço pago (não muda o patrimônio).
import { state } from "../../core/state.js";
import { formatSigned, signClass } from "../../core/format.js";
import { setHtml } from "../../core/dom.js";
import { BALANCES_UPDATED, on } from "../../core/events.js";

// a simulação usa o saldo atual: recalcula quando os saldos chegam (se as ordens já chegaram)
export function initOrderSimulation() {
  on(BALANCES_UPDATED, renderOrderSimulation);
}

export function renderOrderSimulation() {
  const box = document.getElementById("orders-simulation");
  if (!box) return;

  const orders = state.filteredOrders;
  if (!orders.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  const sells = orders.filter((o) => o.side === "SELL");
  const buys = orders.filter((o) => o.side === "BUY");
  const sum = (list, key) => list.reduce((acc, o) => acc + (o[key] ?? 0), 0);

  const sellProceeds = sum(sells, "total");
  const sellMarketValue = sum(sells, "marketValueUSDT");
  const buyCost = sum(buys, "total");
  const buyMarketValue = sum(buys, "marketValueUSDT");

  const walletUSDT = state.currentAssets.find((a) => a.asset === "USDT")?.totalUSDT ?? 0;
  const walletTotal = state.currentAssets.reduce((acc, a) => acc + a.totalUSDT, 0);

  const projectedUSDT = walletUSDT + sellProceeds - buyCost;
  const sellGain = sellProceeds - sellMarketValue;
  const projectedTotal = walletTotal + sellGain;

  const usdt = (v) => `${v.toFixed(2).formatCurrency()} USDT`;

  setHtml(
    "sim-sells",
    `${usdt(sellProceeds)} <small class="muted">(${sells.length} ordens · hoje valem ${usdt(sellMarketValue)})</small>`
  );
  setHtml(
    "sim-buys",
    `${usdt(buyCost)} <small class="muted">(${buys.length} ordens · hoje valeriam ${usdt(buyMarketValue)})</small>`
  );
  setHtml("sim-usdt", `${usdt(projectedUSDT)} <small class="muted">(hoje ${usdt(walletUSDT)})</small>`);
  setHtml(
    "sim-total",
    `${usdt(projectedTotal)} <small class="${signClass(sellGain)}">(${formatSigned(sellGain)} USDT)</small>`
  );
}
