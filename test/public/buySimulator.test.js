// Simulador de compra e preços médios projetados (public/components/price-chart/buySimulator.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { avgAfterBuys, avgAfterSells, buyToReachAvg } from "../../public/components/price-chart/buySimulator.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `esperado ${b}, veio ${a}`);

test("buyToReachAvg: quanto comprar a preço atual para o médio chegar no alvo", () => {
  // tem 1 a 100 de médio, preço atual 80: para médio 90 compra 80 USDT (1 moeda) → (100 + 80) / 2 = 90
  const r = buyToReachAvg(90, { avg: 100, qty: 1, price: 80 });
  assert.equal(r.reachable, true);
  close(r.usdt, 80);
  close(r.qty, 1);
  close((100 * 1 + r.usdt) / (1 + r.qty), 90);
});

test("buyToReachAvg: alvo fora do intervalo entre médio e preço é inalcançável", () => {
  assert.equal(buyToReachAvg(70, { avg: 100, qty: 1, price: 80 }).reachable, false, "abaixo do preço atual");
  assert.equal(buyToReachAvg(110, { avg: 100, qty: 1, price: 80 }).reachable, false, "acima do médio");
  assert.equal(buyToReachAvg(100, { avg: 100, qty: 1, price: 80 }).reachable, false, "o próprio médio");
  assert.equal(buyToReachAvg(90, { avg: null, qty: 1, price: 80 }), null, "sem preço médio");
});

test("avgAfterBuys: médio se as compras abertas executarem", () => {
  close(avgAfterBuys({ avg: 100, qty: 1 }, [{ qty: 1, priceUSDT: 80 }]), 90);
  close(avgAfterBuys({ avg: 100, qty: 2 }, [{ qty: 1, priceUSDT: 70 }, { qty: 1, priceUSDT: 50 }]), 80);
  assert.equal(avgAfterBuys({ avg: 100, qty: 1 }, []), null);
  assert.equal(avgAfterBuys({ avg: null, qty: 1 }, [{ qty: 1, priceUSDT: 80 }]), null);
});

test("avgAfterSells: médio de venda do ciclo somado às vendas abertas", () => {
  close(avgAfterSells({ avgSell: 200, soldQty: 1 }, [{ qty: 1, priceUSDT: 300 }]), 250);
  close(avgAfterSells({ avgSell: null, soldQty: 0 }, [{ qty: 2, priceUSDT: 300 }, { qty: 1, priceUSDT: 150 }]), 250, "sem vendas no ciclo");
  assert.equal(avgAfterSells({ avgSell: 200, soldQty: 1 }, []), null);
});
