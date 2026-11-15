// รัน: node tools/grow-analyze.mjs [ไฟล์ config]   (ค่าเริ่มต้น data/island.json)
import fs from "node:fs";
import { analyze } from "../src/grow/analyze.mjs";
const file = process.argv[2] || new URL("../data/island.json", import.meta.url).pathname;
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const t = Date.now();
const r = analyze(cfg);
if (r.skipped) { console.log("ข้าม:", r.reason); process.exit(0); }
console.log(`ลองครบ ${r.total.toLocaleString()} ลำดับ ใน ${Date.now() - t} ms`);
for (const [id, c] of Object.entries(r.counts)) {
  console.log(`  ${id.padEnd(18)} ${String(c).padStart(6)}  (${((c / r.total) * 100).toFixed(2)}%)${r.example[id] ? "  ตัวอย่าง: " + r.example[id].join(" → ") : ""}`);
}
const cap = Object.fromEntries(cfg.items.map((i) => [i.id, i.maxLevel]));
console.log("เลเวลสูงสุดที่ไปถึงได้ / เพดาน: " + Object.entries(r.reached).map(([id, v]) => `${id} ${v}/${cap[id]}${v < cap[id] ? " ✗" : ""}`).join(", "));
