
# Kiểm tra đơn hàng — gói tách file
Cấu trúc:
- index.html
- style.css
- app.js
- (tùy chọn) cod_config.js hoặc cod_config.json

Cách dùng:
1) Đặt tất cả file vào cùng một thư mục trên máy chủ/tĩnh (VD: Nginx/Apache hoặc mở trực tiếp).
2) Đảm bảo có 1 trong 2 file cấu hình Supabase:
   - `cod_config.js` (đặt `window.COD_CONFIG = { url: '...', key: '...' }`), hoặc
   - `cod_config.json` với nội dung JSON tương đương.
3) Mở trang với tham số `ma_hd`, ví dụ:
   `index.html?ma_hd=HD001`
4) Nút **Giao hàng**: nếu chưa chọn NV giao hàng → báo; nếu đã chọn (và NV xác nhận đã chọn) → chạy cùng luồng như **Xác nhận** (ghi DB + webhook + đóng form).
