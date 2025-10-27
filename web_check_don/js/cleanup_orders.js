// ===== cleanup_orders.js =====
(() => {
  // -- nạp supabase UMD (đã có qua <script>, ở đây chỉ kiểm tra) --
  if (!window.supabase) {
    console.error("⚠️ Chưa load @supabase/supabase-js@2. Thêm <script> trước cleanup_orders.js");
    return;
  }

  // -- Lấy cấu hình, ép về string, tránh truyền object vào createClient --
  async function getSupabase() {
    // 1) Ưu tiên getConfig trong internal_key.js
    let rawUrl = window.getConfig?.("url");
    let rawKey = window.getConfig?.("service") || window.getConfig?.("anon");

    // 2) Nếu thiếu, thử /api/getConfig (có header x-internal-key)
    if (!rawUrl || !rawKey) {
      try {
        const resp = await fetch("/api/getConfig", {
          headers: { "x-internal-key": window.getInternalKey?.() || "" }
        });
        if (resp.ok) {
          const j = await resp.json();
          rawUrl = rawUrl || j.url;
          rawKey = rawKey || j.service || j.anon || j.key;
        }
      } catch {}
    }

    // 3) Chuẩn hoá: nếu vẫn là object => lấy đúng field
    const url =
      typeof rawUrl === "string" ? rawUrl :
      (rawUrl && typeof rawUrl.url === "string" ? rawUrl.url : "");

    const key =
      typeof rawKey === "string" ? rawKey :
      (rawKey && (rawKey.service || rawKey.anon || rawKey.key)) || "";

    if (!/^https?:\/\//i.test(url) || !key) {
      console.error("❌ Supabase URL/KEY không hợp lệ", { rawUrl, rawKey, url, key });
      throw new Error("Thiếu hoặc sai Supabase URL/KEY");
    }

    return window.supabase.createClient(url.trim(), key.trim());
  }

  // -- chunk util --
  const chunk = (arr, n) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

  // -- cutoff theo MONTH_LIMIT trong internal_key.js (mặc định 2) --
  function getCutoffISO() {
    const cfg = window.getConfigCleanup?.() || {};
    const monthLimit = Number.isFinite(cfg.MONTH_LIMIT) ? cfg.MONTH_LIMIT : 2;
    const d = new Date();
    d.setMonth(d.getMonth() - monthLimit);
    console.log(`🧹 Giữ lại ${monthLimit} tháng gần nhất. Cutoff = ${d.toISOString()}`);
    return d.toISOString();
  }

  // -- API chính: cleanup --
  window.cleanup = async function cleanup({ dry = true } = {}) {
    const supa   = await getSupabase();
    const cutoff = getCutoffISO();

    // tên bảng/cột (đổi nếu DB bạn khác)
    const TABLE_ORDERS      = "don_hang";
    const TABLE_ORDER_ITEMS = "don_hang_chitiet";
    const TABLE_KIOTCOD     = "don_hang_kiot_cod";
    const COL_TIME_ORDERS   = "ngay";   // hoặc 'created_at'
    const COL_TIME_KIOTCOD  = "ngay";
    const COL_ORDER_ID      = "ma_hd";
    const COL_DETAIL_FK     = "ma_hd";

    console.log(dry ? "🔎 DRY RUN (chỉ đếm, không xoá)" : "🗑️ XÓA THẬT");

    // 1) Lấy toàn bộ mã hoá đơn quá hạn (phân trang)
    let allIds = [];
    let from = 0, size = 2000;
    while (true) {
      const { data, error } = await supa
        .from(TABLE_ORDERS)
        .select(COL_ORDER_ID)
        .lt(COL_TIME_ORDERS, cutoff)
        .order(COL_ORDER_ID, { ascending: true })
        .range(from, from + size - 1);

      if (error) throw error;
      if (!data?.length) break;
      allIds.push(...data.map(r => r[COL_ORDER_ID]));
      from += size;
      if (data.length < size) break;
    }
    allIds = [...new Set(allIds)];
    console.log(`🧾 Số đơn hàng > cutoff: ${allIds.length}`);

    // 2) Chi tiết đơn hàng theo ma_hd
    if (allIds.length) {
      if (dry) {
        let approx = 0;
        for (const part of chunk(allIds, 1000)) {
          const { count, error } = await supa
            .from(TABLE_ORDER_ITEMS)
            .select(COL_DETAIL_FK, { count: "exact", head: true })
            .in(COL_DETAIL_FK, part);
          if (error) throw error;
          approx += (count || 0);
        }
        console.log(`   • Chi tiết dự kiến xoá: ~${approx}`);
      } else {
        for (const part of chunk(allIds, 500)) {
          const { error } = await supa
            .from(TABLE_ORDER_ITEMS)
            .delete()
            .in(COL_DETAIL_FK, part);
          if (error) throw error;
        }
        console.log(`   ✅ Đã xoá chi tiết theo ${allIds.length} mã hoá đơn`);
      }
    }

    // 3) Đơn hàng chính
    if (dry) {
      const { count, error } = await supa
        .from(TABLE_ORDERS)
        .select(COL_ORDER_ID, { count: "exact", head: true })
        .lt(COL_TIME_ORDERS, cutoff);
      if (error) throw error;
      console.log(`   • Đơn hàng dự kiến xoá: ${count || 0}`);
    } else {
      const { count, error } = await supa
        .from(TABLE_ORDERS)
        .delete({ count: "exact" })
        .lt(COL_TIME_ORDERS, cutoff);
      if (error) throw error;
      console.log(`   ✅ Đã xoá ${count || 0} đơn hàng`);
    }

    // 4) Bảng COD
    if (dry) {
      const { count, error } = await supa
        .from(TABLE_KIOTCOD)
        .select("*", { count: "exact", head: true })
        .lt(COL_TIME_KIOTCOD, cutoff);
      if (error) throw error;
      console.log(`   • COD dự kiến xoá: ${count || 0}`);
    } else {
      const { count, error } = await supa
        .from(TABLE_KIOTCOD)
        .delete({ count: "exact" })
        .lt(COL_TIME_KIOTCOD, cutoff);
      if (error) throw error;
      console.log(`   ✅ Đã xoá ${count || 0} bản ghi COD`);
    }

    console.log(dry ? "🔎 DRY RUN xong (chưa xoá gì)" : "🧹 Hoàn tất xoá thật");
  };

  console.log("✅ Sẵn sàng. Mở Console và chạy cleanup({dry:true}) để test, cleanup({dry:false}) để xoá thật.");
})();
