/* ================= CẤU HÌNH KẾT NỐI ================= */
const TABLE = 'don_hang_kiot_cod';
let supa = null;

const CFG_CACHE_KEY = 'cod_cfg_cache_v3';
function setCfgState(msg,isOk){
  const el=document.getElementById('sbState');
  el.innerHTML='Supabase: '+(isOk?'<b style="color:#2dd4bf">sẵn sàng</b>':'<b style="color:#ff6b6b">'+msg+'</b>');
}

async function getSbConfig(){
  try{
    const raw = localStorage.getItem(CFG_CACHE_KEY);
    if(raw){ const c = JSON.parse(raw); if(c?.url && c?.anon) return c; }
  }catch(_){}
  const key = (typeof window.getInternalKey==='function') ? window.getInternalKey() : '';
  const r = await fetch('/api/getConfig', { headers: { 'x-internal-key': key } });
  if(!r.ok) throw new Error('Không lấy được config');
  const j = await r.json();
  if(!j.url || !j.anon) throw new Error('Thiếu url/anon');
  try{ localStorage.setItem(CFG_CACHE_KEY, JSON.stringify(j)); }catch(_){}
  return j;
}

/* ================= TIỆN ÍCH HIỂN THỊ ================= */
function statusClass(r){
  const id = String(r.id_tinh_trang ?? '').trim();
  const t  = String(r.trang_thai ?? '').toLowerCase();
  if(id==='1') return 'st-wait';
  if(id==='2') return 'st-cancel';
  if(id==='4') return 'st-ok';
  if(id==='3'||id==='5') return 'st-ship';
  if(t.includes('chờ xử lý')) return 'st-wait';
  if(t.includes('hủy')) return 'st-cancel';
  if(t.includes('thành công')||t.includes('đã giao')) return 'st-ok';
  if(t.includes('chờ giao')||t.includes('đang giao')) return 'st-ship';
  return 'st-other';
}
function shipClass(r){
  let code = String(r.ma_doi_tac ?? r.partner_code ?? r.ma_vc ?? '').toUpperCase().trim().replace(/[^A-Z0-9]/g,'');
  switch (code){ case 'SPX':return'vc-shopee'; case 'GHN':case'GHNFW':return'vc-ghn'; case'GHTK':return'vc-ghtk';
    case'BEST':return'vc-best'; case'VNP':return'vc-vnpost'; case'JT':case'JTFW':return'vc-jt'; case'NJV':case'NJVFW':return'vc-ninja'; default: break; }
  const txt=String(r.van_chuyen??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(txt.includes('shopee'))return'vc-shopee'; if(txt.includes('ghn'))return'vc-ghn'; if(txt.includes('ghtk'))return'vc-ghtk';
  if(txt.includes('best'))return'vc-best'; if(txt.includes('vnpost'))return'vc-vnpost'; if(txt.includes('j&t'))return'vc-jt'; if(txt.includes('ninja'))return'vc-ninja';
  return'vc-other';
}
const fmt=(d)=>{ if(!d) return ''; const dt=(d instanceof Date)?d:(/^\d{4}-\d{2}-\d{2}$/.test(d)?(()=>{const [y,m,day]=d.split('-').map(Number);return new Date(y,m-1,day)})():new Date(d)); if(isNaN(dt)) return ''; const p=n=>String(n).padStart(2,'0'); return `${p(dt.getDate())}-${p(dt.getMonth()+1)}-${dt.getFullYear()}`; };
function todayInput(){ const d=new Date(); const off=d.getTimezoneOffset()*60000; return new Date(d.getTime()-off).toISOString().slice(0,10); }

function saveWidths(){ const map={}; document.querySelectorAll('thead th').forEach(th=>map[th.dataset.key]=th.style.width||''); localStorage.setItem('cod_col_w', JSON.stringify(map)); }
function loadWidths(){ try{ const map=JSON.parse(localStorage.getItem('cod_col_w')||'{}'); document.querySelectorAll('thead th').forEach(th=>{ if(map[th.dataset.key]) th.style.width=map[th.dataset.key]; }); }catch(e){} }
function enableResize(){ document.querySelectorAll('thead th .drag').forEach(h=>{ const th=h.closest('th'); let x,w; h.addEventListener('mousedown',e=>{ x=e.clientX; w=th.offsetWidth; const mm=e2=>{ th.style.width=Math.max(80,w+(e2.clientX-x))+'px'; }; const mu=()=>{ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); saveWidths(); }; document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); }); }); }

function toDateStrFromInput(str){ if (!str) return null; let y,m,d; if (/^\d{4}-\d{2}-\d{2}$/.test(str)) [y,m,d]=str.split('-').map(Number); else if(/^\d{2}-\d{2}-\d{4}$/.test(str)) [d,m,y]=str.split('-').map(Number); else return null; const p=n=>String(n).padStart(2,'0'); return `${y}-${p(m)}-${p(d)}`; }
function toNextDateStrFromInput(str){ const ds = toDateStrFromInput(str); if(!ds) return null; const [y,m,d]=ds.split('-').map(Number); const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+1); const p=n=>String(n).padStart(2,'0'); return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}`; }
function ngayToSortable(v){ if(!v) return ''; if(typeof v==='string'){ if(/^\d{2}-\d{2}-\d{4}$/.test(v)){ const [d,m,y]=v.split('-').map(Number); const p=n=>String(n).padStart(2,'0'); return `${y}-${p(m)}-${p(d)}`; } return v.slice(0,10);} const p=n=>String(n).padStart(2,'0'); return `${v.getFullYear()}-${p(v.getMonth()+1)}-${p(v.getDate())}`; }

/* ================= BỘ LỌC & SẮP XẾP ================= */
let filters={ q:'', from:'', to:'', notClosed:true, onlyClosed:false, vc:'', tt:'', nv:'' };
let sort='ngay_desc';

const DATE_CANDIDATES = ['ngay','date','ngay_tao','created_at'];
let DATE_COL = null;
const STATUS_CANDIDATES = ['id_tinh_trang','id_trang_thai','trang_thai_id','trang_thai_code'];
let STATUS_COL = null;
let STATUS_IS_NUM = true;
const CLOSE_COL = 'ngay_dong_hang';
function orNullOrEmpty(col){ return `${col}.is.null,${col}.eq.%22%22`; }

function isTodaySelected(){
  const t = todayInput();
  const f = document.getElementById('from')?.value || '';
  const to = document.getElementById('to')?.value || '';
  return !!f && !!to && f === t && to === t;
}
function applyTodayFilter(){
  const t = todayInput();
  document.getElementById('from').value = t;
  document.getElementById('to').value   = t;
  filters.from = t; filters.to = t;
  filters.notClosed = true; filters.onlyClosed = false;
  document.getElementById('btnNotClosed').classList.add('brand','active');
  document.getElementById('btnClosed').classList.remove('brand','active');
}
function clearDateFilter(){
  const f=document.getElementById('from'), t=document.getElementById('to');
  if(f) f.value=''; if(t) t.value='';
  filters.from=''; filters.to='';
}

async function detectColumns(){
  for(const col of DATE_CANDIDATES){
    const { error } = await supa.from(TABLE).select(col).limit(1);
    if(!error){ DATE_COL = col; break; }
  }
  for(const col of STATUS_CANDIDATES){
    const { data, error } = await supa.from(TABLE).select(col).limit(1);
    if(!error){ STATUS_COL = col; STATUS_IS_NUM = (data?.[0] && typeof data[0][col]==='number'); break; }
  }
}
function addOpenStatusFilter(q){
  if(!STATUS_COL) return q;
  const OPEN_STATUSES = STATUS_IS_NUM ? [1,7] : ['1','7'];
  return q.in(STATUS_COL, OPEN_STATUSES);
}

/* ================= KHỞI TẠO ================= */
async function init(){
  try{
    const { url, anon } = await getSbConfig();
    supa = window.supabase.createClient(url, anon);
    setCfgState('sẵn sàng', true);
  }catch(e){
    setCfgState(e.message || 'lỗi cấu hình', false);
    return;
  }

  try{ await purgeOldClosed(); }catch(e){ console.warn('purge failed',e); }

  bindUI(); loadWidths(); enableResize();
  document.getElementById('btnNotClosed').classList.add('brand','active');

  await detectColumns();
  await reload(); setScannerSrc(); updateActiveVisuals();
}

/* ================= LIÊN KẾT UI ================= */
function bindUI(){
  document.getElementById('btnExpand').onclick=()=>{ document.querySelector('.wrap').style.maxWidth='100%'; };
  document.getElementById('btnResetWidth').onclick=()=>{ localStorage.removeItem('cod_col_w'); location.reload(); };

  document.getElementById('btnReload').onclick=()=>{
    filters={ q:'', from:'', to:'', notClosed:false, onlyClosed:false, vc:'', tt:'', nv:'' };
    sort='ngay_desc';
    ['q','from','to'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    ['f_vc','f_tt','f_nv'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('btnNotClosed').classList.remove('brand','active');
    document.getElementById('btnClosed').classList.remove('brand','active');
    reload(); updateActiveVisuals();
  };

  document.getElementById('btnToday').onclick=()=>{
    if(isTodaySelected()) clearDateFilter(); else applyTodayFilter();
    reload(); updateActiveVisuals();
  };

  const debounce=(fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  document.getElementById('q').oninput = debounce(()=>{ filters.q=document.getElementById('q').value.trim(); reload(); },300);
  document.getElementById('from').onchange=()=>{ filters.from=document.getElementById('from').value; reload(); updateActiveVisuals(); };
  document.getElementById('to').onchange  =()=>{ filters.to  =document.getElementById('to').value;   reload(); updateActiveVisuals(); };
  document.getElementById('sort').onchange=()=>{ sort=document.getElementById('sort').value; reload(); };

  document.getElementById('btnNotClosed').onclick=()=>{ 
    filters.notClosed=!filters.notClosed; 
    if(filters.notClosed){ filters.onlyClosed=false; document.getElementById('btnClosed').classList.remove('brand','active'); }
    document.getElementById('btnNotClosed').classList.toggle('brand',filters.notClosed);
    document.getElementById('btnNotClosed').classList.toggle('active',filters.notClosed);
    reload(); updateActiveVisuals();
  };
  document.getElementById('btnClosed').onclick=()=>{ 
    filters.onlyClosed=!filters.onlyClosed; 
    if(filters.onlyClosed){ filters.notClosed=false; document.getElementById('btnNotClosed').classList.remove('brand','active'); }
    document.getElementById('btnClosed').classList.toggle('brand',filters.onlyClosed);
    document.getElementById('btnClosed').classList.toggle('active',filters.onlyClosed);
    reload(); updateActiveVisuals();
  };

  const onSelChange = ()=>{ 
    filters.vc=document.getElementById('f_vc').value; 
    filters.tt=document.getElementById('f_tt').value; 
    filters.nv=document.getElementById('f_nv').value; 
    reload(); updateActiveVisuals(); 
  };
  document.getElementById('f_vc').onchange = onSelChange;
  document.getElementById('f_tt').onchange = onSelChange;
  document.getElementById('f_nv').onchange = onSelChange;

  const ov=document.getElementById('scanOverlay');
  document.getElementById('btnOpenScanner').onclick=()=>{ ov.style.display='flex'; };
  document.getElementById('scanClose').onclick=()=>{ ov.style.display='none'; };
  document.getElementById('scanOpenNew').onclick=()=>{ const src=document.getElementById('scanFrame').src; if(src) window.open(src,'_blank'); };

  // Ẩn nút "Cập nhật COD" nếu tồn tại (đã bỏ tính năng)
  const btnCap = document.getElementById('btnCapNhatCOD');
  if (btnCap) btnCap.style.display = 'none';
}

function updateActiveVisuals(){
  document.getElementById('btnToday').classList.toggle('active', isTodaySelected());
  document.getElementById('btnNotClosed').classList.toggle('active', !!filters.notClosed);
  document.getElementById('btnNotClosed').classList.toggle('brand',  !!filters.notClosed);
  document.getElementById('btnClosed').classList.toggle('active', !!filters.onlyClosed);
  document.getElementById('btnClosed').classList.toggle('brand',  !!filters.onlyClosed);
  ['f_vc','f_tt','f_nv'].forEach(id=>{ const el=document.getElementById(id); el.classList.toggle('active', !!el.value); });
}

/* ================= TẢI DỮ LIỆU ================= */
function inferDateKey(rows){
  if(!rows || !rows.length) return null;
  for(const k of ['ngay','date','ngay_tao','created_at']){ if(k in rows[0]) return k; }
  return null;
}
async function reload(){
  if(!supa) return;
  try{
    let q = supa.from(TABLE).select('*',{count:'exact'});

    if(filters.q){
      const s=filters.q.replace(/[%]/g,'').toLowerCase();
      q = q.or(`ma_vd.ilike.%${s}%,ten_kh.ilike.%${s}%,dia_chi.ilike.%${s}%`);
    }

    const lo = toDateStrFromInput(document.getElementById('from').value);
    const hi = toNextDateStrFromInput(document.getElementById('to').value);
    if (DATE_COL){
      if (lo) q = q.gte(DATE_COL, lo);
      if (hi) q = q.lt (DATE_COL, hi);
      q = (sort==='ngay_desc') ? q.order(DATE_COL, {ascending:false}) : q.order(DATE_COL, {ascending:true});
    }

    if (filters.notClosed){
      q = q.or(orNullOrEmpty(CLOSE_COL));
      q = addOpenStatusFilter(q);
    }
    if (filters.onlyClosed){
      q = q.not(CLOSE_COL,'is', null).neq(CLOSE_COL,'');
    }

    if(filters.vc) q = q.eq('van_chuyen', filters.vc);
    if(filters.tt) q = q.eq('trang_thai', filters.tt);
    if(filters.nv) q = q.eq('nv_ban', filters.nv);

    const { data, count } = await q.throwOnError().limit(1000);

    setCfgState('sẵn sàng',true);

    let rows = data || [];
    const dk = DATE_COL || inferDateKey(rows);
    const fromVal=document.getElementById('from').value, toVal=document.getElementById('to').value;
    if (dk && (fromVal || toVal)){
      const loS = lo || '0000-01-01', hiS = hi || '9999-12-31';
      rows = rows.filter(r=>{ const k=ngayToSortable(r[dk]); return (!lo || k>=loS) && (!hi || k<hiS); });
    }
    if (dk){
      if (sort==='ngay_desc') rows.sort((a,b)=>ngayToSortable(b[dk]).localeCompare(ngayToSortable(a[dk])));
      else                    rows.sort((a,b)=>ngayToSortable(a[dk]).localeCompare(ngayToSortable(b[dk])));
    }

    fillBody(rows, dk);
    updateFiltersFromData(rows);
    await updateRemainAll();
    updateSmallStat(rows.length, count ?? rows.length);
    updateActiveVisuals();

  }catch(error){
    console.error('[reload] query error:', error);
    setCfgState('query lỗi: '+(error?.message||'unknown'), false);
    fillBody([]); updateSmallStat(0,0); updateActiveVisuals();
  }
}

/* ================= RENDER ================= */
function fillBody(rows, dk){
  const tb=document.getElementById('tbody');
  if(!rows||!rows.length){ tb.innerHTML='<tr><td colspan="9" class="muted" style="text-align:center;padding:18px">Chưa có dữ liệu.</td></tr>'; return; }
  tb.innerHTML = rows.map(r=>`<tr>
    <td>${escapeHTML(r.ma_vd||'')}</td>
    <td>${fmt(dk? r[dk] : '')}</td>
    <td class="nowrap">${
      ((s)=>{ if (s==null) return ''; s = String(s).trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
        if (m){ const [,Y,M,D,H,Min]=m; return `${D}-${M}-${Y} <span class="hhmm">${H}:${Min}</span>`; }
        m = s.match(/^(\d{2})-(\d{2})-(\d{2,4})(?:[ T](\d{2}):(\d{2}))?/);
        if (m){ const [,D,M,YY,H='00',Min='00']=m; const Y = YY.length===2 ? `20${YY}` : YY; return `${D}-${M}-${Y} <span class="hhmm">${H}:${Min}</span>`; }
        return s; })(r['ngay_dong_hang'])
    }</td>
    <td>${escapeHTML(r.ten_kh||'')}</td>
    <td>${escapeHTML(r.dia_chi||'')}</td>
    <td><span class="${shipClass(r)}">${escapeHTML(r.van_chuyen||'')}</span></td>
    <td><span class="st ${statusClass(r)}">${escapeHTML(r.trang_thai||'')}</span></td>
    <td>${escapeHTML(r.kenh_ban||'')}</td>
    <td>${escapeHTML(r.nv_ban||'')}</td>
  </tr>`).join('');
}
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function updateFiltersFromData(rows){
  const vals = (k)=>[...new Set(rows.map(r=>r[k]).filter(Boolean))].sort((a,b)=>(''+a).localeCompare(''+b,'vi'));
  const fill=(id,arr)=>{ const el=document.getElementById(id); const keep=el.value;
    el.innerHTML='<option value="">Tất cả</option>'+arr.map(v=>`<option>${escapeHTML(v)}</option>`).join('');
    if(arr.includes(keep)) el.value=keep; else el.value='';
  };
  fill('f_vc', vals('van_chuyen')); fill('f_tt', vals('trang_thai')); fill('f_nv', vals('nv_ban'));
}

/* ================= THỐNG KÊ & DỌN DỮ LIỆU ================= */
async function updateRemainAll(){
  try{
    let q = supa.from(TABLE).select('ma_vd', { count: 'exact', head: true })
      .or(orNullOrEmpty('ngay_dong_hang'));
    q = addOpenStatusFilter(q);
    const { count, error } = await q;
    if (error) throw error;
    window.__remainAll = count || 0;
  }catch(e){
    console.warn('updateRemainAll:', e.message);
    window.__remainAll = 0;
  }
}
function updateSmallStat(loaded,total){
  const remain=window.__remainAll ?? 0;
  document.getElementById('smallStat').innerHTML=`Đã tải <b>${loaded}</b> bản ghi (tổng <b>${total}</b>) — Còn: <b class="danger">${remain}</b>`;
}
async function purgeOldClosed(){
  const cut=new Date(); cut.setMonth(cut.getMonth()-3);
  await supa.from(TABLE)
    .delete()
    .lt('ngay_dong_hang', cut.toISOString())
    .not('ngay_dong_hang','is',null)
    .neq('ngay_dong_hang','');
}

/* ================= SCANNER ================= */
function setScannerSrc(){
  const frame=document.getElementById('scanFrame');
  const candidates=['quet_ma_vd.html','./quet_ma_vd.html','data_cod_kiot/quet_ma_vd.html','./data_cod_kiot/quet_ma_vd.html','../data_cod_kiot/quet_ma_vd.html'];
  let i=0; function tryNext(){ if(i>=candidates.length) return; const url=candidates[i++]; frame.removeAttribute('src'); frame.src=url;
    let decided=false; const onLoad=()=>{ if(decided) return; decided=true; cleanup(); }; const onError=()=>{ if(decided) return; decided=true; cleanup(); tryNext(); };
    function cleanup(){ frame.removeEventListener('load',onLoad); frame.removeEventListener('error',onError); }
    frame.addEventListener('load',onLoad); frame.addEventListener('error',onError); setTimeout(()=>onError(),1200);
  } tryNext();
}
function focusMainSearch(){ const inp=document.getElementById('q'); if(inp){ inp.focus(); inp.select(); } }
function sendFocusToScanner(){ const fr=document.getElementById('scanFrame'); try{ fr.contentWindow?.postMessage({type:'focus-ma'}, '*'); }catch(e){} }
function openScanner(){ const ov=document.getElementById('scanOverlay'); const fr=document.getElementById('scanFrame'); if(!ov||!fr) return;
  if(!fr.src && typeof setScannerSrc==='function') setScannerSrc(); ov.style.display='flex';
  let n=0; const t=setInterval(()=>{ sendFocusToScanner(); if(++n>=20) clearInterval(t); },120);
  if(!fr.__boundLoad){ fr.__boundLoad=true; fr.addEventListener('load',()=>{ let k=0; const t2=setInterval(()=>{ sendFocusToScanner(); if(++k>=10) clearInterval(t2); },80); }); }
}
function closeScanner(){ const ov=document.getElementById('scanOverlay'); if(ov) ov.style.display='none'; setTimeout(focusMainSearch,0); }
document.getElementById('btnOpenScanner')?.addEventListener('click', openScanner);
document.getElementById('scanClose')?.addEventListener('click', closeScanner);
document.getElementById('scanOverlay')?.addEventListener('click', (e)=>{ if(e.target.id==='scanOverlay') closeScanner(); });
document.addEventListener('keydown', (e)=>{ if(e.key!=='Escape') return; const ov=document.getElementById('scanOverlay'); const open=ov && getComputedStyle(ov).display!=='none'; if(open) closeScanner(); else focusMainSearch(); });

/* ================= BOOT ================= */
document.addEventListener('DOMContentLoaded', init);
