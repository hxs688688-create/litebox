/* LiteBox v5 · tools/rmb.js — 数字大写（金额转人民币大写，四位分组 + 零位处理） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  const DIG = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const U = ['', '拾', '佰', '仟'];        /* 组内单位 */
  const G = ['', '万', '亿', '万亿'];       /* 组单位 */

  /* 整数部分：每 4 位一组，组内 0 跳过补零，组间全 0 补零，去尾零 */
  function intPart(num) {
    if (num === 0) return '';
    const groups = [];
    while (num > 0) { groups.push(num % 10000); num = Math.floor(num / 10000); }
    let out = '';
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      if (g === 0) {
        if (out && !out.endsWith('零')) out += '零';
        continue;
      }
      let gs = '';
      let zero = false;
      for (let d = 3; d >= 0; d--) {
        const v = Math.floor(g / 10 ** d) % 10;
        if (v === 0) {
          if (gs) zero = true;
        } else {
          if (zero) { gs += '零'; zero = false; }
          gs += DIG[v] + U[d];
        }
      }
      out += gs + G[gi];
    }
    return out.replace(/零+$/, '');
  }

  /* 金额 → 大写（取绝对值四舍五入到分，负数前缀"负"，0 → 零元整） */
  function convert(n) {
    const neg = n < 0;
    const total = Math.round(Math.abs(n) * 100);
    if (total === 0) return '零元整';
    const yuan = Math.floor(total / 100);
    const jiao = Math.floor(total / 10) % 10;
    const fen = total % 10;

    let out = '';
    const is = intPart(yuan);
    if (is) out += is + '元';

    if (jiao === 0 && fen === 0) {
      out += '整';
    } else {
      if (jiao !== 0) out += DIG[jiao] + '角';
      else if (fen !== 0) out += '零';
      if (fen !== 0) out += DIG[fen] + '分';
    }
    return (neg ? '负' : '') + out;
  }

  let rootEl = null;

  function run() {
    const raw = $('#rbIn', rootEl).value.trim();
    const n = parseFloat(raw);
    if (raw === '' || isNaN(n)) { LB.toast('请输入金额', 'info'); return; }
    const upper = convert(n);
    $('#rbOut', rootEl).textContent = upper;
    $('#rbSub', rootEl).textContent = '小写：' + (n < 0 ? '-' : '') + '¥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $('#rbResult', rootEl).hidden = false;
    LB.toast('已转换', 'ok');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>数字大写</h1><p>金额转人民币大写（壹贰叁），报销发票必备</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="cd-form-row">' +
      '<input class="inp" id="rbIn" type="text" inputmode="decimal" placeholder="例如：1234.56" />' +
      '<button class="btn btn-main js-primary-submit" id="rbGo" type="button">转换为大写</button>' +
      '</div>' +
      '</div>' +
      '<div class="card tool-sec set-card" id="rbResult" hidden>' +
      '<div class="rmb-out" id="rbOut"></div>' +
      '<div class="rmb-sub" id="rbSub"></div>' +
      '<button class="btn btn-ghost btn-sm" id="rbCopy" type="button">📋 复制大写</button>' +
      '</div>' +
      '<p class="cd-note">支持小数两位（角 / 分），负数自动加「负」前缀；金额四舍五入到分。</p>' +
      /* Step 9：免责声明条 */
      '<div class="tool-disclaimer"><span class="disc-icon" aria-hidden="true">⚠️</span><span class="disc-text">大写金额仅供核对参考，正式凭证以银行/财务核算为准。</span></div>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#rbGo', root).addEventListener('click', e => { if (!LB.lock(e.currentTarget)) return; run(); });
    $('#rbIn', root).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    $('#rbCopy', root).addEventListener('click', () => {
      LB.copyWithToast($('#rbOut', rootEl).textContent);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* Step 6E：消费链路种子（fxrate 的「转大写金额」会写入）
       —— 金额已由 links.js 剥掉币种单位与千分位，这里回填后直接出结果。 */
    const seed = LB.storage.get('litebox_rmb_seed', '');
    if (seed && String(seed).trim()) {
      $('#rbIn', root).value = String(seed);
      LB.storage.remove('litebox_rmb_seed');
      LB.toast('已接收换算结果，正在生成大写', 'info');
      run();
    }
  }

  function unmount() { rootEl = null; }

  LB.router.register('rmb', { mount, unmount });
})();
