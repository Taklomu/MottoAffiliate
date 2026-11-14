/* คำคมคู่ใจ: สคริปต์ฝั่งผู้เข้าชม (ค้นหา, สุ่ม, คัดลอก, วัดผลคลิก, ความยินยอมคุกกี้) */
(function () {
  "use strict";
  const KK = window.KK || { ga: "", endpoint: "", base: "" };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === "class") e.className = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    [].concat(kids || []).forEach((c) => {
      if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    });
    return e;
  }

  /* ---------- toast + คัดลอก ---------- */
  let toastTimer;
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = el("div", { class: "toast", id: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function copy(text, okMsg) {
    const fallback = () => {
      const ta = el("textarea", { "aria-hidden": "true", style: "position:fixed;opacity:0;left:-9999px" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : "คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกเอง");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
    } else {
      fallback();
    }
  }

  /* ---------- ความยินยอมคุกกี้ + Google Analytics ---------- */
  const CONSENT_KEY = "kk-consent";
  const getConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } };
  const setConsent = (v) => { try { localStorage.setItem(CONSENT_KEY, v); } catch (e) { /* ไม่เป็นไร */ } };
  let gaLoaded = false;
  function loadGA() {
    if (gaLoaded || !KK.ga) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", KK.ga);
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(KK.ga);
    document.head.append(s);
  }
  // ถอนความยินยอม: สั่ง GA หยุดเก็บ (ga-disable) และลบคุกกี้ของ GA ที่ตั้งไว้แล้ว
  function clearGaCookies() {
    const names = document.cookie.split(";").map((c) => c.split("=")[0].trim())
      .filter((n) => n === "_ga" || n === "_gid" || n.indexOf("_ga_") === 0 || n.indexOf("_gat") === 0);
    const parts = location.hostname.split(".");
    const domains = [""];
    for (let i = 0; i < parts.length - 1; i++) domains.push("." + parts.slice(i).join("."));
    domains.push(location.hostname);
    names.forEach((n) => domains.forEach((d) => {
      document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + (d ? "; domain=" + d : "");
    }));
  }
  function disableGA() {
    if (KK.ga) window["ga-disable-" + KK.ga] = true;
    clearGaCookies();
  }
  function showBanner() {
    if ($(".consent")) return;
    const close = (v) => {
      setConsent(v);
      if (v === "yes") {
        if (KK.ga) window["ga-disable-" + KK.ga] = false;
        loadGA();
      } else {
        disableGA();
      }
      b.remove();
    };
    const b = el("div", { class: "consent", role: "dialog", "aria-label": "ความยินยอมการใช้คุกกี้" }, [
      el("p", {}, [
        "เว็บนี้ใช้ Google Analytics เพื่อดูว่าคำคมและสินค้าไหนมีคนสนใจ จะเริ่มเก็บข้อมูลก็ต่อเมื่อคุณกดยอมรับ ",
        el("a", { href: (KK.base || "") + "/privacy/" }, "อ่านนโยบายความเป็นส่วนตัว")
      ]),
      el("div", { class: "row" }, [
        el("button", { class: "btn btn-line", type: "button", onclick: () => close("no") }, "ไม่ยอมรับ"),
        el("button", { class: "btn btn-primary", type: "button", onclick: () => close("yes") }, "ยอมรับ")
      ])
    ]);
    document.body.append(b);
  }
  if (KK.ga) {
    const c = getConsent();
    if (c === "yes") loadGA();
    else if (c == null) showBanner();
  }

  /* ---------- วัดผล: GA4 (เมื่อยอมรับ) และ endpoint ของคุณเอง (ไม่ระบุตัวตน) ---------- */
  function track(name, params) {
    params = params || {};
    if (window.gtag && getConsent() === "yes") window.gtag("event", name, params);
    if (KK.endpoint && navigator.sendBeacon) {
      try {
        const body = Object.assign({ event: name, path: location.pathname, ts: new Date().toISOString() }, params);
        navigator.sendBeacon(KK.endpoint, new Blob([JSON.stringify(body)], { type: "text/plain" }));
      } catch (e) { /* ไม่เป็นไร */ }
    }
  }

  /* ---------- ค้นหา ---------- */
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const bigrams = (s) => {
    const t = s.replace(/\s/g, "");
    const out = [];
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  function prep(data) {
    data.forEach((d) => {
      d._q = norm(d.q);
      d._hay = norm([d.q].concat(d.t, d.k, d.p).join(" "));
      d._bi = new Set(bigrams(d._hay));
    });
    return data;
  }
  function score(d, q) {
    if (!q) return 1;
    let s = 0;
    if (d._q.includes(q)) s += 50;
    if (d._hay.includes(q)) s += 100;
    q.split(" ").forEach((tk) => { if (tk && d._hay.includes(tk)) s += 30; });
    if (s === 0) {
      const b = bigrams(q);
      if (b.length >= 2) {
        const hit = b.filter((x) => d._bi.has(x)).length;
        if (hit / b.length >= 0.7) s += (hit / b.length) * 20;
      }
    }
    return s;
  }
  const quoteUrl = (id) => (KK.base || "") + "/quote/" + encodeURIComponent(id) + "/";

  function getIndex() {
    const node = $("#kk-index");
    if (node) return Promise.resolve(prep(JSON.parse(node.textContent)));
    return fetch((KK.base || "") + "/search-index.json").then((r) => r.json()).then(prep);
  }
  function goRandom() {
    const here = (location.pathname.match(/\/quote\/([^/]+)\/?$/) || [])[1];
    getIndex().then((data) => {
      const cur = here ? decodeURIComponent(here) : "";
      const pool = data.filter((d) => d.id !== cur);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) location.href = quoteUrl(pick.id);
    }).catch(() => { location.href = (KK.base || "") + "/"; });
  }

  function initIndexPage() {
    const data = prep(JSON.parse($("#kk-index").textContent));
    const grid = $("#list"), input = $("#q"), count = $("#listCount"), title = $("#listTitle"), empty = $("#empty");
    const cards = new Map($$(".qcard", grid).map((c) => [c.dataset.id, c]));
    const chips = $$("#chips .chip");
    const state = { q: "", tag: "" };
    let noResultTimer;

    /* คำคมประจำวัน */
    const daily = $("#daily");
    if (daily && data.length) {
      const d = new Date();
      const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
      const m = data[day % data.length];
      const dateTh = d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
      $(".label", daily).textContent = "คำคมประจำวันที่ " + dateTh;
      $(".dq", daily).textContent = m.q;
      $(".tags", daily).textContent = m.t.map((t) => "#" + t).join("  ");
      $("a[data-daily-link]", daily).href = quoteUrl(m.id);
    }

    function render() {
      const res = data
        .filter((d) => !state.tag || d.t.indexOf(state.tag) >= 0)
        .map((d) => ({ d, s: score(d, state.q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      cards.forEach((c) => { c.hidden = true; });
      res.forEach((x) => { const c = cards.get(x.d.id); if (c) { c.hidden = false; grid.append(c); } });
      const raw = input.value.trim();
      title.textContent = raw ? "ผลค้นหา “" + raw + "”" : (state.tag ? "คำคมหมวด #" + state.tag : "คำคมทั้งหมด");
      count.textContent = res.length + " คำคม";
      chips.forEach((c) => c.setAttribute("aria-pressed", String((c.dataset.tag || "") === state.tag)));
      empty.hidden = res.length > 0;
      if (!res.length) {
        const kw = encodeURIComponent(raw || state.tag);
        $(".row", empty).textContent = "";
        if (raw) {
          $(".row", empty).append(
            el("a", { class: "btn btn-line", target: "_blank", rel: "noopener noreferrer", href: "https://shopee.co.th/search?keyword=" + kw }, "ค้นหา “" + raw + "” บน Shopee"),
            el("a", { class: "btn btn-line", target: "_blank", rel: "noopener noreferrer", href: "https://www.lazada.co.th/catalog/?q=" + kw }, "ค้นหาบน Lazada")
          );
        }
      }
      clearTimeout(noResultTimer);
      if (!res.length && raw.length >= 2) {
        noResultTimer = setTimeout(() => track("search_no_result", { query: raw.slice(0, 80) }), 900);
      }
      try {
        const u = new URL(location.href);
        if (state.tag) u.searchParams.set("tag", state.tag); else u.searchParams.delete("tag");
        history.replaceState(null, "", u);
      } catch (e) { /* ไม่เป็นไร */ }
    }

    input.addEventListener("input", () => { state.q = norm(input.value); render(); });
    $("#searchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      if (raw) track("search", { query: raw.slice(0, 80) });
      const first = cards.size && $$(".qcard", grid).find((c) => !c.hidden);
      if (state.q && first) location.href = first.href;
    });
    chips.forEach((c) => c.addEventListener("click", () => {
      state.tag = c.dataset.tag || "";
      render();
    }));

    const t = new URL(location.href).searchParams.get("tag");
    if (t && data.some((d) => d.t.indexOf(t) >= 0)) state.tag = t;
    render();
  }

  /* ---------- ปุ่มต่างๆ ทั้งเว็บ ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-track],[data-action]");
    if (!t) return;
    if (t.dataset.track) {
      track(t.dataset.track, {
        quote_id: t.dataset.quoteId || "",
        product_name: t.dataset.product || "",
        platform: t.dataset.platform || "",
        is_affiliate: t.dataset.aff === "1"
      });
    }
    const a = t.dataset.action;
    if (!a) return;
    if (a === "copy") copy(t.dataset.text || "", t.dataset.ok || "คัดลอกแล้ว");
    else if (a === "copy-link") { copy(location.href, "คัดลอกลิงก์แล้ว"); track("share_copy_link", { quote_id: t.dataset.quoteId || "" }); }
    else if (a === "share") {
      track("share_native", { quote_id: t.dataset.quoteId || "" });
      navigator.share({ title: t.dataset.title || document.title, url: location.href }).catch(() => {});
    }
    else if (a === "random") { track("random_quote", {}); goRandom(); }
    else if (a === "cookie-settings") showBanner();
  });

  if (navigator.share) $$('[data-action="share"]').forEach((b) => { b.hidden = false; });
  if ($("#kk-index")) initIndexPage();
})();
