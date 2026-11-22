---
titulo: Faixa estatística (volatilidade histórica)
resumo: Camada que calcula a volatilidade diária do último ano e mostra a faixa típica (±1σ) e ampla (±1,96σ) em N dias, e a chance de tocar o preço médio; não é previsão.
arquivos: [public/components/price-chart/volatility.js, public/components/price-chart/PriceChartPanel.js]
rotas: [GET /price-chart/:asset]
eventos: []
storage: [priceChartStats, priceChartStatsDays]
---

# Faixa estatística

## O que faz

- O checkbox `#price-chart-stats` tem um horizonte de 1 a 365 dias (`#price-chart-stats-days`, padrão 30).
- No gráfico, aparecem duas linhas pontilhadas ±1σ ("Faixa Nd (alta/baixa)").
- A caixa `#price-chart-stats-box` mostra:
  - a volatilidade anual e diária;
  - a faixa típica (cerca de 68% das vezes) e a ampla (cerca de 95%), em preço e em %;
  - a chance aproximada de **tocar** o seu preço médio (e o médio projetado, se ligado) no horizonte;
  - um aviso de que **não é previsão**.

## Cálculo (`volatility.js`, funções puras)

- `dailyVolatility(points)`: retornos log dos fechamentos diários (até 365 dias, mínimo de 30), desvio padrão amostral → `{ sigmaDaily, days, price }` ou `null`.
- `annualizedPct(σ) = σ·√365·100` (cripto opera 365 dias).
- `priceBand(P, σ, n, z) = { low: P·e^(−zσ√n), high: P·e^(zσ√n) }`, um modelo lognormal sem tendência.
- `touchProbability(P, alvo, σ, n) = 2·(1 − Φ(|ln(alvo/P)| / (σ√n)))`, pelo princípio da reflexão. Φ usa a aproximação de Abramowitz-Stegun.

## Dados

`loadVolatility(asset)` usa `getKlines(asset, "1d")`, isto é, **sempre** velas diárias, independente da vela que está na tela. Recalcula ao trocar de moeda (se ligada) ou ao ligar.

## Como verificar

1. Ligue a camada em BTC, D, 1 ano.
2. Mude os dias para 7: a faixa estreita.
3. Com preço médio, aparece a "chance de tocar".
