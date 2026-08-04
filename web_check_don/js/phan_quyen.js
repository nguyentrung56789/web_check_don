// ==================== js/phanquyen.js ====================

const EMPLOYEE_TABLE = 'kv_nhan_vien';
const PERMISSION_VIEW = 'sql_phan_quyen_nhan_vien';

const LOGIN_STORAGE_KEYS = [
  'nv',
  'chatwoot_crm_user'
];

let supabaseClientCache = null;
let employeeContextCache = null;
const pagePermissionCache = new Map();

function logDebug(message, data) {
  console.log(message, data ?? '');

  if (typeof window.debugLog === 'function') {
    window.debugLog(message, data);
  }
}

function toBool(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    String(value ?? '').trim().toLowerCase() === 'true'
  );
}

function clean(value) {
  return String(value ?? '').trim();
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

export function layTenFileHienTai() {
  return normalizePage(window.location.pathname);
}

export function layNhanVienDangNhap() {
  for (const key of LOGIN_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) continue;

      const data = JSON.parse(raw);

      if (data && typeof data === 'object') {
        return {
          ...data,
          __storageKey: key
        };
      }
    } catch (error) {
      logDebug(`[PHÂN QUYỀN] Không đọc được localStorage "${key}"`, {
        message: error?.message || String(error)
      });
    }
  }

  return null;
}

function getEmployeeCode(user) {
  return clean(
    user?.ma_nv ||
    user?.id_nv ||
    user?.maNhanVien ||
    ''
  );
}

function getEmployeeName(user) {
  return clean(
    user?.ten_nv ||
    user?.tenNhanVien ||
    user?.name ||
    ''
  );
}

export async function taoSupabaseClient() {
  if (supabaseClientCache) {
    return supabaseClientCache;
  }

  if (!window.supabase) {
    throw new Error('Không tải được thư viện Supabase');
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

  logDebug('[PHÂN QUYỀN] Đang gọi /api/getConfig');

  const response = await fetch('/api/getConfig', {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Không tải được cấu hình: HTTP ${response.status} - ${text}`
    );
  }

  const config = await response.json();

  const url =
    config.url ||
    config.SUPABASE_URL ||
    config.supabaseUrl ||
    config.supabase_url;

  const key =
    config.anon ||
    config.key ||
    config.SUPABASE_ANON ||
    config.SUPABASE_ANON_KEY ||
    config.supabaseAnon ||
    config.supabaseKey ||
    config.supabase_anon_key;

  if (!url || !key) {
    throw new Error(
      'API getConfig không trả SUPABASE_URL hoặc SUPABASE_ANON_KEY'
    );
  }

  supabaseClientCache = window.supabase.createClient(url, key);

  logDebug('[PHÂN QUYỀN] Tạo Supabase client thành công');

  return supabaseClientCache;
}

export async function layThongTinNhanVienVaVaiTro(
  batBuocTaiLai = false
) {
  if (employeeContextCache && !batBuocTaiLai) {
    return employeeContextCache;
  }

  const loginUser = layNhanVienDangNhap();

  if (!loginUser) {
    throw new Error(
      'Không tìm thấy localStorage "nv" hoặc "chatwoot_crm_user"'
    );
  }

  const maNv = getEmployeeCode(loginUser);
  const tenNv = getEmployeeName(loginUser);

  if (!maNv && !tenNv) {
    throw new Error(
      'Dữ liệu đăng nhập không có ma_nv, id_nv hoặc ten_nv'
    );
  }

  const client = await taoSupabaseClient();

  let query = client
    .from(EMPLOYEE_TABLE)
    .select(`
      ma_nv,
      ten_nv,
      vai_tro_id,
      hoat_dong
    `)
    .limit(1);

  if (maNv) {
    query = query.eq('ma_nv', maNv);
  } else {
    query = query.eq('ten_nv', tenNv);
  }

  logDebug('[PHÂN QUYỀN] Đang tìm nhân viên trong kv_nhan_vien', {
    ma_nv: maNv || null,
    ten_nv: tenNv || null
  });

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const employee = Array.isArray(data) ? data[0] : null;

  if (!employee) {
    throw new Error(
      `Không tìm thấy nhân viên trong ${EMPLOYEE_TABLE}`
    );
  }

  const employeeCode = clean(employee.ma_nv);
  const roleId = clean(employee.vai_tro_id);

  if (!employeeCode) {
    throw new Error('Bản ghi kv_nhan_vien không có ma_nv');
  }

  if (!roleId) {
    throw new Error(
      `Nhân viên ${employeeCode} chưa được gán vai_tro_id`
    );
  }

  if (
    employee.hoat_dong !== undefined &&
    employee.hoat_dong !== null &&
    !toBool(employee.hoat_dong)
  ) {
    throw new Error(
      `Tài khoản nhân viên ${employeeCode} đã bị dừng hoạt động`
    );
  }

  employeeContextCache = {
    ma_nv: employeeCode,
    ten_nv: clean(employee.ten_nv) || tenNv || employeeCode,
    vai_tro_id: roleId,
    hoat_dong: employee.hoat_dong,
    loginUser,
    employee
  };

  logDebug('[PHÂN QUYỀN] Đã lấy được nhân viên và vai trò', {
    ma_nv: employeeContextCache.ma_nv,
    ten_nv: employeeContextCache.ten_nv,
    vai_tro_id: employeeContextCache.vai_tro_id
  });

  return employeeContextCache;
}

export async function layDanhSachQuyenTrang(
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const page = normalizePage(duongDan);

  if (
    pagePermissionCache.has(page) &&
    !batBuocTaiLai
  ) {
    return pagePermissionCache.get(page);
  }

  const {
    ma_nv,
    vai_tro_id
  } = await layThongTinNhanVienVaVaiTro(
    batBuocTaiLai
  );

  const client = await taoSupabaseClient();

  logDebug('[PHÂN QUYỀN] Đang lọc quyền trang', {
    ma_nv,
    vai_tro_id,
    duong_dan: page
  });

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
    .eq('ma_nv', ma_nv)
    .eq('vai_tro_id', vai_tro_id)
    .eq('duong_dan', page);

  if (error) {
    throw error;
  }

  const permissions = Array.isArray(data) ? data : [];

  pagePermissionCache.set(page, permissions);

  logDebug('[PHÂN QUYỀN] Danh sách quyền nhận được', {
    so_dong: permissions.length,
    danh_sach: permissions
  });

  return permissions;
}

export async function quyenChucNang(
  duongDan,
  idChucNang,
  loaiQuyen = 'duoc_xem'
) {
  const validTypes = [
    'duoc_xem',
    'duoc_them',
    'duoc_sua',
    'duoc_xoa'
  ];

  if (!validTypes.includes(loaiQuyen)) {
    throw new Error(
      `Loại quyền không hợp lệ: ${loaiQuyen}`
    );
  }

  const page = normalizePage(
    duongDan || layTenFileHienTai()
  );

  const functionId = normalizeFunctionId(
    idChucNang
  );

  if (!functionId) {
    return false;
  }

  const permissions = await layDanhSachQuyenTrang(page);

  return permissions.some(item =>
    normalizeFunctionId(item?.id_chucnang) === functionId &&
    toBool(item?.[loaiQuyen])
  );
}

export function coQuyen(
  danhSachQuyen,
  idChucNang,
  loaiQuyen = 'duoc_xem'
) {
  const functionId = normalizeFunctionId(
    idChucNang
  );

  return (danhSachQuyen || []).some(item =>
    normalizeFunctionId(item?.id_chucnang) === functionId &&
    toBool(item?.[loaiQuyen])
  );
}

export function anTatCaPhanTuPhanQuyen(
  root = document
) {
  root
    .querySelectorAll('[data-phan-quyen]')
    .forEach(element => {
      element.classList.add('hidden');
      element.style.display = 'none';

      element.dataset.duocXem = 'false';
      element.dataset.duocThem = 'false';
      element.dataset.duocSua = 'false';
      element.dataset.duocXoa = 'false';
    });
}

export async function apDungPhanQuyenTrang(
  duongDan = layTenFileHienTai(),
  root = document
) {
  const page = normalizePage(duongDan);

  anTatCaPhanTuPhanQuyen(root);

  const permissions = await layDanhSachQuyenTrang(page);

  const elements = [
    ...root.querySelectorAll('[data-phan-quyen]')
  ];

  let visibleCount = 0;

  for (const element of elements) {
    const functionId = normalizeFunctionId(
      element.id
    );

    if (!functionId) {
      logDebug(
        '[PHÂN QUYỀN] Phần tử data-phan-quyen không có id',
        {
          tag: element.tagName
        }
      );

      continue;
    }

    const canView = coQuyen(
      permissions,
      functionId,
      'duoc_xem'
    );

    const canAdd = coQuyen(
      permissions,
      functionId,
      'duoc_them'
    );

    const canEdit = coQuyen(
      permissions,
      functionId,
      'duoc_sua'
    );

    const canDelete = coQuyen(
      permissions,
      functionId,
      'duoc_xoa'
    );

    element.classList.toggle('hidden', !canView);
    element.style.display = canView ? '' : 'none';

    element.dataset.duocXem = String(canView);
    element.dataset.duocThem = String(canAdd);
    element.dataset.duocSua = String(canEdit);
    element.dataset.duocXoa = String(canDelete);

    if (canView) {
      visibleCount++;
    }

    logDebug('[PHÂN QUYỀN] Kết quả phần tử', {
      id_chucnang: functionId,
      duoc_xem: canView,
      duoc_them: canAdd,
      duoc_sua: canEdit,
      duoc_xoa: canDelete
    });
  }

  return {
    tenTrang: page,
    danhSachQuyen: permissions,
    soPhanTu: elements.length,
    soPhanTuDuocHien: visibleCount
  };
}

export async function taiPhanQuyenTrang(
  options = {}
) {
  const {
    duongDan = layTenFileHienTai(),
    root = document,
    hienThiBody = true,
    batBuocTaiLai = false
  } = options;

  anTatCaPhanTuPhanQuyen(root);

  try {
    if (batBuocTaiLai) {
      employeeContextCache = null;
      pagePermissionCache.clear();
    }

    const employee =
      await layThongTinNhanVienVaVaiTro(
        batBuocTaiLai
      );

    const result =
      await apDungPhanQuyenTrang(
        duongDan,
        root
      );

    return {
      ...result,
      nhanVien: employee
    };
  } catch (error) {
    logDebug('[PHÂN QUYỀN] Lỗi', {
      message: error?.message || String(error),
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null
    });

    return {
      error,
      tenTrang: normalizePage(duongDan),
      nhanVien: null,
      danhSachQuyen: [],
      soPhanTu: root.querySelectorAll(
        '[data-phan-quyen]'
      ).length,
      soPhanTuDuocHien: 0
    };
  } finally {
    if (hienThiBody && document.body) {
      document.body.style.visibility = 'visible';
      document.body.classList.add('ready');
    }
  }
}

export async function baoVeTrang(
  idChucNang,
  trangChuyenVe = './main.html',
  duongDan = layTenFileHienTai()
) {
  const allowed = await quyenChucNang(
    duongDan,
    idChucNang,
    'duoc_xem'
  );

  if (allowed) {
    return true;
  }

  window.location.replace(trangChuyenVe);
  return false;
}

export function xoaCachePhanQuyen() {
  employeeContextCache = null;
  pagePermissionCache.clear();
}
