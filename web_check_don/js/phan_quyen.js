```js
// Đặt gần đầu file phanquyen.js
const DEBUG_THONG_BAO_ID = true;

/**
 * Hiển thị ma_nv, vai_tro_id và toàn bộ id_chucnang lấy được.
 */
function thongBaoIdPhanQuyen(nhanVien, danhSachQuyen, tenTrang) {
  if (!DEBUG_THONG_BAO_ID) return;

  const permissions = Array.isArray(danhSachQuyen)
    ? danhSachQuyen
    : [];

  const danhSachIdChucNang = [
    ...new Set(
      permissions
        .map(item => clean(item?.id_chucnang))
        .filter(Boolean)
    )
  ];

  const debugData = {
    ma_nv: clean(nhanVien?.ma_nv) || 'KHÔNG CÓ',
    vai_tro_id:
      clean(nhanVien?.vai_tro_id) || 'KHÔNG CÓ',
    duong_dan:
      clean(tenTrang) || 'KHÔNG CÓ',
    so_dong_quyen: permissions.length,
    id_chucnang: danhSachIdChucNang
  };

  console.group(
    '========== ID PHÂN QUYỀN LẤY ĐƯỢC =========='
  );

  console.log('Mã nhân viên:', debugData.ma_nv);
  console.log('ID vai trò:', debugData.vai_tro_id);
  console.log('Đường dẫn:', debugData.duong_dan);
  console.log(
    'Danh sách id_chucnang:',
    danhSachIdChucNang
  );
  console.log('Toàn bộ dòng quyền:', permissions);

  if (permissions.length) {
    console.table(
      permissions.map(item => ({
        ma_nv: item?.ma_nv,
        vai_tro_id: item?.vai_tro_id,
        duong_dan: item?.duong_dan,
        id_chucnang: item?.id_chucnang,
        ten_chucnang: item?.ten_chucnang,
        duoc_xem: item?.duoc_xem,
        duoc_them: item?.duoc_them,
        duoc_sua: item?.duoc_sua,
        duoc_xoa: item?.duoc_xoa
      }))
    );
  }

  console.groupEnd();

  const idText = danhSachIdChucNang.length
    ? danhSachIdChucNang.join('\n- ')
    : 'KHÔNG LẤY ĐƯỢC ID_CHUCNANG';

  alert(
    [
      'THÔNG TIN PHÂN QUYỀN LẤY ĐƯỢC',
      '',
      `ma_nv: ${debugData.ma_nv}`,
      `vai_tro_id: ${debugData.vai_tro_id}`,
      `duong_dan: ${debugData.duong_dan}`,
      `số dòng quyền: ${permissions.length}`,
      '',
      'id_chucnang:',
      `- ${idText}`,
      '',
      'Nhấn F12 → Console để xem toàn bộ dữ liệu.'
    ].join('\n')
  );
}
```

Sau đó tìm trong hàm `taiPhanQuyenTrang()` đoạn:

```js
const result =
  await apDungPhanQuyenTrang(
    duongDan,
    root
  );

return {
  ...result,
  nhanVien: employee
};
```

Thay bằng:

```js
const result =
  await apDungPhanQuyenTrang(
    duongDan,
    root
  );

// THÔNG BÁO CÁC ID ĐÃ LẤY ĐƯỢC
thongBaoIdPhanQuyen(
  employee,
  result.danhSachQuyen,
  result.tenTrang
);

return {
  ...result,
  nhanVien: employee
};
```
