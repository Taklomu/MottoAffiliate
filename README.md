<<<<<<< HEAD
# MottoAffiliate
Use Motto to find your favorite products

# Legal & Disclaimers
# Affiliate Disclosure: Includes a standard affiliate disclosure notice in the footer informing visitors that commissions may be earned from qualifying purchases.

# Privacy Policy: Comes with a starter Privacy Policy template; please review and customize it to ensure full compliance with local regulations (such as PDPA) before going live.

# Key Features
- Decoupled Data Management
- Dynamic Routes & SEO-Ready
- Open Graph (OG) Meta Tags
- Privacy-First Analytics
- Smart Fallback Affiliate Links

# How to Start

Clone or download this repository.

Install dependencies:

Bash

npm install
Build the static pages:

Bash

node build.mjs
Start the local server:

Bash

node serve.mjs
Open your browser and visit http://localhost:3000

# *** Before deploying to production, update site.config.json with your details:

siteUrl:  Replace with your live domain or GitHub Pages URL so canonical links and sitemap.xml point to the right address.

Google Sheets CSV URLs: Add your published CSV links if you want the build script to pull data directly from Google Sheets.
=======
# คำคมคู่ใจ (เว็บสถิต)

เว็บค้นหาคำคม แล้วแสดงเซตสินค้าที่เข้ากัน ทุกคำคมมีหน้า URL ของตัวเอง (`/quote/no-sleep/`) พร้อม meta tag สำหรับ Google และการแชร์ลง Facebook/LINE

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม ใช้แค่ Node 18 ขึ้นไป

## เริ่มใช้งาน

```bash
node build.mjs      # สร้างเว็บลงโฟลเดอร์ dist/
node serve.mjs      # ดูตัวอย่างที่ http://localhost:4173
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
| `dist/` | ผลลัพธ์ที่เอาไปอัปโหลด (สร้างใหม่ทุกครั้งที่ build) |

## ข้อมูลใน CSV (ตรงกับ schema ที่วางแผนไว้)

`quotes.csv`: `id, quote_text, tags, keywords, og_image`
- `id` ใช้เป็น URL ต้องเป็นตัวอังกฤษพิมพ์เล็ก ตัวเลข และขีดกลาง เช่น `no-sleep`
- `tags` และ `keywords` คั่นด้วย `|` เช่น `กาแฟ|ออฟฟิศ`
- `og_image` คือรูปที่ขึ้นตอนแชร์ เช่น `/og/no-sleep.png` (ว่างไว้ได้ จะใช้ `ogDefaultImage`)

`products.csv`: `id, quote_id, product_name, product_desc, image_url, shopee_aff_link, lazada_aff_link, search_keyword`
- `quote_id` ต้องตรงกับ `id` ใน quotes.csv
- ช่อง `*_aff_link` ว่าง = ปุ่มพาไปหน้าค้นหาในร้านด้วย `search_keyword` (ยังไม่ได้ค่าคอม)
- ช่อง `*_aff_link` มีลิงก์ = ใช้ลิงก์นั้น และตั้ง `data-aff="1"` ให้วัดผลแยกได้

ตอน build จะแจ้งเตือนถ้ามีข้อมูลผิด เช่น id ซ้ำ สินค้าอ้างคำคมที่ไม่มี คำคมที่ไม่มีสินค้า และสรุปจำนวนลิงก์ Affiliate กับรูปที่ยังขาด

## ใช้ Google Sheets เป็นหลังบ้าน

1. สร้าง Google Sheets 2 แท็บ ชื่อคอลัมน์ตรงกับ CSV ด้านบน
2. File → Share → Publish to web → เลือกแท็บ → เลือกรูปแบบ CSV → Publish
3. คัดลอกลิงก์ที่ได้ ใส่ใน `site.config.json`:
```json
"sources": { "quotes_csv_url": "https://docs.google.com/.../pub?output=csv",
             "products_csv_url": "https://docs.google.com/.../pub?output=csv" }
```
4. รัน `node build.mjs` ตอน build จะดึงข้อมูลจาก Sheets ถ้าดึงไม่ได้จะหยุดพร้อมแจ้งสาเหตุ (ไม่ deploy ข้อมูลว่าง)

หมายเหตุ: Sheets ที่ publish แล้วใครมีลิงก์ก็เปิดอ่านได้ อย่าใส่ข้อมูลลับในนั้น

## ตั้งค่า `site.config.json`

- `siteUrl`: โดเมนจริง เช่น `https://kamkhom.com` (ใช้ทำ canonical, sitemap, og:url)
- `basePath`: ใส่เฉพาะตอนขึ้น GitHub Pages แบบโปรเจกต์ เช่น `/kamkhom`
- `ogDefaultImage`: รูปแชร์เริ่มต้น ขนาดแนะนำ 1200x630 เช่น `/og/default.png` (วางไฟล์ใน `public/og/`)
- `gaMeasurementId`: รหัส GA4 เช่น `G-XXXXXXX` ถ้าใส่ เว็บจะแสดงแบนเนอร์ขอความยินยอมคุกกี้ และโหลด GA หลังกดยอมรับเท่านั้น
- `trackEndpoint`: URL ของเซิร์ฟเวอร์ที่คุณรับข้อมูลคลิกเอง (ไม่บังคับ)
- `contactEmail`: อีเมลที่แสดงในหน้าเกี่ยวกับและนโยบายความเป็นส่วนตัว
- `affiliateWrap`: เทมเพลต deeplink ของเครือข่ายที่ให้ต่อ `{url}` ได้ (ถ้าไม่มี ปล่อยว่างแล้วใช้ช่อง `*_aff_link` ต่อสินค้าแทน)

## การวัดผลคลิก

เหตุการณ์ที่เว็บส่ง:

| เหตุการณ์ | เกิดเมื่อ | พารามิเตอร์ |
|---|---|---|
| `click_affiliate` | กดปุ่ม Shopee/Lazada | `quote_id`, `product_name`, `platform`, `is_affiliate` |
| `search` | กดค้นหา | `query` |
| `search_no_result` | พิมพ์แล้วไม่พบคำคม (หน่วง 0.9 วินาที) | `query` |
| `random_quote`, `share_copy_link`, `share_native` | กดปุ่มสุ่ม/คัดลอกลิงก์/แชร์ | `quote_id` |

- **GA4:** ส่งหลังผู้เข้าชมกดยอมรับเท่านั้น และต้องไปสร้าง Custom dimension สำหรับ `quote_id`, `product_name`, `platform` ในหน้า Admin ของ GA4 ถึงจะเห็นแยกตามคำคม/สินค้าในรายงาน
- **endpoint ของคุณเอง:** ส่งด้วย `navigator.sendBeacon` เป็น JSON (Content-Type `text/plain` เพื่อเลี่ยง CORS preflight) เว็บฝั่งสถิตไม่มีหลังบ้าน คุณต้องมีเซิร์ฟเวอร์รับเอง เช่น Cloudflare Worker เก็บลง KV/D1 ถ้ายังไม่มี เว้นว่างไว้ใช้ GA4 อย่างเดียวพอ
- ยอดขายจริง (conversion) ดูจากแดชบอร์ดของ Shopee Affiliate / Involve Asia ซึ่งเว็บนี้วัดแทนไม่ได้ เว็บวัดได้แค่คลิก

## ขึ้นเว็บ

**Cloudflare Pages** (แนะนำ): เชื่อม Git repo → Build command `node build.mjs` → Output directory `dist` → ตั้งตัวแปร `NODE_VERSION` เป็น `20`
**Netlify:** Build command `node build.mjs`, Publish directory `dist`
**อัปโหลดมือ:** รัน `node build.mjs` แล้วลากโฟลเดอร์ `dist` ไปวางที่ Netlify Drop

หลังแก้ข้อมูลใน Google Sheets ต้อง build ใหม่ถึงจะขึ้นเว็บ ทั้งสองบริการมี Deploy hook ให้ยิง URL เพื่อ build ใหม่ได้ ตั้งตัวตั้งเวลาเรียกวันละครั้งได้

หลัง deploy ครั้งแรก: ส่ง `https://โดเมนของคุณ/sitemap.xml` ให้ Google Search Console

## รูปสินค้าและรูปแชร์

- `image_url` ใส่ลิงก์รูปจากร้านได้ แต่อาจถูกบล็อกหรือเปลี่ยนเมื่อไหร่ก็ได้ ถ้าเป็นไปได้ให้ดาวน์โหลดรูปที่ได้รับอนุญาตให้ใช้ไว้ใน `public/img/` แล้วใส่ `/img/ชื่อไฟล์.jpg` (ตรวจเงื่อนไขการใช้รูปของโปรแกรม Affiliate แต่ละเจ้าก่อน)
- `og_image` ต้องทำเอง (เช่นใน Canva ขนาด 1200x630 PNG/JPG) แล้ววางใน `public/og/` Facebook/LINE ไม่รองรับ SVG
- ถ้าไม่มี `og_image` ต่อคำคม จะใช้ `ogDefaultImage`

## ข้อจำกัดที่ควรรู้

- การค้นหาเป็นแบบจับคำและตัวอักษรคู่ ไม่เข้าใจความหมายหรือคำพ้องที่ไม่ได้ใส่ใน `keywords` ให้ดูคำที่เหตุการณ์ `search_no_result` บันทึกไว้แล้วเพิ่มลง `keywords`
- ข้อความในหน้าเกี่ยวกับและนโยบายความเป็นส่วนตัวเป็นข้อความตั้งต้นที่ตรงกับสิ่งที่เว็บทำจริง ไม่ใช่คำปรึกษาด้านกฎหมาย ควรให้ผู้รู้ตรวจก่อนใช้จริง โดยเฉพาะเรื่อง PDPA
- เว็บนี้ไม่มีฐานข้อมูลหรือระบบสมาชิก ตั้งใจให้ง่ายและโฮสต์ฟรีได้
>>>>>>> 18f3e8e (Added all source code)
