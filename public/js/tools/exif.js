/* LiteBox v5 · tools/exif.js — 图片 EXIF 编辑（查看 / 一键清除 / 修改拍摄时间）
 *
 * 【为什么 piexif 必须懒加载】
 *   piexif.js 约 77KB，而全站只有本工具用得到。
 *   写进 index.html 会让每个访客都多下一次 77KB（首屏预算本来就紧）。
 *   所以走「首次进工具时注入 <script>，Promise 缓存防重复」的按需加载。
 *
 * 【只支持 JPEG，不是偷懒】
 *   EXIF 是 JPEG（以及 TIFF）的结构规范，PNG / WebP 里没有可写的 EXIF 段。
 *   piexif 对非 JPEG 会直接抛错，所以在上传阶段就拦住并明确告知，而不是等用户点了按钮才失败。
 *
 * 【清除隐私数据 = 把 5 个 IFD 全清空 + 去掉缩略图】
 *   只清 GPS 是不够的：相机型号、机身序列号、软件版本、原始拍摄时间都可能在 0th / Exif 里。
 *   所以清除动作把 0th / Exif / GPS / Interop / 1st 全部置空，并把 thumbnail 设为 null，
 *   确保导出的是「干净版」。
 *
 * 【体积上限 20MB】
 *   piexif 是纯 JS 逐字节解析，几十 MB 的图会明显卡住主线程，故设 20MB 上限并提示。
 */
(function () {
  'use strict';

  const { $, $$, esc, fmtSize } = LB.dom;

  const MAX_BYTES = 20 * 1024 * 1024;

  /* 常见 EXIF 标签的中文名（仅覆盖高频项，未覆盖的用 piexif 自带英文名） */
  const CN = {
    Make: '相机厂商', Model: '相机型号', Software: '处理软件', DateTime: '修改时间',
    Artist: '作者', Copyright: '版权', Orientation: '方向', ImageWidth: '图像宽度',
    ImageLength: '图像高度', XResolution: '水平分辨率', YResolution: '垂直分辨率',
    ResolutionUnit: '分辨率单位', YCbCrPositioning: '色彩位置', ExifVersion: 'EXIF 版本',
    DateTimeOriginal: '原始拍摄时间', DateTimeDigitized: '数字化时间', ExposureTime: '曝光时间',
    FNumber: '光圈值', ISOSpeedRatings: 'ISO 感光度', ShutterSpeedValue: '快门速度',
    ApertureValue: '光圈', ExposureBiasValue: '曝光补偿', MeteringMode: '测光模式',
    Flash: '闪光灯', FocalLength: '焦距', FocalLengthIn35mmFilm: '等效焦距',
    LensMake: '镜头厂商', LensModel: '镜头型号', ColorSpace: '色彩空间',
    PixelXDimension: '像素宽度', PixelYDimension: '像素高度', WhiteBalance: '白平衡',
    ExposureProgram: '曝光程序', ExposureMode: '曝光模式', SceneCaptureType: '场景类型',
    GPSVersionID: 'GPS 版本', GPSLatitudeRef: '纬度方向', GPSLatitude: '纬度',
    GPSLongitudeRef: '经度方向', GPSLongitude: '经度', GPSAltitudeRef: '海拔方向',
    GPSAltitude: '海拔', GPSTimeStamp: 'GPS 时间', GPSDateStamp: 'GPS 日期',
    GPSProcessingMethod: '定位方式', GPSMapDatum: '大地基准面'
  };

  const IFD_LABEL = { '0th': '基础信息（0th）', 'Exif': '拍摄参数（Exif）', 'GPS': '定位信息（GPS）', 'Interop': '互操作（Interop）', '1st': '缩略图信息（1st）' };

  let rootEl = null;
  let fileName = '';
  let fileSize = 0;
  let dataUrl = '';
  let exifObj = null;
  let piexifLoading = null;

  /* ---------- piexif 懒加载 ---------- */
  function loadPiexif() {
    if (window.piexif) return Promise.resolve(window.piexif);
    if (piexifLoading) return piexifLoading;
    piexifLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/piexif.js';
      s.async = true;
      s.onload = () => {
        s.remove();
        if (window.piexif) resolve(window.piexif);
        else { piexifLoading = null; reject(new Error('piexif 加载失败')); }
      };
      s.onerror = () => { s.remove(); piexifLoading = null; reject(new Error('piexif 加载失败')); };
      document.body.appendChild(s);
    });
    return piexifLoading;
  }

  /* ---------- 工具函数 ---------- */
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('读取文件失败'));
      fr.readAsDataURL(file);
    });
  }

  function dataURLtoBlob(dataUrlStr) {
    const parts = String(dataUrlStr).split(',');
    const mimeMatch = /:(.*?);/.exec(parts[0]);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bin = atob(parts[1]);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function download(dataUrlStr, name) {
    const blob = dataURLtoBlob(dataUrlStr);
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function fmtValue(val) {
    if (val == null) return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') {
      if (val.length != null) return '[二进制 ' + val.length + ' 字节]';
      return String(val);
    }
    return String(val);
  }

  function tagName(ifd, tag) {
    const def = window.piexif && piexif.TAGS && piexif.TAGS[ifd] && piexif.TAGS[ifd][tag];
    const en = (def && def.name) || String(tag);
    return CN[en] ? CN[en] + '（' + en + '）' : en;
  }

  /* ---------- 渲染 ---------- */
  function renderTable() {
    const box = $('#exifTable', rootEl);
    const rows = [];
    ['0th', 'Exif', 'GPS', 'Interop', '1st'].forEach(ifd => {
      const obj = exifObj && exifObj[ifd];
      if (!obj) return;
      Object.keys(obj).forEach(tag => {
        rows.push([IFD_LABEL[ifd] || ifd, tagName(ifd, tag), fmtValue(obj[tag])]);
      });
    });
    if (!rows.length) {
      /* Step 8：标准空状态 */
      LB.ui.empty(box, {
        icon: '🖼️',
        title: '没有可读的 EXIF 信息',
        sub: '这张图片可能已被平台压缩或抹除元数据'
      });
      return;
    }
    box.innerHTML = '<table class="exif-table"><thead><tr><th>分组</th><th>字段</th><th>值</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td class="exif-g">' + esc(r[0]) + '</td><td class="exif-k">' + esc(r[1]) + '</td><td class="exif-v">' + esc(r[2]) + '</td></tr>').join('') +
      '</tbody></table>';
    $('#exifCount', rootEl).textContent = '共 ' + rows.length + ' 个字段';
  }

  function setDateTimeInput() {
    const inp = $('#exifDate', rootEl);
    let v = '';
    try {
      const dt = exifObj && exifObj['Exif'] && exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal];
      if (!dt && exifObj && exifObj['0th']) dt = exifObj['0th'][piexif.ImageIFD.DateTime];
      if (typeof dt === 'string' && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(dt)) {
        v = dt.slice(0, 10).replace(/:/g, '-') + 'T' + dt.slice(11, 16);
      }
    } catch (_) { v = ''; }
    if (!v) {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      v = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    inp.value = v;
  }

  function switchTab(t) {
    $$('.exif-tab', rootEl).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    ['view', 'clear', 'edit'].forEach(k => { $('#exifPanel-' + k, rootEl).hidden = k !== t; });
  }

  function resetToUpload() {
    dataUrl = '';
    exifObj = null;
    fileName = '';
    fileSize = 0;
    $('#exifWork', rootEl).hidden = true;
    $('#exifUp', rootEl).hidden = false;
    $('#exifFile', rootEl).value = '';
  }

  /* ---------- 载入图片 ---------- */
  async function handleFile(file) {
    if (!file) return;
    const isJpg = /image\/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name);
    if (!isJpg) { LB.toast('只支持 JPG / JPEG 图片（PNG、WebP 无 EXIF 段）', 'err'); return; }
    if (file.size > MAX_BYTES) { LB.toast('图片超过 20MB，请先压缩后再试', 'err'); return; }

    try {
      await loadPiexif();
    } catch (e) {
      LB.toast('EXIF 组件加载失败，请检查网络后重试', 'err');
      return;
    }

    let url;
    try { url = await readAsDataURL(file); }
    catch (e) { LB.toast('读取文件失败', 'err'); return; }
    if (!rootEl) return;

    dataUrl = url;
    fileName = file.name || 'image.jpg';
    fileSize = file.size;

    try { exifObj = piexif.load(dataUrl); }
    catch (e) {
      LB.toast('无法解析该图片的 EXIF（可能不是有效 JPEG）', 'err');
      dataUrl = ''; fileName = ''; return;
    }
    if (!exifObj || typeof exifObj !== 'object') exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, 'Interop': {}, '1st': {}, thumbnail: null };
    ['0th', 'Exif', 'GPS', 'Interop', '1st'].forEach(k => { if (!exifObj[k]) exifObj[k] = {}; });

    $('#exifUp', rootEl).hidden = true;
    $('#exifWork', rootEl).hidden = false;
    $('#exifPreview', rootEl).src = dataUrl;
    $('#exifName', rootEl).textContent = fileName;
    $('#exifSize', rootEl).textContent = fmtSize(fileSize);
    const gps = exifObj['GPS'] && Object.keys(exifObj['GPS']).length;
    $('#exifBadge', rootEl).textContent = gps ? '⚠ 含定位信息' : '无定位信息';
    $('#exifBadge', rootEl).className = 'exif-badge' + (gps ? ' warn' : '');
    switchTab('view');
    renderTable();
    setDateTimeInput();
  }

  /* ---------- 清除 ---------- */
  function clearAndDownload() {
    if (!dataUrl) { LB.toast('请先上传图片', 'info'); return; }
    try {
      const obj = piexif.load(dataUrl);
      obj['0th'] = {}; obj['Exif'] = {}; obj['GPS'] = {}; obj['Interop'] = {}; obj['1st'] = {}; obj.thumbnail = null;
      const bytes = piexif.dump(obj);
      const out = piexif.insert(bytes, dataUrl);
      const base = fileName.replace(/\.[^.]+$/, '');
      download(out, base + '-clean.jpg');
      LB.toast('已清除 EXIF 并下载「干净版」', 'ok');
    } catch (e) {
      LB.toast('清除失败，请重试', 'err');
    }
  }

  /* ---------- 修改拍摄时间 ---------- */
  function saveDateTime() {
    if (!dataUrl) { LB.toast('请先上传图片', 'info'); return; }
    const v = $('#exifDate', rootEl).value;   /* YYYY-MM-DDTHH:MM */
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) { LB.toast('请选择有效的日期时间', 'info'); return; }
    const str = v.slice(0, 10).replace(/-/g, ':') + ' ' + v.slice(11, 16) + ':00';  /* YYYY:MM:DD HH:MM:SS */
    try {
      const obj = piexif.load(dataUrl);
      ['0th', 'Exif', 'GPS', 'Interop', '1st'].forEach(k => { if (!obj[k]) obj[k] = {}; });
      obj['0th'][piexif.ImageIFD.DateTime] = str;
      obj['Exif'][piexif.ExifIFD.DateTimeOriginal] = str;
      obj['Exif'][piexif.ExifIFD.DateTimeDigitized] = str;
      const bytes = piexif.dump(obj);
      const out = piexif.insert(bytes, dataUrl);
      const base = fileName.replace(/\.[^.]+$/, '');
      download(out, base + '-time.jpg');
      LB.toast('拍摄时间已改为 ' + str, 'ok');
    } catch (e) {
      LB.toast('修改失败，请重试', 'err');
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片 EXIF 编辑</h1><p>查看图片 EXIF 信息，一键清除隐私数据，或修改拍摄时间</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div id="exifUp">' +
      '<label class="dropzone exif-drop" id="exifDrop" for="exifFile">' +
      '<div class="exif-drop-ic">🖼️</div>' +
      '<b>点击或拖拽上传 JPG 图片</b>' +
      '<small>仅支持 JPG / JPEG，最大 20MB，全程本地处理不上传</small>' +
      '</label>' +
      '<input type="file" id="exifFile" accept="image/jpeg,.jpg,.jpeg" hidden>' +
      '</div>' +
      '<div id="exifWork" hidden>' +
      '<div class="card exif-info">' +
      '<img class="exif-thumb" id="exifPreview" alt="预览">' +
      '<div class="exif-meta"><b id="exifName">—</b><small id="exifSize">—</small>' +
      '<span class="exif-badge" id="exifBadge">—</span></div>' +
      '<button class="ql-btn" id="exifReset" type="button">换一张</button>' +
      '</div>' +
      '<div class="seg seg-3">' +
      '<button class="exif-tab on" data-tab="view" type="button">👁 查看</button>' +
      '<button class="exif-tab" data-tab="clear" type="button">🧹 清除</button>' +
      '<button class="exif-tab" data-tab="edit" type="button">✏️ 修改</button>' +
      '</div>' +
      '<div id="exifPanel-view">' +
      '<p class="cd-note" id="exifCount"></p>' +
      '<div class="exif-table-wrap" id="exifTable"></div>' +
      '</div>' +
      '<div id="exifPanel-clear" hidden>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">清除所有 EXIF 与 GPS</span>' +
      '<p class="cd-note">将移除相机型号、机身序列号、原始拍摄时间、定位坐标等全部元数据，导出一张「干净版」图片。原图不受影响。</p>' +
      '<button class="btn btn-main js-primary-submit" id="exifClear" type="button">🧹 清除并下载</button>' +
      '</div>' +
      '</div>' +
      '<div id="exifPanel-edit" hidden>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">修改拍摄时间</span>' +
      '<label class="geo-lab">新的日期时间<input class="inp" id="exifDate" type="datetime-local" aria-label="拍摄时间"></label>' +
      '<p class="cd-note">将同时写入 DateTime / DateTimeOriginal / DateTimeDigitized 三个字段。</p>' +
      '<button class="btn btn-main" id="exifSave" type="button">✏️ 保存并下载</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">EXIF 是 JPEG 的元数据段，PNG / WebP 不包含可写的 EXIF。所有解析与导出均在本机完成。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    resetToUpload();

    const input = $('#exifFile', root);
    input.addEventListener('change', e => { handleFile(e.target.files && e.target.files[0]); });

    const drop = $('#exifDrop', root);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });

    root.addEventListener('click', e => {
      const t = e.target.closest('.exif-tab');
      if (t) { switchTab(t.dataset.tab); return; }
      if (e.target.closest('#exifClear')) { clearAndDownload(); return; }
      if (e.target.closest('#exifSave')) { saveDateTime(); return; }
      if (e.target.closest('#exifReset')) { resetToUpload(); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() { rootEl = null; }

  LB.router.register('exif', { mount, unmount });
})();
