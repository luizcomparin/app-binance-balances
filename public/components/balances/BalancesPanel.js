import { fetchBalances, fetchRaw } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { renderWalletBarChart, renderWalletChart } from "../charts/ChartsPanel.js";
import { renderAssetStrip } from "../asset-strip/AssetStrip.js";

export async function loadBalances() {
  const tbody = document.querySelector("#table-body-balances");
  const summaryTbody = document.querySelector("#table-body-asset-stats");

  if (tbody) {
    tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";
  }
  if (summaryTbody) {
    summaryTbody.innerHTML = "<tr><td colspan='6'>Carregando...</td></tr>";
  }

  try {
    const [data] = await Promise.all([
      fetchBalances(),
      fetchRaw(),
    ]);

    const totalUsdt = data.total_usdt.toFixed(2);
    state.usdtBrlPrice = Number(data.usdt_brl_price || 0);

    if (tbody) {
      tbody.innerHTML = "";
      data.assets.forEach((asset) => {
        tbody.innerHTML += `
          <tr>
            <td>${asset.asset}</td>
            <td>${asset.pct.toFixed(2)}%</td>
            <td>${asset.freeUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.lockedUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.totalUSDT.toFixed(2).formatCurrency()} USDT</td>
          </tr>
        `;
      });
    }

    state.currentAssets = data.assets;

    const totalBalanceDivs = document.querySelectorAll("#total-balance");
    const totalBrlDiv = document.getElementById("total-brl");
    totalBalanceDivs.forEach((totalBalanceDiv) => {
      totalBalanceDiv.innerText = `${totalUsdt.formatCurrency()} USDT`;
    });

    const usdtPercentDiv = document.getElementById("usdt-percent");
    const btcPercentDiv = document.getElementById("btc-percent");
    const xrpPercentDiv = document.getElementById("xrp-percent");
    const ethPercentDiv = document.getElementById("eth-percent");
    const othersPercentDiv = document.getElementById("others-percent");
    const usdtUsdtDiv = document.getElementById("usdt-usdt");
    const btcUsdtDiv = document.getElementById("btc-usdt");
    const xrpUsdtDiv = document.getElementById("xrp-usdt");
    const ethUsdtDiv = document.getElementById("eth-usdt");
    const othersUsdtDiv = document.getElementById("others-usdt");
    const usdtBrlDiv = document.getElementById("usdt-brl");
    const btcBrlDiv = document.getElementById("btc-brl");
    const xrpBrlDiv = document.getElementById("xrp-brl");
    const ethBrlDiv = document.getElementById("eth-brl");
    const othersBrlDiv = document.getElementById("others-brl");

    const usdtAsset = data.assets.find((a) => a.asset === "USDT");
    const btcAsset = data.assets.find((a) => a.asset === "BTC");
    const xrpAsset = data.assets.find((a) => a.asset === "XRP");
    const ethAsset = data.assets.find((a) => a.asset === "ETH");
    const othersTotalUsdt = data.assets
      .filter(
        (a) =>
          a.asset !== "USDT" &&
          a.asset !== "BTC" &&
          a.asset !== "XRP" &&
          a.asset !== "ETH"
      )
      .reduce((acc, a) => acc + a.totalUSDT, 0);

    if (usdtPercentDiv) {
      usdtPercentDiv.innerText = `${usdtAsset?.pct.toFixed(2) || 0}%`;
    }
    if (btcPercentDiv) {
      btcPercentDiv.innerText = `${btcAsset?.pct.toFixed(2) || 0}%`;
    }
    if (xrpPercentDiv) {
      xrpPercentDiv.innerText = `${xrpAsset?.pct.toFixed(2) || 0}%`;
    }
    if (ethPercentDiv) {
      ethPercentDiv.innerText = `${ethAsset?.pct.toFixed(2) || 0}%`;
    }
    if (othersPercentDiv) {
      othersPercentDiv.innerText = `${data.assets
        .filter(
          (a) =>
            a.asset !== "USDT" &&
            a.asset !== "BTC" &&
            a.asset !== "XRP" &&
            a.asset !== "ETH"
        )
        .reduce((acc, a) => acc + a.pct, 0)
        .toFixed(2)}%`;
    }
    if (usdtUsdtDiv) {
      usdtUsdtDiv.innerText = `${
        usdtAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
      } USDT`;
    }
    if (btcUsdtDiv) {
      btcUsdtDiv.innerText = `${
        btcAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
      } USDT`;
    }
    if (xrpUsdtDiv) {
      xrpUsdtDiv.innerText = `${
        xrpAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
      } USDT`;
    }
    if (ethUsdtDiv) {
      ethUsdtDiv.innerText = `${
        ethAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
      } USDT`;
    }
    if (othersUsdtDiv) {
      othersUsdtDiv.innerText = `${othersTotalUsdt
        .toFixed(2)
        .formatCurrency()} USDT`;
    }

    const setBrlValue = (element, usdtValue) => {
      if (!element) return;
      if (!state.usdtBrlPrice) {
        element.innerText = "--";
        return;
      }
      const brl = usdtValue * state.usdtBrlPrice;
      element.innerText = `${brl.toFixed(2).formatCurrency()} BRL`;
    };

    setBrlValue(totalBrlDiv, Number(data.total_usdt || 0));
    setBrlValue(usdtBrlDiv, Number(usdtAsset?.totalUSDT || 0));
    setBrlValue(btcBrlDiv, Number(btcAsset?.totalUSDT || 0));
    setBrlValue(xrpBrlDiv, Number(xrpAsset?.totalUSDT || 0));
    setBrlValue(ethBrlDiv, Number(ethAsset?.totalUSDT || 0));
    setBrlValue(othersBrlDiv, Number(othersTotalUsdt || 0));

    renderWalletChart(data.assets);
    renderWalletBarChart(data.assets);
    renderAssetStrip(data.assets);
  } catch (e) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Erro: ${e}</td></tr>`;
    }
    if (summaryTbody) {
      summaryTbody.innerHTML = `<tr><td colspan="6" style="color:red;">Erro: ${e}</td></tr>`;
    }
  }
}

export function mapQuantities(rawBalances = []) {
  return rawBalances.reduce((acc, item) => {
    const qty = Number(item.free) + Number(item.locked);
    if (qty > 0) acc[item.asset] = qty;
    return acc;
  }, {});
}
