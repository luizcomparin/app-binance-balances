import { state } from "../../core/state.js";
import { formatSigned, signClass } from "../../core/format.js";

export function renderAssetStrip(assets) {
  const list = document.getElementById("asset-strip-list");
  if (!list) return;

  if (!assets || !assets.length) {
    list.innerHTML = '<div class="asset-pill empty">Sem ativos.</div>';
    return;
  }

  const sortedAssets = [...assets].sort((a, b) => b.totalUSDT - a.totalUSDT);

  list.innerHTML = sortedAssets
    .map((asset) => {
      const pct = asset.pct ?? 0;
      const usdtValue = asset.totalUSDT ?? 0;
      const brlValue = state.usdtBrlPrice ? usdtValue * state.usdtBrlPrice : null;
      const brlText = state.usdtBrlPrice
        ? `${brlValue.toFixed(2).formatCurrency()} BRL`
        : "--";

      return `
        <div class="asset-pill">
          <div class="asset-pill-head">
            <span class="asset-symbol">${asset.asset}</span>
            <span class="asset-percent">${pct.toFixed(2)}%</span>
          </div>
          <div class="asset-values">
            <span class="asset-usdt">${usdtValue
              .toFixed(2)
              .formatCurrency()} USDT</span>
            <span class="asset-brl">${brlText}</span>
            ${
              asset.change24hPct === null || asset.change24hPct === undefined
                ? ""
                : `<span class="asset-change ${signClass(asset.change24hPct)}">${formatSigned(asset.change24hPct)}% 24h</span>`
            }
          </div>
        </div>
      `;
    })
    .join("");
}
