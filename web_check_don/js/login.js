// ===================== login.js =====================

const $ = id => document.getElementById(id);
const STORAGE = localStorage;

let supabaseClient = null;

// Bảng nhân viên đăng nhập
const TABLE_NV = 'kv_nhan_vien';


/* =====================================================
   CHUYỂN SANG MAIN
===================================================== */
function goIndex() {
  location.replace('./main.html');
}


/* =====================================================
   LOADING
===================================================== */
function setLoading(v = true) {

  const btn = $('btnLogin');

  if (!btn) return;

  btn.disabled = v;

  btn.textContent = v
    ? 'Đang xử lý…'
    : 'Đăng nhập';
}


/* =====================================================
   THÔNG BÁO
===================================================== */
function setMessage(text = '') {

  const msg = $('msg');

  if (msg) {
    msg.textContent = text;
  }
}


/* =====================================================
   LẤY CẤU HÌNH SUPABASE
===================================================== */
async function getSupabaseConfig() {

  let url = '';
  let anon = '';


  // ==================================================
  // 1. LẤY TỪ /api/getConfig
  // ==================================================
  try {

    const response = await fetch(
      '/api/getConfig',
      {
        method: 'GET',

        headers: {
          'x-internal-key':
            window.getInternalKey?.() || ''
        },

        cache: 'no-store'
      }
    );


    if (response.ok) {

      const config =
        await response.json();


      url =
        config?.url ||
        config?.SUPABASE_URL ||
        config?.supabaseUrl ||
        config?.supabase_url ||
        '';


      anon =
        config?.anon ||
        config?.SUPABASE_ANON ||
        config?.SUPABASE_ANON_KEY ||
        config?.supabase_anon_key ||
        '';

    }

  } catch (error) {

    console.warn(
      '[LOGIN] /api/getConfig lỗi:',
      error
    );

  }


  // ==================================================
  // 2. FALLBACK getConfig('url')
  // ==================================================
  if (!url || !anon) {

    try {

      if (
        typeof window.getConfig ===
        'function'
      ) {

        const u =
          window.getConfig('url');

        const a =
          window.getConfig('anon');


        if (
          typeof u === 'string'
        ) {
          url = u;
        }


        if (
          typeof a === 'string'
        ) {
          anon = a;
        }

      }

    } catch (error) {

      console.warn(
        '[LOGIN] getConfig(key) lỗi:',
        error
      );

    }

  }


  // ==================================================
  // 3. FALLBACK getConfig()
  // ==================================================
  if (!url || !anon) {

    try {

      if (
        typeof window.getConfig ===
        'function'
      ) {

        const config =
          window.getConfig();


        url =
          config?.url ||
          url;


        anon =
          config?.anon ||
          anon;

      }

    } catch {}

  }


  // ==================================================
  // 4. FALLBACK COD_BASE
  // ==================================================
  if (!url || !anon) {

    url =
      window.COD_BASE?.url ||
      url;


    anon =
      window.COD_BASE?.anon ||
      anon;

  }


  if (!url) {

    throw new Error(
      'Không lấy được Supabase URL'
    );

  }


  if (!anon) {

    throw new Error(
      'Không lấy được Supabase ANON KEY'
    );

  }


  return {
    url,
    anon
  };
}


/* =====================================================
   KHỞI TẠO SUPABASE
===================================================== */
async function initSupabase() {

  const note = $('cfgNote');

  try {

    if (note) {
      note.textContent =
        'Đang kết nối Supabase...';
    }


    if (
      !window.supabase ||
      typeof window.supabase.createClient !==
      'function'
    ) {

      throw new Error(
        'Thư viện Supabase chưa được tải'
      );

    }


    const {
      url,
      anon
    } =
      await getSupabaseConfig();


    supabaseClient =
      window.supabase.createClient(
        url,
        anon
      );


    console.log(
      '[LOGIN] Supabase sẵn sàng'
    );


    if (note) {

      note.textContent =
        'Đã sẵn sàng. Vui lòng đăng nhập.';

    }


    return true;

  } catch (error) {

    console.error(
      '[LOGIN] INIT ERROR:',
      error
    );


    setMessage(
      'Lỗi cấu hình: ' +
      (
        error?.message ||
        String(error)
      )
    );


    if (note) {

      note.textContent =
        'Không khởi tạo được Supabase.';

    }


    return false;
  }

}


/* =====================================================
   ĐĂNG NHẬP
===================================================== */
async function login() {

  if (!supabaseClient) {

    setMessage(
      'Supabase chưa sẵn sàng.'
    );

    return;
  }


  const ma =
    String(
      $('ma_nv')?.value ||
      ''
    ).trim();


  const mk =
    String(
      $('mat_khau')?.value ||
      ''
    ).trim();


  // ==================================================
  // KIỂM TRA INPUT
  // ==================================================
  if (!ma) {

    setMessage(
      'Vui lòng nhập mã nhân viên.'
    );

    $('ma_nv')?.focus();

    return;
  }


  if (!mk) {

    setMessage(
      'Vui lòng nhập mật khẩu.'
    );

    $('mat_khau')?.focus();

    return;
  }


  setLoading(true);
  setMessage('');


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


    // ==================================================
    // KIỂM TRA MA_NV + MAT_KHAU
    //
    // Không select các cột admin/dong_hang/check_don/map
    // vì kv_nhan_vien không có các cột đó.
    // ==================================================
    const {
      data,
      error
    } =
      await supabaseClient

        .from(TABLE_NV)

        .select(
          'ma_nv, ten_nv, hoat_dong'
        )

        .eq(
          'ma_nv',
          ma
        )

        .eq(
          'mat_khau',
          mk
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


    // ==================================================
    // LỖI QUERY
    // ==================================================
    if (error) {

      console.error(
        '[LOGIN] SUPABASE ERROR:',
        error
      );


      setMessage(
        'Lỗi Supabase: ' +
        (
          error.message ||
          error.code ||
          'Không xác định'
        )
      );


      return;
    }


    // ==================================================
    // KHÔNG KHỚP MÃ + MẬT KHẨU
    // ==================================================
    if (!data) {

      setMessage(
        'Sai mã hoặc mật khẩu'
      );

      return;
    }


    // ==================================================
    // TÀI KHOẢN BỊ KHÓA
    // ==================================================
    if (
      data.hoat_dong !== true
    ) {

      try {

        STORAGE.removeItem(
          'nv'
        );


        sessionStorage.removeItem(
          'nv_ctx'
        );

      } catch {}


      setMessage(
        'Tài khoản đã bị dừng hoạt động.'
      );


      return;
    }


    // ==================================================
    // LOGIN HỢP LỆ
    //
    // Lưu mật khẩu để check_login.js
    // kiểm tra lại khi mở main.html.
    // ==================================================
    const loginData = {

      ma_nv:
        data.ma_nv,

      ten_nv:
        data.ten_nv ||
        '',

      hoat_dong:
        data.hoat_dong,

      mat_khau:
        mk

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


      if (
        !STORAGE.getItem('nv')
      ) {

        throw new Error(
          'localStorage bị chặn'
        );

      }

    } catch (error) {

      console.error(
        '[LOGIN] Lưu localStorage lỗi:',
        error
      );


      setMessage(
        'Không thể lưu phiên đăng nhập.'
      );


      return;
    }


    // ==================================================
    // SESSION CONTEXT
    // ==================================================
    sessionStorage.setItem(
      'nv_ctx',
      JSON.stringify({

        ma_nv:
          data.ma_nv ||
          '',

        ten_nv:
          data.ten_nv ||
          '',

        ts:
          Date.now()

      })
    );


    console.log(
      '[LOGIN] ĐĂNG NHẬP THÀNH CÔNG:',
      {
        ma_nv:
          data.ma_nv,

        ten_nv:
          data.ten_nv,

        hoat_dong:
          data.hoat_dong
      }
    );


    if (
      navigator.vibrate
    ) {

      navigator.vibrate(60);

    }


    goIndex();


  } catch (error) {

    console.error(
      '[LOGIN] ERROR:',
      error
    );


    setMessage(
      'Lỗi: ' +
      (
        error?.message ||
        String(error)
      )
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
    event => {

      if (
        event.key ===
        'Enter'
      ) {

        login();

      }

    }
  );


$('ma_nv')
  ?.addEventListener(
    'keydown',
    event => {

      if (
        event.key ===
        'Enter'
      ) {

        $('mat_khau')
          ?.focus();

      }

    }
  );


/* =====================================================
   AUTOFILL MÃ NHÂN VIÊN
===================================================== */
(function autofill() {

  const el =
    $('ma_nv');


  if (!el) {
    return;
  }


  el.value =
    STORAGE.getItem(
      'last_ma_nv'
    ) || '';

})();


/* =====================================================
   START
===================================================== */
initSupabase();
