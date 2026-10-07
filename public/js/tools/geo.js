/* LiteBox v5 · tools/geo.js — 经纬度转换（十进制度 / 度分 / 度分秒 三格式互转）
 *
 * 【符号处理：为什么不能简单 Math.abs 掉】
 *   南纬 / 西经是负数。转成度分秒时不能直接把负号吞掉，
 *   否则 -33.8688（悉尼）会变成 33°52'7.68"，等于跑到北半球去了。
 *   做法是：符号单独记为 -1，绝对值部分做 度/分/秒 分解，
 *   度数带上符号、分数保持正 —— 显示为 -33°52'7.68"，反解时再乘回符号。
 *
 * 【秒的进位用round 而不是 floor】
 *   39.9042 → 分的小数部分是 0.252'，×60 = 15.12"。
 *   但像 39.9 这样秒恰好是 59.9999 的情况，floor 会得到 59.9999秒而不是进位成 60分。
 *   所以秒先round 到 4 位小数，再做进位判断。
 *
 * 【双向编辑：谁是主输入谁是派生】
 *   三个输入框可以任选其一输入，另外两个实时反算。
 *   实现上只保留一个「正在编辑」的框（activeField），
 *   反算时跳过它，否则用户正在输入的 "3" 会被立刻改成 "3.0000"而无法继续输入。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  let rootEl = null;
  let axis = 'lat';        /* lat纬度 | lon 经度 */
  let activeField = 'dd';  /* dd十进制度 | dm 度分 | dms 度分秒 */

  const AXIS = { lat: '纬度', lon: '经度' };
  const RANGE = {
    lat: [-90, 90],
    lon: [-180, 180]
  };

  /* ---------- 核心算法（任务书给的基础版+ 符号与进位处理） ---------- */
  function dd2dms(dd) {
    const sign = dd < 0 ? -1 : 1;
    const abs = Math.abs(dd);
    let d = Math.floor(abs);
    let mFull = (abs - d) * 60;
    let m = Math.floor(mFull);
    let s = (mFull - m) * 60;
    /* 先抹平浮点尾巴再进位：59.99999999 秒应当进位成 1 分 0 秒 */
    s = Math.round(s * 1e4) / 1e4;
    if (s >= 60) { s -= 60; m += 1; }
    if (m >= 60) { m -= 60; d += 1; }
    return { d: sign * d, m: m, s: s };
  }

  function dms2dd(d, m, s, sign) {
    return sign * (Math.abs(d) + m / 60 + s / 3600);
  }

  /* 度分格式：把 39.9042 转成 {d:39, m:54.252, sign:1}
     度分里的「分」是小数（54.252 分），和度分秒是两回事，别混。 */
  function dd2dm(dd) {
    const sign = dd < 0 ? -1 : 1;
    const abs = Math.abs(dd);
    const d = Math.floor(abs);
    let m = (abs - d) * 60;
    m = Math.round(m * 1e4) / 1e4;
    if (m >= 60) return { d: sign * (d + 1), m: 0, sign: sign };
    return { d: sign * d, m: m, sign: sign };
  }

  /* ---------- 解析 ---------- */
  /* 十进制度：允许负号与正负号 */
  function parseDd(v) {
    const t = String(v).trim();
    if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  }

  /* 度分：「39°54.252'」/「39 54.252」/「39,54.252」/「-39 54.252」 */
  function parseDm(v) {
    let t = String(v).trim();
    if (!t) return null;
    let sign = 1;
    if (t[0] === '-') { sign = -1; t = t.slice(1).trim(); }
    else if (t[0] === '+') { t = t.slice(1).trim(); }
    /* 允许三种分隔：° ' °后缀 / 空格 / 逗号 */
    t = t.replace(/[°º]/g, ' ').replace(/[′’']/g, ' ').replace(/"/g, ' ').replace(/[,，]/g, ' ').trim();
    const parts = t.split(/\s+/).filter(Boolean);
    /* 方位字母后缀（N/S/E/W）直接剥掉 */
    const filtered = parts.filter(x => !/^[NSEWnsew]$/.test(x));
    const suffix = parts.length !== filtered.length ? parts[parts.length - 1] : '';
    if (suffix && !/^[NSEWnsew]$/.test(suffix)) return null;
    if (suffix) {
      if (/[Ss]/.test(suffix)) sign = -1;
      else if (/[Ww]/.test(suffix)) sign = -1;
    }
    /* ★ 必须恰好两段：缺度数时不能把「分」当度数。
       否则只打 "54'" 会被当成 0°54' = 0.9°，静默算错极难发现。 */
    if (filtered.length !== 2) return null;
    if (!/^\d+(\.\d+)?$/.test(filtered[0])) return null;
    if (!/^\d+(\.\d+)?$/.test(filtered[1])) return null;
    const d = parseInt(filtered[0], 10);
    const m = parseFloat(filtered[1]);
    if (m >= 60) return null;
    return dms2dd(d, m, 0, sign);
  }

  /* 度分秒：「39°54'15.12"」/「39 54 15.12」/「39,54,15.12」 */
  function parseDms(v) {
    let t = String(v).trim();
    if (!t) return null;
    let sign = 1;
    if (t[0] === '-') { sign = -1; t = t.slice(1).trim(); }
    else if (t[0] === '+') { t = t.slice(1).trim(); }
    t = t.replace(/[°º]/g, ' ').replace(/[′’']/g, ' ').replace(/["″”]/g, ' ').replace(/[,，]/g, ' ').trim();
    const parts = t.split(/\s+/).filter(Boolean);
    /* 同样剥掉方位后缀 */
    const filtered = parts.filter(x => !/^[NSEWnsew]$/.test(x));
    if (filtered.length !== parts.length) {
      const suffix = parts[parts.length - 1];
      if (/[SsWw]/.test(suffix)) sign = -1;
    }
    /* ★ 至少两段：只有度数时（"39°"）交给 parseDd 处理。
       这里若允许单段，"°54'"剥掉符号后只剩 "54"，会被当成 54度 —— 分与度混淆。 */
    if (filtered.length < 2 || filtered.length > 3) return null;
    const nums = [];
    for (const p of filtered) {
      if (!/^\d+(\.\d+)?$/.test(p)) return null;
      nums.push(parseFloat(p));
    }
    const d = nums[0], m = nums.length > 1 ? nums[1] : 0, s = nums.length > 2 ? nums[2] : 0;
    if (m >= 60 || s >= 60) return null;
    return dms2dd(d, m, s, sign);
  }

  /* ---------- 格式化 ---------- */
  function trimNum(n, digits) {
    let s = n.toFixed(digits);
    /* 去掉末尾多余的 0：15.120000 → 15.12，39.0000 → 39 */
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  function fmtDd(v) { return trimNum(v, 8); }
  function fmtDm(v) {
    const o = dd2dm(v);
    const m = trimNum(o.m, 5);
    const sign = o.sign < 0 && (o.d !== 0 || o.m !== 0) ? '-' : '';
    return sign + Math.abs(o.d) + '° ' + m + "'";
  }
  function fmtDms(v) {
    const o = dd2dms(v);
    const sign = o.d < 0 ? '-' : '';
    return sign + Math.abs(o.d) + '°' + Math.floor(o.m) + "'" + trimNum(o.s, 4) + '"';
  }

  function inRange(v) {
    const r = RANGE[axis];
    return v >= r[0] && v <= r[1];
  }

  /* ---------- 联动 ---------- */
  function setOutputs(dd) {
    if (activeField !== 'dd') $('#geoDd', rootEl).value = fmtDd(dd);
    if (activeField !== 'dm') $('#geoDm', rootEl).value = fmtDm(dd);
    if (activeField !== 'dms') $('#geoDms', rootEl).value = fmtDms(dd);

    const r = RANGE[axis];
    const hint = $('#geoHint', rootEl);
    if (!inRange(dd)) {
      hint.textContent = '超出' + AXIS[axis] + '范围（' + r[0] + '° ~ ' + r[1] + '°），结果仅供参考';
      hint.classList.add('warn');
    } else {
      hint.textContent = AXIS[axis] + ' ' + (dd >= 0 ? axis === 'lat' ? '北纬 N' : '东经 E' : axis === 'lat' ? '南纬 S' : '西经 W');
      hint.classList.remove('warn');
    }
  }

  function onEdit(which) {
    activeField = which;
    const v = which === 'dd' ? parseDd($('#geoDd', rootEl).value)
      : which === 'dm' ? parseDm($('#geoDm', rootEl).value)
        : parseDms($('#geoDms', rootEl).value);
    if (v === null) {
      /* 格式不对：不动其它两个框，让用户把当前这个改完 */
      $('#geoHint', rootEl).textContent = '格式无法识别';
      $('#geoHint', rootEl).classList.add('warn');
      return;
    }
    setOutputs(v);
  }

  function setAxis(a) {
    axis = a;
    $$('.geo-axis', rootEl).forEach(b => b.classList.toggle('on', b.dataset.a === a));
    /* 切换维度后原值几乎必然越界，落到 0 并给出提示，而不是留一个红框 */
    const cur = parseDd($('#geoDd', rootEl).value);
    if (cur === null || !inRange(cur)) {
      activeField = 'dd';
      $('#geoDd', rootEl).value = '0';
      setOutputs(0);
    } else {
      onEdit(activeField === 'dd' ? 'dd' : activeField);
    }
  }

  /* 点击常用示例，省得自己敲符号 */
  const SAMPLES = [
    { n: '北京天安门', lat: 39.9087, lon: 116.3975 },
    { n: '上海东方明珠', lat: 31.2397, lon: 121.4998 },
    { n: '悉尼（南纬）', lat: -33.8688, lon: 151.2093 }
  ];

  function loadSample(idx) {
    const s = SAMPLES[idx];
    if (!s) return;
    activeField = 'dd';
    $('#geoDd', rootEl).value = fmtDd(axis === 'lat' ? s.lat : s.lon);
    onEdit('dd');
    LB.toast('已载入' + s.n, 'info');
  }

  /* 复制当前十进制度。三个输入框里只有 dd 是唯一真值来源，
     复制它最不容易让用户拿到自己没确认过的数字。 */
  function copyDd() {
    const v = parseDd($('#geoDd', rootEl).value);
    if (v === null) { LB.toast('当前十进制度无法识别', 'err'); return; }
    const txt = fmtDd(v);
    /* ★ 同步调用，不能 await */
    if (!LB.copyNow(txt, AXIS[axis] + ' ' + txt + ' 已复制')) {
      LB.toast('复制失败，请手动选中复制', 'err');
    }
  }

  /* ---------- Step 11 · B2：获取当前位置 ----------
     拿到坐标后填进当前维度输入框，三个格式会照常联动反算。
     城市名是「顺带」的：反向地理编码失败只显示坐标，不影响主流程。
     注意：geolocation 只在安全上下文（https / localhost）可用，
     非安全上下文浏览器会直接走失败回调。 */
  function setLocated(lat, lon, city) {
    const box = $('#geoLoc', rootEl);
    if (box) {
      box.textContent = '纬度 ' + fmtDd(lat) + ' · 经度 ' + fmtDd(lon) + (city ? ' · ' + city : '');
      box.hidden = false;
    }
    /* 顺手把当前维度填进输入框：用户点完定位通常就是要复制这个数 */
    activeField = 'dd';
    $('#geoDd', rootEl).value = fmtDd(axis === 'lat' ? lat : lon);
    onEdit('dd');
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      LB.fail('定位', '当前浏览器不支持', '请手动输入经纬度');
      return;
    }
    const btn = $('#geoLocBtn', rootEl);
    if (btn) { btn.disabled = true; btn.textContent = '📍 定位中…'; }

    const done = () => {
      if (btn) { btn.disabled = false; btn.textContent = '📍 获取当前位置'; }
    };

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        /* 先落坐标：城市查不到也不该让用户白等一场 */
        setLocated(latitude, longitude, '');
        done();

        fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
          latitude + '&lon=' + longitude + '&zoom=10')
          .then(function (r) { return r.json(); })
          .then(function (d) {
            const a = (d && d.address) || {};
            const city = a.city || a.town || a.county || a.state || '';
            if (city) setLocated(latitude, longitude, city);
          })
          .catch(function () { /* 只显示坐标 */ });
      },
      function () {
        done();
        LB.fail('定位', '用户拒绝授权', '请手动输入或检查浏览器权限');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>经纬度转换</h1><p>十进制度、度分、度分秒三种格式互相转换</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="seg seg-2">' +
      '<button class="geo-axis on" data-a="lat" type="button">📐 纬度</button>' +
      '<button class="geo-axis" data-a="lon" type="button">📐 经度</button>' +
      '</div>' +
      '<div class="geo-grid">' +
      '<label class="geo-lab">十进制度' +
      '<input class="inp mono" id="geoDd" type="text" inputmode="decimal" placeholder="39.9042" aria-label="十进制度"></label>' +
      '<label class="geo-lab">度分（度 + 小数分）' +
      '<input class="inp mono" id="geoDm" type="text" placeholder="39° 54.252\'" aria-label="度分"></label>' +
      '<label class="geo-lab">度分秒' +
      '<input class="inp mono" id="geoDms" type="text" placeholder="39° 54\' 15.12&quot;" aria-label="度分秒"></label>' +
      '</div>' +
      '<p class="cd-note" id="geoHint"></p>' +
      '<p class="jst" id="geoLoc" hidden></p>' +
      '<div class="set-btns">' +
      '<button class="btn btn-main js-primary-submit" id="geoCopy" type="button">📋 复制十进制度</button>' +
      '<button class="btn btn-ghost" id="geoLocBtn" type="button">📍 获取当前位置</button>' +
      '<button class="btn btn-ghost" type="button" data-s="0">北京</button>' +
      '<button class="btn btn-ghost" type="button" data-s="1">上海</button>' +
      '<button class="btn btn-ghost" type="button" data-s="2">悉尼（南纬）</button>' +
      '</div>' +
      '<p class="cd-note">三个框可以任选一个输入，另两个实时反算。' +
      '可识别的写法：<b>39.9042</b>、<b>39°54.252\'</b>、<b>39°54\'15.12"</b>，' +
      '负号表示南纬 / 西经。换算与复制都在本机完成；只有点「📍 获取当前位置」时' +
      '才会向浏览器申请定位权限。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    axis = 'lat';
    activeField = 'dd';
    $('#geoDd', root).value = '39.9042';
    onEdit('dd');

    $$('.geo-axis', root).forEach(b => b.addEventListener('click', () => setAxis(b.dataset.a)));
    /* 三个输入框共用一套联动，靠 activeField 标记谁是源 */
    $('#geoDd', root).addEventListener('input', () => onEdit('dd'));
    $('#geoDm', root).addEventListener('input', () => onEdit('dm'));
    $('#geoDms', root).addEventListener('input', () => onEdit('dms'));
    $('#geoCopy', root).addEventListener('click', copyDd);
    $('#geoLocBtn', root).addEventListener('click', getCurrentLocation);
    root.addEventListener('click', e => {
      const s = e.target.closest('[data-s]');
      if (s) { loadSample(parseInt(s.dataset.s, 10)); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() { rootEl = null; }

  LB.router.register('geo', { mount, unmount });
})();
