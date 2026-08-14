// ===================== check_login.js =====================

const STORAGE = localStorage;
const TABLE_NV = (window.COD_CONFIGS?.index?.table) || 'kv_nhan_vien';

let checkSupabase = null;


/* =========================
   ĐĂNG XUẤT
========================= */
function logoutCheck(reason = '') {
  console.warn('[CHECK_LOGIN]', reason);

  // Xóa phiên đăng nhập
  localStorage.removeItem('nv');

  // Xóa ngữ cảnh tab
  sessionStorage.removeItem('nv_ctx');

  // Xóa access token cũ nếu có
  sessionStorage.removeItem('APP_ACCESS');

  const page = (
    location.pathname.split('/').pop() ||
    ''
  ).toLowerCase();

  // Nếu chưa ở login thì chuyển về login
  if (page !== 'login.html') {
    location.replace('./login.html');
  }
}


/* =========================
   KHỞI TẠO SUPABASE
========================= */
async function getSupabase() {

  // Đã có client thì dùng lại
  if (checkSupabase) {
    return checkSupabase;
  }

  let url = '';
  let anon = '';


  /* =========================
     1. LẤY CONFIG TỪ API
  ========================= */
  try {

    const r = await fetch('/api/getConfig', {
      headers: {
        'x-internal-key':
          window.getInternalKey?.() ||
          window.INTERNAL_KEY ||
          window.COD_INTERNAL_KEY ||
          ''
      },
      cache: 'no-store'
    });


    if (r.ok) {

      const j = await r.json();

      url =
        j?.url ||
        j?.SUPABASE_URL ||
        j?.supabaseUrl ||
        j?.supabase_url ||
        '';

      anon =
        j?.anon ||
        j?.key ||
        j?.SUPABASE_ANON ||
        j?.SUPABASE_ANON_KEY ||
        j?.supabaseAnon ||
        j?.supabase_anon ||
        j?.supabase_anon_key ||
        '';

    } else {

      console.warn(
        '[CHECK_LOGIN] /api/getConfig HTTP:',
        r.status
      );

    }

  } catch (e) {

    console.warn(
      '[CHECK_LOGIN] Không lấy được /api/getConfig:',
      e
    );

  }


  /* =========================
     2. FALLBACK getConfig()
  ========================= */
  if (!url || !anon) {

    try {

      if (typeof window.getConfig === 'function') {

        // Kiểu:
        // getConfig('url')
        // getConfig('anon')

        const u = window.getConfig('url');
        const a = window.getConfig('anon');

        if (typeof u === 'string' && u.trim()) {
          url = u.trim();
        }

        if (typeof a === 'string' && a.trim()) {
          anon = a.trim();
        }

      }

    } catch (e) {

      console.warn(
        '[CHECK_LOGIN] getConfig(url/anon) lỗi:',
        e
      );

    }

  }


  /* =========================
     3. FALLBACK getConfig()
        TRẢ VỀ OBJECT
  ========================= */
  if (!url || !anon) {

    try {

      if (typeof window.getConfig === 'function') {

        const obj = window.getConfig();

        if (obj) {

          url =
            obj?.url ||
            obj?.SUPABASE_URL ||
            obj?.supabaseUrl ||
            obj?.supabase_url ||
            url;

          anon =
            obj?.anon ||
            obj?.key ||
            obj?.SUPABASE_ANON ||
            obj?.SUPABASE_ANON_KEY ||
            obj?.supabaseAnon ||
            obj?.supabase_anon ||
            obj?.supabase_anon_key ||
            anon;

        }

      }

    } catch (e) {

      console.warn(
        '[CHECK_LOGIN] getConfig() object lỗi:',
        e
      );

    }

  }


  /* =========================
     4. FALLBACK COD_BASE
  ========================= */
  if (!url || !anon) {

    url =
      window.COD_BASE?.url ||
      window.COD_BASE?.SUPABASE_URL ||
      url;

    anon =
      window.COD_BASE?.anon ||
      window.COD_BASE?.key ||
      window.COD_BASE?.SUPABASE_ANON ||
      anon;

  }


  /* =========================
     5. KIỂM TRA CONFIG
  ========================= */
  console.log('[CHECK_LOGIN] CONFIG:', {
    url: url || '(rỗng)',
    co_anon: !!anon
  });


  if (!url || !anon) {
    throw new Error(
      'Thiếu cấu hình Supabase url/anon'
    );
  }


  /* =========================
     6. KIỂM TRA LIB SUPABASE
  ========================= */
  if (!window.supabase?.createClient) {
    throw new Error(
      'Chưa load thư viện Supabase JS'
    );
  }


  /* =========================
     7. TẠO CLIENT
  ========================= */
  checkSupabase = window.supabase.createClient(
    url,
    anon
  );


  console.log(
    '[CHECK_LOGIN] Đã kết nối Supabase'
  );


  return checkSupabase;
}


/* =========================
   CHECK ĐĂNG NHẬP
========================= */
async function checkLogin() {

  try {

    /* =========================
       1. LẤY LOCAL LOGIN
    ========================= */

    const raw = STORAGE.getItem('nv');


    console.log(
      '[CHECK_LOGIN] Có local nv:',
      !!raw
    );


    if (!raw) {

      logoutCheck(
        'Chưa có thông tin đăng nhập'
      );

      return false;

    }


    /* =========================
       2. PARSE LOCAL
    ========================= */

    let nv = null;

    try {

      nv = JSON.parse(raw);

    } catch (e) {

      logoutCheck(
        'Dữ liệu đăng nhập localStorage bị lỗi'
      );

      return false;

    }


    /* =========================
       3. LẤY ma_nv + mat_khau
    ========================= */

    const ma_nv =
      String(nv?.ma_nv || '').trim();

    const mat_khau =
      String(nv?.mat_khau || '').trim();


    console.log(
      '[CHECK_LOGIN] ma_nv:',
      ma_nv
    );

    console.log(
      '[CHECK_LOGIN] Có mật khẩu:',
      !!mat_khau
    );


    if (!ma_nv) {

      logoutCheck(
        'Không tìm thấy mã nhân viên'
      );

      return false;

    }


    if (!mat_khau) {

      logoutCheck(
        'Không tìm thấy mật khẩu trong phiên đăng nhập'
      );

      return false;

    }


    /* =========================
       4. KẾT NỐI SUPABASE
    ========================= */

    const sb = await getSupabase();


    /* =========================
       5. CHECK
          CHỈ:
          ma_nv
          mat_khau
    ========================= */

    console.log(
      '[CHECK_LOGIN] Đang kiểm tra Supabase:',
      {
        ma_nv,
        co_mat_khau: !!mat_khau
      }
    );


    const { data, error } = await sb
      .from(TABLE_NV)
      .select(`
        ma_nv,
        ten_nv
      `)
      .eq('ma_nv', ma_nv)
      .eq('mat_khau', mat_khau)
      .limit(1)
      .maybeSingle();


    /* =========================
       6. LỖI SUPABASE
    ========================= */

    if (error) {

      console.error(
        '[CHECK_LOGIN] Supabase error:',
        error
      );

      logoutCheck(
        `Lỗi kiểm tra đăng nhập: ${error.message || 'Supabase error'}`
      );

      return false;

    }


    /* =========================
       7. KHÔNG TÌM THẤY
    ========================= */

    if (!data) {

      logoutCheck(
        'Sai mã nhân viên hoặc mật khẩu đã thay đổi'
      );

      return false;

    }


    /* =========================
       8. LOGIN HỢP LỆ
    ========================= */

    const loginData = {
      ...nv,

      // cập nhật lại dữ liệu mới từ Supabase
      ...data,

      // giữ mật khẩu để lần sau tiếp tục check
      mat_khau
    };


    STORAGE.setItem(
      'nv',
      JSON.stringify(loginData)
    );


    /* =========================
       9. LƯU CONTEXT TAB
    ========================= */

    sessionStorage.setItem(
      'nv_ctx',
      JSON.stringify({
        ma_nv: data.ma_nv || '',
        ten_nv: data.ten_nv || '',
        ts: Date.now()
      })
    );


    console.log(
      '[CHECK_LOGIN] ĐĂNG NHẬP HỢP LỆ:',
      data.ma_nv,
      data.ten_nv || ''
    );


    return loginData;


  } catch (e) {

    console.error(
      '[CHECK_LOGIN] ERROR:',
      e
    );


    logoutCheck(
      e?.message ||
      'Không kiểm tra được đăng nhập'
    );


    return false;

  }

}


/* =========================
   CHO FILE KHÁC SỬ DỤNG
========================= */

window.checkLogin = checkLogin;
window.logoutCheck = logoutCheck;
window.getCheckSupabase = getSupabase;


/* =========================
   TỰ CHECK KHI MỞ TRANG
========================= */

checkLogin();
