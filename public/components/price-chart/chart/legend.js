// Legenda acima do gráfico: valores do preço médio e liga/desliga das suas ordens e ordens abertas.
import { formatPrice } from "../../../core/format.js";
import { AVG_HELP } from "./overlays.js";

/**
 * Liga a legenda ao elemento. handlers = { onToggle(key), onFit() }
 * Devolve render(opts, hidden) para redesenhar quando os dados mudam.
 */
export function createLegend(el, { onToggle, onFit }) {
  el?.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="fit"]')) return onFit();
    const key = e.target.closest("[data-toggle]")?.dataset.toggle;
    if (key) onToggle(key);
  });

  return function render({ avg, avgSell, projectedAvg, projectedSellAvg, fixedAvg, dcaAvg, orders, openOrders }, hidden) {
    if (!el) return;
    // help = texto explicativo mostrado no hover (itens sem liga/desliga)
    const item = (swatch, text, key, help) => {
      const off = key && hidden[key];
      const attrs = key
        ? ` data-toggle="${key}" title="Clique para ${off ? "mostrar" : "esconder"}"`
        : help
          ? ` data-tip="${help}"`
          : "";
      return `<span class="lg-item${key ? " toggle" : ""}${off ? " off" : ""}"${attrs}><i class="sw ${swatch}"></i>${text}</span>`;
    };
    const items = [];
    if (avg) items.push(item("sw-avg", `${AVG_HELP.avg.title}: ${formatPrice(avg)}`, null, AVG_HELP.avg.text));
    if (avgSell) items.push(item("sw-avg-sell", `${AVG_HELP.avgSell.title}: ${formatPrice(avgSell)}`, null, AVG_HELP.avgSell.text));
    if (projectedAvg) items.push(item("sw-projected", `Médio após compras abertas: ${formatPrice(projectedAvg)}`));
    if (projectedSellAvg) items.push(item("sw-projected-sell", `Médio após vendas abertas: ${formatPrice(projectedSellAvg)}`));
    if (fixedAvg) items.push(item("sw-fixed-avg", `${AVG_HELP.fixedAvg.title}: ${formatPrice(fixedAvg)}`, null, AVG_HELP.fixedAvg.text));
    if (dcaAvg) items.push(item("sw-dca", `Médio mensal fixo: ${formatPrice(dcaAvg)}`));
    if (orders.buys.length) items.push(item("sw-buy", `Suas compras (${orders.buys.length})`, "myBuys"));
    if (orders.sells.length) items.push(item("sw-sell", `Suas vendas (${orders.sells.length})`, "mySells"));
    if (orders.buys.length + orders.sells.length >= 4) {
      items.push(`<span class="lg-note" title="Bolinhas maiores = ordens de maior valor em USDT (por faixa, comparando as ordens desta moeda)">● tamanho = valor</span>`);
    }
    if (openOrders?.buys.length) items.push(item("sw-open-buy", `Compras abertas (${openOrders.buys.length})`, "openBuys"));
    if (openOrders?.sells.length) items.push(item("sw-open-sell", `Vendas abertas (${openOrders.sells.length})`, "openSells"));
    el.innerHTML = items.join("");
  };
}
