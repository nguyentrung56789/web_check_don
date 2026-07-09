/* ================== CẬP NHẬT ĐƠN HÀNG (WEBHOOK) ================== */
async function onCapNhatDon(){
  const ymd = getCapDateISO();
  const btn = document.getElementById('btnCapNhatDon');
  const oldText = btn ? btn.textContent : '⚡ Cập nhật đơn hàng';

  if (btn) {
    btn.disabled = true;
    btn.classList.remove('is-done');
    btn.classList.add('is-loading');
    btn.textContent = 'Đang cập nhật...';
  }

  setState(true, `đang cập nhật đơn hàng ngày ${isoToVN(ymd)}...`);
  showSlideBanner(`⏳ Đang cập nhật đơn hàng ngày ${isoToVN(ymd)}...`, 'ok');

  try{
    const webhookUrl =
      (typeof window.getConfig === 'function' && window.getConfig('webhook')) ||
      window.APP_CONFIG?.webhook ||
      window.APP_CONFIG?.webhookUrl ||
      window.APP_CONFIG?.webhook_url ||
      '';

    if (!webhookUrl) {
      throw new Error('Thiếu webhook trong /api/getConfig');
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'capnhathoadon',
        ngay_cap_nhat: ymd
      })
    });

    const text = await res.text().catch(()=> '');

    if (!res.ok) {
      throw new Error(text || `Webhook lỗi ${res.status}`);
    }

    setState(true, `OK - đã cập nhật ngày ${isoToVN(ymd)}`);
    showSlideBanner(`✅ Cập nhật đơn hàng ngày ${isoToVN(ymd)} thành công`, 'ok');

    if (btn) {
      btn.classList.remove('is-loading');
      btn.classList.add('is-done');
      btn.textContent = '✅ Cập nhật xong';
    }

    if (typeof reload === 'function') {
      await reload();
    }

    setTimeout(() => {
      if (btn) {
        btn.classList.remove('is-done');
        btn.textContent = oldText;
      }
      setState(true, 'sẵn sàng');
    }, 2500);

  }catch(e){
    const msg = e.message || e || 'Lỗi không xác định';

    setState(false, `Cập nhật lỗi: ${msg}`);
    showSlideBanner(`❌ Cập nhật lỗi: ${esc(msg)}`, 'err');

    if (btn) {
      btn.classList.remove('is-loading', 'is-done');
      btn.textContent = '❌ Lỗi cập nhật';
    }

    setTimeout(() => {
      if (btn) {
        btn.textContent = oldText;
      }
      setState(true, 'sẵn sàng');
    }, 3000);

  }finally{
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }
}
