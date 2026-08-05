function layTenTrangHienTai() {
  return window.location.pathname
    .split('/')
    .filter(Boolean)
    .pop()
    ?.trim()
    .toLowerCase() || 'main.html';
}

export async function quyen_duocxem(id_chucnang) {
  try {
    const maNv = layMaNhanVienDangNhap();

    if (!maNv) {
      console.error('Không có ma_nv đăng nhập');
      return false;
    }

    const client = await taoSupabaseClient();

    // Lấy vai_tro_id của nhân viên
    const { data: nhanVienData, error: nhanVienError } =
      await client
        .from('kv_nhan_vien')
        .select('ma_nv, vai_tro_id')
        .eq('ma_nv', maNv)
        .limit(1);

    if (nhanVienError) {
      throw nhanVienError;
    }

    const nhanVien = nhanVienData?.[0];

    if (!nhanVien?.vai_tro_id) {
      console.error('Không tìm thấy vai_tro_id');
      return false;
    }

    const duongDan = layTenTrangHienTai();

    const { data, error } = await client
      .from('sql_phan_quyen_nhan_vien')
      .select('duoc_xem')
      .eq('ma_nv', maNv)
      .eq('vai_tro_id', nhanVien.vai_tro_id)
      .eq('duong_dan', duongDan)
      .eq(
        'id_chucnang',
        String(id_chucnang).trim().toLowerCase()
      )
      .limit(1);

    if (error) {
      throw error;
    }

    const duocXem =
      data?.[0]?.duoc_xem === true;

    console.log('[PHÂN QUYỀN]', {
      ma_nv: maNv,
      vai_tro_id: nhanVien.vai_tro_id,
      duong_dan: duongDan,
      id_chucnang,
      duoc_xem: duocXem
    });

    return duocXem;
  } catch (error) {
    console.error(
      'Lỗi kiểm tra phân quyền:',
      error
    );

    return false;
  }
}
