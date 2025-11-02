// image/api/ping.mjs
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

// Lấy Supabase URL + service role từ file public ./js/internal_key.js
async function getInternalKeys(base) {
  const r = await fetch(`${base}/js/internal_key.js`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Không tải được internal_key.js (${r.status})`);
  const t = await r.text();
  const url  = t.match(/url:\s*"([^"]+)"/)?.[1];
  const role = t.match(/role:\s*"([^"]+)"/)?.[1];
  if (!url || !role) throw new Error("Thiếu url/role trong internal_key.js");
  return { SUPABASE_URL: url, SERVICE_KEY: role };
}

// --- helpers ---
function getQuery(req) {
  // req.url kiểu: /image/api/ping?bucket=...&name=...
  const u = new URL(req.url, `http://${req.headers.host}`);
  return Object.fromEntries(u.searchParams.entries());
}
function sanitizePath(s, { allowSlash=false } = {}) {
  // chỉ cho: chữ, số, -, _, ., và (tùy chọn) dấu '/'
  const ok = allowSlash ? /^[A-Za-z0-9._/-]+$/ : /^[A-Za-z0-9._-]+$/;
  if (!s || !ok.test(s) || s.includes("..")) throw new Error("Tên không hợp lệ");
  return s.replace(/\/+/g, "/"); // gộp // thành /
}

export const config = { runtime: "nodejs", maxDuration: 60 };

export default async function handler(req, res) {
  try {
    const base = `http${req.headers["x-forwarded-proto"]==="https"?"s":""}://${req.headers.host}`;
    const { SUPABASE_URL, SERVICE_KEY } = await getInternalKeys(base);

    // ====== Lấy tham số HTTP từ n8n (query) ======
    const q = getQuery(req);
    // Có thể truyền:
    // - bucket=img_hd_kiot
    // - html=HD00334.html & png=HD00334.png
    // - name=HD00334  (tự suy ra html/png)
    const bucket = sanitizePath(q.bucket || "img_hd_kiot", { allowSlash: true });

    let htmlKey, pngKey;
    if (q.name) {
      const name = sanitizePath(q.name);
      htmlKey = `${name}.html`;
      pngKey  = `${name}.png`;
    } else {
      htmlKey = sanitizePath(q.html || "img_hd.html", { allowSlash: true });
      pngKey  = sanitizePath(q.png  || "img_hd.png",  { allowSlash: true });
    }

    // 1) lấy HTML từ Supabase
    const htmlURL = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(htmlKey)}`;
    const htmlResp = await fetch(htmlURL, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!htmlResp.ok) {
      const txt = await htmlResp.text().catch(()=> "");
      res.statusCode = 502;
      return res.end(`Không tải được HTML (${htmlKey}): ${htmlResp.status} ${txt}`);
    }
    const html = await htmlResp.text();

    // 2) render HTML -> PNG
    const execPath = await chromium.executablePath();
    const browser = await puppeteer.launch({
      args: chromium.args,
      headless: chromium.headless,
      executablePath: execPath,
      defaultViewport: { width: 900, height: 1024, deviceScaleFactor: 2 }
    });
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      document.documentElement.style.background = "#fff";
      document.body.style.background = "#fff";
    });
    const png = await page.screenshot({ type: "png", fullPage: true });
    await browser.close();

    // 3) upload PNG (upsert)
    const uploadURL = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(pngKey)}`;
    const up = await fetch(uploadURL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "image/png",
        "x-upsert": "true"
      },
      body: png
    });
    if (!up.ok) {
      const t = await up.text().catch(()=> "");
      res.statusCode = 500;
      return res.end(`Upload PNG lỗi (${pngKey}): ${up.status} ${t}`);
    }

    // 4) trả kết quả
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${pngKey}`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, bucket, html: htmlKey, png: pngKey, url: publicUrl }));
  } catch (e) {
    res.statusCode = 500;
    res.end(`Ping render error: ${e.message}`);
  }
}
