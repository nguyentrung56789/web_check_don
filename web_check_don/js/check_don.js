// =====================================================
// KHỞI ĐỘNG CHECK_DON
// Hỗ trợ cả trường hợp check_don.js được load động
// sau khi DOMContentLoaded đã chạy
// =====================================================

let __CHECK_DON_INIT_RUNNING__ = false;
let __CHECK_DON_INIT_DONE__ = false;

async function startCheckDon() {
  // Chống init chạy 2 lần
  if (__CHECK_DON_INIT_RUNNING__ || __CHECK_DON_INIT_DONE__) {
    console.log('[CHECK_DON] init đã chạy hoặc đang chạy');
    return;
  }

  __CHECK_DON_INIT_RUNNING__ = true;

  try {
    console.log('[CHECK_DON] ===== START INIT =====');
    console.log('[CHECK_DON] document.readyState =', document.readyState);

    await init();

    __CHECK_DON_INIT_DONE__ = true;

    console.log('[CHECK_DON] ===== INIT OK =====');

  } catch (err) {

    console.error('[CHECK_DON] INIT ERROR:', err);

    const sbMsg = document.getElementById('sbMsg');

    if (sbMsg) {
      sbMsg.textContent =
        'Lỗi khởi tạo: ' +
        (err?.message || String(err));

      sbMsg.className = 'err';
    }

  } finally {
    __CHECK_DON_INIT_RUNNING__ = false;
  }
}


// =====================================================
// Nếu DOM chưa tải xong → đợi DOMContentLoaded
// Nếu DOM đã tải xong → chạy ngay
// =====================================================

if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    startCheckDon,
    { once: true }
  );

} else {

  startCheckDon();

}


// Cho phép debug từ Console
window.startCheckDon = startCheckDon;
