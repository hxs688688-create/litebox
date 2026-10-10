/* LiteBox v5 · tools/countdown.js — 考试倒计时（内置事件 + 自定义事件本地存储，秒级跳动）
   Step 6B-3：每张卡片右上角加分享按钮，Canvas 生成 750×1000 竖版分享图，
              系统分享（navigator.share）优先，不支持时降级下载 PNG。 */
(function () {
  'use strict';

  const { $, $$, esc } = LB.dom;
  const BUILT_IN = [
    { id: 'b-cet',  tag: 'CET',  name: '全国大学英语四六级（笔试）', date: '2026-12-19' },
    { id: 'b-kao',  tag: '考研', name: '全国硕士研究生招生考试（初试）', date: '2026-12-26' },
    { id: 'b-gao',  tag: '高考', name: '普通高等学校招生全国统一考试', date: '2027-06-07' }
  ];
  const KEY = 'litebox_events';
  const BRAND = 'LiteBox · 考试倒计时';
  let rootEl = null;
  let timer = null;

  const pad = n => String(n).padStart(2, '0');

  /* 剩余天数（已过 → 0） */
  function remainDays(date) {
    const diff = new Date(date + 'T00:00:00').getTime() - Date.now();
    return diff <= 0 ? 0 : Math.floor(diff / 86400000);
  }

  /* 剩余文案：N 天 HH 时 MM 分 SS 秒 / 已开始 */
  function remainText(date) {
    const diff = new Date(date + 'T00:00:00').getTime() - Date.now();
    if (diff <= 0) return '已开始，全力以赴！';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000) % 24;
    const m = Math.floor(diff / 60000) % 60;
    const s = Math.floor(diff / 1000) % 60;
    return d + ' 天 ' + pad(h) + ' 时 ' + pad(m) + ' 分 ' + pad(s) + ' 秒';
  }

  /* 全量事件（内置 + 自定义），按日期升序 */
  function allEvents() {
    const custom = LB.storage.get(KEY, []);
    return BUILT_IN.concat(custom)
      .filter(ev => ev && ev.name && ev.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function findEvent(id) {
    return allEvents().find(ev => String(ev.id) === String(id)) || null;
  }

  function cardHtml(ev) {
    const custom = !String(ev.id).startsWith('b-');
    return (
      '<article class="cd-card" data-id="' + esc(ev.id) + '">' +
      '<div class="cd-acts">' +
      '<button class="cd-share" data-share="' + esc(ev.id) + '" type="button" aria-label="分享" title="生成分享图">↗</button>' +
      (custom ? '<button class="cd-del" data-del="' + esc(ev.id) + '" type="button" aria-label="删除">×</button>' : '') +
      '</div>' +
      '<span class="cd-tag">' + esc(ev.tag || '自定义') + '</span>' +
      '<h3>' + esc(ev.name) + '</h3>' +
      '<div class="cd-time" data-date="' + esc(ev.date) + '">' + esc(remainText(ev.date)) + '</div>' +
      '<div class="cd-date">目标日期 ' + esc(ev.date) + '</div>' +
      '</article>'
    );
  }

  function renderList() {
    const evs = allEvents();
    const grid = $('#cdGrid', rootEl);
    if (!evs.length) {
      /* Step 8：标准空状态（内置考试日期清空后兜底） */
      LB.ui.empty(grid, {
        icon: '⏳',
        title: '没有正在倒计时的日子',
        sub: '添加自定义事件，秒级实时跳动',
        ctaText: '添加一个事件',
        onCta: () => { const inp = $('#cdName', rootEl); if (inp) inp.focus(); }
      });
      return;
    }
    grid.innerHTML = evs.map(cardHtml).join('');
    /* Step 10：卡片入场级联动效（延迟走 DOM style API，动态值不写内联字符串） */
    $$('.cd-card', grid).forEach((el, i) => {
      el.classList.add('lb-fade-in-up');
      el.style.animationDelay = (i * 30) + 'ms';
    });
  }

  /* 每秒只刷新时间文本，不重绘卡片 */
  function tick() {
    $$('.cd-time', rootEl).forEach(el => {
      const t = remainText(el.dataset.date);
      if (el.textContent === t) return;
      /* Step 10：天数变化时轻微放大回弹（分/秒跳动不弹，避免常驻晃动） */
      const dayChanged = t.split('天')[0] !== (el.textContent || '').split('天')[0];
      el.textContent = t;
      if (dayChanged) LB.replay(el, 'lb-pop');
    });
  }

  function addEvent() {
    const name = $('#cdName', rootEl).value.trim();
    const date = $('#cdDate', rootEl).value;
    if (!name) { LB.toast('请填写事件名称', 'info'); return; }
    if (!date) { LB.toast('请选择目标日期', 'info'); return; }
    const list = LB.storage.get(KEY, []);
    list.push({ id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name, date, tag: '自定义' });
    LB.storage.set(KEY, list);
    $('#cdName', rootEl).value = '';
    renderList();
    LB.toast('已添加事件', 'ok');
  }

  function delEvent(id) {
    LB.storage.set(KEY, LB.storage.get(KEY, []).filter(ev => ev.id !== id));
    renderList();
    LB.toast('已删除', 'ok');
  }

  /* ---------- 分享图（750×1000 竖版） ---------- */

  /* 按可用宽度自缩放字号：任务书示例写死 240px，但 750 宽放 4 位数会溢出，故按实际测量回缩 */
  function fitFont(c, text, wantPx, maxW) {
    let px = wantPx;
    c.font = '900 ' + px + 'px ' + FONT;
    while (px > 24 && c.measureText(text).width > maxW) {
      px -= 4;
      c.font = '900 ' + px + 'px ' + FONT;
    }
    return px;
  }

  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';

  function generateShareImage(ev) {
    const W = 750, H = 1000;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    /* 品牌渐变底 */
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#4a5ae6');
    g.addColorStop(1, '#7c3aed');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* 右上装饰圆 */
    c.save();
    c.globalAlpha = 0.10;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(W - 40, 96, 200, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(70, H - 60, 150, 0, Math.PI * 2); c.fill();
    c.restore();

    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';

    /* 标签 */
    c.fillStyle = 'rgba(255,255,255,.72)';
    c.font = '600 30px ' + FONT;
    c.fillText(ev.tag || '倒计时', W / 2, 200);

    /* 事件名（长则两行，最长边自适应缩放） */
    let name = String(ev.name || '倒计时');
    let nameSize = 48;
    c.font = '700 ' + nameSize + 'px ' + FONT;
    while (nameSize > 26 && c.measureText(name).width > W - 96) {
      nameSize -= 2;
      c.font = '700 ' + nameSize + 'px ' + FONT;
    }
    c.fillStyle = '#ffffff';
    c.fillText(name, W / 2, 288);

    /* 巨大天数 + 「天」 */
    const days = String(remainDays(ev.date));
    const daySize = fitFont(c, days, 240, W - 220);
    c.font = '900 ' + daySize + 'px ' + FONT;
    c.fillStyle = '#ffffff';
    c.fillText(days, W / 2 - 34, 620);

    c.fillStyle = 'rgba(255,255,255,.92)';
    c.font = '700 72px ' + FONT;
    c.fillText('天', W / 2 + daySize * 0.78, 620);

    /* 目标日期 */
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.font = '500 32px ' + FONT;
    c.fillText('目标日期 ' + ev.date, W / 2, 706);

    /* 分割线 */
    c.strokeStyle = 'rgba(255,255,255,.28)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(W / 2 - 110, 762); c.lineTo(W / 2 + 110, 762); c.stroke();

    /* 底部署名 */
    c.fillStyle = 'rgba(255,255,255,.60)';
    c.font = '400 24px ' + FONT;
    c.fillText('由 ' + BRAND + ' 生成', W / 2, 812);

    return cv;
  }

  function toBlob(cv) {
    return new Promise(resolve => { cv.toBlob(b => resolve(b), 'image/png'); });
  }

  function fileName(ev) {
    return 'countdown-' + String(ev.name || 'event').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24) + '.png';
  }

  function download(blob, name) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function shareEvent(id) {
    const ev = findEvent(id);
    if (!ev) return;
    const btn = $('[data-share="' + CSS.escape(String(id)) + '"]', rootEl);
    if (btn) btn.disabled = true;
    try {
      const blob = await toBlob(generateShareImage(ev));
      if (!blob) throw new Error('toBlob 失败');
      const name = fileName(ev);
      const file = (typeof File === 'function') ? new File([blob], name, { type: 'image/png' }) : null;

      /* 系统分享（Web Share Level 2），仅在 canShare 通过时使用 */
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title: ev.name, text: '距离「' + ev.name + '」还有 ' + remainDays(ev.date) + ' 天' });
          return;
        } catch (e) {
          /* 用户主动取消（AbortError）不降级下载；其余情况继续降级 */
          if (e && e.name === 'AbortError') return;
        }
      }
      /* 降级：直接下载 PNG */
      download(blob, name);
      LB.toast('已生成分享图并下载', 'ok');
    } catch (e) {
      LB.toast('分享图生成失败，请重试', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>考试倒计时</h1><p>内置四六级 / 考研 / 高考日期，自定义事件本地保存</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="cd-grid" id="cdGrid"></div>' +
      '<div class="card cd-form">' +
      '<span class="tool-lab">添加自定义事件</span>' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="cdName" maxlength="30" placeholder="事件名称（如：期末考试）" />' +
      '<input class="inp" id="cdDate" type="date" aria-label="目标日期" />' +
      '<button class="btn btn-main js-primary-submit" id="cdAdd" type="button">添加</button>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">目标日期当天 00:00 起视为「已开始」；点卡片右上角 ↗ 可生成分享图。自定义事件保存在本设备浏览器中。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    renderList();
    timer = setInterval(tick, 1000);
    $('#cdAdd', root).addEventListener('click', addEvent);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) { LB.hash.go('home'); return; }
      const sh = e.target.closest('[data-share]');
      if (sh) { shareEvent(sh.dataset.share); return; }
      const del = e.target.closest('[data-del]');
      if (del) delEvent(del.dataset.del);
    });
  }

  function unmount() {
    if (timer) { clearInterval(timer); timer = null; } /* 必须清理，防定时器泄漏 */
    rootEl = null;
  }

  LB.router.register('countdown', { mount, unmount });
})();
