/* LiteBox v5 · tools/weather.js — 天气预报（同源优先 → Open-Meteo 直连降级，10 分钟缓存） */
(function () {
  'use strict';

  const { $, esc } = LB.dom;

  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';
  const KEY_LAST = 'litebox_weather_last';
  const TTL = 10 * 60 * 1000;

  const DEFAULT_CITY = { name: '兰州', la: 36.06, lo: 103.83 };
  const CHIPS = ['兰州', '北京', '上海', '广州', '成都', '西安', '杭州', '纽约', '东京'];
  /* 快捷城市坐标（fallback 直连时用，无需 geocoding） */
  const CITY_COORD = {
    '兰州': [36.06, 103.83], '北京': [39.9, 116.4], '上海': [31.23, 121.47],
    '广州': [23.13, 113.26], '成都': [30.57, 104.07], '西安': [34.26, 108.94],
    '杭州': [30.27, 120.15], '纽约': [40.71, -74.01], '东京': [35.68, 139.69]
  };

  /* WMO 天气代码映射（任务给定） */
  const WX = {
    0: ['☀️', '晴'], 1: ['🌤️', '大致晴'], 2: ['⛅', '局部多云'], 3: ['☁️', '阴'],
    45: ['🌫️', '雾'], 48: ['🌫️', '雾凇'],
    51: ['🌦️', '毛毛雨'], 53: ['🌦️', '毛毛雨'], 55: ['🌦️', '毛毛雨'],
    56: ['🌧️', '冻雨'], 57: ['🌧️', '冻雨'],
    61: ['🌦️', '小雨'], 63: ['🌧️', '中雨'], 65: ['🌧️', '大雨'],
    66: ['🌧️', '冻雨'], 67: ['🌧️', '冻雨'],
    71: ['🌨️', '小雪'], 73: ['🌨️', '中雪'], 75: ['❄️', '大雪'], 77: ['🌨️', '雪粒'],
    80: ['🌦️', '阵雨'], 81: ['🌧️', '阵雨'], 82: ['⛈️', '强阵雨'],
    85: ['🌨️', '阵雪'], 86: ['❄️', '强阵雪'],
    95: ['⛈️', '雷雨'], 96: ['⛈️', '雷雨伴冰雹'], 99: ['⛈️', '强雷雨']
  };
  const wx = c => WX[c] || ['❓', '未知'];

  let rootEl = null;
  let seq = 0;
  let cur = null; /* { la, lo, label } */
  let lastQuery = null; /* Step 8：记住最后一次查询，错误卡片「重新获取」用 */
  /* 同一经纬度 10 分钟缓存（内存级） */
  const cache = new Map();

  /* 同源优先，直连降级（任务约定模板） */
  async function tryAPI(path, fallbackFn) {
    if (!HAS_API) {
      if (fallbackFn) return fallbackFn();
      throw new Error('服务暂时不可用');
    }
    try {
      return await LB.api.getJSON(path, { timeout: 6000 });
    } catch (_) {
      if (fallbackFn) return fallbackFn();
      throw new Error('服务暂时不可用');
    }
  }

  async function directJSON(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const ckey = (la, lo) => la.toFixed(2) + ',' + lo.toFixed(2);

  /* Open-Meteo forecast URL（任务给定） */
  function omURL(la, lo) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation' +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
      '&timezone=auto&forecast_days=7';
  }

  /* 按坐标取天气：/api/weather?lat&lon → open-meteo 直连 */
  async function fetchByCoords(la, lo) {
    const hit = cache.get(ckey(la, lo));
    if (hit && Date.now() - hit.ts < TTL) return hit.data;
    let d;
    if (HAS_API) {
      try {
        d = await LB.api.getJSON('/api/weather?lat=' + la + '&lon=' + lo, { timeout: 6000 });
      } catch (_) { d = null; }
    }
    if (!d) {
      const om = await directJSON(omURL(la, lo));
      d = {
        location: { name: cur && cur.label ? cur.label : '', admin1: '', country: '', latitude: la, longitude: lo },
        current: om.current, hourly: om.hourly, daily: om.daily, timezone: om.timezone
      };
    }
    cache.set(ckey(la, lo), { ts: Date.now(), data: d });
    return d;
  }

  /* 按城市名：/api/weather?name= → geocoding + forecast 直连 */
  async function fetchByName(name) {
    if (HAS_API) {
      try {
        const d = await LB.api.getJSON('/api/weather?name=' + encodeURIComponent(name), { timeout: 6000 });
        if (d && d.location) return d;
      } catch (_) { /* 降级 */ }
    }
    const g = await directJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=8&language=zh&format=json');
    if (!g.results || !g.results.length) throw new Error('未找到该城市');
    const c = g.results[0];
    const om = await directJSON(omURL(c.latitude, c.longitude));
    return {
      location: { name: c.name, admin1: c.admin1 || '', country: c.country || '', latitude: c.latitude, longitude: c.longitude },
      current: om.current, hourly: om.hourly, daily: om.daily, timezone: om.timezone
    };
  }

  function fmtTime(t) { /* 'YYYY-MM-DDTHH:mm' → 'M/D HH:mm' */
    if (!t) return '';
    const m = t.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? (+m[1]) + '/' + (+m[2]) + ' ' + m[3] + ':' + m[4] : t;
  }

  function hh(t) { const m = t.match(/T(\d{2}):\d{2}/); return m ? m[1] + '时' : t; }
  function mm(t) { const m = t.match(/T(\d{2}:\d{2})/); return m ? m[1] : t; }
  function wd(t) { return '周' + '日一二三四五六'.charAt(new Date(t + 'T12:00:00').getDay()); }
  function md(t) { const p = t.split('-'); return (+p[1]) + '/' + (+p[2]); }

  function render(d) {
    if (!rootEl) return;
    const c = d.current, dl = d.daily;
    const w0 = wx(c.weather_code);

    $('#weCity', rootEl).textContent = '📍 ' + (cur ? cur.label : (d.location.name || ''));
    $('#weTime', rootEl).textContent = '更新于 ' + fmtTime(c.time);
    $('#weTemp', rootEl).textContent = Math.round(c.temperature_2m) + '°';
    $('#weDesc', rootEl).textContent = w0[1] + ' ' + w0[0];
    $('#weFeel', rootEl).textContent = '体感 ' + Math.round(c.apparent_temperature) + '° · 湿度 ' + c.relative_humidity_2m + '%';
    $('#weRange', rootEl).textContent = '最高 ' + Math.round(dl.temperature_2m_max[0]) + '° / 最低 ' + Math.round(dl.temperature_2m_min[0]) + '°';

    /* 未来 12 小时 */
    const ht = d.hourly.time || [];
    let from = ht.findIndex(t => t >= c.time);
    if (from < 0) from = 0;
    let hHtml = '';
    for (let i = from; i < Math.min(from + 12, ht.length); i++) {
      const w = wx(d.hourly.weather_code[i]);
      const pp = d.hourly.precipitation_probability ? d.hourly.precipitation_probability[i] : null;
      hHtml += '<div class="we-hcell"><small>' + esc(hh(ht[i])) + '</small><b class="we-hicon">' + w[0] + '</b>' +
        '<span>' + Math.round(d.hourly.temperature_2m[i]) + '°</span>' +
        '<em>' + (pp === null || pp === undefined ? '—' : pp + '%') + '</em></div>';
    }
    $('#weH12', rootEl).innerHTML = hHtml;

    /* 未来 7 日 */
    let dHtml = '';
    for (let i = 0; i < dl.time.length; i++) {
      const w = wx(dl.weather_code[i]);
      const pp = dl.precipitation_probability_max ? dl.precipitation_probability_max[i] : null;
      const uv = dl.uv_index_max ? dl.uv_index_max[i] : null;
      dHtml += '<div class="we-drow"><b class="we-dwd">' + esc(wd(dl.time[i])) + '</b>' +
        '<small class="we-dmd">' + esc(md(dl.time[i])) + '</small>' +
        '<span class="we-dicon">' + w[0] + '</span>' +
        '<span class="we-dtmp">' + Math.round(dl.temperature_2m_max[i]) + '° / ' + Math.round(dl.temperature_2m_min[i]) + '°</span>' +
        '<small class="we-dpp">💧 ' + (pp === null || pp === undefined ? '—' : pp + '%') + '</small>' +
        '<small class="we-duv">UV ' + (uv === null || uv === undefined ? '—' : uv) + '</small></div>';
    }
    $('#weDaily', rootEl).innerHTML = dHtml;

    /* 体感与环境 4 格 */
    $('#weG1', rootEl).textContent = Math.round(c.apparent_temperature) + '°';
    $('#weG2', rootEl).textContent = c.relative_humidity_2m + '%';
    $('#weG3', rootEl).textContent = (Math.round(c.wind_speed_10m * 10) / 10) + ' km/h';
    $('#weG4', rootEl).textContent = (c.precipitation === null || c.precipitation === undefined ? '—' : c.precipitation + ' mm');

    /* 日出日落 */
    $('#weSunrise', rootEl).textContent = mm(dl.sunrise[0]);
    $('#weSunset', rootEl).textContent = mm(dl.sunset[0]);

    $('#weOut', rootEl).hidden = false;
  }

  function markChips() {
    document.querySelectorAll('#weChips .chip').forEach(ch => {
      ch.classList.toggle('on', !!cur && ch.textContent === cur.label);
    });
  }

  /* Step 8：加载态统一骨架屏 */
  function showLoading() {
    const load = $('#weLoad', rootEl);
    load.hidden = false;
    LB.ui.skeleton(load, 3, 'card');
    $('#weErr', rootEl).hidden = true;
  }

  /* Step 8：错误卡片「重新获取」 */
  function retryLast() {
    if (!lastQuery) return;
    if (lastQuery.type === 'coords') load(lastQuery.la, lastQuery.lo, lastQuery.label);
    else search(lastQuery.name);
  }

  async function load(la, lo, label) {
    cur = { la: la, lo: lo, label: label };
    lastQuery = { type: 'coords', la: la, lo: lo, label: label };
    markChips();
    const my = ++seq;
    const box = $('#weOut', rootEl);
    box.hidden = false;
    showLoading();
    try {
      const d = await fetchByCoords(la, lo);
      if (my !== seq) return;
      LB.storage.set(KEY_LAST, { la: la, lo: lo, label: label, ts: Date.now() });
      render(d);
    } catch (e) {
      if (my !== seq) return;
      box.hidden = true;
      $('#weErr', rootEl).hidden = false;
      $('#weErrTxt', rootEl).textContent = '天气获取失败，请检查网络后重试';
      LB.fail('天气', '接口暂时不可用', '检查网络后点击重试');
    } finally {
      if (my === seq) $('#weLoad', rootEl).hidden = true;
    }
  }

  async function search(name) {
    cur = { la: 0, lo: 0, label: name };
    lastQuery = { type: 'name', name: name };
    markChips();
    const my = ++seq;
    const box = $('#weOut', rootEl);
    box.hidden = false;
    showLoading();
    try {
      const d = await fetchByName(name);
      if (my !== seq) return;
      cur = { la: d.location.latitude, lo: d.location.longitude, label: d.location.name || name };
      markChips();
      LB.storage.set(KEY_LAST, { la: cur.la, lo: cur.lo, label: cur.label, ts: Date.now() });
      cache.set(ckey(cur.la, cur.lo), { ts: Date.now(), data: d });
      render(d);
    } catch (e) {
      if (my !== seq) return;
      box.hidden = true;
      $('#weErr', rootEl).hidden = false;
      const nf = e && e.message === '未找到该城市';
      $('#weErrTxt', rootEl).textContent = nf ? '未找到该城市，换个名字试试' : '天气获取失败，请检查网络后重试';
      LB.fail('天气', nf ? '未找到该城市' : '接口暂时不可用', nf ? '换个名字试试' : '检查网络后点击重试');
    } finally {
      if (my === seq) $('#weLoad', rootEl).hidden = true;
    }
  }

  function locate() {
    if (!navigator.geolocation) { LB.toast('当前环境不支持定位，可直接搜索城市', 'warn'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { load(pos.coords.latitude, pos.coords.longitude, '我的位置'); },
      () => { LB.toast('未获得定位权限，可直接搜索城市', 'warn'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  function chipsHtml() {
    return CHIPS.map(c => '<button class="chip" data-city="' + c + '" type="button">' + c + '</button>').join('');
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>天气预报</h1><p>全球城市实时天气 + 12 小时 / 7 日预报</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="we-search">' +
      '<input class="inp" id="weQ" maxlength="40" placeholder="搜索城市" />' +
      '<button class="btn btn-main btn-sm js-primary-submit" id="weGo" type="button">查询</button>' +
      '<button class="btn btn-ghost btn-sm" id="weLoc" type="button">📍 使用当前位置</button>' +
      '</div>' +
      '<div class="we-chips" id="weChips">' + chipsHtml() + '</div>' +
      '<div id="weLoad" hidden></div>' +
      /* Step 8：错误态换成标准空状态卡片（含重新获取 CTA） */
      '<div class="we-err card tool-sec" id="weErr" hidden><div class="empty-state">' +
      '<div class="es-icon" aria-hidden="true">⚠️</div>' +
      '<p class="es-title">获取失败</p>' +
      '<p class="es-sub" id="weErrTxt"></p>' +
      '<button class="btn btn-main es-cta" id="weRetry" type="button">重新获取</button>' +
      '</div></div>' +
      '<div id="weOut" hidden>' +
      '<div class="we-now">' +
      '<div class="we-city" id="weCity"></div>' +
      '<div class="we-time" id="weTime"></div>' +
      '<div class="we-mainrow"><span class="we-temp" id="weTemp"></span><span class="we-unit">℃</span></div>' +
      '<div class="we-desc" id="weDesc"></div>' +
      '<div class="we-sub" id="weFeel"></div>' +
      '<div class="we-sub" id="weRange"></div>' +
      '</div>' +
      '<h3 class="we-h3">未来 12 小时</h3>' +
      '<div class="we-h12" id="weH12"></div>' +
      '<h3 class="we-h3">未来 7 日</h3>' +
      '<div class="card we-dcard" id="weDaily"></div>' +
      '<h3 class="we-h3">体感与环境</h3>' +
      '<div class="we-grid4">' +
      '<div class="il-cell"><small>体感温度</small><b id="weG1"></b></div>' +
      '<div class="il-cell"><small>湿度</small><b id="weG2"></b></div>' +
      '<div class="il-cell"><small>风速</small><b id="weG3"></b></div>' +
      '<div class="il-cell"><small>降水</small><b id="weG4"></b></div>' +
      '</div>' +
      '<h3 class="we-h3">日出日落</h3>' +
      '<div class="we-sun">' +
      '<div class="il-cell we-suncell"><small>🌅 日出</small><b id="weSunrise"></b></div>' +
      '<div class="il-cell we-suncell"><small>🌇 日落</small><b id="weSunset"></b></div>' +
      '</div>' +
      '</div>' +
      '<p class="cd-note">天气数据 10 分钟内缓存复用；再进页面自动加载上次查询的城市。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    $('#weGo', root).addEventListener('click', e => {
      if (!LB.lock(e.currentTarget)) return;   /* Step 10：防连点 */
      const q = $('#weQ', root).value.trim();
      if (!q) { LB.toast('请输入城市名', 'info'); return; }
      search(q);
    });
    $('#weQ', root).addEventListener('keydown', e => { if (e.key === 'Enter') $('#weGo', root).click(); });
    $('#weLoc', root).addEventListener('click', locate);
    $('#weRetry', root).addEventListener('click', retryLast);
    $('#weChips', root).addEventListener('click', e => {
      const b = e.target.closest('[data-city]');
      if (!b) return;
      const c = b.getAttribute('data-city');
      const co = CITY_COORD[c];
      if (co) load(co[0], co[1], c); else search(c);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });

    /* 进入页面自动加载上次城市（默认兰州） */
    const last = LB.storage.get(KEY_LAST, null);
    if (last && typeof last.la === 'number' && typeof last.lo === 'number') {
      load(last.la, last.lo, last.label || '上次城市');
    } else {
      load(DEFAULT_CITY.la, DEFAULT_CITY.lo, DEFAULT_CITY.name);
    }
  }

  function unmount() {
    seq++; /* 进行中的请求返回后即被丢弃 */
    rootEl = null;
  }

  LB.router.register('weather', { mount, unmount });
})();
