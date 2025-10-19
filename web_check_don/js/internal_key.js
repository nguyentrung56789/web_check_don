// ======================== internal_key.js ========================
// 1️⃣ Khóa nội bộ (header x-internal-key)
window.getInternalKey = () => "Trung@123";

// 2️⃣ Cấu hình LOCAL Supabase (offline test)
const LOCAL_SUPABASE_CONFIG = { url: "", anon: "" };

// 3️⃣ Cấu hình MAP (Apps Script + Sheet) – giữ object để getConfig("map") trả về đúng cấu trúc
const LOCAL_APP_MAP = {
  APPS_URL: "",
  SHEET_ID: "",
  SHARED_SECRET: "",
  CSV_URL: "",
  WEBHOOK_URL: "" // để tiện dùng chung
};

// 4️⃣ Webhook nội bộ (string)
let LOCAL_WEBHOOK = "";

// 5️⃣ API cho phần còn lại của app dùng
window.getConfig = function (key) {
  switch (key) {
    case "url":     return LOCAL_SUPABASE_CONFIG.url;
    case "anon":    return LOCAL_SUPABASE_CONFIG.anon;
    case "webhook": return LOCAL_WEBHOOK;  // string
    case "map":     return LOCAL_APP_MAP;  // object
    default:        return null;
  }
};

// 6️⃣ Nạp cấu hình từ server (/api/getConfig) – HỖ TRỢ CẢ 2 DẠNG: flat & nested map{}
async function loadConfigFromServer() {
  try {
    const res = await fetch("/api/getConfig", {
      headers: { "x-internal-key": window.getInternalKey() }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Supabase
    LOCAL_SUPABASE_CONFIG.url  = data.url  || data.SUPABASE_URL || "";
    LOCAL_SUPABASE_CONFIG.anon = data.anon || data.SUPABASE_ANON_KEY || "";

    // Hỗ trợ cả dạng flat và nested
    const M = data.map || {};
    LOCAL_APP_MAP.APPS_URL      = data.APPS_URL      ?? M.APPS_URL      ?? "";
    LOCAL_APP_MAP.SHEET_ID      = data.SHEET_ID      ?? M.SHEET_ID      ?? "";
    LOCAL_APP_MAP.SHARED_SECRET = data.SHARED_SECRET ?? M.SHARED_SECRET ?? "";
    LOCAL_APP_MAP.CSV_URL       = data.CSV_URL       ?? M.CSV_URL       ?? "";
    LOCAL_APP_MAP.WEBHOOK_URL   = data.WEBHOOK_URL   ?? data.webhookUrl ?? M.WEBHOOK_URL ?? "";

    // Webhook (ưu tiên WEBHOOK_URL phẳng, sau đó webhookUrl, rồi map.WEBHOOK_URL)
    LOCAL_WEBHOOK = data.WEBHOOK_URL ?? data.webhookUrl ?? LOCAL_APP_MAP.WEBHOOK_URL ?? "";

    console.log("[internal_key] ✅ Loaded config:", {
      url: LOCAL_SUPABASE_CONFIG.url ? "ok" : "empty",
      anon: LOCAL_SUPABASE_CONFIG.anon ? "ok" : "empty",
      webhook: LOCAL_WEBHOOK ? "ok" : "empty",
      map: { ...LOCAL_APP_MAP }
    });
  } catch (err) {
    console.error("[internal_key] ❌ loadConfigFromServer failed:", err);
  }
}

// 7️⃣ Cho phép chủ động reload khi cần
window.loadAppConfig = async function () {
  await loadConfigFromServer();
};

// 8️⃣ Tự nạp khi trang load
(async () => { await loadConfigFromServer(); })();

// 9️⃣ Interceptor fetch: fallback /api/getConfig khi server không có
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

  window.fetch = async function (input, init = {}) {
    if (isGetConfigURL(input)) {
      init.headers = Object.assign({}, init.headers, { "x-internal-key": window.getInternalKey() });

      // Thử gọi server thật
      const real = await tryRealGetConfig(input, init);
      if (real) return real;

      // Fallback local – TRẢ VỀ DẠNG FLAT giống server hiện tại
      const body = JSON.stringify({
        url:  LOCAL_SUPABASE_CONFIG.url,
        anon: LOCAL_SUPABASE_CONFIG.anon,
        WEBHOOK_URL: LOCAL_WEBHOOK,
        APPS_URL: LOCAL_APP_MAP.APPS_URL,
        SHEET_ID: LOCAL_APP_MAP.SHEET_ID,
        SHARED_SECRET: LOCAL_APP_MAP.SHARED_SECRET,
        CSV_URL: LOCAL_APP_MAP.CSV_URL
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (!origFetch) throw new Error("fetch not available");
    return origFetch(input, init);
  };
})();
