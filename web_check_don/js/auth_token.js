// ===================== auth_token.js =====================

// Sinh token mới (khi đăng nhập)
window.makeAccess = function () {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const token = Array.from(arr, b => b.toString(16).padStart(2,'0')).join('');
  sessionStorage.setItem('APP_ACCESS', token);
  return token;
};

// Kiểm tra và tự đồng bộ token
window.checkAccess = function () {
  const tokenUrl   = new URLSearchParams(location.search).get('token') || '';
  const tokenSaved = sessionStorage.getItem('APP_ACCESS');

  // Trường hợp 1: URL có token, storage trống (mở tab mới) → lưu lại và chấp nhận
  if (tokenUrl && !tokenSaved) {
    sessionStorage.setItem('APP_ACCESS', tokenUrl);
    return true;
  }

  // Trường hợp 2: Storage có token, URL thiếu → tự thêm vào URL
  if (!tokenUrl && tokenSaved) {
    const url = new URL(location.href);
    url.searchParams.set('token', tokenSaved);
    history.replaceState({}, '', url.toString());
    return true;
  }

  // Trường hợp 3: Có cả 2 nhưng khác nhau → ưu tiên token URL, đồng bộ lại
  if (tokenUrl && tokenSaved && tokenUrl !== tokenSaved) {
    sessionStorage.setItem('APP_ACCESS', tokenUrl);
    return true;
  }

  // Trường hợp 4: cả 2 đều trống → chặn
  if (!tokenUrl && !tokenSaved) {
    alert('Không có quyền truy cập trang này!');
    location.href = 'index.html';
    return false;
  }

  return true;
};
