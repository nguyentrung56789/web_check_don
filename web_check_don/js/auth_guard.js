// ===================== auth_guard.js =====================

// Đọc / xoá case
export function getNV(){
  try { return JSON.parse(localStorage.getItem('nv') || '{}'); } catch { return {}; }
}
export function clearCase(){
  try { ['nv','dh_top_mode','dh_expand_full'].forEach(k=>localStorage.removeItem(k)); } catch {}
}

/** Khởi tạo Supabase: chống xung đột getConfig */
export async function createSupabase(){
  let url, anon;

  // 1) Ưu tiên API thật (được internal_key.js intercept nếu chạy local)
  try {
    const r = await fetch('/api/getConfig', {
      headers: { 'x-internal-key': (window.getInternalKey?.() || '') }
    });
    if (r.ok) {
      const j = await r.json();
      url = j?.url; anon = j?.anon;
    }
  } catch {}

  // 2) Fallback: chấp nhận cả 2 dạng getConfig
  if (!url || !anon) {
    try {
      if (typeof window.getConfig === 'function') {
        // a) Dạng getConfig('url'/'anon')
        const u1 = window.getConfig('url');
        const a1 = window.getConfig('anon');
        if (typeof u1 === 'string' && typeof a1 === 'string') { url = u1; anon = a1; }
      }
    } catch {}

    try {
      if ((!url || !anon) && typeof window.getConfig === 'function') {
        // b) Dạng getConfig() trả {url, anon}
        const obj = window.getConfig();
        if (obj?.url && obj?.anon) { url = obj.url; anon = obj.anon; }
      }
    } catch {}

    // c) Dự phòng cuối cùng nếu bạn set COD_BASE trong internal_key.js
    if (!url || !anon) {
      url  = window.COD_BASE?.url  || url;
      anon = window.COD_BASE?.anon || anon;
    }
  }

  if (!url || !anon) throw new Error('Thiếu cấu hình Supabase (url/anon)');
  return window.supabase.createClient(url, anon);
}

/** Bảo vệ trang bên trong: BẮT BUỘC còn hoạt động */
export async function requireAuth({ supabase, redirect = './login.html', table = 'kv_nhan_vien' } = {}){
  const nv = getNV();
  if(!nv?.ma_nv){
    location.replace(redirect);
    throw new Error('NO_LOGIN');
  }

  const { data, error } = await supabase
    .from(table)
    .select('ma_nv, ten_nv, admin, dong_hang, check_don, map, hoat_dong')
    .eq('ma_nv', nv.ma_nv)
    .limit(1)
    .maybeSingle();

  if (error || !data || data.hoat_dong !== true){
    clearCase();
    location.replace(redirect);
    throw new Error('INACTIVE');
  }
  localStorage.setItem('nv', JSON.stringify(data)); // cập nhật quyền mới nhất
  return data;
}

/** Khóa trang theo 1 quyền cụ thể (dành cho trang đích) */
export function requirePermission(nv, permission, {redirect='./index.html'} = {}){
  if (!nv || nv[permission] !== true) {
    alert('Bạn không có quyền truy cập trang này.');
    location.replace(redirect);
    throw new Error('NO_PERMISSION_' + permission.toUpperCase());
  }
}

/** Ẩn/hiện theo quyền (dùng cho index) */
export function applyPermissions(nv, map = {}){
  const show = sel => document.querySelectorAll(sel).forEach(el=>el.style.display='');
  const hide = sel => document.querySelectorAll(sel).forEach(el=>el.style.display='none');
  Object.values(map).flat().forEach(hide);

  if(nv?.admin)     (map.admin||[]).forEach(show);
  if(nv?.dong_hang) (map.dong_hang||[]).forEach(show);
  if(nv?.check_don) (map.check_don||[]).forEach(show);
  if(nv?.map)       (map.map||[]).forEach(show);
}
