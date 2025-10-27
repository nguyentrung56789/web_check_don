// ===================== login.js =====================
import { clearCase } from './auth_guard.js';

const $ = id => document.getElementById(id);
const STORAGE = localStorage;

let supabase;
const TABLE_NV = (window.COD_CONFIGS?.index?.table) || 'kv_nhan_vien';

/* ========== Tiện ích chung ========== */
function goIndex() {
  try {
    const token = (typeof window.makeAccess === 'function') ? window.makeAccess() : '';
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    location.replace(`./index.html${qs}`);
  } catch {
    location.replace(`./index.html`);
  }
}
function safeParse(json, fallback=null){
  try { return JSON.parse(json); } catch { return fallback; }
}

/* ========== Auto-redirect nếu đã đăng nhập hợp lệ ========== */
// Lưu ý: phải đặt SAU import. Kiểm tra rất nhẹ: có 'nv' & hoat_dong===true là vào index.
(function autoRedirect(){
  const raw = STORAGE.getItem('nv');
  if (!raw) return;
  const nv = safeParse(raw);
  if (nv && nv.ma_nv && nv.hoat_dong === true) {
    console.log('[login] Đã có phiên, chuyển vào index...');
    goIndex();
  }
})();

/* ========== Init Supabase (API + fallback an toàn) ========== */
async function initSupabase(){
  const note = $('cfgNote');
  try{
    let url, anon;

    // 1) API thật /api/getConfig
    try{
      const r = await fetch('/api/getConfig', {
        headers: { 'x-internal-key': (window.getInternalKey?.()||'') }
      });
      if (r.ok){
        const j = await r.json();
        url = j?.url; anon = j?.anon;
      }
    }catch{ /* bỏ qua và fallback */ }

    // 2) Fallback cho cả 2 dạng getConfig
    if(!url || !anon){
      try{
        if (typeof window.getConfig === 'function') {
          const u1 = window.getConfig('url');
          const a1 = window.getConfig('anon');
          if (typeof u1 === 'string' && typeof a1 === 'string') { url=u1; anon=a1; }
        }
      }catch{}

      try{
        if ((!url||!anon) && typeof window.getConfig === 'function') {
          const obj = window.getConfig();
          if (obj?.url && obj?.anon){ url=obj.url; anon=obj.anon; }
        }
      }catch{}

      if (!url || !anon) {
        url  = window.COD_BASE?.url  || url;
        anon = window.COD_BASE?.anon || anon;
      }
    }

    if(!url || !anon) throw new Error('Thiếu cấu hình Supabase (url/anon)');
    supabase = window.supabase.createClient(url, anon);
    note.textContent = 'Đã sẵn sàng. Vui lòng đăng nhập.';
  }catch(e){
    $('msg').textContent = 'Lỗi cấu hình: ' + e.message;
    note.textContent = 'Không khởi tạo được Supabase.';
    console.error('[login]initSupabase ERR:', e);
  }
}
initSupabase();

/* ========== UI state ========== */
function setLoading(v=true){
  const b=$('btnLogin');
  if (!b) return;
  b.disabled=v; b.textContent=v?'Đang xử lý…':'Đăng nhập';
}

/* ========== Đăng nhập ========== */
async function login(){
  if(!supabase){ $('msg').textContent="Đang khởi tạo, thử lại…"; return; }
  const ma=$('ma_nv').value.trim();
  const mk=$('mat_khau').value.trim();
  if(!ma||!mk){ $('msg').textContent='Vui lòng nhập đủ thông tin'; return; }

  setLoading(true); $('msg').textContent='';
  try{
    const { data, error } = await supabase
      .from(TABLE_NV)
      .select('ma_nv, ten_nv, admin, dong_hang, check_don, map, hoat_dong')
      .eq('ma_nv', ma)
      .eq('mat_khau', mk.toString())
      .limit(1)
      .maybeSingle();

    if(error || !data){ $('msg').textContent='Sai mã hoặc mật khẩu'; return; }

    // Quy tắc BẮT BUỘC: hoat_dong=true mới lưu case
    if(data.hoat_dong !== true){
      clearCase?.();
      $('msg').textContent='Tài khoản đã bị dừng hoạt động.';
      return;
    }

    // LƯU CASE (kèm last_ma_nv để autofill)
    try{
      STORAGE.setItem('nv', JSON.stringify(data));
      STORAGE.setItem('last_ma_nv', ma);
      if(!STORAGE.getItem('nv')) throw new Error('localStorage bị chặn');
    }catch(e){
      $('msg').textContent='Không thể lưu phiên đăng nhập.';
      console.error(e);
      return;
    }

    // Lưu ngữ cảnh tab (ẩn)
    sessionStorage.setItem('nv_ctx', JSON.stringify({
      ma_nv:data.ma_nv||'', ten_nv:data.ten_nv||'', ts:Date.now()
    }));

    // Tạo token + vào index
    if(navigator.vibrate) navigator.vibrate(60);
    goIndex();
  }catch(e){
    $('msg').textContent='Lỗi: '+e.message;
  }finally{
    setLoading(false);
  }
}

/* ========== Events ========== */
$('btnLogin')?.addEventListener('click', login);
$('mat_khau')?.addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
(function autofill(){ const el=$('ma_nv'); if(el) el.value=STORAGE.getItem('last_ma_nv')||''; })();
