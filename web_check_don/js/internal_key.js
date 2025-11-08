// ===== internal_key.js (bảo mật khi deploy) =====

// 1️⃣ Khóa nội bộ
window.getInternalKey = () => "Trung@123";

// 2️⃣ Cấu hình rỗng — chỉ dùng tạm khi offline test
const LOCAL_SUPABASE_CONFIG = { url: "", anon: "", role: "" };
const LOCAL_APP_MAP = { APPS_URL: "", SHEET_ID: "", SHARED_SECRET: "", CSV_URL: "" };
let LOCAL_WEBHOOK = "";

// 3️⃣ Khi khởi chạy → tự động lấy cấu hình từ API (ẩn key thật)
(async () => {
  try {
    const resp = await fetch("/api/getConfig", {
      headers: { "x-internal-key": window.getInternalKey() }
    });
    if (!resp.ok) throw new Error(resp.status);
    const data = await resp.json();

    // Ghi đè giá trị nhận được
    if (data.url)  LOCAL_SUPABASE_CONFIG.url  = data.url;
    if (data.anon) LOCAL_SUPABASE_CONFIG.anon = data.anon;
    if (data.role) LOCAL_SUPABASE_CONFIG.role = data.role;
    if (data.webhookUrl) LOCAL_WEBHOOK = data.webhookUrl;
    if (data.map) Object.assign(LOCAL_APP_MAP, data.map);

    console.log("✅ Config loaded from /api/getConfig");
  } catch (err) {
    console.error("❌ Không thể lấy /api/getConfig:", err);
  }
})();

// 4️⃣ Giữ nguyên API cho toàn hệ thống
window.getConfig = (key) => ({
  url: LOCAL_SUPABASE_CONFIG.url,
  anon: LOCAL_SUPABASE_CONFIG.anon,
  role: LOCAL_SUPABASE_CONFIG.role,
  webhook: LOCAL_WEBHOOK,
  map: LOCAL_APP_MAP
}[key] || null);



// 5️⃣ Cấu hình hệ thống dọn rác (cleanup)
const LOCAL_CLEANUP_CONFIG = {
  ENABLED: true,        // 🔧 Bật/tắt tính năng dọn rác
  MONTH_LIMIT: 0.23,    // 🔧 Xóa dữ liệu cũ hơn N tháng (~7 ngày)
  AUTO_RUN_HOUR: 3,     // ⏰ Nếu sau này bạn muốn cron tự chạy (3h sáng)
};

// 6️⃣ Hàm lấy cấu hình dùng chung
window.getConfig = function (key) {
  switch (key) {
    case "url": return LOCAL_SUPABASE_CONFIG.url;
    case "anon": return LOCAL_SUPABASE_CONFIG.anon;
    case "role": return LOCAL_SUPABASE_CONFIG.role;   // 👈 thêm để test local
    case "webhook": return LOCAL_WEBHOOK;
    case "map": return LOCAL_APP_MAP;
    case "cleanup": return LOCAL_CLEANUP_CONFIG;
    case "render_api": return `${location.origin}/api_render/render.png`; // API render PNG
    default: return null;
  }
};

// 7️⃣ Cho phép script khác truy cập nhanh config cleanup
window.getConfigCleanup = () => LOCAL_CLEANUP_CONFIG;

// 8️⃣ Interceptor fetch: fallback cho /api/getConfig
(function patchFetchForGetConfig() {
  const origFetch = window.fetch?.bind(window);

  async function tryRealGetConfig(input, init) {
    if (!origFetch) return null;
    try {
      const resp = await origFetch(input, init);
      return (resp && resp.ok) ? resp : null;
    } catch { return null; }
  }

  function isGetConfigURL(u) {
    try {
      const url = (typeof u === 'string')
        ? new URL(u, location.origin)
        : new URL(u.url, location.origin);
      return url.pathname === '/api/getConfig';
    } catch {
      return (typeof u === 'string') &&
             (u === '/api/getConfig' || u.endsWith('/api/getConfig'));
    }
  }

  window.fetch = async function (input, init) {
    if (isGetConfigURL(input)) {
      const real = await tryRealGetConfig(input, init);
      if (real) return real;

      // Fallback local (không gửi webhook ra ngoài)
      const body = JSON.stringify({
        url: LOCAL_SUPABASE_CONFIG.url,
        anon: LOCAL_SUPABASE_CONFIG.anon,
        role: LOCAL_SUPABASE_CONFIG.role,
        map: LOCAL_APP_MAP,
        cleanup: LOCAL_CLEANUP_CONFIG
      });

      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!origFetch) throw new Error("fetch not available");
    return origFetch(input, init);
  };
})();
