export async function quyen_duocxem(
  id_chucnang,
  duongDan = layTenFileHienTai()
) {
  try {
    const loginUser = layNhanVienDangNhap();

    if (!loginUser) {
      throw new Error('Không tìm thấy nhân viên đang đăng nhập');
    }

    const maNvDangNhap = getEmployeeCode(loginUser);
    const page = normalizePage(duongDan);
    const functionId = normalizeFunctionId(id_chucnang);

    if (!maNvDangNhap) {
      throw new Error('Không lấy được ma_nv của nhân viên đăng nhập');
    }

    if (!functionId) {
      throw new Error('Thiếu id_chucnang');
    }

    const client = await taoSupabaseClient();

    const { data, error } = await client
      .from('sql_phan_quyen_nhan_vien')
      .select(`
        ma_nv,
        vai_tro_id,
        id_chucnang,
        duong_dan,
        duoc_xem
      `)
      .eq('ma_nv', maNvDangNhap)
      .eq('duong_dan', page)
      .eq('id_chucnang', functionId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const maNv = clean(data?.ma_nv);
    const vaiTroId = clean(data?.vai_tro_id);
    const idChucNang = clean(data?.id_chucnang);
    const duocXem = toBool(data?.duoc_xem);

    console.log('[QUYỀN ĐƯỢC XEM]', {
      ma_nv: maNv || null,
      vai_tro_id: vaiTroId || null,
      id_chucnang: idChucNang || null,
      duong_dan: page,
      duoc_xem: duocXem,
      du_lieu_sql: data
    });

    alert(
      [
        'KẾT QUẢ PHÂN QUYỀN',
        '',
        `ma_nv: ${maNv || 'KHÔNG CÓ'}`,
        `vai_tro_id: ${vaiTroId || 'KHÔNG CÓ'}`,
        `id_chucnang: ${idChucNang || 'KHÔNG CÓ'}`,
        `duong_dan: ${page}`,
        `duoc_xem: ${duocXem}`
      ].join('\n')
    );

    return duocXem;
  } catch (error) {
    console.error('[QUYỀN ĐƯỢC XEM] Lỗi:', error);

    alert(
      [
        'LỖI KIỂM TRA PHÂN QUYỀN',
        '',
        `id_chucnang: ${id_chucnang}`,
        `message: ${error?.message || String(error)}`
      ].join('\n')
    );

    return false;
  }
}
