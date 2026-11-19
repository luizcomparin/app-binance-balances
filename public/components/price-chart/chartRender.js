// Montagem do gráfico de preço no Chart.js: linha ou velas, preço médio, suas ordens, tooltip e eixos.
import { formatPrice, formatQty } from "../../core/format.js";

const CANDLE_UP = "rgba(82, 255, 168, 1)";
const CANDLE_DOWN = "rgba(255, 114, 114, 1)";

/**
 * Interação do gráfico:
 *  - mouse em cima de um ponto de ordem → só esse(s) ponto(s) (tooltip com detalhes da ordem);
 *  - senão → a vela/ponto sob o mouse em todos os datasets de preço.
 * O modo "index" padrão não serve: ele casa pela posição no array, e os marcadores
 * têm arrays próprios (o 3º marcador não é a 3ª vela).
 */
if (!Chart.Interaction.modes.priceChart) {
  Chart.Interaction.modes.priceChart = function (chart, e, options, useFinalPosition) {
    const hits = Chart.Interaction.modes.point(chart, e, { intersect: true }, useFinalPosition).filter(
      (item) => chart.data.datasets[item.datasetIndex]?.myOrders
    );
    if (hits.length) return hits;

    const { chartArea, scales } = chart;
    if (e.x < chartArea.left || e.x > chartArea.right) return [];
    const last = chart.data.labels.length - 1;
    const index = Math.max(0, Math.min(last, Math.round(scales.x.getValueForPixel(e.x))));

    return chart
      .getSortedVisibleDatasetMetas()
      .filter((meta) => !chart.data.datasets[meta.index].myOrders && meta.data[index])
      .map((meta) => ({ element: meta.data[index], datasetIndex: meta.index, index }));
  };
}

const formatDateTime = (time) =>
  new Date(time).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatPct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2).formatCurrency()}%`;

// Linhas do tooltip de uma ordem sua (hover no ponto)
function orderDetails(m, currentPrice) {
  const o = m.order;
  const lines = [
    ` Par: ${o.baseAsset}/${o.quoteAsset}`,
    ` Quantidade: ${formatQty(o.qty)} ${o.baseAsset}`,
  ];
  if (o.quoteAsset !== "USDT") {
    lines.push(` Preço: ${formatPrice(o.avgPrice)} ${o.quoteAsset} (≈ ${formatPrice(m.y)} USDT)`);
    lines.push(` Total: ${formatPrice(o.quoteQty)} ${o.quoteAsset} (≈ ${o.totalUSDT.toFixed(2).formatCurrency()} USDT)`);
  } else {
    lines.push(` Preço: ${formatPrice(m.y)} USDT`);
    lines.push(` Total: ${o.totalUSDT.toFixed(2).formatCurrency()} USDT`);
  }
  if (o.feeUSDT) lines.push(` Taxa: ≈ ${formatPrice(o.feeUSDT)} USDT`);
  if (o.fills > 1) lines.push(` Executada em ${o.fills} partes`);

  if (currentPrice) {
    const diff = ((currentPrice - m.y) / m.y) * 100;
    if (o.side === "BUY") {
      // quanto essa compra vale hoje
      const nowUSDT = o.qty * currentPrice;
      lines.push(` Hoje: ${formatPct(diff)} (${nowUSDT.toFixed(2).formatCurrency()} USDT)`);
    } else {
      // se não tivesse vendido: positivo = vendeu cedo demais, negativo = vendeu bem
      lines.push(` Preço atual vs. venda: ${formatPct(diff)}`);
    }
  }
  return lines;
}

function formatLabel(time, interval) {
  const date = new Date(time);
  if (interval === "1h" || interval === "4h") {
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR");
}

function priceDatasets(asset, points, candle) {
  if (!candle) {
    return [
      {
        label: `${asset} (USDT)`,
        data: points.map((p) => p.close),
        borderColor: "rgba(77, 212, 255, 1)",
        backgroundColor: "rgba(77, 212, 255, 0.12)",
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.15,
      },
    ];
  }

  const colors = points.map((p) => (p.close >= p.open ? CANDLE_UP : CANDLE_DOWN));
  return [
    {
      type: "bar",
      label: `${asset} (USDT)`,
      ohlc: points,
      // corpo da vela = barra flutuante de abertura até fechamento
      data: points.map((p) => [p.open, p.close]),
      backgroundColor: colors,
      borderColor: colors,
      borderWidth: 0,
      borderSkipped: false,
      minBarLength: 1,
      categoryPercentage: 0.9,
      barPercentage: 0.8,
      grouped: false,
      order: 1,
    },
    {
      // pavio (mínima → máxima) como barra fina sobreposta, atrás do corpo
      type: "bar",
      label: "Pavio",
      isWick: true,
      data: points.map((p) => [p.low, p.high]),
      backgroundColor: colors,
      borderWidth: 0,
      barThickness: 1,
      grouped: false,
      order: 2,
    },
  ];
}

function markerDataset(label, markers, labels, color) {
  return {
    type: "line",
    label,
    myOrders: true,
    // x = rótulo da vela (o eixo de categorias resolve número como posição no array, não como índice)
    data: markers.map((m) => ({ ...m, x: labels[m.idx] })),
    showLine: false,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointHitRadius: 4,
    pointBackgroundColor: color,
    pointBorderColor: "#0b1024",
    pointBorderWidth: 1.5,
    backgroundColor: color,
    borderColor: color,
    order: -1, // por cima de tudo
  };
}

function orderLine(m) {
  const o = m.order;
  return `● ${o.side === "BUY" ? "Compra" : "Venda"} ${formatDateTime(o.time)}: ${formatQty(o.qty)} ${o.baseAsset} a ${formatPrice(m.y)} (${o.totalUSDT.toFixed(2).formatCurrency()} USDT)`;
}

/**
 * Desenha o gráfico e devolve a nova instância do Chart.js (destrói a anterior).
 * opts = { asset, points, interval, mode, avg, orders: { buys, sells }, tooltipEnabled, plugins }
 */
export function renderPriceChart(canvas, previous, opts) {
  const { asset, points, interval, mode, avg, orders, tooltipEnabled, plugins = [] } = opts;
  const labels = points.map((p) => formatLabel(p.time, interval));
  const candle = mode === "candle";
  const { buys, sells } = orders;
  const currentPrice = points.at(-1)?.close ?? null;
  let markerHoverCount = 0;

  const datasets = priceDatasets(asset, points, candle);

  if (avg !== null && avg !== undefined) {
    datasets.push({
      label: "Seu preço médio",
      data: points.map(() => avg),
      borderColor: "rgba(247, 147, 26, 0.95)",
      borderWidth: 2,
      borderDash: [6, 6],
      pointRadius: 0,
      fill: false,
    });
  }

  // suas compras (verde) e vendas (vermelho), no preço médio de execução da ordem
  if (buys.length) datasets.push(markerDataset("Suas compras", buys, labels, "#52ffa8"));
  if (sells.length) datasets.push(markerDataset("Suas vendas", sells, labels, "#ff7272"));

  if (previous) previous.destroy();

  return new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    plugins,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "priceChart", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: "#e5ecff",
            font: { family: "Manrope" },
            filter: (item, data) => !data.datasets[item.datasetIndex]?.isWick,
          },
        },
        tooltip: {
          enabled: tooltipEnabled,
          filter: (item) => !item.dataset.isWick,
          backgroundColor: "#11172e",
          titleColor: "#4dd4ff",
          bodyColor: "#e5ecff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (items) => {
              // o título é gerado antes dos labels: guarda quantas ordens estão sob o mouse
              markerHoverCount = items[0]?.dataset.myOrders ? items.length : 0;
              const m = items[0]?.raw;
              if (items[0]?.dataset.myOrders && m?.order) {
                return items.length > 1
                  ? `${items.length} ordens neste ponto`
                  : `${m.order.side === "BUY" ? "Compra" : "Venda"} · ${formatDateTime(m.order.time)}`;
              }
              return items[0]?.label ?? "";
            },
            // hover na vela: lista resumida das suas ordens daquela vela
            afterBody: (items) => {
              if (items[0]?.dataset.myOrders) return [];
              const idx = items[0]?.dataIndex;
              if (idx === undefined) return [];
              const lines = [...buys, ...sells].filter((m) => m.idx === idx).map(orderLine);
              return lines.length ? ["", ...lines] : [];
            },
            label: (context) => {
              const m = context.raw;
              if (context.dataset.myOrders && m?.order) {
                const details = orderDetails(m, currentPrice);
                // várias ordens sobrepostas: identifica cada uma
                return markerHoverCount > 1
                  ? [`${m.order.side === "BUY" ? "Compra" : "Venda"} · ${formatDateTime(m.order.time)}`, ...details, ""]
                  : details;
              }
              const p = context.dataset.ohlc?.[context.dataIndex];
              if (p) {
                const chg = p.open ? ((p.close - p.open) / p.open) * 100 : 0;
                return [
                  ` Abertura: ${formatPrice(p.open)}`,
                  ` Máxima: ${formatPrice(p.high)}`,
                  ` Mínima: ${formatPrice(p.low)}`,
                  ` Fechamento: ${formatPrice(p.close)} (${chg >= 0 ? "+" : ""}${chg.toFixed(2).formatCurrency()}%)`,
                ];
              }
              return ` ${context.dataset.label}: ${formatPrice(context.parsed.y)} USDT`;
            },
          },
        },
      },
      scales: {
        x: {
          offset: candle,
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#9bb0d6", maxTicksLimit: 8, font: { family: "Manrope", size: 11 } },
        },
        y: {
          beginAtZero: false,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: {
            color: "#9bb0d6",
            font: { family: "Manrope", size: 11 },
            callback: (value) => formatPrice(value),
          },
        },
      },
    },
  });
}
