// Seletor de moeda no título do gráfico ("XRP / USDT ▾"): lista as moedas da carteira com busca,
// para trocar o gráfico sem fechar o modal. Teclado: ↑ ↓ navegam, Enter escolhe, Esc fecha a lista.
import { state } from "../../core/state.js";
import { formatSigned, signClass } from "../../core/format.js";

/**
 * getCurrent(): moeda aberta agora; onSelect(asset): trocar o gráfico para `asset`.
 */
export function initAssetPicker({ getCurrent, onSelect }) {
  const button = document.getElementById("price-chart-title-btn");
  const panel = document.getElementById("asset-picker");
  const search = document.getElementById("asset-picker-search");
  const list = document.getElementById("asset-picker-list");
  if (!button || !panel || !search || !list) return;

  let items = []; // moedas filtradas, na ordem exibida
  let active = 0; // índice destacado (teclado/mouse)

  // moedas com gráfico: todas da carteira menos o próprio USDT (mesma regra da tabela de saldos)
  const available = () =>
    [...state.currentAssets].filter((a) => a.asset !== "USDT").sort((a, b) => b.totalUSDT - a.totalUSDT);

  function render() {
    const term = search.value.trim().toUpperCase();
    items = available().filter((a) => !term || a.asset.includes(term));
    active = Math.min(active, Math.max(0, items.length - 1));

    if (!items.length) {
      list.innerHTML = `<li class="ap-empty">${state.currentAssets.length ? "Nenhuma moeda encontrada" : "Saldos ainda carregando..."}</li>`;
      return;
    }

    const current = getCurrent();
    list.innerHTML = items
      .map((a, i) => {
        const change =
          a.change24hPct === null || a.change24hPct === undefined
            ? ""
            : `<span class="ap-change ${signClass(a.change24hPct)}">${formatSigned(a.change24hPct)}%</span>`;
        return `
          <li role="option" data-idx="${i}" class="ap-item${i === active ? " active" : ""}${a.asset === current ? " current" : ""}"
              aria-selected="${a.asset === current}">
            <span class="ap-symbol">${a.asset}</span>
            <span class="ap-pct">${a.pct.toFixed(2)}%</span>
            <span class="ap-usdt">${a.totalUSDT.toFixed(2).formatCurrency()} USDT</span>
            ${change}
          </li>`;
      })
      .join("");
  }

  function highlight(idx) {
    active = Math.max(0, Math.min(items.length - 1, idx));
    list.querySelectorAll(".ap-item").forEach((li, i) => li.classList.toggle("active", i === active));
    list.querySelector(".ap-item.active")?.scrollIntoView({ block: "nearest" });
  }

  function open() {
    search.value = "";
    const currentIdx = available().findIndex((a) => a.asset === getCurrent());
    active = Math.max(0, currentIdx);
    render();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    search.focus();
    list.querySelector(".ap-item.active")?.scrollIntoView({ block: "nearest" });
  }

  function close() {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function choose(idx) {
    const a = items[idx];
    if (!a) return;
    close();
    if (a.asset !== getCurrent()) onSelect(a.asset);
  }

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden ? open() : close();
  });

  search.addEventListener("input", () => {
    active = 0;
    render();
  });

  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") highlight(active + 1);
    else if (e.key === "ArrowUp") highlight(active - 1);
    else if (e.key === "Enter") choose(active);
    else if (e.key === "Escape") {
      close();
      button.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation(); // Esc aqui fecha só a lista, não o modal
  });

  list.addEventListener("mousemove", (e) => {
    const idx = Number(e.target.closest(".ap-item")?.dataset.idx);
    if (Number.isInteger(idx) && idx !== active) highlight(idx);
  });

  list.addEventListener("click", (e) => {
    const idx = Number(e.target.closest(".ap-item")?.dataset.idx);
    if (Number.isInteger(idx)) choose(idx);
  });

  // clique fora fecha
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) close();
  });

  return { close, isOpen: () => !panel.hidden };
}
