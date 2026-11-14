# MottoAffiliate (คำคมคู่ใจ)

Use Motto to find your favorite products

เว็บค้นหาคำคม แล้วแสดงเซตสินค้าที่เข้ากัน ทุกคำคมมีหน้า URL ของตัวเอง (`/quote/no-sleep/`) พร้อม meta tag สำหรับ Google และการแชร์ลง Facebook/LINE

เป็นเว็บสถิต ใช้แค่ Node 18 ขึ้นไป ไม่ต้อง `npm install` เพราะไม่มี dependency

## ข้อความด้านกฎหมาย (ตรวจก่อนใช้จริง)

- **การเปิดเผยลิงก์ Affiliate:** มีข้อความท้ายทุกหน้าและในหน้า "เกี่ยวกับเว็บนี้" ว่าเจ้าของเว็บอาจได้ค่าคอมมิชชันจากการซื้อผ่านลิงก์
- **นโยบายความเป็นส่วนตัว:** เป็นข้อความตั้งต้นที่ตรงกับสิ่งที่เว็บทำจริง ไม่ใช่คำปรึกษาด้านกฎหมาย ควรให้ผู้รู้ตรวจและปรับให้เข้ากับ PDPA ก่อนเปิดใช้จริง

## จุดเด่น

- แยกข้อมูลออกจากโค้ด (CSV หรือ Google Sheets)
- หน้าแยกต่อคำคม พร้อม sitemap.xml และ robots.txt
- Open Graph และ Twitter card ต่อคำคม
- วัดผลแบบเคารพความเป็นส่วนตัว (GA4 โหลดหลังกดยอมรับคุกกี้เท่านั้น)
- ลิงก์สำรอง: ถ้ายังไม่ใส่ลิงก์ Affiliate ปุ่มซื้อพาไปหน้าค้นหาในร้าน
- build ตรวจข้อมูลก่อนเขียนไฟล์ ลิงก์หรือเส้นทางรูปที่ไม่ปลอดภัยจะหยุด build (ดูหัวข้อ "กติกาที่ build ตรวจ")

## เริ่มใช้งาน

```bash
node build.mjs      # สร้างเว็บลงโฟลเดอร์ dist/
node serve.mjs      # ดูตัวอย่างที่ http://localhost:4173
npm test            # รันชุดทดสอบ (ใช้ node:test ที่มากับ Node)
```

## โครงสร้างไฟล์

| ไฟล์/โฟลเดอร์ | หน้าที่ |
|---|---|
| `data/quotes.csv` | คำคม แท็ก คำค้น และรูปแชร์ |
| `data/products.csv` | สินค้าของแต่ละคำคม พร้อมลิงก์ Affiliate และรูป |
| `site.config.json` | ชื่อเว็บ โดเมน GA4 endpoint วัดผล ฯลฯ |
| `src/style.css`, `src/app.js` | หน้าตาและสคริปต์ฝั่งผู้เข้าชม |
| `public/` | ไฟล์ที่อยากให้ขึ้นเว็บตามที่วางไว้ เช่น `public/og/no-sleep.png`, `public/img/a.jpg` |
| `build.mjs` | ตัวสร้างหน้าเว็บ, sitemap.xml, robots.txt, search-index.json |
| `test/build.test.mjs` | ชุดทดสอบของ build และส่วนถอนความยินยอมคุกกี้ |
| `.github/workflows/deploy.yml` | build แล้วขึ้น GitHub Pages อัตโนมัติเมื่อ push เข้า main |
| `dist/` | ผลลัพธ์ที่เอาไปอัปโหลด (สร้างใหม่ทุกครั้งที่ build) |

## ข้อมูลใน CSV

`quotes.csv`: `id, quote_text, tags, keywords, og_image`
- `id` ใช้เป็น URL ต้องเป็นตัวอังกฤษพิมพ์เล็ก ตัวเลข และขีดกลาง เช่น `no-sleep`
- `tags` และ `keywords` คั่นด้วย `|` เช่น `กาแฟ|ออฟฟิศ`
- `og_image` คือรูปที่ขึ้นตอนแชร์ เช่น `/og/no-sleep.png` (ว่างไว้ได้ จะใช้ `ogDefaultImage`)

`products.csv`: `id, quote_id, product_name, product_desc, image_url, shopee_aff_link, lazada_aff_link, search_keyword`
- `quote_id` ต้องตรงกับ `id` ใน quotes.csv
- ช่อง `*_aff_link` ว่าง = ปุ่มพาไปหน้าค้นหาในร้านด้วย `search_keyword` (ยังไม่ได้ค่าคอม)
- ช่อง `*_aff_link` มีลิงก์ = ใช้ลิงก์นั้น และตั้ง `data-aff="1"` ให้วัดผลแยกได้
- `image_url` คือรูปสินค้า: `/img/a.jpg` (ไฟล์ใน `public/img/`) หรือ `https://...`

## กติกาที่ build ตรวจ

ข้อมูลใน Google Sheets แก้ได้โดยใครก็ตามที่มีสิทธิ์ จึงไม่เชื่อค่าที่กรอกมาตรงๆ ข้อมูลที่ผิดกติกาในตารางนี้ **หยุด build ทันทีและไม่แตะ `dist/` เดิม**

| ช่อง | กติกา | ตัวอย่างที่ถูกปฏิเสธ |
|---|---|---|
| `shopee_aff_link`, `lazada_aff_link` | ต้องเป็น `https://` เต็มรูป ไม่มีชื่อผู้ใช้/รหัสผ่านใน URL | `javascript:alert(1)`, `//evil.example/x`, `http://...`, `data:...` |
| `image_url`, `og_image`, `ogDefaultImage` | `/ชื่อไฟล์` หรือ `https://` ห้ามมีช่องว่าง `\` `..` หรือรูปแบบ `ชื่อ:` นำหน้า | `//evil.example/a.png`, `/\evil.example/a.png`, `/img/../x.png` |
| `affiliateWrap.*` | ขึ้นต้น `https://` และมี `{url}` | `http://...`, เทมเพลตที่ไม่มี `{url}` |
| `trackEndpoint`, `sources.*_csv_url` | ต้องเป็น `https://` | `http://...` |
| `gaMeasurementId` | รูปแบบ `G-XXXXXXXXXX` | `UA-123` |

สิ่งที่ build **เตือนแต่ไม่หยุด:**
- `og_image` หรือ `image_url` ที่ไม่ขึ้นต้นด้วย `/` (เติม `/` ให้อัตโนมัติ)
- ไฟล์รูปที่ชี้ไปยังไม่มีใน `public/`
- `siteUrl` ยังเป็น `example.com`

ตอนสรุปผล build จะพิมพ์รายชื่อโดเมนที่ลิงก์ Affiliate ชี้ไป ให้ตรวจว่าเป็นของแพลตฟอร์มจริงทุกโดเมน ถ้าอยากบังคับ ให้ใส่รายชื่อใน `allowedLinkHosts` (ดูด้านล่าง) ข้อมูลที่โดเมนนอกรายการจะหยุด build

## ใช้ Google Sheets เป็นหลังบ้าน

1. สร้าง Google Sheets 2 แท็บ ชื่อคอลัมน์ตรงกับ CSV ด้านบน
2. File → Share → Publish to web → เลือกแท็บ → เลือกรูปแบบ CSV → Publish
3. คัดลอกลิงก์ที่ได้ ใส่ใน `site.config.json`:
```json
"sources": { "quotes_csv_url": "https://docs.google.com/.../pub?output=csv",
             "products_csv_url": "https://docs.google.com/.../pub?output=csv" }
```
4. รัน `node build.mjs`

ถ้าดึงข้อมูลไม่ได้ build จะหยุดพร้อมข้อความภาษาไทยที่บอกสาเหตุ (หมดเวลา 20 วินาที, HTTP ผิดพลาด, ได้หน้า HTML แทน CSV, ขาดคอลัมน์) และไม่ลบ `dist/` เดิม

หมายเหตุ: Sheets ที่ publish แล้วใครมีลิงก์ก็เปิดอ่านได้ อย่าใส่ข้อมูลลับในนั้น และจำกัดสิทธิ์แก้ไขเฉพาะคนที่ไว้ใจ

## ตั้งค่า `site.config.json`

- `siteUrl`: โดเมนจริง เช่น `https://taklomu.github.io` (ใช้ทำ canonical, sitemap, og:url)
- `basePath`: ใส่เมื่อขึ้น GitHub Pages แบบโปรเจกต์ เช่น `/MottoAffiliate` ถ้าใช้โดเมนของตัวเองให้เป็นค่าว่าง
- `ogDefaultImage`: รูปแชร์เริ่มต้น ขนาดแนะนำ 1200x630 เช่น `/og/default.png` (วางไฟล์ใน `public/og/`)
- `gaMeasurementId`: รหัส GA4 เช่น `G-XXXXXXX` ถ้าใส่ เว็บจะแสดงแบนเนอร์ขอความยินยอมคุกกี้ และโหลด GA หลังกดยอมรับเท่านั้น
- `trackEndpoint`: URL ของเซิร์ฟเวอร์ที่คุณรับข้อมูลคลิกเอง (ไม่บังคับ)
- `contactEmail`: อีเมลที่แสดงในหน้าเกี่ยวกับและนโยบายความเป็นส่วนตัว
- `allowedLinkHosts`: รายชื่อโดเมนที่ลิงก์ Affiliate ชี้ไปได้ เช่น `["shopee.co.th", "lazada.co.th"]` (รวมโดเมนย่อย) ว่าง = อนุญาตทุกโดเมน https
- `affiliateWrap`: เทมเพลต deeplink ของเครือข่ายที่ให้ต่อ `{url}` ได้ (ถ้าไม่มี ปล่อยว่างแล้วใช้ช่อง `*_aff_link` ต่อสินค้าแทน)

## การวัดผลคลิก

| เหตุการณ์ | เกิดเมื่อ | พารามิเตอร์ |
|---|---|---|
| `click_affiliate` | กดปุ่ม Shopee/Lazada | `quote_id`, `product_name`, `platform`, `is_affiliate` |
| `search` | กดค้นหา | `query` |
| `search_no_result` | พิมพ์แล้วไม่พบคำคม (หน่วง 0.9 วินาที) | `query` |
| `random_quote`, `share_copy_link`, `share_native` | กดปุ่มสุ่ม/คัดลอกลิงก์/แชร์ | `quote_id` |

- **GA4:** ส่งหลังผู้เข้าชมกดยอมรับเท่านั้น ต้องไปสร้าง Custom dimension สำหรับ `quote_id`, `product_name`, `platform` ในหน้า Admin ของ GA4 ถึงจะเห็นแยกตามคำคม/สินค้าในรายงาน
- **ถอนความยินยอม:** เมื่อผู้เข้าชมกด "ไม่ยอมรับ" (รวมถึงเปิดจากลิงก์ "ตั้งค่าคุกกี้" ท้ายเว็บ) เว็บจะตั้งค่า `ga-disable-<รหัส GA>` และลบคุกกี้ `_ga*` `_gid` `_gat*` ที่ตั้งไว้แล้ว ส่วนนี้ทดสอบด้วยตัวจำลองใน `npm test` ยังไม่ได้ทดสอบกับ GA และเบราว์เซอร์จริง
- **endpoint ของคุณเอง:** ส่งด้วย `navigator.sendBeacon` เป็น JSON (Content-Type `text/plain` เพื่อเลี่ยง CORS preflight) เว็บสถิตไม่มีหลังบ้าน คุณต้องมีเซิร์ฟเวอร์รับเอง เช่น Cloudflare Worker ถ้ายังไม่มี เว้นว่างไว้ใช้ GA4 อย่างเดียวพอ
- ยอดขายจริงดูจากแดชบอร์ดของ Shopee Affiliate / Involve Asia เว็บนี้วัดได้แค่คลิก

## ขึ้นเว็บ

**GitHub Pages:** มี workflow ให้แล้ว ไปที่ Settings → Pages แล้วเลือก Source เป็น **GitHub Actions** ตั้ง `siteUrl` เป็น `https://<ชื่อผู้ใช้>.github.io` และ `basePath` เป็น `/<ชื่อรีโป>`
**Cloudflare Pages / Netlify:** Build command `node build.mjs`, Output directory `dist` (Cloudflare ตั้ง `NODE_VERSION` เป็น `20`)

หลังแก้ข้อมูลใน Google Sheets ต้อง build ใหม่ถึงจะขึ้นเว็บ (push อะไรสักอย่าง หรือกด Run workflow ในแท็บ Actions)

หลัง deploy ครั้งแรก: ส่ง `sitemap.xml` ให้ Google Search Console

## รูปสินค้าและรูปแชร์

- `image_url` ใส่ลิงก์รูปจากร้านได้ แต่อาจถูกบล็อกหรือเปลี่ยนเมื่อไหร่ก็ได้ ถ้าเป็นไปได้ให้ดาวน์โหลดรูปที่ได้รับอนุญาตให้ใช้ไว้ใน `public/img/` แล้วใส่ `/img/ชื่อไฟล์.jpg` (ตรวจเงื่อนไขการใช้รูปของโปรแกรม Affiliate แต่ละเจ้าก่อน)
- `og_image` ต้องทำเอง (เช่นใน Canva ขนาด 1200x630 PNG/JPG) แล้ววางใน `public/og/` Facebook/LINE ไม่รองรับ SVG
- ถ้าไม่มี `og_image` ต่อคำคม จะใช้ `ogDefaultImage`

## ข้อจำกัดที่ควรรู้

- การค้นหาเป็นแบบจับคำและตัวอักษรคู่ ไม่เข้าใจความหมายหรือคำพ้องที่ไม่ได้ใส่ใน `keywords` ประโยคยาวมักไม่พบผล ให้ดูคำที่เหตุการณ์ `search_no_result` บันทึกไว้แล้วเพิ่มลง `keywords`
- หน้าแรกฝังการ์ดและดัชนีค้นหาของทุกคำคมไว้ในไฟล์เดียว ขนาดโตตามจำนวนคำคม (วัดได้ราว 1.17 KB ต่อคำคมบนข้อมูลสังเคราะห์) ควรเริ่มปรับเมื่อมีคำคมราว 500 ถึง 1,000
- ชุดทดสอบครอบคลุมการตรวจข้อมูลของ build และตรรกะถอนความยินยอม แต่ไม่ได้ทดสอบหน้าตาหรือการกดปุ่มในเบราว์เซอร์จริง และยังไม่ได้ทดสอบกรณีที่ Google Sheets ตอบกลับเป็นหน้า HTML (ต้องใช้เซิร์ฟเวอร์ https)
- เว็บนี้ไม่มีฐานข้อมูลหรือระบบสมาชิก ตั้งใจให้ง่ายและโฮสต์ฟรีได้
