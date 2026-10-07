/* LiteBox v5 · core/lunar.js — 农历转换（LB.lunar，数据按需加载 vendor/dict/lunar.js） */
(function () {
  'use strict';

  window.LB = window.LB || {};
  const LUNAR_BASE = Date.UTC(1900, 0, 31);

  /* 数据表按需加载（vendor/dict/lunar.js 挂 window.LB.dict.lunar） */
  let readyP = null;
  function ensure() {
    if (!readyP) readyP = LB.dict.load('lunar');
    return readyP;
  }

  function lunarYearDays(y) {
    let sum = 348; /* 12 个月 × 29 天 = 348 */
    const info = LB.dict.lunar.info[y - 1900];
    for (let i = 0x8000; i > 0x8; i >>= 1) sum += (info & i) ? 1 : 0;
    return sum + lunarLeapDays(y);
  }

  function lunarLeapMonth(y) {
    return LB.dict.lunar.info[y - 1900] & 0xf;
  }

  function lunarLeapDays(y) {
    if (lunarLeapMonth(y)) return (LB.dict.lunar.info[y - 1900] & 0x10000) ? 30 : 29;
    return 0;
  }

  function lunarMonthDays(y, m) {
    return (LB.dict.lunar.info[y - 1900] & (0x10000 >> m)) ? 30 : 29;
  }

  function solarToLunar(dt) {
    let offset = Math.floor((Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) - LUNAR_BASE) / 86400000);
    let y, temp = 0;
    for (y = 1900; y < 2101 && offset > 0; y++) { temp = lunarYearDays(y); offset -= temp; }
    if (offset < 0) { offset += temp; y--; }
    const year = y;
    const leap = lunarLeapMonth(y);
    let isLeap = false, m;
    for (m = 1; m < 13 && offset > 0; m++) {
      if (leap > 0 && m === leap + 1 && !isLeap) { --m; isLeap = true; temp = lunarLeapDays(y); }
      else temp = lunarMonthDays(y, m);
      if (isLeap && m === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && m === leap + 1) {
      if (isLeap) isLeap = false;
      else { isLeap = true; --m; }
    }
    if (offset < 0) { offset += temp; --m; }
    const month = m;
    const day = offset + 1;
    const gz = LB.dict.lunar.gan[(year - 4) % 10] + LB.dict.lunar.zhi[(year - 4) % 12];
    return { year, month, day, isLeap, gz, animal: LB.dict.lunar.animals[(year - 4) % 12] };
  }

  /* 节气：近似公式，误差 ±1 天（24 节气中前两个在 1 月，依次类推） */
  function solarTerm(y, m, d) {
    const c = LB.dict.lunar.termBase;
    for (let i = 0; i < 24; i++) {
      const cm = Math.floor(i / 2) + 1;
      if (cm !== m) continue;
      const dd = Math.floor(c[i] + 0.2422 * (y - 1900) - Math.floor((y - 1900) / 4));
      if (dd === d) return LB.dict.lunar.termNames[i];
    }
    return '';
  }

  /* 农历月中文（如 "八" / "闰四"）与日中文（"初五"） */
  function monthCn(lu) {
    return (lu.isLeap ? '闰' : '') + LB.dict.lunar.monthNames[lu.month - 1] + '月';
  }
  function dayCn(lu) {
    return LB.dict.lunar.dayNames[lu.day - 1];
  }

  /* 生成某公历月的日历数据 */
  function buildMonth(year, month) {
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const cnt = new Date(year, month, 0).getDate();
    const days = [];
    for (let d = 1; d <= cnt; d++) {
      const lu = solarToLunar(new Date(year, month - 1, d));
      days.push({ d, lunar: lu, term: solarTerm(year, month, d) });
    }
    return { firstWeekday, days, firstLunar: days[0].lunar };
  }

  LB.lunar = {
    ready: ensure,
    solarToLunar,
    monthDays: lunarMonthDays,
    leapDays: lunarLeapDays,
    leapMonth: lunarLeapMonth,
    solarTerm,
    buildMonth,
    monthCn,
    dayCn
  };
})();
