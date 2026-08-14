// ===================== check_login.js =====================

const STORAGE = localStorage;
const TABLE_NV = (window.COD_CONFIGS?.index?.table) || 'kv_nhan_vien';

let checkSupabase = null;


/* =========================
   ĐĂNG XUẤT
========================= */
function logoutCheck(reason = '') {
  console.warn('[CHECK_LOGIN]', reason);

  localStorage.removeItem('nv');
  sessionStorage.removeItem('nv_ctx');
  sessionStorage.removeItem('APP_ACCESS');

  const page = location.pathname.split('/').pop()?.toLowerCase();

  if (page !== 'login.html') {
    location.replace('./login.html');
  }
}


/* =========================
   KHỞI TẠO SUPABASE
========================= */
async function getSupabase() {

  if (checkSupabase) return checkSupabase;

  let url = '';
  let anon = '';

  try {

    const r = await fetch('/api/getConfig', {
      headers: {
        'x-internal-key': window.getInternalKey?.() || ''
      },
      cache: 'no-store'
    });

    if (r.ok) {

      const j = await r.json();

      url =
        j?.url ||
        j?.SUPABASE_URL ||
        j?.supabaseUrl ||
        '';

      anon =
        j?.anon ||
        j?.SUPABASE_ANON ||
        j?.SUPABASE_ANON_KEY ||
        '';
    }

  } catch (e) {
    console.warn('[CHECK_LOGIN] getConfig lỗi:', e);
  }


  /* fallback */
  if (!url || !anon) {

    try {

      if (typeof window.getConfig === 'function') {

        const u = window.getConfig('url');
        const a = window.getConfig('anon');

        if (u) url = u;
        if (a) anon = a;

      }

    } catch {}

  }


  if (!url || !anon) {

    url = window.COD_BASE?.url || url;
    anon = window.COD_BASE?.anon || anon;

  }


  if (!url || !anon) {
    throw new Error('Thiếu cấu hình Supabase');
  }


  if (!window.supabase?.createClient) {
    throw new Error('Chưa load thư viện Supabase');
  }


  checkSupabase = window.supabase.createClient(url, anon);

  return checkSupabase;
}


/* =========================
   CHECK ĐĂNG NHẬP
========================= */
async function checkLogin() {

  try {

    /* =========================
       1. LẤY LOGIN LOCAL
    ========================= */

    const raw = STORAGE.getItem('nv');

    if (!raw) {
      logoutCheck('Chưa đăng nhập');
      return false;
    }


    let nv;

    try {
      nv = JSON.parse(raw);
    } catch {
      logoutCheck('Dữ liệu đăng nhập lỗi');
      return false;
    }


    const ma_nv = String(nv?.ma_nv || '').trim();
    const mat_khau = String(nv?.mat_khau || '').trim();


    if (!ma_nv || !mat_khau) {
      logoutCheck('Thiếu mã nhân viên hoặc mật khẩu');
      return false;
    }


    /* =========================
       2. KẾT NỐI SUPABASE
    ========================= */

    const sb = await getSupabase();


    /* =========================
       3. CHECK ĐÚNG:
          ma_nv
          mat_khau
          hoat_dong=true
    ========================= */

    const { data, error } = await sb
      .from(TABLE_NV)
      .select(`
        ma_nv,
        ten_nv,
        admin,
        dong_hang,
        check_don,
        map,
        hoat_dong
      `)
      .eq('ma_nv', ma_nv)
      .eq('mat_khau', mat_khau)
      .eq('hoat_dong', true)
      .limit(1)
      .maybeSingle();


    if (error) {

      console.error('[CHECK_LOGIN] Supabase:', error);

      logoutCheck('Không kiểm tra được đăng nhập');

      return false;
    }


    /* =========================
       4. KHÔNG KHỚP
    ========================= */

    if (!data) {

      logoutCheck(
        'Sai mã nhân viên, mật khẩu đã thay đổi hoặc tài khoản bị khóa'
      );

      return false;
    }


    /* =========================
       5. LOGIN HỢP LỆ
    ========================= */

    STORAGE.setItem('nv', JSON.stringify({
      ...data,

      // giữ lại mật khẩu để lần sau check
      mat_khau
    }));


    sessionStorage.setItem(
      'nv_ctx',
      JSON.stringify({
        ma_nv: data.ma_nv,
        ten_nv: data.ten_nv || '',
        ts: Date.now()
      })
    );


    console.log(
      '[CHECK_LOGIN] OK:',
      data.ma_nv,
      data.ten_nv
    );


    return data;


  } catch (e) {

    console.error('[CHECK_LOGIN] ERROR:', e);

    logoutCheck(e.message);

    return false;

  }
}


/* =========================
   CHO FILE KHÁC SỬ DỤNG
========================= */

window.checkLogin = checkLogin;
window.logoutCheck = logoutCheck;


/* =========================
   TỰ CHECK MỖI KHI MỞ TRANG
========================= */

checkLogin();
