// ===================== login.js =====================

const $ = id => document.getElementById(id);
const STORAGE = localStorage;

const TABLE_NV = 'kv_nhan_vien';

let supabaseClient = null;


/* =========================
   CHUYỂN MAIN
========================= */
function goIndex() {
  location.replace('./main.html');
}


/* =========================
   LOADING
========================= */
function setLoading(v = true) {
  const btn = $('btnLogin');

  if (!btn) return;

  btn.disabled = v;
  btn.textContent = v ? 'Đang xử lý…' : 'Đăng nhập';
}


/* =========================
   KHỞI TẠO SUPABASE
========================= */
async function initSupabase() {

  const note = $('cfgNote');
  const msg = $('msg');

  try {

    if (note) {
      note.textContent = 'Đang kết nối Supabase...';
    }

    console.log('[LOGIN] bắt đầu initSupabase');

    let url = '';
    let anon = '';

    // ==============================
    // CÁCH 1: /api/getConfig
    // ==============================
    try {

      const internalKey =
        typeof window.getInternalKey === 'function'
          ? window.getInternalKey()
          : '';

      console.log(
        '[LOGIN] internal key:',
        internalKey ? 'CÓ' : 'KHÔNG'
      );

      const response = await fetch('/api/getConfig', {
        method: 'GET',
        headers: {
          'x-internal-key': internalKey
        },
        cache: 'no-store'
      });

      console.log(
        '[LOGIN] getConfig status:',
        response.status
      );

      if (response.ok) {

        const cfg = await response.json();

        console.log(
          '[LOGIN] getConfig:',
          cfg
        );

        url =
          cfg?.url ||
          cfg?.SUPABASE_URL ||
          cfg?.supabaseUrl ||
          cfg?.supabase_url ||
          '';

        anon =
          cfg?.anon ||
          cfg?.SUPABASE_ANON ||
          cfg?.SUPABASE_ANON_KEY ||
          cfg?.supabase_anon_key ||
          '';
      }

    } catch (e) {

      console.warn(
        '[LOGIN] API getConfig lỗi:',
        e
      );

    }


    // ==============================
    // CÁCH 2: window.getConfig
    // ==============================
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

          console.log(
            '[LOGIN] getConfig(url):',
            u
          );

          console.log(
            '[LOGIN] getConfig(anon):',
            a ? 'CÓ' : 'KHÔNG'
          );

          if (typeof u === 'string') {
            url = u;
          }

          if (typeof a === 'string') {
            anon = a;
          }

        }

      } catch (e) {

        console.warn(
          '[LOGIN] window.getConfig(key) lỗi:',
          e
        );

      }

    }


    // ==============================
    // CÁCH 3: COD_BASE
    // ==============================
    if (!url || !anon) {

      console.log(
        '[LOGIN] COD_BASE:',
        window.COD_BASE
      );

      url =
        window.COD_BASE?.url ||
        url;

      anon =
        window.COD_BASE?.anon ||
        anon;
    }


    // ==============================
    // KIỂM TRA CONFIG
    // ==============================
    console.log(
      '[LOGIN] SUPABASE URL:',
      url
    );

    console.log(
      '[LOGIN] ANON:',
      anon ? 'CÓ' : 'KHÔNG'
    );


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


    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {

      throw new Error(
        'Thư viện Supabase chưa được tải'
      );
    }


    supabaseClient =
      window.supabase.createClient(
        url,
        anon
      );


    console.log(
      '[LOGIN] Supabase khởi tạo thành công'
    );


    if (note) {
      note.textContent =
        'Đã sẵn sàng. Vui lòng đăng nhập.';
    }

    return true;


  } catch (e) {

    console.error(
      '[LOGIN] INIT ERROR:',
      e
    );


    if (msg) {
      msg.textContent =
        'Lỗi cấu hình: ' +
        e.message;
    }


    if (note) {
      note.textContent =
        'Không khởi tạo được Supabase.';
    }

    return false;
  }
}


/* =========================
   LOGIN
========================= */
async function login() {

  if (!supabaseClient) {

    $('msg').textContent =
      'Supabase chưa sẵn sàng.';

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
      '[LOGIN] đăng nhập:',
      ma
    );


    const {
      data,
      error
    } =
      await supabaseClient
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


    if (error) {

      $('msg').textContent =
        'Lỗi Supabase: ' +
        (
          error.message ||
          error.code ||
          ''
        );

      return;
    }


    if (!data) {

      $('msg').textContent =
        'Sai mã hoặc mật khẩu';

      return;
    }


    if (data.hoat_dong !== true) {

      $('msg').textContent =
        'Tài khoản đã bị dừng hoạt động.';

      return;
    }


    // Lưu cả mật khẩu để check_login.js dùng
    const loginData = {
      ...data,
      mat_khau: mk
    };


    STORAGE.setItem(
      'nv',
      JSON.stringify(loginData)
    );


    STORAGE.setItem(
      'last_ma_nv',
      ma
    );


    sessionStorage.setItem(
      'nv_ctx',
      JSON.stringify({
        ma_nv: data.ma_nv || '',
        ten_nv: data.ten_nv || '',
        ts: Date.now()
      })
    );


    console.log(
      '[LOGIN] thành công'
    );


    goIndex();


  } catch (e) {

    console.error(
      '[LOGIN] LOGIN ERROR:',
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


/* =========================
   EVENTS
========================= */
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


/* =========================
   AUTOFILL
========================= */
const maNvInput =
  $('ma_nv');

if (maNvInput) {
  maNvInput.value =
    STORAGE.getItem(
      'last_ma_nv'
    ) || '';
}


/* =========================
   START
========================= */
initSupabase();
