import { state } from "../../core/state.js";

let walletChart = null;
let walletBarChart = null;

export function renderWalletChart(assets) {
  const ctx = document.getElementById("walletChart");
  if (!ctx) return;

  const usdt = assets.find((a) => a.asset === "USDT");
  const btc = assets.find((a) => a.asset === "BTC");
  const xrp = assets.find((a) => a.asset === "XRP");
  const eth = assets.find((a) => a.asset === "ETH");
  const others = assets.filter(
    (a) =>
      a.asset !== "USDT" &&
      a.asset !== "BTC" &&
      a.asset !== "XRP" &&
      a.asset !== "ETH"
  );

  const labels = [];
  const data = [];
  const colors = [];
  const valueMap = new Map();

  if (usdt && usdt.pct > 0) {
    labels.push("USDT");
    data.push(usdt.pct);
    colors.push("rgba(77, 212, 255, 0.8)");
    valueMap.set("USDT", { pct: usdt.pct, usdt: usdt.totalUSDT });
  }

  if (btc && btc.pct > 0) {
    labels.push("BTC");
    data.push(btc.pct);
    colors.push("rgba(247, 147, 26, 0.8)");
    valueMap.set("BTC", { pct: btc.pct, usdt: btc.totalUSDT });
  }

  if (xrp && xrp.pct > 0) {
    labels.push("XRP");
    data.push(xrp.pct);
    colors.push("rgba(107, 242, 197, 0.8)");
    valueMap.set("XRP", { pct: xrp.pct, usdt: xrp.totalUSDT });
  }

  if (eth && eth.pct > 0) {
    labels.push("ETH");
    data.push(eth.pct);
    colors.push("rgba(138, 43, 226, 0.8)");
    valueMap.set("ETH", { pct: eth.pct, usdt: eth.totalUSDT });
  }

  const othersTotal = others.reduce((acc, a) => acc + a.pct, 0);
  if (othersTotal > 0) {
    labels.push("Outros");
    data.push(othersTotal);
    colors.push("rgba(155, 176, 214, 0.8)");
    const othersTotalUsdt = others.reduce((acc, a) => acc + a.totalUSDT, 0);
    valueMap.set("Outros", { pct: othersTotal, usdt: othersTotalUsdt });
  }

  if (walletChart) {
    walletChart.destroy();
  }

  walletChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: colors,
          borderColor: "#11172e",
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#e5ecff",
            padding: 15,
            font: {
              size: 13,
              family: "Manrope",
            },
          },
        },
        tooltip: {
          backgroundColor: "#11172e",
          titleColor: "#4dd4ff",
          bodyColor: "#e5ecff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const entry = valueMap.get(label);
              const pct = entry ? entry.pct : context.parsed || 0;
              const usdtValue = entry ? entry.usdt : 0;
              const brlValue = state.usdtBrlPrice
                ? usdtValue * state.usdtBrlPrice
                : null;
              const brlText = state.usdtBrlPrice
                ? `${brlValue.toFixed(2).formatCurrency()} BRL`
                : "--";
              return [
                ` ${label}: ${pct.toFixed(2)}%`,
                ` USDT: ${usdtValue.toFixed(2).formatCurrency()} USDT`,
                ` BRL: ${brlText}`,
              ];
            },
          },
        },
      },
    },
  });
}

export function renderWalletBarChart(assets) {
  const ctx = document.getElementById("walletBarChart");
  if (!ctx) return;

  const sortedAssets = [...assets].sort((a, b) => b.totalUSDT - a.totalUSDT);
  const totalWalletUsdt = assets.reduce((acc, a) => acc + a.totalUSDT, 0);
  const assetMap = new Map(sortedAssets.map((asset) => [asset.asset, asset]));

  const labels = sortedAssets.map((a) => a.asset);
  const data = sortedAssets.map((a) => a.totalUSDT);
  const colors = sortedAssets.map((a) => {
    if (a.asset === "USDT") return "rgba(77, 212, 255, 0.8)";
    if (a.asset === "BTC") return "rgba(247, 147, 26, 0.8)";
    if (a.asset === "XRP") return "rgba(107, 242, 197, 0.8)";
    if (a.asset === "ETH") return "rgba(138, 43, 226, 0.8)";
    return "rgba(155, 176, 214, 0.8)";
  });

  if (walletBarChart) {
    walletBarChart.destroy();
  }

  walletBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Valor em USDT",
          data: data,
          backgroundColor: colors,
          borderColor: "#11172e",
          borderWidth: 2,
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: "#11172e",
          titleColor: "#4dd4ff",
          bodyColor: "#e5ecff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const asset = assetMap.get(label);
              const usdtValue = asset ? asset.totalUSDT : context.parsed.x || 0;
              const pct = totalWalletUsdt
                ? (usdtValue / totalWalletUsdt) * 100
                : 0;
              const brlValue = state.usdtBrlPrice
                ? usdtValue * state.usdtBrlPrice
                : null;
              const brlText = state.usdtBrlPrice
                ? `${brlValue.toFixed(2).formatCurrency()} BRL`
                : "--";

              return [
                ` ${label}: ${pct.toFixed(2)}%`,
                ` USDT: ${usdtValue.toFixed(2).formatCurrency()} USDT`,
                ` BRL: ${brlText}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
          ticks: {
            color: "#9bb0d6",
            font: {
              size: 11,
              family: "Manrope",
            },
          },
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#e5ecff",
            font: {
              size: 12,
              family: "Manrope",
              weight: "600",
            },
          },
        },
      },
    },
  });
}
