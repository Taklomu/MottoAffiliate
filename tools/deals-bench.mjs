import { solveExact, toQubo, solveQuboBrute, applySet } from "../src/deals/optimizer.mjs";
const mk = (groups, per, seed = 7) => { let s = seed; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; const o = [];
  for (let g = 0; g < groups; g++) for (let k = 0; k < per; k++) o.push({ id: `g${g}k${k}`, group: g, stage: 1 + (g % 3),
    kind: r() < 0.5 ? "percent" : "fixed", value: 0, minSpend: r() < 0.5 ? Math.round(r() * 800) : 0 }), o.at(-1).value = o.at(-1).kind === "percent" ? 2 + Math.round(r() * 13) : 20 + Math.round(r() * 150), o.at(-1).cap = o.at(-1).kind === "percent" ? 50 + Math.round(r() * 150) : undefined;
  return o; };
console.log("ตัวแก้แบบแม่นยำ (ราคา 1,500 บาท):");
for (const [g, p] of [[3, 4], [6, 5], [8, 6], [10, 8]]) {
  const o = mk(g, p); const t = performance.now(); const r = solveExact(1500, o); const ms = performance.now() - t;
  console.log(`  ${o.length} ส่วนลด / ${g} กลุ่ม: ${r.visited.toLocaleString()} ชุด, ${ms.toFixed(1)} ms, ประหยัด ${r.saving.toFixed(2)}`);
}
console.log("\nQUBO (เชิงเส้น) เทียบตัวแก้แม่นยำ บนโจทย์เล็ก (brute force 2^n):");
let agree = 0, wrongTrue = 0, N = 200;
for (let t = 0; t < N; t++) {
  const o = mk(3, 3, t + 1).map((x) => ({ ...x, minSpend: 0, stage: 1 })); // ตัดข้อจำกัดที่ QUBO แทนไม่ได้
  const { Q, lin } = toQubo(1500, o); const q = solveQuboBrute(Q);
  const qSaving = o.reduce((a, x, i) => a + (q.x >> i & 1 ? lin[i] : 0), 0);
  // ราคาจริงของชุดที่ QUBO เลือก (คิดแบบต่อเนื่อง ไม่ใช่เชิงเส้น)
  const real = applySet(1500, o.filter((_, i) => q.x >> i & 1));
  const ex = solveExact(1500, o);
  if (Math.abs(ex.saving - (real?.saving ?? 0)) < 1e-6) agree++; else wrongTrue++;
}
console.log(`  ${N} โจทย์ (ไม่มีขั้นต่ำ/ไม่มีลำดับ แต่ percent ซ้อนกันได้): ชุดที่ QUBO เลือกเท่ากับค่าที่ดีที่สุดจริง ${agree} โจทย์, ต่างไป ${wrongTrue} โจทย์`);
console.log("  (ต่างเพราะ QUBO ถือว่า percent คิดจากราคาเต็ม ส่วนของจริงซ้อนกันแล้วราคาที่เหลือลดลง)");
