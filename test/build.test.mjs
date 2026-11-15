// ชุดทดสอบของ build.mjs และส่วนถอนความยินยอมใน app.js
// รัน: npm test   (หรือ node --test test/)
// แต่ละข้อทดสอบคัดลอกโปรเจกต์ไปโฟลเดอร์ชั่วคราว ใส่ข้อมูลที่ต้องการทดสอบ แล้วรัน build จริง
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cell = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
const row = (cells) => cells.map((c) => cell(String(c ?? ""))).join(",") + "\n";

function makeSite({ quotes = [], products = [], config = {}, files = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kk-test-"));
  for (const f of ["build.mjs", "src", "public", "site.config.json", "data"]) {
    fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  }
  if (quotes.length) fs.appendFileSync(path.join(dir, "data/quotes.csv"), quotes.map(row).join(""));
  if (products.length) fs.appendFileSync(path.join(dir, "data/products.csv"), products.map(row).join(""));
  const cfgPath = path.join(dir, "site.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg, ...config }));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}
const build = (dir) => spawnSync(process.execPath, ["build.mjs"], { cwd: dir, encoding: "utf8", timeout: 60000 });
const read = (dir, rel) => fs.readFileSync(path.join(dir, "dist", rel), "utf8");
const htmlFiles = (dir) => {
  const out = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : p.endsWith(".html") && out.push(p);
  });
  walk(path.join(dir, "dist"));
  return out;
};
// คำคมทดสอบ 1 อัน + สินค้า 1 ชิ้น (ปรับค่าได้)
const q = (id = "t1", extra = {}) => ["id", "quote_text", "tags", "keywords", "og_image"].map((k) => extra[k] ?? ({ id, quote_text: "คำคมทดสอบ", tags: "ทดสอบ", keywords: "ทดสอบ", og_image: "" })[k]);
const p = (quote = "t1", extra = {}) => ["id", "quote_id", "product_name", "product_desc", "image_url", "shopee_aff_link", "lazada_aff_link", "search_keyword"]
  .map((k) => extra[k] ?? ({ id: quote + "-1", quote_id: quote, product_name: "สินค้าทดสอบ", product_desc: "คำอธิบาย", image_url: "", shopee_aff_link: "", lazada_aff_link: "", search_keyword: "สินค้า" })[k]);

test("ข้อมูลจริงในรีโป build ผ่าน และตัวนับหน้าตรงกับไฟล์ HTML ที่เขียนจริง", () => {
  const dir = makeSite();
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  const printed = Number(/(\d+) หน้า HTML/.exec(r.stdout)[1]);
  assert.equal(printed, htmlFiles(dir).length);
});

test("ข้อความ HTML/สคริปต์ในข้อมูลถูก escape ในทุกไฟล์ HTML", () => {
  const evil = '<script>alert(1)</script> "><img src=x onerror=alert(2)>';
  const dir = makeSite({ quotes: [q("xss", { quote_text: evil, tags: "<b>tag</b>" })], products: [p("xss", { product_name: evil, product_desc: evil })] });
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  for (const f of htmlFiles(dir)) {
    const html = fs.readFileSync(f, "utf8");
    assert.ok(!/<script>alert/.test(html), f);
    assert.ok(!/<img src=x/.test(html), f);
    assert.ok(!/<b>tag<\/b>/.test(html), f);
  }
  assert.ok(!/<\/script><script>/.test(read(dir, "index.html")));
});

for (const [label, link] of [
  ["javascript:", "javascript:alert(document.domain)"],
  ["javascript: ที่แทรกแท็บ", "java\tscript:alert(1)"],
  ["//โดเมนอื่น", "//evil.example/x"],
  ["http:// ธรรมดา", "http://shopee.co.th/x"],
  ["data:", "data:text/html,<script>alert(1)</script>"],
  ["มีรหัสผ่านใน URL", "https://user:pass@shopee.co.th/x"],
  ["ข้อความที่ไม่ใช่ URL", "ไม่ใช่ลิงก์"]
]) {
  test(`ปฏิเสธลิงก์ Affiliate แบบ ${label} และหยุด build`, () => {
    const dir = makeSite({ quotes: [q()], products: [p("t1", { shopee_aff_link: link })] });
    const r = build(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /shopee_aff_link/);
    assert.ok(!fs.existsSync(path.join(dir, "dist")), "ต้องไม่เขียน dist/ เมื่อข้อมูลผิด");
  });
}

test("รับลิงก์ https และใส่ data-aff=1 พร้อมแสดงโดเมนที่ใช้ในสรุป", () => {
  const dir = makeSite({ quotes: [q()], products: [p("t1", { lazada_aff_link: "https://s.lazada.co.th/s.AbC123" })] });
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  const html = read(dir, "quote/t1/index.html");
  assert.match(html, /href="https:\/\/s\.lazada\.co\.th\/s\.AbC123"[^>]*data-aff="1"/);
  assert.match(r.stdout, /ลิงก์ Affiliate ชี้ไปโดเมน: s\.lazada\.co\.th/);
});

test("allowedLinkHosts: ปฏิเสธโดเมนนอกรายการ รับโดเมนย่อยของโดเมนที่อนุญาต", () => {
  const cfg = { allowedLinkHosts: ["shopee.co.th", "lazada.co.th"] };
  const bad = makeSite({ config: cfg, quotes: [q()], products: [p("t1", { shopee_aff_link: "https://evil.example/x" })] });
  const rb = build(bad);
  assert.equal(rb.status, 1);
  assert.match(rb.stderr, /allowedLinkHosts/);
  const good = makeSite({ config: cfg, quotes: [q()], products: [p("t1", { shopee_aff_link: "https://s.shopee.co.th/abc" })] });
  assert.equal(build(good).status, 0);
  const lookalike = makeSite({ config: cfg, quotes: [q()], products: [p("t1", { shopee_aff_link: "https://notshopee.co.th/abc" })] });
  assert.equal(build(lookalike).status, 1, "notshopee.co.th ต้องไม่ผ่านเพียงเพราะลงท้ายคล้ายกัน");
});

test("og_image ที่ไม่ขึ้นต้นด้วย / ถูกเติม / พร้อมเตือน และต่อกับ siteUrl+basePath ถูก", () => {
  const dir = makeSite({
    config: { siteUrl: "https://example.org/", basePath: "app" },
    quotes: [q("t1", { og_image: "og/relative.png" })], products: [p()],
    files: { "public/og/relative.png": "x" }
  });
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(read(dir, "quote/t1/index.html"), /og:image" content="https:\/\/example\.org\/app\/og\/relative\.png"/);
  assert.match(r.stderr, /ไม่ขึ้นต้นด้วย \//); // คำเตือนออกทาง stderr
});

test("image_url แบบ /img/x.jpg ได้ basePath นำหน้า และเตือนถ้าไม่มีไฟล์ใน public/", () => {
  const dir = makeSite({ config: { basePath: "/app" }, quotes: [q()], products: [p("t1", { image_url: "/img/a.jpg" })] });
  const r = build(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(read(dir, "quote/t1/index.html"), /<img src="\/app\/img\/a\.jpg"/);
  assert.match(r.stderr, /ยังไม่พบไฟล์ public\/img\/a\.jpg/);
});

for (const [label, value] of [
  ["ขึ้นต้นด้วย //", "//evil.example/a.png"],
  ["มีเครื่องหมาย \\", "/\\evil.example/a.png"],
  ["เป็น data:", "data:image/svg+xml,<svg onload=alert(1)>"],
  ["เป็น javascript:", "javascript:alert(1)"],
  ["เป็น http://", "http://example.org/a.png"],
  ["มี ..", "/img/../../secret.png"],
  ["มีช่องว่าง", "/img/a b.png"]
]) {
  test(`ปฏิเสธเส้นทางรูปที่${label}`, () => {
    const dir = makeSite({ quotes: [q()], products: [p("t1", { image_url: value })] });
    const r = build(dir);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /image_url/);
  });
}

test("ปฏิเสธเทมเพลต affiliateWrap ที่ไม่ใช่ https หรือไม่มี {url}", () => {
  for (const tpl of ["http://track.example/?u={url}", "https://track.example/?u=fixed"]) {
    const dir = makeSite({ config: { affiliateWrap: { shopee: tpl, lazada: "" } } });
    const r = build(dir);
    assert.equal(r.status, 1, tpl);
    assert.match(r.stderr, /affiliateWrap\.shopee/);
  }
  const ok = makeSite({ config: { affiliateWrap: { shopee: "https://track.example/?u={url}", lazada: "" } }, quotes: [q()], products: [p()] });
  assert.equal(build(ok).status, 0);
  assert.match(read(ok, "quote/t1/index.html"), /href="https:\/\/track\.example\/\?u=https%3A%2F%2Fshopee\.co\.th/);
});

test("รหัส GA4 ผิดรูปแบบหยุด build", () => {
  const dir = makeSite({ config: { gaMeasurementId: "UA-123" } });
  const r = build(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /gaMeasurementId/);
});

test("ดึง CSV ล้มเหลว: ข้อความไทย ไม่มี stack trace และไม่แตะ dist/ เดิม", () => {
  const dir = makeSite({ config: { sources: { quotes_csv_url: "https://127.0.0.1:9/q.csv", products_csv_url: "" } } });
  fs.mkdirSync(path.join(dir, "dist"));
  fs.writeFileSync(path.join(dir, "dist/marker.txt"), "เดิม");
  const r = build(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ดึงข้อมูล "quotes" จาก 127\.0\.0\.1 ไม่ได้/);
  assert.ok(!/node:internal|\n\s+at /.test(r.stderr), "ต้องไม่โชว์ stack trace");
  assert.equal(fs.readFileSync(path.join(dir, "dist/marker.txt"), "utf8"), "เดิม");
});

test("sources ที่ไม่ใช่ https หยุด build", () => {
  const dir = makeSite({ config: { sources: { quotes_csv_url: "http://example.org/q.csv", products_csv_url: "" } } });
  const r = build(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /https/);
});

test("CSV ขาดคอลัมน์ที่จำเป็น แจ้งชื่อคอลัมน์ที่ขาด", () => {
  const dir = makeSite({ files: { "data/quotes.csv": "id,text\nt1,x\n" } });
  const r = build(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ไม่มีคอลัมน์ quote_text/);
});

test("ไฟล์ CSV ว่างเปล่าไม่ทำให้โปรแกรมพังแบบไม่มีข้อความ", () => {
  const dir = makeSite({ files: { "data/quotes.csv": "", "data/products.csv": "" } });
  const r = build(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ไม่มีคำคมที่ใช้ได้เลย/);
});

test("ถอนความยินยอม: ตั้ง ga-disable และลบคุกกี้ GA ทุกโดเมนที่เป็นไปได้", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8");
  const a = src.indexOf("function clearGaCookies()");
  const b = src.indexOf("function showBanner()");
  assert.ok(a > 0 && b > a, "ไม่พบฟังก์ชันใน app.js");
  const jar = new Map([["_ga", 1], ["_ga_ABC123", 1], ["_gid", 1], ["_gat_gtag_G_X", 1], ["session", 1]]);
  const doc = {
    get cookie() { return [...jar.keys()].map((k) => k + "=1").join("; "); },
    set cookie(v) {
      if (/expires=Thu, 01 Jan 1970/.test(v)) {
        const name = v.split("=")[0];
        const dom = /domain=([^;]+)/.exec(v);
        if (!dom || dom[1] === "taklomu.github.io" || dom[1] === ".taklomu.github.io") jar.delete(name);
      }
    }
  };
  const win = {};
  const fn = new Function("document", "location", "KK", "window", src.slice(a, b) + "; disableGA();");
  fn(doc, { hostname: "taklomu.github.io" }, { ga: "G-TEST1234" }, win);
  assert.equal(win["ga-disable-G-TEST1234"], true);
  assert.deepEqual([...jar.keys()], ["session"]);
});
