// ===================== cod_config.js =====================

// 1) CƠ SỞ DÙNG CHUNG (Supabase)
window.COD_BASE = {
  url: "https://cywtgdtsxajczljspwxe.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5d3RnZHRzeGFqY3psanNwd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3MzI1NjQsImV4cCI6MjA3MjMwODU2NH0.FZ6z6kfUWyf8l7WnA5J1wkrAy7KjpU6VT65EdyXCka8",
};

// 2) CẤU HÌNH THEO ỨNG DỤNG
window.COD_CONFIGS = {
  index: { table: "kv_nhan_vien" },        // index.html (đăng nhập)
  cod:   { table: "don_hang_kiot_cod" },   // Quan_ly_COD.html
  check: { table: "don_hang" }             // check_don.html
};

// 3) HÀM TRỘN CẤU HÌNH
window.getConfig = (name) => {
  const base = window.COD_BASE || {};
  const per  = (window.COD_CONFIGS || {})[name] || {};
  return { ...base, ...per }; // {url, key, table}
};

