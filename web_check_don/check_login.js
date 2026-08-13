// ======================================================
// check_login.js
// Mỗi khi mở HTML:
// - kiểm tra nv trong localStorage
// - kiểm tra ma_nv + mat_khau + hoat_dong trong kv_nhan_vien
// - sai -> về login.html ngay
// - đúng -> báo LOGIN_CHECKED = true
// ======================================================

(async function checkLogin() {
  const LOGIN_STORAGE_KEY = 'nv';

  function veLogin(reason = '') {
    console.warn('[CHECK LOGIN]', reason);

    try {
      localStorage.removeItem('nv');
      localStorage.removeItem('chatwoot_crm_user');
      localStorage.removeItem('last_ma_nv');
    } catch {}

    window.LOGIN_CHECKED = false;

    location.replace('./login.html');
  }

  try {
    // ============================
    // 1. KIỂM TRA LOCAL STORAGE
    // ============================
    const raw = localStorage.getItem(LOGIN_STORAGE_KEY);

    if (!raw) {
      veLogin('Chưa đăng nhập');
      return;
    }

    let loginData;

    try {
      loginData = JSON.parse(raw);
    } catch {
      veLogin('Dữ liệu đăng nhập bị lỗi');
      return;
    }

    const ma_nv =
      String(loginData?.ma_nv || '').trim();

    const mat_khau =
      String(loginData?.mat_khau || '');

    if (!ma_nv || !mat_khau) {
      veLogin('Thiếu mã nhân viên hoặc mật khẩu');
      return;
    }

    // ============================
    // 2. LẤY INTERNAL KEY
    // ============================
    let internalKey = '';

    if (typeof window.getInternalKey === 'function') {
      internalKey =
        window.getInternalKey() || '';
    }

    // ============================
    // 3. LẤY CONFIG SUPABASE
    // ============================
    const response = await fetch(
      '/api/getConfig',
      {
        method: 'GET',
        headers: {
          'x-internal-key': internalKey
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        `Không lấy được config: HTTP ${response.status}`
      );
    }

    const cfg = await response.json();

    const url =
      cfg.url ||
      cfg.SUPABASE_URL ||
      cfg.supabaseUrl ||
      cfg.supabase_url;

    const anon =
      cfg.anon ||
      cfg.key ||
      cfg.SUPABASE_ANON ||
      cfg.SUPABASE_ANON_KEY ||
      cfg.supabase_anon_key;

    if (!url || !anon) {
      throw new Error(
        'Thiếu cấu hình Supabase'
      );
    }

    // ============================
    // 4. KIỂM TRA SUPABASE
    // ============================
    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {
      throw new Error(
        'Chưa tải thư viện Supabase'
      );
    }

    const db =
      window.supabase.createClient(
        url,
        anon
      );

    // ============================
    // 5. CHECK TÀI KHOẢN THẬT
    // ============================
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
      console.error(
        '[CHECK LOGIN] Supabase:',
        error
      );

      veLogin('Lỗi kiểm tra tài khoản');
      return;
    }

    // Không đúng ma_nv + mật khẩu
    if (!data) {
      veLogin(
        'Sai mã nhân viên hoặc mật khẩu'
      );
      return;
    }

    // Tài khoản đã khóa
    if (data.hoat_dong !== true) {
      veLogin(
        'Tài khoản đã ngừng hoạt động'
      );
      return;
    }

    // ============================
    // 6. ĐÚNG
    // ============================
    const user = {
      ...loginData,
      ma_nv: data.ma_nv,
      ten_nv: data.ten_nv,
      mat_khau: mat_khau
    };

    localStorage.setItem(
      LOGIN_STORAGE_KEY,
      JSON.stringify(user)
    );

    window.LOGIN_USER = user;
    window.LOGIN_CHECKED = true;

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

    // BẤT KỲ LỖI NÀO CŨNG VỀ LOGIN
    veLogin(
      error?.message ||
      'Không kiểm tra được đăng nhập'
    );
  }
})();
