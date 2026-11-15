// เอนจินเกม "เกาะคำคม" แบบ data-driven: กติกาทั้งหมดอยู่ใน config (data/island.json)
// ไฟล์นี้ไม่รู้จัก DOM จึงรันได้ทั้งในเบราว์เซอร์และ Node (ทดสอบ วิเคราะห์ หรือรันฝั่งเซิร์ฟเวอร์ได้)
//
// กติกาของ 1 เทิร์น:
//  1) ผู้เล่นวางไอเทมที่ยังไม่เคยวาง 1 ชิ้น เริ่มที่เลเวล 1
//  2) ไอเทมอื่นที่อยู่บนเกาะ (เรียงตามลำดับการวาง) พยายามขึ้นเลเวลถัดไป ถ้าไอเทมที่กฎต้องการมีอยู่และเลเวลถึงเกณฑ์
//  3) ไอเทมที่ถูกประมวลผลก่อนในเทิร์นเดียวกันและเพิ่งขึ้นเลเวล จะนับเป็นเงื่อนไขให้ไอเทมที่ประมวลผลทีหลังทันที
//     (ผลจึงขึ้นกับลำดับการวาง แต่คงที่ทุกครั้ง: ใส่ข้อมูลเดิม ได้ผลเดิม)

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const copy = (x) => JSON.parse(JSON.stringify(x));

export function validateConfig(cfg) {
  const errors = [];
  if (!isObj(cfg) || !Array.isArray(cfg.items) || !cfg.items.length) return ["config ต้องมี items อย่างน้อย 1 ชิ้น"];
  const ids = new Set();
  for (const it of cfg.items) {
    if (!it || typeof it.id !== "string" || !/^[a-z0-9-]+$/.test(it.id)) { errors.push(`id ไอเทมไม่ถูกต้อง: ${JSON.stringify(it && it.id)}`); continue; }
    if (ids.has(it.id)) errors.push(`id ไอเทมซ้ำ: ${it.id}`);
    ids.add(it.id);
  }
  for (const it of cfg.items) {
    if (!it || !ids.has(it.id)) continue;
    if (!Number.isInteger(it.maxLevel) || it.maxLevel < 1 || it.maxLevel > 9) errors.push(`${it.id}: maxLevel ต้องเป็นจำนวนเต็ม 1 ถึง 9`);
    for (const [lv, rule] of Object.entries(it.rules || {})) {
      const n = Number(lv);
      if (!Number.isInteger(n) || n < 2 || n > it.maxLevel) errors.push(`${it.id}: กฎของเลเวล "${lv}" อยู่นอกช่วง 2 ถึง ${it.maxLevel}`);
      if (!isObj(rule)) { errors.push(`${it.id}: กฎเลเวล ${lv} ต้องเป็น object`); continue; }
      for (const [rid, min] of Object.entries(rule.requires || {})) {
        if (!ids.has(rid)) errors.push(`${it.id}: กฎเลเวล ${lv} ต้องการไอเทมที่ไม่มีอยู่ "${rid}"`);
        else if (rid === it.id) errors.push(`${it.id}: กฎเลเวล ${lv} ต้องการตัวเอง`);
        else {
          const dep = cfg.items.find((x) => x.id === rid);
          if (!Number.isInteger(min) || min < 1 || (dep && min > dep.maxLevel)) errors.push(`${it.id}: กฎเลเวล ${lv} ต้องการ ${rid} เลเวล ${min} ซึ่งเกิน maxLevel (${dep && dep.maxLevel}) หรือไม่ใช่จำนวนเต็ม`);
        }
      }
      if (rule.delta !== undefined && (!Number.isInteger(rule.delta) || rule.delta < 1)) errors.push(`${it.id}: delta ต้องเป็นจำนวนเต็มตั้งแต่ 1`);
    }
  }
  const endIds = new Set();
  for (const e of cfg.endings || []) {
    if (!e || typeof e.id !== "string") { errors.push("ฉากจบต้องมี id"); continue; }
    endIds.add(e.id);
    for (const rid of Object.keys(e.min || {})) if (!ids.has(rid)) errors.push(`ฉากจบ ${e.id}: อ้างถึงไอเทมที่ไม่มีอยู่ "${rid}"`);
  }
  if (!cfg.fallbackEnding || !(cfg.endings || []).some((e) => e.id === cfg.fallbackEnding)) errors.push("fallbackEnding ต้องชี้ไปที่ฉากจบที่มีอยู่ใน endings");
  return errors;
}

export class GrowEngine {
  constructor(config) {
    const errs = validateConfig(config);
    if (errs.length) throw new Error("config เกมไม่ถูกต้อง:\n- " + errs.join("\n- "));
    this.cfg = config;
    this.defs = new Map(config.items.map((i) => [i.id, i]));
    this.listeners = new Set();
    this.reset(false);
  }

  reset(notify = true) {
    this.turn = 0;
    this.items = {};
    for (const id of this.defs.keys()) this.items[id] = { level: 0, placedTurn: null };
    this.history = [];
    if (notify) this._emit();
  }

  /** สำเนาสถานะเพื่อลองเดินต่อ (ใช้ในตัววิเคราะห์ ไม่ตรวจ config ซ้ำ และไม่คัดลอก history เพื่อความเร็ว) */
  clone({ history = false } = {}) {
    const e = Object.create(GrowEngine.prototype);
    e.cfg = this.cfg;
    e.defs = this.defs;
    e.listeners = new Set();
    e.turn = this.turn;
    e.items = {};
    for (const k of Object.keys(this.items)) e.items[k] = { ...this.items[k] };
    e.history = history ? copy(this.history) : [];
    return e;
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.getState()); return () => this.listeners.delete(fn); }
  _emit() { if (!this.listeners.size) return; const s = this.getState(); this.listeners.forEach((f) => f(s)); }

  available() { return [...this.defs.keys()].filter((id) => this.items[id].placedTurn === null); }
  isOver() { return this.available().length === 0; }

  getState() {
    return copy({ turn: this.turn, items: this.items, history: this.history, ending: this.ending() });
  }

  placeItem(id) { return copy(this._place(id)); }

  /** เหมือน placeItem แต่ไม่คัดลอกผลลัพธ์ (เร็วกว่า ใช้ในตัววิเคราะห์ที่ไม่แก้ผลลัพธ์) */
  _place(id) {
    if (!this.defs.has(id)) throw new Error(`ไม่รู้จักไอเทม "${id}"`);
    if (this.items[id].placedTurn !== null) throw new Error(`วางซ้ำไม่ได้: "${id}" อยู่บนเกาะแล้ว`);
    this.turn += 1;
    this.items[id] = { level: 1, placedTurn: this.turn };
    const changes = { [id]: { from: 0, to: 1 } };
    const events = [];

    const active = Object.entries(this.items)
      .filter(([k, v]) => v.placedTurn !== null && k !== id)
      .sort((a, b) => a[1].placedTurn - b[1].placedTurn);

    for (const [k, st] of active) {
      const def = this.defs.get(k);
      if (st.level >= def.maxLevel) continue;
      const rule = (def.rules || {})[st.level + 1];
      if (rule && this._meets(rule.requires)) {
        const from = st.level;
        st.level = Math.min(def.maxLevel, st.level + (rule.delta || 1));
        changes[k] = { from, to: st.level };
        if (rule.event) events.push({ item: k, level: st.level, text: rule.event });
      }
    }
    const log = { turn: this.turn, placed: id, changes, events };
    this.history.push(log);
    this._emit();
    return log;
  }

  _meets(req) {
    if (!req) return true;
    return Object.entries(req).every(([rid, min]) => this.items[rid].placedTurn !== null && this.items[rid].level >= min);
  }

  /**
   * ฉากจบจะมีค่าเมื่อวางครบทุกชิ้นเท่านั้น (ยังเล่นอยู่ = null) ตรวจตามลำดับใน endings ฉากแรกที่เงื่อนไขครบจะชนะ
   * เงื่อนไขที่ใช้ได้ (ใส่ได้หลายข้อในฉากเดียว ต้องผ่านทุกข้อ):
   *   allMax: true        ทุกไอเทมถึงเลเวลสูงสุด
   *   maxedAtLeast: n     ไอเทมที่ถึงเลเวลสูงสุดอย่างน้อย n ชิ้น
   *   min: {id: เลเวล}    ไอเทมที่ระบุต้องมีเลเวลอย่างน้อยเท่านี้
   * หมายเหตุ: ไอเทมที่วางเป็นชิ้นสุดท้ายจะได้แค่เลเวล 1 เสมอ (โตได้เทิร์นละ 1 ขั้น) ดังนั้น allMax ใช้ได้
   * ก็ต่อเมื่อมีไอเทมที่ maxLevel เป็น 1 ถ้าไม่มี ให้ใช้ maxedAtLeast แทน (ตัววิเคราะห์ analyze.mjs จะบอกถ้าฉากจบเป็นไปไม่ได้)
   */
  ending() {
    if (!this.isOver()) return null;
    const lv = (id) => this.items[id].level;
    const defs = [...this.defs.values()];
    const maxed = defs.filter((d) => lv(d.id) === d.maxLevel).length;
    for (const e of this.cfg.endings) {
      if (e.id === this.cfg.fallbackEnding) continue;
      const hasCond = e.allMax || e.maxedAtLeast || e.min;
      if (!hasCond) continue;
      if (e.allMax && maxed !== defs.length) continue;
      if (e.maxedAtLeast && maxed < e.maxedAtLeast) continue;
      if (!Object.entries(e.min || {}).every(([id, m]) => lv(id) >= m)) continue;
      return e.id;
    }
    return this.cfg.fallbackEnding;
  }
}
