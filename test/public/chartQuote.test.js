// Cotação do gráfico de preço: USDT/BRL para o USDT, USDT para as demais (public/components/price-chart/chartQuote.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartAssetOf,
  executedTotalOnChart,
  fromUSDT,
  orderPriceOnChart,
  pairLabel,
  quoteOf,
} from "../../public/components/price-chart/chartQuote.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `esperado ${b}, veio ${a}`);

test("quoteOf / chartAssetOf / pairLabel: USDT é visto em BRL, BRL abre no USDT/BRL", () => {
  assert.equal(quoteOf("BTC"), "USDT");
  assert.equal(quoteOf("USDT"), "BRL");
  assert.equal(chartAssetOf("BRL"), "USDT");
  assert.equal(chartAssetOf("XRP"), "XRP");
  assert.equal(pairLabel("USDT"), "USDT/BRL");
  assert.equal(pairLabel("ETH", " / "), "ETH / USDT");
});

test("fromUSDT: moedas em USDT não mudam; no USDT/BRL multiplica pela cotação", () => {
  assert.equal(fromUSDT("BTC", 100, 5), 100);
  assert.equal(fromUSDT("USDT", 100, 5), 500);
  assert.equal(fromUSDT("USDT", 100, 0), null); // sem cotação
  assert.equal(fromUSDT("BTC", null, 5), null);
});

test("orderPriceOnChart: ordem na cotação do gráfico usa o preço dela; outra cotação converte", () => {
  // USDTBRL a 5,40 BRL no gráfico USDT/BRL: o próprio preço
  assert.equal(orderPriceOnChart("USDT", { price: 5.4, quoteAsset: "BRL", quotePriceUSDT: 1 / 5.5 }, 5.5), 5.4);
  // XRPUSDT a 0,5: o próprio preço
  assert.equal(orderPriceOnChart("XRP", { price: 0.5, quoteAsset: "USDT", quotePriceUSDT: 1 }, 5.5), 0.5);
  // XRPBRL a 2,75 BRL (1 BRL = 0,2 USDT) no gráfico em USDT: 0,55 USDT
  close(orderPriceOnChart("XRP", { price: 2.75, quoteAsset: "BRL", quotePriceUSDT: 0.2 }, 5), 0.55);
  // sem cotação da moeda da ordem / sem preço
  assert.equal(orderPriceOnChart("XRP", { price: 2.75, quoteAsset: "BRL", quotePriceUSDT: null }, 5), null);
  assert.equal(orderPriceOnChart("XRP", { price: 0, quoteAsset: "USDT", quotePriceUSDT: 1 }, 5), null);
});

test("executedTotalOnChart: na cotação do gráfico usa o total negociado; senão o total em USDT convertido", () => {
  // compra de 100 USDT por 540 BRL: total 540 no gráfico USDT/BRL (não o valor em USDT do dia)
  assert.equal(executedTotalOnChart("USDT", { quoteAsset: "BRL", quoteQty: 540, totalUSDT: 98 }, 5.5), 540);
  // XRP comprado em BRL, gráfico em USDT: total em USDT da data
  assert.equal(executedTotalOnChart("XRP", { quoteAsset: "BRL", quoteQty: 540, totalUSDT: 98 }, 5.5), 98);
  assert.equal(executedTotalOnChart("XRP", { quoteAsset: "BRL", quoteQty: 540, totalUSDT: null }, 5.5), null);
});
