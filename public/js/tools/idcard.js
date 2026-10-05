/* LiteBox v5 · tools/idcard.js — 身份证解析（GB 11643-1999 校验，号码仅在本机计算） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  let rootEl = null;

  /* 省级行政区代码表（GB/T 2260，全 31 项） */
  const PROV = {
    11: '北京', 12: '天津', 13: '河北', 14: '山西', 15: '内蒙古',
    21: '辽宁', 22: '吉林', 23: '黑龙江',
    31: '上海', 32: '江苏', 33: '浙江', 34: '安徽', 35: '福建', 36: '江西', 37: '山东',
    41: '河南', 42: '湖北', 43: '湖南', 44: '广东', 45: '广西', 46: '海南',
    50: '重庆', 51: '四川', 52: '贵州', 53: '云南', 54: '西藏',
    61: '陕西', 62: '甘肃', 63: '青海', 64: '宁夏', 65: '新疆',
    71: '中国台湾', 81: '中国香港', 82: '中国澳门'
  };
  const W = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  const CUT = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const SIGNS = ['摩羯', '水瓶', '双鱼', '白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯'];

  function parse(id) {
    /* 1. 长度 18、前 17 位数字、末位数字或 X */
    if (!/^\d{17}[\dXx]$/.test(id)) return { ok: false, msg: '格式不正确：应为 18 位，前 17 位数字，末位数字或 X' };

    /* 2. 出生日期合法性 */
    const year = +id.slice(6, 10), month = +id.slice(10, 12), day = +id.slice(12, 14);
    const nowY = new Date().getFullYear();
    if (year < 1900 || year > nowY) return { ok: false, msg: '出生年份不合法（1900-' + nowY + '）' };
    if (month < 1 || month > 12) return { ok: false, msg: '出生月份不合法' };
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const md = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > md[month - 1]) return { ok: false, msg: '出生日期不合法' };

    /* 3. 校验位（GB 11643-1999） */
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += +id[i] * W[i];
    const code = CODES[sum % 11];
    if (code !== id[17].toUpperCase()) return { ok: false, msg: '校验码不正确，正确应为 ' + code };

    /* 字段解析 */
    const today = new Date();
    let age = today.getFullYear() - year;
    const m = today.getMonth() + 1, d = today.getDate();
    if (m < month || (m === month && d < day)) age--;
    if (age < 0) age = 0;

    return {
      ok: true,
      prov: PROV[id.slice(0, 2)] || '未知',
      birth: id.slice(6, 10) + '-' + id.slice(10, 12) + '-' + id.slice(12, 14),
      gender: +id[16] % 2 === 1 ? '男' : '女',
      age,
      animal: ANIMALS[((year - 4) % 12 + 12) % 12],
      sign: SIGNS[(month - 1) + (day >= CUT[month - 1] ? 1 : 0)],
      code
    };
  }

  function run() {
    const raw = $('#icIn', rootEl).value.trim().toUpperCase();
    const st = $('#icStatus', rootEl);
    const out = $('#icOut', rootEl);
    if (!raw) { st.textContent = '请输入身份证号'; st.className = 'ic-status ic-err'; out.hidden = true; return; }
    const r = parse(raw);
    if (!r.ok) {
      st.textContent = '❌ ' + r.msg;
      st.className = 'ic-status ic-err';
      out.hidden = true;
      return;
    }
    st.textContent = '✓ 校验通过（校验码 ' + r.code + '）';
    st.className = 'ic-status ic-ok';
    const card = (lab, val) => '<div class="res-card"><div class="rc-lab">' + lab + '</div><div class="rc-val">' + val + '</div></div>';
    $('#icOut', rootEl).innerHTML =
      card('校验结果', '合法 ✓') +
      card('出生日期', r.birth) +
      card('性别', r.gender) +
      card('年龄', r.age + ' 周岁') +
      card('户籍省份', r.prov) +
      card('生肖', r.animal) +
      card('星座', r.sign);
    out.hidden = false;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>身份证解析</h1><p>校验位验证与属地、生日、生肖、星座解析</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card tool-sec set-card">' +
      '<div class="tip-priv">🔒 号码仅在本机计算，不会上传。可放心使用。</div>' +
      '<input class="inp ic-inp" id="icIn" maxlength="18" placeholder="18 位身份证号" inputmode="numeric" />' +
      '<button class="btn btn-main" id="icGo" type="button">🔍 解析</button>' +
      '<div class="ic-status" id="icStatus"></div>' +
      '</div>' +
      '<div class="res-grid" id="icOut" hidden></div>' +
      '<p class="cd-note">校验算法遵循 GB 11643-1999；行政区划代码取前 2 位（省级）。本工具仅供合法用途查询自有号码信息。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#icGo', root).addEventListener('click', run);
    $('#icIn', root).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
  }

  function unmount() { rootEl = null; }

  LB.router.register('idcard', { mount, unmount });
})();
