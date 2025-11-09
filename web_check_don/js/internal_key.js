// ======================== internal_key.js ========================

// 1️⃣ Khóa nội bộ (header x-internal-key)
window.getInternalKey = () => "Trung@123";

// 2️⃣ Cấu hình LOCAL Supabase (offline test + role key)
const LOCAL_SUPABASE_CONFIG = {
  url: "",
  anon: "",

  // ⚠️ Role key chỉ dùng nội bộ để test local (KHÔNG deploy public)
  role: ""
};

// 3️⃣ Cấu hình MAP (Apps Script + Sheet)
const LOCAL_APP_MAP = {
  apps_url: "",
  sheet_id: "",
  shared_secret: "",
  csv_url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFLOQCFAQqdcQLP4Yxy0IAVk2f1GCs3nTpEdrITr5s47wOAdViQ3K0VkcQLQSRoLehUe8jFfXrvjkm/pub?output=csv",
};

// 4️⃣ Webhook nội bộ (ẩn khỏi body JSON)
const LOCAL_WEBHOOK = "";

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
    case "apps_url": return LOCAL_APP_MAP.apps_url;
    case "sheet_id": return LOCAL_APP_MAP.sheet_id;
    case "shared_secret": return LOCAL_APP_MAP.shared_secret;
    case "csv_url": return LOCAL_APP_MAP.csv_url;
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
        apps_url: LOCAL_APP_MAP.apps_url,
        sheet_id: LOCAL_APP_MAP.sheet_id,
        shared_secret: LOCAL_APP_MAP.shared_secret,
        csv_url: LOCAL_APP_MAP.csv_url,
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
