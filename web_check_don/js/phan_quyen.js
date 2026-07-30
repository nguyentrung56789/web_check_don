const LOGIN_STORAGE_KEY = 'chatwoot_crm_user';
const VIEW_NAME = 'sql_phan_quyen_nhan_vien';

function layNhanVienDangNhap() {
  try {
    return JSON.parse(
      localStorage.getItem(LOGIN_STORAGE_KEY) || 'null'
    );
  } catch {
    return null;
  }
}

function layTenFileHienTai() {
  return (
    window.location.pathname.split('/').pop() ||
    'main.html'
  ).toLowerCase();
}

async function taoSupabaseClient() {
  const internalKey =
    window.INTERNAL_KEY ||
    window.COD_INTERNAL_KEY ||
    window.internalKey ||
    '';

  const headers = {};

  if (internalKey) {
    headers['x-internal-key'] = internalKey;
  }

  const response = await fetch('/api/getConfig', {
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Không tải được cấu hình: ${response.status}`);
  }

  const cfg = await response.json();

  const url =
    cfg.SUPABASE_URL ||
    cfg.supabaseUrl ||
    cfg.supabase_url;

  const key =
    cfg.SUPABASE_ANON ||
    cfg.SUPABASE_ANON_KEY ||
    cfg.supabaseAnon ||
    cfg.supabaseKey ||
    cfg.supabase_anon_key;

  if (!url || !key) {
    throw new Error('Thiếu cấu hình Supabase');
  }

  return window.supabase.createClient(url, key);
}

function anTatCaPhanTuPhanQuyen() {
  document
    .querySelectorAll('[data-phan-quyen]')
    .forEach(element => {
      element.classList.add('hidden');
    });
}

function apDungQuyenTheoId(danhSachQuyen) {
  for (const quyen of danhSachQuyen) {
    const idChucNang = String(
      quyen.id_chucnang || ''
    ).trim();

    if (!idChucNang) continue;

    const element = document.getElementById(idChucNang);

    if (!element) {
      console.warn(
        `Không tìm thấy phần tử id="${idChucNang}"`
      );
      continue;
    }

    element.classList.toggle(
      'hidden',
      quyen.duoc_xem !== true
    );

    element.dataset.duocXem =
      String(quyen.duoc_xem === true);

    element.dataset.duocThem =
      String(quyen.duoc_them === true);

    element.dataset.duocSua =
      String(quyen.duoc_sua === true);

    element.dataset.duocXoa =
      String(quyen.duoc_xoa === true);
  }
}

export async function taiPhanQuyenTrang() {
  anTatCaPhanTuPhanQuyen();

  try {
    const nhanVien = layNhanVienDangNhap();

    const maNv = String(
      nhanVien?.ma_nv ||
      nhanVien?.id_nv ||
      ''
    ).trim();

    const tenNv = String(
      nhanVien?.ten_nv ||
      nhanVien?.tenNhanVien ||
      nhanVien?.name ||
      ''
    ).trim();

    if (!maNv && !tenNv) {
      throw new Error('Không tìm thấy nhân viên đăng nhập');
    }

    const tenTrang = layTenFileHienTai();
    const supabaseClient = await taoSupabaseClient();

    let query = supabaseClient
      .from(VIEW_NAME)
      .select(`
        ma_nv,
        ten_nv,
        duong_dan,
        id_chucnang,
        duoc_xem,
        duoc_them,
        duoc_sua,
        duoc_xoa
      `)
      .eq('duong_dan', tenTrang);

    if (maNv) {
      query = query.eq('ma_nv', maNv);
    } else {
      query = query.eq('ten_nv', tenNv);
    }

    const { data, error } = await query;

    if (error) throw error;

    const danhSachQuyen = data || [];

    apDungQuyenTheoId(danhSachQuyen);

    return {
      tenTrang,
      nhanVien,
      danhSachQuyen
    };
  } catch (error) {
    console.error('Lỗi phân quyền:', error);
    return null;
  } finally {
    document.body.style.visibility = 'visible';
  }
}

export function coQuyen(
  danhSachQuyen,
  idChucNang,
  loaiQuyen = 'duoc_xem'
) {
  const quyen = (danhSachQuyen || []).find(item =>
    item.id_chucnang === idChucNang
  );

  return quyen?.[loaiQuyen] === true;
}
