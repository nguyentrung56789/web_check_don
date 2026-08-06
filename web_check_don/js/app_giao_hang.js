/* ===== Supabase: cấu hình giống Quan_ly_cod.js ===== */

const CFG_CACHE_KEY = 'cod_cfg_cache_v3';

let supa = null;

const confNV = {
  table: 'kv_nhan_vien',
  url: '',
  key: ''
};

/*
 * Giữ cấu hình tên bảng và tên cột từ cod_config.js.
 */
const CFG = {
  ...(window.COD_CONFIG || {})
};

/*
 * Lấy cấu hình Supabase.
 * Ưu tiên đọc cache, nếu chưa có thì gọi /api/getConfig.
 */
async function getSbConfig() {
  try {
    const raw =
      localStorage.getItem(CFG_CACHE_KEY);

    if (raw) {
      const cached = JSON.parse(raw);

      if (
        cached?.url &&
        cached?.anon
      ) {
        return {
          url: cached.url,
          anon: cached.anon
        };
      }
    }
  } catch (error) {
    console.warn(
      '[GIAO HÀNG] Không đọc được cache config:',
      error
    );
  }

  const internalKey =
    typeof window.getInternalKey === 'function'
      ? window.getInternalKey()
      : '';

  const response = await fetch(
    '/api/getConfig',
    {
      method: 'GET',

      headers: {
        'x-internal-key': internalKey,
        Accept: 'application/json'
      },

      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Không lấy được config: HTTP ${response.status} ${text}`
    );
  }

  const config =
    await response.json();

  if (
    !config?.url ||
    !config?.anon
  ) {
    console.error(
      '[GIAO HÀNG] Config API trả về:',
      config
    );

    throw new Error(
      'Thiếu url/anon'
    );
  }

  try {
    localStorage.setItem(
      CFG_CACHE_KEY,
      JSON.stringify(config)
    );
  } catch {}

  return {
    url: config.url,
    anon: config.anon
  };
}

/*
 * Khởi tạo Supabase một lần.
 */
const supabaseReady = (
  async () => {
    const {
      url,
      anon
    } = await getSbConfig();

    if (
      !window.supabase ||
      typeof window.supabase.createClient !==
        'function'
    ) {
      throw new Error(
        'Thư viện Supabase chưa được tải'
      );
    }

    supa =
      window.supabase.createClient(
        url,
        anon
      );

    /*
     * Dùng cho phần đăng nhập nhân viên.
     */
    confNV.url = url;
    confNV.key = anon;

    /*
     * Dùng cho các hàm REST:
     * sbSelect, sbPatch, sbSelectWithCount.
     */
    CFG.url = url;
    CFG.key = anon;

    console.log(
      '[GIAO HÀNG] Supabase sẵn sàng:',
      {
        url,
        tableNhanVien:
          confNV.table
      }
    );

    return supa;
  }
)().catch(error => {
  console.error(
    '[GIAO HÀNG] Lỗi cấu hình Supabase:',
    error
  );

  alert(
    error?.message ||
    'Không thể lấy cấu hình Supabase'
  );

  throw error;
});

/* ===== Cấu hình bảng và cột ===== */

const KEY_VD =
  CFG.keyColVD ||
  CFG.keyCol ||
  'ma_vd';

const KEY_DON_HD =
  CFG.keyColHD ||
  'ma_hd';

const KEY_KH =
  CFG.keyColKH ||
  'ma_kh';

const DATE_COL =
  CFG.dateCol ||
  'ngay_chuan_bi_don';

const TABLE_VD_KIOT =
  CFG.tableVD ||
  CFG.table?.vd ||
  'don_hang_kiot_cod';

const TABLE_DON =
  CFG.tableHD ||
  CFG.table?.hd ||
  'don_hang';

const TABLE_CT =
  CFG.tableCT ||
  CFG.table?.ct ||
  'don_hang_chitiet';
