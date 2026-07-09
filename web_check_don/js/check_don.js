/* ================== CẤU HÌNH & TRẠNG THÁI ================== */
const TABLE = 'don_hang';
let supa = null;

/* ================== PHÂN TRANG (OFFSET-BASED) ================== */
let PAGE_SIZE = 100;     // mặc định, có thể đổi ở #pgSize
let CURRENT_PAGE = 1;    // 1-based
let TOTAL_COUNT = 0;     // tổng theo bộ lọc hiện tại

function totalPages(){ return Math.max(1, Math.ceil(TOTAL_COUNT / PAGE_SIZE)); }
function getPageRange(){
  const from = (CURRENT_PAGE - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;
  return { from, to };
}
function setTotalCount(n){
  TOTAL_COUNT = Number(n) || 0;
  if (CURRENT_PAGE > totalPages()) CURRENT_PAGE = totalPages();
  updatePagerUI();
}
function resetToPage1(){
  CURRENT_PAGE = 1;
  updatePagerUI();
}
function updatePagerUI(){
  const info = document.getElementById('pgInfo');
  const prev = document.getElementById('pgPrev');
  const next = document.getElementById('pgNext');
  if(info) info.textContent = `Trang ${CURRENT_PAGE}/${totalPages()} — ${TOTAL_COUNT} bản ghi`;
  if(prev) prev.disabled = (CURRENT_PAGE<=1);
  if(next) next.disabled = (CURRENT_PAGE>=totalPages());
  const sizeSel = document.getElementById('pgSize');
  if(sizeSel && sizeSel.value !== String(PAGE_SIZE)) sizeSel.value = String(PAGE_SIZE);
}
function bindPager(){
  document.getElementById('pgPrev')?.addEventListener('click', ()=>{
    if (CURRENT_PAGE>1){ CURRENT_PAGE--; reload(); }
  });
  document.getElementById('pgNext')?.addEventListener('click', ()=>{
    if (CURRENT_PAGE<totalPages()){ CURRENT_PAGE++; reload(); }
  });
  document.getElementById('pgSize')?.addEventListener('change', ()=>{
    const v = parseInt(document.getElementById('pgSize').value,10) || 100;
    PAGE_SIZE = v;
    resetToPage1();
    reload();
  });
  updatePagerUI();
}

/* ================== BẢO VỆ TRANG (KHÔNG DÙNG NV) ================== */
if (typeof window.checkAccess === 'function') { try { window.checkAccess(); } catch(_) {} }
const __ACCESS_OK__ = true;

/* ================== CHỌN/TÍCH (ghi theo ma_hd) ================== */
const SELECT_KEY = 'dh_selected_ma_hd';
let SELECTED = new Set();
function loadSelected(){ try{ SELECTED = new Set(JSON.parse(localStorage.getItem(SELECT_KEY)||'[]')); }catch{ SELECTED = new Set(); } }
function saveSelected(){ try{ localStorage.setItem(SELECT_KEY, JSON.stringify([...SELECTED])); }catch{} }
window.getSelectedOrders = () => [...SELECTED];

/* filter “đã chọn” */
const FILTER_KEY = 'dh_filter_checked';
let FILTER_CHECKED = false;
function loadFilterState(){ try{ FILTER_CHECKED = localStorage.getItem(FILTER_KEY) === '1'; }catch{} }
function saveFilterState(){ try{ localStorage.setItem(FILTER_KEY, FILTER_CHECKED ? '1' : '0'); }catch{} }

/* filter “loại đơn hàng” dựa trên cột don_hang: boolean true (COD) / false / null */
let FILTER_COD = '';

/* filter “trạng thái” từ cột trang_thai */
const STATUS_FILTER_KEY = 'dh_filter_status';
let FILTER_STATUS = ''; // lowercase
function loadStatusFilter(){ try{ FILTER_STATUS = localStorage.getItem(STATUS_FILTER_KEY) || ''; }catch{} }
function saveStatusFilter(){ try{ localStorage.setItem(STATUS_FILTER_KEY, FILTER_STATUS); }catch{} }
function normStatus(s){ return (s==null ? '' : String(s).trim().toLowerCase()); }

/* ================== TIỆN ÍCH UI ================== */
function setState(ok, msg){
  const msgEl = document.getElementById('sbMsg');
  const host  = document.getElementById('sbState');
  if (msgEl) { msgEl.textContent = msg || ''; msgEl.className = ok ? 'ok' : 'err'; }
  else if (host) { host.innerHTML = `Supabase: <b class="${ok?'ok':'err'}">${esc(msg||'')}</b>`; }
}
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ===== Banner trượt từ trên (HTML: cần <div id="slideBanner" class="slide-banner"></div>) ===== */
function showSlideBanner(msg, cls='ok'){
  const el = document.getElementById('slideBanner');
  if(!el) return;
  el.textContent = msg;
  el.className = 'slide-banner ' + cls;
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(()=> el.classList.remove('show'), 4000);
}

/* ===== Định dạng ngày/giờ AN TOÀN (local time) ===== */
function parseToLocalDate(v){
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);              // yyyy-mm-dd
  if (m) return new Date(+m[1], +m[2]-1, +m[3], 0, 0, 0);
  m = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);          // dd-mm-yyyy hoặc dd/mm/yyyy
  if (m) return new Date(+m[3], +m[2]-1, +m[1], 0, 0, 0);
  const d = new Date(s);                                     // ISO có time/offset
  return isNaN(d) ? null : d;
}
function fmtDateHTML(v){
  const d = parseToLocalDate(v); if (!d) return '';
  const p = n => String(n).padStart(2,'0');
  const date = `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`;
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${date} <span class="t">${time}</span>`;
}
function toISOStart(str){
  if(!str) return null; let y,m,d;
  if(/^\d{2}-\d{2}-\d{4}$/.test(str)){[d,m,y]=str.split('-').map(Number);}
  else if(/^\d{4}-\d{2}-\d{2}$/.test(str)){[y,m,d]=str.split('-').map(Number);}
  else return null;
  return new Date(y,m-1,d,0,0,0).toISOString();
}
function toISONextStart(str){
  if(!str) return null; let y,m,d;
  if(/^\d{2}-\d{2}-\d{4}$/.test(str)){[d,m,y]=str.split('-').map(Number);}
  else if(/^\d{4}-\d{2}-\d{2}$/.test(str)){[y,m,d]=str.split('-').map(Number);}
  else return null;
  return new Date(y,m-1,d+1,0,0,0).toISOString();
}
function toYMD(str){
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = +d, mm = +mo;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const p = n => String(n).padStart(2,'0');
  return `${y}-${p(mm)}-${p(dd)}`;
}
function isoToVN(ymd){
  if(!ymd) return '';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return ymd;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* ====== helper ngày ====== */
function todayYMD() {
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function getCapDateISO(){
  const el = document.getElementById('capDate');
  if (!el) return todayYMD();

  let v = (el.value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const ymd = `${y}-${mo}-${d}`;
    el.value = ymd; // đồng bộ lại input
    return ymd;
  }

  const ymd = todayYMD();
  el.value = ymd;
  return ymd;
}

/* Mặc định ô to = hôm nay khi đang trống */
function setDefaultDateFilters(){
  const toEl = document.getElementById('to');
  if (toEl && !toEl.value) toEl.value = todayYMD();
}

function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function setScanMsg(cls,text){
  const el=document.getElementById('scanMsg');
  if(!text){ el && (el.textContent=''); el && (el.className='state muted'); return; }
  el && (el.innerHTML=`<b class="${cls}">${text}</b>`, el.className='state');
}

/* COD helper */
function isCOD(v){
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  if (!s) return false;
  return s.includes('cod') || s === 'true';
}

/* DON_HANG cell */
function renderDonHangCell(v, ma_hd){
  const cod = isCOD(v);
  if (!cod) return '';
  const href = `xem_don_cod.html?ma_hd=${encodeURIComponent(ma_hd||'')}`;
  return `<a class="link-cod" href="${href}" target="_blank" rel="noopener">đơn hàng cod</a>`;
}

/* Polyfill CSS.escape */
if (!window.CSS || !CSS.escape) {
  window.CSS = window.CSS || {};
  CSS.escape = CSS.escape || function (s) { return String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&'); };
}

/* ================== USER BAR ================== */
function showUserBar(){
  const bar = document.getElementById('userBar');
  const nameEl = document.getElementById('userName');
  const toggle = document.getElementById('userToggle');
  const menu = document.getElementById('userMenu');
  const actLogout = document.getElementById('actLogout');
  if(!bar || !nameEl || !toggle || !menu || !actLogout) return;

  // Luôn bật thanh
  bar.style.display = 'block';

  // Lấy tên NV: sessionStorage -> localStorage
  let ctx = {};
  try { ctx = JSON.parse(sessionStorage.getItem('nv_ctx') || '{}'); } catch {}
  if(!ctx.ten_nv && !ctx.ma_nv){
    try{
      const nv = JSON.parse(localStorage.getItem('nv') || '{}');
      ctx.ten_nv = nv.ten_nv; ctx.ma_nv = nv.ma_nv;
    }catch{}
  }

  // Chỉ set TÊN vào #userName (để không bị 2 icon)
  nameEl.textContent = (ctx.ten_nv || ctx.ma_nv || 'Chưa xác định');

  // Toggle dropdown khi bấm vào tên
  const hideMenu = ()=> menu.hidden = true;
  const toggleMenu = ()=> menu.hidden = !menu.hidden;

  toggle.addEventListener('click', (e)=>{ e.stopPropagation(); toggleMenu(); });

  // Ẩn khi bấm ra ngoài hoặc nhấn ESC
  document.addEventListener('click', (e)=>{ if(!bar.contains(e.target)) hideMenu(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') hideMenu(); });

  // Đăng xuất
  actLogout.addEventListener('click', ()=>{
    try{
      sessionStorage.removeItem('nv_ctx');
      localStorage.removeItem('nv');
      sessionStorage.removeItem('APP_ACCESS');
    }catch{}
    location.href = 'index.html';
  });

  // Ẩn #logout cũ nếu có
  const oldBtn = document.getElementById('logout');
  if (oldBtn) oldBtn.style.display = 'none';
}

/* layout mở rộng */
function applyExpandState(){
  const on = localStorage.getItem('dh_expand_full') === '1';
  document.querySelector('.wrap')?.classList.toggle('full', on);
  const b = document.getElementById('btnExpand'); if (b) b.textContent = on ? '↔ Thu gọn' : '↔ Mở rộng';
}
function bindExpandButton(){
  const btn = document.getElementById('btnExpand'); if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = localStorage.getItem('dh_expand_full') === '1';
    localStorage.setItem('dh_expand_full', cur ? '0' : '1'); applyExpandState();
  });
}

/* ================== NHÂN VIÊN (chọn NV giao) ================== */
let EMPLOYEES=[]; 
let LAST_ACTIVE_TR=null;

/* Bỏ dấu tiếng Việt để so khớp tên linh hoạt */
function vnFold(s){
  return String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
}

/* ===== Chỉ mục nhân viên: tra nhanh theo ID hoặc tên (không dấu) ===== */
let EMP_BY_ID   = new Map();   // "216939" -> {id, ten_nv, sender_id}
let EMP_BY_NAME = new Map();   // "phong be" -> {id, ten_nv, sender_id}

function buildEmpIndex(){
  EMP_BY_ID.clear(); EMP_BY_NAME.clear();
  for (const e of (EMPLOYEES||[])) {
    if (!e) continue;
    const idStr = String(e.id ?? '').trim();
    if (idStr) EMP_BY_ID.set(idStr, e);
    const nameKey = vnFold(e.ten_nv);
    if (nameKey) EMP_BY_NAME.set(nameKey, e);
  }
}

/* Tìm NV theo nội dung gõ trong ô:
   - Nếu toàn số -> coi là ID
   - Ngược lại -> coi là TÊN (không dấu, không phân biệt hoa/thường)
*/
function findEmpByInput(inputVal){
  const v = String(inputVal || '').trim();
  if (!v) return null;

  if (/^\d+$/.test(v)) return EMP_BY_ID.get(v) || null; // gõ ID

  const key = vnFold(v); // gõ tên
  let emp = EMP_BY_NAME.get(key);
  if (emp) return emp;
  for (const [k, e] of EMP_BY_NAME.entries()){ // bắt đầu bằng...
    if (k.startsWith(key)) return e;
  }
  return null;
}

async function loadEmployees(){
  try{
    const {data,error}=await supa.from('kv_nhan_vien')
      .select('id,ten_nv,sender_id').eq('hoat_dong', true).order('ten_nv',{ascending:true});
    if(error) throw error;
    EMPLOYEES = Array.isArray(data)?data:[];
  }catch(e){
    EMPLOYEES = [];
    setState(false,'không tải được danh sách nhân viên');
  }
}
function renderEmpDatalist(){
  const el = document.getElementById('empList');
  if(!el) return;
  el.innerHTML = (EMPLOYEES||[])
    .map(e => `<option value="${esc(e.ten_nv || '')}"></option>`)
    .join('');
}

/* ================== OVERLAY CHI TIẾT ================== */
function bindOverlayControls(){
  const ov=document.getElementById('detailOverlay'); const fr=document.getElementById('detailFrame');
  document.getElementById('detailClose')?.addEventListener('click', closeOverlay);
  document.getElementById('detailOpenNew')?.addEventListener('click', ()=>{ if(fr?.src) window.open(fr.src,'_blank'); });
  ov?.addEventListener('click',e=>{ if(e.target.id==='detailOverlay') closeOverlay(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ const open=ov && getComputedStyle(ov).display!=='none'; if(open) closeOverlay(); }});
}
function openOverlay(url){
  const ov=document.getElementById('detailOverlay'); const fr=document.getElementById('detailFrame');
  if(!ov||!fr) return;
  fr.removeAttribute('src'); fr.src=url; ov.style.display='flex';
}
function closeOverlay(){
  const ov=document.getElementById('detailOverlay'); const fr=document.getElementById('detailFrame');
  if(!ov||!fr) return; ov.style.display='none'; fr.removeAttribute('src');
  const scan=document.getElementById('scan'); scan?.focus(); scan?.select?.();
}
window.closeOverlay=closeOverlay;

/* ================== SCAN / NÚT ================== */
function bindScanAndButtons(){
  const scan=document.getElementById('scan');
  const btnCheck=document.getElementById('btnCheck');
  const btnPrepTop=document.getElementById('btnPrepTop'); if(btnPrepTop) btnPrepTop.style.display='none';

  if (scan) scan.placeholder = 'Quét mã hóa đơn/mã vận đơn';

  scan?.focus();
  btnCheck?.addEventListener('click', ()=>{ setScanMsg('ok','Đang ở chế độ: Check đơn hàng'); });

  const processScan = ()=>{
    let code=(scan?.value||'').trim();
    if(!code){ setScanMsg('err','Vui lòng nhập/quet mã'); scan?.focus(); return; }
    checkAndOpenByScan(code);
    if(scan){ scan.value=''; scan.focus(); }
  };
  scan?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); processScan(); }});
  scan?.addEventListener('input',()=>{ const v=scan.value; if(v && v.includes('\n')){ scan.value=v.replace(/\s+$/,''); processScan(); }});

  const $q=document.getElementById('q'), $from=document.getElementById('from'), $to=document.getElementById('to');
  if($q)   $q.oninput   = debounce(()=>{ resetToPage1(); reload(); },300);
  if($from)$from.onchange=()=>{ resetToPage1(); reload(); };
  if($to)  $to.onchange  =()=>{ resetToPage1(); reload(); };
  document.getElementById('btnReload')?.addEventListener('click', ()=>{
    if($q) $q.value=''; if($from) $from.value=''; if($to) $to.value='';
    setDefaultDateFilters();
    resetToPage1(); reload();
  });

  const selCOD = document.getElementById('filterLoaiDon');
  selCOD?.addEventListener('change', ()=>{
    FILTER_COD = selCOD.value; // '', 'true', 'false'
    resetToPage1(); reload();
  });

  const selTT = document.getElementById('filterTrangThai');
  selTT?.addEventListener('change', ()=>{
    FILTER_STATUS = selTT.value;  // đã lowercase
    saveStatusFilter();
    resetToPage1(); reload();
  });

  document.getElementById('btnCapNhatDon')?.addEventListener('click', onCapNhatDon);
}

/* ================== CHECK ================== */

/* === Helper: lấy tên NV hiện tại (ưu tiên sessionStorage, fallback localStorage) === */
function getCurrentNVName(){
  try {
    const s = JSON.parse(sessionStorage.getItem('nv_ctx') || '{}');
    if (s && s.ten_nv) return String(s.ten_nv).trim();
  } catch {}
  try {
    const nv = JSON.parse(localStorage.getItem('nv') || '{}');
    if (nv && nv.ten_nv) return String(nv.ten_nv).trim();
  } catch {}
  return '';
}

/* === Helper: lấy mã NV hiện tại (ma_nv) === */
function getCurrentNVID(){
  try {
    const s = JSON.parse(sessionStorage.getItem('nv_ctx') || '{}');
    if (s && s.ma_nv) return String(s.ma_nv).trim();
  } catch {}
  try {
    const nv = JSON.parse(localStorage.getItem('nv') || '{}');
    if (nv && nv.ma_nv) return String(nv.ma_nv).trim();
  } catch {}
  return '';
}

async function checkAndOpenByScan(code){
  try{
    setScanMsg('ok','Đang kiểm tra…');

    const urlMatch = String(code).match(/[?&]ma_hd=([^&#]+)/i);
    if (urlMatch) code = decodeURIComponent(urlMatch[1]);

    // 1) Ưu tiên ma_hd
    let { data } = await supa.from(TABLE).select('ma_hd').eq('ma_hd', code).maybeSingle();

    // 2) fallback ma_vd
    if (!data || !data.ma_hd) {
      const alt = await supa.from(TABLE)
        .select('ma_hd, ma_vd')
        .eq('ma_vd', code)
        .maybeSingle();
      if (alt.data && alt.data.ma_hd) {
        data = { ma_hd: alt.data.ma_hd };
      } else {
        showSlideBanner('❌ Không tìm thấy mã hóa đơn / mã vận đơn: ' + esc(code), 'err');
        setScanMsg('err','Không tìm thấy');
        return;
      }
    }

    const tenNV = getCurrentNVName();
    const qs = new URLSearchParams({ ma_hd: data.ma_hd });

    const { data: detail } = await supa.from(TABLE)
      .select('trang_thai')
      .eq('ma_hd', data.ma_hd)
      .maybeSingle();

    const trangThai = (detail?.trang_thai || '').trim().toLowerCase();
    if (trangThai.includes('huỷ') || trangThai.includes('hủy')) {
      showSlideBanner('⚠️ Đơn hàng này đã bị hủy — không thể mở chi tiết.', 'err');
      setScanMsg('err', 'Đơn hàng đã hủy');
      return;
    }

    if (tenNV) qs.set('nv_xn', tenNV);
    setScanMsg('ok','Đã tìm thấy — mở chi tiết…');
    openOverlay(`check_don_giao_hang.html?${qs.toString()}`);
  } catch(err) {
    showSlideBanner('❌ Lỗi: ' + esc(err.message || err), 'err');
    setScanMsg('err','Đã xảy ra lỗi');
  }
}

/* ================== WEBHOOK HELPER ================== */
function getWebhookUrl(){
  try { return String((window.getConfig && window.getConfig('webhook')) || ''); }
  catch { return ''; }
}
function getOrderInfoFromRow(tr){
  if (!tr) return { ma_hd:'', ten_kh:'', dia_chi:'' };
  const ma_hd  = String(tr.getAttribute('data-ma') || '').trim();
  const ten_kh = (tr.querySelector('[data-cell="ten_kh"]')?.textContent || '').trim();
  const dia_chi = String(tr.getAttribute('data-diachi') || '').trim();
  return { ma_hd, ten_kh, dia_chi };
}

/**
 * Gửi webhook giao hàng DIGIAOHANG.
 * YÊU CẦU: url webhook; có ma_nv, ma_hd, ten_kh, sender_id; dia_chi optional
 * @returns {Promise<boolean>} true nếu gửi OK, false nếu lỗi
 */
async function sendGiaohangWebhook({ ma_nv, ma_hd, ten_kh, sender_id, dia_chi }) {
  const url = getWebhookUrl();
  if (!url) { showSlideBanner('❌ Thiếu webhook', 'err'); return false; }
  if (!ma_hd) { showSlideBanner('❌ Thiếu mã hóa đơn (ma_hd)', 'err'); return false; }
  if (!ma_nv) { showSlideBanner('❌ Thiếu mã nhân viên (ma_nv)', 'err'); return false; }
  if (!sender_id) { showSlideBanner('⚠️ Nhân viên chưa đăng ký gửi tin (thiếu sender_id)', 'err'); return false; }

  try {
    const payload = {
      action: 'digiaohang',
      ma_nv: String(ma_nv),
      ma_hd: String(ma_hd),
      ten_kh: String(ten_kh || ''),
      sender_id: String(sender_id),
      dia_chi: String(dia_chi || '')
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      showSlideBanner('❌ Gửi tin thất bại: ' + (t || res.status), 'err');
      return false;
    }

    showSlideBanner('✅ Đã gửi tin nhắn giao hàng (digiaohang)', 'ok');
    try {
      if (typeof pushNotify === 'function') {
        const kh = ten_kh ? ` • KH: <i>${esc(ten_kh)}</i>` : '';
        const dc = dia_chi ? ` • ĐC: <i>${esc(dia_chi)}</i>` : '';
        pushNotify(`✉️ digiaohang • Đơn <b>${esc(String(ma_hd))}</b> • NV <i>${esc(String(ma_nv))}</i>${kh}${dc}`);
      }
    } catch {}
    return true;
  } catch (e) {
    showSlideBanner('❌ Lỗi kết nối webhook', 'err');
    return false;
  }
}

/* ================== TRẠNG THÁI + NÚT "ĐÃ GIAO" ================== */
function renderStatusCell(ma, val){
  const raw = (val || '').toString().trim();
  const low = raw.toLowerCase();
  const label = raw || '—';

  const cls = low.includes('chuẩn bị') ? 'wait'
           : low.includes('đang giao hàng') ? 'ok'
           : (low.includes('thành công')||low.includes('đã giao')||low==='done') ? 'ok'
           : (low.includes('chờ')||low.includes('đang')) ? 'wait'
           : (low.includes('hủy')||low.includes('huỷ')||low.includes('fail')) ? 'err' : '';

  const shouldShowBtn = (vnFold(raw) === vnFold('Đã kiểm đơn'));

  const btn = shouldShowBtn
    ? ` <button class="btn-da-giao" data-ma="${esc(ma)}" title="Cập nhật sang Giao thành công">Đã giao</button>`
    : '';

  return `<span class="badge ${cls}">${esc(label)}</span>${btn}`;
}

/**
 * Đánh dấu đơn "Giao thành công"
 * - cập nhật DB
 * - cập nhật ngay UI (không reload) qua updateRowFromRecord
 * - ẩn nút "Đã giao"
 */
async function markDaGiao(ma_hd, btnEl){
  if (!supa){ showSlideBanner('❌ Supabase chưa khởi tạo', 'err'); return; }
  const nv_id = getCurrentNVID();
  if (!nv_id){ showSlideBanner('⚠️ Thiếu mã NV đăng nhập (ma_nv)', 'err'); return; }
  if (!ma_hd){ showSlideBanner('❌ Thiếu mã hóa đơn', 'err'); return; }

  const patch = {
    trang_thai: 'Giao thành công',
    ngay_giao_thanh_cong: new Date().toISOString(),
    nv_giao_hang: nv_id
  };

  const oldTxt = btnEl?.textContent;
  if (btnEl){ btnEl.disabled = true; btnEl.textContent = 'Đang cập nhật…'; }

  try{
    const { data, error } = await supa
      .from(TABLE)
      .update(patch)
      .eq('ma_hd', ma_hd)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Không nhận được bản ghi sau cập nhật');

    updateRowFromRecord(data);
    if (btnEl){ btnEl.style.display = 'none'; }

    showSlideBanner('✅ Đã cập nhật: Giao thành công', 'ok');
    try{
      if (typeof pushNotify === 'function'){
        pushNotify(`✅ Đơn <b>${esc(ma_hd)}</b> → <i>Giao thành công</i> • NV: <b>${esc(nv_id)}</b>`);
      }
    }catch{}
  }catch(e){
    showSlideBanner('❌ Lỗi cập nhật: ' + esc(e.message||e), 'err');
    if (btnEl){ btnEl.disabled = false; btnEl.textContent = oldTxt || 'Đã giao'; }
  }
}

/* ================== BẢNG & HÀNH ĐỘNG ================== */
function bindTableActions(){
  const tb = document.getElementById('tbody');

  tb?.addEventListener('change', (e)=>{
    const cb = e.target.closest?.('.row-chk');
    if(!cb) return;
    const tr = cb.closest('tr[data-ma]'); if(!tr) return;
    const ma = tr.dataset.ma;
    if(cb.checked){ SELECTED.add(ma); tr.classList.add('is-selected'); }
    else{ SELECTED.delete(ma); tr.classList.remove('is-selected'); }
    saveSelected();
    updateCheckedCount();
    syncHeaderCheckbox();
    if(FILTER_CHECKED && !cb.checked){ 
      tr.style.display='none'; 
      updateCheckedCount(); syncHeaderCheckbox(); 
    }
  });

  tb?.addEventListener('click', (e)=>{
    const tr=e.target.closest?.('tr[data-ma]'); if(!tr) return;
    if(LAST_ACTIVE_TR) LAST_ACTIVE_TR.classList.remove('active-row');
    tr.classList.add('active-row'); LAST_ACTIVE_TR=tr;
  });

  // ====== Click nút "Đã giao" ======
  tb?.addEventListener('click', async (e)=>{
    const doneBtn = e.target.closest?.('.btn-da-giao');
    if (doneBtn){
      const tr = doneBtn.closest('tr[data-ma]');
      if(!tr){ showSlideBanner('❌ Không xác định được dòng', 'err'); return; }
      const ma = (tr.getAttribute('data-ma') || '').trim();
      if (!ma){ showSlideBanner('❌ Thiếu mã hóa đơn', 'err'); return; }
      await markDaGiao(ma, doneBtn);
      return;
    }

    // ====== GỬI TIN từng dòng → webhook action="digiaohang" ======
    const btn = e.target.closest?.('.btn-send-row');
    if(!btn) return;

    const tr = btn.closest('tr[data-ma]');
    if(!tr){ showSlideBanner('❌ Không xác định được dòng', 'err'); return; }

    const { ma_hd, ten_kh, dia_chi } = getOrderInfoFromRow(tr);
    if(!ma_hd){ showSlideBanner('❌ Thiếu mã hóa đơn', 'err'); return; }

    const inp = tr.querySelector('.emp-input');
    const emp = findEmpByInput(inp?.value || '');
    if (!emp){
      showSlideBanner('⚠️ Vui lòng chọn nhân viên giao hàng (gõ tên/ID)', 'err');
      inp?.focus();
      return;
    }
    if (!emp.sender_id){
      showSlideBanner('⚠️ Nhân viên chưa đăng ký gửi tin (thiếu sender_id)', 'err');
      return;
    }

    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Đang gửi…';
    await sendGiaohangWebhook({
      ma_nv: String(emp.id),
      ma_hd,
      ten_kh,
      sender_id: String(emp.sender_id),
      dia_chi
    });
    btn.disabled = false; btn.textContent = old || 'Gửi tin';
  });
}

/* ======= Header checkbox & đếm theo dòng đang HIỂN THỊ ======= */
function getVisibleRows(){
  return [...document.querySelectorAll('#tbody tr[data-ma]')].filter(tr=>getComputedStyle(tr).display!=='none');
}
function syncHeaderCheckbox(){
  const head = document.getElementById('chkAll');
  if(!head) return;
  const rows = getVisibleRows();
  const all = rows.map(tr=>tr.querySelector('.row-chk')).filter(Boolean);
  const checked = all.filter(cb=>cb.checked);
  head.indeterminate = checked.length>0 && checked.length<all.length;
  head.checked = all.length>0 && checked.length===all.length;
}
function bindHeaderSelectAll(){
  const head = document.getElementById('chkAll');
  if(!head) return;
  head.addEventListener('change', ()=>{
    const rows = getVisibleRows();
    rows.forEach(tr=>{
      const ma = tr.dataset.ma;
      const cb = tr.querySelector('.row-chk');
      if(!cb) return;
      cb.checked = head.checked;
      if(head.checked){ SELECTED.add(ma); tr.classList.add('is-selected'); }
      else{ SELECTED.delete(ma); tr.classList.remove('is-selected'); }
    });
    saveSelected();
    updateCheckedCount();
    syncHeaderCheckbox();
  });
}
function updateCheckedCount(){
  const el = document.getElementById('chkCount');
  if (!el) return;
  const count = getVisibleRows().filter(tr => tr.querySelector('.row-chk')?.checked).length;
  el.textContent = String(count);
}

/* ===== Lọc “đã chọn” ===== */
function applyFilterChecked(){
  const btn = document.getElementById('btnFilterChecked');
  const rows = document.querySelectorAll('#tbody tr[data-ma]');
  rows.forEach(tr=>{
    const ma = tr.dataset.ma;
    const isSel = SELECTED.has(ma);
    tr.style.display = FILTER_CHECKED ? (isSel ? '' : 'none') : '';
  });
  if(btn){ btn.classList.toggle('active', FILTER_CHECKED); btn.textContent = FILTER_CHECKED ? 'Bỏ lọc' : 'Lọc đã chọn'; }
  updateCheckedCount();
  syncHeaderCheckbox();
}
function bindFilterCheckedOnly(){
  const btn = document.getElementById('btnFilterChecked');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    FILTER_CHECKED = !FILTER_CHECKED;
    saveFilterState();
    applyFilterChecked();
  });
}

/* ================== XEM BẢN ĐỒ TUYẾN (overlay) ================== */
function getCheckedOrderIds() {
  const rows = [...document.querySelectorAll('#tbody tr[data-ma] .row-chk:checked')]
    .map(cb => cb.closest('tr[data-ma]'))
    .filter(tr => tr && getComputedStyle(tr).display !== 'none');

  const seen = new Set(); const out = [];
  for (const tr of rows) {
    const ma = (tr.dataset.ma || '').trim();
    if (ma && !seen.has(ma)) { seen.add(ma); out.push(ma); }
  }
  return out;
}

function getCheckedCustomerIdsFromDOM(){
  const rows = [...document.querySelectorAll('#tbody tr[data-ma] .row-chk:checked')]
    .map(cb => cb.closest('tr[data-ma]'))
    .filter(tr => tr && getComputedStyle(tr).display !== 'none');

  const seen = new Set(); const ids = [];
  for (const tr of rows){
    const kh = (tr.getAttribute('data-kh') || '').trim();
    if (kh && !seen.has(kh)){ seen.add(kh); ids.push(kh); }
  }
  return ids;
}

function previewMAKH(ids){
  const total = Array.isArray(ids) ? ids.length : 0;
  if (!total){
    try { showSlideBanner('⚠️ Không có mã khách (ma_kh)', 'err'); } catch {}
    return;
  }
  const short = ids.slice(0, 20).join(' ');
  const more  = total > 20 ? ` … (+${total-20} nữa)` : '';
  try { showSlideBanner(`🔎 Thu được ${total} mã KH: ${short}${more}`, 'ok'); } catch {}
  try { 
    if (typeof pushNotify === 'function'){
      pushNotify(`📍 Đã thu <b>${total}</b> mã KH:<br><pre style="white-space:pre-wrap;margin:6px 0 0">${ids.join(' ')}</pre>`);
    } 
  } catch {}
}

async function openMapOverlayInjected(maList){
  const ids = (Array.isArray(maList)?maList:[])
    .map(s=>String(s||'').trim()).filter(Boolean);
  if (!ids.length){ alert('Không có mã khách.'); return; }

  const q = 'ma: ' + ids.join(' ');

  const ov=document.getElementById('detailOverlay');
  const fr=document.getElementById('detailFrame');
  if(!ov || !fr){ alert('Thiếu overlay/frame (#detailOverlay, #detailFrame).'); return; }

  const target = new URL('map_tuyen.html', location.href);
  target.searchParams.set('no_logo', '1');
  target.searchParams.set('q', q); // truyền q qua URL để chắc chắn

  let token = '';
  try { token = sessionStorage.getItem('APP_ACCESS') || ''; } catch {}
  if (!token && typeof window.makeAccess === 'function') {
    try { token = window.makeAccess(); } catch {}
  }
  if (token) target.searchParams.set('token', token);

  fr.removeAttribute('src');
  ov.style.display='flex';

  const inject = ()=>{
    try{
      const doc = fr.contentWindow?.document;
      if (!doc) return false;
      const input = doc.getElementById('q') || doc.querySelector('input[name="q"]');
      if (!input) return false;
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      return true;
    }catch(_){ return false; }
  };

  fr.onload = ()=>{
    if (inject()) return;
    let n=0, max=20;
    const iv = setInterval(()=>{ if (inject() || ++n>=max) clearInterval(iv); }, 150);
  };

  fr.src = target.toString();

  previewMAKH(ids);
  try { showSlideBanner('🗺️ Đang mở bản đồ tuyến (overlay)…', 'ok'); } catch {}
  try { if (typeof pushNotify==='function') pushNotify('🗺️ Mở map (overlay) với truy vấn: <code>'+q.replace(/</g,'&lt;')+'</code>'); } catch {}
}

async function handleViewRouteOverlay(){
  try{
    let ids = getCheckedCustomerIdsFromDOM();

    if (!ids.length){
      const selHD = getCheckedOrderIds();
      if (!selHD.length){ alert('⚠️ Chưa chọn đơn nào!'); return; }
      if (!supa) throw new Error('Supabase chưa khởi tạo');

      const { data, error } = await supa
        .from('don_hang')
        .select('ma_hd, ma_kh')
        .in('ma_hd', selHD);
      if (error) throw error;

      const seen = new Set(); ids = [];
      for (const r of (data || [])){
        const v = (r.ma_kh || '').trim();
        if (v && !seen.has(v)){ seen.add(v); ids.push(v); }
      }
    }

    if (!ids.length){
      alert('⚠️ Các dòng đã chọn không có ma_kh. Vui lòng kiểm tra dữ liệu.');
      try { showSlideBanner('⚠️ Không có ma_kh để mở bản đồ', 'err'); } catch {}
      return;
    }

    await openMapOverlayInjected(ids);

  }catch(e){
    console.error(e);
    alert('❌ Lỗi khi mở bản đồ tuyến (overlay): ' + (e.message || e));
  }
}
function bindViewRouteButton(){
  const btn = document.getElementById('btnViewRoute');
  if(!btn) return;
  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    handleViewRouteOverlay();
  });


}

/* ================== CẬP NHẬT ĐƠN HÀNG (WEBHOOK) ================== */
async function onCapNhatDon(){
  const ymd = getCapDateISO();   // luôn có giá trị hợp lệ
  setState(true, 'đang cập nhật…');

  try{
    const webhookUrl = (window.getConfig && window.getConfig("webhook")) || "";
    if (!webhookUrl) { setState(false, "Thiếu webhook"); return; }
    const res = await fetch(webhookUrl,{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ action:'capnhathoadon', ngay_cap_nhat: ymd })
    });

    if(!res.ok){
      const text = await res.text().catch(()=> '');
      setState(false, 'Cập nhật lỗi: ' + (text || res.status));
      setTimeout(()=>setState(true,'sẵn sàng'), 3000);
      return;
    }

    setState(true, `đã gửi cập nhật cho ${isoToVN(ymd)}`);
    setTimeout(()=>setState(true,'sẵn sàng'), 2000);
  }catch(e){
    setState(false, 'Lỗi kết nối webhook');
    setTimeout(()=>setState(true,'sẵn sàng'), 3000);
  }
}

/* ============ DROPDOWN TRẠNG THÁI: render và áp dụng ============ */
function renderStatusFilterOptions(statusList){
  const sel = document.getElementById('filterTrangThai');
  if (!sel) return;

  const map = new Map();
  statusList.forEach(s=>{
    const label = (s||'').toString().trim();
    const key = normStatus(label);
    if (label && !map.has(key)) map.set(key, label);
  });

  if (FILTER_STATUS && !map.has(FILTER_STATUS)) {
    map.set(FILTER_STATUS, FILTER_STATUS);
  }

  const opts = [`<option value="">Tất cả</option>`]
    .concat([...map.entries()]
      .sort((a,b)=> a[1].localeCompare(b[1],'vi',{sensitivity:'base'}))
      .map(([val,label])=> `<option value="${esc(val)}"${val===FILTER_STATUS?' selected':''}>${esc(label)}</option>`));

  sel.innerHTML = opts.join('');
}

async function fetchDistinctStatuses(qtxt, from, to){
  let q = supa.from(TABLE).select('trang_thai');
  if(qtxt) q = q.or(`ma_hd.ilike.%${qtxt}%,ten_kh.ilike.%${qtxt}%`);
  const lo=toISOStart(from), hi=toISONextStart(to);
  if(lo) q=q.gte('ngay',lo);
  if(hi) q=q.lt('ngay',hi);
  if (FILTER_COD === 'true') q = q.eq('don_hang', true);
  else if (FILTER_COD === 'false') q = q.or('don_hang.eq.false,don_hang.is.null');
  const { data } = await q;
  const set = new Set((data||[]).map(r => (r.trang_thai||'').toString().trim()).filter(Boolean));
  return [...set];
}

/* ================== TẢI DỮ LIỆU & RENDER ================== */
async function reload(){
  const tb=document.getElementById('tbody');
  if(!supa){ if(tb) tb.innerHTML='<tr><td colspan="11" class="empty">Chưa khởi tạo.</td></tr>'; return; }

  const qtxt=(document.getElementById('q')?.value||'').replace(/[%]/g,'').trim();
  const from=document.getElementById('from')?.value.trim()||'';
  const to=document.getElementById('to')?.value.trim()||'';

  if(tb) tb.innerHTML='<tr><td colspan="11" class="empty">Đang tải…</td></tr>';

  let q = supa.from(TABLE).select('*', { count: 'exact' });

  if(qtxt) q=q.or(`ma_hd.ilike.%${qtxt}%,ten_kh.ilike.%${qtxt}%`);

  const lo=toISOStart(from), hi=toISONextStart(to);
  if(lo) q=q.gte('ngay',lo);
  if(hi) q=q.lt('ngay',hi);

  if (FILTER_COD === 'true') {
    q = q.eq('don_hang', true);
  } else if (FILTER_COD === 'false') {
    q = q.or('don_hang.eq.false,don_hang.is.null');
  }

  if (FILTER_STATUS) {
    q = q.ilike('trang_thai', `%${FILTER_STATUS}%`);
  }

  q = q.order('ngay',{ascending:false});

  const { from: rFrom, to: rTo } = getPageRange();

  let data, count;
  try{
    const res = await q.range(rFrom, rTo).throwOnError();
    data  = res.data || [];
    count = res.count ?? 0;
    setTotalCount(count);
    setState(true,'sẵn sàng');
  }catch(err){
    setState(false,'lỗi');
    if(tb) tb.innerHTML=`<tr><td colspan="11" class="empty">Lỗi: ${esc(err.message||err)}</td></tr>`;
    return;
  }

  const distinctStatuses = await fetchDistinctStatuses(qtxt, from, to);
  renderStatusFilterOptions(distinctStatuses);

  if (!data.length){
    if(tb) tb.innerHTML='<tr><td colspan="11" class="empty">Không có dữ liệu.</td></tr>';
    applyFilterChecked();
    updateCheckedCount();
    syncHeaderCheckbox();
    return;
  }

  if (tb) tb.innerHTML = data.map(r=>{
    const maRaw = r.ma_hd || '';
    const ma = esc(maRaw);
    const checked = SELECTED.has(maRaw) ? 'checked' : '';
    const selCls  = checked ? ' is-selected' : '';

    return `
      <tr class="${selCls}" data-ma="${maRaw}" data-kh="${esc(r.ma_kh||'')}"
          data-xacnhan="${esc(r.nv_check_don||'')}"
          data-dong="${esc(r.nv_dong_hang||'')}"
          data-prepdate="${esc(r.ngay_chuan_bi_don||'')}"
          data-dongdate="${esc(r.ngay_dong_hang||'')}"
          data-giaothanhcong="${esc(r.ngay_giao_thanh_cong||'')}"
          data-nv_giaohang="${esc(r.nv_giao_hang||'')}"
          data-diachi="${esc(r.dia_chi || r.diachi || '')}">
        <td class="sel"><input type="checkbox" class="row-chk" ${checked} /></td>
        <td data-cell="ma_hd">${ma}</td>
        <td class="col-don-hang" data-cell="don_hang" style="text-align:center">${renderDonHangCell(r.don_hang, maRaw)}</td>
        <td data-cell="ngay">${fmtDateHTML(r.ngay)}</td>
        <td data-cell="ten_kh">${esc(r.ten_kh||'')}</td>
        <td data-cell="tong_tien" class="right">${r.tong_tien!=null ? Number(r.tong_tien).toLocaleString('vi-VN') : ''}</td>
        <td data-cell="trang_thai">${renderStatusCell(maRaw, r.trang_thai)}</td>

        <td data-cell="ngay_xn" class="col-ngay-xn" style="min-width:180px;white-space:nowrap">
          ${fmtDateHTML(r.ngay_check_don)}
        </td>

        <td data-cell="nv_xn" class="col-nv-xn">${esc(r.nv_check_don||'')}</td>

        <td data-cell="nv_dong" class="col-nv-dh">
          <input class="emp-input" list="empList" data-ma="${ma}"
                 style="min-width:160px"
                 placeholder="— chọn / tìm NV —" value="${esc(r.nv_dong_hang||'')}">
        </td>

        <td data-cell="btn_send">
          ${!r.ngay_dong_hang ? `<button class="btn-send-row" data-ma="${ma}">Gửi tin</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  applyFilterChecked();
  updateCheckedCount();
  syncHeaderCheckbox();
}

/* ================== KHỞI TẠO ================== */
async function init(){
  if (!__ACCESS_OK__) return;
  try{
    const nameCell = document.getElementById('tblName'); if(nameCell) nameCell.textContent = TABLE;

    if (!window.supabase || !window.supabase.createClient) {
      setState(false, 'Thiếu supabase-js (chưa load script @supabase/supabase-js@2 trước file app)');
      console.error('[INIT] supabase-js not found');
      return;
    }

    const INTERNAL_KEY = (typeof window.getInternalKey==='function') ? window.getInternalKey() : '';
    const base = (window.API_BASE || '').replace(/\/+$/,'');
    const cfgUrl = base ? `${base}/api/getConfig` : '/api/getConfig';
    const r = await fetch(cfgUrl, { headers: { 'x-internal-key': INTERNAL_KEY } });
    if(!r.ok){
      setState(false, `Không lấy được config (${r.status})`);
      console.error('[INIT] getConfig failed', r.status, await r.text().catch(()=>'')); 
      return;
    }
    const cfg = await r.json().catch(()=> ({}));
    const { url, anon } = (cfg || {});
    if(!url || !anon){
      setState(false, 'Thiếu url/anon trong config');
      console.error('[INIT] Invalid config', cfg);
      return;
    }
    supa = window.supabase.createClient(url, anon);
    window.supa = supa;
    setState(true,'sẵn sàng');
  }catch(e){
    setState(false, esc(e.message||e));
    console.error('[INIT] exception', e);
    return;
  }

  // Tiêm CSS cho nút "Đã giao"
  (function injectDoneBtnCSS(){
    if (document.getElementById('btnDaGiaoStyle')) return;
    const style = document.createElement('style');
    style.id = 'btnDaGiaoStyle';
    style.textContent = `
      .btn-da-giao{
        background:#10b981; color:#fff; border:none;
        padding:6px 10px; border-radius:8px; font-weight:600; cursor:pointer;
      }
      .btn-da-giao:disabled{ opacity:.6; cursor:default; }
    `;
    document.head.appendChild(style);
  })();

  const capEl = document.getElementById('capDate');
  if (capEl && !capEl.value) capEl.value = todayYMD();
  setDefaultDateFilters();

  loadSelected(); loadFilterState(); loadStatusFilter();

  applyExpandState(); bindExpandButton(); showUserBar();
  bindPager();
  await loadEmployees(); buildEmpIndex(); renderEmpDatalist();
  bindScanAndButtons(); bindOverlayControls();
  bindTableActions(); bindHeaderSelectAll();
  bindFilterCheckedOnly(); bindViewRouteButton();

  applyFilterChecked(); updateCheckedCount();
  await reload();
}
document.addEventListener('DOMContentLoaded', init);

/* ========== SUPABASE REALTIME + THÔNG BÁO CHUÔNG ========== */
(function(){
  if (window.__DON_HANG_RT__) return;
  window.__DON_HANG_RT__ = true;

  (function injectNotifyStyles(){
    if (document.getElementById('notifyPatch')) return;
    const css = `
      #notifyBell{ position:relative; }
      #notifyBell::after{
        content: attr(data-count);
        position:absolute; top:-6px; right:-6px;
        min-width:18px; height:18px; padding:0 6px;
        border-radius:999px; background:#ef4444; color:#fff;
        font-weight:700; font-size:11px; line-height:18px; text-align:center;
        box-shadow:0 0 0 2px rgba(255,255,255,.9);
        opacity:0; transform:scale(.6);
        transition:opacity .15s ease, transform .15s ease;
      }
      #notifyBell[data-count="0"]::after{ opacity:0; transform:scale(.6); }
      #notifyBell:not([data-count="0"])::after{ opacity:1; transform:scale(1); }

      #notifyPanel{
        background:#ffffff !important; color:#111827 !important;
        border:1px solid #e5e7eb !important; border-radius:12px !important;
        box-shadow:0 12px 28px rgba(0,0,0,.18) !important;
        width:300px !important;
      }
      #notifyPanel .np-head{
        background:#f9fafb !important; color:#111827 !important;
        border-bottom:1px solid #e5e7eb !important;
        font-weight:700; letter-spacing:.2px;
      }
      #notifyPanel .np-body{ max-height:55vh !important; }
      #notifyPanel .np-item{
        padding:10px 12px !important; border-bottom:1px dashed #e5e7eb !important;
        display:flex; flex-direction:column; gap:4px;
      }
      #notifyPanel .np-item:last-child{ border-bottom:none !important; }
      #notifyPanel .np-item time{ color:#6b7280 !important; font-size:12px !important; }
      #notifyPanel .np-empty{ color:#6b7280 !important; }
    `;
    const style = document.createElement('style');
    style.id = 'notifyPatch'; style.textContent = css;
    document.head.appendChild(style);
  })();

  let NOTIFY_COUNT = 0;
  function setBellCount(n){
    NOTIFY_COUNT = Math.max(0, Math.min(99, Number(n)||0));
    const bell = document.getElementById('notifyBell');
    if (bell) bell.setAttribute('data-count', String(NOTIFY_COUNT));
  }
  function bumpBell(n=1){ setBellCount(NOTIFY_COUNT + n); }

  (function bindBellReset(){
    const bell = document.getElementById('notifyBell');
    bell?.addEventListener('click', ()=> setBellCount(0));
  })();

  (function initCountFromDOM(){
    const list = document.getElementById('notifyList');
    if (!list) return;
    const init = list.querySelectorAll('.np-item').length;
    setBellCount(init);
  })();

  function pushNotify(text){
    const list = document.getElementById('notifyList');
    if(!list) return;
    const empty = list.querySelector('.np-empty'); if (empty) empty.remove();
    const item = document.createElement('div');
    item.className = 'np-item';
    const now = new Date().toLocaleString('vi-VN');
    item.innerHTML = `${esc(text)}<time>${now}</time>`;
    if (list.firstChild) list.insertBefore(item, list.firstChild);
    else list.appendChild(item);
    const items = list.querySelectorAll('.np-item');
    if (items.length > 100) list.removeChild(items[items.length-1]);
    bumpBell(1);
  }
  window.pushNotify = window.pushNotify || pushNotify;

  function updateRowFromRecord(r){
    if(!r || !r.ma_hd) return false;
    const tr = document.querySelector(`#tbody tr[data-ma="${CSS.escape(r.ma_hd)}"]`);
    if(!tr) return false;

    tr.dataset.xacnhan          = (r.nv_check_don || '').trim();
    tr.dataset.dong             = (r.nv_dong_hang || '').trim();
    tr.dataset.prepdate         = r.ngay_chuan_bi_don || '';
    tr.dataset.dongdate         = r.ngay_dong_hang || '';
    tr.dataset.giaothanhcong    = r.ngay_giao_thanh_cong || '';
    tr.dataset.nv_giaohang      = r.nv_giao_hang || '';

    const cDonHang = tr.querySelector('[data-cell="don_hang"]');
    const cNgay    = tr.querySelector('[data-cell="ngay"]');
    const cTen     = tr.querySelector('[data-cell="ten_kh"]');
    const cTien    = tr.querySelector('[data-cell="tong_tien"]');
    const cTT      = tr.querySelector('[data-cell="trang_thai"]');
    const cNgayXN  = tr.querySelector('[data-cell="ngay_xn"]');
    const cNVXN    = tr.querySelector('[data-cell="nv_xn"]');
    const cNVDH    = tr.querySelector('[data-cell="nv_dong"]');
    const inputNVDH  = cNVDH?.querySelector('.emp-input');
    const btnSend    = tr.querySelector('.btn-send-row');

    if (cDonHang) cDonHang.innerHTML = renderDonHangCell(r.don_hang, r.ma_hd);
    if (cNgay)    cNgay.innerHTML    = fmtDateHTML(r.ngay);
    if (cTen)     cTen.textContent   = (r.ten_kh||'');
    if (cTien)    cTien.textContent  = (r.tong_tien!=null ? Number(r.tong_tien).toLocaleString('vi-VN') : '');
    if (cTT)      cTT.innerHTML      = renderStatusCell(r.ma_hd, r.trang_thai);
    if (cNgayXN)  cNgayXN.innerHTML  = fmtDateHTML(r.ngay_check_don);
    if (cNVXN)    cNVXN.textContent  = (r.nv_check_don||'');
    if (inputNVDH)  inputNVDH.value  = (r.nv_dong_hang||'');

    // Ẩn nút "Đã giao" nếu trạng thái đã giao xong
    const delivered = (()=> {
      const s = vnFold(r.trang_thai || '');
      return s.includes(vnFold('thành công')) || s.includes(vnFold('đã giao')) || s.includes('done');
    })();
    if (delivered){
      tr.querySelectorAll('.btn-da-giao').forEach(b=> b.style.display='none');
    }

    if (btnSend){ btnSend.style.display = r.ngay_dong_hang ? 'none' : ''; }
    return true;
  }

  function setupRealtime(){
    if (!supa) return false;
    const ch = supa.channel('rt-don_hang')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        try{
          const type = payload.eventType;
          const rNew = payload.new || {};
          const rOld = payload.old || {};
          const ma   = rNew.ma_hd || rOld.ma_hd || '(không rõ)';

          if (type === 'UPDATE'){
            const ok = updateRowFromRecord(rNew);
            const tt = (rNew.trang_thai || '').trim();
            if (!ok) {
              pushNotify(`🔄 Cập nhật đơn ${esc(ma)} (ngoài danh sách hiển thị)`);
            } else {
              pushNotify(`🔄 Cập nhật đơn ${esc(ma)}${tt?` → “${esc(tt)}”`:''}`);
            }
          } else if (type === 'INSERT'){
            pushNotify(`➕ Thêm mới đơn ${esc(ma)} (đã đồng bộ)`);
          } else if (type === 'DELETE'){
            const tr = document.querySelector(`#tbody tr[data-ma="${CSS.escape(ma)}"]`);
            if (tr) {
              tr.remove();
              updateCheckedCount();
              syncHeaderCheckbox();
            }
            pushNotify(`🗑️ Xóa đơn ${esc(ma)}`);
          }
        }catch(e){ console.warn('Realtime error:', e); }
      })
      .subscribe(() => {});
    window.__DON_HANG_RT_CH__ = ch;
    return true;
  }

  const __wait = setInterval(()=>{ if (supa){ setupRealtime() && clearInterval(__wait); } }, 300);

  window.addEventListener('capnhat-don-hang', ()=>{
    onCapNhatDon();
    const iso = getCapDateISO();
    if (iso) pushNotify(`⚡ Đã gửi webhook cập nhật hóa đơn cho ngày <b>${esc(isoToVN(iso))}</b>`);
    else pushNotify(`⚠️ Ngày cập nhật không hợp lệ`);
  });

  window.addEventListener('beforeunload', ()=>{
    try { window.__DON_HANG_RT_CH__?.unsubscribe(); } catch {}
  });
})();

/* ================== NHẬN TÍN HIỆU TỪ FORM CON ================== */
window.addEventListener('message', (ev) => {
  const msg = (ev && ev.data) || {};
  if (msg.type === 'close-overlay') {
    closeOverlay();
    try {
      const list = document.getElementById('notifyList');
      if (list) {
        const item = document.createElement('div');
        item.className = 'np-item';
        const now = new Date().toLocaleString('vi-VN');
        item.innerHTML = `Đã đóng form chi tiết <time>${now}</time>`;
        list.prepend(item);
      }
    } catch (_) {}
  }
});
