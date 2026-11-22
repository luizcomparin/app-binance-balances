// Preço médio dinâmico, P&L realizado, taxas e ciclos (server/services/positionMath.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePosition } from "../../server/services/positionMath.js";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} esperado ${b}, veio ${a}`);

// cotações fixas: USDT = 1, BRL = 0,2 USDT, BNB = 500 USDT
const RATES = { USDT: 1, BRL: 0.2, BNB: 500 };
const deps = {
  quoteAssetOf: (symbol) => (symbol.endsWith("BRL") ? "BRL" : "USDT"),
  rateAt: (asset) => RATES[asset] ?? 0,
};

let id = 0;
// trade de X/USDT: qty moedas a `price` USDT cada
const buy = (qty, price, extra = {}) => ({ id: ++id, time: id, symbol: "XUSDT", isBuyer: true, qty: String(qty), quoteQty: String(qty * price), commission: "0", commissionAsset: "USDT", ...extra });
const sell = (qty, price, extra = {}) => ({ ...buy(qty, price, extra), isBuyer: false });
const run = (trades) => computePosition("X", trades, deps);

test("compras: preço médio ponderado e total investido", () => {
  const p = run([buy(1, 100), buy(1, 200)]);
  close(p.trackedQty, 2);
  close(p.avgBuyPriceUSDT, 150);
  close(p.investedUSDT, 300);
  close(p.realizedPnlUSDT, 0);
  assert.equal(p.avgSellPriceUSDT, null);
});

test("venda: não muda o preço médio e gera realizado sobre o médio vigente", () => {
  const p = run([buy(1, 100), buy(1, 200), sell(1, 300)]);
  close(p.trackedQty, 1);
  close(p.avgBuyPriceUSDT, 150, "médio continua");
  close(p.realizedPnlUSDT, 150, "300 recebidos − 150 de custo");
  close(p.avgSellPriceUSDT, 300);
  close(p.soldQtyCycle, 1);
});

test("compras depois de vendas pesam mais no médio dinâmico", () => {
  // 2 a 100, vende 1 (médio continua 100 sobre 1), compra 1 a 200 → (100 + 200) / 2 = 150
  const p = run([buy(2, 100), sell(1, 150), buy(1, 200)]);
  close(p.avgBuyPriceUSDT, 150);
});

test("posição zerada: o médio recomeça e as vendas antigas saem da média de venda", () => {
  const zerada = run([buy(1, 100), sell(1, 200)]);
  assert.equal(zerada.avgBuyPriceUSDT, null);
  close(zerada.trackedQty, 0);
  close(zerada.realizedPnlUSDT, 100);

  const novoCiclo = run([buy(1, 100), sell(1, 200), buy(1, 50)]);
  close(novoCiclo.avgBuyPriceUSDT, 50);
  close(novoCiclo.soldQtyCycle, 0);
  assert.equal(novoCiclo.avgSellPriceUSDT, null);
  close(novoCiclo.realizedPnlUSDT, 100, "o realizado do ciclo anterior continua");
});

test("taxa paga na própria moeda reduz a quantidade", () => {
  const p = run([buy(1, 100, { commission: "0.001", commissionAsset: "X" })]);
  close(p.trackedQty, 0.999);
  close(p.avgBuyPriceUSDT, 100 / 0.999);
});

test("taxa em outra moeda (BNB) entra no custo, convertida para USDT", () => {
  const p = run([buy(1, 100, { commission: "0.01", commissionAsset: "BNB" })]);
  close(p.avgBuyPriceUSDT, 105, "100 + 0,01 BNB × 500");
  close(p.investedUSDT, 105);
});

test("taxa na venda sai do valor recebido", () => {
  const p = run([buy(1, 100), sell(1, 200, { commission: "2", commissionAsset: "USDT" })]);
  close(p.realizedPnlUSDT, 98);
  close(p.avgSellPriceUSDT, 198);
});

test("venda maior que o que os trades explicam (depósito): só a parte com custo conhecido entra no realizado", () => {
  const p = run([buy(1, 100), sell(2, 150)]);
  close(p.trackedQty, 0);
  close(p.realizedPnlUSDT, 50, "metade de 300 recebidos − 100 de custo");
});

test("par em BRL é convertido pela cotação da data", () => {
  const p = run([{ ...buy(1, 0), symbol: "XBRL", quoteQty: "500", commissionAsset: "BRL" }]);
  close(p.avgBuyPriceUSDT, 100, "500 BRL × 0,2");
});

test("sem trades", () => {
  const p = run([]);
  assert.equal(p.avgBuyPriceUSDT, null);
  assert.equal(p.trackedQty, 0);
});
