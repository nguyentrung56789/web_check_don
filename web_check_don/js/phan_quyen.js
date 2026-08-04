// ==================== js/phanquyen.js ====================

const EMPLOYEE_TABLE = 'kv_nhan_vien';
const PERMISSION_VIEW = 'sql_phan_quyen_nhan_vien';

/*
 * Hỗ trợ cả key đang dùng và key cũ.
 */
const LOGIN_STORAGE_KEYS = [
  'nv',
  'chatwoot_crm_user'
];

let supabaseClientCache = null;
let employeeContextCache = null;
const pagePermissionCache = new Map();


/* =========================================================
   HÀM CHUNG
========================================================= */

function chuyenBoolean(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function chuanHoaChuoi(value) {
  return String(value ?? '').trim();
}

function chuanHoaIdChucNang(value) {
  return chuanHoaChuoi(value).toLowerCase();
}

function chuanHoaDuongDan(value) {
  let path = chuanHoaChuoi(value)
    .replace(/\\/g, '/')
    .split('?')[0]
    .split('#')[0];

  path = path.split('/').pop() || 'main.html';

  return path.toLowerCase();
}

export function layTenFileHienTai() {
  return chuanHoaDuongDan(
    window.location.pathname
  );
}


/* =========================================================
   ĐỌC NHÂN VIÊN ĐĂNG NHẬP
========================================================= */

export function layNhanVienDangNhap() {
  for (const storageKey of LOGIN_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(storageKey);

      if (!raw) continue;

      const data = JSON.parse(raw);

      if (data && typeof data === 'object') {
        return {
          ...data,
          __storageKey: storageKey
        };
      }
    } catch (error) {
      console.warn(
        `[PHÂN QUYỀN] Không đọc được localStorage "${storageKey}":`,
        error
      );
    }
  }

  return null;
}

function layMaNhanVien(data) {
  return chuanHoaChuoi(
    data?.ma_nv ||
    data?.id_nv ||
    data?.maNhanVien ||
    ''
  );
}

function layTenNhanVien(data) {
  return chuanHoaChuoi(
    data?.ten_nv ||
    data?.tenNhanVien ||
    data?.name ||
    ''
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
    const responseText = await response.text();

    throw new Error(
      `Không tải được cấu hình: HTTP ${response.status} - ${responseText}`
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
      'Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY'
    );
  }

  supabaseClientCache =
    window.supabase.createClient(
      supabaseUrl,
      supabaseKey
    );

  return supabaseClientCache;
}


/* =========================================================
   LẤY MA_NV VÀ VAI_TRO_ID TỪ KV_NHAN_VIEN
========================================================= */

export async function layThongTinNhanVienVaVaiTro(
  batBuocTaiLai = false
) {
  if (
    employeeContextCache &&
    !batBuocTaiLai
  ) {
    return employeeContextCache;
  }

  const loginUser = layNhanVienDangNhap();

  if (!loginUser) {
    throw new Error(
      'Không tìm thấy dữ liệu nhân viên đăng nhập'
    );
  }

  const maNv = layMaNhanVien(loginUser);
  const tenNv = layTenNhanVien(loginUser);

  if (!maNv && !tenNv) {
    throw new Error(
      'Dữ liệu đăng nhập không có ma_nv hoặc ten_nv'
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

  const {
    data,
    error
  } = await query;

  if (error) {
    console.error(
      '[PHÂN QUYỀN] Lỗi lấy nhân viên:',
      error
    );

    throw error;
  }

  const nhanVien = Array.isArray(data)
    ? data[0]
    : null;

  if (!nhanVien) {
    throw new Error(
      `Không tìm thấy nhân viên trong ${EMPLOYEE_TABLE}`
    );
  }

  const employeeCode =
    chuanHoaChuoi(nhanVien.ma_nv);

  const roleId =
    chuanHoaChuoi(nhanVien.vai_tro_id);

  if (!employeeCode) {
    throw new Error(
      'Bản ghi kv_nhan_vien không có ma_nv'
    );
  }

  if (!roleId) {
    throw new Error(
      'Nhân viên chưa được gán vai_tro_id'
    );
  }

  if (
    nhanVien.hoat_dong !== undefined &&
    nhanVien.hoat_dong !== null &&
    !chuyenBoolean(nhanVien.hoat_dong)
  ) {
    throw new Error(
      'Tài khoản nhân viên đã bị dừng hoạt động'
    );
  }

  employeeContextCache = {
    ma_nv: employeeCode,
    ten_nv:
      chuanHoaChuoi(nhanVien.ten_nv) ||
      tenNv ||
      employeeCode,
    vai_tro_id: roleId,
    hoat_dong: nhanVien.hoat_dong,
    loginUser,
    nhanVien
  };

  console.log(
    '[PHÂN QUYỀN] Nhân viên và vai trò:',
    employeeContextCache
  );

  return employeeContextCache;
}


/* =========================================================
   LẤY TOÀN BỘ QUYỀN CỦA MỘT TRANG

   Lọc theo:
   - ma_nv
   - vai_tro_id
   - duong_dan
========================================================= */

export async function layDanhSachQuyenTrang(
  duongDan = layTenFileHienTai(),
  batBuocTaiLai = false
) {
  const tenTrang =
    chuanHoaDuongDan(duongDan);

  if (
    pagePermissionCache.has(tenTrang) &&
    !batBuocTaiLai
  ) {
    return pagePermissionCache.get(
      tenTrang
    );
  }

  const {
    ma_nv,
    vai_tro_id
  } = await layThongTinNhanVienVaVaiTro(
    batBuocTaiLai
  );

  const client = await taoSupabaseClient();

  const {
    data,
    error
  } = await client
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
    .eq('duong_dan', tenTrang);

  if (error) {
    console.error(
      '[PHÂN QUYỀN] Lỗi lấy danh sách quyền:',
      {
        ma_nv,
        vai_tro_id,
        duong_dan: tenTrang,
        error
      }
    );

    throw error;
  }

  const danhSachQuyen =
    Array.isArray(data) ? data : [];

  pagePermissionCache.set(
    tenTrang,
    danhSachQuyen
  );

  console.log(
    '[PHÂN QUYỀN] Danh sách quyền trang:',
    {
      ma_nv,
      vai_tro_id,
      duong_dan: tenTrang,
      so_quyen: danhSachQuyen.length,
      danh_sach: danhSachQuyen
    }
  );

  return danhSachQuyen;
}


/* =========================================================
   HÀM QUYENCHUCNANG()

   Trả về Promise<boolean>.

   Ví dụ:
   await quyenChucNang('main.html', 'kho')
========================================================= */

export async function quyenChucNang(
  duongDan,
  idChucNang,
  loaiQuyen = 'duoc_xem'
) {
  const tenTrang =
    chuanHoaDuongDan(
      duongDan || layTenFileHienTai()
    );

  const functionId =
    chuanHoaIdChucNang(idChucNang);

  if (!functionId) {
    return false;
  }

  const cacLoaiQuyenHopLe = [
    'duoc_xem',
    'duoc_them',
    'duoc_sua',
    'duoc_xoa'
  ];

  if (
    !cacLoaiQuyenHopLe.includes(loaiQuyen)
  ) {
    throw new Error(
      `Loại quyền không hợp lệ: ${loaiQuyen}`
    );
  }

  const danhSachQuyen =
    await layDanhSachQuyenTrang(
      tenTrang
    );

  /*
   * Dùng some() để tránh trường hợp có nhiều dòng
   * cùng id_chucnang và dòng FALSE ghi đè dòng TRUE.
   */
  return danhSachQuyen.some(quyen => {
    const permissionFunctionId =
      chuanHoaIdChucNang(
        quyen?.id_chucnang
      );

    return (
      permissionFunctionId === functionId &&
      chuyenBoolean(quyen?.[loaiQuyen])
    );
  });
}


/* =========================================================
   KIỂM TRA QUYỀN TỪ DANH SÁCH ĐÃ TẢI
========================================================= */

export function coQuyen(
  danhSachQuyen,
  idChucNang,
  loaiQuyen = 'duoc_xem'
) {
  const functionId =
    chuanHoaIdChucNang(idChucNang);

  return (danhSachQuyen || []).some(
    quyen =>
      chuanHoaIdChucNang(
        quyen?.id_chucnang
      ) === functionId &&
      chuyenBoolean(
        quyen?.[loaiQuyen]
      )
  );
}


/* =========================================================
   ẨN TOÀN BỘ PHẦN TỬ PHÂN QUYỀN
========================================================= */

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


/* =========================================================
   ÁP DỤNG QUYỀN CHO TẤT CẢ PHẦN TỬ TRONG TRANG

   Phần tử HTML:
   <button
     id="kho"
     class="hidden"
     data-phan-quyen
   >
     Kho
   </button>

   id="kho" phải trùng:
   id_chucnang = kho
========================================================= */

export async function apDungPhanQuyenTrang(
  duongDan = layTenFileHienTai(),
  root = document
) {
  const tenTrang =
    chuanHoaDuongDan(duongDan);

  anTatCaPhanTuPhanQuyen(root);

  const danhSachQuyen =
    await layDanhSachQuyenTrang(
      tenTrang
    );

  const elements = [
    ...root.querySelectorAll(
      '[data-phan-quyen]'
    )
  ];

  let soPhanTuDuocHien = 0;

  for (const element of elements) {
    const idChucNang =
      chuanHoaIdChucNang(element.id);

    if (!idChucNang) {
      console.warn(
        '[PHÂN QUYỀN] Phần tử data-phan-quyen không có id:',
        element
      );

      continue;
    }

    const quyen = danhSachQuyen.find(item =>
      chuanHoaIdChucNang(
        item?.id_chucnang
      ) === idChucNang
    );

    /*
     * Chỉ cần có một dòng TRUE là được xem.
     */
    const duocXem = danhSachQuyen.some(item =>
      chuanHoaIdChucNang(
        item?.id_chucnang
      ) === idChucNang &&
      chuyenBoolean(item?.duoc_xem)
    );

    const duocThem = danhSachQuyen.some(item =>
      chuanHoaIdChucNang(
        item?.id_chucnang
      ) === idChucNang &&
      chuyenBoolean(item?.duoc_them)
    );

    const duocSua = danhSachQuyen.some(item =>
      chuanHoaIdChucNang(
        item?.id_chucnang
      ) === idChucNang &&
      chuyenBoolean(item?.duoc_sua)
    );

    const duocXoa = danhSachQuyen.some(item =>
      chuanHoaIdChucNang(
        item?.id_chucnang
      ) === idChucNang &&
      chuyenBoolean(item?.duoc_xoa)
    );

    element.classList.toggle(
      'hidden',
      !duocXem
    );

    element.style.display =
      duocXem ? '' : 'none';

    element.dataset.duocXem =
      String(duocXem);

    element.dataset.duocThem =
      String(duocThem);

    element.dataset.duocSua =
      String(duocSua);

    element.dataset.duocXoa =
      String(duocXoa);

    if (duocXem) {
      soPhanTuDuocHien++;
    }

    console.log(
      '[PHÂN QUYỀN] Phần tử:',
      {
        id_chucnang: idChucNang,
        duoc_xem: duocXem,
        duoc_them: duocThem,
        duoc_sua: duocSua,
        duoc_xoa: duocXoa,
        du_lieu: quyen || null
      }
    );
  }

  return {
    tenTrang,
    danhSachQuyen,
    soPhanTu: elements.length,
    soPhanTuDuocHien
  };
}


/* =========================================================
   HÀM KHỞI TẠO DÙNG CHO MỌI TRANG
========================================================= */

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

    const nhanVien =
      await layThongTinNhanVienVaVaiTro(
        batBuocTaiLai
      );

    const ketQua =
      await apDungPhanQuyenTrang(
        duongDan,
        root
      );

    return {
      ...ketQua,
      nhanVien
    };
  } catch (error) {
    console.error(
      '[PHÂN QUYỀN] Lỗi:',
      error
    );

    return {
      error,
      tenTrang:
        chuanHoaDuongDan(duongDan),
      nhanVien: null,
      danhSachQuyen: [],
      soPhanTu: 0,
      soPhanTuDuocHien: 0
    };
  } finally {
    if (hienThiBody && document.body) {
      document.body.style.visibility =
        'visible';

      document.body.classList.add(
        'ready'
      );
    }
  }
}


/* =========================================================
   CHẶN TRUY CẬP TRANG

   Dùng khi cả trang phải có quyền.

   Ví dụ trong kho.html:
   await baoVeTrang('kho', './main.html');
========================================================= */

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

  console.warn(
    '[PHÂN QUYỀN] Không có quyền truy cập:',
    {
      duong_dan: duongDan,
      id_chucnang: idChucNang
    }
  );

  window.location.replace(
    trangChuyenVe
  );

  return false;
}


/* =========================================================
   XÓA CACHE KHI THAY ĐỔI QUYỀN
========================================================= */

export function xoaCachePhanQuyen() {
  employeeContextCache = null;
  pagePermissionCache.clear();
}
