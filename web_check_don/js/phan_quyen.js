// ==================== js/phan_quyen.js ====================

const EMPLOYEE_TABLE = 'kv_nhan_vien';
const PERMISSION_VIEW = 'sql_phan_quyen_nhan_vien';

const LOGIN_STORAGE_KEYS = [
  'nv',
  'chatwoot_crm_user'
];

let supabaseClientCache = null;
let employeeCache = null;

const permissionCache = new Map();

/* =========================================================
   HÀM CƠ BẢN
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
      'Không tải được thư viện Supabase'
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

  const response = await fetch('/api/getConfig', {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Không tải được cấu hình Supabase: HTTP ${response.status} - ${text}`
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

  supabaseClientCache =
    window.supabase.createClient(
      supabaseUrl,
      supabaseKey
    );

  debugLog(
    '[PHÂN QUYỀN] Đã tạo Supabase client'
  );

  return supabaseClientCache;
}

/* =========================================================
   LẤY ma_nv + vai_tro_id TỪ kv_nhan_vien
========================================================= */

export async function layNhanVienVaVaiTro(
  batBuocTaiLai = false
) {
  if (
    employeeCache &&
    !batBuocTaiLai
  ) {
    return employeeCache;
  }

  const maNvDangNhap =
    layMaNhanVienDangNhap();

  if (!maNvDangNhap) {
    throw new Error(
      'Không lấy được ma_nv từ tài khoản đăng nhập'
    );
  }

  const client =
    await taoSupabaseClient();

  const { data, error } = await client
    .from(EMPLOYEE_TABLE)
    .select(`
      ma_nv,
      ten_nv,
      vai_tro_id,
      hoat_dong
    `)
    .eq('ma_nv', maNvDangNhap)
    .limit(1);

  if (error) {
    throw error;
  }

  const employee =
    Array.isArray(data) && data.length
      ? data[0]
      : null;

  if (!employee) {
    throw new Error(
      `Không tìm thấy nhân viên ${maNvDangNhap} trong ${EMPLOYEE_TABLE}`
    );
  }

  const maNv =
    clean(employee.ma_nv);

  const vaiTroId =
    clean(
      employee.vai_tro_id ??
      employee.id_vaitro ??
      employee.id_vai_tro
    );

  if (!maNv) {
    throw new Error(
      'Bản ghi kv_nhan_vien không có ma_nv'
    );
  }

  if (!vaiTroId) {
    throw new Error(
      `Nhân viên ${maNv} chưa có vai_tro_id`
    );
  }

  if (
    employee.hoat_dong !== undefined &&
    employee.hoat_dong !== null &&
    !toBool(employee.hoat_dong)
  ) {
    throw new Error(
      `Tài khoản ${maNv} đã bị dừng hoạt động`
    );
  }

  employeeCache = {
    ma_nv: maNv,
    ten_nv:
      clean(employee.ten_nv) ||
      maNv,
    vai_tro_id: vaiTroId,
    id_vaitro: vaiTroId,
    hoat_dong: employee.hoat_dong,
    employee
  };

  debugLog(
    '[PHÂN QUYỀN] Nhân viên và vai trò',
    employeeCache
  );

  return employeeCache;
}

/* =========================================================
   HÀM DUY NHẤT KIỂM TRA QUYỀN ĐƯỢC XEM
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

  const page =
    normalizePage(duongDan);

  const functionId =
    normalizeFunctionId(id_chucnang);

  try {
    if (!functionId) {
      throw new Error(
        'Thiếu id_chucnang'
      );
    }

    /*
     * Bước 1:
     * Lấy ma_nv và vai_tro_id từ kv_nhan_vien.
     */
    const nhanVien =
      await layNhanVienVaVaiTro(
        batBuocTaiLai
      );

    const maNv =
      clean(nhanVien.ma_nv);

    const vaiTroId =
      clean(nhanVien.vai_tro_id);

    const cacheKey = [
      maNv,
      vaiTroId,
      page,
      functionId
    ].join('|');

    if (
      !batBuocTaiLai &&
      permissionCache.has(cacheKey)
    ) {
      const cached =
        permissionCache.get(cacheKey);

      if (thongBao) {
        hienThongBaoPhanQuyen(cached);
      }

      return cached.duoc_xem;
    }

    /*
     * Bước 2:
     * Lọc view theo đúng 4 điều kiện.
     */
    const client =
      await taoSupabaseClient();

    const { data, error } = await client
      .from(PERMISSION_VIEW)
      .select(`
        ma_nv,
        ten_nv,
        vai_tro_id,
        ten_vai_tro,
        duong_dan,
        id_chucnang,
        ten_chucnang,
        duoc_xem,
        duoc_them,
        duoc_sua,
        duoc_xoa
      `)
      .eq('ma_nv', maNv)
      .eq('vai_tro_id', vaiTroId)
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

    const result = {
      ma_nv: maNv,
      vai_tro_id: vaiTroId,
      id_vaitro: vaiTroId,
      duong_dan: page,
      id_chucnang: functionId,

      tim_thay: Boolean(row),

      duoc_xem:
        toBool(row?.duoc_xem),

      duoc_them:
        toBool(row?.duoc_them),

      duoc_sua:
        toBool(row?.duoc_sua),

      duoc_xoa:
        toBool(row?.duoc_xoa),

      ten_nv:
        clean(row?.ten_nv) ||
        nhanVien.ten_nv ||
        null,

      ten_vai_tro:
        clean(row?.ten_vai_tro) ||
        null,

      ten_chucnang:
        clean(row?.ten_chucnang) ||
        null,

      du_lieu_sql: row
    };

    permissionCache.set(
      cacheKey,
      result
    );

    console.log(
      '[KẾT QUẢ PHÂN QUYỀN]',
      result
    );

    if (thongBao) {
      hienThongBaoPhanQuyen(result);
    }

    return result.duoc_xem;
  } catch (error) {
    const result = {
      ma_nv:
        layMaNhanVienDangNhap() ||
        null,

      vai_tro_id:
        employeeCache?.vai_tro_id ||
        null,

      id_vaitro:
        employeeCache?.vai_tro_id ||
        null,

      duong_dan: page,
      id_chucnang: functionId,

      tim_thay: false,
      duoc_xem: false,
      duoc_them: false,
      duoc_sua: false,
      duoc_xoa: false,

      error
    };

    console.error(
      '[PHÂN QUYỀN] Lỗi kiểm tra quyền',
      {
        ...result,
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
          `ma_nv: ${
            result.ma_nv ||
            'KHÔNG CÓ'
          }`,
          `vai_tro_id: ${
            result.vai_tro_id ||
            'KHÔNG CÓ'
          }`,
          `id_chucnang: ${
            functionId ||
            'KHÔNG CÓ'
          }`,
          `duong_dan: ${page}`,
          '',
          `message: ${
            error?.message ||
            String(error)
          }`,
          `code: ${
            error?.code ||
            'KHÔNG CÓ'
          }`
        ].join('\n')
      );
    }

    return false;
  }
}

/* =========================================================
   HIỆN THÔNG BÁO DEBUG
========================================================= */

function hienThongBaoPhanQuyen(result) {
  alert(
    [
      'KẾT QUẢ PHÂN QUYỀN',
      '',
      `ma_nv: ${
        result.ma_nv ||
        'KHÔNG CÓ'
      }`,
      `vai_tro_id: ${
        result.vai_tro_id ||
        'KHÔNG CÓ'
      }`,
      `id_chucnang: ${
        result.id_chucnang ||
        'KHÔNG CÓ'
      }`,
      `duong_dan: ${
        result.duong_dan ||
        'KHÔNG CÓ'
      }`,
      `tìm thấy quyền: ${
        result.tim_thay
      }`,
      `duoc_xem: ${
        result.duoc_xem
      }`
    ].join('\n')
  );
}

/* =========================================================
   LẤY CHI TIẾT QUYỀN
========================================================= */

export async function layChiTietQuyen(
  id_chucnang,
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const page =
    normalizePage(duongDan);

  const functionId =
    normalizeFunctionId(id_chucnang);

  try {
    const nhanVien =
      await layNhanVienVaVaiTro(
        batBuocTaiLai
      );

    const maNv =
      clean(nhanVien.ma_nv);

    const vaiTroId =
      clean(nhanVien.vai_tro_id);

    const cacheKey = [
      maNv,
      vaiTroId,
      page,
      functionId
    ].join('|');

    if (
      !batBuocTaiLai &&
      permissionCache.has(cacheKey)
    ) {
      return permissionCache.get(
        cacheKey
      );
    }

    await quyen_duocxem(
      functionId,
      page,
      {
        thongBao: false,
        batBuocTaiLai
      }
    );

    return (
      permissionCache.get(cacheKey) || {
        ma_nv: maNv,
        vai_tro_id: vaiTroId,
        id_vaitro: vaiTroId,
        duong_dan: page,
        id_chucnang: functionId,
        tim_thay: false,
        duoc_xem: false,
        duoc_them: false,
        duoc_sua: false,
        duoc_xoa: false
      }
    );
  } catch (error) {
    return {
      ma_nv:
        layMaNhanVienDangNhap() ||
        null,

      vai_tro_id:
        employeeCache?.vai_tro_id ||
        null,

      id_vaitro:
        employeeCache?.vai_tro_id ||
        null,

      duong_dan: page,
      id_chucnang: functionId,

      tim_thay: false,
      duoc_xem: false,
      duoc_them: false,
      duoc_sua: false,
      duoc_xoa: false,

      error
    };
  }
}

/* =========================================================
   ÁP DỤNG QUYỀN CHO MỘT NÚT
========================================================= */

export async function apDungQuyenNut(
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

  /*
   * Mặc định ẩn trước khi lấy quyền.
   */
  element.style.display = 'none';
  element.classList.add('hidden');

  const allowed =
    await quyen_duocxem(
      id_chucnang,
      duongDan
    );

  element.dataset.duocXem =
    String(allowed);

  if (allowed) {
    element.classList.remove('hidden');
    element.style.display = '';
  } else {
    element.classList.add('hidden');
    element.style.display = 'none';
  }

  return allowed;
}

/* =========================================================
   ÁP DỤNG TẤT CẢ NÚT data-phan-quyen
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

  /*
   * Ẩn toàn bộ trước.
   */
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
        '[PHÂN QUYỀN] Phần tử thiếu id_chucnang',
        element
      );

      results.push({
        element,
        id_chucnang: '',
        duoc_xem: false
      });

      continue;
    }

    const allowed =
      await apDungQuyenNut(
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

    document.body.classList.add(
      'ready'
    );
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
  employeeCache = null;
  permissionCache.clear();
}

/* =========================================================
   TEST TRỰC TIẾP TRONG CONSOLE
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
      '[CHI TIẾT QUYỀN]',
      result
    );

    return result;
  };

console.log(
  '[PHÂN QUYỀN] Đã tải js/phan_quyen.js'
);
