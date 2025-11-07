// ======================== internal_key.js ========================

// 1️⃣ Khóa nội bộ (header x-internal-key)
window.getInternalKey = () => "Trung@123";

// 2️⃣ Cấu hình LOCAL Supabase (offline test + role key)
const LOCAL_SUPABASE_CONFIG = {
  url: "",   // 🔒 lấy từ /api/getConfig
  anon: "",  // 🔒 lấy từ /api/getConfig

  // ⚠️ Role key chỉ dùng nội bộ để test local (KHÔNG deploy public)
  role: ""   // 🔒 lấy từ /api/getConfig (thường không trả cho client)
};

// 3️⃣ Cấu hình MAP (Apps Script + Sheet)
const LOCAL_APP_MAP = {
  APPS_URL:   "",  // 🔒 lấy từ /api/getConfig
  SHEET_ID:   "",  // 🔒 lấy từ /api/getConfig
  SHARED_SECRET: "", // 🔒 lấy từ /api/getConfig
  CSV_URL:    ""   // 🔒 lấy từ /api/getConfig
};

// 4️⃣ Webhook nội bộ (ẩn khỏi body JSON)
const LOCAL_WEBHOOK = ""; // 🔒 tránh lộ; webhook thật lấy từ /api/getConfig → window._REMOTE_WEBHOOK

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

// 9️⃣ Ghi đè LINK/KEY từ /api/getConfig (đồng bộ, không đổi cấu trúc, không chạm hàm cũ)
(function () {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/getConfig", false); // ⬅️ đồng bộ để có giá trị ngay khi file load
    // Nếu cần lấy 'role' từ backend, có thể bật dòng dưới và API phải kiểm tra x-internal-key:
    // xhr.setRequestHeader("x-internal-key", window.getInternalKey());
    xhr.send();

    if (xhr.status === 200) {
      var cfg = JSON.parse(xhr.responseText) || {};

      // --- Supabase ---
      if (cfg.url)  LOCAL_SUPABASE_CONFIG.url  = cfg.url;
      if (cfg.anon) LOCAL_SUPABASE_CONFIG.anon = cfg.anon;
      if (cfg.role) LOCAL_SUPABASE_CONFIG.role = cfg.role; // thường chỉ backend dùng

      // --- Map ---
      if (cfg.map) {
        if (cfg.map.APPS_URL)      LOCAL_APP_MAP.APPS_URL      = cfg.map.APPS_URL;
        if (cfg.map.SHEET_ID)      LOCAL_APP_MAP.SHEET_ID      = cfg.map.SHEET_ID;
        if (cfg.map.SHARED_SECRET) LOCAL_APP_MAP.SHARED_SECRET = cfg.map.SHARED_SECRET;
        if (cfg.map.CSV_URL)       LOCAL_APP_MAP.CSV_URL       = cfg.map.CSV_URL;
      }

      // --- Webhook ---
      if (cfg.webhook) window._REMOTE_WEBHOOK = cfg.webhook; // giữ const LOCAL_WEBHOOK nguyên
    } else {
      console.warn("⚠️ /api/getConfig trả mã:", xhr.status);
    }
  } catch (e) {
    console.warn("⚠️ Không nạp được /api/getConfig:", e && e.message);
  }
})();
