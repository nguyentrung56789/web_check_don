// ============================ map_tuyen.js ============================
// CSV khách hàng + lọc + nhãn phường (từ địa chỉ)
// Base map Voyager (đường có màu) + overlay labels
// Popup: Tên KH, Địa chỉ, Điện thoại; Links: Apple Maps & Xem trên Google Maps
// Toolbar: reload, định vị 📍, theo dõi 👁️ (căn giữa), điều hướng tới tâm
// Cấu hình: đổi là áp dụng ngay, chỉ lưu khi bấm "Lưu cấu hình"
// Supabase: ghi vị trí nếu có SDK/endpoint
// Đánh số thứ tự theo độ gần vị trí của tôi (cập nhật realtime)
// Nhãn tên KH nhỏ (chữ thường) chỉ hiện khi ở gần/zoom lớn
// (ĐÃ BỎ): Tô màu phường từ GeoJSON
// =====================================================================

(function softGate(){ try { if (typeof window.checkAccess === 'function') window.checkAccess(); } catch(_) {} })();

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
  markerSize: 'medium',     // small | medium | large
  mapTheme: 'voyager',      // voyager | light | dark | satellite
  autoFit: true,
  cluster: true,
  labelKH: false,
  tooltip: true,
  routeByNV: false,
  showDistance: true,
  colorByStatus: false,
  showRadius: false,
  radiusKm: 5
};
function loadMapCfg(){ try{ return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(MAP_CFG_KEY)||'{}') }; }catch{ return { ...DEFAULT_CFG }; } }
function saveMapCfg(cfg){ try{ localStorage.setItem(MAP_CFG_KEY, JSON.stringify(cfg)); }catch{} }
let mapCfg = loadMapCfg();

/* ========= MAP & TILES ========= */
const map = L.map('map', { preferCanvas:true }).setView([VN_CENTER.lat, VN_CENTER.lng], 6);

const TILE_LAYERS = {
  voyager:  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',{ maxZoom:20, attribution:'© OpenStreetMap, © CARTO' }),
  light:    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',{ maxZoom:20, attribution:'© OpenStreetMap, © CARTO' }),
  dark:     L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{ maxZoom:20, attribution:'© OpenStreetMap, © CARTO' }),
  satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{ maxZoom:19, attribution:'Tiles © Esri' })
};
const LABEL_LAYERS = {
  voyager:  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',{ maxZoom:20 }),
  light:    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',{ maxZoom:20 }),
  dark:     L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',{ maxZoom:20 }),
  satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{ maxZoom:19, opacity:.9 })
};
let currentBase=null, labelOverlay=null;
function setLabels(theme){ const t = LABEL_LAYERS[theme] ? theme : 'voyager'; if (labelOverlay) map.removeLayer(labelOverlay); labelOverlay = LABEL_LAYERS[t]; labelOverlay.addTo(map); }
function setBase(theme){ const t = TILE_LAYERS[theme] ? theme : 'voyager'; if (currentBase) map.removeLayer(currentBase); currentBase = TILE_LAYERS[t]; currentBase.addTo(map); setLabels(t); }
setBase(mapCfg.mapTheme);

// tăng “màu” nhẹ cho nền
(function(){ const st=document.createElement('style'); st.textContent='#map .leaflet-tile-pane{filter:saturate(1.15) contrast(1.05);}'; document.head.appendChild(st); })();

/* ========= LAYERS ========= */
let GROUP=null; function createGroup(){ return (mapCfg.cluster && L.markerClusterGroup)? L.markerClusterGroup() : L.layerGroup(); }
function rebuildGroup(){ if(GROUP) map.removeLayer(GROUP); GROUP=createGroup(); GROUP.addTo(map); }
rebuildGroup();

const ROUTES       = L.layerGroup().addTo(map);
const WARD_LABELS  = L.layerGroup().addTo(map);  // nhãn phường suy từ điểm (vẫn giữ)
const NEAR_LABELS  = L.layerGroup().addTo(map);  // tên KH chữ thường khi ở gần
let RADIUS_LAYER=null;

const $status = document.getElementById('status');

/* ========= Toolbar ========= */
(function(){
  if (document.getElementById('tbFix')) return;
  const st=document.createElement('style'); st.id='tbFix';
  st.textContent = `
    .custom-toolbar button{width:34px;height:34px;border:0;background:#fff;cursor:pointer;border-radius:6px;
      display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.12)}
    .custom-toolbar button + button{margin-left:2px}
    .poi{width:24px;height:24px;border-radius:999px;background:#0ea5e9;color:#fff;display:flex;align-items:center;justify-content:center;
      border:1px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25);font-weight:400;font-size:10px}
    .name-near{
      background:transparent;border:none;color:#222;font-size:11px;font-weight:600;
      text-shadow:0 0 3px rgba(255,255,255,.95), 0 0 6px rgba(255,255,255,.9);
      text-transform: lowercase;
    }
    .ward-text{font-weight:900;font-size:14px;white-space:nowrap;pointer-events:none;
      -webkit-text-stroke:2px #fff;text-stroke:2px #fff;text-shadow:0 0 3px #fff,0 0 6px #fff,0 0 10px rgba(255,255,255,.8)}
  `;
  document.head.appendChild(st);
})();
const Toolbar = L.Control.extend({
  onAdd: function(){
    const div=L.DomUtil.create('div','leaflet-bar leaflet-control custom-toolbar');
    div.innerHTML=`
      <button id="reload" title="Tải lại dữ liệu">🔄</button>
      <button id="btnMyLocation" title="Vị trí của tôi">📍</button>
      <button id="btnFollow" title="Bám theo chấm đỏ" style="opacity:1">👁️</button>`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  }
});
map.addControl(new Toolbar({ position:'topleft' }));
setTimeout(()=>{
  document.getElementById('reload')?.addEventListener('click', async ()=>{ try{ await loadCSV(); }catch(e){ $status.textContent='Lỗi: '+(e.message||e); } });
  document.getElementById('btnMyLocation')?.addEventListener('click', async ()=>{
    const nv=getNVFromStorage(); const ma_nv=nv?.ma_nv||localStorage.getItem('ma_nv')||prompt('Nhập mã nhân viên:');
    if(!ma_nv) return alert('Thiếu mã nhân viên.'); localStorage.setItem('ma_nv',ma_nv); localStorage.setItem('my_loc_auto','1'); startMyLocation(ma_nv);
  });
  document.getElementById('btnFollow')?.addEventListener('click',()=>{ FOLLOW_MY_DOT=!FOLLOW_MY_DOT; document.getElementById('btnFollow').style.opacity=FOLLOW_MY_DOT?'1':'.55'; });
},400);

/* ========= Helpers ========= */
function esc(s){ return String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function inVN(lat,lng){ return lat>=VN_BOX.latMin && lat<=VN_BOX.latMax && lng>=VN_BOX.lngMin && lng<=VN_BOX.lngMax; }
function d2VN(lat,lng){ const dx=lat-VN_CENTER.lat, dy=lng-VN_CENTER.lng; return dx*dx+dy*dy; }
function distM(a,b){ const R=6371000,toRad=x=>x*Math.PI/180; const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng); const s1=Math.sin(dLat/2),s2=Math.sin(dLng/2); const A=s1*s1+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2; return 2*R*Math.atan2(Math.sqrt(A),Math.sqrt(1-A)); }
function toNumSmart(x){ if(typeof x==='number')return x; if(x==null)return NaN; let s=String(x).trim(); if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',', '.'); s=s.replace(/[^\d\.\,\-]/g,''); if(s.includes('.')&&s.includes(',')){ if(s.lastIndexOf(',')<s.lastIndexOf('.')) s=s.replace(/,/g,''); else s=s.replace(/\./g,'').replace(',', '.'); } else if(s.includes(',')) s=s.replace(',', '.'); const n=Number(s); return Number.isFinite(n)?n:NaN; }
const SCALES=[1,1e5,1e6,1e7];
function bestFix(latRaw,lngRaw){ const a=toNumSmart(latRaw),b=toNumSmart(lngRaw); const cand=[]; function push(lat,lng){ if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180){ cand.push({lat:+lat.toFixed(6),lng:+lng.toFixed(6),inside:inVN(lat,lng),d2:d2VN(lat,lng)}); } }
for(const k of SCALES){ push(a/k,b/k); push(b/k,a/k); } if(!cand.length) return null; cand.sort((p,q)=>(p.inside!==q.inside)?(q.inside?1:-1):(p.d2-q.d2)); return cand[0]; }
function titleCaseKeepAcr(s){ const t=s.replace(/\s+/g,' ').trim().replace(/^[\-\–\—\·]+|[\-\–\—\·]+$/g,''); return t.split(' ').filter(Boolean).map(w=>{ if(w===w.toUpperCase()&&w.length<=4) return w; return w[0]?w[0].toUpperCase()+w.slice(1).toLowerCase():w; }).join(' '); }

/* ===== Links (Apple + Xem Google) ===== */
function escForURL(s){ return encodeURIComponent(String(s||'')); }
function linkViewOnGoogle(lat,lng,name=''){ const q=`${lat},${lng}`; const label=name?`&query_place_id=&query=${escForURL(name)} (${escForURL(q)})`:`&query=${escForURL(q)}`; return `https://www.google.com/maps/search/?api=1${label}`; }
function linkDirectionApple(lat,lng){ return `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`; }
function buildViewLinks(lat,lng,name=''){ const gView=linkViewOnGoogle(lat,lng,name), aDir=linkDirectionApple(lat,lng); return `<div class="nav-links" style="margin-top:6px;font-weight:600;"><a href="${aDir}" target="_blank" rel="noopener"> Apple Maps</a> · <a href="${gView}" target="_blank" rel="noopener">🔎 Xem trên Google Maps</a></div>`; }

/* ========= Marker (divIcon có số lồng trong) ========= */
function markerRadius(){ return mapCfg.markerSize==='small'?22:mapCfg.markerSize==='large'?28:24; }
function makeNumIcon(num, color='#0ea5e9'){
  const sz = markerRadius();
  return L.divIcon({
    className:'',
    html:`<div class="poi" style="background:${color};width:${sz}px;height:${sz}px;font-size:${Math.max(11,Math.round(sz*0.5))}px">${num||''}</div>`,
    iconSize:[sz,sz],
    iconAnchor:[sz/2,sz/2],
    popupAnchor:[0,-sz/2]
  });
}
function colorForStatus(st=''){
  const s = st.toString().toLowerCase();
  if (!mapCfg.colorByStatus) return '#0ea5e9';
  if (s.includes('mới') || s.includes('new')) return '#22c55e';
  if (s.includes('đang') || s.includes('ship')) return '#f59e0b';
  if (s.includes('hủy') || s.includes('cancel')) return '#ef4444';
  if (s.includes('trả') || s.includes('return')) return '#8b5cf6';
  return '#0ea5e9';
}
let MARKERS_DATA=[]; // {marker,lat,lng,name,addr,phone,status,rank}

/* ========= CSV & render ========= */
let RAW=[]; let KEY={};
let csvCtrl = null;

async function loadCSV(){
  if (csvCtrl) { csvCtrl.abort(); }
  csvCtrl = new AbortController();
  const sig = csvCtrl.signal;

  $status.textContent='Đang tải dữ liệu…';
  GROUP.clearLayers(); ROUTES.clearLayers(); WARD_LABELS.clearLayers(); NEAR_LABELS.clearLayers(); MARKERS_DATA=[];
  const resp=await fetch(CSV_URL+(CSV_URL.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store', signal:sig}); if(!resp.ok) throw new Error('Không tải được CSV ('+resp.status+')');
  const text=await resp.text(); if(sig.aborted) return;
  if(!text||!/[,;\n]/.test(text)) throw new Error('CSV rỗng/không hợp lệ');
  const parsed = parseCSV(text);
  RAW = parsed; if(!Array.isArray(RAW)||RAW.length===0) throw new Error('Không có dữ liệu');

  const s=RAW[0];
  KEY.lat=guessKey(s,['lat','latitude','vido','vi_do','vĩ độ','y','vi do'])||'lat';
  KEY.lng=guessKey(s,['lng','lon','longitude','kinhdo','kinh_do','kinh độ','x','kinh do'])||'lng';
  KEY.ten=guessKey(s,['ten','tên','name','khach'])||'ten';
  KEY.ma =guessKey(s,['ma_kh','makh','ma','mã'])||'ma_kh';
  KEY.sdt=guessKey(s,['sdt','so_dt','so_dien_thoai','dien_thoai','phone'])||'sdt';
  KEY.dc =guessKey(s,['dia_chi','địa chỉ','dia chi','address','addr'])||'dia_chi';
  KEY.nv =guessKey(s,['nv','nv_giao','nv_giao_hang','nhan_vien','nhanvien'])||null;
  KEY.status=guessKey(s,['trang_thai','trangthai','status','tinh_trang'])||null;

  renderFiltered();
}
function parseCSV(text){
  if(!window.Papa) throw new Error('Thiếu PapaParse – vui lòng import CDN trước file này.');
  const parsed=Papa.parse(text,{header:true,skipEmptyLines:true,dynamicTyping:false});
  if (parsed.errors?.length) console.warn('Papa errors:', parsed.errors.slice(0,3));
  return parsed.data;
}
function guessKey(obj,alts){ const keys=Object.keys(obj); for(const name of alts){ const k=keys.find(k=>k.toLowerCase().trim()===name); if(k) return k; } for(const name of alts){ const k=keys.find(k=>k.toLowerCase().includes(name)); if(k) return k; } return null; }

/* ======== bóc tên phường từ địa chỉ (ward label) ======== */
function extractWard(addr){
  if(!addr) return '';
  const raw=String(addr).replace(/\s+/g,' ').trim();
  const re=/\b(Phường|P\.?|Xã|X\.?|Thị\s*trấn|TT\.?)\s*([A-Za-zÀ-ỹ0-9\- ]+?)(?=,|\.|;|\/|$)/i;
  const m=raw.match(re);
  if(m){ let w=m[2].trim(); w=w.replace(/\b(Quận|Q\.?|Huyện|H\.?|TP|T\.P\.|Tỉnh)\b.*$/i,'').trim();
    return w.split(' ').filter(Boolean).map(s=>s[0]?s[0].toUpperCase()+s.slice(1):s).join(' ');
  }
  const wardKeys=['Phường','P.','P ','P-','P,','Xã','X.','X ','Thị trấn','TT.','TT '];
  const parts=raw.split(/[,.;/]/).map(s=>s.trim()).filter(Boolean);
  for(const p of parts){ for(const key of wardKeys){ const idx=p.toLowerCase().indexOf(key.toLowerCase()); if(idx===0){ let w=p.slice(key.length).trim();
        w=w.replace(/\b(Quận|Q\.?|Huyện|H\.?|TP|T\.P\.|Tỉnh)\b.*$/i,'').trim();
        if(w) return w.split(' ').map(s=>s[0]?s[0].toUpperCase()+s.slice(1):s).join(' ');
  }}}
  return '';
}

/* ========= PARSE QUERY ========= */
function parseQuery(q){
  q=(q||'').trim(); const out={ ma:[],ten:[],sdt:[],dc:[],nv:[],tt:[],free:[],rKm:null }; if(!q) return out;
  const pushVals=(arr,s)=> s.split(/[,\s]+/).map(x=>x.trim()).filter(Boolean).forEach(v=>arr.push(v.toLowerCase()));
  q.split(/\s+/).forEach(tok=>{
    const t=tok.trim(), open=t.match(/^(ma|ten|sdt|dc|nv|tt|status|r):$/i); if(open){ out._last=open[1].toLowerCase(); return; }
    const kv=t.match(/^(ma|ten|sdt|dc|nv|tt|status|r):(.*)$/i);
    if(kv){ const key=kv[1].toLowerCase(), val=kv[2]; if(key==='r'){ const m=String(val).toLowerCase().match(/^(\d+(?:\.\d+)?)(km|m)?$/); if(m){ const num=parseFloat(m[1]); const unit=m[2]||'km'; out.rKm=unit==='m'?(num/1000):num; } }
      else { const target=(key==='status'?out.tt:out[key]); pushVals(target,val); out._last=key; }
    } else if(out._last){ if(out._last==='r'){ const m2=t.toLowerCase().match(/^(\d+(?:\.\d+)?)(km|m)?$/); if(m2){ const num=parseFloat(m2[1]); const unit=m2[2]||'km'; out.rKm=unit==='m'?(num/1000):num; } }
      else { const target=(out._last==='status'?out.tt:out[out._last]); pushVals(target,t); }
    } else out.free.push(t.toLowerCase());
  });
  delete out._last; return out;
}

/* ========= VẼ NHÃN PHƯỜNG (từ điểm) ========= */
function renderWardLabelsFromPoints(wardAgg){
  WARD_LABELS.clearLayers();
  for(const [ward,info] of wardAgg.entries()){
    if(!ward) continue;
    const lat=info.sumLat/info.cnt, lng=info.sumLng/info.cnt, color=`hsl(${(ward.length*37)%360} 80% 45%)`;
    const html=`<div class="ward-text" style="color:${color}">${esc(ward)}</div>`;
    const icon=L.divIcon({className:'',html,iconSize:null});
    L.marker([lat,lng],{icon}).addTo(WARD_LABELS);
  }
}

/* ========= RENDER/FILTER ========= */
function renderFiltered(){
  GROUP.clearLayers(); ROUTES.clearLayers(); WARD_LABELS.clearLayers(); NEAR_LABELS.clearLayers(); MARKERS_DATA=[];
  if (RADIUS_LAYER){ map.removeLayer(RADIUS_LAYER); RADIUS_LAYER=null; }

  const vnOnly=!!document.getElementById('vnOnly')?.checked;
  const Q=parseQuery(document.getElementById('q')?.value||'');
  let count=0; const bounds=L.latLngBounds(); const routes=new Map();
  function pushRoute(key,p){ if(!routes.has(key)) routes.set(key,[]); routes.get(key).push(p); }
  const centerForR=map.getCenter(); const rLimitKm=(Q.rKm&&Q.rKm>0)?Q.rKm:null;
  const wardAgg=new Map();

  for(const r of RAW){
    const fixed=bestFix(r[KEY.lat],r[KEY.lng]); if(!fixed) continue; if(vnOnly && !inVN(fixed.lat,fixed.lng)) continue;
    const name=titleCaseKeepAcr((r[KEY.ten]||'').toString());
    const code=(r[KEY.ma]||'').toString();
    const phone=(r[KEY.sdt]||'').toString();
    const addr=(r[KEY.dc]||'').toString();
    const nv=KEY.nv?(r[KEY.nv]||'').toString():'';
    const st=KEY.status?(r[KEY.status]||'').toString():'';

    const text=(s)=>s.toString().toLowerCase();
    const matchGroup=(arr,val)=>!arr.length||arr.some(k=>text(val).includes(k));

    let okRadius=true;
    if(rLimitKm){ const d=distM({lat:centerForR.lat,lng:centerForR.lng},{lat:fixed.lat,lng:fixed.lng})/1000; okRadius=(d<=rLimitKm); }

    const ok = okRadius && matchGroup(Q.ma,code) && matchGroup(Q.ten,name) && matchGroup(Q.sdt,phone)
             && matchGroup(Q.dc,addr) && matchGroup(Q.nv,nv) && matchGroup(Q.tt,st)
             && (Q.free.length? Q.free.every(k=>[code,name,phone,addr,nv,st].some(v=>text(v).includes(k))) : true);
    if(!ok) continue;

    const color = colorForStatus(st);
    const m=L.marker([fixed.lat,fixed.lng],{icon:makeNumIcon('', color)})
      .bindPopup(`<b>${esc(name||'Không tên')}</b><br>${esc(addr)}${phone?`<br>${esc(phone)}`:''}${buildViewLinks(fixed.lat,fixed.lng,name)}`);
    if(mapCfg.tooltip){ m.bindTooltip(`${name||''} • ${addr||''}${phone?` • ${phone}`:''}`,{sticky:true,opacity:.9}); }
    if(mapCfg.labelKH && code){ m.bindTooltip(String(code),{permanent:true,direction:'top',className:'kh-label',offset:[0,-(markerRadius()/2)-2]}); }
    m.addTo(GROUP);

    MARKERS_DATA.push({ marker:m, lat:fixed.lat, lng:fixed.lng, name, addr, phone, status:st, rank:0 });
    bounds.extend([fixed.lat,fixed.lng]); count++;

    const ward=extractWard(addr);
    if(ward){ const w=wardAgg.get(ward)||{sumLat:0,sumLng:0,cnt:0}; w.sumLat+=fixed.lat; w.sumLng+=fixed.lng; w.cnt++; wardAgg.set(ward,w); }

    if(mapCfg.routeByNV && nv) pushRoute(nv,{lat:fixed.lat,lng:fixed.lng});
    else if(!mapCfg.routeByNV) pushRoute('_all_',{lat:fixed.lat,lng:fixed.lng});
  }

  renderWardLabelsFromPoints(wardAgg);

  if(count>0 && L.latLngBounds && mapCfg.autoFit && bounds.isValid()) map.fitBounds(bounds.pad(0.15));
  if(mapCfg.showRadius){ const c=map.getCenter(); RADIUS_LAYER=L.circle(c,{radius:mapCfg.radiusKm*1000,color:'#9333ea',weight:2,fillOpacity:.08}).addTo(map); }

  $status.textContent = count>0 ? `Đã hiển thị ${count} điểm.` : `Không có điểm phù hợp.`;

  updateNearestNumbers();
  updateProximityLabels();

  // vẽ tuyến & tổng khoảng cách
  drawRoutes(routes);
}

/* ========= Nhãn gần (tên KH chữ thường) ========= */
const NEAR_M = 250;
const NEAR_M_ZOOM_BONUS = 600;
function updateProximityLabels(){
  NEAR_LABELS.clearLayers();
  const useZoom = map.getZoom() >= 16;
  const ref = MY_MARKER ? MY_MARKER.getLatLng() : map.getCenter();

  for (const it of MARKERS_DATA){
    const d = distM(ref, {lat:it.lat, lng:it.lng});
    const show = (d <= NEAR_M) || (useZoom && d <= NEAR_M_ZOOM_BONUS);
    if (show){
      const tip = L.tooltip({
          permanent:true, direction:'right', className:'name-near',
          offset:[Math.round(markerRadius()/2)+6,0]
        })
        .setLatLng([it.lat,it.lng])
        .setContent(esc((it.name || '').toLowerCase()));
      NEAR_LABELS.addLayer(tip);
    }
  }
}

/* ========= Đánh số gần nhất (thay icon số) ========= */
function updateNearestNumbers(){
  if (MARKERS_DATA.length===0) return;
  const ref = MY_MARKER ? MY_MARKER.getLatLng() : map.getCenter();
  const arr = MARKERS_DATA.map((it, idx)=>({ idx, d: distM(ref, {lat:it.lat, lng:it.lng}) }));
  arr.sort((a,b)=>a.d-b.d);
  for (let i=0;i<arr.length;i++){
    const it = MARKERS_DATA[arr[i].idx];
    it.rank = i+1;
    const c = colorForStatus(it.status);
    it.marker.setIcon(makeNumIcon(i+1, c));
  }
}

/* ========= Vẽ tuyến & tổng quãng đường ========= */
function drawRoutes(routes){
  ROUTES.clearLayers();
  let total = 0;
  const colors = {};
  const getColor = key => (colors[key] ||= `hsl(${(key.length*53)%360} 85% 45%)`);

  for (const [key, pts] of routes.entries()){
    if (pts.length < 2) continue;
    const latlngs = pts.map(p => [p.lat, p.lng]);
    for (let i=1; i<pts.length; i++) total += distM(pts[i-1], pts[i]);
    L.polyline(latlngs, { color:getColor(key), weight:3, opacity:0.8 }).addTo(ROUTES);
  }
  if (mapCfg.showDistance){
    const km = (total/1000).toFixed(1);
    $status.textContent += ` • Tổng quãng đường: ${km} km`;
  }
}

/* ========= URL filter & config ========= */
function applyFilterFromURL(){
  const params=new URLSearchParams(location.search);
  let q=params.get('q');
  if(!q && location.hash.includes('use_session=1')){
    try{ q=sessionStorage.getItem('map_query')||''; }catch{}
  }
  if(!q){
    const ids=(params.get('ids')||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(ids.length) q='ma: '+ids.join(' ');
  }
  if(q){
    const qInput=document.getElementById('q');
    if(qInput) qInput.value=q;
  }
}

function injectConfigStyles(){ if(document.getElementById('mapCfgStyles')) return; const css = `
  #mapConfigPanel{position:absolute;top:12px;right:12px;z-index:9999;background:rgba(255,255,255,.9);backdrop-filter:blur(6px);
  color:#111;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.16);font-family:system-ui;font-size:13px;padding:4px 6px;width:210px;}
  #mapConfigPanel .cfg-toggle{cursor:pointer;font-weight:700;user-select:none;font-size:16px;text-align:right}
  #mapConfigPanel .cfg-body{margin-top:6px;display:flex;flex-direction:column;gap:6px} #mapConfigPanel .hidden{display:none}
  #mapConfigPanel label{display:flex;justify-content:space-between;align-items:center;gap:8px}
  #mapConfigPanel select,#mapConfigPanel input[type="number"]{padding:2px 6px;border:1px solid #e5e7eb;border-radius:6px;}
  #mapConfigPanel .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
  #cfgSave{margin-top:6px;padding:6px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer}
  #cfgSave:hover{background:#1d4ed8}`; const st=document.createElement('style'); st.id='mapCfgStyles'; st.textContent=css; document.head.appendChild(st); }

function renderConfigPanel(){
  injectConfigStyles();
  const el=document.createElement('div'); el.id='mapConfigPanel';
  el.innerHTML=`
    <div class="cfg-toggle" title="Cấu hình">⚙️</div>
    <div class="cfg-body hidden">
      <div class="row"><span>Cỡ marker</span>
        <select id="cfgMarkerSize"><option value="small">Nhỏ</option><option value="medium">Trung bình</option><option value="large">Lớn</option></select>
      </div>
      <div class="row"><span>Loại nền</span>
        <select id="cfgTheme"><option value="voyager">Voyager (color roads)</option><option value="light">Light</option><option value="dark">Dark</option><option value="satellite">Satellite</option></select>
      </div>
      ${[
        ['autoFit','Tự động định tâm'],['cluster','Hiển thị cụm điểm'],['labelKH','Hiển thị label mã KH'],['tooltip','Hiển thị tooltip khi hover'],
        ['routeByNV','Vẽ tuyến theo NV'],['showDistance','Hiển thị khoảng cách tổng'],['colorByStatus','Màu marker theo trạng thái'],['showRadius','Hiển thị vùng bao (radius)']
      ].map(([k,l])=>`<label><span>${l}</span><input type="checkbox" id="cfg_${k}"></label>`).join('')}
      <div class="row" id="rowRadius"><span>Bán kính (km)</span><input type="number" id="cfg_radiusKm" min="1" max="200" step="1" style="width:80px"></div>
      <button id="cfgSave">💾 Lưu cấu hình</button>
    </div>`;
  document.body.appendChild(el);

  const $body=el.querySelector('.cfg-body');
  el.querySelector('.cfg-toggle').addEventListener('click',()=>{ $body.classList.toggle('hidden'); });

  const setUI=()=>{ 
    cfg('cfgMarkerSize',mapCfg.markerSize); cfg('cfgTheme',mapCfg.mapTheme);
    chk('cfg_autoFit',mapCfg.autoFit); chk('cfg_cluster',mapCfg.cluster); chk('cfg_labelKH',mapCfg.labelKH);
    chk('cfg_tooltip',mapCfg.tooltip); chk('cfg_routeByNV',mapCfg.routeByNV); chk('cfg_showDistance',mapCfg.showDistance);
    chk('cfg_colorByStatus',mapCfg.colorByStatus); chk('cfg_showRadius',mapCfg.showRadius);
    document.getElementById('cfg_radiusKm').value=mapCfg.radiusKm; document.getElementById('rowRadius').style.display=mapCfg.showRadius?'':'none';
    function cfg(id,v){ document.getElementById(id).value=v; } function chk(id,v){ document.getElementById(id).checked=v; }
  }; setUI();

  const getCfg=()=>({
    markerSize:val('cfgMarkerSize'), mapTheme:val('cfgTheme'),
    autoFit:chk('cfg_autoFit'), cluster:chk('cfg_cluster'), labelKH:chk('cfg_labelKH'), tooltip:chk('cfg_tooltip'),
    routeByNV:chk('cfg_routeByNV'), showDistance:chk('cfg_showDistance'), colorByStatus:chk('cfg_colorByStatus'),
    showRadius:chk('cfg_showRadius'), radiusKm:Math.max(1,Math.min(200, parseInt(val('cfg_radiusKm'),10)||DEFAULT_CFG.radiusKm))
  });
  function val(id){ return document.getElementById(id).value; }
  function chk(id){ return document.getElementById(id).checked; }

  const preview=()=>{ 
    mapCfg=getCfg(); 
    setBase(mapCfg.mapTheme); 
    rebuildGroup(); 
    renderFiltered();
    if (mapCfg.showRadius){
      if (RADIUS_LAYER){ map.removeLayer(RADIUS_LAYER); RADIUS_LAYER=null; }
      const c = map.getCenter();
      RADIUS_LAYER = L.circle(c,{radius:mapCfg.radiusKm*1000,color:'#9333ea',weight:2,fillOpacity:.08}).addTo(map);
    }
  };
  ['cfgMarkerSize','cfgTheme','cfg_radiusKm'].forEach(id=>document.getElementById(id).addEventListener('change',preview));
  ['cfg_autoFit','cfg_cluster','cfg_labelKH','cfg_tooltip','cfg_routeByNV','cfg_showDistance','cfg_colorByStatus','cfg_showRadius']
    .forEach(id=>document.getElementById(id).addEventListener('change',()=>{ document.getElementById('rowRadius').style.display=document.getElementById('cfg_showRadius').checked?'':''; preview(); }));
  document.getElementById('cfgSave').addEventListener('click',()=>{ saveMapCfg(mapCfg); alert('✅ Đã lưu cấu hình.'); });
}

/* ========= Center nav ========= */
(function(){
  const C=L.Control.extend({ onAdd:function(){ const btn=L.DomUtil.create('a','leaflet-bar'); btn.href='#'; btn.title='Chỉ đường tới tâm bản đồ';
    btn.style.background='#fff'; btn.style.width='34px'; btn.style.height='34px'; btn.style.lineHeight='34px';
    btn.style.textAlign='center'; btn.style.fontWeight='700'; btn.style.textDecoration='none'; btn.innerHTML='➡️';
    L.DomEvent.on(btn,'click',(e)=>{ L.DomEvent.stop(e); const c=map.getCenter(); window.open(linkViewOnGoogle(c.lat,c.lng,'Tâm bản đồ'),'_blank','noopener'); }); return btn; } });
  map.addControl(new C({position:'topleft'}));
})();

/* ========= Supabase + định vị ========= */
let supa=null; async function initSupabaseOnce(){ if(supa) return supa; try{ if(!window.supabase) return null; const KEY=(typeof window.getInternalKey==='function')?window.getInternalKey():''; const r=await fetch('/api/getConfig',{headers:{'x-internal-key':KEY}}); if(!r.ok) return null; const {url,anon}=await r.json(); if(!url||!anon) return null; supa=window.supabase.createClient(url,anon); }catch{} return supa; }
function getNVFromStorage(){ try{ const nv=JSON.parse(localStorage.getItem('nv')||'{}'); if(nv&&nv.ma_nv) return {ma_nv:String(nv.ma_nv),ten_nv:nv.ten_nv||''}; }catch{} const raw=localStorage.getItem('ma_nv'); return raw?{ma_nv:String(raw),ten_nv:''}:null; }
let MY_MARKER=null, MY_RADIUS=null, MY_WATCH=null, LAST_SEND=0, FOLLOW_MY_DOT=true, LAST_CENTER_AT=0;
const RECENTER_MS=4000, EDGE_PADDING_PX=60, RECENTER_MIN_MOVE_M=30;

function drawMyLocation(lat,lng){
  const pos=[lat,lng];
  if(!MY_MARKER){ MY_MARKER=L.circleMarker(pos,{radius:9,weight:2,color:'#ef4444',fillColor:'#ef4444',fillOpacity:.9}).addTo(map).bindTooltip('Vị trí của tôi',{permanent:false,direction:'top'}); }
  else { MY_MARKER.setLatLng(pos); }
  if(!MY_RADIUS){ MY_RADIUS=L.circle(pos,{radius:1000,color:'#ef4444',weight:2,fillOpacity:.06}).addTo(map); }
  else { MY_RADIUS.setLatLng(pos); }
}
function ensureInView(lat,lng){
  if(!FOLLOW_MY_DOT) return;
  const now=Date.now(); if(now-LAST_CENTER_AT<RECENTER_MS) return;
  const p=map.latLngToContainerPoint([lat,lng]), size=map.getSize();
  const nearEdge=p.x<EDGE_PADDING_PX||p.y<EDGE_PADDING_PX||p.x>size.x-EDGE_PADDING_PX||p.y>size.y-EDGE_PADDING_PX;
  const c=map.getCenter(), moved=distM({lat:c.lat,lng:c.lng},{lat,lng}); if(nearEdge||moved>RECENTER_MIN_MOVE_M){ map.panTo([lat,lng],{animate:true,duration:.6}); LAST_CENTER_AT=now; }
}
async function saveMyLocation(ma_nv,lat,lng,accuracy){ const now=Date.now(); if(now-LAST_SEND<20000) return; LAST_SEND=now; try{ await initSupabaseOnce(); if(!supa) return; await supa.from('kv_nhan_vien').update({lat,lng,accuracy,updated_at:new Date().toISOString()}).eq('ma_nv',ma_nv); }catch{} }

async function startMyLocation(ma_nv){
  if(!('geolocation' in navigator)) return alert('Thiết bị không hỗ trợ định vị.');
  try{ if(navigator.permissions&&navigator.permissions.query){ const perm=await navigator.permissions.query({name:'geolocation'}); if(perm.state==='denied') return alert('Bạn đã tắt quyền vị trí cho trang này.'); } }catch{}
  navigator.geolocation.getCurrentPosition(pos=>{ const {latitude:lat,longitude:lng,accuracy}=pos.coords; drawMyLocation(lat,lng); map.setView([lat,lng],Math.max(map.getZoom(),15)); ensureInView(lat,lng); saveMyLocation(ma_nv,lat,lng,accuracy); updateNearestNumbers(); updateProximityLabels();
  }, ()=>alert('Không lấy được vị trí hiện tại.'), {enableHighAccuracy:true,timeout:20000,maximumAge:10000});
  if(MY_WATCH){ navigator.geolocation.clearWatch(MY_WATCH); MY_WATCH=null; }
  MY_WATCH=navigator.geolocation.watchPosition(pos=>{ const {latitude:lat,longitude:lng,accuracy}=pos.coords; drawMyLocation(lat,lng); ensureInView(lat,lng); saveMyLocation(ma_nv,lat,lng,accuracy); updateNearestNumbers(); updateProximityLabels();
  },()=>{}, {enableHighAccuracy:true,timeout:20000,maximumAge:10000});
}
function stopMyLocation(){ if(MY_WATCH){ navigator.geolocation.clearWatch(MY_WATCH); MY_WATCH=null; } if(MY_MARKER){ map.removeLayer(MY_MARKER); MY_MARKER=null; } if(MY_RADIUS){ map.removeLayer(MY_RADIUS); MY_RADIUS=null; } }

/* ========= UI & init ========= */
function debounce(fn, ms=200){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function bindUI(){
  document.getElementById('reload')?.addEventListener('click', async ()=>{ try{ await loadCSV(); }catch(e){ $status.textContent='Lỗi: '+(e.message||e); } });
  const q=document.getElementById('q'); q?.addEventListener('input',debounce(()=>{ try{ sessionStorage.setItem('map_query', q.value||''); }catch{} renderFiltered(); },180));
  document.getElementById('vnOnly')?.addEventListener('change',()=>renderFiltered());
  map.on('moveend',()=>{ 
    if(mapCfg.showRadius){
      if(RADIUS_LAYER){ map.removeLayer(RADIUS_LAYER); RADIUS_LAYER=null; }
      const c=map.getCenter();
      RADIUS_LAYER=L.circle(c,{radius:mapCfg.radiusKm*1000,color:'#9333ea',weight:2,fillOpacity:.08}).addTo(map);
    }
    const qStr=document.getElementById('q')?.value||'';
    if(/\br:/.test(qStr)) renderFiltered();
    updateProximityLabels();
  });
}
document.addEventListener('DOMContentLoaded', async ()=>{ 
  const nv=getNVFromStorage(); 
  if(nv?.ma_nv){ 
    const wantAuto=localStorage.getItem('my_loc_auto')==='1'; 
    let granted=false; 
    try{ if(navigator.permissions&&navigator.permissions.query){ const perm=await navigator.permissions.query({name:'geolocation'}); granted=(perm.state==='granted'); } }catch{} 
    if(granted||wantAuto) startMyLocation(nv.ma_nv); 
  } 
});
document.addEventListener('DOMContentLoaded', ()=>{ 
  bindUI(); 
  renderConfigPanel(); 
  applyFilterFromURL(); 
  document.getElementById('reload')?.click(); 
  // (ĐÃ BỎ) drawWardAreas();
});
