// ============================ map_tuyen_split.js ============================
// Bản đồ khách hàng — CSV công khai + lọc nhiều điều kiện + nhận query từ danh sách
// + Bảng cấu hình xổ xuống (lưu localStorage) + Nút chỉ đường (Google/Apple/Waze)
// ===========================================================================

/* ========= CỔNG QUYỀN (tùy biến, KHÔNG bắt buộc) =========
   - Nếu trang đã include auth_token.js: sẽ gọi checkAccess() nếu có.
   - Không có thì bỏ qua (không chặn), đúng yêu cầu "đừng đụng chỗ khác".
*/
(function softGate(){
  try { if (typeof window.checkAccess === 'function') window.checkAccess(); } catch(_) {}
})();

/* ========= CẤU HÌNH NGUỒN DỮ LIỆU ========= */
const CSV_URL =
  (window.getConfig?.('map')?.CSV_URL)
  || "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFLOQCFAQqdcQLP4Yxy0IAVk2f1GCs3nTpEdrITr5s47wOAdViQ3K0VkcQLQSRoLehUe8jFfXrvjkm/pub?output=csv";

/* ========= KHUNG VN & TÂM ========= */
const VN_BOX    = { latMin: 7, latMax: 25, lngMin: 100, lngMax: 112 };
const VN_CENTER = { lat: 16.05, lng: 108.2 };

/* ========= LƯU CẤU HÌNH ========= */
const MAP_CFG_KEY = 'MAP_TUYEN_CONFIG';
const DEFAULT_CFG = {
  markerSize: 'medium',   // small | medium | large
  mapTheme: 'light',      // light | dark | satellite
  autoFit: true,
  cluster: true,
  labelKH: true,
  tooltip: true,
  routeByNV: false,
  showDistance: true,
  colorByStatus: true,
  showRadius: false,
  radiusKm: 5
};
function loadMapCfg(){
  try{ return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(MAP_CFG_KEY)||'{}') }; }
  catch{ return { ...DEFAULT_CFG }; }
}
function saveMapCfg(cfg){
  try{ localStorage.setItem(MAP_CFG_KEY, JSON.stringify(cfg)); }catch{}
}
let mapCfg = loadMapCfg();

/* ========= MAP ========= */
const map = L.map('map', { preferCanvas:true }).setView([VN_CENTER.lat, VN_CENTER.lng], 6);

const TILE_LAYERS = {
  light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution:'© OpenStreetMap'
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, attribution: '© OpenStreetMap, © CARTO'
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles © Esri'
  })
};
let currentBase = null;
function setBase(theme){
  const t = TILE_LAYERS[theme] ? theme : 'light';
  if (currentBase) map.removeLayer(currentBase);
  currentBase = TILE_LAYERS[t];
  currentBase.addTo(map);
}
setBase(mapCfg.mapTheme);

// Nhóm marker: cluster hoặc layer thường
let GROUP = null;
function createGroup(){
  return (mapCfg.cluster && L.markerClusterGroup) ? L.markerClusterGroup() : L.layerGroup();
}
function rebuildGroup(){
  if (GROUP) { map.removeLayer(GROUP); }
  GROUP = createGroup();
  GROUP.addTo(map);
}
rebuildGroup();

const ROUTES = L.layerGroup().addTo(map); // vẽ tuyến
let RADIUS_LAYER = null;

const $status = document.getElementById('status');

/* ========= HELPERS ========= */
function esc(s){ return String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function inVN(lat,lng){ return lat>=VN_BOX.latMin && lat<=VN_BOX.latMax && lng>=VN_BOX.lngMin && lng<=VN_BOX.lngMax; }
function d2VN(lat,lng){ const dx=lat-VN_CENTER.lat, dy=lng-VN_CENTER.lng; return dx*dx+dy*dy; }

// Haversine (m) — dùng tính tổng quãng đường tuyến
function distM(a,b){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLng/2);
  const A=s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
  return 2*R*Math.atan2(Math.sqrt(A), Math.sqrt(1-A));
}

/* Đọc số thông minh */
function toNumSmart(x){
  if (typeof x === 'number') return x;
  if (x == null) return NaN;
  let s = String(x).trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g,'').replace(',', '.');
  s = s.replace(/[^\d\.\,\-]/g,'');
  if (s.includes('.') && s.includes(',')) { if (s.lastIndexOf(',') < s.lastIndexOf('.')) s = s.replace(/,/g,''); else s = s.replace(/\./g,'').replace(',', '.'); }
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n)? n : NaN;
}

/* Sửa toạ độ (đảo cột / chia e5/e6/e7) */
const SCALES = [1, 1e5, 1e6, 1e7];
function bestFix(latRaw, lngRaw){
  const a = toNumSmart(latRaw), b = toNumSmart(lngRaw);
  const cand = [];
  function push(lat,lng,label){
    if(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180){
      cand.push({lat:+lat.toFixed(6), lng:+lng.toFixed(6), inside:inVN(lat,lng), d2:d2VN(lat,lng), label});
    }
  }
  for (const k of SCALES){ push(a/k, b/k, `latlng_${k}`); push(b/k, a/k, `swap_${k}`); }
  if (!cand.length) return null;
  cand.sort((p,q)=> (p.inside!==q.inside) ? (q.inside?1:-1) : (p.d2-q.d2));
  return cand[0];
}

/* Parse CSV */
function parseCSV(text){
  if (window.Papa) {
    const parsed = Papa.parse(text, { header:true, skipEmptyLines:true });
    if (parsed.errors?.length) console.warn('Papa errors:', parsed.errors.slice(0,3));
    return parsed.data;
  }
  const rows = text.trim().split(/\r?\n/);
  const header = rows.shift().split(',').map(s=>s.trim());
  return rows.map(line=>{
    const cols = line.split(',');
    const obj = {}; for (let i=0;i<header.length;i++) obj[header[i]] = cols[i] ?? '';
    return obj;
  });
}

/* Tìm key theo alias */
function guessKey(obj, alts){
  const keys = Object.keys(obj);
  for (const name of alts){ const k = keys.find(k => k.toLowerCase().trim() === name); if (k) return k; }
  for (const name of alts){ const k = keys.find(k => k.toLowerCase().includes(name)); if (k) return k; }
  return null;
}

/* ========== STYLE MARKER ========== */
function markerRadius(){
  return mapCfg.markerSize==='small' ? 4 : mapCfg.markerSize==='large' ? 9 : 6;
}
function statusColor(s){
  const t = String(s||'').trim().toLowerCase();
  if (/thành công|đã giao|done/.test(t)) return '#10b981';
  if (/đang giao|shipping|in\s*progress/.test(t)) return '#3b82f6';
  if (/chờ|pending|chuẩn bị/.test(t)) return '#f59e0b';
  if (/hủy|fail|canceled/.test(t)) return '#ef4444';
  return '#1d4ed8';
}

/* ======= Directions helpers (Google/Apple/Waze) ======= */
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent || ''); }
function escForURL(s){ return encodeURIComponent(String(s||'')); }
/** Link mở điểm (place) trên Google Maps */
function linkViewOnGoogle(lat, lng, name=''){
  const q = `${lat},${lng}`;
  const label = name ? `&query_place_id=&query=${escForURL(name)} (${escForURL(q)})` : `&query=${escForURL(q)}`;
  return `https://www.google.com/maps/search/?api=1${label}`;
}
/** Link chỉ đường (driving) — origin = vị trí hiện tại */
function linkDirectionGoogle(lat, lng, name=''){
  const dest = `${lat},${lng}`;
  const pname = name ? `&destination_place_id=&destination=${escForURL(name)} (${escForURL(dest)})` : `&destination=${escForURL(dest)}`;
  return `https://www.google.com/maps/dir/?api=1${pname}&travelmode=driving`;
}
/** Apple Maps (iOS/macOS) */
function linkDirectionApple(lat, lng){
  return `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
}
/** Waze */
function linkDirectionWaze(lat, lng){
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
/** HTML nút chỉ đường */
function buildDirectionButtons(lat, lng, name=''){
  const gView = linkViewOnGoogle(lat,lng,name);
  const gDir  = linkDirectionGoogle(lat,lng,name);
  const aDir  = linkDirectionApple(lat,lng);
  const wDir  = linkDirectionWaze(lat,lng);

  const btnsIOS = `
    <a class="btn-nav" href="${aDir}" target="_blank" rel="noopener"> Apple Maps</a>
    <a class="btn-nav" href="${gDir}" target="_blank" rel="noopener">🧭 Google Maps</a>
    <a class="btn-nav" href="${wDir}" target="_blank" rel="noopener">🚗 Waze</a>
    <a class="btn-nav ghost" href="${gView}" target="_blank" rel="noopener">🔎 Xem trên Google Maps</a>
  `;
  const btnsDefault = `
    <a class="btn-nav" href="${gDir}" target="_blank" rel="noopener">🧭 Google Maps</a>
    <a class="btn-nav" href="${wDir}" target="_blank" rel="noopener">🚗 Waze</a>
    <a class="btn-nav" href="${aDir}" target="_blank" rel="noopener"> Apple Maps</a>
    <a class="btn-nav ghost" href="${gView}" target="_blank" rel="noopener">🔎 Xem trên Google Maps</a>
  `;
  return `<div class="nav-wrap">${isIOS() ? btnsIOS : btnsDefault}</div>`;
}

/* ======= CSS cho nút chỉ đường & label ======= */
(function injectNavStyles(){
  if (document.getElementById('mapNavStyles')) return;
  const css = `
    .nav-wrap{margin-top:6px; display:flex; flex-wrap:wrap; gap:6px}
    .btn-nav{padding:6px 10px; border-radius:8px; background:#2563eb; color:#fff;
             text-decoration:none; font-weight:600; font-size:12px; display:inline-block}
    .btn-nav:hover{background:#1d4ed8}
    .btn-nav.ghost{background:#eef2ff; color:#1e293b}
    .btn-nav.ghost:hover{background:#e0e7ff}
    .kh-label{background:transparent;border:none;color:#111;font-weight:700;text-shadow:0 0 3px rgba(255,255,255,.9)}
  `;
  const st = document.createElement('style'); st.id='mapNavStyles'; st.textContent = css;
  document.head.appendChild(st);
})();

/* ========== TẠO MARKER ========== */
function makeMarker(lat, lng, popupHtml, code, status){
  const color = mapCfg.colorByStatus ? statusColor(status) : '#1d4ed8';

  // lấy tên (nếu theo mẫu popup có <b>...</b>)
  const nameMatch = popupHtml.match(/<b>(.*?)<\/b>/i);
  const pName = nameMatch ? nameMatch[1].replace(/<[^>]*>/g,'') : (code || '');

  const navBtns = buildDirectionButtons(lat, lng, pName);
  const finalPopup = popupHtml + navBtns;

  const m = L.circleMarker([lat,lng], {
    radius: markerRadius(), weight: 1,
    color, fillColor: color, fillOpacity: 0.85
  }).bindPopup(finalPopup);

  if (mapCfg.tooltip) {
    const tip = (code ? `[${esc(code)}] ` : '') + popupHtml.replace(/<br>/g,' • ').replace(/<[^>]*>/g,'');
    m.bindTooltip(tip, { sticky:true, opacity:0.9 });
  }
  if (mapCfg.labelKH && code) {
    m.bindTooltip(String(code), { permanent:true, direction:'top', className:'kh-label', offset:[0,-markerRadius()-2] });
  }
  return m;
}

/* ========= NẠP CSV & VẼ ========= */
let RAW = []; // dữ liệu thô
let KEY = {}; // cache key cột

async function loadCSV(){
  $status.textContent='Đang tải dữ liệu…';
  GROUP.clearLayers();
  ROUTES.clearLayers();
  const resp = await fetch(CSV_URL + (CSV_URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache:'no-store' });
  if (!resp.ok) throw new Error('Không tải được CSV ('+resp.status+')');
  const text = await resp.text();
  if (!text || !/[,;\n]/.test(text)) throw new Error('CSV rỗng/không hợp lệ');
  RAW = parseCSV(text);
  if (!Array.isArray(RAW) || RAW.length===0) throw new Error('Không có dữ liệu');

  const sample = RAW[0];
  KEY.lat    = guessKey(sample, ['lat','latitude','vido','vi_do','vĩ độ','y','vi do']) || 'lat';
  KEY.lng    = guessKey(sample, ['lng','lon','longitude','kinhdo','kinh_do','kinh độ','x','kinh do']) || 'lng';
  KEY.ten    = guessKey(sample, ['ten','tên','name','khach']) || 'ten';
  KEY.ma     = guessKey(sample, ['ma_kh','makh','ma','mã']) || 'ma_kh';
  KEY.sdt    = guessKey(sample, ['sdt','so_dt','so_dien_thoai','dien_thoai','phone']) || 'sdt';
  KEY.dc     = guessKey(sample, ['dia_chi','địa chỉ','dia chi','address','addr']) || 'dia_chi';
  KEY.nv     = guessKey(sample, ['nv','nv_giao','nv_giao_hang','nhan_vien','nhanvien']) || null;
  KEY.status = guessKey(sample, ['trang_thai','trangthai','status','tinh_trang']) || null;

  renderFiltered();
}

/* ========= LỌC ========= */
/** Trả về object token: { ma, ten, sdt, dc, nv, tt, rKm, free } */
function parseQuery(q){
  q = (q||'').trim();
  const out = { ma:[], ten:[], sdt:[], dc:[], nv:[], tt:[], free:[], rKm:null };
  if (!q) return out;

  const pushVals = (arr, s)=> s.split(/[,\s]+/).map(x=>x.trim()).filter(Boolean).forEach(v=> arr.push(v.toLowerCase()));
  q.split(/\s+/).forEach(tok=>{
    const t = tok.trim();

    // thẻ mở: ma:/ten:/sdt:/dc:/nv:/tt:|status: / r:
    const open = t.match(/^(ma|ten|sdt|dc|nv|tt|status|r):$/i);
    if (open) { out._last = open[1].toLowerCase(); return; }

    const kv = t.match(/^(ma|ten|sdt|dc|nv|tt|status|r):(.*)$/i);
    if (kv) {
      const key = kv[1].toLowerCase();
      const val = kv[2];

      if (key === 'r') {
        // r: 5km | 3000m | 8
        const m = String(val).toLowerCase().match(/^(\d+(?:\.\d+)?)(km|m)?$/);
        if (m) {
          const num = parseFloat(m[1]);
          const unit = m[2] || 'km';
          out.rKm = unit === 'm' ? (num/1000) : num;
        }
      } else {
        const target = (key==='status' ? out.tt : out[key]);
        pushVals(target, val);
        out._last = key;
      }
    } else if (out._last) {
      if (out._last === 'r') {
        const m2 = t.toLowerCase().match(/^(\d+(?:\.\d+)?)(km|m)?$/);
        if (m2) {
          const num = parseFloat(m2[1]);
          const unit = m2[2] || 'km';
          out.rKm = unit === 'm' ? (num/1000) : num;
        }
      } else {
        const target = (out._last==='status' ? out.tt : out[out._last]);
        pushVals(target, t);
      }
    } else {
      out.free.push(t.toLowerCase());
    }
  });
  delete out._last;
  return out;
}

function renderFiltered(){
  GROUP.clearLayers();
  ROUTES.clearLayers();
  if (RADIUS_LAYER) { map.removeLayer(RADIUS_LAYER); RADIUS_LAYER = null; }

  const vnOnly = !!document.getElementById('vnOnly')?.checked;
  const qStr = document.getElementById('q')?.value || '';
  const Q = parseQuery(qStr);

  let count = 0;
  const bounds = L.latLngBounds();

  // tuyến: nhóm theo NV (nếu bật) hoặc một tuyến chung
  const routes = new Map(); // key -> array of {lat,lng}
  function pushRoute(key, p){ if (!routes.has(key)) routes.set(key, []); routes.get(key).push(p); }

  // nếu có lọc bán kính: tính theo tâm bản đồ hiện tại
  const centerForR = map.getCenter();
  const rLimitKm = (Q.rKm && Q.rKm>0) ? Q.rKm : null;

  for (const r of RAW){
    const fixed = bestFix(r[KEY.lat], r[KEY.lng]);
    if (!fixed) continue;
    if (vnOnly && !inVN(fixed.lat, fixed.lng)) continue;

    const name = (r[KEY.ten] || '').toString();
    const code = (r[KEY.ma]  || '').toString();
    const phone= (r[KEY.sdt] || '').toString();
    const addr = (r[KEY.dc]  || '').toString();
    const nv   = KEY.nv ? (r[KEY.nv] || '').toString() : '';
    const st   = KEY.status ? (r[KEY.status] || '').toString() : '';

    // Điều kiện lọc
    const text = (s)=> s.toString().toLowerCase();
    const matchGroup = (arr, val)=> !arr.length || arr.some(k => text(val).includes(k));

    // Free text: mở rộng thêm NV và trạng thái để tiện tìm
    const FREE_FIELDS = [code,name,phone,addr,nv,st];

    // Lọc theo bán kính nếu có r:
    let okRadius = true;
    if (rLimitKm){
      const d = distM({lat:centerForR.lat,lng:centerForR.lng}, {lat:fixed.lat,lng:fixed.lng}) / 1000.0;
      okRadius = (d <= rLimitKm);
    }

    const ok =
      okRadius &&
      matchGroup(Q.ma,  code) &&
      matchGroup(Q.ten, name) &&
      matchGroup(Q.sdt, phone) &&
      matchGroup(Q.dc,  addr) &&
      matchGroup(Q.nv,  nv)   &&
      matchGroup(Q.tt,  st)   &&
      (Q.free.length ? Q.free.every(k => FREE_FIELDS.some(v => text(v).includes(k))) : true);

    if (!ok) continue;

    const popup =
      `<b>${esc(name || 'Không tên')}</b>` +
      `<br>${esc(addr)}` +
      `${code?`<br><i>${esc(code)}</i>`:''}` +
      `${phone?`<br>${esc(phone)}`:''}` +
      `${nv?`<br>NV: ${esc(nv)}`:''}` +
      `${st?`<br>TT: ${esc(st)}`:''}`;

    makeMarker(fixed.lat, fixed.lng, popup, code, st).addTo(GROUP);
    bounds.extend([fixed.lat, fixed.lng]);
    count++;

    if (mapCfg.routeByNV && nv) pushRoute(nv, {lat:fixed.lat,lng:fixed.lng});
    else if (!mapCfg.routeByNV) pushRoute('_all_', {lat:fixed.lat,lng:fixed.lng});
  }

  // Vẽ tuyến & tính khoảng cách
  let totalKm = 0;
  const routeColor = (k)=> {
    const palette = ['#ef4444','#f59e0b','#10b981','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#22c55e','#a855f7','#14b8a6'];
    let hash = 0; for (let i=0;i<k.length;i++) hash = (hash*31 + k.charCodeAt(i))|0;
    return palette[Math.abs(hash)%palette.length];
  };
  for (const [key, pts] of routes.entries()){
    if (pts.length>=2){
      const latlngs = pts.map(p=> [p.lat, p.lng]);
      L.polyline(latlngs, { color:routeColor(key), weight:3, opacity:0.75 }).addTo(ROUTES);
      for (let i=1;i<pts.length;i++) totalKm += distM(pts[i-1], pts[i]);
    }
  }
  if (mapCfg.showDistance && totalKm>0){
    const km = (totalKm/1000).toFixed(2);
    $status.textContent = `Đã hiển thị ${count} điểm. Tổng quãng đường: ${km} km.`;
  } else {
    $status.textContent = count>0 ? `Đã hiển thị ${count} điểm.` : `Không có điểm phù hợp.`;
  }

  // Fit bounds nếu cần
  if (count>0 && L.latLngBounds && mapCfg.autoFit && bounds.isValid()) {
    map.fitBounds(bounds.pad(0.15));
  }

  // Vùng bao (radius visual)
  if (mapCfg.showRadius){
    const center = map.getCenter();
    RADIUS_LAYER = L.circle(center, { radius: mapCfg.radiusKm*1000, color:'#9333ea', weight:2, fillOpacity:0.08 });
    RADIUS_LAYER.addTo(map);
  }
}

/* ========= NHẬN QUERY TỪ URL / SESSION ========= */
function applyFilterFromURL(){
  const params = new URLSearchParams(location.search);
  let q = params.get('q');

  if (!q && location.hash.includes('use_session=1')) {
    try { q = sessionStorage.getItem('map_query') || ''; } catch {}
  }
  if (!q) {
    const ids = (params.get('ids') || '').split(',').map(s=>s.trim()).filter(Boolean);
    if (ids.length) q = 'ma: ' + ids.join(' ');
  }
  if (q) { const qInput = document.getElementById('q'); if (qInput) qInput.value = q; }
}

/* ========= BẢNG CẤU HÌNH (tự chèn HTML) ========= */
function injectConfigStyles(){
  if (document.getElementById('mapCfgStyles')) return;
  const css = `
  #mapConfigPanel{position:absolute;top:12px;right:12px;z-index:9999;background:rgba(255,255,255,.95);
    color:#111;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.15);font-family:system-ui;font-size:14px;padding:6px 10px;width:260px;}
  #mapConfigPanel .cfg-toggle{cursor:pointer;font-weight:600;user-select:none}
  #mapConfigPanel .cfg-body{margin-top:6px;display:flex;flex-direction:column;gap:6px}
  #mapConfigPanel .hidden{display:none}
  #mapConfigPanel label{display:flex;justify-content:space-between;align-items:center;gap:8px}
  #mapConfigPanel select, #mapConfigPanel input[type="number"]{padding:2px 6px; border:1px solid #e5e7eb; border-radius:6px;}
  #mapConfigPanel .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
  #cfgSave{margin-top:6px;padding:6px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer}
  #cfgSave:hover{background:#1d4ed8}
  `;
  const st = document.createElement('style'); st.id='mapCfgStyles'; st.textContent = css;
  document.head.appendChild(st);
}
function renderConfigPanel(){
  injectConfigStyles();
  const el = document.createElement('div');
  el.id = 'mapConfigPanel';
  el.innerHTML = `
    <div class="cfg-toggle">⚙️ Cấu hình bản đồ ▼</div>
    <div class="cfg-body hidden">
      <div class="row">
        <span>Cỡ marker</span>
        <select id="cfgMarkerSize">
          <option value="small">Nhỏ</option>
          <option value="medium">Trung bình</option>
          <option value="large">Lớn</option>
        </select>
      </div>
      <div class="row">
        <span>Loại nền</span>
        <select id="cfgTheme">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="satellite">Satellite</option>
        </select>
      </div>
      ${[
        ['autoFit','Tự động định tâm'],
        ['cluster','Hiển thị cụm điểm'],
        ['labelKH','Hiển thị label mã KH'],
        ['tooltip','Hiển thị tooltip khi hover'],
        ['routeByNV','Vẽ tuyến theo NV'],
        ['showDistance','Hiển thị khoảng cách tổng'],
        ['colorByStatus','Màu marker theo trạng thái'],
        ['showRadius','Hiển thị vùng bao (radius)']
      ].map(([k,label])=>`
        <label><span>${label}</span><input type="checkbox" id="cfg_${k}"></label>
      `).join('')}
      <div class="row" id="rowRadius">
        <span>Bán kính (km)</span>
        <input type="number" id="cfg_radiusKm" min="1" max="200" step="1" style="width:80px">
      </div>
      <button id="cfgSave">💾 Lưu cấu hình</button>
    </div>
  `;
  document.body.appendChild(el);

  // Toggle
  el.querySelector('.cfg-toggle').addEventListener('click',()=>{
    el.querySelector('.cfg-body').classList.toggle('hidden');
  });

  // Set initial values
  document.getElementById('cfgMarkerSize').value = mapCfg.markerSize;
  document.getElementById('cfgTheme').value = mapCfg.mapTheme;
  document.getElementById('cfg_autoFit').checked = mapCfg.autoFit;
  document.getElementById('cfg_cluster').checked = mapCfg.cluster;
  document.getElementById('cfg_labelKH').checked = mapCfg.labelKH;
  document.getElementById('cfg_tooltip').checked = mapCfg.tooltip;
  document.getElementById('cfg_routeByNV').checked = mapCfg.routeByNV;
  document.getElementById('cfg_showDistance').checked = mapCfg.showDistance;
  document.getElementById('cfg_colorByStatus').checked = mapCfg.colorByStatus;
  document.getElementById('cfg_showRadius').checked = mapCfg.showRadius;
  document.getElementById('cfg_radiusKm').value = mapCfg.radiusKm;
  document.getElementById('rowRadius').style.display = mapCfg.showRadius ? '' : 'none';

  // Show/hide radius input
  document.getElementById('cfg_showRadius').addEventListener('change', (e)=>{
    document.getElementById('rowRadius').style.display = e.target.checked ? '' : 'none';
  });

  // Save + apply
  document.getElementById('cfgSave').addEventListener('click', ()=>{
    const newCfg = {
      markerSize: document.getElementById('cfgMarkerSize').value,
      mapTheme: document.getElementById('cfgTheme').value,
      autoFit: document.getElementById('cfg_autoFit').checked,
      cluster: document.getElementById('cfg_cluster').checked,
      labelKH: document.getElementById('cfg_labelKH').checked,
      tooltip: document.getElementById('cfg_tooltip').checked,
      routeByNV: document.getElementById('cfg_routeByNV').checked,
      showDistance: document.getElementById('cfg_showDistance').checked,
      colorByStatus: document.getElementById('cfg_colorByStatus').checked,
      showRadius: document.getElementById('cfg_showRadius').checked,
      radiusKm: Math.max(1, Math.min(200, parseInt(document.getElementById('cfg_radiusKm').value,10) || DEFAULT_CFG.radiusKm))
    };
    mapCfg = newCfg;
    saveMapCfg(mapCfg);

    // Áp dụng: base layer + group + redraw
    setBase(mapCfg.mapTheme);
    rebuildGroup();
    renderFiltered();

    alert('✅ Đã lưu & áp dụng cấu hình.');
  });
}

/* ========= NHẬN QUERY & UI ========= */
function bindUI(){
  document.getElementById('reload')?.addEventListener('click', async ()=>{
    try{ await loadCSV(); }catch(e){ console.error(e); $status.textContent='Lỗi: '+(e.message||e); }
  });
  const q = document.getElementById('q'); q?.addEventListener('input', ()=> renderFiltered());
  document.getElementById('vnOnly')?.addEventListener('change', ()=> renderFiltered());

  // Khi di chuyển bản đồ & đang bật radius → cập nhật vòng tròn
  map.on('moveend', ()=>{
    if (mapCfg.showRadius){
      if (RADIUS_LAYER) { map.removeLayer(RADIUS_LAYER); RADIUS_LAYER=null; }
      const center = map.getCenter();
      RADIUS_LAYER = L.circle(center, { radius: mapCfg.radiusKm*1000, color:'#9333ea', weight:2, fillOpacity:0.08 }).addTo(map);
    }
    // Nếu đang dùng r: bán kính lọc theo tâm, thì di chuyển map → lọc lại
    const qStrNow = document.getElementById('q')?.value || '';
    if (/\br:/.test(qStrNow)) renderFiltered();
  });
}

/* ========= NÚT CHỈ ĐƯỜNG TỚI TÂM ========= */
(function addNavigateCenterControl(){
  const C = L.Control.extend({
    onAdd: function(){
      const btn = L.DomUtil.create('a','leaflet-bar');
      btn.href = '#'; btn.title = 'Chỉ đường tới tâm bản đồ';
      btn.style.background = '#fff';
      btn.style.width='34px'; btn.style.height='34px'; btn.style.lineHeight='34px';
      btn.style.textAlign='center'; btn.style.fontWeight='700'; btn.style.textDecoration='none';
      btn.innerHTML = '➡️';
      L.DomEvent.on(btn, 'click', (e)=>{
        L.DomEvent.stop(e);
        const c = map.getCenter();
        window.open(linkDirectionGoogle(c.lat, c.lng, 'Tâm bản đồ'), '_blank', 'noopener');
      });
      return btn;
    },
    onRemove: function(){}
  });
  map.addControl(new C({ position: 'topleft' }));
})();

/* ========= BOOTSTRAP ========= */
document.addEventListener('DOMContentLoaded', ()=>{
  bindUI();
  renderConfigPanel();
  applyFilterFromURL();
  document.getElementById('reload')?.click(); // nạp & lọc ngay
});
