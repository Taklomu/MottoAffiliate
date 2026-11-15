// ตัวสร้างเว็บสถิตของ "คำคมคู่ใจ" ไม่ต้องติดตั้งแพ็กเกจเพิ่ม (ใช้ Node 18 ขึ้นไป)
// รัน: node build.mjs   ผลลัพธ์อยู่ในโฟลเดอร์ dist/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateConfig } from "./src/grow/engine.mjs";
import { analyze } from "./src/grow/analyze.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const warnings = [];
const errors = [];

/* ---------- ตั้งค่า ---------- */
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));
const cfg = {
  siteName: "คำคมคู่ใจ",
  siteUrl: "https://example.com",
  basePath: "",
  tagline: "",
  ogDefaultImage: "",
  gaMeasurementId: "",
  trackEndpoint: "",
  contactEmail: "",
  allowedLinkHosts: [],
  ...raw,
  affiliateWrap: { shopee: "", lazada: "", ...(raw.affiliateWrap || {}) },
  sources: { quotes_csv_url: "", products_csv_url: "", ...(raw.sources || {}) }
};
// รายชื่อโดเมนที่อนุญาตให้ลิงก์ Affiliate ชี้ไป (ว่าง = อนุญาตทุกโดเมน https และพิมพ์โดเมนที่ใช้ตอนสรุปผล)
cfg.allowedLinkHosts = (Array.isArray(cfg.allowedLinkHosts) ? cfg.allowedLinkHosts : [])
  .map((h) => String(h).trim().toLowerCase().replace(/^\.+/, "")).filter(Boolean);
cfg.siteUrl = cfg.siteUrl.replace(/\/+$/, "");
cfg.basePath = cfg.basePath ? "/" + cfg.basePath.replace(/^\/+|\/+$/g, "") : "";
if (cfg.siteUrl.includes("example.com")) {
  warnings.push("siteUrl ยังเป็น example.com ลิงก์ canonical, sitemap และ og:url จะผิด แก้ใน site.config.json ก่อนขึ้นเว็บจริง");
}

/* ---------- ตัวช่วย ---------- */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const u = (p) => cfg.basePath + p;
const abs = (p) => cfg.siteUrl + cfg.basePath + p;
const jsonForHtml = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const splitList = (s) => (s || "").split("|").map((x) => x.trim()).filter(Boolean);
const hash8 = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);

/* ---------- ตรวจลิงก์และเส้นทางไฟล์ที่มาจากข้อมูล ----------
   ข้อมูลมาจาก Google Sheets ซึ่งแก้ได้โดยคนอื่น จึงไม่เชื่อค่าที่กรอกมาตรงๆ
   ค่าที่ผิดจะถูกบันทึกเป็นข้อผิดพลาด และ build จะหยุดก่อนเขียนไฟล์ใดๆ */
const linkHosts = new Set();

// ลิงก์ที่ผู้เข้าชมกดได้ ต้องเป็น https:// เต็มรูปเท่านั้น (กัน javascript: data: และ //โดเมนอื่น)
function safeUrl(value, field, { record = true } = {}) {
  let parsed;
  try { parsed = new URL(value); } catch { errors.push(`${field}: ไม่ใช่ URL ที่ถูกต้อง "${value}"`); return ""; }
  if (parsed.protocol !== "https:") { errors.push(`${field}: ต้องขึ้นต้นด้วย https:// เท่านั้น แต่ได้ "${value}"`); return ""; }
  if (parsed.username || parsed.password) { errors.push(`${field}: ห้ามมีชื่อผู้ใช้หรือรหัสผ่านใน URL "${value}"`); return ""; }
  const host = parsed.hostname.toLowerCase();
  if (record && cfg.allowedLinkHosts.length && !cfg.allowedLinkHosts.some((h) => host === h || host.endsWith("." + h))) {
    errors.push(`${field}: โดเมน ${host} ไม่อยู่ใน allowedLinkHosts ของ site.config.json`);
    return "";
  }
  if (record) linkHosts.add(host);
  return parsed.href;
}

// รูปในเว็บ: ต้องเป็น /ชื่อไฟล์ (ไฟล์ใน public/) หรือ https://... ถ้าไม่ขึ้นต้นด้วย / จะเติมให้พร้อมเตือน
function assetPath(value, field) {
  if (!value) return "";
  if (/^http:\/\//i.test(value)) { errors.push(`${field}: ต้องเป็น https:// ไม่ใช่ http:// "${value}"`); return ""; }
  if (/^https:\/\//i.test(value)) return safeUrl(value, field, { record: false });
  if (/[\\\s\u0000-\u001f]/.test(value)) { errors.push(`${field}: ห้ามมีช่องว่าง เครื่องหมาย \\ หรืออักขระควบคุม "${value}"`); return ""; }
  if (value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value)) { errors.push(`${field}: รูปแบบที่ไม่อนุญาต "${value}" ใช้ /ชื่อไฟล์ หรือ https://... เท่านั้น`); return ""; }
  let p = value;
  if (!p.startsWith("/")) { p = "/" + p; warnings.push(`${field}: "${value}" ไม่ขึ้นต้นด้วย / จึงเติมให้เป็น "${p}"`); }
  if (p.split("/").includes("..")) { errors.push(`${field}: ห้ามใช้ ".." ในเส้นทาง "${value}"`); return ""; }
  if (!fs.existsSync(path.join(ROOT, "public", p))) warnings.push(`${field}: ยังไม่พบไฟล์ public${p} (ลิงก์รูปจะเสียจนกว่าจะวางไฟล์)`);
  return p;
}

function checkWrapTemplates() {
  for (const kind of ["shopee", "lazada"]) {
    const tpl = cfg.affiliateWrap[kind];
    if (!tpl) continue;
    if (!/^https:\/\//i.test(tpl) || !tpl.includes("{url}")) {
      errors.push(`affiliateWrap.${kind}: ต้องขึ้นต้นด้วย https:// และมี {url} อยู่ในเทมเพลต`);
    }
  }
}
checkWrapTemplates();
cfg.ogDefaultImage = assetPath(cfg.ogDefaultImage, "ogDefaultImage");
if (cfg.trackEndpoint) cfg.trackEndpoint = safeUrl(cfg.trackEndpoint, "trackEndpoint", { record: false });
if (cfg.gaMeasurementId && !/^G-[A-Z0-9]{4,}$/.test(cfg.gaMeasurementId)) {
  errors.push(`gaMeasurementId: รูปแบบต้องเป็น G-XXXXXXXXXX แต่ได้ "${cfg.gaMeasurementId}"`);
}

function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], cur = "", inQ = false;
  const endRow = () => { row.push(cur); cur = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; endRow(); }
    else cur += c;
  }
  if (cur !== "" || row.length) endRow();
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// ดึง CSV จาก Google Sheets: มี timeout, ข้อความผิดพลาดภาษาไทย และไม่แตะ dist/ เดิมถ้าล้มเหลว
async function fetchCSV(name, url) {
  let host = url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("not https");
    host = parsed.hostname;
  } catch {
    console.error(`ผิดพลาด: sources.${name}_csv_url ต้องเป็นลิงก์ https:// ที่ถูกต้อง`);
    process.exit(1);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error("ได้หน้า HTML แทน CSV (ชีตอาจยังไม่ได้ Publish to web แบบ CSV)");
    return text;
  } catch (e) {
    const why = e.name === "AbortError" ? "หมดเวลา 20 วินาที" : (e.cause && e.cause.code) || e.message;
    console.error(`ผิดพลาด: ดึงข้อมูล "${name}" จาก ${host} ไม่ได้ (${why})\nไม่ได้แตะโฟลเดอร์ dist/ เดิม ตรวจว่าลิงก์เปิดได้ในเบราว์เซอร์ หรือเว้นว่าง sources เพื่อใช้ไฟล์ใน data/ แทน`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

function requireColumns(rows, cols, name) {
  if (!rows.length) return;
  const missing = cols.filter((c) => !(c in rows[0]));
  if (missing.length) {
    console.error(`ผิดพลาด: ตาราง "${name}" ไม่มีคอลัมน์ ${missing.join(", ")} (ตรวจชื่อหัวคอลัมน์แถวแรกให้ตรงกับ README)`);
    process.exit(1);
  }
}

async function loadTable(name, url, cols) {
  const text = url ? await fetchCSV(name, url) : fs.readFileSync(path.join(ROOT, "data", name + ".csv"), "utf8");
  const rows = parseCSV(text);
  requireColumns(rows, cols, name);
  return rows;
}

/* ---------- โหลดและตรวจข้อมูล ---------- */
const quoteRows = await loadTable("quotes", cfg.sources.quotes_csv_url, ["id", "quote_text"]);
const productRows = await loadTable("products", cfg.sources.products_csv_url, ["quote_id", "product_name"]);

const quotes = [];
const byId = new Map();
for (const r of quoteRows) {
  if (!r.id || !r.quote_text) { warnings.push(`ข้ามแถวคำคมที่ไม่มี id หรือ quote_text: ${JSON.stringify(r).slice(0, 80)}`); continue; }
  if (!/^[a-z0-9-]+$/.test(r.id)) { errors.push(`id "${r.id}" ต้องเป็นตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น`); continue; }
  if (byId.has(r.id)) { errors.push(`id "${r.id}" ซ้ำ`); continue; }
  const q = { id: r.id, quote: r.quote_text, tags: splitList(r.tags), kw: splitList(r.keywords), og: assetPath(r.og_image, `คำคม ${r.id} og_image`), products: [] };
  quotes.push(q);
  byId.set(q.id, q);
}
let affSlots = 0, affFilled = 0, noImage = 0, productCount = 0;
for (const r of productRows) {
  const q = byId.get(r.quote_id);
  if (!q) { warnings.push(`สินค้า "${r.product_name}" อ้างถึง quote_id "${r.quote_id}" ที่ไม่มี จึงข้ามไป`); continue; }
  if (!r.product_name) { warnings.push(`ข้ามแถวสินค้าของ ${r.quote_id} ที่ไม่มี product_name`); continue; }
  const where = `สินค้า ${r.id || r.product_name} (${r.quote_id})`;
  const p = {
    name: r.product_name, desc: r.product_desc,
    image: assetPath(r.image_url, `${where} image_url`),
    shopee: r.shopee_aff_link ? safeUrl(r.shopee_aff_link, `${where} shopee_aff_link`) : "",
    lazada: r.lazada_aff_link ? safeUrl(r.lazada_aff_link, `${where} lazada_aff_link`) : "",
    kw: r.search_keyword || r.product_name
  };
  q.products.push(p);
  productCount++;
  affSlots += 2;
  if (p.shopee) affFilled++;
  if (p.lazada) affFilled++;
  if (!p.image) noImage++;
}
for (const q of quotes.slice()) {
  if (!q.products.length) {
    warnings.push(`คำคม "${q.id}" ไม่มีสินค้าเลย จึงไม่สร้างหน้านี้`);
    quotes.splice(quotes.indexOf(q), 1);
  }
}
/* ---------- เกม "เกาะคำคม" (ไม่บังคับ: ไม่มี data/island.json ก็ไม่สร้างหน้าเกม) ---------- */
let island = null;
const islandFile = path.join(ROOT, "data/island.json");
if (fs.existsSync(islandFile)) {
  try { island = JSON.parse(fs.readFileSync(islandFile, "utf8")); }
  catch (e) { errors.push(`data/island.json: อ่านเป็น JSON ไม่ได้ (${e.message})`); }
  if (island) {
    const errs = validateConfig(island);
    errs.forEach((m) => errors.push(`data/island.json: ${m}`));
    if (errs.length) island = null;
  }
}
if (errors.length) { console.error("ผิดพลาด:\n- " + errors.join("\n- ")); process.exit(1); }
if (!quotes.length) { console.error("ผิดพลาด: ไม่มีคำคมที่ใช้ได้เลย"); process.exit(1); }

/* ---------- ลิงก์ซื้อและรูป ---------- */
function buyLink(kind, p) {
  if (p[kind]) return { url: p[kind], aff: true };
  const k = encodeURIComponent(p.kw);
  const base = kind === "shopee" ? "https://shopee.co.th/search?keyword=" + k : "https://www.lazada.co.th/catalog/?q=" + k;
  const tpl = cfg.affiliateWrap[kind];
  return tpl ? { url: tpl.replace("{url}", encodeURIComponent(base)), aff: true } : { url: base, aff: false };
}
const assetUrl = (s) => (s.startsWith("/") ? u(s) : s);
const absAsset = (s) => (/^https?:\/\//.test(s) ? s : cfg.siteUrl + assetUrl(s));
const PLACEHOLDER = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>';
const FAVICON = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#3B3BF5'/><text x='32' y='52' font-size='60' text-anchor='middle' fill='white' font-family='Georgia,serif'>“</text></svg>");

/* ---------- ข้อมูลเกม: วิเคราะห์ฉากจบ และจับคู่สินค้า ---------- */
let islandReport = null;
const islandProducts = {};
if (island) {
  islandReport = analyze(island);
  if (islandReport.skipped) warnings.push(`เกาะคำคม: ข้ามการวิเคราะห์ฉากจบ (${islandReport.reason})`);
  else for (const [id, n] of Object.entries(islandReport.counts)) {
    if (n === 0) warnings.push(`เกาะคำคม: ฉากจบ "${id}" เป็นไปไม่ได้เลยในทุก ${islandReport.total.toLocaleString("en-US")} ลำดับการวาง ผู้เล่นจะไม่มีวันเห็นฉากนี้`);
  }
  for (const it of island.items) {
    const list = [];
    const names = new Set();
    for (const q of quotes) {
      if (!(it.tag && q.tags.includes(it.tag))) continue;
      for (const p of q.products) {
        if (names.has(p.name) || list.length >= 6) continue;
        names.add(p.name);
        list.push({ name: p.name, shopee: buyLink("shopee", p), lazada: buyLink("lazada", p) });
      }
    }
    if (!list.length) warnings.push(`เกาะคำคม: ไอเทม "${it.id}" ไม่มีสินค้าที่ตรงกับแท็ก "${it.tag || ""}" จึงไม่แสดงสินค้าในฉากจบ`);
    islandProducts[it.id] = list;
  }
}

/* ---------- เทมเพลตหน้า ---------- */
const cssV = hash8(fs.readFileSync(path.join(ROOT, "src/style.css"), "utf8"));
const jsV = hash8(fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8"));
const kkConfig = jsonForHtml({ ga: cfg.gaMeasurementId, endpoint: cfg.trackEndpoint, base: cfg.basePath });

function shell({ title, desc, p, image, body, noindex, head = "" }) {
  const img = image ? absAsset(image) : cfg.ogDefaultImage ? absAsset(cfg.ogDefaultImage) : "";
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(abs(p))}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.siteName)}">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(abs(p))}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ""}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${img ? `<meta name="twitter:image" content="${esc(img)}">` : ""}
<meta name="theme-color" content="#3B3BF5">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@400;500&family=Noto+Sans+Thai:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${u("/assets/style.css")}?v=${cssV}">
<script>window.KK=${kkConfig};</script>
<script src="${u("/assets/app.js")}?v=${jsV}" defer></script>
${head}
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="${u("/")}"><span class="mark" aria-hidden="true">“</span>${esc(cfg.siteName)}</a>
  <nav aria-label="เมนูหลัก">${island ? `<a href="${u("/island/")}">เกาะคำคม</a>` : ""}<a href="${u("/about/")}">เกี่ยวกับเว็บนี้</a></nav>
</header>
${body}
<footer>
  <p>บางลิงก์เป็นลิงก์พันธมิตร (Affiliate) เจ้าของเว็บอาจได้รับค่าคอมมิชชันเมื่อคุณซื้อ โดยราคาที่คุณจ่ายไม่เปลี่ยน</p>
  <p>รายการสินค้าเป็นไอเดียประเภทสินค้า ดูสเปก ราคา และรีวิวที่หน้าร้านก่อนสั่งทุกครั้ง</p>
  <nav aria-label="ลิงก์ท้ายหน้า">
    <a href="${u("/about/")}">เกี่ยวกับเว็บนี้</a>
    <a href="${u("/privacy/")}">นโยบายความเป็นส่วนตัว</a>
    ${cfg.gaMeasurementId ? '<button class="linkbtn" type="button" data-action="cookie-settings">ตั้งค่าคุกกี้</button>' : ""}
  </nav>
</footer>
</div>
</body>
</html>
`;
}

const tagLinks = (tags) => tags.map((t) => `<a href="${u("/")}?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join("");
const quotePath = (id) => `/quote/${id}/`;

/* ---------- หน้าแรก ---------- */
const tagCount = new Map();
quotes.forEach((q) => q.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
const tagsSorted = [...tagCount.keys()].sort((a, b) => tagCount.get(b) - tagCount.get(a) || a.localeCompare(b, "th"));
const searchIndex = quotes.map((q) => ({ id: q.id, q: q.quote, t: q.tags, k: q.kw, p: q.products.map((p) => `${p.name} ${p.desc}`) }));
const first = quotes[0];

const indexBody = `
<section class="hero" aria-labelledby="h1">
  <h1 id="h1">พิมพ์คำคม แล้วเจอของที่ใช่</h1>
  <p class="lead">ลองพิมพ์ว่า “ง่วง” “ปวดหลัง” “เงินเดือน” หรือกดหมวดอารมณ์ด้านล่าง เว็บจะหาคำคมที่ตรงกับความรู้สึก พร้อมเซตสินค้าที่เข้ากัน</p>
  <form class="search" id="searchForm" role="search">
    <input id="q" type="search" autocomplete="off" placeholder="พิมพ์คำคม หรืออารมณ์ เช่น ไม่เข้มข้น เราไม่นอน" aria-label="ค้นหาคำคม">
    <button class="btn btn-primary" type="submit">ค้นหา</button>
  </form>
  <div class="chips" id="chips" role="group" aria-label="หมวดอารมณ์">
    <button class="chip" type="button" data-tag="" aria-pressed="true">ทั้งหมด</button>
    ${tagsSorted.map((t) => `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="false">#${esc(t)}</button>`).join("\n    ")}
  </div>
</section>
<section class="stage single" id="daily" aria-label="คำคมประจำวัน">
  <div class="quote-pane">
    <div class="label">คำคมประจำวัน</div>
    <p class="dq">${esc(first.quote)}</p>
    <div class="tags">${first.tags.map((t) => "#" + esc(t)).join("  ")}</div>
    <div class="actions">
      <a class="btn btn-ghost" data-daily-link href="${u(quotePath(first.id))}">ดูของคู่ใจ</a>
      <button class="btn btn-ghost" type="button" data-action="random">สุ่มคำคมอื่น</button>
    </div>
  </div>
</section>
<div class="list-head">
  <h2 id="listTitle">คำคมทั้งหมด</h2>
  <span class="count" id="listCount">${quotes.length} คำคม</span>
</div>
<div class="empty" id="empty" hidden>
  <p>ยังไม่มีคำคมที่ตรงกับคำนี้ ลองคำสั้นลง หรือกดหมวดอารมณ์ด้านบน</p>
  <div class="row"></div>
</div>
<section class="grid" id="list" aria-label="รายการคำคม">
${quotes.map((q) => `  <a class="qcard" href="${u(quotePath(q.id))}" data-id="${esc(q.id)}"><span class="q">${esc(q.quote)}</span><span class="meta">${q.tags.map((t) => "#" + esc(t)).join(" ")} · ${q.products.length} ชิ้น</span></a>`).join("\n")}
</section>
<noscript><p>ช่องค้นหาและปุ่มกรองต้องเปิด JavaScript แต่คุณยังกดเลือกคำคมจากรายการด้านบนได้ตามปกติ</p></noscript>
<script type="application/json" id="kk-index">${jsonForHtml(searchIndex)}</script>
`;

/* ---------- หน้าต่อคำคม ---------- */
function productItem(q, p) {
  const shop = buyLink("shopee", p), laz = buyLink("lazada", p);
  const attrs = (platform, l) => `target="_blank" rel="sponsored nofollow noopener noreferrer" href="${esc(l.url)}" data-track="click_affiliate" data-quote-id="${esc(q.id)}" data-product="${esc(p.name)}" data-platform="${platform}" data-aff="${l.aff ? 1 : 0}"`;
  const thumb = p.image
    ? `<div class="thumb"><img src="${esc(assetUrl(p.image))}" alt="${esc(p.name)}" width="72" height="72" loading="lazy" referrerpolicy="no-referrer"></div>`
    : `<div class="thumb">${PLACEHOLDER}</div>`;
  return `    <li class="item">
      ${thumb}
      <div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p></div>
      <div class="links">
        <a class="btn btn-hot" ${attrs("shopee", shop)}>ดูที่ Shopee</a>
        <a class="btn btn-line" ${attrs("lazada", laz)}>ดูที่ Lazada</a>
      </div>
    </li>`;
}

function related(q) {
  const scored = quotes.filter((x) => x.id !== q.id)
    .map((x) => ({ x, n: x.tags.filter((t) => q.tags.includes(t)).length }))
    .sort((a, b) => b.n - a.n);
  const pick = scored.filter((s) => s.n > 0);
  return (pick.length ? pick : scored).slice(0, 6).map((s) => s.x);
}

function quotePage(q) {
  const listText = `“${q.quote}”\nของคู่ใจ:\n` + q.products.map((p) => `- ${p.name} (${p.desc})`).join("\n");
  const rel = related(q);
  const desc = `ดูของคู่ใจสำหรับคนอินคำคม “${q.quote}” ได้แก่ ${q.products.map((p) => p.name).join(" ")}`.slice(0, 158);
  const body = `
<a class="crumb" href="${u("/")}">← คำคมทั้งหมด</a>
<article class="stage">
  <div class="quote-pane">
    <div class="label">คำคมคู่ใจ</div>
    <blockquote><p>${esc(q.quote)}</p></blockquote>
    <div class="tags">${tagLinks(q.tags)}</div>
    <div class="actions">
      <button class="btn btn-ghost" type="button" data-action="random">สุ่มคำคมอื่น</button>
      <button class="btn btn-ghost" type="button" data-action="copy-link" data-quote-id="${esc(q.id)}">คัดลอกลิงก์</button>
      <button class="btn btn-ghost" type="button" data-action="share" data-quote-id="${esc(q.id)}" data-title="${esc(`“${q.quote}” | ${cfg.siteName}`)}" hidden>แชร์</button>
    </div>
  </div>
  <div class="set-pane">
    <div class="set-head">
      <h2>ของคู่ใจสำหรับคำคมนี้</h2>
      <button class="linkbtn" type="button" data-action="copy" data-ok="คัดลอกรายการเซตแล้ว" data-text="${esc(listText)}">คัดลอกรายการ</button>
    </div>
    <ul class="items">
${q.products.map((p) => productItem(q, p)).join("\n")}
    </ul>
  </div>
</article>
<div class="list-head"><h2>คำคมที่อาจถูกใจ</h2></div>
<section class="grid" aria-label="คำคมที่เกี่ยวข้อง">
${rel.map((r) => `  <a class="qcard" href="${u(quotePath(r.id))}"><span class="q">${esc(r.quote)}</span><span class="meta">${r.tags.map((t) => "#" + esc(t)).join(" ")} · ${r.products.length} ชิ้น</span></a>`).join("\n")}
</section>
`;
  return shell({ title: `“${q.quote}” | ${cfg.siteName}`, desc, p: quotePath(q.id), image: q.og, body });
}

/* ---------- หน้าเสริม ---------- */
const contactLine = cfg.contactEmail ? `<p>ติดต่อเรา: ${esc(cfg.contactEmail)}</p>` : "";
const aboutBody = `
<div class="prose">
  <h1>เกี่ยวกับ${esc(cfg.siteName)}</h1>
  <p>${esc(cfg.siteName)} เป็นเว็บที่เริ่มจากคำคมหรือความรู้สึกของคุณ แล้วหาสินค้าที่เข้ากับคำคมนั้นมาให้ เช่น คนที่อินกับ “ไม่เข้มข้น เราไม่นอน” ก็จะเจอกาแฟ แก้วเก็บความเย็น และแผ่นเจลประคบตา</p>
  <h2>เว็บนี้หารายได้อย่างไร</h2>
  <p>ปุ่ม Shopee และ Lazada อาจเป็นลิงก์พันธมิตร (Affiliate) เมื่อคุณซื้อสินค้าผ่านลิงก์ เจ้าของเว็บอาจได้รับค่าคอมมิชชันจากร้านค้าหรือแพลตฟอร์ม ราคาที่คุณจ่ายไม่ได้เพิ่มขึ้น</p>
  <h2>เรื่องที่ควรรู้</h2>
  <ul>
    <li>เราแนะนำประเภทสินค้าที่เข้ากับอารมณ์ของคำคม ไม่ได้ทดสอบสินค้าทุกชิ้น</li>
    <li>ราคา สต็อก และรีวิว ให้ดูที่หน้าร้านก่อนสั่ง</li>
    <li>เราไม่อ้างสรรพคุณทางการแพทย์ของสินค้า</li>
  </ul>
  ${contactLine}
</div>`;
const privacyBody = `
<div class="prose">
  <h1>นโยบายความเป็นส่วนตัว</h1>
  <h2>ข้อมูลที่เว็บเก็บ</h2>
  <ul>
    <li>เว็บนี้ไม่มีระบบสมาชิก และไม่เก็บชื่อ อีเมล หรือเบอร์โทรของผู้เข้าชม</li>
    ${cfg.gaMeasurementId ? "<li>เมื่อคุณกดยอมรับคุกกี้ เว็บจะใช้ Google Analytics 4 เพื่อดูสถิติการเข้าชม เช่น หน้าที่เปิด การคลิกปุ่มซื้อ และคำค้นที่ไม่พบผลลัพธ์ หากไม่ยอมรับ เว็บจะไม่โหลด Google Analytics</li>" : "<li>เว็บนี้ยังไม่ได้เปิดใช้ Google Analytics</li>"}
    ${cfg.trackEndpoint ? "<li>เว็บส่งเหตุการณ์แบบไม่ระบุตัวตน (หน้าที่เปิด คำคม สินค้า แพลตฟอร์ม และเวลา) ไปยังเซิร์ฟเวอร์ของเจ้าของเว็บเพื่อดูว่าสินค้าไหนมีคนสนใจ ไม่มีการส่งชื่อหรืออีเมลของคุณ</li>" : ""}
    <li>เว็บเก็บค่าความยินยอมคุกกี้ไว้ในเบราว์เซอร์ของคุณเอง (localStorage)</li>
  </ul>
  <h2>เมื่อคุณคลิกไปร้านค้า</h2>
  <p>เมื่อกดปุ่ม Shopee หรือ Lazada คุณจะออกจากเว็บนี้ไปยังเว็บไซต์ของเขา ซึ่งอาจใช้คุกกี้ของตัวเองเพื่อระบุว่าคำสั่งซื้อมาจากลิงก์ของเรา โปรดดูนโยบายของแต่ละแพลตฟอร์ม</p>
  <h2>ลิงก์พันธมิตร</h2>
  <p>บางลิงก์เป็นลิงก์ Affiliate ซึ่งทำให้เจ้าของเว็บอาจได้ค่าคอมมิชชัน โดยราคาที่คุณจ่ายไม่เปลี่ยน</p>
  ${contactLine}
</div>`;
const notFoundBody = `
<div class="prose">
  <h1>ไม่พบหน้านี้</h1>
  <p>ลิงก์อาจผิด หรือคำคมนี้ถูกเอาออกแล้ว</p>
  <p><a class="btn btn-primary" href="${u("/")}">กลับไปหน้าคำคมทั้งหมด</a></p>
</div>`;

const islandBody = island ? `
<section class="hero" aria-labelledby="h1">
  <h1 id="h1">${esc(island.title || "เกาะคำคม")}</h1>
  <p class="lead">วางไอเทมทีละชิ้นลงบนเกาะ ชิ้นที่เข้ากันจะช่วยให้ชิ้นอื่นโตขึ้น วางได้ ${island.items.length} เทิร์น ลำดับที่เลือกมีผลต่อฉากจบ ลองหาลำดับที่ได้ฉากจบที่ใช่</p>
</section>
<section class="island" aria-label="เกมเกาะคำคม">
  <p class="turn" id="turnInfo" aria-live="polite"></p>
  <div class="board" id="board"></div>
  <div class="tray" id="tray" role="group" aria-label="ไอเทมที่ยังไม่ได้วาง"></div>
  <ol class="log" id="log" aria-live="polite" aria-label="บันทึกเหตุการณ์"></ol>
  <div class="ending" id="ending" hidden>
    <h2 id="endName"></h2>
    <p id="endText"></p>
    <p class="muted" id="endStat"></p>
    <div class="actions">
      <button class="btn btn-primary" type="button" id="shareBtn">แชร์ผลของฉัน</button>
      <button class="btn btn-line" type="button" id="again">เล่นใหม่</button>
    </div>
    <div id="shopWrap" hidden>
      <div class="list-head"><h2>ของคู่ใจสำหรับเกาะของคุณ</h2></div>
      <ul class="items" id="shop"></ul>
    </div>
  </div>
</section>
<noscript><p>เกมนี้ต้องเปิด JavaScript ถึงจะเล่นได้</p></noscript>
<script type="application/json" id="island-data">${jsonForHtml({ config: island, products: islandProducts })}</script>
` : "";

/* ---------- เขียนไฟล์ ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
let htmlCount = 0;
const write = (rel, content) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  if (rel.endsWith(".html")) htmlCount++;
};
if (fs.existsSync(path.join(ROOT, "public"))) fs.cpSync(path.join(ROOT, "public"), DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "src/style.css"), path.join(DIST, "assets/style.css"));
fs.copyFileSync(path.join(ROOT, "src/app.js"), path.join(DIST, "assets/app.js"));

const desc = `${cfg.tagline || "ค้นหาคำคมที่ตรงใจ แล้วเจอของที่เข้ากัน"} มี ${quotes.length} คำคม พร้อมเซตสินค้าที่เข้ากับอารมณ์`;
write("index.html", shell({ title: `${cfg.siteName} | ค้นหาคำคม แล้วเจอของที่เข้ากับอารมณ์`, desc, p: "/", body: indexBody }));
quotes.forEach((q) => write(`quote/${q.id}/index.html`, quotePage(q)));
write("about/index.html", shell({ title: `เกี่ยวกับเว็บนี้ | ${cfg.siteName}`, desc: `รู้จัก ${cfg.siteName} และวิธีที่เว็บหารายได้`, p: "/about/", body: aboutBody }));
write("privacy/index.html", shell({ title: `นโยบายความเป็นส่วนตัว | ${cfg.siteName}`, desc: `นโยบายความเป็นส่วนตัวของ ${cfg.siteName}`, p: "/privacy/", body: privacyBody }));
if (island) {
  const gDir = path.join(ROOT, "src/grow");
  const gV = hash8(fs.readFileSync(path.join(gDir, "island.js"), "utf8") + fs.readFileSync(path.join(gDir, "engine.mjs"), "utf8"));
  fs.mkdirSync(path.join(DIST, "assets/grow"), { recursive: true });
  // เผยแพร่เอนจินเป็น .js (ไม่ใช่ .mjs) เพราะโฮสต์บางเจ้าส่ง .mjs เป็น octet-stream แล้วเบราว์เซอร์ปฏิเสธโหลดโมดูล
  fs.copyFileSync(path.join(gDir, "engine.mjs"), path.join(DIST, "assets/grow/engine.js"));
  fs.writeFileSync(path.join(DIST, "assets/grow/island.js"), fs.readFileSync(path.join(gDir, "island.js"), "utf8").replace('"./engine.mjs"', '"./engine.js"'));
  write("island/index.html", shell({
    title: `${island.title || "เกาะคำคม"} | เกมวางไอเทมให้เกาะโต | ${cfg.siteName}`,
    desc: "เกมวางไอเทมทีละชิ้น ดูว่าลำดับที่เลือกพาเกาะของคุณไปจบแบบไหน พร้อมไอเดียของคู่ใจตามเกาะของคุณ",
    p: "/island/", body: islandBody,
    head: `<script type="module" src="${u("/assets/grow/island.js")}?v=${gV}"></script>`
  }));
}
write("404.html", shell({ title: `ไม่พบหน้านี้ | ${cfg.siteName}`, desc: "ไม่พบหน้าที่คุณต้องการ", p: "/404.html", body: notFoundBody, noindex: true }));
write("search-index.json", JSON.stringify(searchIndex));

const today = new Date().toISOString().slice(0, 10);
const urls = ["/", ...quotes.map((q) => quotePath(q.id)), ...(island ? ["/island/"] : []), "/about/", "/privacy/"];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${esc(abs(p))}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);

/* ---------- สรุปผล ---------- */
console.log(`✓ สร้างเว็บเสร็จ: ${quotes.length} คำคม, ${productCount} สินค้า, ${htmlCount} หน้า HTML → ${path.relative(process.cwd(), DIST) || "dist"}/`);
console.log(`  ลิงก์ Affiliate จริง: ${affFilled}/${affSlots} ช่อง (ช่องที่ว่างจะพาไปหน้าค้นหาในร้าน)`);
if (linkHosts.size) console.log(`  ลิงก์ Affiliate ชี้ไปโดเมน: ${[...linkHosts].sort().join(", ")} (ตรวจว่าเป็นของแพลตฟอร์มจริงทุกโดเมน)`);
if (islandReport && !islandReport.skipped) {
  console.log(`  เกาะคำคม: ลองครบ ${islandReport.total.toLocaleString("en-US")} ลำดับ ฉากจบที่ได้: ` + Object.entries(islandReport.counts).map(([id, n]) => `${id} ${((n / islandReport.total) * 100).toFixed(1)}%`).join(", "));
}
console.log(`  สินค้าที่ยังไม่มีรูป: ${noImage}/${productCount}`);
const noOg = quotes.filter((q) => !q.og).length;
console.log(`  คำคมที่ยังไม่มีรูปแชร์ (og_image): ${noOg}/${quotes.length}${cfg.ogDefaultImage ? " (ใช้รูปเริ่มต้นแทน)" : ""}`);
warnings.forEach((w) => console.warn("  ! " + w));
