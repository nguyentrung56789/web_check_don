// ===================== login.js =====================

import { clearCase } from './auth_guard.js';

const $ = id => document.getElementById(id);
const STORAGE = localStorage;

let supabase = null;

const TABLE_NV =
  window.COD_CONFIGS?.index?.table ||
  'kv_nhan_vien';


/* =========================
   CHUYỂN VÀO MAIN
========================= */
function goIndex() {
  try {
    const token =
      typeof window.makeAccess === 'function'
        ? window.makeAccess()
        : '';

    const qs =
      token
        ? `?token=${encodeURIComponent(token)}`
        : '';

    location.replace(`./main.html${qs}`);

  } catch (e) {

    location.replace('./main.html');

  }
}


/* =========================
   PARSE JSON
========================= */
function safeParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}


/* =========================
   NẾU ĐÃ CÓ LOGIN
========================= */
(function autoRedirect() {

  const raw = STORAGE.getItem('nv');

  if (!raw) return;

  const nv = safeParse(raw);

  // Chỉ cần có mã + mật khẩu
  // main.html sẽ được check_login.js kiểm tra lại Supabase
  if (
    nv &&
    nv.ma_nv &&
    nv.mat_khau
  ) {

    console.log(
      '[LOGIN] Có phiên cũ, chuyển sang main để kiểm tra...'
    );

    goIndex();
  }

})();


/* =========================
   KHỞI TẠO SUPABASE
========================= */
async function initSupabase() {

  const note = $('cfgNote');

  try {

    let url = '';
    let anon = '';


    /* =========================
       1. API /api/getConfig
    ========================= */
    try {

      const r = await fetch(
        '/api/getConfig',
        {
          headers: {
            'x-internal-key':
              window.getInternalKey?.() ||
              ''
          },
          cache: 'no-store'
        }
      );


      if (r.ok) {

        const j = await r.json();

        console.log(
          '[LOGIN] CONFIG API:',
          j
        );


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
          '[LOGIN] getConfig HTTP:',
          r.status
        );

      }

    } catch (e) {

      console.warn(
        '[LOGIN] API getConfig lỗi:',
        e
      );

    }


    /* =========================
       2. FALLBACK getConfig
    ========================= */
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


          if (typeof u === 'string') {
            url = u;
          }

          if (typeof a === 'string') {
            anon = a;
          }

        }

      } catch (e) {

        console.warn(
          '[LOGIN] getConfig url/anon lỗi:',
          e
        );

      }

    }


    /* =========================
       3. FALLBACK OBJECT
    ========================= */
    if (!url || !anon) {

      try {

        if (
          typeof window.getConfig ===
          'function'
        ) {

          const obj =
            window.getConfig();

          if (obj) {

            url =
              obj?.url ||
              obj?.SUPABASE_URL ||
              obj?.supabaseUrl ||
              url;


            anon =
              obj?.anon ||
              obj?.SUPABASE_ANON ||
              obj?.SUPABASE_ANON_KEY ||
              obj?.key ||
              anon;

          }

        }

      } catch (e) {

        console.warn(
          '[LOGIN] getConfig object lỗi:',
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
        url;

      anon =
        window.COD_BASE?.anon ||
        anon;

    }


    console.log(
      '[LOGIN] Supabase config:',
      {
        url,
        co_anon: !!anon
      }
    );


    if (!url || !anon) {

      throw new Error(
        'Thiếu cấu hình Supabase url/anon'
      );

    }


    if (!window.supabase?.createClient) {

      throw new Error(
        'Chưa load thư viện Supabase JS'
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
      '[LOGIN] Supabase đã sẵn sàng'
    );


  } catch (e) {

    console.error(
      '[LOGIN] initSupabase ERROR:',
      e
    );


    if ($('msg')) {

      $('msg').textContent =
        'Lỗi cấu hình: ' +
        e.message;

    }


    if (note) {

      note.textContent =
        'Không khởi tạo được Supabase.';

    }

  }

}


/* chạy init */
initSupabase();


/* =========================
   LOADING
========================= */
function setLoading(v = true) {

  const b = $('btnLogin');

  if (!b) return;

  b.disabled = v;

  b.textContent =
    v
      ? 'Đang xử lý…'
      : 'Đăng nhập';

}


/* =========================
   ĐĂNG NHẬP
========================= */
async function login() {

  if (!supabase) {

    $('msg').textContent =
      'Supabase chưa sẵn sàng. Thử lại sau vài giây.';

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
      'Vui lòng nhập mã nhân viên và mật khẩu';

    return;

  }


  setLoading(true);

  $('msg').textContent = '';


  try {

    console.log(
      '[LOGIN] Đang đăng nhập:',
      ma
    );


    /* =========================
       CHỈ CHECK:
       ma_nv + mat_khau
    ========================= */

    const {
      data,
      error
    } = await supabase
      .from(TABLE_NV)
      .select(`
        ma_nv,
        ten_nv
      `)
      .eq('ma_nv', ma)
      .eq('mat_khau', mk)
      .limit(1)
      .maybeSingle();


    /* =========================
       LỖI SUPABASE
    ========================= */

    if (error) {

      console.error(
        '[LOGIN] SUPABASE ERROR:',
        error
      );


      $('msg').textContent =
        'Lỗi Supabase: ' +
        error.message;

      return;

    }


    /* =========================
       SAI LOGIN
    ========================= */

    if (!data) {

      $('msg').textContent =
        'Sai mã nhân viên hoặc mật khẩu';

      return;

    }


    /* =========================
       ĐÚNG LOGIN
    ========================= */

    console.log(
      '[LOGIN] Đăng nhập OK:',
      data
    );


    /* =========================
       LƯU LOCALSTORAGE

       QUAN TRỌNG:
       phải giữ mat_khau để
       check_login.js kiểm tra lại
    ========================= */

    try {

      STORAGE.setItem(
        'nv',
        JSON.stringify({
          ma_nv:
            data.ma_nv,

          ten_nv:
            data.ten_nv || '',

          mat_khau:
            mk
        })
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

      console.error(
        '[LOGIN] localStorage ERROR:',
        e
      );


      $('msg').textContent =
        'Không thể lưu phiên đăng nhập.';

      return;

    }


    /* =========================
       SESSION TAB
    ========================= */

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


    /* =========================
       VÀO MAIN
    ========================= */

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
      e.message;


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
   AUTOFILL MÃ NV
========================= */
(function autofill() {

  const el = $('ma_nv');

  if (el) {

    el.value =
      STORAGE.getItem(
        'last_ma_nv'
      ) || '';

  }

})();
