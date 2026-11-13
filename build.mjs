// ตัวสร้างเว็บสถิตของ "คำคมคู่ใจ" ไม่ต้องติดตั้งแพ็กเกจเพิ่ม (ใช้ Node 18 ขึ้นไป)
// รัน: node build.mjs   ผลลัพธ์อยู่ในโฟลเดอร์ dist/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

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
  ...raw,
  affiliateWrap: { shopee: "", lazada: "", ...(raw.affiliateWrap || {}) },
  sources: { quotes_csv_url: "", products_csv_url: "", ...(raw.sources || {}) }
};
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
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function loadTable(name, url) {
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ดึง ${name} จาก ${url} ไม่ได้ (HTTP ${res.status})`);
    return parseCSV(await res.text());
  }
  return parseCSV(fs.readFileSync(path.join(ROOT, "data", name + ".csv"), "utf8"));
}

/* ---------- โหลดและตรวจข้อมูล ---------- */
const quoteRows = await loadTable("quotes", cfg.sources.quotes_csv_url);
const productRows = await loadTable("products", cfg.sources.products_csv_url);

const quotes = [];
const byId = new Map();
for (const r of quoteRows) {
  if (!r.id || !r.quote_text) { warnings.push(`ข้ามแถวคำคมที่ไม่มี id หรือ quote_text: ${JSON.stringify(r).slice(0, 80)}`); continue; }
  if (!/^[a-z0-9-]+$/.test(r.id)) { errors.push(`id "${r.id}" ต้องเป็นตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น`); continue; }
  if (byId.has(r.id)) { errors.push(`id "${r.id}" ซ้ำ`); continue; }
  const q = { id: r.id, quote: r.quote_text, tags: splitList(r.tags), kw: splitList(r.keywords), og: r.og_image, products: [] };
  quotes.push(q);
  byId.set(q.id, q);
}
let affSlots = 0, affFilled = 0, noImage = 0, productCount = 0;
for (const r of productRows) {
  const q = byId.get(r.quote_id);
  if (!q) { warnings.push(`สินค้า "${r.product_name}" อ้างถึง quote_id "${r.quote_id}" ที่ไม่มี จึงข้ามไป`); continue; }
  if (!r.product_name) { warnings.push(`ข้ามแถวสินค้าของ ${r.quote_id} ที่ไม่มี product_name`); continue; }
  const p = {
    name: r.product_name, desc: r.product_desc, image: r.image_url,
    shopee: r.shopee_aff_link, lazada: r.lazada_aff_link, kw: r.search_keyword || r.product_name
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

/* ---------- เทมเพลตหน้า ---------- */
const cssV = hash8(fs.readFileSync(path.join(ROOT, "src/style.css"), "utf8"));
const jsV = hash8(fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8"));
const kkConfig = jsonForHtml({ ga: cfg.gaMeasurementId, endpoint: cfg.trackEndpoint, base: cfg.basePath });

function shell({ title, desc, p, image, body, noindex }) {
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
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="${u("/")}"><span class="mark" aria-hidden="true">“</span>${esc(cfg.siteName)}</a>
  <nav aria-label="เมนูหลัก"><a href="${u("/about/")}">เกี่ยวกับเว็บนี้</a></nav>
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

/* ---------- เขียนไฟล์ ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
const write = (rel, content) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
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
write("404.html", shell({ title: `ไม่พบหน้านี้ | ${cfg.siteName}`, desc: "ไม่พบหน้าที่คุณต้องการ", p: "/404.html", body: notFoundBody, noindex: true }));
write("search-index.json", JSON.stringify(searchIndex));

const today = new Date().toISOString().slice(0, 10);
const urls = ["/", ...quotes.map((q) => quotePath(q.id)), "/about/", "/privacy/"];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${esc(abs(p))}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);

/* ---------- สรุปผล ---------- */
const pages = quotes.length + 5;
console.log(`✓ สร้างเว็บเสร็จ: ${quotes.length} คำคม, ${productCount} สินค้า, ${pages} หน้า → ${path.relative(process.cwd(), DIST) || "dist"}/`);
console.log(`  ลิงก์ Affiliate จริง: ${affFilled}/${affSlots} ช่อง (ช่องที่ว่างจะพาไปหน้าค้นหาในร้าน)`);
console.log(`  สินค้าที่ยังไม่มีรูป: ${noImage}/${productCount}`);
const noOg = quotes.filter((q) => !q.og).length;
console.log(`  คำคมที่ยังไม่มีรูปแชร์ (og_image): ${noOg}/${quotes.length}${cfg.ogDefaultImage ? " (ใช้รูปเริ่มต้นแทน)" : ""}`);
warnings.forEach((w) => console.warn("  ! " + w));
