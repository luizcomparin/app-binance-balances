// Legenda acima do gráfico: valores do preço médio e liga/desliga das suas ordens e ordens abertas.
import { formatPrice } from "../../../core/format.js";

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

  return function render({ avg, projectedAvg, orders, openOrders }, hidden) {
    if (!el) return;
    const item = (swatch, text, key) => {
      const off = key && hidden[key];
      const attrs = key ? ` data-toggle="${key}" title="Clique para ${off ? "mostrar" : "esconder"}"` : "";
      return `<span class="lg-item${key ? " toggle" : ""}${off ? " off" : ""}"${attrs}><i class="sw ${swatch}"></i>${text}</span>`;
    };
    const items = [];
    if (avg) items.push(item("sw-avg", `Preço médio: ${formatPrice(avg)}`));
    if (projectedAvg) items.push(item("sw-projected", `Médio após compras abertas: ${formatPrice(projectedAvg)}`));
    if (orders.buys.length) items.push(item("sw-buy", `Suas compras (${orders.buys.length})`, "myBuys"));
    if (orders.sells.length) items.push(item("sw-sell", `Suas vendas (${orders.sells.length})`, "mySells"));
    if (orders.buys.length + orders.sells.length >= 4) {
      items.push(`<span class="lg-note" title="Bolinhas maiores = ordens de maior valor em USDT (por faixa, comparando as ordens desta moeda)">● tamanho = valor</span>`);
    }
    if (openOrders?.buys.length) items.push(item("sw-open-buy", `Compras abertas (${openOrders.buys.length})`, "openBuys"));
    if (openOrders?.sells.length) items.push(item("sw-open-sell", `Vendas abertas (${openOrders.sells.length})`, "openSells"));
    items.push(`<button type="button" class="ghost lg-fit" data-action="fit" title="Enquadrar todo o período carregado">Ajustar zoom</button>`);
    el.innerHTML = items.join("");
  };
}
