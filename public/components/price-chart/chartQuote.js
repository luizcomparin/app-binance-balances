// Moeda de cotação do gráfico de preço. Quase todas as moedas são vistas em USDT; o USDT é visto como
// USDT/BRL (par USDTBRL da Binance, sem inverter), e o BRL abre direto nesse par (o BRL/USDT invertido
// não aparece mais). Funções puras: a cotação USDT→BRL vem por parâmetro.

/** Moeda de cotação do gráfico de `asset` */
export const quoteOf = (asset) => (asset === "USDT" ? "BRL" : "USDT");

/** Moeda que o gráfico abre quando pedem `asset` (BRL → USDT, visto em USDT/BRL) */
export const chartAssetOf = (asset) => (asset === "BRL" ? "USDT" : asset);

/** Nome do par: "XRP/USDT", "USDT/BRL" (sep = separador, ex.: " / " no título) */
export const pairLabel = (asset, sep = "/") => `${asset}${sep}${quoteOf(asset)}`;

/**
 * Preço de uma ordem no gráfico de `asset`. Ordem na própria cotação do gráfico: o preço dela, sem
 * conversão. Senão converte pelo valor em USDT de agora (quotePriceUSDT = 1 unidade da cotação da ordem
 * em USDT; usdtBrl = preço do USDT em BRL). null sem cotação.
 */
export function orderPriceOnChart(asset, { price, quoteAsset, quotePriceUSDT }, usdtBrl) {
  if (!price) return null;
  const quote = quoteOf(asset);
  if (quoteAsset === quote) return price;
  if (quotePriceUSDT == null) return null;
  return fromUSDT(asset, price * Number(quotePriceUSDT), usdtBrl);
}

/** Valor em USDT → moeda de cotação do gráfico de `asset` (BRL pela cotação de agora); null sem cotação */
export function fromUSDT(asset, valueUSDT, usdtBrl) {
  if (valueUSDT == null) return null;
  if (quoteOf(asset) === "USDT") return valueUSDT;
  return usdtBrl ? valueUSDT * usdtBrl : null;
}

/**
 * Total de uma ordem executada na cotação do gráfico: na própria cotação, o total negociado (quoteQty);
 * senão o total em USDT da data da ordem, convertido. null sem cotação.
 */
export function executedTotalOnChart(asset, { quoteAsset, quoteQty, totalUSDT }, usdtBrl) {
  if (quoteAsset === quoteOf(asset)) return quoteQty ?? null;
  return fromUSDT(asset, totalUSDT, usdtBrl);
}
