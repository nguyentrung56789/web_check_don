/*
 * app_giao_hang.js
 * Tách tự động từ app_giao_hang.html.
 * Các khối JavaScript nội tuyến được giữ nguyên thứ tự xuất hiện trong file gốc.
 */

    /*
     * KIỂM TRA ĐĂNG NHẬP CHUNG
     * Đọc giống main.html:
     *   1. localStorage["nv"]
     *   2. localStorage["chatwoot_crm_user"]
     * Ưu tiên ma_nv, nếu không có thì dùng id_nv.
     */
    (function kiemTraDangNhapChung() {
      function readJsonStorage(key) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return null;

          const data = JSON.parse(raw);
          return data && typeof data === "object"
            ? data
            : null;
        } catch (error) {
          console.warn(
            `[GIAO HÀNG] Không đọc được localStorage "${key}":`,
            error
          );
          return null;
        }
      }

      const loginUser =
        readJsonStorage("nv") ||
        readJsonStorage("chatwoot_crm_user");

      /*
       * Không tìm thấy phiên đăng nhập:
       * vẫn cho mở app, không chuyển về login.html.
       */
      if (!loginUser) {
        const guestUser = {
          ma_nv: "",
          ten_nv: "Nhân viên",
          ts: Date.now()
        };

        window.APP_LOGIN_USER = guestUser;
        document.documentElement.classList.add("auth-ok");

        console.warn(
          "[GIAO HÀNG] Không tìm thấy phiên đăng nhập, vẫn mở ứng dụng."
        );

        return;
      }

      const maNv = String(
        loginUser.ma_nv ||
        loginUser.id_nv ||
        ""
      ).trim();

      const tenNv = String(
        loginUser.ten_nv ||
        loginUser.name ||
        maNv ||
        ""
      ).trim();

      /*
       * Có dữ liệu đăng nhập nhưng không có ma_nv:
       * vẫn cho mở app, không chuyển về login.html.
       */
      if (!maNv) {
        const fallbackUser = {
          ...loginUser,
          ma_nv: "",
          ten_nv: tenNv || "Nhân viên",
          ts: Date.now()
        };

        window.APP_LOGIN_USER = fallbackUser;
        document.documentElement.classList.add("auth-ok");

        console.warn(
          "[GIAO HÀNG] Tài khoản không có ma_nv, vẫn mở ứng dụng."
        );

        return;
      }

      const normalizedUser = {
        ...loginUser,
        ma_nv: maNv,
        ten_nv: tenNv,
        ts: Date.now()
      };

      /*
       * Chuẩn hóa lại key "nv" để app_giao_hang.js
       * và các trang con luôn đọc cùng một cấu trúc.
       */
      localStorage.setItem(
        "nv",
        JSON.stringify(normalizedUser)
      );

      sessionStorage.setItem(
        "nv_ctx",
        JSON.stringify({
          ma_nv: maNv,
          ten_nv: tenNv,
          ts: Date.now()
        })
      );

      window.APP_LOGIN_USER = normalizedUser;
      document.documentElement.classList.add("auth-ok");

      console.log(
        "[GIAO HÀNG] Đã nhận tài khoản từ hệ thống:",
        {
          ma_nv: maNv,
          ten_nv: tenNv
        }
      );
    })();
  

    if ("serviceWorker" in navigator) {
      addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch(error => {
            console.warn(
              "[GIAO HÀNG] Không đăng ký được service worker:",
              error
            );
          });
      });
    }
  

    /*
     * Gắn thông tin nhân viên lên giao diện
     * trước khi chạy app_giao_hang.js.
     */
    (function hienThiNhanVien() {
      const user = window.APP_LOGIN_USER;

      if (!user) return;

      const who = document.getElementById("who");

      if (who) {
        who.textContent =
          `👤 ${user.ten_nv || user.ma_nv}`;
      }
    })();
  

/* global ZXing */
window.APP_GIAO_HANG_BUILD = '2026-08-06-fix-trim-v3';
/* ====================== app_giao_hang.js — build r7 (NO-GEO, CHECK-IN OVERLAY, SCAN BEEP, NOTIFY PANEL) ======================
 * - KHÔNG xin GPS, KHÔNG gửi vị trí/webhook tại file này
 * - Khi lên "Giao thành công": mở checkin.html full-screen từ TRÊN xuống (truyền đúng ma_kh & ma_hd)
 * - Nếu đơn đã "Giao thành công" từ trước: chỉ báo & dừng
 * - Gỡ panel chuông cũ; thay bằng Notify Panel (mở khi bấm 🔔 #tabBell)
 * - Thêm âm "beep" khi quét; mở khóa audio đúng cách cho iOS/Android
 * =========================================================================================================================== */

/* ===== PWA install ===== */
let deferredPrompt=null;
const installBtn=document.getElementById('installBtn');
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn&&(installBtn.style.display='inline-flex');});
installBtn?.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.style.display='none';});

/* ===== Supabase (DB/Auth) - chờ internal_key.js tải cấu hình ===== */
let supa = null;

const confNV = {
  table: 'kv_nhan_vien',
  url: '',
  key: ''
};

const CFG = {
  ...(window.COD_CONFIG || {})
};

function safeTrim(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function readConfigString(value, keys = []) {
  const direct = safeTrim(value);
  if (direct) return direct;

  if (value && typeof value === 'object') {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const nested = safeTrim(value[key]);
        if (nested) return nested;
      }
    }
  }

  return '';
}

async function resolveSupabaseConfig() {
  if (window.configReady && typeof window.configReady.then === 'function') {
    await window.configReady;
  }

  let rawUrl = window.getConfig?.('url');
  let rawAnon = window.getConfig?.('anon');

  let url = readConfigString(rawUrl, [
    'url', 'value', 'SUPABASE_URL', 'supabaseUrl', 'supabase_url'
  ]);

  let anon = readConfigString(rawAnon, [
    'anon', 'key', 'value', 'SUPABASE_ANON', 'SUPABASE_ANON_KEY',
    'supabaseAnon', 'supabaseKey', 'supabase_anon_key'
  ]);

  if (!url || !anon) {
    const internalKey = typeof window.getInternalKey === 'function'
      ? safeTrim(window.getInternalKey())
      : '';

    const response = await fetch('/api/getConfig', {
      method: 'GET',
      headers: {
        'x-internal-key': internalKey,
        'Accept': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Không lấy được cấu hình Supabase: HTTP ${response.status} ${detail}`);
    }

    const config = await response.json();

    if (!url) {
      url = readConfigString(config, [
        'url', 'SUPABASE_URL', 'supabaseUrl', 'supabase_url'
      ]);
    }

    if (!anon) {
      anon = readConfigString(config, [
        'anon', 'key', 'SUPABASE_ANON', 'SUPABASE_ANON_KEY',
        'supabaseAnon', 'supabaseKey', 'supabase_anon_key'
      ]);
    }
  }

  url = safeTrim(url).replace(/\/+$/, '');
  anon = safeTrim(anon);

  if (!url) throw new Error('Thiếu URL Supabase');
  if (!anon) throw new Error('Thiếu anon key Supabase');
  if (!/^https:\/\//i.test(url)) throw new Error(`URL Supabase không hợp lệ: ${url}`);

  console.log('[GIAO HÀNG] Cấu hình Supabase hợp lệ:', {
    url,
    urlType: typeof url,
    anonType: typeof anon,
    anonLength: anon.length
  });

  return { url, anon };
}

const supabaseReady = (async () => {
  const { url, anon } = await resolveSupabaseConfig();

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('Thư viện Supabase chưa được tải');
  }

  supa = window.supabase.createClient(String(url), String(anon), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  confNV.url = String(url);
  confNV.key = String(anon);
  CFG.url = String(url);
  CFG.key = String(anon);

  console.log('[GIAO HÀNG] Supabase sẵn sàng:', CFG.url);
  return supa;
})().catch(error => {
  console.error('[GIAO HÀNG] Lỗi khởi tạo Supabase:', error);
  const message = error instanceof Error ? error.message : String(error);
  alert(message || 'Không thể khởi tạo Supabase');
  throw error;
});

/* ===== Cấu hình động từ cod_config.js ===== */
const KEY_VD        = CFG.keyColVD   || CFG.keyCol   || 'ma_vd';
const KEY_DON_HD    = CFG.keyColHD   || 'ma_hd';
const KEY_KH        = CFG.keyColKH   || 'ma_kh';
const DATE_COL      = CFG.dateCol    || 'ngay_chuan_bi_don';
const TABLE_VD_KIOT = CFG.tableVD    || (CFG.table && CFG.table.vd) || 'don_hang_kiot_cod';
const TABLE_DON     = CFG.tableHD    || (CFG.table && CFG.table.hd) || 'don_hang';
const TABLE_CT      = CFG.tableCT    || (CFG.table && CFG.table.ct) || 'don_hang_chitiet';

/* ===== Helpers ===== */
const $=s=>document.querySelector(s);
const fmtMoney=n=>(Number(n||0)).toLocaleString('vi-VN');
const TZ='Asia/Ho_Chi_Minh';

/* ===== Slide banner (TRƯỢT TỪ TRÊN XUỐNG) ===== */
let slideEl=null;
function ensureSlide(){
  if(slideEl) return slideEl;
  slideEl=document.createElement('div');
  slideEl.id='slideNotice';
  slideEl.setAttribute('role','status');
  slideEl.style.cssText=`
    position:fixed;z-index:99999;left:50%;top:0;transform:translate(-50%,-120%);opacity:0;pointer-events:none;
    padding:12px 14px;border-radius:14px;font-weight:800;letter-spacing:.2px;line-height:1.35;box-shadow:0 10px 28px rgba(0,0,0,.22);
    background:#e0f2fe;color:#075985;border:1px solid #38bdf8;transition:transform .22s ease,opacity .22s ease;`;
  document.body.appendChild(slideEl);return slideEl;
}
function showSlide(msg,type='info',ms){
  const el=ensureSlide();
  if(type==='warn'){ el.style.background='#fde68a'; el.style.color='#92400e'; el.style.border='1px solid #f59e0b'; }
  else if(type==='ok'){ el.style.background='#bbf7d0'; el.style.color='#065f46'; el.style.border='1px solid #10b981'; }
  else if(type==='err'){ el.style.background='#fecaca'; el.style.color='#7f1d1d'; el.style.border='1px solid #ef4444'; }
  else { el.style.background='#e0f2fe'; el.style.color='#075985'; el.style.border='1px solid #38bdf8'; }
  let dur = typeof ms==='number' ? ms : 2800;
  if(type==='warn' && ms==null) dur=3200;
  if(type==='err'  && ms==null) dur=4200;
  el.textContent=String(msg||''); el.style.opacity='1'; el.style.transform='translate(-50%, 12px)';
  clearTimeout(showSlide._t); showSlide._t=setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translate(-50%,-120%)'; }, dur);
}

/* ===== Notify Panel (🔔 #tabBell + #bellNum) ===== */
/* ===== Notify Panel (🔔 #tabBell + #bellNum) — canh NGAY DƯỚI CHUÔNG ===== */
(function initBellPanel(){
  // CSS
  if(!document.getElementById('notifyStyles')){
    const st=document.createElement('style');
    st.id='notifyStyles';
    st.textContent=`
      #notifyOverlay{position:fixed;inset:0;display:none;background:rgba(2,6,23,.35);z-index:99999}
      #notifyPanel{position:fixed;transform:translateX(-50%);
        width:min(92vw,520px);background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;
        box-shadow:0 12px 28px rgba(0,0,0,.18)}
      .np-head{padding:12px 16px;font-weight:800;letter-spacing:.2px;background:#f9fafb;border-bottom:1px solid #e5e7eb;
        display:flex;align-items:center;justify-content:space-between}
      .np-close{border:none;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#6b7280}
      .np-close:hover{color:#111827}
      .np-body{max-height:55vh;overflow:auto}
      .np-item{padding:10px 14px;border-bottom:1px dashed #e5e7eb;display:flex;flex-direction:column;gap:4px}
      .np-item:last-child{border-bottom:none}
      .np-item time{color:#6b7280;font-size:12px}
      .np-empty{padding:14px;color:#6b7280;text-align:center}`;
    document.head.appendChild(st);
  }

  // Overlay + Panel
  let overlay=document.getElementById('notifyOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='notifyOverlay';
    overlay.innerHTML=`
      <div id="notifyPanel" role="dialog" aria-modal="true" aria-labelledby="npTitle">
        <div class="np-head">
          <div id="npTitle">Thông báo</div>
          <button id="npClose" class="np-close" aria-label="Đóng">×</button>
        </div>
        <div id="notifyList" class="np-body">
          <div class="np-empty">Chưa có thông báo.</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  const panel=document.getElementById('notifyPanel');
  const list =document.getElementById('notifyList');
  const btnX =document.getElementById('npClose');
  const bell =document.getElementById('tabBell');
  const badge=document.getElementById('bellNum');

  // --- Badge helper ---
  let COUNT=0;
  function setBadge(n){
    COUNT=Math.max(0, Math.min(99, Number(n)||0));
    if(!badge) return;
    badge.textContent=String(COUNT);
    badge.style.display = COUNT>0 ? 'block' : 'none';
  }
  function bump(n=1){ setBadge(COUNT+n); }

  // --- Đặt panel NGAY DƯỚI CHUÔNG ---
  function positionPanel(){
    if(!panel || !bell) return;
    const r = bell.getBoundingClientRect(); // toạ độ chuông
    const gap = 8;                          // khoảng cách dưới chuông
    // vị trí ngang: tâm theo chuông, nhưng giữ không tràn mép
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const panelW = Math.min(vw * 0.92, 520);
    let left = r.left + r.width/2;
    left = Math.max(panelW/2 + 6, Math.min(vw - panelW/2 - 6, left));
    panel.style.left = left + 'px';
    panel.style.top  = (r.bottom + gap) + 'px';
  }

  // --- Mở/Đóng panel ---
  function onEsc(e){ if(e.key==='Escape') closePanel(); }
  function openPanel(){
    overlay.style.display='block';
    positionPanel();           // <<— CANH DƯỚI CHUÔNG NGAY KHI MỞ
    setBadge(0);
    document.addEventListener('keydown',onEsc);
  }
  function closePanel(){
    overlay.style.display='none';
    document.removeEventListener('keydown',onEsc);
  }
  addEventListener('resize', ()=>{ if(overlay.style.display==='block') positionPanel(); });

  // --- Gắn events ---
  bell?.addEventListener('click',(e)=>{ e.stopPropagation(); if(overlay.style.display==='block') closePanel(); else openPanel(); });
  btnX?.addEventListener('click',closePanel);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) closePanel(); });

  // --- API công khai để nơi khác push thông báo ---
  function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  window.pushNotify = function(text){
    if(!list) return;
    const empty=list.querySelector('.np-empty'); if(empty) empty.remove();
    const item=document.createElement('div');
    item.className='np-item';
    const now=new Date().toLocaleString('vi-VN');
    item.innerHTML=`${esc(text)}<time>${now}</time>`;
    list.prepend(item);
    const items=list.querySelectorAll('.np-item');
    if(items.length>100) list.removeChild(items[items.length-1]);
    bump(1);
  };
  window.setNotifyCount = setBadge;

  // Khởi tạo badge theo số item hiện có
  setBadge(list.querySelectorAll('.np-item').length);
})();


/* ===== Time helpers ===== */
function fmtDateVN(input){
  if(!input) return '';
  const d=new Date(input);
  const f=new Intl.DateTimeFormat('vi-VN',{timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  return f.format(d).replace(',','');
}
function nowVN_ddmmyyyy_hhmm(){
  const fmt=new Intl.DateTimeFormat('en-GB',{ timeZone:TZ, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  const parts=Object.fromEntries(fmt.formatToParts(new Date()).map(p=>[p.type,p.value]));
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`;
}

/* ===== Supabase REST helpers ===== */
async function sbSelect(table,filterObj,selectCols='*'){
  await supabaseReady;
  const qs=new URLSearchParams({select:selectCols,...filterObj}).toString();
  const res=await fetch(`${CFG.url}/rest/v1/${table}?${qs}`,{headers:{apikey:CFG.key,Authorization:`Bearer ${CFG.key}`}});
  if(!res.ok)throw new Error(await res.text());return res.json();
}
async function sbSelectWithCount(table,filterObj,selectCols='*'){
  await supabaseReady;
  const qs=new URLSearchParams({select:selectCols,...filterObj}).toString();
  const res=await fetch(`${CFG.url}/rest/v1/${table}?${qs}`,{headers:{apikey:CFG.key,Authorization:`Bearer ${CFG.key}`,'Prefer':'count=exact'}});
  if(!res.ok)throw new Error(await res.text());
  const rows=await res.json();
  const range=res.headers.get('content-range');
  let total=null;
  if(range&&range.includes('/')){ const n=range.split('/').pop(); total=Number(n)||null; }
  return {rows,total};
}
async function sbPatch(table,filterObj,bodyObj){
  await supabaseReady;
  const qs=new URLSearchParams(filterObj).toString();
  const res=await fetch(`${CFG.url}/rest/v1/${table}?${qs}`,{
    method:'PATCH',
    headers:{apikey:CFG.key,Authorization:`Bearer ${CFG.key}`,'Content-Type':'application/json',Prefer:'return=representation'},
    body:JSON.stringify(bodyObj)
  });
  if(!res.ok)throw new Error(await res.text());return res.json();
}

/* ===== Lấy mã khách theo mã hóa đơn ===== */
async function getMaKhByMaHd(ma_hd){
  try{
    const rows=await sbSelect(TABLE_DON,{[KEY_DON_HD]:`eq.${ma_hd}`,limit:1},KEY_KH);
    return rows?.[0]?.[KEY_KH]??null;
  }catch(e){console.warn('Không lấy được mã khách:',e);return null;}
}

/* ===== Đăng nhập (gọn/chống lỗi) ===== */
(function initAuthSection(){
  const _ = s => document.querySelector(s);
  const el = { loginSec:_('#login'), appSec:_('#app'), msg:_('#loginMsg'), who:_('#who'), btn:_('#btnLogin'), ma:_('#ma_nv'), mk:_('#mat_khau'), userBtn:_('#userBtn'), userMenu:_('#userMenu'), logout:_('#logout') };
  if (!el.ma || !el.mk || !el.btn) return;
  const KEY='nv';
  const saveCase=i=>{try{localStorage.setItem(KEY,JSON.stringify(i));}catch{}};
  const loadCase=()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}};
  const clearCase=()=>{try{localStorage.removeItem(KEY);}catch{}};
  function showApp(u){el.loginSec&&(el.loginSec.style.display='none');el.appSec&&(el.appSec.style.display='block');el.who&&(el.who.textContent=u?.ten_nv||'Nhân viên');}
  function showLogin(){el.appSec&&(el.appSec.style.display='none');el.loginSec&&(el.loginSec.style.display='block');}
  function setMsg(text,type='err'){el.msg&&(el.msg.textContent=text||'');showSlide(text,type==='err'?'err':(type==='ok'?'ok':'info'));}
  function lockBtn(on=true,label='Đang kiểm tra...'){el.btn&&(el.btn.disabled=!!on,el.btn.textContent=on?label:'Đăng nhập');}
  function readInput(){const ma=safeTrim(el.ma?.value),mk=el.mk?.value||'';if(!ma||!mk){setMsg('Vui lòng nhập đủ thông tin','err');return null;}return{ma,mk};}
  async function fetchUser(ma,mk){await supabaseReady;const table=confNV?.table||'kv_nhan_vien';const {data,error}=await supa.from(table).select('ma_nv,ten_nv').eq('ma_nv',ma).eq('mat_khau',mk).maybeSingle();return error||!data?null:data;}
  let logging=false;
  async function doLogin(){ if(logging) return; const inp=readInput(); if(!inp) return; logging=true; lockBtn(true); setMsg('');
    try{const user=await fetchUser(inp.ma,inp.mk); if(!user){setMsg('Sai mã nhân viên hoặc mật khẩu','err');return;} saveCase(user); showApp(user); setMsg('Đăng nhập thành công','ok');}
    catch(e){setMsg('Lỗi đăng nhập: '+(e?.message||e),'err');}
    finally{logging=false;lockBtn(false);}
  }
  (function bootstrap(){const u=loadCase(); u?.ma_nv?showApp(u):showLogin();})();
  el.btn.addEventListener('click',doLogin);
  el.mk.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  if(el.userBtn&&el.userMenu){
    el.userBtn.addEventListener('click',()=>{el.userMenu.style.display=(el.userMenu.style.display==='block'?'none':'block');});
    document.addEventListener('click',e=>{if(!el.userBtn.contains(e.target)&&!el.userMenu.contains(e.target))el.userMenu.style.display='none';});
  }
  el.logout?.addEventListener('click',()=>{clearCase();location.reload();});
})();

/* ===== Camera (auto-off 60s) & QUÉT ===== */
const video=$('#preview'),startBtn=$('#startBtn'),refreshBtn=$('#refreshBtn'),camCard=$('#camCard'),info=$('#info'),beep=$('#beep');
const hints=new Map();hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.QR_CODE]);
const reader=new ZXing.BrowserMultiFormatReader(hints);
let currentStream=null,currentDeviceId=null,last='',scanLock=false,noScanTimer=null;
function vibrate(p){try{navigator.vibrate?p=navigator.vibrate(p):camCard?.classList.add('flash'),setTimeout(()=>camCard?.classList.remove('flash'),400);}catch{camCard?.classList.add('flash');setTimeout(()=>camCard?.classList.remove('flash'),400);}}
function setInfo(type,t){if(!info)return;info.className='info-bar';if(type==='ok')info.classList.add('info-ok');else if(type==='err')info.classList.add('info-err');info.textContent=t||'';}
function startNoScanTimer(){clearTimeout(noScanTimer);noScanTimer=setTimeout(()=>{sleepCamera();showSlide('⏸ Tự tắt camera sau 60s không quét mã');},60000);}
async function ensureCamera(){ if(currentStream) return currentStream;
  currentStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:720},height:{ideal:720},facingMode:{ideal:'environment'}},audio:false});
  try{localStorage.setItem('cam_ok','1');}catch{} return currentStream;
}
async function startReader(stream){
  if(!video) return;
  video.srcObject=stream;video.setAttribute('playsinline','');video.muted=true;
  try{await video.play();}catch{}
  const t=stream.getVideoTracks();const s=t[0]?.getSettings?.()||{};currentDeviceId=s.deviceId||null;
  await reader.decodeFromVideoDevice(currentDeviceId||null,video,onScan);
  setInfo('','Đang quét...');startNoScanTimer();
}
function sleepCamera(){try{reader.reset();}catch{}try{video?.srcObject&&video.srcObject.getTracks().forEach(t=>t.stop());}catch{}currentStream=null;startBtn&&(startBtn.disabled=false);setInfo('','⏸ Camera đã tắt do không có mã trong 60s.');}

/* ==== Scan Beep (unlock + play + fallback) ==== */
let scanBeepUnlocked = false;
let scanSoundEnabled = (localStorage.getItem('scan_beep') ?? '1') === '1';
function setScanSound(on){ scanSoundEnabled=!!on; try{localStorage.setItem('scan_beep',on?'1':'0');}catch{} }
function unlockScanBeepOnce(){
  if (scanBeepUnlocked) return;
  const tryUnlock = async () => {
    if (!beep) return;
    try {
      beep.muted = false;
      beep.currentTime = 0;
      const p = beep.play();
      if (p?.catch) { await p.catch(()=>{}); }
      beep.pause();
      scanBeepUnlocked = true;
      cleanup();
    } catch {}
  };
  const cleanup = () => {
    ['startBtn','refreshBtn','fabScan'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.removeEventListener('click',tryUnlock);
    });
    document.removeEventListener('touchstart',tryUnlock);
    document.removeEventListener('keydown',tryUnlock);
  };
  ['startBtn','refreshBtn','fabScan'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',tryUnlock,{once:true});
  });
  document.addEventListener('touchstart',tryUnlock,{once:true});
  document.addEventListener('keydown',tryUnlock,{once:true});
}
async function playScanBeep(){
  if (!scanSoundEnabled || !beep) return;
  unlockScanBeepOnce();
  try{
    beep.currentTime = 0;
    const p = beep.play();
    if (p?.catch) {
      await p.catch(() => {
        const a = beep.cloneNode(true);
        a.currentTime = 0;
        a.play().catch(()=>{});
      });
    }
  }catch{
    try{const a=beep.cloneNode(true);a.currentTime=0;await a.play();}catch{}
  }
}

/* ===== Buttons (start/refresh) ===== */
startBtn?.addEventListener('click',async()=>{ await playScanBeep(); startBtn.disabled=true;
  try{const s=await ensureCamera();currentStream=s;await startReader(s);}
  catch(e){setInfo('err','Không mở được camera: '+(e.message||'Không rõ'));showSlide('KHÔNG MỞ ĐƯỢC CAMERA','err');startBtn.disabled=false;}
});
refreshBtn?.addEventListener('click',async()=>{sleepCamera();startBtn?.click();});
(function(){const isIOS=/iP(hone|ad|od)/i.test(navigator.userAgent);const appVisible=document.getElementById('app')?.style.display==='block';if(localStorage.getItem('cam_ok')==='1'&&!isIOS&&appVisible){startBtn?.click();}})();

/* —— Chặn quét trùng 2 phút —— */
const SCAN_BLOCK_MS=120000,recentScans=new Map();
const isBlocked=c=>{const t=recentScans.get(c);return t&&(Date.now()-t<SCAN_BLOCK_MS);}
const markScanned=c=>recentScans.set(c,Date.now());
setInterval(()=>{const now=Date.now();for(const[k,v]of recentScans.entries())if(now-v>SCAN_BLOCK_MS)recentScans.delete(k);},30000);

/* ====================== CHECK-IN OVERLAY (full-screen, trượt từ TRÊN xuống) ====================== */
(function(){
  let ciWrap=null, ciPanel=null, ciFrame=null;

  function ensureCheckinOverlay(){
    if(ciWrap) return;
    ciWrap=document.createElement('div'); ciWrap.id='checkinOverlay';
    ciWrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.08);display:none;z-index:9999';
    ciWrap.innerHTML=`
      <div id="ciPanel" style="position:fixed;inset:0;background:#fff;transform:translateY(-100%);transition:transform .22s ease;display:flex;flex-direction:column">
        <div id="ciHeader" style="height:20px;flex:0 0 auto;padding:8px 0;border-bottom:1px solid #eee">
          <div style="width:44px;height:4px;background:#c9d2dc;border-radius:4px;margin:0 auto"></div>
        </div>
        <div style="padding:10px 12px;font-weight:700">Check-in giao thành công</div>
        <iframe id="ciFrame" src="" style="border:0;flex:1 1 auto;width:100%"></iframe>
      </div>`;
    document.body.appendChild(ciWrap);
    ciPanel=ciWrap.querySelector('#ciPanel');
    ciFrame=ciWrap.querySelector('#ciFrame');

    ciWrap.addEventListener('click',e=>{ if(e.target===ciWrap) closeCheckin(); });
    ciWrap.querySelector('#ciHeader').addEventListener('click',closeCheckin);

    let y0=0,y=0,drag=false;
    ciPanel.addEventListener('touchstart',e=>{drag=true;y0=e.touches[0].clientY;ciPanel.style.transition='none';});
    ciPanel.addEventListener('touchmove',e=>{if(!drag)return;y=e.touches[0].clientY;const dy=Math.max(0,y-y0);ciPanel.style.transform=`translateY(${dy}px)`;});
    ciPanel.addEventListener('touchend',()=>{ciPanel.style.transition='transform .22s ease';const dy=Math.max(0,y-y0);if(dy>100)closeCheckin();else ciPanel.style.transform='translateY(0)';drag=false;y0=y=0;});
  }

  function buildCheckinURL(ma_kh, ma_hd){
    const q = new URLSearchParams();
    if (ma_kh) q.set('ma_kh', String(ma_kh).trim());
    if (ma_hd) q.set('ma_hd', String(ma_hd).trim());
    return 'checkin.html?' + q.toString();
  }

  function openCheckinByMaKh(ma_kh, ma_hd){
    ensureCheckinOverlay();
    ciFrame.removeAttribute('src');
    ciFrame.src = buildCheckinURL(ma_kh, ma_hd);
    document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';
    ciWrap.style.display='block';
    requestAnimationFrame(()=>{ciPanel.style.transform='translateY(0)';});
  }

  function closeCheckin(){
    if(!ciWrap||!ciPanel) return;
    ciPanel.style.transform='translateY(-100%)';
    setTimeout(()=>{ciWrap.style.display='none';},220);
    document.documentElement.style.overflow=''; document.body.style.overflow='';
  }

  async function openCheckinByMaHd(ma_hd){
    try{
      const ma_kh=await getMaKhByMaHd(ma_hd);
      if(!ma_kh){ showSlide('KHÔNG TÌM THẤY MÃ KHÁCH','warn'); return; }
      openCheckinByMaKh(ma_kh, ma_hd);
    }catch(e){ showSlide('LỖI MỞ CHECK-IN','err'); }
  }

  window.__openCheckinByMaKh=openCheckinByMaKh;
  window.__openCheckinByMaHd=openCheckinByMaHd;
})();

/* ===== Mode & Status ===== */
let MODE='hang';
const modeVD=$('#modeVD'),modeHang=$('#modeHang'),rowVD=$('#rowVD'),rowDon=$('#rowDon'),lblVD=$('#lblVD'),lblHang=$('#lblHang');
const mavd=$('#mavd'),madon=$('#madon'),statusText=$('#statusText');
function applyMode(){MODE=modeVD?.checked?'vd':'hang';rowVD&&(rowVD.style.display=MODE==='vd'?'block':'none');rowDon&&(rowDon.style.display=MODE==='vd'?'none':'block');lblHang?.classList.toggle('active',MODE==='hang');lblVD?.classList.toggle('active',MODE==='vd');}
modeHang&&(modeHang.checked=true);modeVD&&(modeVD.checked=false);modeVD?.addEventListener('change',applyMode);modeHang?.addEventListener('change',applyMode);applyMode();
function renderStatus(t){statusText&&(statusText.textContent=t||'Trạng thái giao hàng');if(t&&statusText){statusText.classList.remove('info-err','info-ok');if(t==='Giao thành công'||t==='Đã đóng hàng')statusText.classList.add('info-ok');}}

/* ===== Trạng thái tuyến tính ===== */
function nextStatusNew(cur){
  const c=safeTrim(cur);
  if(c==='Đã kiểm đơn')return 'Đang giao hàng';
  if(c==='Đang giao hàng')return 'Giao thành công';
  if(c==='Giao thành công')return null;
  return 'Đang giao hàng';
}

/* ===== LƯU (NO-GEO) — MỞ CHECK-IN KHI “GIAO THÀNH CÔNG” ===== */
async function doSaveByMode(codeScanned){
  if(MODE==='hang'){
    const code=safeTrim(codeScanned || madon?.value);
    if(!code){ setInfo('err','Thiếu mã đơn'); showSlide('THIẾU MÃ HÓA ĐƠN','err'); return; }
    if(isBlocked(code)){ setInfo('','Mã này vừa quét rồi — chờ 2 phút.'); showSlide('MÃ VỪA QUÉT — CHỜ 2 PHÚT','warn'); vibrate([60,40,60]); return; }

    const rows=await sbSelect(TABLE_DON,{[KEY_DON_HD]:`eq.${code}`,limit:1},'id,trang_thai');
    if(!rows.length){ setInfo('err','Không tìm thấy mã hóa đơn'); showSlide('KHÔNG TÌM THẤY HÓA ĐƠN','err'); return; }

    const cur=safeTrim(rows?.[0]?.trang_thai);
    const nxt=nextStatusNew(cur);

    // ĐÃ giao thành công từ trước → chỉ báo & dừng
    if(!nxt){
      renderStatus('Giao thành công');
      setInfo('ok','Đã giao hàng rồi');
      showSlide('ĐÃ GIAO HÀNG RỒI','ok');
      markScanned(code);
      return;
    }

    // Bật sang “Giao thành công” lần đầu → cập nhật và mở check-in
    if(nxt==='Giao thành công'){
      try{
        await sbPatch(TABLE_DON,{ [KEY_DON_HD]: `eq.${code}` },{ trang_thai:'Giao thành công' });
        renderStatus('Giao thành công'); setInfo('ok','✔ Giao thành công'); showSlide('GIAO THÀNH CÔNG','ok');
      }catch(e){
        renderStatus(cur||'Đang giao hàng'); setInfo('err','⚠️ Cập nhật trạng thái lỗi — vẫn mở CHECK-IN'); showSlide('CẬP NHẬT TRẠNG THÁI LỖI','err');
      }finally{
        vibrate([80,60,80]); markScanned(code);
        try{ window.__openCheckinByMaHd?.(code); }catch{}
      }
      return;
    }

    // Các bước trung gian
    await sbPatch(TABLE_DON,{ [KEY_DON_HD]: `eq.${code}` },{ trang_thai:nxt });
    renderStatus(nxt); setInfo('ok','✔ '+nxt); showSlide('CẬP NHẬT TRẠNG THÁI: '+nxt,'info'); vibrate([80,60,80]); markScanned(code);

  }else{
    // === QUÉT MÃ VẬN ĐƠN
    const code = safeTrim(codeScanned || mavd?.value);
    if (!code) {
      setInfo('err','Thiếu mã vận đơn');
      showSlide('THIẾU MÃ VẬN ĐƠN','err');
      return;
    }
    if (isBlocked(code)) {
      setInfo('','Mã này vừa quét rồi — chờ 2 phút.');
      showSlide('MÃ VỪA QUÉT — CHỜ 2 PHÚT','warn');
      vibrate([60,40,60]);
      return;
    }

    try {
      // LẤY THÊM ngay_dong_hang TỪ BẢNG VẬN ĐƠN
      const vdRow = await sbSelect(
        TABLE_VD_KIOT,
        { [KEY_VD]: `eq.${code}`, limit: 1 },
        `${KEY_VD},${KEY_DON_HD},ngay_dong_hang`
      );
      if (!vdRow.length) {
        setInfo('err','Không tìm thấy vận đơn');
        showSlide('KHÔNG TÌM THẤY VẬN ĐƠN','err');
        vibrate([60,40,60]);
        return;
      }
      const ma_hd  = vdRow[0][KEY_DON_HD];
      const ngayDH = vdRow[0].ngay_dong_hang;

      // ❗ ĐÃ CÓ NGÀY ĐÓNG HÀNG → xem như đã đóng, chỉ báo & dừng
      if (ngayDH) {
        renderStatus('Đã đóng hàng');
        setInfo('ok', `Đơn này đã đóng hàng lúc ${ngayDH}`);
        showSlide(`ĐƠN NÀY ĐÃ ĐÓNG HÀNG LÚC ${ngayDH}`, 'ok');

        vibrate([60,40,60]);
        markScanned(code);
        return;
      }

      // Chưa có ngay_dong_hang → xử lý bình thường theo trạng thái đơn
      const existed = await sbSelect(
        TABLE_DON,
        { [KEY_DON_HD]: `eq.${ma_hd}`, limit: 1 },
        `${KEY_DON_HD},trang_thai`
      );
      if (!existed.length) {
        setInfo('err','Không tìm thấy hóa đơn');
        showSlide('KHÔNG TÌM THẤY HÓA ĐƠN','err');
        vibrate([60,40,60]);
        return;
      }

      const cur = safeTrim(existed?.[0]?.trang_thai);

      // ĐÃ “Giao thành công” → chỉ báo & dừng
      if (cur === 'Giao thành công') {
        renderStatus('Giao thành công');
        setInfo('ok','Đã giao hàng rồi');
        showSlide('ĐÃ GIAO HÀNG RỒI','ok');
        markScanned(code);
        return;
      }

      // Ràng buộc đóng hàng
      if (cur === 'Chưa kiểm đơn') {
        setInfo('err','Chưa kiểm đơn — không thể đóng hàng');
        showSlide('LỖI: CHƯA KIỂM ĐƠN','err');
        vibrate([80,60,80]);
        markScanned(code);
        return;
      }
      if (cur !== 'Đã kiểm đơn' && cur !== 'Đã đóng hàng') {
        setInfo('err','Trạng thái hiện tại không hợp lệ để Đóng hàng');
        showSlide('KHÔNG HỢP LỆ: CẦN "ĐÃ KIỂM ĐƠN" TRƯỚC','err');
        vibrate([80,60,80]);
        markScanned(code);
        return;
      }

      // cur === 'Đã kiểm đơn' (hoặc dữ liệu cũ 'Đã đóng hàng' nhưng chưa có ngay_dong_hang) → nâng lên / set lại “Đã đóng hàng”
      const nv  = (function(){
        try { return JSON.parse(localStorage.getItem('nv'))?.ma_nv || null; }
        catch { return null; }
      })();
      const nowText = nowVN_ddmmyyyy_hhmm();

      await sbPatch(TABLE_DON,{ [KEY_DON_HD]: `eq.${ma_hd}` },{
        trang_thai: 'Đã đóng hàng',
        ngay_dong_hang: nowText, nv_dong_hang: nv,
        ngay_check_don: nowText, nv_check_don: nv
      });
      await sbPatch(TABLE_VD_KIOT,{ [KEY_VD]: `eq.${code}` },{ ngay_dong_hang: nowText });

      renderStatus('Đã đóng hàng');
      setInfo('ok','✔ Đã đóng hàng');
      showSlide('ĐÃ ĐÓNG HÀNG','ok');
      vibrate([80,60,80]);
      markScanned(code);
    } catch (e) {
      setInfo('err','Lỗi cập nhật trạng thái: ' + (e.message || e));
      showSlide('LỖI CẬP NHẬT TRẠNG THÁI','err');
    }
  }
}


/* ===== onScan ===== */
async function onScan(res){
  if(!res)return;
  const code=safeTrim(res?.text); if(!code||code===last||scanLock)return;
  if(isBlocked(code)){setInfo('','Mã này vừa quét rồi — chờ 2 phút.');showSlide('MÃ VỪA QUÉT — CHỜ 2 PHÚT','warn');vibrate([40,40,40]);return;}
  clearTimeout(noScanTimer);startNoScanTimer();
  last=code;scanLock=true;

  await playScanBeep(); // âm báo đã quét

  if(MODE==='vd')mavd&&(mavd.value=code);else madon&&(madon.value=code);
  setInfo('','Đã quét: '+code+' → đang lưu...');showSlide('ĐANG LƯU MÃ: '+code,'info',1600);
  try{await doSaveByMode(code);}catch(e){setInfo('err','Lỗi lưu: '+(e.message||e));showSlide('LỖI LƯU','err');}
  finally{setTimeout(()=>{scanLock=false;last='';},800);}
}
$('#saveBtn')?.addEventListener('click',()=>doSaveByMode());

/* ===== Bottom sheets (Đơn hàng, Chi tiết) ===== */
const fabScan=$('#fabScan'), tabOrders=$('#tabOrders'),tabMap=$('#tabMap');
const ordersWrap=$('#ordersWrap'),ordersSheet=$('#ordersSheet'),ordersList=$('#ordersList'),ordersEmpty=$('#ordersEmpty'),statusFilter=$('#statusFilter');
const detailWrap=$('#detailWrap'),detailSheet=$('#detailSheet'),detailTitle=$('#detailTitle'),ctBody=$('#ctBody');
const backOrders=$('#backOrders');

function openSheet(wrap,sheet){if(!wrap||!sheet)return;wrap.style.display='block';requestAnimationFrame(()=>sheet.classList.add('active'));}
function closeSheet(wrap,sheet){if(!wrap||!sheet)return;sheet.classList.remove('active');setTimeout(()=>wrap.style.display='none',220);}
function attachSwipe(wrap,sheet){
  if(!wrap||!sheet)return;
  let y0=0,y=0,drag=false;
  sheet.addEventListener('touchstart',e=>{drag=true;y0=e.touches[0].clientY;sheet.style.transition='none';});
  sheet.addEventListener('touchmove',e=>{if(!drag)return;y=e.touches[0].clientY;const dy=Math.max(0,y-y0);sheet.style.transform=`translateY(${dy}px)`;});
  sheet.addEventListener('touchend',()=>{sheet.style.transition='transform .2s ease';const dy=Math.max(0,y-y0);if(dy>100)closeSheet(wrap,sheet);else sheet.style.transform='translateY(0)';drag=false;y0=y=0;});
  wrap.addEventListener('click',e=>{if(e.target===wrap)closeSheet(wrap,sheet);});
}
attachSwipe(ordersWrap,ordersSheet);attachSwipe(detailWrap,detailSheet);

/* ====== MAP SHEET (iframe map_tuyen.html) ====== */
(function(){
  let mapWrap=null,mapSheet=null,mapFrame=null,tempQuery=null;
  function ensureMapSheet(){
    if(mapWrap) return;
    mapWrap=document.createElement('div'); mapWrap.id='mapWrap';
    mapWrap.style.cssText='position:fixed;inset:0;display:none;background:rgba(0,0,0,.08);z-index:9998';
    mapWrap.innerHTML=`
      <div id="__mapSheet" style="position:fixed;left:0;right:0;bottom:0;margin:0 auto;width:calc(100vw - 24px);max-width:900px;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -8px 24px rgba(0,0,0,.18);transition:transform .22s ease;transform:translateY(100%);overflow:hidden">
        <div id="__mapHeader" style="padding:10px 12px;border-bottom:1px solid #eee">
          <div style="width:44px;height:4px;background:#c9d2dc;border-radius:4px;margin:0 auto"></div>
        </div>
        <div style="padding:8px 12px 6px;font-weight:700">Bản đồ tuyến</div>
        <iframe id="__mapFrame" src="" style="display:block;border:0;width:100%;height:calc(100vh - 160px)"></iframe>
      </div>`;
    document.body.appendChild(mapWrap);
    mapSheet=mapWrap.querySelector('#__mapSheet');
    mapFrame=mapWrap.querySelector('#__mapFrame');
    mapWrap.addEventListener('click',e=>{if(e.target===mapWrap)closeMapSheet();});
    mapWrap.querySelector('#__mapHeader').addEventListener('click',closeMapSheet);
    let y0=0,y=0,drag=false;
    mapSheet.addEventListener('touchstart',e=>{drag=true;y0=e.touches[0].clientY;mapSheet.style.transition='none';});
    mapSheet.addEventListener('touchmove',e=>{if(!drag)return;y=e.touches[0].clientY;const dy=Math.max(0,y-y0);mapSheet.style.transform=`translateY(${dy}px)`;});
    mapSheet.addEventListener('touchend',()=>{mapSheet.style.transition='transform .22s ease';const dy=Math.max(0,y-y0);if(dy>100)closeMapSheet();else mapSheet.style.transform='translateY(0)';drag=false;y0=y=0;});
  }
  function injectNoLogoCSS(){
    try{
      const d=mapFrame.contentDocument||mapFrame.contentWindow.document;
      const css = `
        .leaflet-control-attribution, .leaflet-control-container, [class*="attribution"], [aria-label*="Attribution"] { display:none !important; }
        img[alt*="OpenStreetMap"], img[alt*="Carto"], a[href*="openstreetmap"]{ display:none !important; }`;
      const st=d.createElement('style'); st.textContent=css; d.head.appendChild(st);
    }catch{}
  }
  function openMapSheet(queryText){
    ensureMapSheet();
    tempQuery = queryText || null;
    mapFrame.removeAttribute('src'); mapFrame.src='map_tuyen.html?no_logo=1';
    mapFrame.onload=()=>{
      injectNoLogoCSS();
      const qText = tempQuery ?? (localStorage.getItem('MAP_QUERY')||'');
      if(qText) pushQueryAndReloadMap(qText);
      tempQuery=null;
    };
    mapWrap.style.display='block'; requestAnimationFrame(()=>{mapSheet.style.transform='translateY(0)';});
    document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden';
  }
  function closeMapSheet(){
    mapSheet.style.transform='translateY(100%)';
    setTimeout(()=>{mapWrap.style.display='none';},220);
    document.documentElement.style.overflow=''; document.body.style.overflow='';
  }
  function pushQueryAndReloadMap(queryText){
    if(!mapFrame||!mapFrame.contentWindow) return;
    const tryFill=()=>{
      const w=mapFrame.contentWindow,d=w.document;
      try{ if(typeof w.setQuery==='function'&&typeof w.reloadMap==='function'){w.setQuery(queryText);w.reloadMap();return true;} }catch{}
      try{
        const input=d.querySelector('#q,#search,#query,input[name="q"],input[type="search"]');
        if(!input) return false;
        input.value=queryText; ['input','change','keyup'].forEach(t=>input.dispatchEvent(new Event(t,{bubbles:true})));
        let reloadBtn=d.querySelector('#btnReload,[data-reload]')||Array.from(d.querySelectorAll('button,a')).find(el=>safeTrim(el.textContent).toLowerCase().includes('tải lại'));
        if(reloadBtn){reloadBtn.click();return true;}
        const form=input.form||input.closest('form'); if(form){form.requestSubmit?form.requestSubmit():form.submit();return true;}
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
        return true;
      }catch{}
      try{w.postMessage({type:'MAP_SET_AND_RELOAD',query:queryText},'*');return true;}catch{}
      return false;
    };
    let tries=0;const t=setInterval(()=>{tries++;if(tryFill()||tries>25)clearInterval(t);},100);
  }
  function getVisibleCustomerIds(){
    if(!ordersList) return [];
    return [...ordersList.querySelectorAll('.order')]
      .filter(el=>getComputedStyle(el).display!=='none')
      .map(el=>safeTrim(el.dataset.kh))
      .filter(Boolean)
      .filter((v,i,a)=>a.indexOf(v)===i);
  }
  function openMapByCurrentFilter(){
    const ids=getVisibleCustomerIds(); const qText=ids.length?('ma: '+ids.join(' ')):'';
    try{localStorage.setItem('MAP_QUERY',qText);}catch{}
    openMapSheet();
  }
  $('#tabMap')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openMapByCurrentFilter();});
  $('#ordersMapLink')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openMapByCurrentFilter();});
  window.__openMapForOneCustomer = (ma_kh) => {
    const q='ma: '+safeTrim(ma_kh);
    if(!safeTrim(q)) return;
    openMapSheet(q);
  };
})();

/* ===== Header đơn hàng: chèn link “Xem bản đồ” (nếu thiếu) ===== */
(function injectOrdersHeaderMapLink(){
  const header=document.getElementById('ordersHeader');
  if(!header||document.getElementById('ordersMapLink'))return;
  const a=document.createElement('a');
  a.id='ordersMapLink';a.href='#';a.textContent='🗺️ Xem bản đồ';
  a.style.marginLeft='12px';a.style.fontWeight='700';
  a.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();const btn=document.getElementById('tabMap');btn?.click();});
  const select=document.getElementById('statusFilter');
  if(select&&select.parentElement)select.parentElement.insertBefore(a,select);else header.appendChild(a);
})();

/* ===== Phân trang danh sách đơn ===== */
let CURRENT_PAGE=1, PAGE_SIZE=50, TOTAL_ITEMS=null, TOTAL_PAGES=1;
const PAGING = {wrap:null, prev:null, next:null, info:null, sizeSel:null};
function ensurePaginationUI(){
  if(PAGING.wrap) return;
  PAGING.wrap=document.createElement('div');
  PAGING.wrap.id='ordersPaging';
  PAGING.wrap.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 6px;border-top:1px solid #eee;margin-top:8px';
  PAGING.wrap.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px">
      <button id="pgPrev" style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;background:#fafafa">Trang trước</button>
      <span id="pgInfo" style="min-width:140px;display:inline-block;text-align:center">Trang 1/1</span>
      <button id="pgNext" style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;background:#fafafa">Trang sau</button>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <label for="pgSize" style="color:#6b7280">Dòng/trang</label>
      <select id="pgSize" style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="200">200</option>
      </select>
    </div>`;
  ordersSheet?.appendChild(PAGING.wrap);
  PAGING.prev=PAGING.wrap.querySelector('#pgPrev');
  PAGING.next=PAGING.wrap.querySelector('#pgNext');
  PAGING.info=PAGING.wrap.querySelector('#pgInfo');
  PAGING.sizeSel=PAGING.wrap.querySelector('#pgSize');
  PAGING.prev.addEventListener('click',()=>{ if(CURRENT_PAGE>1){CURRENT_PAGE--;loadOrders();} });
  PAGING.next.addEventListener('click',()=>{ if(CURRENT_PAGE<TOTAL_PAGES){CURRENT_PAGE++;loadOrders();} });
  PAGING.sizeSel.addEventListener('change',()=>{ PAGE_SIZE=Number(PAGING.sizeSel.value)||50; CURRENT_PAGE=1; loadOrders(); });
}

/* ===== Sự kiện mở tab Đơn hàng: mặc định “Đang giao hàng” ===== */
function setDefaultStatusFilter(){
  if(!statusFilter) return;
  const want='Đang giao hàng';
  if (![...statusFilter.options].some(o=>o.value===want)) {
    const opt=document.createElement('option'); opt.value=want; opt.textContent=want; statusFilter.appendChild(opt);
  }
  statusFilter.value=want;
}
document.addEventListener('DOMContentLoaded',()=>{ setDefaultStatusFilter(); });
tabOrders?.addEventListener('click',async()=>{ setDefaultStatusFilter(); CURRENT_PAGE=1; await loadOrders(); openSheet(ordersWrap,ordersSheet); });
statusFilter?.addEventListener('change',()=>{ CURRENT_PAGE=1; loadOrders(); });

document.getElementById('ordersHeader')?.addEventListener('click',(e)=>{
  const t=e.target;
  if(t.tagName?.toLowerCase()==='select'||t.closest('select')||t.id==='ordersMapLink'||t.closest('#ordersMapLink')||t.id==='tabMap'||t.closest('#tabMap')){e.stopPropagation();return;}
  closeSheet(ordersWrap,ordersSheet);
});
document.getElementById('detailHeader')?.addEventListener('click',()=>closeSheet(detailWrap,detailSheet));

/* ===== Đơn hàng + LOAD có phân trang ===== */
function toTelLink(v){
  const raw=String(v||'').replace(/\D+/g,'');if(!raw)return'';
  const intl=raw.startsWith('0')?'+84'+raw.slice(1):(raw.startsWith('84')?('+'+raw):('+'+raw));
  return `<a class="tel" href="tel:${intl}">${v||''}</a>`;
}
async function loadOrders(){
  ensurePaginationUI();
  const f=safeTrim(statusFilter?.value);
  const offset=(CURRENT_PAGE-1)*PAGE_SIZE;
  const params={order:`${DATE_COL}.desc.nullslast`,limit:PAGE_SIZE,offset};
  if(f) params.trang_thai=`eq.${f}`;

  try{
    const {rows,total}=await sbSelectWithCount(
      TABLE_DON,
      params,
      `${KEY_DON_HD},${KEY_KH},ten_kh,dien_thoai,dia_chi,trang_thai,tong_tien,${DATE_COL}`
    );

    TOTAL_ITEMS = typeof total==='number' ? total : (rows?.length||0);
    TOTAL_PAGES = Math.max(1, Math.ceil(TOTAL_ITEMS / PAGE_SIZE));
    if (PAGING.info) PAGING.info.textContent = `Trang ${CURRENT_PAGE}/${TOTAL_PAGES}`;
    PAGING.prev.disabled = CURRENT_PAGE<=1;
    PAGING.next.disabled = CURRENT_PAGE>=TOTAL_PAGES;

    renderOrders(rows||[]);
  }catch(e){
    console.error('loadOrders error',e);
    ordersList&&(ordersList.innerHTML='');ordersEmpty&&(ordersEmpty.style.display='block');
    if (PAGING.info) PAGING.info.textContent = `Trang ${CURRENT_PAGE}/${TOTAL_PAGES}`;
  }
}
function renderOrders(rows){
  if(!ordersList)return;
  ordersList.innerHTML='';
  if(!rows.length){ordersEmpty&&(ordersEmpty.style.display='block');return;}
  ordersEmpty&&(ordersEmpty.style.display='none');
  rows.forEach(r=>{
    const ma=safeTrim(r?.[KEY_DON_HD]);const st=safeTrim(r?.trang_thai)||'Chưa rõ';
    const ma_kh=r[KEY_KH]||'';
    const div=document.createElement('div');
    div.className='order';div.dataset.kh=ma_kh;
    div.innerHTML=`
      <div class="row1">
        <a href="#" class="hd-link" data-ma="${ma}">${ma}</a>
        <span class="badge">${st}</span>
      </div>
      <div class="row2">
        <span>${fmtDateVN(r[DATE_COL]||Date.now())}</span>
        <span class="money">${fmtMoney(r.tong_tien)}</span>
      </div>
      <div class="row3" style="justify-content:space-between">
        <span>KH: ${r.ten_kh||''}</span>
        <span>ĐT: ${toTelLink(r.dien_thoai)}</span>
      </div>
      <div class="row3" style="justify-content:flex-start">
        <span>ĐC: ${r.dia_chi||''}</span>
      </div>
      <div class="row4" style="margin-top:6px">
        <a href="#" class="map-link" data-kh="${ma_kh}">Xem bản đồ</a>
      </div>`;
    div.querySelector('.hd-link')?.addEventListener('click',async(e)=>{e.preventDefault();await openDetail(ma);});
    div.querySelector('.map-link')?.addEventListener('click',(e)=>{
      e.preventDefault();e.stopPropagation();
      const kh=safeTrim(ma_kh);if(!kh){showSlide('KHÔNG CÓ MÃ KHÁCH','warn');return;}
      window.__openMapForOneCustomer(kh);
    });
    ordersList.appendChild(div);
  });
}

/* ===== Chi tiết đơn ===== */
async function openDetail(ma){
  if(!detailTitle||!ctBody)return;
  detailTitle.textContent='HĐ: '+ma;
  ctBody.innerHTML='<tr><td colspan="4">Đang tải...</td></tr>';
  openSheet(detailWrap,detailSheet);
  try{
    const rows=await sbSelect(TABLE_CT,{[KEY_DON_HD]:`eq.${ma}`,order:'ten_h.asc'},'ten_h,so_luong,don_gia,thanh_tien');
    renderCT(rows||[]);
  }catch(e){ctBody.innerHTML=`<tr><td colspan="4">Lỗi tải chi tiết</td></tr>`;showSlide('LỖI TẢI CHI TIẾT','err');}
}
function renderCT(rows){
  if(!ctBody)return;
  let sum=0;ctBody.innerHTML='';
  rows.forEach(r=>{
    sum+=Number(r.thanh_tien||0);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.ten_h||''}</td><td>${r.so_luong||0}</td><td>${fmtMoney(r.don_gia)}</td><td>${fmtMoney(r.thanh_tien)}</td>`;
    ctBody.appendChild(tr);
  });
  const tr=document.createElement('tr');tr.className='total-row';
  tr.innerHTML=`<td>Tổng cộng</td><td></td><td></td><td>${fmtMoney(sum)}</td>`;
  ctBody.appendChild(tr);
}
backOrders?.addEventListener('click',()=>{closeSheet(detailWrap,detailSheet);});

/* ===== Realtime (nhẹ) ===== */
let ch = null;
supabaseReady.then(() => {
  ch = supa.channel('rt-don-hang')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:TABLE_DON},p=>{
      if(ordersWrap?.style.display==='block') loadOrders();
      try{ pushNotify(`➕ Thêm đơn mới ${p.new?.[KEY_DON_HD]||''}`); }catch{}
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:TABLE_DON},p=>{
      if(ordersWrap?.style.display==='block') loadOrders();
      try{
        const ma = p.new?.[KEY_DON_HD] || p.old?.[KEY_DON_HD] || '';
        const tt = safeTrim(p?.new?.trang_thai);
        pushNotify(`🔄 Cập nhật đơn ${ma}${tt?` → “${tt}”`:''}`);
      }catch{}
    })
    .subscribe(status => {
      console.log('[GIAO HÀNG] Realtime:', status);
    });
}).catch(error => {
  console.error('[REALTIME] Không khởi tạo được:', error);
});

/* ===== Nút nổi scan ===== */
fabScan?.addEventListener('click',()=>{if(document.getElementById('app')?.style.display!=='block')return;$('#startBtn')?.click();showSlide('MỞ CAMERA QUÉT','info');});

/* Ghi chú: KHÔNG xin/quản lý vị trí tại file này. Check-in mở full-screen từ TRÊN xuống. */

    /*
     * Đăng xuất chung.
     * Dùng capture=true để xử lý trước sự kiện đăng xuất cũ
     * trong app_giao_hang.js nếu vẫn còn.
     */
    document
      .getElementById("logout")
      ?.addEventListener(
        "click",
        event => {
          event.preventDefault();
          event.stopImmediatePropagation();

          try {
            localStorage.removeItem("nv");
            localStorage.removeItem(
              "chatwoot_crm_user"
            );

            sessionStorage.removeItem(
              "nv_ctx"
            );

            sessionStorage.removeItem(
              "APP_ACCESS"
            );
          } catch (error) {
            console.warn(
              "[GIAO HÀNG] Lỗi khi xóa phiên đăng nhập:",
              error
            );
          }

          location.replace("./login.html");
        },
        true
      );
