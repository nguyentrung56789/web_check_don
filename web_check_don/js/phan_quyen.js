from pathlib import Path

code = """// ==================== js/phan_quyen.js ====================

const LOGIN_STORAGE_KEYS = ['nv', 'chatwoot_crm_user'];

let supabaseClient = null;

function clean(value) {
  return String(value ?? '').trim();
}

function toBool(value) {
  const normalized = clean(value).toLowerCase();

  return (
    value === true ||
    value === 1 ||
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 't'
  );
}

export function layTenTrangHienTai() {
  const pathname = window.location.pathname || '';

  return (
    pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.split('?')[0]
      .split('#')[0]
      .trim()
      .toLowerCase() ||
    'main.html'
  );
}

function layNhanVienDangNhap() {
  for (const key of LOGIN_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) continue;

      const user = JSON.parse(raw);

      if (
        user &&
        typeof user === 'object' &&
        !Array.isArray(user)
      ) {
        return user;
      }
    } catch (error) {
      console.warn(
        `[PHÂN QUYỀN] Không đọc được ${key}:`,
        error
      );
    }
  }

  return null;
}

export function layMaNhanVienDangNhap() {
  const user = layNhanVienDangNhap();

  return clean(
    user?.ma_nv ||
    user?.id_nv ||
    user?.maNhanVien ||
    user?.ma_nhan_vien
  );
}

export async function taoSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
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

  const response = await fetch('/api/getConfig', {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      `Không tải được cấu hình Supabase: HTTP ${response.status}`
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
      'Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY'
    );
  }

  supabaseClient =
    window.supabase.createClient(url, key);

  return supabaseClient;
}

export async function quyen_duocxem(id_chucnang) {
  const functionId = clean(id_chucnang).toLowerCase();
  const duongDan = layTenTrangHienTai();

  try {
    if (!functionId) {
      console.error('[PHÂN QUYỀN] Thiếu id_chucnang');
      return false;
    }

    const maNv = layMaNhanVienDangNhap();

    if (!maNv) {
      console.error(
        '[PHÂN QUYỀN] Không có ma_nv đăng nhập'
      );
      return false;
    }

    const client = await taoSupabaseClient();

    const {
      data: nhanVienData,
      error: nhanVienError
    } = await client
      .from('kv_nhan_vien')
      .select('ma_nv, vai_tro_id')
      .eq('ma_nv', maNv)
      .limit(1);

    if (nhanVienError) {
      throw nhanVienError;
    }

    const nhanVien =
      Array.isArray(nhanVienData)
        ? nhanVienData[0]
        : null;

    const vaiTroId =
      clean(nhanVien?.vai_tro_id);

    if (!vaiTroId) {
      console.error(
        '[PHÂN QUYỀN] Không tìm thấy vai_tro_id',
        { ma_nv: maNv }
      );
      return false;
    }

    const { data, error } = await client
      .from('sql_phan_quyen_nhan_vien')
      .select(`
        ma_nv,
        vai_tro_id,
        duong_dan,
        id_chucnang,
        duoc_xem
      `)
      .eq('ma_nv', maNv)
      .eq('vai_tro_id', vaiTroId)
      .eq('duong_dan', duongDan)
      .eq('id_chucnang', functionId)
      .limit(1);

    if (error) {
      throw error;
    }

    const row =
      Array.isArray(data)
        ? data[0]
        : null;

    const duocXem =
      toBool(row?.duoc_xem);

    console.log('[PHÂN QUYỀN]', {
      ma_nv: maNv,
      vai_tro_id: vaiTroId,
      duong_dan: duongDan,
      id_chucnang: functionId,
      tim_thay: Boolean(row),
      duoc_xem: duocXem
    });

    return duocXem;
  } catch (error) {
    console.error(
      '[PHÂN QUYỀN] Lỗi kiểm tra:',
      {
        duong_dan: duongDan,
        id_chucnang: functionId,
        message: error?.message || String(error),
        code: error?.code || null,
        details: error?.details || null
      }
    );

    return false;
  }
}

window.layTenTrangHienTai =
  layTenTrangHienTai;

window.testQuyenDuocXem =
  quyen_duocxem;

console.log(
  '[PHÂN QUYỀN] Đã tải phan_quyen.js'
);
"""

path = Path("/mnt/data/phan_quyen.js")
path.write_text(code, encoding="utf-8")
print(path)
