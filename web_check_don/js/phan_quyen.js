from pathlib import Path
import zipfile

src = Path("/mnt/data/Văn bản đã dán (1)(20260805-112008).txt")
main_out = Path("/mnt/data/main_muot.html")
perm_out = Path("/mnt/data/phan_quyen_muot.js")
zip_out = Path("/mnt/data/bo_phan_quyen_muot.zip")

main = src.read_text(encoding="utf-8")

# Không để trang trắng nếu module lỗi.
main = main.replace(
"""    body {
      visibility: hidden;""",
"""    body {
      visibility: visible;"""
)

# CSS hiệu ứng mượt.
css_anchor = """    .permission-menu {
      width: min(100%, 670px);
      margin: 0 auto;
      display: grid;
      gap: 14px;
    }
"""
css_replacement = """    .permission-menu {
      width: min(100%, 670px);
      margin: 0 auto;
      display: grid;
      gap: 14px;
      opacity: 0;
      transform: translateY(8px);
      transition:
        opacity 0.24s ease,
        transform 0.24s ease;
    }

    .permission-menu.loaded {
      opacity: 1;
      transform: translateY(0);
    }

    .permission-btn.permission-show {
      animation: hienNut 0.24s ease both;
    }

    @keyframes hienNut {
      from {
        opacity: 0;
        transform: translateY(6px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .permission-menu,
      .permission-btn {
        transition: none !important;
        animation: none !important;
      }
    }
"""
main = main.replace(css_anchor, css_replacement)

# Import hàm tải toàn bộ quyền 1 lần.
main = main.replace(
"""    import {
      quyen_duocxem
    } from './js/phan_quyen.js';""",
"""    import {
      quyen_duocxem,
      layDanhSachQuyenTrang
    } from './js/phan_quyen.js';"""
)

# Thay hàm apDungQuyen.
start = main.find("    async function apDungQuyen() {")
end = main.find("    function ganSuKienNut() {", start)

if start == -1 or end == -1:
    raise RuntimeError("Không tìm thấy hàm apDungQuyen trong main.html")

new_apply = """    async function apDungQuyen() {
      anTatCaNut();

      const permissionMenu =
        $('#permissionMenu');

      permissionMenu?.classList.remove(
        'loaded'
      );

      const danhSachQuyen =
        await layDanhSachQuyenTrang({
          batBuocTaiLai: true
        });

      const quyenMap = new Map(
        danhSachQuyen.map(item => [
          item.id_chucnang,
          item
        ])
      );

      let soNutDuocHien = 0;
      const results = [];

      for (const button of permissionButtons) {
        const idChucNang =
          String(
            button.dataset.idChucnang ||
            button.id ||
            ''
          )
            .trim()
            .toLowerCase();

        const quyen =
          quyenMap.get(idChucNang);

        const duocXem =
          quyen?.duoc_xem === true;

        button.dataset.duocXem =
          String(duocXem);

        button.dataset.tenChucnang =
          quyen?.ten_chucnang || '';

        const nameElement =
          button.querySelector(
            '.permission-name'
          );

        if (
          nameElement &&
          quyen?.ten_chucnang
        ) {
          nameElement.textContent =
            quyen.ten_chucnang;
        }

        if (duocXem) {
          button.classList.remove(
            'hidden'
          );

          button.classList.add(
            'permission-show'
          );

          button.style.display = '';

          button.style.animationDelay =
            `${soNutDuocHien * 45}ms`;

          soNutDuocHien += 1;
        }

        results.push({
          id_chucnang:
            idChucNang,
          ten_chucnang:
            quyen?.ten_chucnang || '',
          duoc_xem:
            duocXem
        });
      }

      emptyNote.style.display =
        soNutDuocHien === 0
          ? 'block'
          : 'none';

      requestAnimationFrame(() => {
        permissionMenu?.classList.add(
          'loaded'
        );
      });

      console.table(results);

      return results;
    }

"""
main = main[:start] + new_apply + main[end:]

main = main.replace(
"""          document.body.style.visibility =
            'visible';

          document.body.classList.add(
            'ready'
          );""",
"""          document.body.classList.add(
            'ready'
          );"""
)

main_out.write_text(main, encoding="utf-8")

perm = r"""// ==================== js/phan_quyen.js ====================

const LOGIN_STORAGE_KEYS = [
  'nv',
  'chatwoot_crm_user'
];

const EMPLOYEE_TABLE = 'kv_nhan_vien';
const PERMISSION_VIEW = 'sql_phan_quyen_nhan_vien';

let supabaseClientCache = null;
let employeeRoleCache = null;
let pagePermissionCache = null;

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

function normalizeFunctionId(value) {
  return clean(value).toLowerCase();
}

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

async function layNhanVienVaVaiTro(
  batBuocTaiLai = false
) {
  const maNv =
    layMaNhanVienDangNhap();

  if (!maNv) {
    throw new Error(
      'Không có ma_nv đăng nhập'
    );
  }

  if (
    employeeRoleCache &&
    employeeRoleCache.ma_nv === maNv &&
    !batBuocTaiLai
  ) {
    return employeeRoleCache;
  }

  const client =
    await taoSupabaseClient();

  const {
    data,
    error
  } = await client
    .from(EMPLOYEE_TABLE)
    .select(`
      ma_nv,
      ten_nv,
      vai_tro_id
    `)
    .eq('ma_nv', maNv)
    .limit(1);

  if (error) {
    throw error;
  }

  const row =
    Array.isArray(data) &&
    data.length
      ? data[0]
      : null;

  const vaiTroId =
    clean(row?.vai_tro_id);

  if (!row || !vaiTroId) {
    throw new Error(
      `Không tìm thấy vai_tro_id của nhân viên ${maNv}`
    );
  }

  employeeRoleCache = {
    ma_nv:
      clean(row.ma_nv),
    ten_nv:
      clean(row.ten_nv),
    vai_tro_id:
      vaiTroId
  };

  return employeeRoleCache;
}

export async function layDanhSachQuyenTrang(
  options = {}
) {
  const {
    batBuocTaiLai = false
  } = options;

  const duongDan =
    layTenTrangHienTai();

  const nhanVien =
    await layNhanVienVaVaiTro(
      batBuocTaiLai
    );

  const cacheKey = [
    nhanVien.ma_nv,
    nhanVien.vai_tro_id,
    duongDan
  ].join('|');

  if (
    pagePermissionCache &&
    pagePermissionCache.key === cacheKey &&
    !batBuocTaiLai
  ) {
    return pagePermissionCache.data;
  }

  const client =
    await taoSupabaseClient();

  const {
    data,
    error
  } = await client
    .from(PERMISSION_VIEW)
    .select(`
      ma_nv,
      vai_tro_id,
      duong_dan,
      id_chucnang,
      ten_chucnang,
      duoc_xem
    `)
    .eq(
      'ma_nv',
      nhanVien.ma_nv
    )
    .eq(
      'vai_tro_id',
      nhanVien.vai_tro_id
    )
    .eq(
      'duong_dan',
      duongDan
    );

  if (error) {
    throw error;
  }

  const danhSach =
    (Array.isArray(data) ? data : [])
      .map(row => ({
        ma_nv:
          clean(row.ma_nv),
        vai_tro_id:
          clean(row.vai_tro_id),
        duong_dan:
          clean(row.duong_dan)
            .toLowerCase(),
        id_chucnang:
          normalizeFunctionId(
            row.id_chucnang
          ),
        ten_chucnang:
          clean(row.ten_chucnang),
        duoc_xem:
          toBool(row.duoc_xem)
      }))
      .filter(
        item =>
          Boolean(item.id_chucnang)
      );

  pagePermissionCache = {
    key:
      cacheKey,
    data:
      danhSach
  };

  console.log(
    '[DANH SÁCH QUYỀN TRANG]',
    {
      ma_nv:
        nhanVien.ma_nv,
      vai_tro_id:
        nhanVien.vai_tro_id,
      duong_dan:
        duongDan,
      so_quyen:
        danhSach.length,
      du_lieu:
        danhSach
    }
  );

  return danhSach;
}

export async function quyen_duocxem(
  id_chucnang
) {
  const idChucNang =
    normalizeFunctionId(
      id_chucnang
    );

  if (!idChucNang) {
    return false;
  }

  try {
    const danhSach =
      await layDanhSachQuyenTrang();

    const quyen =
      danhSach.find(
        item =>
          item.id_chucnang ===
          idChucNang
      );

    const duocXem =
      quyen?.duoc_xem === true;

    console.log(
      '[KẾT QUẢ PHÂN QUYỀN]',
      {
        id_chucnang:
          idChucNang,
        ten_chucnang:
          quyen?.ten_chucnang || '',
        duong_dan:
          layTenTrangHienTai(),
        tim_thay:
          Boolean(quyen),
        duoc_xem:
          duocXem
      }
    );

    return duocXem;
  } catch (error) {
    console.error(
      '[PHÂN QUYỀN] Lỗi kiểm tra quyền',
      {
        id_chucnang:
          idChucNang,
        duong_dan:
          layTenTrangHienTai(),
        message:
          error?.message ||
          String(error),
        code:
          error?.code ||
          null,
        details:
          error?.details ||
          null
      }
    );

    return false;
  }
}

export async function layChiTietQuyen(
  id_chucnang
) {
  const idChucNang =
    normalizeFunctionId(
      id_chucnang
    );

  try {
    const danhSach =
      await layDanhSachQuyenTrang();

    return (
      danhSach.find(
        item =>
          item.id_chucnang ===
          idChucNang
      ) || {
        id_chucnang:
          idChucNang,
        ten_chucnang:
          '',
        duong_dan:
          layTenTrangHienTai(),
        duoc_xem:
          false
      }
    );
  } catch (error) {
    return {
      id_chucnang:
        idChucNang,
      ten_chucnang:
        '',
      duong_dan:
        layTenTrangHienTai(),
      duoc_xem:
        false,
      error
    };
  }
}

export function xoaCachePhanQuyen() {
  employeeRoleCache = null;
  pagePermissionCache = null;
}

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

perm_out.write_text(perm, encoding="utf-8")

with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(main_out, arcname="main.html")
    z.write(perm_out, arcname="js/phan_quyen.js")

print(f"Đã tạo: {main_out}")
print(f"Đã tạo: {perm_out}")
print(f"Đã tạo: {zip_out}")
