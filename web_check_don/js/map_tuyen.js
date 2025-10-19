// ======================= map_tuyen.js =======================
(function boot() {
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  function init() {
    // ✅ Kiểm tra token truy cập
    if (typeof window.checkAccess === 'function') {
      try { checkAccess(); } catch { return; }
    }

    // Nếu nhúng trong iframe: click header/ESC để đóng sheet
    const header = document.getElementById('mapHeader');
    header?.addEventListener('click', () => {
      if (window.parent && window.parent !== window) {
        try { window.parent.postMessage({ type: 'CLOSE_MAP_SHEET' }, '*'); } catch {}
      }
    });
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape' && window.parent && window.parent !== window) {
        try { window.parent.postMessage({ type: 'CLOSE_MAP_SHEET' }, '*'); } catch {}
      }
    });

    waitForMapConfig(0);
  }

  // =================== ĐỢI CẤU HÌNH MAP ===================
  function waitForMapConfig(tries) {
    if (typeof window.getConfig === 'function') {
      const cfg = window.getConfig('map');
      if (cfg && cfg.CSV_URL) { startMap(cfg); return; }
    }
    if (tries > 100) {
      const st = document.getElementById('status');
      if (st) st.textContent = '❌ Thiếu cấu hình "map" (timeout). Kiểm tra internal_key.js & thứ tự script.';
      console.error('Missing map config after waiting.');
      return;
    }
    setTimeout(() => waitForMapConfig(tries + 1), 30);
  }

  // =================== KHỞI TẠO BẢN ĐỒ ===================
  function startMap(mapcfg) {
    const CSV_URL   = mapcfg.CSV_URL;
    const VN_BOX    = { latMin: 7, latMax: 25, lngMin: 100, lngMax: 112 };
    const VN_CENTER = { lat: 16.05, lng: 108.2 };

    const map = L.map('map', { preferCanvas: true }).setView([VN_CENTER.lat, VN_CENTER.lng], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const group = L.layerGroup().addTo(map);
    const $status = document.getElementById('status');

    function inVN(lat, lng){ return lat>=VN_BOX.latMin && lat<=VN_BOX.latMax && lng>=VN_BOX.lngMin && lng<=VN_BOX.lngMax; }
    function d2VN(lat, lng){ const dx=lat-VN_CENTER.lat, dy=lng-VN_CENTER.lng; return dx*dx+dy*dy; }
    function toNumSmart(x){
      if (typeof x === 'number') return x;
      if (x == null) return NaN;
      let s = String(x).trim();
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g,'').replace(',', '.');
      s = s.replace(/[^\d\.\,\-]/g,'');
      if (s.includes('.') && s.includes(',')) {
        if (s.lastIndexOf(',') < s.lastIndexOf('.')) s = s.replace(/,/g,'');
        else s = s.replace(/\./g,'').replace(',', '.');
      } else if (s.includes(',')) s = s.replace(',', '.');
      const n = Number(s);
      return Number.isFinite(n)? n : NaN;
    }

    const SCALES = [1, 1e5, 1e6, 1e7];
    function bestFix(latRaw, lngRaw){
      const a = toNumSmart(latRaw), b = toNumSmart(lngRaw);
      const cand = [];
      function push(lat,lng){
        if(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180){
          cand.push({lat:+lat.toFixed(6), lng:+lng.toFixed(6), inside:inVN(lat,lng), d2:d2VN(lat,lng)});
        }
      }
      for (const k of SCALES){ push(a/k, b/k); push(b/k, a/k); }
      if (!cand.length) return null;
      cand.sort((p,q)=> (p.inside!==q.inside) ? (q.inside?1:-1) : (p.d2-q.d2));
      return cand[0];
    }

    function guessKey(obj, alts){
      const keys = Object.keys(obj||{});
      for (const name of alts){ const k = keys.find(k => k.toLowerCase().trim() === name); if (k) return k; }
      for (const name of alts){ const k = keys.find(k => k.toLowerCase().includes(name)); if (k) return k; }
      return null;
    }

    function parseCSV(text){
      if (window.Papa) {
        const parsed = Papa.parse(text, { header:true, skipEmptyLines:true });
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

    function makeMarker(lat, lng, html){
      return L.circleMarker([lat,lng], { radius:5, weight:1, color:'#1d4ed8', fillColor:'#1d4ed8', fillOpacity:0.85 })
              .bindPopup(html);
    }

    async function loadAndRender(){
      try{
        if ($status) $status.textContent='Đang tải dữ liệu…';
        group.clearLayers();

        const res = await fetch(CSV_URL + (CSV_URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache:'no-store' });
        if(!res.ok){ if($status) $status.textContent='Tải CSV lỗi: ' + res.status; return; }
        const text = await res.text();
        if (!text || !/[,;\n]/.test(text)) { if($status) $status.textContent='CSV rỗng/không hợp lệ'; return; }

        const data = parseCSV(text);
        if (!Array.isArray(data) || data.length===0) { if($status) $status.textContent='Không có dữ liệu'; return; }

        const sample = data[0] || {};
        const latKey = guessKey(sample, ['lat','latitude','vido','vi_do','vĩ độ','y','vi do']) || 'lat';
        const lngKey = guessKey(sample, ['lng','lon','longitude','kinhdo','kinh_do','kinh độ','x','kinh do']) || 'lng';
        const tenKey = guessKey(sample, ['ten','tên','name']) || 'ten';
        const dcKey  = guessKey(sample, ['dia_chi','địa chỉ','dia chi','address']) || 'dia_chi';

        const bounds = L.latLngBounds();
        let total=0, kept=0, keptVN=0;

        for (const r of data){
          total++;
          const best = bestFix(r[latKey], r[lngKey]);
          if (!best) continue;
          if (!inVN(best.lat, best.lng)) continue;

          const name = r[tenKey] || 'Không tên';
          const addr = r[dcKey]  || '';
          makeMarker(best.lat, best.lng, `<b>${name}</b><br>${addr}`).addTo(group);

          bounds.extend([best.lat, best.lng]);
          kept++; if (best.inside) keptVN++;
        }

        if (kept>0 && bounds.isValid()){
          map.flyToBounds(bounds.pad(0.15), { duration: 1.2 });
          if ($status) $status.textContent = `Đã hiển thị ${kept}/${total} điểm (trong VN: ${keptVN}).`;
        } else {
          if ($status) $status.textContent = `Không có toạ độ hợp lệ trong VN (tổng đọc: ${total}).`;
        }
      }catch(e){
        console.error(e);
        if ($status) $status.textContent='Lỗi: '+e.message;
      }
    }

    document.getElementById('reload')?.addEventListener('click', loadAndRender);

    // Nếu check_don truyền danh sách mã KH
    (function primeFilterFromURL(){
      const p = new URLSearchParams(location.search);
      const idsStr = p.get('ids');
      if (idsStr) {
        const qInput = document.getElementById('q');
        if (qInput) qInput.value = 'ma: ' + idsStr.split(',').map(x=>x.trim()).filter(Boolean).join(' ');
      }
    })();

    loadAndRender();
  }
})();
