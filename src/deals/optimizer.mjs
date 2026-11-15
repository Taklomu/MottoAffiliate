// ตัวหาชุดส่วนลดที่คุ้มสุด (deal stacking) — ต้นแบบ ยังไม่ผูกกับหน้าเว็บ
// โมเดล: ส่วนลดแต่ละตัวมี group (เลือกได้สูงสุด 1 ตัวต่อกลุ่ม), stage (ใช้เรียงตามลำดับ 1→2→3),
// kind fixed|percent, minSpend (เทียบกับราคาที่เหลือ ณ stage นั้น), cap (เพดานของ percent)
export function applySet(price, chosen) {
  let p = price;
  const used = [];
  for (const o of [...chosen].sort((a, b) => a.stage - b.stage || (a.id < b.id ? -1 : 1))) {
    if (p < (o.minSpend || 0)) return null; // ชุดนี้ใช้ไม่ได้
    let s = o.kind === "percent" ? (p * o.value) / 100 : o.value;
    if (o.cap != null) s = Math.min(s, o.cap);
    s = Math.min(s, p);
    p -= s; used.push(o.id);
  }
  return { final: p, saving: price - p, used };
}

// ตัวแก้แบบแม่นยำ: เลือก 0-1 ตัวต่อกลุ่ม ไล่แบบ branch-and-bound
// ขอบบน: saving ของแต่ละตัวไม่มีทางเกินค่าที่คิดจากราคาเต็ม (ราคาลดลงเรื่อยๆ ส่วนลด % ย่อมไม่เพิ่ม)
// ค่า "ที่เลือกแล้ว + ขอบบนของกลุ่มที่เหลือ" จึงเป็นขอบบนของคำตอบ ถ้ายังไม่ชนะชุดที่ดีที่สุดก็ตัดทิ้งได้
export function solveExact(price, offers, { prune = true } = {}) {
  const groups = new Map();
  for (const o of offers) { if (!groups.has(o.group)) groups.set(o.group, []); groups.get(o.group).push(o); }
  const ub = (o) => Math.min(o.kind === "percent" ? (price * o.value) / 100 : o.value, o.cap ?? Infinity, price);
  const gs = [...groups.values()].map((g) => ({ offers: g, max: Math.max(...g.map(ub)) })).sort((a, b) => b.max - a.max);
  const suffix = new Array(gs.length + 1).fill(0);
  for (let i = gs.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + gs[i].max;
  let best = { saving: 0, final: price, used: [] }, visited = 0;
  const go = (i, chosen, soFar) => {
    if (prune && soFar + suffix[i] <= best.saving + 1e-9) return;
    if (i === gs.length) { visited++; const r = applySet(price, chosen); if (r && r.saving > best.saving + 1e-9) best = r; return; }
    for (const o of gs[i].offers) { chosen.push(o); go(i + 1, chosen, soFar + ub(o)); chosen.pop(); }
    go(i + 1, chosen, soFar);
  };
  go(0, [], 0);
  return { ...best, visited };
}

// QUBO แบบ "เชิงเส้น": ใช้ได้เฉพาะเมื่อส่วนลดคำนวณจากราคาเต็มและไม่มี minSpend/ลำดับ
export function toQubo(price, offers, penalty) {
  const n = offers.length;
  const lin = offers.map((o) => (o.kind === "percent" ? Math.min((price * o.value) / 100, o.cap ?? Infinity) : o.value));
  const A = penalty ?? 2 * Math.max(...lin, 1);
  const Q = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) Q[i][i] = -lin[i];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (offers[i].group === offers[j].group) Q[i][j] = A;
  return { Q, lin };
}
export function solveQuboBrute(Q) {
  const n = Q.length; let bestE = Infinity, bestX = 0;
  for (let m = 0; m < 1 << n; m++) {
    let e = 0;
    for (let i = 0; i < n; i++) if (m >> i & 1) { e += Q[i][i]; for (let j = i + 1; j < n; j++) if (m >> j & 1) e += Q[i][j]; }
    if (e < bestE) { bestE = e; bestX = m; }
  }
  return { energy: bestE, x: bestX };
}
