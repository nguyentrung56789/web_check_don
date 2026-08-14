async function login() {

  if (!supabase) {
    $('msg').textContent = 'Đang khởi tạo, thử lại…';
    return;
  }

  const ma = String($('ma_nv')?.value || '').trim();
  const mk = String($('mat_khau')?.value || '').trim();

  if (!ma || !mk) {
    $('msg').textContent = 'Vui lòng nhập đủ thông tin';
    return;
  }

  setLoading(true);
  $('msg').textContent = '';

  try {

    console.log('========================');
    console.log('[LOGIN] TABLE =', TABLE_NV);
    console.log('[LOGIN] MA_NV =', ma);

    // ==================================================
    // BƯỚC 1: CHỈ TÌM MÃ NHÂN VIÊN
    // ==================================================

    const {
      data,
      error
    } = await supabase
      .from(TABLE_NV)
      .select(`
        ma_nv,
        mat_khau,
        ten_nv,
        admin,
        dong_hang,
        check_don,
        map,
        hoat_dong
      `)
      .eq('ma_nv', ma)
      .limit(1)
      .maybeSingle();

    console.log('[LOGIN] DATA =', data);
    console.log('[LOGIN] ERROR =', error);

    // ==================================================
    // SUPABASE LỖI
    // ==================================================

    if (error) {

      console.error(
        '[LOGIN] SUPABASE ERROR:',
        error
      );

      $('msg').textContent =
        'Lỗi Supabase: ' +
        (error.message || error.code || '');

      return;
    }

    // ==================================================
    // KHÔNG TÌM THẤY MÃ NHÂN VIÊN
    // ==================================================

    if (!data) {

      $('msg').textContent =
        `Không tìm thấy mã nhân viên ${ma}`;

      return;
    }

    // ==================================================
    // SO SÁNH MẬT KHẨU
    // ==================================================

    const mkTrongDatabase =
      String(data.mat_khau ?? '').trim();

    console.log(
      '[LOGIN] TÌM THẤY NHÂN VIÊN:',
      data.ma_nv,
      data.ten_nv
    );

    console.log(
      '[LOGIN] Độ dài MK nhập:',
      mk.length
    );

    console.log(
      '[LOGIN] Độ dài MK DB:',
      mkTrongDatabase.length
    );

    if (mk !== mkTrongDatabase) {

      $('msg').textContent =
        'Mã nhân viên đúng nhưng mật khẩu không khớp';

      return;
    }

    // ==================================================
    // CHECK HOẠT ĐỘNG
    // ==================================================

    if (data.hoat_dong !== true) {

      localStorage.removeItem('nv');
      sessionStorage.removeItem('nv_ctx');

      $('msg').textContent =
        'Tài khoản đã bị dừng hoạt động.';

      return;
    }

    // ==================================================
    // ĐĂNG NHẬP THÀNH CÔNG
    // ==================================================

    const loginData = {
      ma_nv: data.ma_nv,
      ten_nv: data.ten_nv,
      admin: data.admin,
      dong_hang: data.dong_hang,
      check_don: data.check_don,
      map: data.map,
      hoat_dong: data.hoat_dong,

      // để check_login.js kiểm tra lại
      mat_khau: mk
    };

    localStorage.setItem(
      'nv',
      JSON.stringify(loginData)
    );

    localStorage.setItem(
      'last_ma_nv',
      ma
    );

    sessionStorage.setItem(
      'nv_ctx',
      JSON.stringify({
        ma_nv: data.ma_nv || '',
        ten_nv: data.ten_nv || '',
        ts: Date.now()
      })
    );

    console.log(
      '[LOGIN] ĐĂNG NHẬP THÀNH CÔNG'
    );

    location.replace('./main.html');

  } catch (e) {

    console.error('[LOGIN] ERROR:', e);

    $('msg').textContent =
      'Lỗi: ' +
      (e?.message || String(e));

  } finally {

    setLoading(false);
  }
}
