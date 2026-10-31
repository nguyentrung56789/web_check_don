
/* =========================================================
   map_tuyen.js
   OpenStreetMap - KHÔNG CẦN API KEY
   Giữ nguyên CSV, GPS, Supabase, tìm kiếm, giọng nói
========================================================= */

(function softGate() {
  try {
    if (typeof window.checkAccess === 'function') {
      window.checkAccess();
    }
  } catch (_) {}
})();

/* ================= CSV ================= */

let CSV_URL = "";

document.addEventListener('DOMContentLoaded', async () => {
  if (window.configReady?.then) {
    try {
      await window.configReady;
    } catch (_) {}
  }

  CSV_URL = window.getConfig?.('csv_url') || "";

  if (!CSV_URL) {
    alert("CSV_URL chưa được cấu hình!");
    return;
  }

  bindUI();
  renderConfigPanel();
  applyFilterFromURL();

  if ('speechSynthesis' in window) {
    try {
      await __loadVoicesOnce();
    } catch (_) {}
  }

  const nv = getNVFromStorage();

  if (
    nv?.ma_nv &&
    localStorage.getItem('my_loc_auto') === '1'
  ) {
    let granted = false;

    try {
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({
          name: 'geolocation'
        });
        granted = perm.state === 'granted';
      }
    } catch (_) {}

    if (granted) startMyLocation(nv.ma_nv);
  }

  await loadCSV();
});

/* ================= TỌA ĐỘ ================= */

const VN_BOX = {
  latMin: 7,
  latMax: 25,
  lngMin: 100,
  lngMax: 112
};

const VN_CENTER = {
  lat: 16.05,
  lng: 108.2
};

/* ================= CẤU HÌNH ================= */

const MAP_CFG_KEY = 'MAP_TUYEN_CONFIG';

const DEFAULT_CFG = {
  markerSize: 'medium',
  mapTheme: 'voyager',
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

function loadMapCfg() {
  try {
    return {
      ...DEFAULT_CFG,
      ...JSON.parse(
        localStorage.getItem(MAP_CFG_KEY) || '{}'
      )
    };
  } catch (_) {
    return { ...DEFAULT_CFG };
  }
}

function saveMapCfg(cfg) {
  try {
    localStorage.setItem(
      MAP_CFG_KEY,
      JSON.stringify(cfg)
    );
  } catch (_) {}
}

let mapCfg = loadMapCfg();

/* =========================================================
   BẢN ĐỒ OPENSTREETMAP - KHÔNG CẦN API KEY
========================================================= */

const map = L.map('map', {
  preferCanvas: true,
  zoomControl: false,
  attributionControl: true
}).setView(
  [VN_CENTER.lat, VN_CENTER.lng],
  6
);

const OSM_URL =
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

function makeOSMTile() {
  return L.tileLayer(OSM_URL, {
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution: OSM_ATTRIBUTION
  });
}

const TILE_LAYERS = {
  voyager: makeOSMTile(),
  light: makeOSMTile(),
  dark: makeOSMTile(),

  satellite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }
  )
};

let currentBase = null;

function setBase(theme) {
  const t = TILE_LAYERS[theme]
    ? theme
    : 'voyager';

  if (currentBase) {
    map.removeLayer(currentBase);
  }

  currentBase = TILE_LAYERS[t];

  document.getElementById('map')
    ?.setAttribute('data-map-theme', t);

  currentBase.addTo(map);
}

setBase(mapCfg.mapTheme);

/* ================= CSS MAP ================= */

(function () {
  const st = document.createElement('style');

  st.textContent = `
    #map[data-map-theme="voyager"] .leaflet-tile-pane {
      filter: saturate(1.15) contrast(1.05);
    }

    #map[data-map-theme="light"] .leaflet-tile-pane {
      filter: grayscale(.65) brightness(1.07) contrast(.9);
    }

    #map[data-map-theme="dark"] .leaflet-tile-pane {
      filter: invert(1) hue-rotate(180deg) brightness(.78) contrast(1.15);
    }

    #map[data-map-theme="satellite"] .leaflet-tile-pane {
      filter: none;
    }

    .poi {
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: #0ea5e9;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,.18);
      font-weight: 400;
      font-size: 10px;
    }

    .name-near {
      background: transparent;
      border: none;
      color: #222;
      font-size: 11px;
      font-weight: 600;
      text-shadow:
        0 0 3px rgba(255,255,255,.95),
        0 0 6px rgba(255,255,255,.9);
      text-transform: lowercase;
    }
  `;

  document.head.appendChild(st);
})();

/* ================= LAYERS ================= */

let GROUP = null;

function createGroup() {
  return (
    mapCfg.cluster &&
    L.markerClusterGroup
  )
    ? L.markerClusterGroup({
        chunkedLoading: true,
        chunkInterval: 100,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: false,
        disableClusteringAtZoom: 19
      })
    : L.layerGroup();
}

function rebuildGroup() {
  if (GROUP) map.removeLayer(GROUP);

  GROUP = createGroup();
  GROUP.addTo(map);
}

rebuildGroup();

const ROUTES = L.layerGroup().addTo(map);
const WARD_LABELS = L.layerGroup().addTo(map);
const NEAR_LABELS = L.layerGroup().addTo(map);

let RADIUS_LAYER = null;

const $status = document.getElementById('status');

/* ================= HELPERS ================= */

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m])
  );
}

function inVN(lat, lng) {
  return (
    lat >= VN_BOX.latMin &&
    lat <= VN_BOX.latMax &&
    lng >= VN_BOX.lngMin &&
    lng <= VN_BOX.lngMax
  );
}

function d2VN(lat, lng) {
  const dx = lat - VN_CENTER.lat;
  const dy = lng - VN_CENTER.lng;
  return dx * dx + dy * dy;
}

function distM(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);

  const A =
    s1 * s1 +
    Math.cos(toRad(a.lat)) *
    Math.cos(toRad(b.lat)) *
    s2 * s2;

  return 2 * R * Math.atan2(
    Math.sqrt(A),
    Math.sqrt(1 - A)
  );
}

function toNumSmart(x) {
  if (typeof x === 'number') return x;
  if (x == null) return NaN;

  let s = String(x).trim();

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }

  s = s.replace(/[^\d\.\,\-]/g, '');

  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') < s.lastIndexOf('.')) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const SCALES = [1, 1e5, 1e6, 1e7];

function bestFix(latRaw, lngRaw) {
  const a = toNumSmart(latRaw);
  const b = toNumSmart(lngRaw);
  const cand = [];

  function push(lat, lng) {
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      cand.push({
        lat: +lat.toFixed(6),
        lng: +lng.toFixed(6),
        inside: inVN(lat, lng),
        d2: d2VN(lat, lng)
      });
    }
  }

  for (const k of SCALES) {
    push(a / k, b / k);
    push(b / k, a / k);
  }

  if (!cand.length) return null;

  cand.sort((p, q) =>
    p.inside !== q.inside
      ? (q.inside ? 1 : -1)
      : p.d2 - q.d2
  );

  return cand[0];
}

function titleCaseKeepAcr(s) {
  const t = s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\-\–\—\·]+|[\-\–\—\·]+$/g, '');

  return t.split(' ')
    .filter(Boolean)
    .map(w => {
      if (
        w === w.toUpperCase() &&
        w.length <= 4
      ) return w;

      return w[0]
        ? w[0].toUpperCase() +
          w.slice(1).toLowerCase()
        : w;
    })
    .join(' ');
}

const throttle = (fn, ms = 250) => {
  let t = 0;

  return (...a) => {
    const n = Date.now();

    if (n - t > ms) {
      t = n;
      fn(...a);
    }
  };
};

function mDist(a, b) {
  return distM(
    { lat: a.lat, lng: a.lng },
    { lat: b.lat, lng: b.lng }
  );
}

function needHardRecenter(target) {
  const c = map.getCenter();

  const far = mDist(c, target) > 5000;
  const zoomLow = map.getZoom() < 14;

  return far || zoomLow;
}

/* ================= GOOGLE / APPLE MAPS ================= */

function escForURL(s) {
  return encodeURIComponent(String(s || ''));
}

function linkViewOnGoogle(lat, lng, name = '') {
  const q = `${lat},${lng}`;

  const label = name
    ? `&query_place_id=&query=${escForURL(name)} (${escForURL(q)})`
    : `&query=${escForURL(q)}`;

  return `https://www.google.com/maps/search/?api=1${label}`;
}

function linkDirectionApple(lat, lng) {
  return `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
}

function buildViewLinks(lat, lng, name = '') {
  const gView = linkViewOnGoogle(lat, lng, name);
  const aDir = linkDirectionApple(lat, lng);

  return `
    <div class="nav-links"
      style="margin-top:6px;font-weight:600;">
      <a href="${aDir}"
         target="_blank"
         rel="noopener"> Apple Maps</a>
      ·
      <a href="${gView}"
         target="_blank"
         rel="noopener">🔎 Xem trên Google Maps</a>
    </div>
  `;
}

/* ================= MARKER ================= */

function markerRadius() {
  return mapCfg.markerSize === 'small'
    ? 22
    : mapCfg.markerSize === 'large'
      ? 28
      : 24;
}

function makeNumIcon(num, color = '#0ea5e9') {
  const sz = markerRadius();

  return L.divIcon({
    className: '',
    html: `
      <div class="poi"
        style="
          background:${color};
          width:${sz}px;
          height:${sz}px;
          font-size:${Math.max(11, Math.round(sz * .5))}px
        ">
        ${num || ''}
      </div>
    `,
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
    popupAnchor: [0, -sz / 2]
  });
}

const ICON_CACHE = new Map();

function makeNumIconCached(num, color) {
  const key = `${num}|${color}|${markerRadius()}`;

  if (ICON_CACHE.has(key)) {
    return ICON_CACHE.get(key);
  }

  const ic = makeNumIcon(num, color);
  ICON_CACHE.set(key, ic);

  return ic;
}

function colorForStatus(st = '') {
  const s = st.toString().toLowerCase();

  if (!mapCfg.colorByStatus) return '#0ea5e9';

  if (s.includes('mới') || s.includes('new')) {
    return '#22c55e';
  }

  if (s.includes('đang') || s.includes('ship')) {
    return '#f59e0b';
  }

  if (s.includes('hủy') || s.includes('cancel')) {
    return '#ef4444';
  }

  if (s.includes('trả') || s.includes('return')) {
    return '#8b5cf6';
  }

  return '#0ea5e9';
}

let MARKERS_DATA = [];

/* ================= ĐỌC CSV ================= */

let RAW = [];
let KEY = {};
let csvCtrl = null;

async function loadCSV() {
  if (csvCtrl) csvCtrl.abort();

  csvCtrl = new AbortController();
  const sig = csvCtrl.signal;

  try {
    $status.textContent = 'Đang tải dữ liệu…';

    GROUP.clearLayers();
    ROUTES.clearLayers();
    WARD_LABELS.clearLayers();
    NEAR_LABELS.clearLayers();
    MARKERS_DATA = [];

    const urlObj = new URL(CSV_URL, location.href);

    if (urlObj.pathname.endsWith('/pub')) {
      if (!urlObj.searchParams.has('output')) {
        urlObj.searchParams.set('output', 'csv');
      }

      if (!urlObj.searchParams.has('single')) {
        urlObj.searchParams.set('single', 'true');
      }
    }

    urlObj.searchParams.set('t', Date.now());

    const resp = await fetch(
      urlObj.toString(),
      {
        cache: 'no-store',
        signal: sig
      }
    );

    if (!resp.ok) {
      throw new Error(
        `Không tải được CSV (HTTP ${resp.status})`
      );
    }

    const text = await resp.text();

    if (sig.aborted) return;

    if (!text || !/[,;\n]/.test(text)) {
      throw new Error('CSV rỗng/không hợp lệ');
    }

    RAW = parseCSV(text);

    if (!Array.isArray(RAW) || RAW.length === 0) {
      throw new Error('Không có dữ liệu trong CSV');
    }

    const s = RAW[0];

    KEY.lat = guessKey(s, [
      'lat', 'latitude', 'vido', 'vi_do',
      'vĩ độ', 'y', 'vi do'
    ]) || 'lat';

    KEY.lng = guessKey(s, [
      'lng', 'lon', 'longitude',
      'kinhdo', 'kinh_do', 'kinh độ',
      'x', 'kinh do'
    ]) || 'lng';

    KEY.ten = guessKey(s, [
      'ten', 'tên', 'name', 'khach'
    ]) || 'ten';

    KEY.ma = guessKey(s, [
      'ma_kh', 'makh', 'ma', 'mã'
    ]) || 'ma_kh';

    KEY.sdt = guessKey(s, [
      'sdt', 'so_dt', 'so_dien_thoai',
      'dien_thoai', 'phone'
    ]) || 'sdt';

    KEY.dc = guessKey(s, [
      'dia_chi', 'địa chỉ',
      'dia chi', 'address', 'addr'
    ]) || 'dia_chi';

    KEY.nv = guessKey(s, [
      'nv', 'nv_giao', 'nv_giao_hang',
      'nhan_vien', 'nhanvien'
    ]) || null;

    KEY.status = guessKey(s, [
      'trang_thai', 'trangthai',
      'status', 'tinh_trang'
    ]) || null;

    renderFiltered();

  } catch (e) {
    if (e.name === 'AbortError') return;

    $status.textContent =
      'Lỗi tải CSV: ' + (e.message || e);

    console.error(e);
  }
}

function parseCSV(text) {
  if (!window.Papa) {
    throw new Error(
      'Thiếu PapaParse – hãy load CDN Papa trước file này.'
    );
  }

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (parsed.errors?.length) {
    console.warn(
      'Papa errors:',
      parsed.errors.slice(0, 3)
    );
  }

  return parsed.data;
}

function guessKey(obj, alts) {
  const keys = Object.keys(obj);

  for (const name of alts) {
    const k = keys.find(
      k => k.toLowerCase().trim() === name
    );
    if (k) return k;
  }

  for (const name of alts) {
    const k = keys.find(
      k => k.toLowerCase().includes(name)
    );
    if (k) return k;
  }

  return null;
}

/* ================= PHƯỜNG XÃ ================= */

function extractWard(addr) {
  if (!addr) return '';

  const raw = String(addr)
    .replace(/\s+/g, ' ')
    .trim();

  const re =
    /\b(Phường|P\.?|Xã|X\.?|Thị\s*trấn|TT\.?)\s*([A-Za-zÀ-ỹ0-9\- ]+?)(?=,|\.|;|\/|$)/i;

  const m = raw.match(re);

  if (m) {
    let w = m[2].trim();

    w = w.replace(
      /\b(Quận|Q\.?|Huyện|H\.?|TP|T\.P\.|Tỉnh)\b.*$/i,
      ''
    ).trim();

    return w.split(' ')
      .filter(Boolean)
      .map(s =>
        s[0]
          ? s[0].toUpperCase() + s.slice(1)
          : s
      )
      .join(' ');
  }

  const wardKeys = [
    'Phường', 'P.', 'P ', 'P-',
    'P,', 'Xã', 'X.', 'X ',
    'Thị trấn', 'TT.', 'TT '
  ];

  const parts = raw.split(/[,.;/]/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const p of parts) {
    for (const key of wardKeys) {
      const idx = p.toLowerCase()
        .indexOf(key.toLowerCase());

      if (idx === 0) {
        let w = p.slice(key.length).trim();

        w = w.replace(
          /\b(Quận|Q\.?|Huyện|H\.?|TP|T\.P\.|Tỉnh)\b.*$/i,
          ''
        ).trim();

        if (w) {
          return w.split(' ')
            .map(s =>
              s[0]
                ? s[0].toUpperCase() + s.slice(1)
                : s
            )
            .join(' ');
        }
      }
    }
  }

  return '';
}

// Không hiển thị nhãn phường trên bản đồ.
function renderWardLabelsFromPoints(_wardAgg) {
  WARD_LABELS.clearLayers();
}

/* ================= TÌM KIẾM ================= */

function parseQuery(q) {
  q = (q || '').trim();

  const out = {
    ma: [],
    ten: [],
    sdt: [],
    dc: [],
    nv: [],
    tt: [],
    free: [],
    rKm: null
  };

  if (!q) return out;

  const pushVals = (arr, s) => {
    s.split(/[,\s]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .forEach(v => arr.push(v.toLowerCase()));
  };

  q.split(/\s+/).forEach(tok => {
    const t = tok.trim();

    const open = t.match(
      /^(ma|ten|sdt|dc|nv|tt|status|r):$/i
    );

    if (open) {
      out._last = open[1].toLowerCase();
      return;
    }

    const kv = t.match(
      /^(ma|ten|sdt|dc|nv|tt|status|r):(.*)$/i
    );

    if (kv) {
      const key = kv[1].toLowerCase();
      const val = kv[2];

      if (key === 'r') {
        const m = String(val).toLowerCase()
          .match(/^(\d+(?:\.\d+)?)(km|m)?$/);

        if (m) {
          const num = parseFloat(m[1]);
          const unit = m[2] || 'km';

          out.rKm = unit === 'm'
            ? num / 1000
            : num;
        }
      } else {
        const target =
          key === 'status' ? out.tt : out[key];

        pushVals(target, val);
        out._last = key;
      }

    } else if (out._last) {
      if (out._last === 'r') {
        const m2 = t.toLowerCase()
          .match(/^(\d+(?:\.\d+)?)(km|m)?$/);

        if (m2) {
          const num = parseFloat(m2[1]);
          const unit = m2[2] || 'km';

          out.rKm = unit === 'm'
            ? num / 1000
            : num;
        }
      } else {
        const target =
          out._last === 'status'
            ? out.tt
            : out[out._last];

        pushVals(target, t);
      }
    } else {
      out.free.push(t.toLowerCase());
    }
  });

  delete out._last;
  return out;
}

/* ================= HIỂN THỊ KHÁCH ================= */

function renderFiltered() {
  GROUP.clearLayers();
  ROUTES.clearLayers();
  WARD_LABELS.clearLayers();
  NEAR_LABELS.clearLayers();

  MARKERS_DATA = [];

  if (RADIUS_LAYER && !mapCfg.showRadius) {
    map.removeLayer(RADIUS_LAYER);
    RADIUS_LAYER = null;
  }

  const vnOnly =
    !!document.getElementById('vnOnly')?.checked;

  const Q = parseQuery(
    document.getElementById('q')?.value || ''
  );

  let count = 0;

  const bounds = L.latLngBounds();
  const routes = new Map();

  function pushRoute(key, p) {
    if (!routes.has(key)) {
      routes.set(key, []);
    }

    routes.get(key).push(p);
  }

  const centerForR = map.getCenter();

  const rLimitKm =
    Q.rKm && Q.rKm > 0 ? Q.rKm : null;

  const wardAgg = new Map();

  for (const r of RAW) {
    const fixed = bestFix(
      r[KEY.lat],
      r[KEY.lng]
    );

    if (!fixed) continue;

    if (
      vnOnly &&
      !inVN(fixed.lat, fixed.lng)
    ) continue;

    const name = titleCaseKeepAcr(
      (r[KEY.ten] || '').toString()
    );

    const code =
      (r[KEY.ma] || '').toString();

    const phone =
      (r[KEY.sdt] || '').toString();

    const addr =
      (r[KEY.dc] || '').toString();

    const nv = KEY.nv
      ? (r[KEY.nv] || '').toString()
      : '';

    const st = KEY.status
      ? (r[KEY.status] || '').toString()
      : '';

    const text = s =>
      s.toString().toLowerCase();

    const matchGroup = (arr, val) =>
      !arr.length ||
      arr.some(k => text(val).includes(k));

    let okRadius = true;

    if (rLimitKm) {
      const d = distM(
        {
          lat: centerForR.lat,
          lng: centerForR.lng
        },
        {
          lat: fixed.lat,
          lng: fixed.lng
        }
      ) / 1000;

      okRadius = d <= rLimitKm;
    }

    const ok =
      okRadius &&
      matchGroup(Q.ma, code) &&
      matchGroup(Q.ten, name) &&
      matchGroup(Q.sdt, phone) &&
      matchGroup(Q.dc, addr) &&
      matchGroup(Q.nv, nv) &&
      matchGroup(Q.tt, st) &&
      (
        Q.free.length
          ? Q.free.every(k =>
              [
                code, name, phone,
                addr, nv, st
              ].some(v => text(v).includes(k))
            )
          : true
      );

    if (!ok) continue;

    const color = colorForStatus(st);

    const m = L.marker(
      [fixed.lat, fixed.lng],
      {
        icon: makeNumIconCached('', color)
      }
    ).bindPopup(`
      <b>${esc(name || 'Không tên')}</b>
      <br>
      ${esc(addr)}
      ${phone ? `<br>${esc(phone)}` : ''}
      ${buildViewLinks(
        fixed.lat,
        fixed.lng,
        name
      )}
    `);

    m.on('click', () => {
      speakVi(name || 'không tên');
    });

    if (mapCfg.tooltip) {
      m.bindTooltip(
        `${name || ''} • ${addr || ''}${phone ? ` • ${phone}` : ''}`,
        {
          sticky: true,
          opacity: .9
        }
      );
    }

    if (mapCfg.labelKH && code) {
      m.bindTooltip(String(code), {
        permanent: true,
        direction: 'top',
        className: 'kh-label',
        offset: [
          0,
          -(markerRadius() / 2) - 2
        ]
      });
    }

    m.addTo(GROUP);

    MARKERS_DATA.push({
      marker: m,
      lat: fixed.lat,
      lng: fixed.lng,
      name,
      addr,
      phone,
      status: st,
      rank: 0
    });

    bounds.extend([
      fixed.lat,
      fixed.lng
    ]);

    count++;

    const ward = extractWard(addr);

    if (ward) {
      const w = wardAgg.get(ward) || {
        sumLat: 0,
        sumLng: 0,
        cnt: 0
      };

      w.sumLat += fixed.lat;
      w.sumLng += fixed.lng;
      w.cnt++;

      wardAgg.set(ward, w);
    }

    if (mapCfg.routeByNV && nv) {
      pushRoute(nv, {
        lat: fixed.lat,
        lng: fixed.lng
      });
    } else if (!mapCfg.routeByNV) {
      pushRoute('_all_', {
        lat: fixed.lat,
        lng: fixed.lng
      });
    }
  }

  renderWardLabelsFromPoints(wardAgg);

  if (
    count > 0 &&
    mapCfg.autoFit &&
    bounds.isValid()
  ) {
    map.fitBounds(bounds.pad(.15));
  }

  if (mapCfg.showRadius) {
    const c = map.getCenter();

    if (!RADIUS_LAYER) {
      RADIUS_LAYER = L.circle(c, {
        radius: mapCfg.radiusKm * 1000,
        color: '#9333ea',
        weight: 2,
        fillOpacity: .08
      }).addTo(map);
    } else {
      RADIUS_LAYER.setLatLng(c);
      RADIUS_LAYER.setRadius(
        mapCfg.radiusKm * 1000
      );
    }
  }

  $status.textContent = count > 0
    ? `Đã hiển thị ${count} điểm.`
    : 'Không có điểm phù hợp.';

  updateNearestNumbersTh();
  updateProximityLabelsTh();

  drawRoutes(routes);
}

/* ================= NHÃN KHÁCH GẦN ================= */

const NEAR_M = 250;
const NEAR_M_ZOOM_BONUS = 600;

function updateProximityLabels() {
  NEAR_LABELS.clearLayers();

  const useZoom = map.getZoom() >= 16;

  const ref = MY_MARKER
    ? MY_MARKER.getLatLng()
    : map.getCenter();

  for (const it of MARKERS_DATA) {
    const d = distM(ref, {
      lat: it.lat,
      lng: it.lng
    });

    const show =
      d <= NEAR_M ||
      (useZoom && d <= NEAR_M_ZOOM_BONUS);

    if (show) {
      const tip = L.tooltip({
        permanent: true,
        direction: 'right',
        className: 'name-near',
        offset: [
          Math.round(markerRadius() / 2) + 6,
          0
        ]
      })
        .setLatLng([it.lat, it.lng])
        .setContent(
          esc((it.name || '').toLowerCase())
        );

      NEAR_LABELS.addLayer(tip);
    }
  }
}

/* ================= KHÁCH GẦN NHẤT ================= */

function updateNearestNumbers() {
  if (MARKERS_DATA.length === 0) return;

  const ref = MY_MARKER
    ? MY_MARKER.getLatLng()
    : map.getCenter();

  const arr = MARKERS_DATA.map(
    (it, idx) => ({
      idx,
      d: distM(ref, {
        lat: it.lat,
        lng: it.lng
      })
    })
  );

  arr.sort((a, b) => a.d - b.d);

  const NEAREST_COLOR = '#22c55e';

  for (let i = 0; i < arr.length; i++) {
    const it = MARKERS_DATA[arr[i].idx];

    it.rank = i + 1;

    let color = colorForStatus(it.status);

    if (i === 0) {
      color = NEAREST_COLOR;
    }

    it.marker.setIcon(
      makeNumIconCached(i + 1, color)
    );
  }
}

const updateNearestNumbersTh =
  throttle(updateNearestNumbers, 250);

const updateProximityLabelsTh =
  throttle(updateProximityLabels, 250);

/* ================= VẼ TUYẾN ================= */

function drawRoutes(routes) {
  ROUTES.clearLayers();

  let total = 0;
  const colors = {};

  const getColor = key =>
    (colors[key] ||=
      `hsl(${(key.length * 53) % 360} 85% 45%)`);

  for (const [key, pts] of routes.entries()) {
    if (pts.length < 2) continue;

    const latlngs = pts.map(
      p => [p.lat, p.lng]
    );

    for (let i = 1; i < pts.length; i++) {
      total += distM(
        pts[i - 1],
        pts[i]
      );
    }

    L.polyline(latlngs, {
      color: getColor(key),
      weight: 3,
      opacity: .8,
      smoothFactor: 1.5
    }).addTo(ROUTES);
  }

  if (mapCfg.showDistance) {
    const km = (total / 1000).toFixed(1);

    $status.textContent +=
      ` • Tổng quãng đường: ${km} km`;
  }
}

/* ================= FILTER TỪ URL ================= */

function applyFilterFromURL() {
  const params = new URLSearchParams(
    location.search
  );

  let q = params.get('q');

  if (
    !q &&
    location.hash.includes('use_session=1')
  ) {
    try {
      q = sessionStorage.getItem('map_query') || '';
    } catch (_) {}
  }

  if (!q) {
    const ids = (params.get('ids') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (ids.length) {
      q = 'ma: ' + ids.join(' ');
    }
  }

  if (q) {
    const qInput =
      document.getElementById('q');

    if (qInput) qInput.value = q;
  }
}

/* ================= CSS CẤU HÌNH ================= */

function injectConfigStyles() {
  if (
    document.getElementById('mapCfgStyles')
  ) return;

  const css = `
    #mapConfigPanel {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 9999;
      background: rgba(255,255,255,.9);
      backdrop-filter: blur(6px);
      color: #111;
      border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,.16);
      font-family: system-ui;
      font-size: 13px;
      padding: 4px 6px;
      width: 210px;
    }

    #mapConfigPanel .cfg-toggle {
      cursor: pointer;
      font-weight: 700;
      user-select: none;
      font-size: 16px;
      text-align: right;
    }

    #mapConfigPanel .cfg-body {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #mapConfigPanel .hidden {
      display: none;
    }

    #mapConfigPanel label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    #mapConfigPanel select,
    #mapConfigPanel input[type="number"] {
      padding: 2px 6px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }

    #mapConfigPanel .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    #cfgSave {
      margin-top: 6px;
      padding: 6px;
      border: none;
      background: #2563eb;
      color: #fff;
      border-radius: 8px;
      cursor: pointer;
    }

    #cfgSave:hover {
      background: #1d4ed8;
    }
  `;

  const st = document.createElement('style');

  st.id = 'mapCfgStyles';
  st.textContent = css;

  document.head.appendChild(st);
}

/* ================= BẢNG CẤU HÌNH ================= */

function renderConfigPanel() {
  injectConfigStyles();

  const el = document.createElement('div');
  el.id = 'mapConfigPanel';

  el.innerHTML = `
    <div class="cfg-toggle" title="Cấu hình">
      ⚙️
    </div>

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
          <option value="voyager">OSM (đường màu)</option>
          <option value="light">OSM sáng</option>
          <option value="dark">OSM tối</option>
          <option value="satellite">Vệ tinh (Esri)</option>
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
      ].map(([k, l]) => `
        <label>
          <span>${l}</span>
          <input type="checkbox" id="cfg_${k}">
        </label>
      `).join('')}

      <div class="row" id="rowRadius">
        <span>Bán kính (km)</span>
        <input
          type="number"
          id="cfg_radiusKm"
          min="1"
          max="200"
          step="1"
          style="width:80px"
        >
      </div>

      <button id="cfgSave">
        💾 Lưu cấu hình
      </button>

    </div>
  `;

  document.body.appendChild(el);

  const $body = el.querySelector('.cfg-body');

  el.querySelector('.cfg-toggle')
    .addEventListener('click', () => {
      $body.classList.toggle('hidden');
    });

  function val(id) {
    return document.getElementById(id).value;
  }

  function chk(id) {
    return document.getElementById(id).checked;
  }

  const setUI = () => {
    document.getElementById('cfgMarkerSize').value =
      mapCfg.markerSize;

    document.getElementById('cfgTheme').value =
      mapCfg.mapTheme;

    [
      'autoFit',
      'cluster',
      'labelKH',
      'tooltip',
      'routeByNV',
      'showDistance',
      'colorByStatus',
      'showRadius'
    ].forEach(k => {
      document.getElementById(`cfg_${k}`).checked =
        !!mapCfg[k];
    });

    document.getElementById('cfg_radiusKm').value =
      mapCfg.radiusKm;

    document.getElementById('rowRadius').style.display =
      mapCfg.showRadius ? '' : 'none';
  };

  setUI();

  const getCfg = () => ({
    markerSize: val('cfgMarkerSize'),
    mapTheme: val('cfgTheme'),

    autoFit: chk('cfg_autoFit'),
    cluster: chk('cfg_cluster'),
    labelKH: chk('cfg_labelKH'),
    tooltip: chk('cfg_tooltip'),
    routeByNV: chk('cfg_routeByNV'),
    showDistance: chk('cfg_showDistance'),
    colorByStatus: chk('cfg_colorByStatus'),
    showRadius: chk('cfg_showRadius'),

    radiusKm: Math.max(
      1,
      Math.min(
        200,
        parseInt(val('cfg_radiusKm'), 10) ||
        DEFAULT_CFG.radiusKm
      )
    )
  });

  const preview = () => {
    mapCfg = getCfg();

    setBase(mapCfg.mapTheme);
    rebuildGroup();
    renderFiltered();

    if (mapCfg.showRadius) {
      const c = map.getCenter();

      if (!RADIUS_LAYER) {
        RADIUS_LAYER = L.circle(c, {
          radius: mapCfg.radiusKm * 1000,
          color: '#9333ea',
          weight: 2,
          fillOpacity: .08
        }).addTo(map);
      } else {
        RADIUS_LAYER.setLatLng(c);
        RADIUS_LAYER.setRadius(
          mapCfg.radiusKm * 1000
        );
      }
    }
  };

  [
    'cfgMarkerSize',
    'cfgTheme',
    'cfg_radiusKm'
  ].forEach(id => {
    document.getElementById(id)
      .addEventListener('change', preview);
  });

  [
    'cfg_autoFit',
    'cfg_cluster',
    'cfg_labelKH',
    'cfg_tooltip',
    'cfg_routeByNV',
    'cfg_showDistance',
    'cfg_colorByStatus',
    'cfg_showRadius'
  ].forEach(id => {
    document.getElementById(id)
      .addEventListener('change', () => {
        document.getElementById('rowRadius')
          .style.display =
          document.getElementById('cfg_showRadius').checked
            ? ''
            : 'none';

        preview();
      });
  });

  document.getElementById('cfgSave')
    .addEventListener('click', () => {
      mapCfg = getCfg();

      saveMapCfg(mapCfg);
      preview();

      const bodyEl = document.querySelector(
        '#mapConfigPanel .cfg-body'
      );

      bodyEl?.classList.add('hidden');

      const btn = document.getElementById('cfgSave');

      btn.disabled = true;

      try {
        document.activeElement?.blur();
      } catch (_) {}

      setTimeout(() => {
        alert('✅ Đã lưu cấu hình.');
        btn.disabled = false;
      }, 0);
    });
}

/* ================= SUPABASE ================= */

let supa = null;

async function initSupabaseOnce() {
  if (supa) return supa;

  try {
    if (!window.supabase) return null;

    const KEY =
      typeof window.getInternalKey === 'function'
        ? window.getInternalKey()
        : '';

    const r = await fetch('/api/getConfig', {
      headers: {
        'x-internal-key': KEY
      }
    });

    if (!r.ok) return null;

    const { url, anon } = await r.json();

    if (!url || !anon) return null;

    supa = window.supabase.createClient(
      url,
      anon
    );
  } catch (_) {}

  return supa;
}

function getNVFromStorage() {
  try {
    const nv = JSON.parse(
      localStorage.getItem('nv') || '{}'
    );

    if (nv && nv.ma_nv) {
      return {
        ma_nv: String(nv.ma_nv),
        ten_nv: nv.ten_nv || ''
      };
    }
  } catch (_) {}

  const raw = localStorage.getItem('ma_nv');

  return raw
    ? {
        ma_nv: String(raw),
        ten_nv: ''
      }
    : null;
}

/* ================= GIỌNG NÓI TIẾNG VIỆT ================= */

let __VI_VOICE = null;
let __VOICES_READY = false;
let __WARNED_NO_VI = false;

const TTS_RATE = .9;
const TTS_PITCH = 1;
const TTS_VOL = 1;

const PREFERRED_NAME_ORDER = [
  /microsoft.*(hoai|my).*(online|neural)/i,
  /microsoft.*vi-vn/i,
  /google.*(vi|tiếng ?việt)/i,
  /(tiếng ?việt|vietnam|viet)/i
];

const VI_LANG_HINTS = [
  /^vi(-|_|$)/i
];

function __pickVietnameseVoice(voices) {
  const viLang = voices.filter(
    v => VI_LANG_HINTS.some(
      rx => rx.test(v.lang || '')
    )
  );

  for (const rx of PREFERRED_NAME_ORDER) {
    const hit = viLang.find(
      v => rx.test(
        (v.name || '') + ' ' +
        (v.lang || '')
      )
    );

    if (hit) return hit;
  }

  return viLang.length
    ? viLang[0]
    : null;
}

function __loadVoicesOnce() {
  return new Promise(resolve => {
    const done = () => {
      const voices =
        speechSynthesis.getVoices() || [];

      if (voices.length) {
        __VI_VOICE =
          __pickVietnameseVoice(voices);

        __VOICES_READY = true;

        resolve(voices);
        return true;
      }

      return false;
    };

    if (!done()) {
      const cb = () => {
        done();

        speechSynthesis.onvoiceschanged = null;

        resolve(
          speechSynthesis.getVoices() || []
        );
      };

      speechSynthesis.onvoiceschanged = cb;

      setTimeout(() => {
        done();

        resolve(
          speechSynthesis.getVoices() || []
        );
      }, 1200);
    }
  });
}

function spellDigits(str) {
  return String(str).split('').join(' ');
}

function normalizeForSpeak(text) {
  let s = String(text || '').trim();

  s = s
    .replace(/\bP\.\s*(\w+)/gi, 'phường $1')
    .replace(/\bQ\.\s*(\w+)/gi, 'quận $1')
    .replace(/\bTP\.\s*(\w+)/gi, 'thành phố $1');

  s = s.replace(
    /(\d{7,})/g,
    (_m, g1) => spellDigits(g1)
  );

  s = s.replace(/ - /g, ', ');
  s = s.replace(/\s{2,}/g, ' ');

  s = s.replace(
    /([^\.,!?])$/g,
    '$1.'
  );

  return s;
}

function splitForClarity(text, maxLen = 120) {
  const parts = [];

  const sentences = String(text).split(
    /([\.!?、，,…]+)\s*/
  );

  let buf = '';

  for (let i = 0; i < sentences.length; i += 2) {
    const seg =
      (sentences[i] || '') +
      (sentences[i + 1] || '');

    if ((buf + ' ' + seg).trim().length > maxLen) {
      if (buf.trim()) parts.push(buf.trim());
      buf = seg;
    } else {
      buf = (buf + ' ' + seg).trim();
    }
  }

  if (buf.trim()) parts.push(buf.trim());

  if (!parts.length) parts.push(String(text));

  return parts;
}

async function speakVi(text) {
  if (!('speechSynthesis' in window)) return;

  if (!__VOICES_READY || !__VI_VOICE) {
    try {
      await __loadVoicesOnce();
    } catch (_) {}
  }

  if (!__VI_VOICE && !__WARNED_NO_VI) {
    __WARNED_NO_VI = true;

    alert(
      'Thiết bị chưa có giọng tiếng Việt. Hãy cài Vietnamese voice rồi tải lại trang.'
    );
  }

  const chunks = splitForClarity(
    normalizeForSpeak(text),
    120
  );

  try {
    speechSynthesis.cancel();
  } catch (_) {}

  for (const chunk of chunks) {
    const u = new SpeechSynthesisUtterance(chunk);

    u.lang = 'vi-VN';
    u.rate = TTS_RATE;
    u.pitch = TTS_PITCH;
    u.volume = TTS_VOL;

    if (__VI_VOICE) u.voice = __VI_VOICE;

    await new Promise(res => {
      u.onend = () => setTimeout(res, 60);
      u.onerror = () => res();
      speechSynthesis.speak(u);
    });
  }
}

window.testSpeakVi = async function () {
  await __loadVoicesOnce();

  console.log(
    'Voice:',
    __VI_VOICE
      ? {
          name: __VI_VOICE.name,
          lang: __VI_VOICE.lang
        }
      : '(none)'
  );

  speakVi(
    'Xin chào. Tôi sẽ đọc tiếng Việt, chậm và rõ hơn.'
  );
};

/* ================= GPS ================= */

let MY_MARKER = null;
let MY_RADIUS = null;
let MY_WATCH = null;

let LAST_SEND = 0;
let LAST_CENTER_AT = 0;

const RECENTER_MS = 4000;
const EDGE_PADDING_PX = 60;
const RECENTER_MIN_MOVE_M = 30;

function drawMyLocation(lat, lng) {
  const pos = [lat, lng];

  if (!MY_MARKER) {
    MY_MARKER = L.circleMarker(pos, {
      radius: 9,
      weight: 2,
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: .9
    })
      .addTo(map)
      .bindTooltip('Vị trí của tôi', {
        permanent: false,
        direction: 'top'
      });
  } else {
    MY_MARKER.setLatLng(pos);
  }

  if (!MY_RADIUS) {
    MY_RADIUS = L.circle(pos, {
      radius: 300,
      color: '#ef4444',
      weight: 2,
      fillOpacity: .06
    }).addTo(map);
  } else {
    MY_RADIUS.setLatLng(pos);
  }

  window.__myLatLng = {
    lat,
    lng
  };
}

function ensureInView(lat, lng) {
  const now = Date.now();

  if (now - LAST_CENTER_AT < RECENTER_MS) {
    return;
  }

  const p = map.latLngToContainerPoint([
    lat,
    lng
  ]);

  const size = map.getSize();

  const nearEdge =
    p.x < EDGE_PADDING_PX ||
    p.y < EDGE_PADDING_PX ||
    p.x > size.x - EDGE_PADDING_PX ||
    p.y > size.y - EDGE_PADDING_PX;

  const c = map.getCenter();

  const moved = distM(
    {
      lat: c.lat,
      lng: c.lng
    },
    {
      lat,
      lng
    }
  );

  if (
    nearEdge ||
    moved > RECENTER_MIN_MOVE_M
  ) {
    map.panTo([lat, lng], {
      animate: true,
      duration: .6
    });

    LAST_CENTER_AT = now;
  }
}

async function saveMyLocation(
  ma_nv,
  lat,
  lng,
  accuracy
) {
  const now = Date.now();

  if (now - LAST_SEND < 20000) return;

  LAST_SEND = now;

  try {
    await initSupabaseOnce();

    if (!supa) return;

    await supa
      .from('kv_nhan_vien')
      .update({
        lat,
        lng,
        accuracy,
        updated_at: new Date().toISOString()
      })
      .eq('ma_nv', ma_nv);
  } catch (_) {}
}

const GP_OPTS = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0
};

function humanGeoError(err) {
  if (!err) {
    return 'Lỗi vị trí không xác định';
  }

  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Bị chặn quyền vị trí';

    case err.POSITION_UNAVAILABLE:
      return 'Không có tín hiệu GPS/Network';

    case err.TIMEOUT:
      return 'Lấy vị trí quá thời gian cho phép';

    default:
      return 'Lỗi vị trí: ' +
        (err.message || err);
  }
}

/* ================= TÌM KHÁCH GẦN NHẤT ================= */

function nearestFromLatLng(my) {
  let best = null;
  let dBest = Infinity;

  for (const it of MARKERS_DATA) {
    if (!it.marker) continue;

    const d = distM(my, {
      lat: it.lat,
      lng: it.lng
    });

    if (d < dBest) {
      best = it;
      dBest = d;
    }
  }

  return best
    ? {
        cust: best,
        dist: dBest
      }
    : null;
}

const DIST_BANDS = [
  500, 300, 200, 150,
  100, 70, 50, 30,
  20, 15, 10
];

let __nearestId = null;
let __lastBand = null;

function roundDistanceForSpeech(m) {
  if (m > 50) {
    return Math.round(m / 10) * 10;
  }

  return Math.max(1, Math.round(m));
}

function bandForDistance(m) {
  for (const b of [...DIST_BANDS].reverse()) {
    if (m <= b) return b;
  }

  return null;
}

function phraseForDistance(m) {
  const d = roundDistanceForSpeech(m);

  if (d > 100) return `còn khoảng ${d} mét`;
  if (d > 50) return `còn ${d} mét`;
  if (d > 20) return `sắp tới, còn ${d} mét`;
  if (d > 10) return `rất gần, còn ${d} mét`;
  if (d > 5) return `sắp tới nơi, còn ${d} mét`;
  if (d > 2) return `chuẩn bị dừng, còn ${d} mét`;

  return 'đến nơi';
}

function onLocationProgress(pos) {
  const {
    latitude,
    longitude
  } = pos.coords;

  const res = nearestFromLatLng({
    lat: latitude,
    lng: longitude
  });

  if (!res) return;

  const {
    cust,
    dist
  } = res;

  const id =
    cust.marker?._leaflet_id ?? cust.name;

  const b = bandForDistance(dist);

  if (__nearestId !== id) {
    __nearestId = id;
    __lastBand = null;

    speakVi(`Khách hàng, ${cust.name}`);
  }

  if (b && b !== __lastBand) {
    __lastBand = b;

    const msg = phraseForDistance(dist);

    if (msg === 'đến nơi') {
      speakVi(`Đến nơi, ${cust.name}`);
    } else {
      speakVi(
        `Khách hàng, ${cust.name}, ${msg}`
      );
    }
  }

  if (
    dist <= 8 &&
    __lastBand !== 'arrived'
  ) {
    __lastBand = 'arrived';
    speakVi(`Đến nơi, ${cust.name}`);
  }
}

/* ================= NÚT KHÁCH GẦN NHẤT ================= */

function gotoNearestCustomer() {
  const p =
    MY_MARKER?.getLatLng() ||
    window.__myLatLng;

  if (!p) {
    alert('Hãy bấm 📍 để lấy vị trí trước');
    return;
  }

  const res = nearestFromLatLng({
    lat: p.lat,
    lng: p.lng
  });

  if (!res) {
    speakVi(
      'Không có khách nào đang hiển thị'
    );
    return;
  }

  const {
    cust,
    dist
  } = res;

  map.setView(
    [cust.lat, cust.lng],
    Math.max(map.getZoom(), 16)
  );

  if (cust.marker?.openPopup) {
    cust.marker.openPopup();
  }

  const msg = phraseForDistance(dist);

  if (msg === 'đến nơi') {
    speakVi(`Đến nơi, ${cust.name}`);
  } else {
    speakVi(
      `Khách hàng, ${cust.name}, ${msg}`
    );
  }
}

/* ================= THEO DÕI VỊ TRÍ ================= */

async function startMyLocation(
  ma_nv,
  forceFly = false
) {
  if (!('geolocation' in navigator)) {
    alert('Thiết bị không hỗ trợ định vị.');
    return;
  }

  try {
    if (navigator.permissions?.query) {
      const p = await navigator.permissions.query({
        name: 'geolocation'
      });

      if (p.state === 'denied') {
        $status.textContent =
          '⚠️ Quyền vị trí đang bị chặn.';

        alert(
          'Bạn đã tắt quyền vị trí. Hãy bật lại trong cài đặt trình duyệt.'
        );

        return;
      }
    }
  } catch (_) {}

  let tries = 0;
  const maxTries = 3;
  let gotPosition = false;

  const oneShot = () => new Promise(
    (resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        GP_OPTS
      );
    }
  );

  while (tries < maxTries) {
    try {
      const pos = await oneShot();

      const {
        latitude: lat,
        longitude: lng,
        accuracy
      } = pos.coords;

      drawMyLocation(lat, lng);

      const target = { lat, lng };

      if (
        forceFly ||
        needHardRecenter(target)
      ) {
        map.flyTo(
          [lat, lng],
          Math.max(map.getZoom(), 16),
          { duration: .8 }
        );
      } else {
        map.setView(
          [lat, lng],
          Math.max(map.getZoom(), 15)
        );
      }

      ensureInView(lat, lng);
      saveMyLocation(ma_nv, lat, lng, accuracy);

      updateNearestNumbersTh();
      updateProximityLabelsTh();

      $status.textContent =
        '📍 Đã lấy vị trí (' +
        Math.round(accuracy) +
        'm)';

      gotPosition = true;
      break;

    } catch (err) {
      tries++;

      $status.textContent =
        '⚠️ ' + humanGeoError(err) +
        (
          tries < maxTries
            ? ` • Thử lại (${tries}/${maxTries})…`
            : ''
        );

      if (tries >= maxTries) {
        alert(humanGeoError(err));
        break;
      }

      await new Promise(
        r => setTimeout(r, 1500 * tries)
      );
    }
  }

  if (!gotPosition) return;

  if (MY_WATCH !== null) {
    navigator.geolocation.clearWatch(MY_WATCH);
    MY_WATCH = null;
  }

  MY_WATCH = navigator.geolocation.watchPosition(
    pos => {
      const {
        latitude: lat,
        longitude: lng,
        accuracy
      } = pos.coords;

      drawMyLocation(lat, lng);

      const target = { lat, lng };

      if (needHardRecenter(target)) {
        map.flyTo(
          [lat, lng],
          Math.max(map.getZoom(), 16),
          { duration: .6 }
        );
      } else {
        ensureInView(lat, lng);
      }

      saveMyLocation(
        ma_nv,
        lat,
        lng,
        accuracy
      );

      updateNearestNumbersTh();
      updateProximityLabelsTh();
      onLocationProgress(pos);
    },
    err => {
      $status.textContent =
        '⚠️ Theo dõi vị trí: ' +
        humanGeoError(err);
    },
    GP_OPTS
  );
}

function stopMyLocation() {
  if (MY_WATCH !== null) {
    navigator.geolocation.clearWatch(MY_WATCH);
    MY_WATCH = null;
  }

  if (MY_MARKER) {
    map.removeLayer(MY_MARKER);
    MY_MARKER = null;
  }

  if (MY_RADIUS) {
    map.removeLayer(MY_RADIUS);
    MY_RADIUS = null;
  }
}

/* ================= GIAO DIỆN ================= */

function debounce(fn, ms = 200) {
  let t;

  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function bindUI() {
  const onLocateClick = async () => {
    const nv = getNVFromStorage();

    const ma_nv =
      nv?.ma_nv ||
      localStorage.getItem('ma_nv') ||
      prompt('Nhập mã nhân viên:');

    if (!ma_nv) {
      alert('Thiếu mã nhân viên.');
      return;
    }

    localStorage.setItem('ma_nv', ma_nv);
    localStorage.setItem('my_loc_auto', '1');

    if (MY_MARKER) {
      const p = MY_MARKER.getLatLng();
      const z = map.getZoom();

      map.flyTo(
        p,
        Math.max(z, 16),
        { duration: .8 }
      );
    }

    startMyLocation(ma_nv, true);
  };

  document.querySelectorAll(
    '#btnMyLocation, #btnLocate'
  ).forEach(btn => {
    btn.addEventListener(
      'click',
      onLocateClick
    );
  });

  document.querySelectorAll(
    '#btnNearest'
  ).forEach(btn => {
    btn.addEventListener(
      'click',
      gotoNearestCustomer
    );
  });

  window.locateMe = onLocateClick;
  window._fallbackLocate = onLocateClick;
  window.gotoNearestCustomer =
    gotoNearestCustomer;

  const q = document.getElementById('q');

  q?.addEventListener(
    'input',
    debounce(() => {
      try {
        sessionStorage.setItem(
          'map_query',
          q.value || ''
        );
      } catch (_) {}

      renderFiltered();
    }, 180)
  );

  document.getElementById('vnOnly')
    ?.addEventListener(
      'change',
      renderFiltered
    );

  document.getElementById('reload')
    ?.addEventListener(
      'click',
      loadCSV
    );

  map.on('moveend', () => {
    if (mapCfg.showRadius) {
      const c = map.getCenter();

      if (!RADIUS_LAYER) {
        RADIUS_LAYER = L.circle(c, {
          radius: mapCfg.radiusKm * 1000,
          color: '#9333ea',
          weight: 2,
          fillOpacity: .08
        }).addTo(map);
      } else {
        RADIUS_LAYER.setLatLng(c);
        RADIUS_LAYER.setRadius(
          mapCfg.radiusKm * 1000
        );
      }
    }

    const qStr =
      document.getElementById('q')
        ?.value || '';

    if (/\br:/.test(qStr)) {
      renderFiltered();
    }

    updateProximityLabelsTh();
  });
}

/* ================= KẾT THÚC ================= */
