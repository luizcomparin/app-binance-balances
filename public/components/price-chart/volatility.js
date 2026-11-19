// Estatística de oscilação a partir da volatilidade histórica (funções puras, sem DOM).
// NÃO é previsão: assume que a moeda continua oscilando como no último ano e sem tendência
// (passeio aleatório lognormal). Serve para ter noção de "quanto costuma andar".

// Quantos dias de histórico entram no cálculo e o mínimo para ter algum sentido
const LOOKBACK_DAYS = 365;
const MIN_DAYS = 30;

// Distribuição normal acumulada Φ(x) (aproximação de Abramowitz-Stegun, erro < 1e-7)
function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Volatilidade diária (desvio padrão dos retornos log diários) a partir de velas diárias.
 * Retorna { sigmaDaily, days, price } ou null se o histórico for curto demais.
 */
export function dailyVolatility(dailyPoints) {
  const closes = dailyPoints.map((p) => p.close).filter((c) => c > 0).slice(-(LOOKBACK_DAYS + 1));
  if (closes.length < MIN_DAYS + 1) return null;

  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  const mean = returns.reduce((a, r) => a + r, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);

  return { sigmaDaily: Math.sqrt(variance), days: returns.length, price: closes.at(-1) };
}

// Volatilidade anualizada (%), a forma mais comum de comparar moedas (cripto opera 365 dias)
export function annualizedPct(sigmaDaily) {
  return sigmaDaily * Math.sqrt(365) * 100;
}

// Faixa de preço em `days` dias para z desvios: z=1 ≈ 68% dos casos, z=1.96 ≈ 95%
export function priceBand(price, sigmaDaily, days, z = 1) {
  const s = sigmaDaily * Math.sqrt(days) * z;
  return { low: price * Math.exp(-s), high: price * Math.exp(s) };
}

// Chance (0–1) de o preço *tocar* `target` em algum momento dos próximos `days` dias
// (princípio da reflexão, sem tendência): 2 · (1 − Φ(|ln(alvo/atual)| / (σ·√dias)))
export function touchProbability(price, target, sigmaDaily, days) {
  if (!price || !target || !sigmaDaily || !days) return null;
  const distance = Math.abs(Math.log(target / price));
  if (distance === 0) return 1;
  return Math.min(1, 2 * (1 - normCdf(distance / (sigmaDaily * Math.sqrt(days)))));
}
