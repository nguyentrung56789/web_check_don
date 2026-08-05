from pathlib import Path

code = r"""// ==================== js/phan_quyen.js ====================

const LOGIN_STORAGE_KEYS = [
  'nv',
  'chatwoot_crm_user'
];

let supabaseClientCache = null;

/*
 * Cache chi tiết quyền theo:
 * duong_dan | id_chucnang
 */
const chiTietQuyenCache = new Map();

function clean(value) {
  return String(value ?? '').trim();
}

function toBool(value) {
  const text = clean(value).toLowerCase();

  return (
    value === true ||
    value === 1 ||
    text === '1' ||
    text === 'true' ||
    text === 't'
  );
}

/**
 * Tự lấy tên trang hiện tại.
 *
 * Ví dụ:
 * /main.html?token=abc
 * → main.html
 *
 * /kinh_doanh.html?token=abc
 * → kinh_doanh.html
 */
export function layTenTrangHienTai() {
  const pathname =
    window.location.pathname || '';

  const fileName = pathname
    .split('/')
    .filter(Boolean)
    .pop();

  return clean(
    fileName || 'main.html'
  ).toLowerCase();
}

function layNhanVienDangNhap() {
  for (const storageKey of LOGIN_STORAGE_KEYS) {
    try {
      const raw =
        localStorage.getItem(storageKey);

      if (!raw) {
        continue;
      }

      const data = JSON.parse(raw);

      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data)
      ) {
        return data;
      }
    } catch (error) {
      console.warn(
        `[PHÂN QUYỀN] Không đọc được ${storageKey}`,
        error
      );
    }
  }

  return null;
}

export function layMaNhanVienDangNhap() {
  const nhanVien =
    layNhanVienDangNhap();

  return clean(
    nhanVien?.ma_nv ||
    nhanVien?.id_nv ||
    nhanVien?.maNhanVien ||
    nhanVien?.ma_nhan_vien
  );
}

export async function taoSupabaseClient() {
  if (supabaseClientCache) {
    return supabaseClientCache;
  }

  if (!window.supabase) {
    throw new Error(
      'Chưa tải thư viện Supabase'
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
    headers['x-internal-key'] =
      internalKey;
  }

  const response = await fetch(
    '/api/getConfig',
    {
      method: 'GET',
      headers,
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Không tải được cấu hình: HTTP ${response.status} - ${text}`
    );
  }

  const config =
    await response.json();

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

  if (
    !supabaseUrl ||
    !supabaseKey
  ) {
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

/**
 * Hàm kiểm tra quyền.
 *
 * Chỉ truyền id_chucnang.
 * Tên trang sẽ tự lấy từ URL.
 *
 * Hàm này vẫn trả về true/false
 * để không làm hỏng các trang cũ.
 */
export async function quyen_duocxem(
  id_chucnang
) {
  const idChucNang = clean(
    id_chucnang
  ).toLowerCase();

  const duongDan =
    layTenTrangHienTai();

  try {
    if (!idChucNang) {
      console.error(
        '[PHÂN QUYỀN] Thiếu id_chucnang'
      );

      return false;
    }

    const maNv =
      layMaNhanVienDangNhap();

    if (!maNv) {
      console.error(
        '[PHÂN QUYỀN] Không có ma_nv đăng nhập'
      );

      return false;
    }

    const client =
      await taoSupabaseClient();

    /*
     * Bước 1:
     * Lấy vai_tro_id từ kv_nhan_vien.
     */
    const {
      data: nhanVienData,
      error: nhanVienError
    } = await client
      .from('kv_nhan_vien')
      .select(`
        ma_nv,
        vai_tro_id
      `)
      .eq('ma_nv', maNv)
      .limit(1);

    if (nhanVienError) {
      throw nhanVienError;
    }

    const nhanVien =
      Array.isArray(nhanVienData) &&
      nhanVienData.length
        ? nhanVienData[0]
        : null;

    const vaiTroId =
      clean(
        nhanVien?.vai_tro_id
      );

    if (!vaiTroId) {
      console.error(
        '[PHÂN QUYỀN] Không tìm thấy vai_tro_id',
        {
          ma_nv: maNv,
          nhan_vien: nhanVien
        }
      );

      return false;
    }

    /*
     * Bước 2:
     * Lọc quyền theo đúng 4 điều kiện.
     *
     * Không lọc theo ten_chucnang.
     * ten_chucnang chỉ lấy ra để hiển thị trên nút.
     */
    const {
      data,
      error
    } = await client
      .from(
        'sql_phan_quyen_nhan_vien'
      )
      .select(`
        ma_nv,
        vai_tro_id,
        duong_dan,
        id_chucnang,
        ten_chucnang,
        duoc_xem
      `)
      .eq('ma_nv', maNv)
      .eq(
        'vai_tro_id',
        vaiTroId
      )
      .eq(
        'duong_dan',
        duongDan
      )
      .eq(
        'id_chucnang',
        idChucNang
      )
      .limit(1);

    if (error) {
      throw error;
    }

    const row =
      Array.isArray(data) &&
      data.length
        ? data[0]
        : null;

    const duocXem =
      toBool(row?.duoc_xem);

    const chiTietQuyen = {
      ma_nv: maNv,
      vai_tro_id: vaiTroId,
      duong_dan: duongDan,
      id_chucnang: idChucNang,
      ten_chucnang:
        clean(row?.ten_chucnang),
      tim_thay:
        Boolean(row),
      duoc_xem:
        duocXem
    };

    const cacheKey = [
      duongDan,
      idChucNang
    ].join('|');

    chiTietQuyenCache.set(
      cacheKey,
      chiTietQuyen
    );

    console.log(
      '[KẾT QUẢ PHÂN QUYỀN]',
      chiTietQuyen
    );

    return duocXem;
  } catch (error) {
    const chiTietLoi = {
      ma_nv:
        layMaNhanVienDangNhap() ||
        null,
      vai_tro_id:
        null,
      duong_dan:
        duongDan,
      id_chucnang:
        idChucNang,
      ten_chucnang:
        '',
      tim_thay:
        false,
      duoc_xem:
        false,
      message:
        error?.message ||
        String(error),
      code:
        error?.code ||
        null,
      details:
        error?.details ||
        null,
      hint:
        error?.hint ||
        null
    };

    const cacheKey = [
      duongDan,
      idChucNang
    ].join('|');

    chiTietQuyenCache.set(
      cacheKey,
      chiTietLoi
    );

    console.error(
      '[PHÂN QUYỀN] Lỗi',
      chiTietLoi
    );

    return false;
  }
}

/**
 * Lấy chi tiết quyền sau khi đã lọc theo id_chucnang.
 *
 * Dùng hàm này để lấy:
 * - ten_chucnang
 * - duoc_xem
 * - tim_thay
 * - duong_dan
 */
export async function layChiTietQuyen(
  id_chucnang
) {
  const idChucNang = clean(
    id_chucnang
  ).toLowerCase();

  const duongDan =
    layTenTrangHienTai();

  const cacheKey = [
    duongDan,
    idChucNang
  ].join('|');

  if (
    !chiTietQuyenCache.has(cacheKey)
  ) {
    await quyen_duocxem(
      idChucNang
    );
  }

  return (
    chiTietQuyenCache.get(cacheKey) || {
      ma_nv:
        layMaNhanVienDangNhap() ||
        null,
      vai_tro_id:
        null,
      duong_dan:
        duongDan,
      id_chucnang:
        idChucNang,
      ten_chucnang:
        '',
      tim_thay:
        false,
      duoc_xem:
        false
    }
  );
}

/**
 * Xóa cache chi tiết quyền.
 * Dùng khi vừa thay đổi quyền trong Supabase.
 */
export function xoaCachePhanQuyen() {
  chiTietQuyenCache.clear();
}

/**
 * Test trực tiếp trong F12 Console:
 *
 * layTenTrangHienTai()
 * await testQuyenDuocXem('admin')
 * await testChiTietQuyen('admin')
 */
window.layTenTrangHienTai =
  layTenTrangHienTai;

window.testQuyenDuocXem =
  quyen_duocxem;

window.testChiTietQuyen =
  layChiTietQuyen;

window.xoaCachePhanQuyen =
  xoaCachePhanQuyen;

console.log(
  '[PHÂN QUYỀN] Đã tải phan_quyen.js',
  {
    trang:
      layTenTrangHienTai()
  }
);
"""

path = Path("/mnt/data/phan_quyen.js")
path.write_text(code, encoding="utf-8")

print(path)
