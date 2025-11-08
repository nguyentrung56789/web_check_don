// ======================== internal_key.js ========================

// 1️⃣ Khóa nội bộ (header x-internal-key)
window.getInternalKey = () => "Trung@123";

// 2️⃣ Cấu hình LOCAL Supabase (offline test)
const LOCAL_SUPABASE_CONFIG = {
  url: "",   // 👉 để trống — sẽ nạp từ /api/getConfig
  anon: "",  // 👉 để trống — sẽ nạp từ /api/getConfig
  role: ""   // 👉 tùy chọn, chỉ nạp nếu API trả về
};

// 3️⃣ Cấu hình MAP (Apps Script + Sheet)
const LOCAL_APP_MAP = {
  APPS_URL: "",
  SHEET_ID: "",
  SHARED_SECRET: "",
  CSV_URL: ""
};

// 4️⃣ Webhook nội bộ (ẩn khỏi body JSON)
let LOCAL_WEBHOOK = "";

// 5️⃣ Hàm lấy cấu hình dùng chung (KHÔNG thay đổi)
window.getConfig = function (key) {
  switch (key) {
    case "url": return LOCAL_SUPABASE_CONFIG.url;
    case "anon": return LOCAL_SUPABASE_CONFIG.anon;
    case "role": return LOCAL_SUPABASE_CONFIG.role;
    case "webhook": return LOCAL_WEBHOOK;
    case "map": return LOCAL_APP_MAP;
    case "cleanup": return LOCAL_CLEANUP_CONFIG;
    default: return null;
  }
};

// 6️⃣ Cấu hình hệ thống dọn rác (cleanup)
const LOCAL_CLEANUP_CONFIG = {
  ENABLED: true,       // 🔧 Bật/tắt tính năng dọn rác
  MONTH_LIMIT: 0.23,   // 🔧 Xóa dữ liệu cũ hơn N tháng (~7 ngày)
  AUTO_RUN_HOUR: 3,    // ⏰ Nếu sau này bạn muốn cron tự chạy (3h sáng)
};

// Cho phép script khác truy cập
window.getConfigCleanup = function () {
  return LOCAL_CLEANUP_CONFIG;
};

// 7️⃣ Interceptor fetch: fallback /api/getConfig
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
      const url = (typeof u === 'string') ? new URL(u, location.origin) : new URL(u.url, location.origin);
      return url.pathname === '/api/getConfig';
    } catch {
      return (typeof u === 'string') && (u === '/api/getConfig' || u.endsWith('/api/getConfig'));
    }
  }

  window.fetch = async function (input, init) {
    if (isGetConfigURL(input)) {
      const real = await tryRealGetConfig(input, init);
      if (real) return real;

      // Fallback local — KHÔNG gửi webhook ra ngoài
      const body = JSON.stringify({
        url: LOCAL_SUPABASE_CONFIG.url,
        anon: LOCAL_SUPABASE_CONFIG.anon,
        map: LOCAL_APP_MAP,
        cleanup: LOCAL_CLEANUP_CONFIG,
      });

      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (!origFetch) throw new Error("fetch not available");
    return origFetch(input, init);
  };
})();

// 8️⃣ Nạp key từ /api/getConfig (ẩn key thật từ ENV)
(async () => {
  try {
    const resp = await fetch("/api/getConfig", {
      headers: { "x-internal-key": window.getInternalKey() }
    });
    const cfg = await resp.json();

    if (cfg.url)  LOCAL_SUPABASE_CONFIG.url  = cfg.url;
    if (cfg.anon) LOCAL_SUPABASE_CONFIG.anon = cfg.anon;
    if (cfg.role) LOCAL_SUPABASE_CONFIG.role = cfg.role;

    if (cfg.webhookUrl) LOCAL_WEBHOOK = cfg.webhookUrl;
    if (cfg.map) Object.assign(LOCAL_APP_MAP, cfg.map);

    console.log("✅ Config loaded from /api/getConfig");
  } catch (e) {
    console.warn("⚠️ Không lấy được /api/getConfig — dùng LOCAL fallback:", e);
  }
})();
