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
  APPS_URL: "",
  SHEET_ID: "",
  SHARED_SECRET: "t12345",
  CSV_URL: "",
};


window.__RUNTIME_CFG = null;
(async () => {
  try {
    const r = await fetch('/api/getConfig'); // interceptor của bạn sẽ fallback local nếu server không có
    if (r.ok) window.__RUNTIME_CFG = await r.json();
  } catch {/* im lặng */}
})();

// 4️⃣ Webhook nội bộ (ẩn khỏi body JSON)
const LOCAL_WEBHOOK = "https://dhsybbqoe.datadex.vn/webhook/hoadon";

// 5️⃣ Cấu hình hệ thống dọn rác (cleanup)
const LOCAL_CLEANUP_CONFIG = {
  ENABLED: true,        // 🔧 Bật/tắt tính năng dọn rác
  MONTH_LIMIT: 0.23,    // 🔧 Xóa dữ liệu cũ hơn N tháng (~7 ngày)
  AUTO_RUN_HOUR: 3,     // ⏰ Nếu sau này bạn muốn cron tự chạy (3h sáng)
};

// 6️⃣ getConfig ưu tiên runtime, fallback LOCAL_*
window.getConfig = function (key) {
  const R = window.__RUNTIME_CFG || {};
  switch (key) {
    case "url":        return R.url        ?? LOCAL_SUPABASE_CONFIG.url;
    case "anon":       return R.anon       ?? LOCAL_SUPABASE_CONFIG.anon;
    case "role":       return R.role       ?? LOCAL_SUPABASE_CONFIG.role;
    case "webhook":    return R.webhook    ?? LOCAL_WEBHOOK;
    case "map":        return R.map        ?? LOCAL_APP_MAP;
    case "cleanup":    return R.cleanup    ?? LOCAL_CLEANUP_CONFIG;
    case "render_api": return R.render_api ?? `${location.origin}/api_render/render.png`;
    default:           return null;
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
