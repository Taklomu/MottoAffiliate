// ทดสอบเอนจินเกม "เกาะคำคม" และการเชื่อมกับ build  (รัน: npm test)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GrowEngine, validateConfig } from "../src/grow/engine.mjs";
import { analyze } from "../src/grow/analyze.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const island = JSON.parse(fs.readFileSync(path.join(ROOT, "data/island.json"), "utf8"));
const attached = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/grow-attached.json"), "utf8"));

// config เล็กสำหรับทดสอบกติกา: b ต้องมี a เลเวล 1, a ต้องมี b เลเวล 2 ที่เลเวลสุดท้าย
const tiny = () => ({
  items: [
    { id: "a", name: "A", maxLevel: 3, rules: { 2: { requires: { b: 1 } }, 3: { requires: { b: 2 }, event: "A ถึงขีดสุด" } } },
    { id: "b", name: "B", maxLevel: 2, rules: { 2: {} } },
    { id: "c", name: "C", maxLevel: 1, rules: {} }
  ],
  endings: [{ id: "top", allMax: true }, { id: "mid", min: { a: 2 } }, { id: "low" }],
  fallbackEnding: "low"
});

test("วางไอเทม: เริ่มเลเวล 1, ไอเทมอื่นโตตามกฎ, ฉากจบเป็น null จนกว่าจะวางครบ", () => {
  const e = new GrowEngine(tiny());
  assert.equal(e.ending(), null);
  const t1 = e.placeItem("a");
  assert.deepEqual(t1.changes, { a: { from: 0, to: 1 } });
  const t2 = e.placeItem("b"); // เทิร์นนี้ b เพิ่งวาง (เลเวล 1) ส่วน a โตเป็น 2 เพราะมี b ≥ 1
  assert.equal(t2.changes.a.to, 2);
  assert.equal(e.ending(), null);
  const t3 = e.placeItem("c"); // a โตเป็น 3 ต้องมี b ≥ 2: b โตเป็น 2 ก่อนในเทิร์นนี้? a ถูกประมวลผลก่อน b จึงยังไม่ถึง
  assert.equal(e.items.b.level, 2);
  assert.equal(e.items.a.level, 2);
  assert.ok(e.isOver());
  assert.equal(e.ending(), "mid");
  assert.equal(t3.turn, 3);
});

test("ผลขึ้นกับลำดับการวางและกฎการโตแบบต่อเนื่องในเทิร์นเดียว: วางสลับกันได้ผลต่างกัน", () => {
  const run = (order) => { const e = new GrowEngine(tiny()); order.forEach((i) => e.placeItem(i)); return e.getState(); };
  const x = run(["b", "a", "c"]);
  const y = run(["a", "b", "c"]);
  assert.notDeepEqual(x.items, y.items);
});

test("ลำดับเดิมให้ผลเดิมทุกครั้ง (deterministic) และ clone ไม่กระทบต้นฉบับ", () => {
  const order = ["coffee", "office", "money", "rest", "selfcare", "travel", "fitness", "books"];
  const a = new GrowEngine(island), b = new GrowEngine(island);
  order.forEach((i) => { a.placeItem(i); b.placeItem(i); });
  assert.deepEqual(a.getState(), b.getState());
  const c = new GrowEngine(island);
  c.placeItem("coffee");
  const copyOf = c.clone();
  copyOf.placeItem("office");
  assert.equal(c.turn, 1);
  assert.equal(c.items.office.level, 0);
});

test("กติกาผิดต้องโยน error: วางซ้ำ, ไอเทมที่ไม่มี และสถานะไม่ขยับ", () => {
  const e = new GrowEngine(tiny());
  e.placeItem("a");
  assert.throws(() => e.placeItem("a"), /วางซ้ำไม่ได้/);
  assert.throws(() => e.placeItem("zzz"), /ไม่รู้จักไอเทม/);
  assert.throws(() => e.placeItem("__proto__"), /ไม่รู้จักไอเทม/);
  assert.equal(e.turn, 1);
});

test("subscribe ได้สถานะทันทีและทุกครั้งที่เปลี่ยน, getState เป็นสำเนา แก้แล้วไม่กระทบเอนจิน", () => {
  const e = new GrowEngine(tiny());
  const seen = [];
  const off = e.subscribe((s) => seen.push(s.turn));
  e.placeItem("a");
  off();
  e.placeItem("b");
  assert.deepEqual(seen, [0, 1]);
  const s = e.getState();
  s.items.a.level = 99;
  assert.equal(e.items.a.level, 2);
});

test("validateConfig จับ config ผิดได้ครบ", () => {
  const bad = tiny();
  bad.items.push({ id: "a", name: "ซ้ำ", maxLevel: 1, rules: {} });
  bad.items[0].rules[2] = { requires: { nope: 1 } };
  bad.items[1].rules[5] = {};
  bad.items[2].rules = { 2: { requires: { a: 9 } } };
  bad.fallbackEnding = "ไม่มี";
  const errs = validateConfig(bad).join("\n");
  assert.match(errs, /id ไอเทมซ้ำ: a/);
  assert.match(errs, /ไม่มีอยู่ "nope"/);
  assert.match(errs, /กฎของเลเวล "5" อยู่นอกช่วง/);
  assert.match(errs, /เกิน maxLevel/);
  assert.match(errs, /fallbackEnding/);
  assert.throws(() => new GrowEngine(bad), /config เกมไม่ถูกต้อง/);
});

test("ข้อค้นพบเชิงโครงสร้าง: ไอเทมที่วางเป็นชิ้นสุดท้ายได้แค่เลเวล 1 เสมอ ในทุกลำดับ", () => {
  const ids = island.items.map((i) => i.id);
  const perms = [];
  const perm = (a, k = 0) => { if (k === a.length) return perms.push(a.slice()); for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
  perm(ids.slice(0, 6)); // 720 ลำดับของ 6 ชิ้นพอสำหรับตรวจ
  const six = { ...island, items: island.items.slice(0, 6), endings: [{ id: "x", min: { coffee: 1 } }, { id: "y" }], fallbackEnding: "y" };
  six.items = six.items.map((i) => ({ ...i, rules: Object.fromEntries(Object.entries(i.rules).map(([lv, r]) => [lv, { ...r, requires: Object.fromEntries(Object.entries(r.requires || {}).filter(([k]) => ids.slice(0, 6).includes(k))) }])) }));
  for (const order of perms) {
    const e = new GrowEngine(six);
    order.forEach((i) => e.placeItem(i));
    assert.equal(e.items[order[order.length - 1]].level, 1, order.join(","));
  }
});

test("เกมที่ส่งมา (config ต้นฉบับที่แนบ): ลองครบ 40,320 ลำดับ ไม่มีลำดับไหนจบ MAX_UTOPIA หรือ SECRET_UFO", () => {
  const r = analyze(attached);
  assert.equal(r.total, 40320);
  assert.equal(r.counts.MAX_UTOPIA, 0);
  assert.equal(r.counts.SECRET_UFO, 0);
  assert.equal(r.counts.NORMAL_COMPLETE, 40320);
  assert.equal(r.reached.car, 2); // car เลเวล 3 ไม่เคยถึงในลำดับใดเลย
});

test("เกาะคำคม (config ของเรา): ทุกฉากจบเป็นไปได้ และ analyze ครบ 40,320 ลำดับ", () => {
  const r = analyze(island);
  assert.equal(r.total, 40320);
  for (const e of island.endings) assert.ok(r.counts[e.id] > 0, `ฉากจบ ${e.id} เป็นไปไม่ได้`);
  assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), r.total);
  // ลำดับตัวอย่างที่ analyze เสนอ ต้องเล่นซ้ำแล้วจบฉากนั้นจริง
  for (const [end, order] of Object.entries(r.example)) {
    const e = new GrowEngine(island);
    order.forEach((i) => e.placeItem(i));
    assert.equal(e.ending(), end);
  }
});

test("analyze ข้ามเมื่อไอเทมเกินเพดาน แทนที่จะค้าง", () => {
  const big = { items: Array.from({ length: 11 }, (_, i) => ({ id: "i" + i, name: "I", maxLevel: 1, rules: {} })), endings: [{ id: "n" }], fallbackEnding: "n" };
  assert.equal(analyze(big).skipped, true);
});

/* ---------- เชื่อมกับ build ---------- */
function makeSite(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kk-grow-"));
  for (const f of ["build.mjs", "src", "public", "site.config.json", "data"]) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  for (const [rel, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, rel), c);
  return dir;
}
const build = (dir) => spawnSync(process.execPath, ["build.mjs"], { cwd: dir, encoding: "utf8", timeout: 60000 });

test("build: สร้าง /island/, เมนู, sitemap, ไฟล์สคริปต์ (.js ไม่ใช่ .mjs) และข้อมูลเกมฝังในหน้า", () => {
  const dir = makeSite();
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(dir, "dist/island/index.html"), "utf8");
  assert.match(html, /id="island-data"/);
  assert.match(html, /type="module" src="[^"]*assets\/grow\/island\.js\?v=/);
  assert.ok(fs.existsSync(path.join(dir, "dist/assets/grow/engine.js")));
  assert.equal(fs.existsSync(path.join(dir, "dist/assets/grow/engine.mjs")), false);
  assert.match(fs.readFileSync(path.join(dir, "dist/assets/grow/island.js"), "utf8"), /from "\.\/engine\.js"/);
  assert.match(fs.readFileSync(path.join(dir, "dist/index.html"), "utf8"), /href="[^"]*\/island\/">เกาะคำคม</);
  assert.match(fs.readFileSync(path.join(dir, "dist/sitemap.xml"), "utf8"), /\/island\//);
  assert.match(r.stdout, /เกาะคำคม: ลองครบ 40,320 ลำดับ/);
  const printed = Number(/(\d+) หน้า HTML/.exec(r.stdout)[1]);
  const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : e.name.endsWith(".html") ? 1 : 0), 0);
  assert.equal(printed, count(path.join(dir, "dist")));
});

test("build: ข้อความในข้อมูลเกมที่มีแท็ก HTML ไม่หลุดออกจากสคริปต์ JSON", () => {
  const cfg = JSON.parse(JSON.stringify(island));
  cfg.items[0].name = "</script><img src=x onerror=alert(1)>";
  const dir = makeSite({ "data/island.json": JSON.stringify(cfg) });
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(dir, "dist/island/index.html"), "utf8");
  assert.equal(html.includes("</script><img"), false);
  assert.ok(html.includes("\\u003c/script>"));
});

test("build: island.json ผิดรูป/ผิดกติกา หยุด build พร้อมข้อความไทย และไม่แตะ dist เดิม", () => {
  for (const content of ["{ไม่ใช่ json", JSON.stringify({ ...island, fallbackEnding: "ไม่มี" })]) {
    const dir = makeSite({ "data/island.json": content });
    fs.mkdirSync(path.join(dir, "dist"));
    fs.writeFileSync(path.join(dir, "dist/keep.txt"), "เดิม");
    const r = build(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /data\/island\.json/);
    assert.equal(fs.readFileSync(path.join(dir, "dist/keep.txt"), "utf8"), "เดิม");
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  }
});

test("build: เตือนเมื่อฉากจบเป็นไปไม่ได้ (ใช้ config ต้นฉบับที่แนบเป็นตัวอย่าง)", () => {
  const dir = makeSite({ "data/island.json": JSON.stringify(attached) });
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /ฉากจบ "MAX_UTOPIA" เป็นไปไม่ได้เลย/);
  assert.match(r.stderr, /ฉากจบ "SECRET_UFO" เป็นไปไม่ได้เลย/);
});

test("build: ไม่มี data/island.json ก็ build ได้ตามปกติ ไม่มีหน้า /island/ และไม่มีเมนู", () => {
  const dir = makeSite();
  fs.rmSync(path.join(dir, "data/island.json"));
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(dir, "dist/island")), false);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, "dist/index.html"), "utf8"), /เกาะคำคม/);
});
