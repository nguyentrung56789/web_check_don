// ======================== internal_key.js ========================
// 1️⃣ Khóa nội bộ (header x-internal-key)
window.getInternalKey = () => "Trung@123";

// 2️⃣ Cấu hình LOCAL Supabase (offline test)
const LOCAL_SUPABASE_CONFIG = { url: "", anon: "" };

// 3️⃣ Cấu hình MAP (Apps Script + Sheet)
const LOCAL_APP_MAP = { APPS_URL: "", SHEET_ID: "", SHARED_SECRET: "", CSV_URL: "" };

// 4️⃣ Webhook nội bộ (ẩn khỏi body JSON)
const LOCAL_WEBHOOK = { WEBHOOK_URL: "" };

// Cho phép các file khác gọi giống như `url` và `anon`
window.getConfig = function (key) {
  switch (key) {
    case "url": return LOCAL_SUPABASE_CONFIG.url;
    case "anon": return LOCAL_SUPABASE_CONFIG.anon;
    case "webhook": return LOCAL_WEBHOOK;
    case "map": return LOCAL_APP_MAP;
    default: return null;
  }
};

// 5️⃣ Interceptor fetch: fallback /api/getConfig
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
        map: LOCAL_APP_MAP
      });

      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (!origFetch) throw new Error("fetch not available");
    return origFetch(input, init);
  };
})();
