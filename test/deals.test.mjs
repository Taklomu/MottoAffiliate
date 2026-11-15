import test from "node:test";
import assert from "node:assert/strict";
import { applySet, solveExact, toQubo, solveQuboBrute } from "../src/deals/optimizer.mjs";

const rnd = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const gen = (seed, groups, per) => { const r = rnd(seed), o = [];
  for (let g = 0; g < groups; g++) for (let k = 0; k < per; k++) { const pct = r() < 0.5;
    o.push({ id: `g${g}k${k}`, group: g, stage: 1 + Math.floor(r() * 3), kind: pct ? "percent" : "fixed",
      value: pct ? 2 + Math.floor(r() * 13) : 20 + Math.floor(r() * 150), cap: pct ? 50 + Math.floor(r() * 150) : undefined,
      minSpend: r() < 0.5 ? Math.floor(r() * 900) : 0 }); }
  return o; };

test("applySet: เรียงตาม stage, เช็กขั้นต่ำกับราคาที่เหลือ, ชุดที่ใช้ไม่ได้คืน null", () => {
  const coupon = { id: "c", group: 1, stage: 1, kind: "fixed", value: 200, minSpend: 1000 };
  const card = { id: "k", group: 2, stage: 3, kind: "percent", value: 10, minSpend: 900 };
  assert.equal(applySet(1000, [card, coupon]), null);
  assert.equal(applySet(1000, [coupon]).final, 800);
  assert.equal(applySet(1300, [card, coupon]).final, 990); // 1300-200=1100, การ์ด 10% = 110
});

test("branch-and-bound ได้คำตอบเท่ากับการไล่ครบทุกชุด (60 โจทย์สุ่ม)", () => {
  for (let s = 1; s <= 60; s++) {
    const o = gen(s, 5, 3);
    const a = solveExact(1200, o), b = solveExact(1200, o, { prune: false });
    assert.ok(Math.abs(a.saving - b.saving) < 1e-9, `seed ${s}`);
    assert.ok(a.visited <= b.visited);
  }
});

test("ทุกกลุ่มถูกเลือกไม่เกิน 1 ตัว", () => {
  const o = gen(3, 6, 4), r = solveExact(1500, o);
  const groups = r.used.map((id) => o.find((x) => x.id === id).group);
  assert.equal(new Set(groups).size, groups.length);
});

test("QUBO เชิงเส้นตรงกับตัวแก้แม่นยำเมื่อส่วนลดเป็นเงินคงที่ล้วน และพลาดเมื่อ percent ซ้อนกัน", () => {
  const fixed = [
    { id: "a", group: 1, kind: "fixed", value: 100, stage: 1 }, { id: "b", group: 1, kind: "fixed", value: 150, stage: 1 },
    { id: "c", group: 2, kind: "fixed", value: 80, stage: 1 }
  ];
  const q = solveQuboBrute(toQubo(1000, fixed).Q);
  const picked = fixed.filter((_, i) => q.x >> i & 1).map((x) => x.id).sort();
  assert.deepEqual(picked, ["b", "c"]);
  assert.equal(solveExact(1000, fixed).saving, 230);
  // percent สองตัวต่างกลุ่ม: QUBO คิด 50%+50% = 100% ของราคาเต็ม แต่จริงซ้อนแล้วเหลือ 75% ของส่วนลด
  const pct = [{ id: "p", group: 1, kind: "percent", value: 50, stage: 1 }, { id: "q", group: 2, kind: "percent", value: 50, stage: 2 }];
  const qq = toQubo(1000, pct); const e = solveQuboBrute(qq.Q);
  assert.equal(-e.energy, 1000);
  assert.equal(solveExact(1000, pct).saving, 750);
});
