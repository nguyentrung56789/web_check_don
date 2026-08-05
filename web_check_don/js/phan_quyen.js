// ==================== js/phan_quyen.js ====================

const PERMISSION_VIEW = 'sql_phan_quyen_nhan_vien';

const LOGIN_STORAGE_KEYS = [
  'nv',
  'chatwoot_crm_user'
];

let supabaseClientCache = null;
const permissionCache = new Map();

/* =========================================================
   CÔNG CỤ CHUNG
========================================================= */

function clean(value) {
  return String(value ?? '').trim();
}

function toBool(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    clean(value).toLowerCase() === 'true'
  );
}

function normalizeFunctionId(value) {
  return clean(value).toLowerCase();
}

function normalizePage(value) {
  let path = clean(value)
    .replace(/\\/g, '/')
    .split('?')[0]
    .split('#')[0];

  path = path.split('/').pop() || 'main.html';

  return path.toLowerCase();
}

function debugLog(message, data = '') {
  console.log(message, data);

  if (typeof window.debugLog === 'function') {
    window.debugLog(message, data);
  }
}

/* =========================================================
   LẤY TÊN TRANG HIỆN TẠI
========================================================= */

export function layTenFileHienTai() {
  return normalizePage(window.location.pathname);
}

/* =========================================================
   ĐỌC NHÂN VIÊN ĐANG ĐĂNG NHẬP
========================================================= */

export function layNhanVienDangNhap() {
  for (const storageKey of LOGIN_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(storageKey);

      if (!raw) {
        continue;
      }

      const data = JSON.parse(raw);

      if (data && typeof data === 'object') {
        return {
          ...data,
          __storageKey: storageKey
        };
      }
    } catch (error) {
      console.warn(
        `[PHÂN QUYỀN] Không đọc được localStorage "${storageKey}"`,
        error
      );
    }
  }

  return null;
}

function layMaNhanVienDangNhap() {
  const user = layNhanVienDangNhap();

  if (!user) {
    return '';
  }

  return clean(
    user.ma_nv ||
    user.id_nv ||
    user.maNhanVien ||
    user.ma_nhan_vien
  );
}

/* =========================================================
   TẠO SUPABASE CLIENT
========================================================= */

export async function taoSupabaseClient() {
  if (supabaseClientCache) {
    return supabaseClientCache;
  }

  if (!window.supabase) {
    throw new Error(
      'Không tải được thư viện Supabase. Kiểm tra script Supabase trong HTML.'
    );
  }

  const internalKey =
    (
      typeof window.getInternalKey === 'function'
        ? window.getInternalKey()
        : ''
    ) ||
    window.INTERNAL_KEY ||
    window.COD_INTERNAL_KEY ||
    window.internalKey ||
    '';

  const headers = {};

  if (internalKey) {
    headers['x-internal-key'] = internalKey;
  }

  debugLog('[PHÂN QUYỀN] Đang gọi /api/getConfig');

  const response = await fetch('/api/getConfig', {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      `Không tải được cấu hình Supabase: HTTP ${response.status} - ${responseText}`
    );
  }

  const config = await response.json();

  const supabaseUrl =
    config.url ||
    config.SUPABASE_URL ||
    config.supabaseUrl ||
    config.supabase_url;

  const supabaseKey =
    config.anon ||
    config.key ||
    config.SUPABASE_ANON ||
    config.SUPABASE_ANON_KEY ||
    config.supabaseAnon ||
    config.supabaseKey ||
    config.supabase_anon_key;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      '/api/getConfig không trả SUPABASE_URL hoặc SUPABASE_ANON_KEY'
    );
  }

  supabaseClientCache = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
  );

  debugLog('[PHÂN QUYỀN] Tạo Supabase client thành công');

  return supabaseClientCache;
}

/* =========================================================
   LẤY MỘT DÒNG QUYỀN TỪ VIEW SQL
========================================================= */

export async function layDongPhanQuyen(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const maNv = layMaNhanVienDangNhap();
  const page = normalizePage(duongDan);
  const functionId = normalizeFunctionId(id_chucnang);

  if (!maNv) {
    throw new Error(
      'Không lấy được ma_nv của nhân viên đang đăng nhập'
    );
  }

  if (!functionId) {
    throw new Error('Thiếu id_chucnang');
  }

  const cacheKey = [
    maNv,
    page,
    functionId
  ].join('|');

  if (
    !batBuocTaiLai &&
    permissionCache.has(cacheKey)
  ) {
    return permissionCache.get(cacheKey);
  }

  const client = await taoSupabaseClient();

  debugLog('[PHÂN QUYỀN] Điều kiện truy vấn', {
    ma_nv: maNv,
    duong_dan: page,
    id_chucnang: functionId
  });

  /*
   * Dùng select('*') để có thể đọc được:
   * - vai_tro_id
   * hoặc id_vaitro
   *
   * tùy tên cột thực tế trong view.
   */
  const { data, error } = await client
    .from(PERMISSION_VIEW)
    .select('*')
    .eq('ma_nv', maNv)
    .eq('duong_dan', page)
    .eq('id_chucnang', functionId)
    .limit(1);

  if (error) {
    throw error;
  }

  const row =
    Array.isArray(data) && data.length
      ? data[0]
      : null;

  permissionCache.set(cacheKey, row);

  return row;
}

/* =========================================================
   HÀM CHÍNH: QUYỀN ĐƯỢC XEM
========================================================= */

export async function quyen_duocxem(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  options = {}
) {
  const {
    thongBao = false,
    batBuocTaiLai = false
  } = options;

  try {
    const loginUser = layNhanVienDangNhap();

    const maNvDangNhap = clean(
      loginUser?.ma_nv ||
      loginUser?.id_nv ||
      loginUser?.maNhanVien ||
      loginUser?.ma_nhan_vien
    );

    const page = normalizePage(duongDan);
    const functionId = normalizeFunctionId(id_chucnang);

    if (!maNvDangNhap) {
      throw new Error('Không lấy được ma_nv từ tài khoản đăng nhập');
    }

    const client = await taoSupabaseClient();

    const { data, error } = await client
      .from('sql_phan_quyen_nhan_vien')
      .select('*')
      .eq('ma_nv', maNvDangNhap)
      .eq('duong_dan', page)
      .eq('id_chucnang', functionId)
      .limit(1);

    if (error) {
      throw error;
    }

    const row =
      Array.isArray(data) && data.length
        ? data[0]
        : null;

    const vaiTroId = clean(
      row?.vai_tro_id ??
      row?.id_vaitro ??
      row?.id_vai_tro
    );

    const duocXem = toBool(row?.duoc_xem);

    const ketQua = {
      ma_nv: maNvDangNhap,
      vai_tro_id: vaiTroId || null,
      id_chucnang: functionId,
      duong_dan: page,
      tim_thay: Boolean(row),
      duoc_xem: duocXem,
      du_lieu_sql: row
    };

    console.log('[KẾT QUẢ PHÂN QUYỀN]', ketQua);

    if (thongBao) {
      alert(
        [
          'KẾT QUẢ PHÂN QUYỀN',
          '',
          `ma_nv đăng nhập: ${maNvDangNhap}`,
          `vai_tro_id: ${vaiTroId || 'KHÔNG CÓ'}`,
          `id_chucnang: ${functionId}`,
          `duong_dan: ${page}`,
          `tìm thấy quyền: ${Boolean(row)}`,
          `duoc_xem: ${duocXem}`
        ].join('\n')
      );
    }

    return duocXem;
  } catch (error) {
    console.error('[PHÂN QUYỀN] Lỗi:', error);

    if (options?.thongBao) {
      alert(
        [
          'LỖI KIỂM TRA PHÂN QUYỀN',
          '',
          `id_chucnang: ${id_chucnang}`,
          `message: ${error?.message || String(error)}`
        ].join('\n')
      );
    }

    return false;
  }
} catch (error) {
    console.error(
      '[QUYỀN ĐƯỢC XEM] Lỗi:',
      {
        id_chucnang,
        duong_dan: duongDan,
        message:
          error?.message ||
          String(error),
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null
      }
    );

    if (options?.thongBao) {
      alert(
        [
          'LỖI KIỂM TRA PHÂN QUYỀN',
          '',
          `id_chucnang: ${id_chucnang || 'KHÔNG CÓ'}`,
          `duong_dan: ${normalizePage(duongDan)}`,
          `message: ${error?.message || String(error)}`,
          `code: ${error?.code || 'KHÔNG CÓ'}`,
          `details: ${error?.details || 'KHÔNG CÓ'}`,
          `hint: ${error?.hint || 'KHÔNG CÓ'}`
        ].join('\n')
      );
    }

    return false;
  }
}

/* =========================================================
   LẤY CHI TIẾT QUYỀN
========================================================= */

export async function layChiTietQuyen(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  try {
    const row = await layDongPhanQuyen(
      id_chucnang,
      duongDan,
      batBuocTaiLai
    );

    const vaiTroId = clean(
      row?.vai_tro_id ??
      row?.id_vaitro ??
      row?.id_vai_tro
    );

    return {
      tim_thay: Boolean(row),

      ma_nv:
        clean(row?.ma_nv) || null,

      vai_tro_id:
        vaiTroId || null,

      id_vaitro:
        vaiTroId || null,

      duong_dan:
        normalizePage(duongDan),

      id_chucnang:
        clean(row?.id_chucnang) ||
        normalizeFunctionId(id_chucnang),

      ten_chucnang:
        clean(row?.ten_chucnang) || null,

      duoc_xem:
        toBool(row?.duoc_xem),

      duoc_them:
        toBool(row?.duoc_them),

      duoc_sua:
        toBool(row?.duoc_sua),

      duoc_xoa:
        toBool(row?.duoc_xoa),

      du_lieu_sql: row
    };
  } catch (error) {
    return {
      tim_thay: false,
      ma_nv: null,
      vai_tro_id: null,
      id_vaitro: null,
      duong_dan:
        normalizePage(duongDan),
      id_chucnang:
        normalizeFunctionId(id_chucnang),
      ten_chucnang: null,
      duoc_xem: false,
      duoc_them: false,
      duoc_sua: false,
      duoc_xoa: false,
      error
    };
  }
}

/* =========================================================
   ÁP DỤNG QUYỀN CHO MỘT PHẦN TỬ HTML
========================================================= */

export async function apDungQuyenDuocXem(
  elementHoacSelector,
  id_chucnang,
  duongDan = layTenFileHienTai()
) {
  const element =
    typeof elementHoacSelector === 'string'
      ? document.querySelector(elementHoacSelector)
      : elementHoacSelector;

  if (!element) {
    console.warn(
      '[PHÂN QUYỀN] Không tìm thấy phần tử:',
      elementHoacSelector
    );

    return false;
  }

  element.style.display = 'none';
  element.classList.add('hidden');

  const allowed = await quyen_duocxem(
    id_chucnang,
    duongDan
  );

  element.dataset.duocXem =
    String(allowed);

  element.style.display =
    allowed ? '' : 'none';

  element.classList.toggle(
    'hidden',
    !allowed
  );

  return allowed;
}

/* =========================================================
   TỰ ĐỘNG ÁP DỤNG CHO data-phan-quyen
========================================================= */

export async function apDungPhanQuyenTrang(
  root = document,
  duongDan = layTenFileHienTai()
) {
  const elements = [
    ...root.querySelectorAll(
      '[data-phan-quyen]'
    )
  ];

  for (const element of elements) {
    element.style.display = 'none';
    element.classList.add('hidden');
  }

  const results = [];

  for (const element of elements) {
    const idChucNang = normalizeFunctionId(
      element.dataset.idChucnang ||
      element.getAttribute('data-id-chucnang') ||
      element.id
    );

    if (!idChucNang) {
      console.warn(
        '[PHÂN QUYỀN] Phần tử không có id_chucnang',
        element
      );

      continue;
    }

    const allowed =
      await apDungQuyenDuocXem(
        element,
        idChucNang,
        duongDan
      );

    results.push({
      element,
      id_chucnang: idChucNang,
      duoc_xem: allowed
    });
  }

  if (document.body) {
    document.body.style.visibility =
      'visible';

    document.body.classList.add('ready');
  }

  return results;
}

/* =========================================================
   BẢO VỆ TRANG
========================================================= */

export async function baoVeTrang(
  id_chucnang,
  trangChuyenVe = './main.html',
  duongDan = layTenFileHienTai()
) {
  const allowed = await quyen_duocxem(
    id_chucnang,
    duongDan
  );

  if (allowed) {
    return true;
  }

  alert(
    'Bạn không có quyền truy cập chức năng này.'
  );

  window.location.replace(
    trangChuyenVe
  );

  return false;
}

/* =========================================================
   XÓA CACHE
========================================================= */

export function xoaCachePhanQuyen() {
  supabaseClientCache = null;
  permissionCache.clear();
}

/* =========================================================
   DEBUG THỦ CÔNG TỪ CONSOLE
========================================================= */

window.testQuyenDuocXem = async function (
  id_chucnang,
  duongDan
) {
  return quyen_duocxem(
    id_chucnang,
    duongDan || layTenFileHienTai(),
    {
      thongBao: true,
      batBuocTaiLai: true
    }
  );
};

console.log(
  '[PHÂN QUYỀN] Đã tải thành công js/phan_quyen.js'
);
