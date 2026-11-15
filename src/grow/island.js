/* เกาะคำคม: ส่วนแสดงผลของเกม (เอนจินอยู่ใน engine.mjs ซึ่งไม่แตะ DOM) */
import { GrowEngine } from "./engine.mjs";

const data = JSON.parse(document.getElementById("island-data").textContent);
const cfg = data.config;
const products = data.products; // { itemId: [ { name, shopee:{url,aff}, lazada:{url,aff} } ] }
const engine = new GrowEngine(cfg);
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const delay = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
const $ = (s) => document.querySelector(s);
const def = (id) => cfg.items.find((i) => i.id === id);

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => {
    if (k === "class") e.className = attrs[k];
    else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  });
  [].concat(kids || []).forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
}
const track = (name, params) => { if (window.KKtrack) window.KKtrack(name, params || {}); };

const slots = new Map();
const board = $("#board");
cfg.items.forEach((it) => {
  const pips = el("span", { class: "pips", "aria-hidden": "true" });
  const slot = el("div", { class: "slot", "data-id": it.id }, [
    el("span", { class: "emo", "aria-hidden": "true" }, it.emoji),
    el("span", { class: "nm" }, it.name),
    pips,
    el("span", { class: "sr", "data-sr": "" }, "")
  ]);
  slots.set(it.id, { slot, pips });
  board.append(slot);
});

function drawSlot(id) {
  const st = engine.items[id], d = def(id), s = slots.get(id);
  s.slot.classList.toggle("empty", st.placedTurn === null);
  s.pips.textContent = st.placedTurn === null ? "" : "●".repeat(st.level) + "○".repeat(d.maxLevel - st.level);
  s.slot.querySelector("[data-sr]").textContent = st.placedTurn === null ? "ยังไม่ได้วาง" : "เลเวล " + st.level + " จาก " + d.maxLevel;
}

const tray = $("#tray");
let busy = false;
function drawTray() {
  tray.textContent = "";
  engine.available().forEach((id) => {
    const d = def(id);
    tray.append(el("button", {
      class: "pick", type: "button", title: d.desc,
      onclick: () => play(id)
    }, [el("span", { "aria-hidden": "true" }, d.emoji), " " + d.name]));
  });
  tray.hidden = engine.isOver();
  $("#turnInfo").textContent = engine.isOver() ? "ครบทุกชิ้นแล้ว" : "เทิร์น " + (engine.turn + 1) + " จาก " + cfg.items.length + " เลือกไอเทมที่จะวาง";
}

const logEl = $("#log");
let turnBox = null;
function newTurnBox() { turnBox = el("li", {}); logEl.prepend(turnBox); }
function logLine(text, cls) { turnBox.append(el("span", { class: "l " + (cls || "") }, text)); }
function flash(id, cls) {
  const s = slots.get(id).slot;
  s.classList.remove("pop", "up");
  void s.offsetWidth;
  s.classList.add(cls);
}

async function play(id) {
  if (busy || engine.isOver()) return;
  busy = true;
  tray.setAttribute("aria-busy", "true");
  try {
    const log = engine.placeItem(id);
    const d = def(id);
    newTurnBox();
    drawSlot(id); flash(id, "pop");
    logLine("เทิร์น " + log.turn + ": วาง " + d.emoji + " " + d.name);
    await delay(350);
    for (const [k, ch] of Object.entries(log.changes)) {
      if (k === id) continue;
      drawSlot(k); flash(k, "up");
      logLine("   " + def(k).emoji + " " + def(k).name + " โตเป็นเลเวล " + ch.to, "sub");
      await delay(300);
    }
    for (const ev of log.events) {
      logLine("✨ " + ev.text, "ev");
      await delay(650);
    }
    drawTray();
    if (engine.isOver()) showEnding();
  } finally {
    busy = false;
    tray.removeAttribute("aria-busy");
  }
}

function showEnding() {
  const st = engine.getState();
  const end = cfg.endings.find((e) => e.id === st.ending);
  const panel = $("#ending");
  panel.hidden = false;
  $("#endName").textContent = end.name;
  $("#endText").textContent = end.text;
  const maxed = cfg.items.filter((i) => st.items[i.id].level === i.maxLevel).length;
  $("#endStat").textContent = "ไอเทมที่โตเต็มที่ " + maxed + " จาก " + cfg.items.length + " ชิ้น";
  track("island_ending", { ending: st.ending, maxed: maxed });

  // สินค้าที่เข้ากับเกาะ: เลือกไอเทมที่เลเวลสูงสุด 3 อันดับแรก
  const top = cfg.items.map((i) => ({ i, lv: st.items[i.id].level }))
    .sort((a, b) => b.lv - a.lv).slice(0, 3);
  const box = $("#shop");
  box.textContent = "";
  const seen = new Set();
  top.forEach(({ i }) => {
    (products[i.id] || []).filter((p) => !seen.has(p.name)).slice(0, 2).forEach((p) => {
      seen.add(p.name);
      const attrs = (platform, l) => ({
        class: "btn " + (platform === "shopee" ? "btn-hot" : "btn-line"), target: "_blank",
        rel: "sponsored nofollow noopener noreferrer", href: l.url,
        "data-track": "click_affiliate", "data-quote-id": "island-" + i.id, "data-product": p.name,
        "data-platform": platform, "data-aff": l.aff ? "1" : "0"
      });
      box.append(el("li", { class: "item" }, [
        el("div", { class: "thumb", "aria-hidden": "true" }, i.emoji),
        el("div", {}, [el("h3", {}, p.name), el("p", {}, "จากด้าน " + i.name)]),
        el("div", { class: "links" }, [
          el("a", attrs("shopee", p.shopee), "ดูที่ Shopee"),
          el("a", attrs("lazada", p.lazada), "ดูที่ Lazada")
        ])
      ]));
    });
  });
  $("#shopWrap").hidden = !box.children.length;
  panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
}

$("#again").addEventListener("click", () => {
  if (busy) return;
  track("island_restart", {});
  engine.reset(false);
  cfg.items.forEach((i) => drawSlot(i.id));
  logEl.textContent = "";
  turnBox = null;
  $("#ending").hidden = true;
  drawTray();
});
$("#shareBtn").addEventListener("click", () => {
  const st = engine.getState();
  const end = cfg.endings.find((e) => e.id === st.ending);
  const order = st.history.map((h) => def(h.placed).emoji).join(" ");
  const text = "เกาะคำคมของฉันจบแบบ “" + end.name + "”  " + order + "  ลองเล่นดู: " + location.href.split("#")[0];
  track("island_share", { ending: st.ending });
  if (navigator.share) navigator.share({ title: "เกาะคำคม", text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { $("#shareBtn").textContent = "คัดลอกแล้ว"; }, () => {});
});

cfg.items.forEach((i) => drawSlot(i.id));
drawTray();
