// Lista de moedas ao lado do gráfico (igual à watchlist do TradingView): moedas da carteira com preço
// e variação 24h. Clicar abre a moeda no gráfico; arrastar reorganiza (ordem salva no navegador).
// O botão ao lado de "Ajustar zoom" mostra/esconde a lista (também lembrado).
import { state } from "../../core/state.js";
import { formatPrice, formatSigned, signClass } from "../../core/format.js";

const ORDER_KEY = "priceChartWatchlistOrder";
const OPEN_KEY = "priceChartWatchlistOpen";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sem armazenamento: vale só até recarregar
  }
}

function readOrder() {
  try {
    const order = JSON.parse(read(ORDER_KEY) || "[]");
    return Array.isArray(order) ? order.filter((a) => typeof a === "string") : [];
  } catch {
    return [];
  }
}

/** getCurrent(): moeda aberta agora; onSelect(asset): abrir `asset` no gráfico. Devolve { refresh() } */
export function initWatchlist({ getCurrent, onSelect }) {
  const toggle = document.getElementById("price-chart-watchlist-btn");
  const panel = document.getElementById("price-chart-watchlist");
  const list = document.getElementById("price-chart-watchlist-list");
  if (!toggle || !panel || !list) return { refresh() {} };

  let order = readOrder();
  let dragged = null; // moeda sendo arrastada

  // moedas da carteira (menos o USDT, como no seletor do título): primeiro na ordem salva,
  // as novas no fim por valor em carteira
  function items() {
    const assets = state.currentAssets.filter((a) => a.asset !== "USDT");
    const byAsset = new Map(assets.map((a) => [a.asset, a]));
    const saved = order.filter((s) => byAsset.has(s)).map((s) => byAsset.get(s));
    const rest = assets.filter((a) => !order.includes(a.asset)).sort((a, b) => b.totalUSDT - a.totalUSDT);
    return [...saved, ...rest];
  }

  function render() {
    if (panel.hidden) return;
    const list_ = items();
    if (!list_.length) {
      list.innerHTML = `<li class="wl-empty">${state.currentAssets.length ? "Nenhuma moeda na carteira" : "Saldos ainda carregando..."}</li>`;
      return;
    }
    const current = getCurrent();
    list.innerHTML = list_
      .map((a) => {
        const change = a.change24hPct === null || a.change24hPct === undefined ? "--" : `${formatSigned(a.change24hPct)}%`;
        return `
          <li class="wl-item${a.asset === current ? " current" : ""}" draggable="true" data-asset="${a.asset}"
              title="Abrir ${a.asset}/USDT · arraste para reorganizar">
            <span class="wl-symbol">${a.asset}<span class="wl-quote">USDT</span></span>
            <span class="wl-price">${formatPrice(a.priceUSDT)}</span>
            <span class="wl-change ${signClass(a.change24hPct)}">${change}</span>
          </li>`;
      })
      .join("");
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.classList.toggle("is-active", open);
    toggle.setAttribute("aria-expanded", String(open));
    write(OPEN_KEY, open ? "1" : "0");
    render();
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));

  list.addEventListener("click", (e) => {
    const asset = e.target.closest(".wl-item")?.dataset.asset;
    if (asset && asset !== getCurrent()) onSelect(asset);
  });

  // ---- arrastar para reorganizar: linha indica onde a moeda vai entrar (acima ou abaixo do item)
  const clearMarks = () => list.querySelectorAll(".drop-before, .drop-after").forEach((li) => li.classList.remove("drop-before", "drop-after"));

  list.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".wl-item");
    if (!li) return;
    dragged = li.dataset.asset;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragged);
  });

  list.addEventListener("dragover", (e) => {
    const li = e.target.closest(".wl-item");
    if (!dragged || !li) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    clearMarks();
    if (li.dataset.asset !== dragged) li.classList.add(after ? "drop-after" : "drop-before");
  });

  list.addEventListener("drop", (e) => {
    const li = e.target.closest(".wl-item");
    if (!dragged || !li) return;
    e.preventDefault();
    const target = li.dataset.asset;
    const after = li.classList.contains("drop-after");
    clearMarks();
    if (target === dragged) return;
    const assets = items().map((a) => a.asset).filter((a) => a !== dragged);
    assets.splice(assets.indexOf(target) + (after ? 1 : 0), 0, dragged);
    order = assets;
    write(ORDER_KEY, JSON.stringify(order));
    render();
  });

  list.addEventListener("dragend", () => {
    dragged = null;
    clearMarks();
    list.querySelector(".dragging")?.classList.remove("dragging");
  });

  setOpen(read(OPEN_KEY) === "1");

  return { refresh: render };
}
