// Delta de volume e CVD (Cumulative Volume Delta), a partir das velas da Binance.
//   delta da vela = compras agressivas (a mercado) − vendas agressivas = buyVolume − (volume − buyVolume)
//   CVD = soma acumulada dos deltas desde a primeira vela carregada (só a direção importa, não o nível)

/**
 * points = velas ({ volume, buyVolume }); devolve { delta, cvd }, alinhados às velas.
 * Vela sem buyVolume (ou sem volume): delta null, e o CVD repete o valor anterior (null antes do primeiro).
 */
export function volumeDelta(points) {
  const delta = [];
  const cvd = [];
  let sum = null;
  for (const p of points || []) {
    const ok = Number.isFinite(p?.buyVolume) && Number.isFinite(p?.volume);
    const d = ok ? 2 * p.buyVolume - p.volume : null;
    if (d !== null) sum = (sum ?? 0) + d;
    delta.push(d);
    cvd.push(sum);
  }
  return { delta, cvd };
}
