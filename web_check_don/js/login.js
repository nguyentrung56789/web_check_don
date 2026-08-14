// ===================== login.js =====================

const $ = id => document.getElementById(id);
const STORAGE = localStorage;

let supabase;

// Cố định đúng bảng đăng nhập
const TABLE_NV = 'kv_nhan_vien';


/* =====================================================
   CHUYỂN SANG MAIN
   KHÔNG DÙNG TOKEN
===================================================== */
function goIndex() {
  location.replace('./main.html');
}


/* =====================================================
   PARSE JSON
===================================================== */
function safeParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}


/* =====================================================
   INIT SUPABASE
===================================================== */
async function initSupabase() {

  const note = $('cfgNote');

  try {

    let url;
    let anon;

    // 1. Lấy config từ API
    try {

      const r = await fetch('/api/getConfig', {
        headers: {
          'x-internal-key': window.getInternalKey?.() || ''
        },
        cache: 'no-store'
      });

      if (r.ok) {

        const j = await r.json();

        url = j?.url;
        anon = j?.anon;

      }

    } catch (e) {

      console.warn(
        '[LOGIN] /api/getConfig lỗi:',
        e
      );

    }


    // 2. fallback getConfig
    if (!url || !anon) {

      try {

        if (typeof window.getConfig === 'function') {

          const u1 = window.getConfig('url');
          const a1 = window.getConfig('anon');

          if (
            typeof u1 === 'string' &&
            typeof a1 === 'string'
          ) {
            url = u1;
            anon = a1;
          }

        }

      } catch {}



      try {

        if (
          (!url || !anon) &&
          typeof window.getConfig === 'function'
        ) {

          const obj = window.getConfig();

          if (obj?.url && obj?.anon) {
            url = obj.url;
            anon = obj.anon;
          }

        }

      } catch {}



      if (!url || !anon) {

        url =
          window.COD_BASE?.url ||
          url;

        anon =
          window.COD_BASE?.anon ||
          anon;

      }

    }


    if (!url || !anon) {

      throw new Error(
        'Thiếu cấu hình Supabase (url/anon)'
      );

    }


    if (!window.supabase?.createClient) {

      throw new Error(
        'Chưa tải thư viện Supabase'
      );

    }


    supabase =
      window.supabase.createClient(
        url,
        anon
      );


    if (note) {

      note.textContent =
        'Đã sẵn sàng. Vui lòng đăng nhập.';

    }


    console.log(
      '[LOGIN] Supabase ready'
    );

  } catch (e) {

    $('msg').textContent =
      'Lỗi cấu hình: ' +
      e.message;


    if (note) {

      note.textContent =
        'Không khởi tạo được Supabase.';

    }


    console.error(
      '[LOGIN] initSupabase ERROR:',
      e
    );

  }

}


/* =====================================================
   UI LOADING
===================================================== */
function setLoading(v = true) {

  const b = $('btnLogin');

  if (!b) return;

  b.disabled = v;

  b.textContent =
    v
      ? 'Đang xử lý…'
      : 'Đăng nhập';

}


/* =====================================================
   ĐĂNG NHẬP
===================================================== */
async function login() {

  if (!supabase) {

    $('msg').textContent =
      'Đang khởi tạo, thử lại…';

    return;

  }


  const ma =
    String(
      $('ma_nv')?.value || ''
    ).trim();


  const mk =
    String(
      $('mat_khau')?.value || ''
    ).trim();


  if (!ma || !mk) {

    $('msg').textContent =
      'Vui lòng nhập đủ thông tin';

    return;

  }


  setLoading(true);

  $('msg').textContent = '';


  try {

    console.log(
      '========== LOGIN =========='
    );

    console.log(
      '[LOGIN] TABLE:',
      TABLE_NV
    );

    console.log(
      '[LOGIN] MA_NV:',
      ma
    );


    const {
      data,
      error
    } =
      await supabase

        .from(TABLE_NV)

        .select(
          'ma_nv, ten_nv, admin, dong_hang, check_don, map, hoat_dong'
        )

        .eq(
          'ma_nv',
          ma
        )

        .eq(
          'mat_khau',
          mk.toString()
        )

        .limit(1)

        .maybeSingle();


    console.log(
      '[LOGIN] DATA:',
      data
    );

    console.log(
      '[LOGIN] ERROR:',
      error
    );


    // =========================================
    // LỖI SUPABASE
    // =========================================
    if (error) {

      console.error(
        '[LOGIN] SUPABASE ERROR:',
        error
      );


      $('msg').textContent =
        'Lỗi Supabase: ' +
        (
          error.message ||
          error.code ||
          'Không xác định'
        );


      return;

    }


    // =========================================
    // KHÔNG KHỚP MA_NV + MAT_KHAU
    // =========================================
    if (!data) {

      $('msg').textContent =
        'Sai mã hoặc mật khẩu';

      return;

    }


    // =========================================
    // TÀI KHOẢN KHÓA
    // =========================================
    if (data.hoat_dong !== true) {

      try {

        STORAGE.removeItem('nv');

        sessionStorage.removeItem(
          'nv_ctx'
        );

      } catch {}


      $('msg').textContent =
        'Tài khoản đã bị dừng hoạt động.';

      return;

    }


    // =========================================
    // LƯU LOGIN
    // Có thêm mat_khau để check_login.js dùng
    // =========================================
    const loginData = {
      ...data,
      mat_khau: mk
    };


    try {

      STORAGE.setItem(
        'nv',
        JSON.stringify(
          loginData
        )
      );


      STORAGE.setItem(
        'last_ma_nv',
        ma
      );


      if (!STORAGE.getItem('nv')) {

        throw new Error(
          'localStorage bị chặn'
        );

      }

    } catch (e) {

      $('msg').textContent =
        'Không thể lưu phiên đăng nhập.';

      console.error(e);

      return;

    }


    // =========================================
    // SESSION CONTEXT
    // =========================================
    sessionStorage.setItem(
      'nv_ctx',
      JSON.stringify({
        ma_nv:
          data.ma_nv || '',

        ten_nv:
          data.ten_nv || '',

        ts:
          Date.now()
      })
    );


    console.log(
      '[LOGIN] ĐĂNG NHẬP THÀNH CÔNG:',
      data
    );


    if (navigator.vibrate) {

      navigator.vibrate(60);

    }


    goIndex();


  } catch (e) {

    console.error(
      '[LOGIN] ERROR:',
      e
    );


    $('msg').textContent =
      'Lỗi: ' +
      (
        e?.message ||
        String(e)
      );


  } finally {

    setLoading(false);

  }

}


/* =====================================================
   EVENTS
===================================================== */

$('btnLogin')
  ?.addEventListener(
    'click',
    login
  );


$('mat_khau')
  ?.addEventListener(
    'keydown',
    e => {

      if (e.key === 'Enter') {

        login();

      }

    }
  );


/* =====================================================
   AUTOFILL MA_NV
===================================================== */

(function autofill() {

  const el = $('ma_nv');

  if (el) {

    el.value =
      STORAGE.getItem(
        'last_ma_nv'
      ) || '';

  }

})();


/* =====================================================
   START
===================================================== */

initSupabase();
