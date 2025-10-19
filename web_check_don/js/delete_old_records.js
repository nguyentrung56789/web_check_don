<!-- web_dong_hang/supabase_connect.js -->
<script src="https://unpkg.com/@supabase/supabase-js@2"></script>
<script>
// Tạo Supabase client theo tên app: 'index' | 'cod' | 'check'
window.makeSb = (appName) => {
  if (!window.getConfig) throw new Error("Missing getConfig()");
  const cfg = window.getConfig(appName);
  if (!cfg?.url || !cfg?.key) throw new Error("Thiếu URL/KEY Supabase");
  const sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return { sb, table: cfg.table };
};

// Ví dụ dùng:
// const { sb, table } = makeSb('cod');
// const { data, error } = await sb.from(table).select('*').limit(10);
</script>
