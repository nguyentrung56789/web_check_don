// ======================================================
// check_login.js
// Kiểm tra đăng nhập mỗi khi mở HTML
// Điều kiện:
// - Có dữ liệu đăng nhập trong localStorage
// - ma_nv đúng
// - mat_khau đúng
// - hoat_dong = true
// Sai -> xóa đăng nhập và chuyển về login.html
// ======================================================

(async function checkLogin() {
  const LOGIN_STORAGE_KEY = 'nv';

  // Không kiểm tra tại trang login
  const page = location.pathname
    .split('/')
    .pop()
    .toLowerCase();

  if (page === 'login.html' || page === 'login') {
    return;
  }

  // ======================================================
  // HÀM ĐĂNG XUẤT
  // ======================================================

  function logout(reason = '') {
    console.warn('[CHECK LOGIN]', reason);

    localStorage.removeItem(LOGIN_STORAGE_KEY);
    localStorage.removeItem('last_ma_nv');

    location.replace('./login.html');
  }

  try {
    // ======================================================
    // 1. LẤY THÔNG TIN ĐĂNG NHẬP ĐÃ LƯU
    // ======================================================

    const raw = localStorage.getItem(LOGIN_STORAGE_KEY);

    if (!raw) {
      logout('Chưa đăng nhập');
      return;
    }

    let loginData;

    try {
      loginData = JSON.parse(raw);
    } catch (err) {
      logout('Dữ liệu đăng nhập không hợp lệ');
      return;
    }

    const ma_nv = String(loginData?.ma_nv || '').trim();
    const mat_khau = String(loginData?.mat_khau || '');

    if (!ma_nv || !mat_khau) {
      logout('Thiếu mã nhân viên hoặc mật khẩu');
      return;
    }

    // ======================================================
    // 2. LẤY INTERNAL KEY
    // ======================================================

    let internalKey = '';

    if (typeof getInternalKey === 'function') {
      internalKey = getInternalKey() || '';
    }

    if (
      !internalKey &&
      typeof INTERNAL_KEY !== 'undefined'
    ) {
      internalKey = INTERNAL_KEY || '';
    }

    if (
      !internalKey &&
      typeof COD_INTERNAL_KEY !== 'undefined'
    ) {
      internalKey = COD_INTERNAL_KEY || '';
    }

    // ======================================================
    // 3. LẤY CONFIG SUPABASE
    // ======================================================

    const headers = {};

    if (internalKey) {
      headers['x-internal-key'] = internalKey;
    }

    const response = await fetch('/api/getConfig', {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(
        `Không lấy được cấu hình: HTTP ${response.status}`
      );
    }

    const cfg = await response.json();

    const SUPABASE_URL =
      cfg.url ||
      cfg.SUPABASE_URL ||
      cfg.supabaseUrl ||
      cfg.supabase_url;

    const SUPABASE_ANON_KEY =
      cfg.anon ||
      cfg.key ||
      cfg.SUPABASE_ANON ||
      cfg.SUPABASE_ANON_KEY ||
      cfg.supabase_anon_key;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY'
      );
    }

    // ======================================================
    // 4. KIỂM TRA THƯ VIỆN SUPABASE
    // ======================================================

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {
      throw new Error(
        'Chưa load thư viện Supabase'
      );
    }

    const db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    // ======================================================
    // 5. CHECK ma_nv + mat_khau
    // ======================================================

    const { data, error } = await db
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
      console.error('[CHECK LOGIN] Supabase:', error);
      logout('Lỗi kiểm tra tài khoản');
      return;
    }

    // ======================================================
    // 6. KHÔNG TÌM THẤY
    // ======================================================

    if (!data) {
      logout('Sai mã nhân viên hoặc mật khẩu đã thay đổi');
      return;
    }

    // ======================================================
    // 7. KIỂM TRA HOẠT ĐỘNG
    // ======================================================

    if (data.hoat_dong !== true) {
      logout('Tài khoản đã bị khóa hoặc ngừng hoạt động');
      return;
    }

    // ======================================================
    // 8. CẬP NHẬT LẠI THÔNG TIN NHÂN VIÊN
    // ======================================================

    const newLoginData = {
      ...loginData,

      ma_nv: data.ma_nv,
      ten_nv: data.ten_nv,
      mat_khau: mat_khau
    };

    localStorage.setItem(
      LOGIN_STORAGE_KEY,
      JSON.stringify(newLoginData)
    );

    localStorage.setItem(
      'last_ma_nv',
      data.ma_nv
    );

    console.log(
      '[CHECK LOGIN] OK:',
      data.ma_nv,
      data.ten_nv
    );

    // Cho các JS khác biết check login đã hoàn thành
    window.LOGIN_CHECKED = true;
    window.LOGIN_USER = newLoginData;

    window.dispatchEvent(
      new CustomEvent('loginChecked', {
        detail: newLoginData
      })
    );

  } catch (err) {
    console.error('[CHECK LOGIN] ERROR:', err);

    logout(
      err?.message ||
      'Không thể kiểm tra đăng nhập'
    );
  }
})();
