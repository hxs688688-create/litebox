/* LiteBox v5 · tools/imgstyle.js — 图片风格化
   Step 14：改用 image-to-toon（npm，零依赖，纯浏览器 Canvas，不调 API、无频率限制）。
   引擎按需从 vendor/image-to-toon.js 加载，首次进入工具才拉取，避免拖慢首页。 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  const MAX_MB = 12;
  const MAX_SIDE = 1280;   /* 引擎内部最长边上限，控制处理耗时 */
  const EXT_OK = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
  const VENDOR_SRC = 'vendor/image-to-toon.js';

  /* 6 种风格：前 4 个是引擎的 style，后 2 个是引擎的调优预设（applyPreset 名称一致） */
  const STYLES = [
    { v: 'cartoon', n: '卡通' },
    { v: 'comic', n: '漫画' },
    { v: 'painting', n: '油画' },
    { v: 'sketch', n: '素描' },
    { v: 'pencil', n: '铅笔' },
    { v: 'portrait', n: '人像' }
  ];

  const EDGE_OFFSET = 0.5;   /* 引擎 edgeStrength 取值 0~1，UI 用 0.5~1.5 展示 */

  let rootEl = null;
  let engine = null;
  let unsub = null;
  let curFile = null;        /* 当前选中的文件 */
  let loadedFile = null;     /* 已 load 进引擎的文件（避免每次切风格都重新解码） */
  let style = 'cartoon';
  let params = { edge: 1.0, levels: 6, smooth: 3 };
  let onPaste = null;
  let seq = 0;
  let debounce = 0;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function extOk(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 && EXT_OK.indexOf(name.slice(i + 1).toLowerCase()) >= 0;
  }

  function nameOf(v) {
    const s = STYLES.find(x => x.v === v);
    return s ? s.n : v;
  }

  function toMsg(e) {
    const code = e && e.code;
    if (code === 'FILE_TOO_LARGE') return '图片过大，请选择 ' + MAX_MB + 'MB 以内的图片';
    if (code === 'UNSUPPORTED_TYPE') return '不支持的图片格式，请换 JPG / PNG / WEBP';
    if (code === 'DIMENSION_EXCEEDED') return '图片尺寸过大，请先压缩后再试';
    if (code === 'DECODE_FAILED') return '图片解码失败，请换一张试试';
    return '处理失败：' + ((e && e.message) || '未知错误');
  }

  /* 引擎脚本按需加载；window.CaricatureEngine 为正式名，CarricatureEngine 为拼写别名 */
  function EngineCtor() {
    return window.CaricatureEngine || window.CarricatureEngine;
  }

  function loadToonEngine() {
    if (EngineCtor()) return Promise.resolve();
    if (!window.__lbToonPromise) {
      window.__lbToonPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = VENDOR_SRC;
        s.onload = resolve;
        s.onerror = () => {
          window.__lbToonPromise = null;
          reject(new Error('风格化组件加载失败'));
        };
        document.head.appendChild(s);
      });
    }
    return window.__lbToonPromise;
  }

  async function ensureEngine() {
    await loadToonEngine();
    const Ctor = EngineCtor();
    if (!Ctor) throw new Error('风格化组件加载失败');
    if (!engine) {
      engine = new Ctor({ config: { mode: 'color', posterizeLevels: params.levels, maxDimension: MAX_SIDE } });
      engine.setValidation({
        maxSizeBytes: MAX_MB * 1048576,
        acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/gif'],
        maxSourceDimension: 0
      });
      unsub = engine.subscribe(st => {
        if (!rootEl || st.status !== 'processing') return;
        $('#isStat', rootEl).textContent = '处理中… ' + Math.round((st.progress || 0) * 100) + '%';
      });
    }
    return engine;
  }

  function setBusy(on) {
    const btn = $('#isDl', rootEl);
    const pick = $('#isPick', rootEl);
    btn.disabled = on;
    pick.disabled = on;
    btn.textContent = on ? '⏳ 处理中…' : '⬇️ 下载图片';
  }

  function syncSliders() {
    $('#isEdge', rootEl).value = String(params.edge);
    $('#isEdgeV', rootEl).textContent = params.edge.toFixed(2);
    $('#isLevels', rootEl).value = String(params.levels);
    $('#isLevelsV', rootEl).textContent = String(params.levels);
    $('#isSmooth', rootEl).value = String(params.smooth);
    $('#isSmoothV', rootEl).textContent = String(params.smooth);
  }

  function pushParams() {
    if (!engine) return;
    engine.updateConfig({
      edgeStrength: clamp(params.edge - EDGE_OFFSET, 0, 1),
      posterizeLevels: params.levels,
      smoothness: params.smooth
    });
  }

  /* 切风格：套用同名预设，并把滑杆同步成预设的实际取值（用户再拖才覆盖） */
  function applyStyle() {
    if (!engine) return;
    engine.applyPreset(style);
    const c = engine.getConfig();
    params.edge = clamp(c.edgeStrength + EDGE_OFFSET, 0.5, 1.5);
    params.levels = clamp(c.posterizeLevels, 4, 8);
    params.smooth = clamp(c.smoothness, 1, 10);
    syncSliders();
    pushParams();
  }

  async function render() {
    if (!curFile) return;
    const my = ++seq;
    setBusy(true);
    try {
      await ensureEngine();
      if (my !== seq) return;
      if (loadedFile !== curFile) {
        await engine.load(curFile);
        loadedFile = curFile;
      }
      if (my !== seq) return;
      const res = await engine.process();
      if (my !== seq) return;
      const cvEl = $('#isCanvas', rootEl);
      cvEl.width = res.width;
      cvEl.height = res.height;
      cvEl.getContext('2d').drawImage(res.canvas, 0, 0);
      $('#isBox', rootEl).hidden = false;
      $('#isEmpty', rootEl).hidden = true;
      $('#isStat', rootEl).textContent =
        nameOf(style) + ' · ' + res.width + ' × ' + res.height +
        ' · ' + Math.round(res.durationMs || 0) + 'ms';
    } catch (e) {
      if (my !== seq) return;
      LB.toast(toMsg(e), 'err');
      $('#isStat', rootEl).textContent = '';
    } finally {
      if (my === seq) setBusy(false);
    }
  }

  function scheduleRender(delay) {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { debounce = 0; render(); }, delay == null ? 220 : delay);
  }

  /* 先确保引擎就绪 → 套用当前风格预设（并同步滑杆）→ 出图 */
  async function applyAndRender() {
    if (!curFile) return;
    try {
      await ensureEngine();
    } catch (e) {
      LB.toast(toMsg(e), 'err');
      return;
    }
    applyStyle();
    render();
  }

  function pickFile(file) {
    if (!rootEl || !file) return;
    const okType = (file.type && file.type.indexOf('image/') === 0) || extOk(file.name || '');
    if (!okType) { LB.toast('请选择图片文件（JPG / PNG / WEBP 等）', 'err'); return; }
    if (file.size > MAX_MB * 1048576) { LB.toast('图片过大：请选择 ' + MAX_MB + 'MB 以内的图片', 'info'); return; }

    curFile = file;
    $('#isFname', rootEl).textContent = file.name || '已选择图片';
    $('#isFsize', rootEl).textContent = (file.type || 'image') + ' · ' + LB.img.fmtSize(file.size);
    /* 新图 → 复位到默认风格与参数，避免上一张的调参影响这一张 */
    style = 'cartoon';
    $$('#isModes .seg-btn', rootEl).forEach(x => x.classList.toggle('on', x.getAttribute('data-v') === style));
    params = { edge: 1.0, levels: 6, smooth: 3 };
    syncSliders();
    $('#isBox', rootEl).hidden = true;
    $('#isEmpty', rootEl).hidden = false;
    $('#isStat', rootEl).textContent = '';
    applyAndRender();
  }

  function clearAll() {
    curFile = null;
    loadedFile = null;
    seq++;
    if (debounce) { clearTimeout(debounce); debounce = 0; }
    if (engine) { try { engine.reset({ keepConfig: true }); } catch (_) {} }
    $('#isBox', rootEl).hidden = true;
    $('#isEmpty', rootEl).hidden = false;
    $('#isSize', rootEl).textContent = '';
    $('#isStat', rootEl).textContent = '';
    $('#isFname', rootEl).textContent = '点击选择图片，或直接粘贴截图';
    $('#isFsize', rootEl).textContent = '';
    $('#isDl', rootEl).disabled = true;
  }

  function download() {
    if (!engine || !curFile) { LB.toast('还没有可下载的结果', 'info'); return; }
    engine.getBlob({ format: 'png' })
      .then(b => LB.img.download(b, 'imgstyle-' + style + '.png'))
      .catch(() => LB.toast('导出失败，请重试', 'err'));
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>图片风格化</h1><p>卡通 / 漫画 / 油画 / 素描 / 铅笔 / 人像，纯本地处理不上传</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card">' +
      '<div class="dropzone is-drop" id="isDrop">' +
      '<div class="ocr-dz-ic">🎨</div>' +
      '<div class="ocr-fname" id="isFname">点击选择图片，或直接粘贴截图</div>' +
      '<div class="ocr-fsize" id="isFsize"></div>' +
      '<small>JPG / PNG / WEBP / BMP / GIF · 最大 12MB · 支持 Ctrl+V 粘贴</small>' +
      '<button class="btn btn-ghost btn-sm ocr-pick" id="isPick" type="button">选择图片</button>' +
      '</div>' +
      '<input type="file" id="isFile" accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif" hidden>' +

      '<div class="seg seg-6" id="isModes">' +
      STYLES.map((m, i) => '<button class="seg-btn' + (i === 0 ? ' on' : '') + '" data-v="' + m.v + '" type="button">' + m.n + '</button>').join('') +
      '</div>' +

      '<div class="card set-card is-params">' +
      '<div class="field"><label>边缘强度</label><input type="range" id="isEdge" min="0.5" max="1.5" step="0.05" value="1"><output id="isEdgeV">1.00</output></div>' +
      '<div class="field"><label>色阶数</label><input type="range" id="isLevels" min="4" max="8" step="1" value="6"><output id="isLevelsV">6</output></div>' +
      '<div class="field"><label>平滑度</label><input type="range" id="isSmooth" min="1" max="10" step="1" value="3"><output id="isSmoothV">3</output></div>' +
      '</div>' +

      '<p class="is-size" id="isSize"></p>' +
      '<div class="is-box" id="isBox" hidden><canvas id="isCanvas"></canvas></div>' +
      '<p class="dn-empty2" id="isEmpty">先选一张图片，然后点上方风格切换效果。</p>' +
      '<div class="jst" id="isStat"></div>' +
      '<div class="set-btns">' +
      '<button class="btn btn-ghost" id="isClear" type="button">清空</button>' +
      '<button class="btn btn-ghost js-primary-submit" id="isDl" type="button" disabled>⬇️ 下载图片</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">所有处理都在你自己的浏览器里完成，图片不会上传到任何服务器。为控制耗时，最长边超过 ' +
      MAX_SIDE + 'px 的图片会先等比缩放再处理。下载结果为 PNG。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    curFile = null; loadedFile = null; style = 'cartoon';
    params = { edge: 1.0, levels: 6, smooth: 3 };
    syncSliders();

    const drop = $('#isDrop', root);
    const input = $('#isFile', root);
    drop.addEventListener('click', () => input.click());
    $('#isPick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) pickFile(f);
    });

    const onOver = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.addEventListener('dragover', onOver);
    drop.addEventListener('dragenter', onOver);
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) pickFile(f);
    });

    /* 粘贴：模块级 handle，unmount 时必须移除（本库无 _cleanups 约定） */
    onPaste = e => {
      if (!rootEl || !$('#tool-host', document) || !$('#tool-host', document).classList.contains('active')) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.indexOf('image/') === 0) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            pickFile(f);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);

    $('#isModes', root).addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      style = b.getAttribute('data-v');
      $$('#isModes .seg-btn', root).forEach(x => x.classList.toggle('on', x === b));
      if (!curFile) { LB.toast('先选一张图片，再切换风格', 'info'); return; }
      applyAndRender();
    });

    $('#isEdge', root).addEventListener('input', e => {
      params.edge = clamp(parseFloat(e.target.value) || 1, 0.5, 1.5);
      $('#isEdgeV', root).textContent = params.edge.toFixed(2);
      pushParams();
      scheduleRender(260);
    });
    $('#isLevels', root).addEventListener('input', e => {
      params.levels = clamp(parseInt(e.target.value, 10) || 6, 4, 8);
      $('#isLevelsV', root).textContent = String(params.levels);
      pushParams();
      scheduleRender(260);
    });
    $('#isSmooth', root).addEventListener('input', e => {
      params.smooth = clamp(parseInt(e.target.value, 10) || 3, 1, 10);
      $('#isSmoothV', root).textContent = String(params.smooth);
      pushParams();
      scheduleRender(260);
    });

    $('#isDl', root).addEventListener('click', download);
    $('#isClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearAll));
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() {
    if (onPaste) { document.removeEventListener('paste', onPaste); onPaste = null; }
    if (debounce) { clearTimeout(debounce); debounce = 0; }
    if (unsub) { try { unsub(); } catch (_) {} unsub = null; }
    if (engine) { try { engine.destroy(); } catch (_) {} }
    engine = null;
    curFile = null; loadedFile = null;
    seq++;
    rootEl = null;
  }

  LB.router.register('imgstyle', { mount, unmount });
})();
