import { fetchBalances, fetchPositions } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { formatPrice, formatQty, formatSigned, signClass } from "../../core/format.js";
import { toggleSort, compareValues } from "../../core/sort.js";
import { renderWalletBarChart, renderWalletChart } from "../charts/ChartsPanel.js";
import { renderAssetStrip } from "../asset-strip/AssetStrip.js";
import { renderOrderSimulation } from "../orders/OrdersPanel.js";

const BALANCE_COLUMNS = 12;
// moedas com card fixo no topo (o restante entra em "Outros")
const FIXED_CARD_ASSETS = ["USDT", "BTC", "XRP", "ETH"];
// abaixo disso, parte relevante da quantidade não veio de trades (depósito, Convert, Earn...)
const LOW_COVERAGE = 0.95;

export async function loadBalances() {
  const tbody = document.querySelector("#table-body-balances");

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan='${BALANCE_COLUMNS}'>Carregando...</td></tr>`;
  }

  // P&L é mais lento (histórico de trades): dispara em paralelo sem travar a tela
  loadPositions();

  try {
    const data = await fetchBalances();
    if (data.error) throw new Error(data.error);

    state.usdtBrlPrice = Number(data.usdt_brl_price || 0);
    state.currentAssets = data.assets.slice();
    mergePositions();

    renderBalances();
    renderUnpricedNote(data.unpriced);
    renderStatCards(data);
    renderPnlSummary();
    renderWalletChart(data.assets);
    renderWalletBarChart(data.assets);
    renderAssetStrip(data.assets);
    // a simulação das ordens abertas usa o saldo atual; recalcula se as ordens já chegaram
    renderOrderSimulation();
  } catch (e) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${BALANCE_COLUMNS}" style="color:red;">Erro: ${e.message || e}</td></tr>`;
    }
  }
}

let positionsRequest = null;

async function loadPositions() {
  if (positionsRequest) return positionsRequest;

  const status = document.getElementById("positions-status");
  setPnlSummaryLoading(true);

  if (status) {
    status.hidden = true;
    status.classList.remove("error");
    status.textContent = "";
  }

  positionsRequest = fetchPositions()
    .then((data) => {
      state.positions = data.positions || {};
      state.positionsTotals = data.totals || null;
      mergePositions();
      renderBalances();
      renderPnlSummary();

      if (status) {
        const errorCount = data.errors?.length || 0;
        status.hidden = !errorCount;
        status.textContent = errorCount
          ? `P&L calculado, mas ${errorCount} par(es) falharam ao buscar trades.`
          : "";
      }
    })
    .catch((e) => {
      state.positionsTotals = null;
      const detail = document.getElementById("pnl-detail");
      if (detail) detail.innerText = "Falha ao calcular o P&L.";

      if (status) {
        status.hidden = false;
        status.classList.add("error");
        status.textContent = `Não foi possível calcular o P&L: ${e.message}`;
      }
    })
    .finally(() => {
      setPnlSummaryLoading(false);
      positionsRequest = null;
    });

  return positionsRequest;
}

// Junta os dados de /positions em cada linha de saldo (para exibir e ordenar)
function mergePositions() {
  state.currentAssets = state.currentAssets.map((asset) => {
    const p = state.positions[asset.asset];
    return {
      ...asset,
      avgBuyPriceUSDT: p?.avgBuyPriceUSDT ?? null,
      costBasisUSDT: p?.costBasisUSDT ?? null,
      unrealizedPnlUSDT: p?.unrealizedPnlUSDT ?? null,
      unrealizedPnlPct: p?.unrealizedPnlPct ?? null,
      realizedPnlUSDT: p ? p.realizedPnlUSDT : null,
      coverage: p?.coverage ?? null,
      tradesCount: p?.tradesCount ?? null,
    };
  });
}

function brlText(usdtValue) {
  if (!state.usdtBrlPrice) return "--";
  return `${(usdtValue * state.usdtBrlPrice).toFixed(2).formatCurrency()} BRL`;
}

function change24hHtml(pct, usdt) {
  if (pct === null || pct === undefined) return "";
  const usdtPart =
    usdt === null || usdt === undefined ? "" : ` (${formatSigned(usdt)} USDT)`;
  return `<span class="${signClass(pct)}">${formatSigned(pct)}%</span>${usdtPart} <span class="muted">24h</span>`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// Cards fixos do topo: total, USDT, BTC, XRP, ETH e "Outros"
function renderStatCards(data) {
  const totalUSDT = Number(data.total_usdt || 0);

  document.querySelectorAll("#total-balance").forEach((el) => {
    el.innerText = `${totalUSDT.toFixed(2).formatCurrency()} USDT`;
  });
  setText("total-brl", brlText(totalUSDT));
  setHtml("total-change-24h", change24hHtml(data.change_24h_pct, data.change_24h_usdt));

  for (const symbol of FIXED_CARD_ASSETS) {
    const key = symbol.toLowerCase();
    const asset = data.assets.find((a) => a.asset === symbol);
    const usdt = Number(asset?.totalUSDT || 0);

    setText(`${key}-percent`, `${asset?.pct.toFixed(2) || 0}%`);
    setText(`${key}-usdt`, `${usdt.toFixed(2).formatCurrency()} USDT`);
    setText(`${key}-brl`, brlText(usdt));
    setHtml(`${key}-change-24h`, change24hHtml(asset?.change24hPct, asset?.change24hUSDT));
  }

  const others = data.assets.filter((a) => !FIXED_CARD_ASSETS.includes(a.asset));
  const othersUSDT = others.reduce((acc, a) => acc + a.totalUSDT, 0);
  const othersPct = others.reduce((acc, a) => acc + a.pct, 0);
  const othersWithChange = others.filter((a) => a.change24hUSDT !== null);
  const othersChangeUSDT = othersWithChange.reduce((acc, a) => acc + a.change24hUSDT, 0);
  const othersValue24hAgo = othersWithChange.reduce(
    (acc, a) => acc + a.totalUSDT - a.change24hUSDT,
    0
  );

  setText("others-percent", `${othersPct.toFixed(2)}%`);
  setText("others-usdt", `${othersUSDT.toFixed(2).formatCurrency()} USDT`);
  setText("others-brl", brlText(othersUSDT));
  setHtml(
    "others-change-24h",
    change24hHtml(
      othersValue24hAgo ? (othersChangeUSDT / othersValue24hAgo) * 100 : null,
      othersWithChange.length ? othersChangeUSDT : null
    )
  );
}

function setPnlSummaryLoading(isLoading) {
  document.getElementById("pnl-summary")?.classList.toggle("is-loading", isLoading);
}

// Resumo de P&L no cabeçalho da aba "Saldos por moeda"
function renderPnlSummary() {
  const totals = state.positionsTotals;
  const valueEl = document.getElementById("pnl-total");
  const pctEl = document.getElementById("pnl-pct");
  const brlEl = document.getElementById("pnl-brl");
  const detailEl = document.getElementById("pnl-detail");
  if (!totals || !valueEl) return;

  const cls = signClass(totals.unrealizedPnlUSDT);
  valueEl.className = cls;
  valueEl.innerText = `${formatSigned(totals.unrealizedPnlUSDT)} USDT`;

  if (pctEl) {
    pctEl.className = cls;
    pctEl.innerText =
      totals.unrealizedPnlPct === null ? "" : `(${formatSigned(totals.unrealizedPnlPct)}%)`;
  }
  if (brlEl) {
    brlEl.innerText = state.usdtBrlPrice
      ? `${formatSigned(totals.unrealizedPnlUSDT * state.usdtBrlPrice)} BRL`
      : "--";
  }
  if (detailEl) {
    detailEl.innerText =
      `Custo: ${totals.costBasisUSDT.formatCurrency()} USDT · ` +
      `Realizado: ${formatSigned(totals.realizedPnlUSDT)} USDT`;
  }
}

function renderUnpricedNote(unpriced = []) {
  const note = document.getElementById("unpriced-note");
  if (!note) return;

  if (!unpriced.length) {
    note.hidden = true;
    note.textContent = "";
    return;
  }

  const list = unpriced.map((u) => `${u.asset} (${u.qty})`).join(", ");
  note.textContent = `Sem cotação encontrada, fora do total: ${list}`;
  note.hidden = false;
}

export function sortBalances(key) {
  toggleSort(state.balanceSort, key);
  renderBalances();
}

function renderBalances() {
  const tbody = document.querySelector("#table-body-balances");
  if (!tbody) return;

  const assets = Array.isArray(state.currentAssets)
    ? [...state.currentAssets]
    : [];

  if (state.balanceSort?.key) {
    const { key, asc } = state.balanceSort;
    assets.sort((a, b) => {
      // valores ausentes (sem P&L, ex.: USDT/BRL) sempre no fim
      const aMissing = a[key] === null || a[key] === undefined;
      const bMissing = b[key] === null || b[key] === undefined;
      if (aMissing || bMissing) return aMissing - bMissing;
      return compareValues(a[key], b[key], asc);
    });
  }

  if (!assets.length) {
    tbody.innerHTML = `<tr><td colspan='${BALANCE_COLUMNS}'>Nenhum saldo encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = assets
    .map((asset) => {
      const lowCoverage =
        asset.avgBuyPriceUSDT !== null &&
        asset.coverage !== null &&
        asset.coverage < LOW_COVERAGE;
      const coverageHint = lowCoverage
        ? ` <span class="coverage-warn" title="Só ${(asset.coverage * 100).toFixed(0)}% da quantidade atual vem de trades na Binance; o restante (depósito, Convert, Earn...) foi considerado com o mesmo preço médio.">⚠</span>`
        : "";
      const pnlClass = signClass(asset.unrealizedPnlUSDT);
      const change24h =
        asset.change24hPct === null || asset.change24hPct === undefined
          ? "--"
          : `${formatSigned(asset.change24hPct)}%`;

      return `
          <tr>
            <td>${
              asset.asset === "USDT"
                ? asset.asset
                : `<button class="asset-link" title="Ver gráfico de preço" onclick="openPriceChart('${asset.asset}')">${asset.asset}</button>`
            }</td>
            <td>${asset.pct.toFixed(2)}%</td>
            <td>${formatQty(asset.qty)}</td>
            <td>${formatPrice(asset.priceUSDT)}</td>
            <td class="${signClass(asset.change24hPct)}">${change24h}</td>
            <td>${formatPrice(asset.avgBuyPriceUSDT)}${coverageHint}</td>
            <td>${asset.freeUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.lockedUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.totalUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td class="${pnlClass}">${formatSigned(asset.unrealizedPnlUSDT)}</td>
            <td class="${pnlClass}">${
              asset.unrealizedPnlPct === null ? "--" : `${formatSigned(asset.unrealizedPnlPct)}%`
            }</td>
            <td class="${signClass(asset.realizedPnlUSDT)}">${formatSigned(asset.realizedPnlUSDT)}</td>
          </tr>
        `;
    })
    .join("");
}
