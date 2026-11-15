// วิเคราะห์ว่าทุกลำดับการวางไอเทมจบแบบไหนได้บ้าง (ลองครบทุกลำดับ: n! แบบ DFS)
// ใช้ตอน build เพื่อเตือนถ้ามีฉากจบที่เป็นไปไม่ได้เลย และใช้ในชุดทดสอบ
import { GrowEngine } from "./engine.mjs";

export function analyze(config, { limit = 9 } = {}) {
  const root = new GrowEngine(config);
  const n = root.available().length;
  if (n > limit) return { skipped: true, reason: `มี ${n} ไอเทม เกินเพดาน ${limit} (ลองทุกลำดับจะช้าเกินไป)` };
  const counts = Object.fromEntries(config.endings.map((e) => [e.id, 0]));
  const example = {};
  // เลเวลสูงสุดที่แต่ละไอเทมไปถึงได้ในลำดับใดลำดับหนึ่ง (ไว้หาคอขวดของเงื่อนไข)
  const reached = Object.fromEntries(root.available().map((id) => [id, 0]));
  let total = 0;
  const walk = (eng, order) => {
    const avail = eng.available();
    if (!avail.length) {
      total++;
      for (const id of Object.keys(reached)) reached[id] = Math.max(reached[id], eng.items[id].level);
      const end = eng.ending();
      counts[end]++;
      if (!example[end]) example[end] = order.slice();
      return;
    }
    for (const id of avail) {
      const next = eng.clone();
      next._place(id);
      order.push(id);
      walk(next, order);
      order.pop();
    }
  };
  walk(root, []);
  return { skipped: false, total, counts, example, reached };
}
