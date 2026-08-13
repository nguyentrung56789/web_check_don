// ======================================================
// check_login.js
// Check đăng nhập thật bằng:
// ma_nv + mat_khau + hoat_dong
// ======================================================

(async function () {
  'use strict';

  window.LOGIN_CHECKED = false;
  window.LOGIN_USER = null;
  window.AUTH_ABORTED = false;

  function veLogin(reason = '') {
    console.warn('[CHECK LOGIN] FAIL:', reason);

    window.AUTH_ABORTED = true;
    window.LOGIN_CHECKED = false;
    window.LOGIN_USER = null;

    try {
      localStorage.removeItem('nv');
      localStorage.removeItem('chatwoot_crm_user');
      localStorage.removeItem('last_ma_nv');
    } catch {}

    // Dừng hiển thị trang hiện tại
    document.documentElement.style.display = 'none';

    // Sang login
    location.replace('./login.html');

    return false;
  }

  try {
    // ==========================
    // 1. ĐỌC TÀI KHOẢN ĐÃ LƯU
    // ==========================
    const raw = localStorage.getItem('nv');

    if (!raw) {
      veLogin('Không có phiên đăng nhập');
      return;
    }

    let login;

    try {
      login = JSON.parse(raw);
    } catch {
      veLogin('Dữ liệu đăng nhập không hợp lệ');
      return;
    }

    const ma_nv =
      String(login?.ma_nv || '').trim();

    const mat_khau =
      String(login?.mat_khau || '');

    if (!ma_nv || !mat_khau) {
      veLogin('Thiếu ma_nv hoặc mat_khau');
      return;
    }

    // ==========================
    // 2. LẤY INTERNAL KEY
    // ==========================
    let internalKey = '';

    if (
      typeof window.getInternalKey === 'function'
    ) {
      internalKey =
        window.getInternalKey() || '';
    }

    // ==========================
    // 3. LẤY CONFIG SUPABASE
    // ==========================
    const res = await fetch(
      '/api/getConfig',
      {
        method: 'GET',
        headers: {
          'x-internal-key': internalKey
        },
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      throw new Error(
        `Không lấy được config: ${res.status}`
      );
    }

    const cfg = await res.json();

    const url =
      cfg.url ||
      cfg.SUPABASE_URL ||
      cfg.supabaseUrl ||
      cfg.supabase_url;

    const key =
      cfg.anon ||
      cfg.key ||
      cfg.SUPABASE_ANON ||
      cfg.SUPABASE_ANON_KEY ||
      cfg.supabase_anon_key;

    if (!url || !key) {
      throw new Error(
        'Thiếu cấu hình Supabase'
      );
    }

    // ==========================
    // 4. TẠO SUPABASE CLIENT
    // ==========================
    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {
      throw new Error(
        'Supabase chưa được load'
      );
    }

    const db =
      window.supabase.createClient(
        url,
        key
      );

    // ==========================
    // 5. CHECK TÀI KHOẢN
    // ==========================
    const { data, error } =
      await db
        .from('kv_nhan_vien')
        .select(`
          ma_nv,
          ten_nv,
          mat_khau,
          hoat_dong
        `)
        .eq('ma_nv', ma_nv)
        .eq('mat_khau', mat_khau)
        .maybeSingle();

    if (error) {
      throw error;
    }

    // Không tìm thấy ma_nv + mật khẩu
    if (!data) {
      veLogin(
        'Sai mã nhân viên hoặc mật khẩu'
      );
      return;
    }

    // Tài khoản bị khóa
    if (data.hoat_dong !== true) {
      veLogin(
        'Tài khoản ngừng hoạt động'
      );
      return;
    }

    // ==========================
    // 6. LOGIN HỢP LỆ
    // ==========================
    const user = {
      ...login,
      ma_nv: data.ma_nv,
      ten_nv: data.ten_nv,
      mat_khau
    };

    localStorage.setItem(
      'nv',
      JSON.stringify(user)
    );

    window.LOGIN_USER = user;
    window.LOGIN_CHECKED = true;
    window.AUTH_ABORTED = false;

    console.log(
      '[CHECK LOGIN] OK:',
      user.ma_nv,
      user.ten_nv
    );

    window.dispatchEvent(
      new CustomEvent(
        'loginChecked',
        {
          detail: user
        }
      )
    );

  } catch (error) {
    console.error(
      '[CHECK LOGIN] ERROR:',
      error
    );

    veLogin(
      error?.message ||
      'Không kiểm tra được đăng nhập'
    );
  }
})();
