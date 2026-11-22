// cached() e mapLimit() (server/lib/cache.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cached, clearCache, mapLimit } from "../../server/lib/cache.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("chamadas simultâneas com a mesma chave compartilham a mesma execução", async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    await sleep(10);
    return "ok";
  };
  const [a, b] = await Promise.all([cached("t:simultaneas", 1000, fn), cached("t:simultaneas", 1000, fn)]);
  assert.equal(a, "ok");
  assert.equal(b, "ok");
  assert.equal(calls, 1);
});

test("o resultado vale pelo TTL e depois é recalculado", async () => {
  let calls = 0;
  const fn = async () => ++calls;
  assert.equal(await cached("t:ttl", 30, fn), 1);
  assert.equal(await cached("t:ttl", 30, fn), 1, "dentro do TTL");
  await sleep(40);
  assert.equal(await cached("t:ttl", 30, fn), 2, "depois do TTL");
});

test("erros não ficam em cache", async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls === 1) throw new Error("falhou");
    return "ok";
  };
  await assert.rejects(cached("t:erro", 1000, fn), /falhou/);
  assert.equal(await cached("t:erro", 1000, fn), "ok");
  assert.equal(calls, 2);
});

test("clearCache descarta tudo", async () => {
  let calls = 0;
  const fn = async () => ++calls;
  await cached("t:clear", 60000, fn);
  clearCache();
  assert.equal(await cached("t:clear", 60000, fn), 2);
});

test("mapLimit mantém a ordem e respeita o limite de concorrência", async () => {
  let active = 0;
  let maxActive = 0;
  const out = await mapLimit([5, 1, 4, 2, 3], 2, async (v, i) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(v * 3);
    active--;
    return v * 10 + i;
  });
  assert.deepEqual(out, [50, 11, 42, 23, 34]);
  assert.equal(maxActive, 2);
});

test("mapLimit com lista vazia", async () => {
  assert.deepEqual(await mapLimit([], 4, async () => 1), []);
});
