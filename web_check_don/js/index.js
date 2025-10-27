// ===================== js/index.js =====================
// KHÔNG gọi requireAuth bắt buộc. Dùng token + case đã lưu.

(() => {
  // 1) Bắt buộc có token
  if (typeof window.checkAccess === 'function') {
    const ok = checkAccess(); // tự đồng bộ token URL <-> sessionStorage
    if (!ok) return;
  }

  // 2) Đọc case
  let nv = {};
  try { nv = JSON.parse(localStorage.getItem('nv') || '{}'); } catch { nv = {}; }

  const $ = s => document.querySelector(s);
  const showIf = (sel, cond) => {
    const el = $(sel);
    if (!el) return;
    el.style.display = cond ? '' : 'none';
    if (cond) el.classList.remove('hidden');
  };
  const toBool = v => v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1';

  try {
    // 3) Không có case -> về login
    if (!nv || !nv.ma_nv) {
      alert('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.');
      location.replace('./login.html');
      return;
    }

    // 4) hoat_dong bị tắt -> về login
    if (!toBool(nv.hoat_dong)) {
      alert('Tài khoản đã bị dừng hoạt động.');
      localStorage.removeItem('nv');
      location.replace('./login.html');
      return;
    }

    // 5) Tên NV
    $('#ten_nv') && ($('#ten_nv').textContent = nv.ten_nv || nv.ma_nv || '');

    // 6) Quyền (4 nút)
    showIf('#admin',    toBool(nv.admin));
    showIf('#donghang', toBool(nv.dong_hang));
    showIf('#checkdon', toBool(nv.check_don));
    showIf('#mapview',  toBool(nv.map));

    // 7) Điều hướng giữ token
    const go = (url) => {
      const tok = sessionStorage.getItem('APP_ACCESS');
      const u = new URL(url, location.origin);
      if (tok) u.searchParams.set('token', tok);
      location.href = u.toString();
    };
    $('#admin')   ?.addEventListener('click', () => go('./admin.html'));
    $('#donghang')?.addEventListener('click', () => go('./Quan_ly_cod.html'));
    $('#checkdon')?.addEventListener('click', () => go('./check_don.html'));
    $('#mapview') ?.addEventListener('click', () => go('./map_tuyen.html'));

    // 8) Logout
    $('#btnLogout')?.addEventListener('click', () => {
      try { sessionStorage.removeItem('APP_ACCESS'); } catch {}
      localStorage.removeItem('nv');
      location.replace('./login.html');
    });

    // 9) Không có quyền nào -> hiện note
    const hasAny = toBool(nv.admin) || toBool(nv.dong_hang) || toBool(nv.check_don) || toBool(nv.map);
    if (!hasAny) {
      const note = document.createElement('div');
      note.style.cssText = 'text-align:center;color:#9aa7c7;margin-top:16px';
      note.textContent = 'Tài khoản chưa được cấp quyền chức năng nào. Liên hệ quản trị viên.';
      document.querySelector('.menu')?.appendChild(note);
    }
  } catch (e) {
    console.error('INDEX_INIT_ERROR:', e);
    alert('Có lỗi khi khởi tạo trang. Xem console để biết chi tiết.');
  } finally {
    document.body.style.visibility = 'visible';
  }
})();
