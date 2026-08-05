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
   LẤY TÊN FILE HIỆN TẠI
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

      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data)
      ) {
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

export function layMaNhanVienDangNhap() {
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

  debugLog(
    '[PHÂN QUYỀN] Tạo Supabase client thành công'
  );

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
  const functionId =
    normalizeFunctionId(id_chucnang);

  if (!maNv) {
    throw new Error(
      'Không lấy được ma_nv từ tài khoản đang đăng nhập'
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

  const dieuKien = {
    ma_nv: maNv,
    duong_dan: page,
    id_chucnang: functionId
  };

  debugLog(
    '[PHÂN QUYỀN] Điều kiện truy vấn',
    dieuKien
  );

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
    Array.isArray(data) && data.length > 0
      ? data[0]
      : null;

  const result = {
    ma_nv_dang_nhap: maNv,
    duong_dan_kiem_tra: page,
    id_chucnang_kiem_tra: functionId,
    tim_thay: Boolean(row),
    row
  };

  permissionCache.set(cacheKey, result);

  debugLog(
    '[PHÂN QUYỀN] Kết quả truy vấn',
    result
  );

  return result;
}

/* =========================================================
   LẤY CHI TIẾT QUYỀN
========================================================= */

export async function layChiTietQuyen(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const maNvDangNhap =
    layMaNhanVienDangNhap();

  const page = normalizePage(duongDan);

  const functionId =
    normalizeFunctionId(id_chucnang);

  try {
    const queryResult =
      await layDongPhanQuyen(
        functionId,
        page,
        batBuocTaiLai
      );

    const row = queryResult?.row || null;

    const vaiTroId = clean(
      row?.vai_tro_id ??
      row?.id_vaitro ??
      row?.id_vai_tro
    );

    return {
      tim_thay: Boolean(row),

      // Luôn trả ma_nv đăng nhập,
      // kể cả khi chưa tìm thấy quyền.
      ma_nv:
        clean(row?.ma_nv) ||
        maNvDangNhap ||
        null,

      vai_tro_id:
        vaiTroId || null,

      // Tạo thêm tên thay thế để dễ dùng.
      id_vaitro:
        vaiTroId || null,

      ten_nv:
        clean(row?.ten_nv) || null,

      ten_vai_tro:
        clean(row?.ten_vai_tro) || null,

      duong_dan:
        page,

      id_chucnang:
        clean(row?.id_chucnang) ||
        functionId,

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

      du_lieu_sql:
        row
    };
  } catch (error) {
    console.error(
      '[PHÂN QUYỀN] Lỗi lấy chi tiết:',
      error
    );

    return {
      tim_thay: false,

      ma_nv:
        maNvDangNhap || null,

      vai_tro_id: null,
      id_vaitro: null,
      ten_nv: null,
      ten_vai_tro: null,

      duong_dan:
        page,

      id_chucnang:
        functionId,

      ten_chucnang: null,

      duoc_xem: false,
      duoc_them: false,
      duoc_sua: false,
      duoc_xoa: false,

      du_lieu_sql: null,
      error
    };
  }
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
    const chiTiet =
      await layChiTietQuyen(
        id_chucnang,
        duongDan,
        batBuocTaiLai
      );

    console.group(
      '========== KẾT QUẢ PHÂN QUYỀN =========='
    );

    console.log(
      'ma_nv đăng nhập:',
      chiTiet.ma_nv
    );

    console.log(
      'vai_tro_id:',
      chiTiet.vai_tro_id
    );

    console.log(
      'id_chucnang:',
      chiTiet.id_chucnang
    );

    console.log(
      'duong_dan:',
      chiTiet.duong_dan
    );

    console.log(
      'tìm thấy quyền:',
      chiTiet.tim_thay
    );

    console.log(
      'duoc_xem:',
      chiTiet.duoc_xem
    );

    console.log(
      'dữ liệu SQL:',
      chiTiet.du_lieu_sql
    );

    console.groupEnd();

    if (thongBao) {
      alert(
        [
          'KẾT QUẢ PHÂN QUYỀN',
          '',
          `ma_nv đăng nhập: ${
            chiTiet.ma_nv || 'KHÔNG CÓ'
          }`,
          `vai_tro_id: ${
            chiTiet.vai_tro_id ||
            'KHÔNG CÓ'
          }`,
          `id_chucnang: ${
            chiTiet.id_chucnang ||
            'KHÔNG CÓ'
          }`,
          `duong_dan: ${
            chiTiet.duong_dan
          }`,
          `tìm thấy quyền: ${
            chiTiet.tim_thay
          }`,
          `duoc_xem: ${
            chiTiet.duoc_xem
          }`
        ].join('\n')
      );
    }

    return chiTiet.duoc_xem;
  } catch (error) {
    console.error(
      '[QUYỀN ĐƯỢC XEM] Lỗi:',
      {
        id_chucnang,
        duong_dan: duongDan,
        message:
          error?.message ||
          String(error),
        code:
          error?.code || null,
        details:
          error?.details || null,
        hint:
          error?.hint || null
      }
    );

    if (thongBao) {
      alert(
        [
          'LỖI KIỂM TRA PHÂN QUYỀN',
          '',
          `ma_nv đăng nhập: ${
            layMaNhanVienDangNhap() ||
            'KHÔNG CÓ'
          }`,
          `id_chucnang: ${
            id_chucnang ||
            'KHÔNG CÓ'
          }`,
          `duong_dan: ${
            normalizePage(duongDan)
          }`,
          `message: ${
            error?.message ||
            String(error)
          }`,
          `code: ${
            error?.code ||
            'KHÔNG CÓ'
          }`,
          `details: ${
            error?.details ||
            'KHÔNG CÓ'
          }`,
          `hint: ${
            error?.hint ||
            'KHÔNG CÓ'
          }`
        ].join('\n')
      );
    }

    return false;
  }
}

/* =========================================================
   QUYỀN ĐƯỢC THÊM
========================================================= */

export async function quyen_duocthem(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const chiTiet =
    await layChiTietQuyen(
      id_chucnang,
      duongDan,
      batBuocTaiLai
    );

  return chiTiet.duoc_them;
}

/* =========================================================
   QUYỀN ĐƯỢC SỬA
========================================================= */

export async function quyen_duocsua(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const chiTiet =
    await layChiTietQuyen(
      id_chucnang,
      duongDan,
      batBuocTaiLai
    );

  return chiTiet.duoc_sua;
}

/* =========================================================
   QUYỀN ĐƯỢC XÓA
========================================================= */

export async function quyen_duocxoa(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const chiTiet =
    await layChiTietQuyen(
      id_chucnang,
      duongDan,
      batBuocTaiLai
    );

  return chiTiet.duoc_xoa;
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
      ? document.querySelector(
          elementHoacSelector
        )
      : elementHoacSelector;

  if (!element) {
    console.warn(
      '[PHÂN QUYỀN] Không tìm thấy phần tử:',
      elementHoacSelector
    );

    return false;
  }

  // Mặc định ẩn trước khi kiểm tra.
  element.style.display = 'none';
  element.classList.add('hidden');

  const allowed =
    await quyen_duocxem(
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
   TỰ ĐỘNG ÁP DỤNG CHO CÁC PHẦN TỬ data-phan-quyen
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

  // Ẩn toàn bộ trước.
  for (const element of elements) {
    element.style.display = 'none';
    element.classList.add('hidden');
  }

  const results = [];

  for (const element of elements) {
    const idChucNang =
      normalizeFunctionId(
        element.dataset.idChucnang ||
        element.getAttribute(
          'data-id-chucnang'
        ) ||
        element.id
      );

    if (!idChucNang) {
      console.warn(
        '[PHÂN QUYỀN] Phần tử không có id_chucnang',
        element
      );

      results.push({
        element,
        id_chucnang: '',
        duoc_xem: false,
        error:
          'Phần tử không có id hoặc data-id-chucnang'
      });

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
  const allowed =
    await quyen_duocxem(
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

window.testQuyenDuocXem =
  async function (
    id_chucnang,
    duongDan = layTenFileHienTai()
  ) {
    return quyen_duocxem(
      id_chucnang,
      duongDan,
      {
        thongBao: true,
        batBuocTaiLai: true
      }
    );
  };

window.testChiTietQuyen =
  async function (
    id_chucnang,
    duongDan = layTenFileHienTai()
  ) {
    const result =
      await layChiTietQuyen(
        id_chucnang,
        duongDan,
        true
      );

    console.log(
      '[TEST CHI TIẾT QUYỀN]',
      result
    );

    return result;
  };

console.log(
  '[PHÂN QUYỀN] Đã tải thành công js/phan_quyen.js'
);
