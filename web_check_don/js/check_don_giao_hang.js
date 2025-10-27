/* ====================================================================
   File: js/check_don_giao_hang.js
   Mảng: Logic nghiệp vụ form con "Kiểm tra đơn hàng"
   Chức năng tổng quan:
   - Kết nối Supabase bằng makeSb('check')  // nối sau: makeSb() - supabase_connect.js
   - Đọc thông tin đơn + chi tiết            // dùng table từ getConfig('check')
   - Kiểm hàng (số lượng kiểm)               // cập nhật bảng chi tiết
   - Xác nhận / Giao hàng                    // cập nhật bảng đơn + webhook + postMessage
   ==================================================================== */

/* =================== CONFIG =================== */
const EMP_TABLE = "kv_nhan_vien";  // bảng nhân viên
const EMP_NAME_COL = "ten_nv";     // cột tên NV
const CT_TABLE_FALLBACK = "don_hang_chitiet"; // bảng chi tiết nếu không suy ra được

/* =================== Helpers =================== */
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function getParam(n){ return new URLSearchParams(location.search).get(n)||"" }  // lấy query param
function money(v){ try{return Number(v).toLocaleString('vi-VN')}catch{return v??''} } // format tiền
function setSBState(ok,msg){ document.getElementById('state').innerHTML = `Supabase: <b class="${ok?'ok':'err'}">${esc(msg)}</b>` } // hiển thị trạng thái

/* =================== KẾT NỐI SUPABASE =================== */
/**
 * getSbAndTables()
 * - Tạo client Supabase và xác định tên bảng đơn/chi tiết
 * - Nối sau: makeSb('check') -> từ js/supabase_connect.js, getConfig('check') -> js/cod_config.js
 */
function getSbAndTables(){
  const { sb, table } = window.makeSb('check'); // { sb, table } // bảng đơn từ cấu hình
  // Suy tên bảng chi tiết: <table>_chitiet nếu tồn tại, nếu không dùng Fallback
  const ctTable = (table && table.endsWith('_chitiet')) ? table :
                  (table ? `${table}_chitiet` : CT_TABLE_FALLBACK);
  return { sb, table, ctTable };
}

/* =================== NHÂN VIÊN =================== */
/**
 * fillEmployees()
 * - Đổ <datalist id="nvList"> từ bảng nhân viên
 * - Cố gắng phát hiện cột id: id -> id_nv -> ma_nv
 */
async function fillEmployees(){
  const { sb } = getSbAndTables();
  const dl=document.getElementById('nvList');
  const candidates=['id','id_nv','ma_nv'];
  let data=null, idCol=null;

  for(const col of candidates){
    const r=await sb.from(EMP_TABLE).select(`${col}, ${EMP_NAME_COL}`).order(EMP_NAME_COL,{ascending:true}).limit(2000);
    if(!r.error && Array.isArray(r.data)){ data=r.data; idCol=col; break; }
  }
  if(!data){
    const r=await sb.from(EMP_TABLE).select(EMP_NAME_COL).order(EMP_NAME_COL,{ascending:true}).limit(2000);
    data=r.data||[]; idCol=null;
  }

  dl.innerHTML=(data||[]).map(r=>{
    const name=(r?.[EMP_NAME_COL]??'').toString().trim();
    const id=idCol ? (r?.[idCol]??'') : '';
    const attrId = id ? ` data-id="${esc(id)}"` : '';
    return `<option value="${esc(name)}"${attrId}></option>`;
  }).join('');

  return idCol; // trả về tên cột id phát hiện được
}

/** getEmpIdByName(name) // tìm id theo tên trong datalist */
function getEmpIdByName(name){
  const dl=document.getElementById('nvList');
  const opt=[...dl.options].find(o=>o.value===name);
  return opt?.dataset?.id || '';
}

/* =================== THÔNG TIN ĐƠN =================== */
/** loadOrderInfo() // đọc bảng đơn (table) theo ma_hd và hiển thị header */
async function loadOrderInfo(){
  const { sb, table } = getSbAndTables();
  const ma_hd=getParam('ma_hd').trim(); document.getElementById('v_mahd').textContent=ma_hd||'—';
  if(!ma_hd){ setSBState(false,'thiếu ma_hd trên URL'); return; }

  const { data, error } = await sb.from(table)
    .select('ma_hd,ten_kh,dia_chi,tong_tien,dien_thoai').eq('ma_hd',ma_hd).maybeSingle();
  if(error){ setSBState(false,error.message||String(error)); return; }
  if(!data){ setSBState(false,'không tìm thấy đơn'); return; }

  document.getElementById('v_tenkh').textContent=data.ten_kh||'—';
  document.getElementById('v_dthoai').textContent=data.dien_thoai||'—';
  document.getElementById('v_dc').textContent=data.dia_chi||'—';
  document.getElementById('v_tong').textContent=data.tong_tien!=null?money(data.tong_tien):'—';
  setSBState(true,'sẵn sàng');
}

/* =================== CHI TIẾT ĐƠN =================== */
/** loadOrderLines() // đọc bảng chi tiết và render bảng */
async function loadOrderLines(){
  const { sb, ctTable } = getSbAndTables();
  const ma_hd=getParam('ma_hd').trim();
  const tb=document.getElementById('ctBody');
  if(!ma_hd){ tb.innerHTML='<tr><td colspan="6" class="muted">thiếu mã hóa đơn.</td></tr>'; return; }

  const { data, error } = await sb.from(ctTable)
    .select('ma_h,ten_h,don_gia,so_luong,so_luong_kiem,thanh_tien')
    .eq('ma_hd',ma_hd).order('ma_h',{ascending:true});
  if(error){ tb.innerHTML=`<tr><td colspan="6">lỗi: ${esc(error.message||String(error))}</td></tr>`; return; }
  if(!data?.length){ tb.innerHTML='<tr><td colspan="6">không có chi tiết.</td></tr>'; return; }

  let sumQty=0,sumAmt=0,sumKiem=0;
  tb.innerHTML=data.map(r=>{
    const qty=Number(r.so_luong)||0;
    const kiem=Number(r.so_luong_kiem)||0;
    const amt=Number(r.thanh_tien)||0;
    sumQty+=qty; sumAmt+=amt; sumKiem+=kiem;
    return `
      <tr data-ma="${esc(r.ma_h||'')}" data-qty="${qty}">
        <td>${esc(r.ma_h||'')}</td>
        <td>${esc(r.ten_h||'')}</td>
        <td class="right">${r.don_gia!=null?money(r.don_gia):''}</td>
        <td class="right">${qty}</td>
        <td class="right">
          <input class="kiem-input" type="number" min="0" value="${kiem}" />
          <span class="kiem-tick" style="margin-left:8px;color:#2dd4bf;font-weight:700;"></span>
        </td>
        <td class="right">${amt?money(amt):''}</td>
      </tr>`;
  }).join('');

  document.getElementById('sumSL').textContent=sumQty;
  document.getElementById('sumKiem').textContent=sumKiem;
  document.getElementById('sumTien').textContent=money(sumAmt);

  const rows=[...tb.querySelectorAll('tr[data-ma]')];
  function decorateRow(tr, qty, kiem){
    tr.classList.remove('done','over');
    const tick=tr.querySelector('.kiem-tick');
    if(kiem>qty){tr.classList.add('over'); tick.textContent='';}
    else if(kiem===qty){tr.classList.add('done'); tick.textContent='✓';}
    else {tick.textContent='';}
  }
  function recalc(){
    let sK=0;
    rows.forEach(tr=>{
      const qty=Number(tr.dataset.qty)||0;
      const inp=tr.querySelector('.kiem-input');
      const v=Math.max(0,Number(inp.value||0));
      inp.value=v; sK+=v; decorateRow(tr,qty,v);
    });
    document.getElementById('sumKiem').textContent=sK;
    updateButtonsState();
  }
  rows.forEach(tr=>{
    const qty=Number(tr.dataset.qty)||0;
    const inp=tr.querySelector('.kiem-input');
    decorateRow(tr,qty,Number(inp.value||0));
    inp.addEventListener('input',recalc);
  });
  updateButtonsState();
}

/** collectStates() // gom dữ liệu kiểm từ bảng */
function collectStates(){
  const rows=[...document.querySelectorAll('#ctBody tr[data-ma]')];
  return rows.map(tr=>({
    ma:tr.dataset.ma,
    qty:Number(tr.dataset.qty)||0,
    kiem:Number(tr.querySelector('.kiem-input').value)||0,
    el:tr
  }));
}

/** ensureAllMatched(states) // kiểm tra đã khớp hết chưa */
function ensureAllMatched(states){
  const bad=states.filter(s=>s.kiem!==s.qty);
  const over=states.filter(s=>s.kiem>s.qty);
  return {badCount:bad.length,overCount:over.length,firstBadEl:bad[0]?.el};
}

/* =================== GHI DB =================== */
/**
 * writeUpdates(states,nvConfirmName,nvShipName)
 * - Cập nhật số_lượng_kiểm ở bảng chi tiết
 * - Cập nhật đơn: nv_xac_nhan_don, trang_thai, nv_giao_hang
 * - Nối sau: cấu trúc bảng thực tế của bạn (đổi tên cột nếu khác)
 */
async function writeUpdates(states,nvConfirmName,nvShipName){
  const { sb, table, ctTable } = getSbAndTables();
  const ma_hd=getParam('ma_hd').trim();

  // cập nhật các dòng chi tiết
  const lineResults = await Promise.all(states.map(s=>
    sb.from(ctTable).update({so_luong_kiem:s.kiem}).eq('ma_hd',ma_hd).eq('ma_h',s.ma).select('ma_hd,ma_h')
  ));
  const affected=lineResults.reduce((n,r)=>n+((r.data&&r.data.length)||0),0);
  if(affected!==states.length) throw new Error(`chỉ cập nhật được ${affected}/${states.length} dòng (kiểm tra RLS/ma_hd/ma_h).`);

  // cập nhật bảng đơn
  const upd={ nv_xac_nhan_don: nvConfirmName, trang_thai:'Đã kiểm tra' };
  if(nvShipName) upd.nv_giao_hang = nvShipName;

  const { data, error } = await sb.from(table).update(upd).eq('ma_hd',ma_hd).select('ma_hd');
  if(error) throw error; if(!data?.length) throw new Error('không tìm thấy đơn để cập nhật.');
}

/* =================== WEBHOOK + UI BIND =================== */
/** callWebhookSilent(params) // ping webhook im lặng */
function callWebhookSilent(params){
  const base='https://dhsybbqoe.datadex.vn/webhook/xac-nhan-don-hang';
  const url = `${base}?` + new URLSearchParams(params).toString();
  try{ const img=new Image(1,1); img.style.cssText='position:absolute;opacity:0;pointer-events:none'; img.src=url+'&_='+Date.now(); img.onload=img.onerror=()=>{try{img.remove();}catch(_){}}; document.body.appendChild(img);}catch(_){}
  try{ fetch(url,{method:'GET',mode:'no-cors',keepalive:true}).catch(()=>{}); }catch(_){}
}

/** setupScanFocus() // highlight khi focus ô quét */
function setupScanFocus(){ const scan=document.getElementById('scanMH'); const add=()=>scan.classList.add('scan-focus'); const rm=()=>scan.classList.remove('scan-focus'); scan.addEventListener('focus',add); scan.addEventListener('blur',rm); setTimeout(()=>{scan.focus();add();},0); }

/** updateButtonsState() // bật/tắt nút khi khớp hết số lượng */
function updateButtonsState(){
  const rows=[...document.querySelectorAll('#ctBody tr[data-ma]')];
  const allMatch=rows.length>0 && rows.every(tr=>{
    const qty=Number(tr.dataset.qty)||0;
    const kiem=Number(tr.querySelector('.kiem-input').value)||0;
    return kiem===qty;
  });
  document.getElementById('btnConfirm').disabled=!allMatch;
  document.getElementById('btnShip').disabled=!allMatch;
}

/** prefillNhanVienXacNhanFromParent() // gán sẵn NV XN từ URL nếu có */
const NV_XN_FROM_PARENT = (getParam('nv_xn') || '').trim();
function prefillNhanVienXacNhanFromParent(){
  if(!NV_XN_FROM_PARENT) return;
  const ip = document.getElementById('nvConfirm');
  ip.value = NV_XN_FROM_PARENT;
  ip.dispatchEvent(new Event('input', { bubbles: true }));
  ip.readOnly = true; ip.removeAttribute('list'); ip.setAttribute('aria-readonly','true');
  ip.classList.add('locked'); ip.title = 'Tên NV được gán từ tham số URL';
}

/** closeChildForm() // đóng popup/child window an toàn */
function closeChildForm(){
  try { window.onbeforeunload = null; } catch(_){}
  try{ window.close(); }catch(_){}
  try{ window.open('','_self'); window.close(); }catch(_){}
  try{ location.replace('about:blank'); }catch(_){}
}

/** bindItemsUI() // mọi event UI: quét mã, tìm tên, nút xác nhận/giao hàng */
let IS_SUBMITTING = false;
function bindItemsUI(){
  const scan=document.getElementById('scanMH');
  const search=document.getElementById('searchMH');

  scan.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const code=(scan.value||'').trim(); if(!code) return;
      const tr=document.querySelector(`#ctBody tr[data-ma="${CSS.escape(code)}"]`);
      if(!tr){ setSBState(false,`không tìm thấy mã hàng: ${esc(code)}`); scan.value=''; scan.focus(); return; }
      const inp=tr.querySelector('.kiem-input'); inp.value=(Number(inp.value||0)+1);
      inp.dispatchEvent(new Event('input',{bubbles:true})); updateButtonsState(); scan.value=''; scan.focus();
    }
  });
  search.addEventListener('input',()=>{ const kw=search.value.trim(); if(kw.length>=2){ console.log('Tìm tên hàng:',kw); } });

  document.getElementById('btnConfirm').addEventListener('click', async ()=>{
    if (IS_SUBMITTING) return; IS_SUBMITTING = true;
    const nvConfirm=(document.getElementById('nvConfirm').value||'').trim();
    const nvShip   =(document.getElementById('nvShip').value||'').trim();
    if(!nvConfirm){ setSBState(false,'vui lòng chọn nhân viên xác nhận'); document.getElementById('nvConfirm').focus(); IS_SUBMITTING=false; return; }

    const states=collectStates(); if(!states.length){ setSBState(false,'không có dòng chi tiết để xác nhận'); IS_SUBMITTING=false; return; }
    const {badCount,overCount,firstBadEl}=ensureAllMatched(states);
    if(badCount){
      const msg=overCount?`còn ${badCount} dòng chưa khớp (có ${overCount} dòng vượt quá).`:`còn ${badCount} dòng chưa khớp.`;
      setSBState(false,msg); if(firstBadEl) firstBadEl.scrollIntoView({behavior:'smooth',block:'center'}); IS_SUBMITTING=false; return;
    }

    try{
      await writeUpdates(states,nvConfirm,nvShip||null);
      callWebhookSilent({
        ma_hd:getParam('ma_hd').trim(),
        id_xac_nhan:getEmpIdByName(nvConfirm),
        ten_xac_nhan:nvConfirm,
        id_giao_hang:getEmpIdByName(nvShip),
        ten_giao_hang:nvShip
      });
      setSBState(true,'xác nhận thành công ✓ (đã gửi webhook)');

      try {
        const target = window.opener || window.parent;
        if (target && target !== window) {
          const action = (nvShip && nvShip.length) ? 'ship' : 'confirm';
          target.postMessage({
            type: 'don-updated',
            action,
            ma_hd: getParam('ma_hd').trim(),
            nv: action === 'ship' ? nvShip : nvConfirm,
            status: action === 'ship' ? 'Đang giao hàng' : undefined
          }, '*');
          target.postMessage({ type: 'close-overlay' }, '*');
        }
      } catch (_) {}
      setTimeout(()=>{ try{ closeChildForm(); }catch(_){ } }, 80);
    }catch(err){
      setSBState(false,'lỗi khi cập nhật: '+(err.message||err));
    } finally { IS_SUBMITTING = false; }
  });

  document.getElementById('btnShip').addEventListener('click', ()=>{
    const nvShip=(document.getElementById('nvShip').value||'').trim();
    if(!nvShip){ setSBState(false,'vui lòng chọn nhân viên giao hàng'); document.getElementById('nvShip').focus(); return; }
    const nvConfirm=(document.getElementById('nvConfirm').value||'').trim();
    if(!nvConfirm){ setSBState(false,'vui lòng chọn nhân viên xác nhận'); document.getElementById('nvConfirm').focus(); return; }
    document.getElementById('btnConfirm').click();
  });
}

/* =================== INIT =================== */
/** Khởi động trang: đọc đơn + chi tiết + NV, bind UI */
document.addEventListener('DOMContentLoaded', async ()=>{
  await loadOrderInfo();
  await fillEmployees();
  prefillNhanVienXacNhanFromParent();
  bindItemsUI();
  setupScanFocus();
  await loadOrderLines();
});