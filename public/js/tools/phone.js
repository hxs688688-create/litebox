/* LiteBox v5 · tools/phone.js — 手机号归属地（本机号段库匹配，支持批量，号码不上传） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;
  let rootEl = null;

  /* 号段运营商表（前 3 位） */
  const carriers = {
    /* 移动 */
    134: '移动', 135: '移动', 136: '移动', 137: '移动', 138: '移动', 139: '移动',
    147: '移动', 150: '移动', 151: '移动', 152: '移动', 157: '移动', 158: '移动',
    159: '移动', 172: '移动', 178: '移动', 182: '移动', 183: '移动', 184: '移动',
    187: '移动', 188: '移动', 195: '移动', 197: '移动', 198: '移动',
    /* 联通 */
    130: '联通', 131: '联通', 132: '联通', 145: '联通', 155: '联通', 156: '联通',
    166: '联通', 171: '联通', 175: '联通', 176: '联通', 185: '联通', 186: '联通', 196: '联通',
    /* 电信 */
    133: '电信', 149: '电信', 153: '电信', 173: '电信', 174: '电信', 177: '电信',
    180: '电信', 181: '电信', 189: '电信', 190: '电信', 191: '电信', 193: '电信', 199: '电信',
    /* 虚拟运营商 */
    162: '虚拟', 165: '虚拟', 167: '虚拟', 170: '虚拟'
  };

  /* 常用号段城市表（不完整，未命中显示 —） */
  const cities = {
    138: '北京', 139: '北京', 159: '北京', 188: '北京', 158: '广东', 137: '上海',
    136: '河北', 135: '北京', 131: '北京', 130: '北京', 132: '北京', 133: '北京',
    155: '江苏', 189: '浙江', 185: '北京', 186: '北京', 180: '广东'
  };

  const RE = /^1[3-9]\d{9}$/;
  const mask = num => num.slice(0, 3) + '****' + num.slice(7);

  function run() {
    const one = $('#phOne', rootEl).value.trim();
    const batch = $('#phBatch', rootEl).value.trim();
    const st = $('#phStatus', rootEl);
    const out = $('#phOut', rootEl);

    /* 单号 + 批量合并，最多 50 个 */
    let list = [];
    if (one) list.push(one);
    if (batch) batch.split(/[\n,，;；\s]+/).forEach(x => { if (x) list.push(x); });
    if (!list.length) { st.textContent = '请输入要查询的号码'; st.className = 'ic-status ic-err'; out.hidden = true; return; }
    const total = list.length;
    if (total > 50) list = list.slice(0, 50);

    const cards = list.map(num => {
      if (!RE.test(num)) {
        return '<div class="ph-card bad"><b>' + esc(num.length > 11 ? num.slice(0, 11) + '…' : num) + '</b><small>❌ 格式不正确</small></div>';
      }
      const c = carriers[num.slice(0, 3)];
      const city = cities[num.slice(0, 3)] || '—';
      return '<div class="ph-card"><b>' + esc(mask(num)) + '</b><small>' + esc(c || '未知') + ' · ' + esc(city) + '</small></div>';
    }).join('');

    st.textContent = '✓ 已处理 ' + list.length + ' 个号码' + (total > 50 ? '（超出部分已截断，最多 50 个）' : '');
    st.className = 'ic-status ic-ok';
    $('#phOut', rootEl).innerHTML = cards;
    out.hidden = false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>手机号归属地</h1><p>本机号段库匹配运营商与归属地，支持批量</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="tip-priv">🔒 号码仅在本机匹配号段库，不会上传。</div>' +
      '<label class="pz-lab">单号查询<input class="inp ph-inp" id="phOne" maxlength="11" placeholder="11 位手机号" inputmode="numeric" /></label>' +
      '<label class="pz-lab ph-batch-lab">批量查询（每行一个，最多 50 个）<textarea class="inp" id="phBatch" rows="4" placeholder="13800138000&#10;18600186000"></textarea></label>' +
      '<button class="btn btn-main" id="phGo" type="button">📱 查询</button>' +
      '<div class="ic-status" id="phStatus"></div>' +
      '</div>' +
      '<div class="ph-cards" id="phOut" hidden></div>' +
      '<p class="cd-note">归属地为公开号段信息，仅供参考；携号转网等特殊情况可能显示不准。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#phGo', root).addEventListener('click', run);
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('phone', { mount, unmount });
})();
