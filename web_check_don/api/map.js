/* ====== KẾT NỐI SUPABASE QUA /api/getConfig ====== */
const TABLE = 'don_hang';
let supa = null;

/* ====== (Fallback) URL doGet — chỉ dùng nếu config không trả về ====== */
const DOGET_URL_FALLBACK = ''; // để trống; ưu tiên lấy từ /api/getConfig (internal_key.js)

/* ====== Quản lý tick chọn ====== */
const SELECT_KEY = 'dh_selected_ma_hd';
let SELECTED = new Set();
function loadSelected(){ try{ SELECTED = new Set(JSON.parse(localStorage.getItem(SELECT_KEY)||'[]')); }catch{ SELECTED = new Set(); } }
function saveSelected(){ try{ localStorage.setItem(SELECT_KEY, JSON.stringify([...SELECTED])); }catch{} }
window.getSelectedOrders = () => [...SELECTED];

/* ====== Lọc chỉ xem dòng đã tick ====== */
const FILTER_KEY = 'dh_filter_checked';
let FILTER_CHECKED = false;
function loadFilterState(){ try{ FILTER_CHECKED = localStorage.getItem(FILTER_KEY) === '1'; }catch{} }
function saveFilterState(){ try{ localStorage.setItem(FILTER_KEY, FILTER_CHECKED ? '1' : '0'); }catch{} }

/* ====== Helper UI ====== */
function setState(ok, msg){
  const msgEl = document.getElementById('sbMsg');
  const host = document.getElementById('sbState');
  if (msgEl) { msgEl.textContent = msg || ''; msgEl.className = ok ? 'ok' : 'err'; }
  else if (host) { host.innerHTML = `Supabase: <b class="${ok?'ok':'err'}">${esc(msg||'')}</b>`; }
}
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function fmtDate(v){ if(!v) return ''; const d=new Date(v); if(isNaN(d)) return ''; const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`; }
function toISOStart(str){ if(!str) return null; let y,m,d; if(/^\d{2}-\d{2}-\d{4}$/.test(str)){[d,m,y]=str.split('-').map(Number);} else if(/^\d{4}-\d{2}-\d{2}$/.test(str)){[y,m,d]=str.split('-').map(Number);} else return null; return new Date(y,m-1,d,0,0,0).toISOString(); }
function toISONextStart(str){ if(!str) return null; let y,m,d; if(/^\d{2}-\d{2}-\d{4}$/.test(str)){[d,m,y]=str.split('-').map(Number);} else if(/^\d{4}-\d{2}-\d{2}$/.test(str)){[y,m,d]=str.split('-').map(Number);} else return null; return new Date(y,m-1,d+1,0,0,0).toISOString(); }
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function setScanMsg(cls,text){ const el=document.getElementById('scanMsg'); if(!text){ el.textContent=''; el.className='state muted'; return; } el.innerHTML=`<b class="${cls}">${text}</b>`; el.className='state'; }

/* ==== Polyfill ==== */
if (!window.CSS || !CSS.escape) { window.CSS = window.CSS || {}; CSS.escape = CSS.escape || function (s) { return String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&'); }; }

/* ---------- User bar ---------- */
function getSavedNV(){ try { return JSON.parse(localStorage.getItem('nv')||'{}') } catch { return {} } }
function showUserBar(){
  const ten = (getSavedNV()?.ten_nv || new URLSearchParams(location.search).get('nv_xn') || '').trim();
  const bar = document.getElementById('userBar'); const nameEl = document.getElementById('userName');
  if (ten) { nameEl.textContent = `👤 ${ten}`; bar.style.display = 'flex'; } else { bar.style.display = 'none'; }
}

/* ---------- UI helpers ---------- */
function applyExpandState(){ const on = localStorage.getItem('dh_expand_full') === '1'; document.querySelector('.wrap').classList.toggle('full', on); const b = document.getElementById('btnExpand'); if (b) b.textContent = on ? '↔ Thu gọn' : '↔ Mở rộng'; }
function bindExpandButton(){ const btn = document.getElementById('btnExpand'); if (!btn) return; btn.addEventListener('click', () => { const cur = localStorage.getItem('dh_expand_full') === '1'; localStorage.setItem('dh_expand_full', cur ? '0' : '1'); applyExpandState(); }); }
let EMPLOYEES=[]; let LAST_ACTIVE_TR=null; let CURRENT_MODE='check';
function setActiveTop(mode){ const btnCheck = document.getElementById('btnCheck'); const btnPrep  = document.getElementById('btnPrepTop'); if(mode==='check'){ btnCheck.classList.add('active'); btnPrep.classList.remove('active'); } else { btnPrep.classList.add('active'); btnCheck.classList.remove('active'); } }
function selectMode(mode){ CURRENT_MODE = (mode==='prep') ? 'prep' : 'check'; setActiveTop(CURRENT_MODE); try{ localStorage.setItem('dh_top_mode', CURRENT_MODE); }catch(_){} }

/* ---------- Nhân viên ---------- */
async function loadEmployees(){
  try{
    const {data,error}=await supa.from('kv_nhan_vien').select('id,ten_nv').eq('hoat_dong', true).order('ten_nv',{ascending:true});
    if(error) throw error;
    EMPLOYEES = Array.isArray(data)?data:[];
  }catch(e){
    EMPLOYEES = [];
    setState(false,'không tải được danh sách nhân viên');
  }
}
function renderEmpDatalist(){ document.getElementById('empList').innerHTML = EMPLOYEES.map(e=>`<option value="${esc(e.ten_nv)}"></option>`).join(''); }

/* ---------- Overlay ---------- */
function bindOverlayControls(){
  const ov=document.getElementById('detailOverlay'); const fr=document.getElementById('detailFrame');
  document.getElementById('detailClose').addEventListener('click', closeOverlay);
  document.getElementById('detailOpenNew').addEventListener('click', ()=>{ if(fr.src) window.open(fr.src,'_blank'); });
  ov.addEventListener('click',e=>{ if(e.target.id==='detailOverlay') closeOverlay(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ const open=getComputedStyle(ov).display!=='none'; if(open) closeOverlay(); }});
}
function openOverlay(url){ const ov=document.getElementById('detailOverlay'); const fr=document.getElementById('detailFrame'); fr.removeAttribute('src'); fr.src=url; ov.style.display='flex'; }
function closeOverlay(){ const ov=document.getElementById('detailOverlay'); const fr=document.getElementById('detailFrame'); ov.style.display='none'; fr.removeAttribute('src'); const scan=document.getElementById('scan'); scan.focus(); scan.select?.(); }
window.closeOverlay=closeOverlay;

/* ---------- Hành vi scan ---------- */
function bindScanAndButtons(){
  const scan=document.getElementById('scan');
  const btnCheck=document.getElementById('btnCheck');
  const btnPrepTop=document.getElementById('btnPrepTop');
  scan.focus();
  btnCheck.addEventListener('click', ()=>{ selectMode('check'); setScanMsg('ok','Đang ở chế độ: Check đơn hàng'); });
  btnPrepTop.addEventListener('click', ()=>{ selectMode('prep');  setScanMsg('ok','Đang ở chế độ: Chuẩn bị đơn'); });

  const processScan = ()=>{
    const code=(scan.value||'').trim();
    if(!code){ setScanMsg('err','Vui lòng nhập/quet mã hóa đơn'); scan.focus(); return; }
    if(CURRENT_MODE==='check'){ checkAndOpenByScan(code); } else { prepareByScan(code); }
    scan.value=''; scan.focus();
  };
  scan.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); processScan(); }});
  scan.addEventListener('input',()=>{ const v=scan.value; if(v && v.includes('\n')){ scan.value=v.replace(/\s+$/,''); processScan(); }});

  document.getElementById('q').oninput   = debounce(()=>reload(),300);
  document.getElementById('from').onchange=()=>reload();
  document.getElementById('to').onchange  =()=>reload();
  document.getElementById('btnReload').onclick=()=>{ document.getElementById('q').value=''; document.getElementById('from').value=''; document.getElementById('to').value=''; reload(); };
}

/* ---------- Kiểm tra & mở chi tiết ---------- */
function renderStatusCell(ma, val){
  const s = (val || '').toString().trim();
  const has = !!s;
  const low = s.toLowerCase();
  const cls = low.includes('chuẩn bị') ? 'wait'
           : low.includes('đang giao hàng') ? 'ok'
           : (low.includes('thành công')||low.includes('đã giao')||low==='done') ? 'ok'
           : (low.includes('chờ')||low.includes('đang')) ? 'wait'
           : (low.includes('hủy')||low.includes('fail')) ? 'err' : '';
  const label = s || '—';
  return `<span class="badge ${cls}">${esc(label)}</span>` +
         (has ? ` <a class="link-soft" target="_blank" href="xem_trang_thai_don.html?ma_hd=${encodeURIComponent(ma)}">xem</a>` : '');
}
async function checkAndOpenByScan(code){
  try{
    setScanMsg('ok','Đang kiểm tra…');
    const {data,error}=await supa.from(TABLE).select('ma_hd, ngay_chuan_bi_don').eq('ma_hd',code).maybeSingle();
    if(error) throw error;
    if(!data || !data.ma_hd){ setScanMsg('err',`❌ Không tìm thấy mã hóa đơn: ${esc(code)}`); return; }
    if(!data.ngay_chuan_bi_don){
      setScanMsg('err','Đơn này chưa được chuẩn bị — chuyển sang chế độ "Chuẩn bị đơn" và quét lại.');
      return;
    }
    setScanMsg('ok','Đã tìm thấy — mở chi tiết…');
    const nv = (JSON.parse(localStorage.getItem('nv')||'{}').ten_nv||'').trim();
    const p = new URLSearchParams({ ma_hd: code }); if (nv) p.set('nv_xn', nv);
    openOverlay(`check_don_giao_hang.html?${p.toString()}`);
  }catch(err){ setScanMsg('err',`❌ Lỗi: ${esc(err.message||err)}`); }
}

/* ---------- Chuẩn bị đơn ---------- */
async function prepareByScan(ma){
  try{
    setScanMsg('ok','Đang xử lý chuẩn bị đơn…');
    const { data, error } = await supa.from(TABLE)
      .select('ma_hd, nv_xac_nhan_don, nv_giao_hang, ngay_chuan_bi_don')
      .eq('ma_hd', ma).maybeSingle();
    if(error) throw error;
    if(!data){ setScanMsg('err',`❌ Không tìm thấy mã hóa đơn: ${esc(ma)}`); return; }
    if(data.ngay_chuan_bi_don){ setScanMsg('err',`Đơn ${esc(ma)} đã được chuẩn bị trước đó.`); return; }
    if((data.nv_xac_nhan_don||'').trim() || (data.nv_giao_hang||'').trim()){
      setScanMsg('err','Đơn đã có xác nhận hoặc đã gán nhân viên giao — không thể "Chuẩn bị đơn".'); return;
    }

    const r = await fetch('https://dhsybbqoe.datadex.vn/webhook/hoadon', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'chuanbidon', ma_hd: ma })
    });
    if(!r.ok){ const t = await r.text().catch(()=> ''); throw new Error(`Webhook lỗi (${r.status}): ${t||'không rõ'}`); }

    const nowISO = new Date().toISOString();
    await supa.from(TABLE)
      .update({ trang_thai: 'Chuẩn bị đơn', ngay_chuan_bi_don: nowISO })
      .eq('ma_hd', ma).throwOnError();

    const tr = document.querySelector(`tr[data-ma="${CSS.escape(ma)}"]`);
    if(tr){
      const cellTT = tr.querySelector('[data-cell="trang_thai"]');
      if(cellTT) cellTT.innerHTML = renderStatusCell(ma, 'Chuẩn bị đơn');
      tr.dataset.prepdate = nowISO;
    }
    selectMode('prep');
    setScanMsg('ok', `Đơn ${esc(ma)} đã chuyển sang "Chuẩn bị đơn"`);
  }catch(err){ setScanMsg('err', `❌ Lỗi chuẩn bị đơn: ${esc(err.message||err)}`); }
}

/* ---------- Bảng & hành động ---------- */
function bindTableActions(){
  const tb=document.getElementById('tbody');

  tb.addEventListener('change', (e)=>{
    const cb = e.target.closest('.row-chk');
    if(!cb) return;
    const tr = cb.closest('tr[data-ma]'); if(!tr) return;
    const ma = tr.dataset.ma;
    if(cb.checked){ SELECTED.add(ma); tr.classList.add('is-selected'); }
    else{ SELECTED.delete(ma); tr.classList.remove('is-selected'); }
    saveSelected(); updateCheckedCount(); syncHeaderCheckbox();
    if(FILTER_CHECKED && !cb.checked){ tr.style.display='none'; }
  });

  tb.addEventListener('click', (e)=>{
    const tr=e.target.closest('tr[data-ma]'); if(!tr) return;
    if(LAST_ACTIVE_TR) LAST_ACTIVE_TR.classList.remove('active-row');
    tr.classList.add('active-row'); LAST_ACTIVE_TR=tr;
  });
  tb.addEventListener('focusin', (e)=>{
    const tr=e.target.closest('tr[data-ma]'); if(!tr) return;
    if(LAST_ACTIVE_TR) LAST_ACTIVE_TR.classList.remove('active-row');
    tr.classList.add('active-row'); LAST_ACTIVE_TR=tr;
  });

  tb.addEventListener('click', async (e)=>{
    const btn=e.target.closest('.btn-ship-row'); if(!btn) return;
    const tr = btn.closest('tr[data-ma]');
    const ma = tr?.dataset.ma;
    const xacNhan = (tr?.dataset.xacnhan || '').trim();
    const hadShipDate = !!(tr?.dataset.shipdate || '').trim();
    const hadPrepDate = !!(tr?.dataset.prepdate || '').trim();

    if(hadShipDate){ return; }
    if(!hadPrepDate){ setScanMsg('err','Chưa chuẩn bị đơn — không thể giao hàng.'); return; }
    const inp = tr.querySelector('.emp-input');
    const tenNV = (inp && inp.value || '').trim();

    if(!xacNhan){ setScanMsg('err','Chưa có nhân viên xác nhận đơn.'); return; }
    if(!tenNV){ setScanMsg('err','Vui lòng chọn nhân viên giao.'); inp?.classList.add('err'); inp?.focus(); return; }
    if(!EMPLOYEES.some(x=>x.ten_nv===tenNV)){ setScanMsg('err','Tên nhân viên giao không khớp danh sách.'); inp?.classList.add('err'); inp?.focus(); return; }

    btn.disabled=true; const keep=btn.textContent; btn.textContent='Đang gửi…';
    try{
      const r = await fetch('https://dhsybbqoe.datadex.vn/webhook/hoadon',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'giaohang', ma_hd: ma, nv_xac_nhan_don: xacNhan, nv_giao_hang:tenNV})
      });
      if(!r.ok){ const t = await r.text().catch(()=> ''); throw new Error(`Webhook lỗi (${r.status}): ${t||'không rõ'}`); }

      const nowISO = new Date().toISOString();
      await supa.from(TABLE)
        .update({ trang_thai: 'Đang giao hàng', nv_giao_hang: tenNV, ngay_di_giao: nowISO })
        .eq('ma_hd', ma).throwOnError();

      const cellTT = tr.querySelector('[data-cell="trang_thai"]');
      if (cellTT) cellTT.innerHTML = renderStatusCell(ma, 'Đang giao hàng');
      tr.dataset.giao = tenNV;
      tr.dataset.shipdate = nowISO;
      btn.style.display='none';
      inp?.classList.remove('err');
      setScanMsg('ok', `Đơn ${esc(ma)} đã chuyển sang "Đang giao hàng"`);
    }catch(err){ setScanMsg('err', `❌ Lỗi giao hàng: ${esc(err.message||err)}`); }
    finally{ btn.disabled=false; btn.textContent=keep; }
  });

  tb.addEventListener('input', e=>{ const inp=e.target.closest('.emp-input'); if(inp) inp.classList.remove('err'); });
}

/* ---------- Đồng bộ “chọn tất cả” + đếm ---------- */
function syncHeaderCheckbox(){
  const head = document.getElementById('chkAll');
  if(!head) return;
  const all = document.querySelectorAll('#tbody .row-chk');
  const checked = document.querySelectorAll('#tbody .row-chk:checked');
  head.indeterminate = checked.length>0 && checked.length<all.length;
  head.checked = all.length>0 && checked.length===all.length;
}
function bindHeaderSelectAll(){
  const head = document.getElementById('chkAll');
  if(!head) return;
  head.addEventListener('change', ()=>{
    const rows = document.querySelectorAll('#tbody tr[data-ma]');
    rows.forEach(tr=>{
      const ma = tr.dataset.ma;
      const cb = tr.querySelector('.row-chk');
      if(!cb) return;
      cb.checked = head.checked;
      if(head.checked){ SELECTED.add(ma); tr.classList.add('is-selected'); }
      else{ SELECTED.delete(ma); tr.classList.remove('is-selected'); }
      if(FILTER_CHECKED){ tr.style.display = head.checked ? '' : 'none'; }
    });
    saveSelected(); updateCheckedCount(); syncHeaderCheckbox();
  });
}
function updateCheckedCount(){ const el = document.getElementById('chkCount'); if (el) el.textContent = SELECTED.size.toString(); }

/* ===================== LẤY CẤU HÌNH MAP TỪ /api/getConfig ===================== */
async function getMapConfig(){
  try{
    const INTERNAL_KEY = (typeof window.getInternalKey==='function') ? window.getInternalKey() : '';
    const res = await fetch('/api/getConfig', { headers: { 'x-internal-key': INTERNAL_KEY } });
    if(!res.ok) throw new Error('getConfig HTTP ' + res.status);
    const cfg = await res.json();

    const m = cfg.map || cfg || {};
    const APPS_URL = m.link_map_apps_script || m.MAP_DOGET_URL || m.APPS_URL || DOGET_URL_FALLBACK || '';
    const SHEET_ID = m.sheet_id_map || m.MAP_SHEET_ID || m.SHEET_ID || '';
    const SHARED_SECRET = m.map_shared_secret || m.MAP_SHARED_SECRET || m.SHARED_SECRET || '';

    if (!APPS_URL || !SHEET_ID) {
      console.error('Map config missing:', { APPS_URL, SHEET_ID, SHARED_SECRET, raw: m });
      throw new Error('Thiếu URL hoặc SHEET_ID cho bản đồ.');
    }
    return { APPS_URL, SHEET_ID, SHARED_SECRET };
  }catch(err){
    console.error('❌ MAP config error:', err);
    setScanMsg('err','Không tải được cấu hình bản đồ (internal_key/getConfig).');
    return null;
  }
}

/* ---------- Lọc theo “đã chọn” & NÚT XEM BẢN ĐỒ (GỌI DOGET) ---------- */
function applyFilterChecked(){
  const btn = document.getElementById('btnFilterChecked');
  const rows = document.querySelectorAll('#tbody tr[data-ma]');
  rows.forEach(tr=>{
    const ma = tr.dataset.ma;
    const isSel = SELECTED.has(ma);
    tr.style.display = FILTER_CHECKED ? (isSel ? '' : 'none') : '';
  });
  if(btn){ btn.classList.toggle('active', FILTER_CHECKED); btn.textContent = FILTER_CHECKED ? 'Bỏ lọc' : 'Lọc đã chọn'; }
}

// Lấy ma_nv (ưu tiên localStorage → query → prompt)
function getCurrentMaNVOrPrompt(){
  const urlMaNv = new URLSearchParams(location.search).get('ma_nv') || '';
  let ma_nv = (getSavedNV()?.ma_nv || urlMaNv || '').trim();
  if (!ma_nv) ma_nv = (prompt('Nhập mã nhân viên (ma_nv):','') || '').trim();
  return ma_nv;
}

// Lấy danh sách ma_kh từ HÀNG ĐÃ TICK (đọc data-kh trong <tr>)
function getSelectedCustomerIdsFromDOM(){
  const arr = [...document.querySelectorAll('#tbody tr[data-ma] .row-chk:checked')]
    .map(cb => (cb.closest('tr')?.getAttribute('data-kh') || '').trim())
    .filter(Boolean);
  return [...new Set(arr)]; // loại trùng
}

// Gọi doGet → nhận GeoJSON đã lọc → lưu localStorage → mở map_tuyen.html
async function callDoGetForSelected(){
  try{
    const mapCfg = await getMapConfig(); if (!mapCfg) return;
    const { APPS_URL, SHEET_ID, SHARED_SECRET } = mapCfg;

    const ma_nv = getCurrentMaNVOrPrompt();
    if (!ma_nv) { setScanMsg('err','Thiếu mã nhân viên (ma_nv).'); return; }

    const khList = getSelectedCustomerIdsFromDOM();
    if (!khList.length){ setScanMsg('err','Chưa tick dòng nào hoặc dòng chưa có ma_kh.'); return; }

    // Giới hạn nhẹ để map mượt
    const MAX_POINTS = 120;
    const listSend = khList.slice(0, MAX_POINTS);

    setScanMsg('ok', `Đang lấy ${listSend.length}/${khList.length} khách cho ${ma_nv}…`);

    const qs = new URLSearchParams({
      sheet_id: SHEET_ID,
      secret: SHARED_SECRET || '',
      sheet: ma_nv,                 // tab/layer = mã NV
      ids: listSend.join('\n'),     // hỗ trợ xuống dòng / phẩy / chấm phẩy
      fmt: 'json',
      _: Date.now().toString()
    });

    const url = `${APPS_URL}?${qs.toString()}`;
    console.log('doGet URL =', url); // debug, có thể click mở trực tiếp
    const res = await fetch(url, { headers: { 'Accept':'application/json' }, cache:'no-store' });
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(`doGet lỗi ${res.status}: ${t||'không rõ'}`);
    }
    const data = await res.json();
    if (!(data && data.type==='FeatureCollection' && Array.isArray(data.features))) {
      throw new Error('Phản hồi không phải GeoJSON FeatureCollection hợp lệ.');
    }

    localStorage.setItem('last_route_geojson', JSON.stringify(data));
    localStorage.setItem('last_route_meta', JSON.stringify({ nv: ma_nv, count: data.features.length, time: new Date().toISOString() }));
    window.open('map_tuyen.html', '_blank', 'noopener');

    setScanMsg('ok', `Đã nhận ${data.features.length} điểm. Mở bản đồ…`);
  }catch(err){
    setScanMsg('err','Lỗi gọi doGet: ' + (err.message || err));
  }
}

function bindFilterButtons(){
  const btnFilter = document.getElementById('btnFilterChecked');
  const btnRoute  = document.getElementById('btnViewRoute');
  if(btnFilter){
    btnFilter.addEventListener('click', ()=>{
      FILTER_CHECKED = !FILTER_CHECKED; saveFilterState(); applyFilterChecked();
    });
  }
  if (btnRoute) {
    btnRoute.addEventListener('click', (e)=>{ e.preventDefault(); callDoGetForSelected(); });
  }
}

/* ---------- Tải dữ liệu & render (THÊM data-kh) ---------- */
async function reload(){
  const tb=document.getElementById('tbody');
  if(!supa){ tb.innerHTML='<tr><td colspan="9" class="empty">Chưa khởi tạo.</td></tr>'; return; }

  const qtxt=(document.getElementById('q').value||'').replace(/[%]/g,'');
  const from=document.getElementById('from').value.trim();
  const to=document.getElementById('to').value.trim();

  tb.innerHTML='<tr><td colspan="9" class="empty">Đang tải…</td></tr>';

  let q=supa.from(TABLE).select(
    'ma_hd, ma_kh, ngay, ten_kh, tong_tien, trang_thai, nv_xac_nhan_don, nv_giao_hang, ngay_chuan_bi_don, ngay_di_giao',
    {count:'exact'}
  );
  if(qtxt) q=q.or(`ma_hd.ilike.%${qtxt}%,ten_kh.ilike.%${qtxt}%`);
  const lo=toISOStart(from), hi=toISONextStart(to);
  if(lo) q=q.gte('ngay',lo);
  if(hi) q=q.lt('ngay',hi);
  q=q.order('ngay',{ascending:false}).limit(1000);

  let data;
  try{ ({data}=await q.throwOnError()); }
  catch(err){ setState(false,'lỗi'); tb.innerHTML=`<tr><td colspan="9" class="empty">Lỗi: ${esc(err.message||err)}</td></tr>`; return; }

  if(!data || !data.length){ tb.innerHTML='<tr><td colspan="9" class="empty">Không có dữ liệu.</td></tr>'; return; }

  tb.innerHTML = data.map(r=>{
    const maRaw = r.ma_hd || ''; const ma = esc(maRaw);
    const checked = SELECTED.has(maRaw) ? 'checked' : ''; const selCls  = checked ? ' is-selected' : '';
    return `
      <tr class="${selCls}" data-ma="${maRaw}" data-kh="${esc(r.ma_kh||'')}"
          data-xacnhan="${esc(r.nv_xac_nhan_don||'')}"
          data-giao="${esc(r.nv_giao_hang||'')}"
          data-prepdate="${esc(r.ngay_chuan_bi_don||'')}"
          data-shipdate="${esc(r.ngay_di_giao||'')}">
        <td class="sel"><input type="checkbox" class="row-chk" ${checked} /></td>
        <td>${ma}</td>
        <td>${esc(fmtDate(r.ngay))}</td>
        <td>${esc(r.ten_kh||'')}</td>
        <td class="right">${r.tong_tien!=null ? Number(r.tong_tien).toLocaleString('vi-VN') : ''}</td>
        <td data-cell="trang_thai">${renderStatusCell(maRaw, r.trang_thai)}</td>
        <td data-cell="nv_xn">${esc(r.nv_xac_nhan_don||'')}</td>
        <td data-cell="nv_giao">
          <input class="emp-input" list="empList" data-ma="${ma}"
                 placeholder="— chọn / tìm NV —" value="${esc(r.nv_giao_hang||'')}">
        </td>
        <td>${!r.ngay_di_giao ? `<button class="btn-ship-row" data-ma="${ma}">Giao hàng</button>` : ''}</td>
      </tr>`;
  }).join('');

  applyFilterChecked(); updateCheckedCount(); syncHeaderCheckbox();
}

/* Nhận tín hiệu từ form con để cập nhật hàng (giữ nguyên) */
(function attachChildUpdater(){
  const escSel = (s)=> (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  function highlightAndUpdate(tr, d){
    if (d.action === 'confirm') {
      const cellXN = tr.querySelector('[data-cell="nv_xn"]'); if (cellXN) cellXN.textContent = d.nv || '';
      tr.dataset.xacnhan = d.nv || '';
    } else if (d.action === 'ship') {
      const cellTT = tr.querySelector('[data-cell="trang_thai"]');
      if (cellTT) cellTT.innerHTML = renderStatusCell(d.ma_hd, 'Đang giao hàng');
      const inp = tr.querySelector('.emp-input'); if (inp) inp.value = d.nv || '';
      tr.dataset.giao = d.nv || '';
      tr.dataset.shipdate = new Date().toISOString();
      const btn = tr.querySelector('.btn-ship-row'); if (btn) btn.style.display = 'none';
    }
    if (LAST_ACTIVE_TR) LAST_ACTIVE_TR.classList.remove('active-row');
    tr.classList.add('active-row'); LAST_ACTIVE_TR = tr;
    tr.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  window.addEventListener('message', async (e)=>{
    const d = e?.data || {};
    if (d.type === 'close-overlay') { try { closeOverlay(); } catch(_){} return; }
    if (d.type !== 'don-updated' || !d.ma_hd) return;

    let tr = document.querySelector(`tr[data-ma="${escSel(d.ma_hd)}"]`);
    if (!tr) { try { await reload(); } catch(_){} tr = document.querySelector(`tr[data-ma="${escSel(d.ma_hd)}"]`); }
    if (tr) highlightAndUpdate(tr, d);
  });
})();

/* ---------- KHỞI TẠO ---------- */
async function init(){
  try{
    document.getElementById('tblName').textContent = TABLE;
    const INTERNAL_KEY = (typeof window.getInternalKey==='function') ? window.getInternalKey() : '';
    const r = await fetch('/api/getConfig', { headers: { 'x-internal-key': INTERNAL_KEY } });
    if(!r.ok) throw new Error('Không lấy được config');
    const { url, anon } = await r.json();
    if(!url || !anon) throw new Error('Thiếu url/anon');
    supa = window.supabase.createClient(url, anon);
    setState(true,'sẵn sàng');
  }catch(e){ setState(false, esc(e.message||e)); return; }

  loadSelected(); loadFilterState();
  try{ const saved = localStorage.getItem('dh_top_mode'); if(saved==='prep'||saved==='check') CURRENT_MODE = saved; }catch(_){}
  setActiveTop(CURRENT_MODE);

  applyExpandState(); bindExpandButton(); showUserBar();

  await loadEmployees(); renderEmpDatalist();
  bindScanAndButtons(); bindOverlayControls();
  bindTableActions(); bindHeaderSelectAll(); bindFilterButtons();

  applyFilterChecked(); updateCheckedCount();
  await reload();
}
document.addEventListener('DOMContentLoaded', init);

/* ---------- chuyển tiếp COD_CONFIG khi form con yêu cầu ---------- */
window.addEventListener('message', (ev) => {
  if (ev.data && ev.data.type === 'request-cod-config') {
    const cfg = (typeof getConfig==='function' && getConfig('cod')) || window.COD_CONFIG || null;
    if (cfg) { ev.source?.postMessage({ type:'cod-config', config: cfg }, ev.origin || '*'); }
  }
});
