
<script>
window.addEventListener('load', function () {
  try {
    if (
      typeof L === 'undefined' ||
      typeof TILE_LAYERS === 'undefined' ||
      typeof setBase !== 'function'
    ) {
      console.error(
        'Không tìm thấy cấu hình bản đồ trong trang này.'
      );
      return;
    }

    const osmUrl =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    function createOSM() {
      return L.tileLayer(osmUrl, {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      });
    }

    TILE_LAYERS.voyager = createOSM();
    TILE_LAYERS.light = createOSM();
    TILE_LAYERS.dark = createOSM();

    const theme =
      typeof mapCfg !== 'undefined'
        ? mapCfg.mapTheme
        : 'voyager';

    setBase(theme);

    console.log(
      '✅ Đã chuyển bản đồ CARTO sang OpenStreetMap'
    );
  } catch (error) {
    console.error('Lỗi chuyển bản đồ:', error);
  }
});
</script>
