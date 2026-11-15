// เซิร์ฟเวอร์ดูตัวอย่างในเครื่อง: node serve.mjs แล้วเปิด http://localhost:4173
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.PORT) || 4173;
// ค่าเริ่มต้นเปิดให้เครื่องนี้เท่านั้น ถ้าอยากดูจากมือถือในวงไวไฟเดียวกัน: HOST=0.0.0.0 node serve.mjs
const HOST = process.env.HOST || "127.0.0.1";
// ให้ดูตัวอย่างใต้ basePath เดียวกับเว็บจริง (เช่น /MottoAffiliate) จะได้เห็นพาธตรงกับ GitHub Pages
let BASE = "";
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(path.dirname(DIST), "site.config.json"), "utf8"));
  if (cfg.basePath) BASE = "/" + String(cfg.basePath).replace(/^\/+|\/+$/g, "");
} catch {}
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400).end("bad request"); return; }
  if (BASE) {
    if (urlPath === "/") { res.writeHead(302, { location: BASE + "/" }).end(); return; }
    if (urlPath === BASE) { res.writeHead(302, { location: BASE + "/" }).end(); return; }
    if (!urlPath.startsWith(BASE + "/")) urlPath = "/__not_found__";
    else urlPath = urlPath.slice(BASE.length);
  }
  let file = path.normalize(path.join(DIST, urlPath));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(403).end("forbidden"); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(fs.existsSync(path.join(DIST, "404.html")) ? fs.readFileSync(path.join(DIST, "404.html")) : "not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => console.log(`ดูตัวอย่างที่ http://localhost:${PORT}${BASE}/`));
