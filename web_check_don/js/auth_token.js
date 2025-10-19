// ===================== auth_token.js =====================

// Tạo token ngẫu nhiên (16 bytes → 32 hex) và lưu vào sessionStorage
window.makeAccess = function () {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const token = Array.from(arr, b => b.toString(16).padStart(2,'0')).join('');
  sessionStorage.setItem('APP_ACCESS', token);   // giữ cho toàn bộ reload trong TAB này
  return token;
};

// Kiểm tra: chỉ hợp lệ nếu token URL == token lưu trong sessionStorage
window.checkAccess = function () {
  const tokenUrl   = new URLSearchParams(location.search).get('token') || '';
  const tokenSaved = sessionStorage.getItem('APP_ACCESS');
  if (!(tokenUrl && tokenSaved && tokenUrl === tokenSaved)) {
    alert('Không có quyền truy cập trang này!');
    location.href = 'index.html';
  }
  // ❗ KHÔNG xóa tokenSaved — để refresh (F5/CTRL+R) vẫn hợp lệ trong cùng TAB
};
