/* LiteBox v5 · tools/jobvalue.js — 工作性价比计算（评分 + 时薪 + 明细 + 分享图）
 *
 * 【评分模型严格按任务书实现】
 *   基础分 100，再叠加四类调整：时薪惩罚 / 加班惩罚 / 通勤惩罚 / 福利加成，
 *   最后 clamp 到 0-100 分，映射 S/A/B/C/D 五档。
 *
 * 【工作日数：21.75 的来历】
 *   任务书时薪公式里的 21.75 是「5 天工作制」的月均工作日（5 × 4.35）。
 *   但本工具允许选 5-7 天，若仍写死 21.75，6 天班会被低估、7 天班更离谱。
 *   故把 21.75 泛化为「每周工作天数 × 4.35」——5 天时正好等于 21.75，
 *   与任务书口径完全一致，同时让 6/7 天班算得对。
 *
 * 【社保公积金口径】
 *   任务书只给了「月薪 - 社保公积金 - 通勤花费」这一项，未规定比例。
 *   这里按个人缴纳部分合计约 22%（养老 8% + 医疗 2% + 失业 0.5% + 公积金 12% 取整）估算；
 *   勾选「无五险一金」则按 0 计（但福利加成会 -10 分，体现"短期到手高、长期保障差"）。
 *
 * 【分享图参照 countdown.js 的 750×1000 竖版范式】
 *   系统分享（navigator.share）优先，不支持时降级下载 PNG。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  const BRAND = 'LiteBox · 工作性价比';
  const WEEKS_PER_MONTH = 4.35;      /* 5 天 × 4.35 = 21.75，与任务书一致 */
  const SOCIAL_RATE = 0.22;          /* 个人五险一金合计估算比例 */

  let rootEl = null;

  const num = id => {
    const v = parseFloat($('#' + id, rootEl).value);
    return isFinite(v) ? v : 0;
  };

  /* ---------- 评分模型 ---------- */
  function evaluate() {
    const salary = Math.max(0, num('jvSalary'));
    const days = Math.min(7, Math.max(5, Math.round(num('jvDays') || 5)));
    const hours = Math.min(12, Math.max(8, num('jvHours') || 8));
    const commute = Math.min(4, Math.max(0, num('jvCommute')));
    const overtime = Math.min(80, Math.max(0, num('jvOvertime')));
    const commuteCost = Math.max(0, num('jvCommuteCost'));
    const rent = Math.max(0, num('jvRent'));
    const hasInsurance = $('#jvInsurance', rootEl).checked;

    const workDays = days * WEEKS_PER_MONTH;              /* 月均工作日 */
    const social = hasInsurance ? Math.round(salary * SOCIAL_RATE) : 0;
    const takeHome = Math.max(0, salary - social - commuteCost);      /* 实际到手（不含房租） */
    const netAfterRent = Math.max(0, takeHome - rent);
    const totalHours = (hours + commute) * workDays + overtime;       /* 每月总工作小时（含通勤+加班） */

    /* 时薪：任务书口径 —— (月薪 - 社保 - 通勤花费) / (每天工时 + 通勤) / 工作日数 */
    const perDay = hours + commute;
    const hourly = perDay > 0 && workDays > 0 ? takeHome / perDay / workDays : 0;

    const items = [];   /* 明细：[{label, delta, note}] */
    let score = 100;

    /* 1. 时薪惩罚 */
    let d1 = 0, n1 = '';
    if (hourly < 15) { d1 = -30; n1 = '时薪不足 15 元，低于最低工资线'; }
    else if (hourly < 25) { d1 = -15; n1 = '时薪不足 25 元，偏低'; }
    else if (hourly < 40) { d1 = -5; n1 = '时薪不足 40 元，一般'; }
    else if (hourly >= 60) { d1 = 5; n1 = '时薪 60 元以上，优秀'; }
    else { n1 = '时薪处于 40-60 元合理区间'; }
    score += d1;
    items.push({ label: '时薪水平', delta: d1, note: n1 + '（' + r2(hourly) + ' 元/时）' });

    /* 2. 加班惩罚 */
    const otRatio = workDays > 0 ? overtime / (workDays * 8) : 0;
    let d2 = 0, n2 = '';
    if (otRatio > 1) { d2 = -20; n2 = '加班系数 > 1，严重过劳'; }
    else if (otRatio > 0.5) { d2 = -10; n2 = '加班系数 > 0.5，加班较多'; }
    else if (overtime === 0) { d2 = 5; n2 = '几乎不加班'; }
    else { n2 = '加班在可接受范围'; }
    score += d2;
    items.push({ label: '加班强度', delta: d2, note: n2 + '（系数 ' + r2(otRatio) + '）' });

    /* 3. 通勤惩罚 */
    let d3 = 0, n3 = '';
    if (commute > 3) { d3 = -15; n3 = '每天通勤 3 小时以上，极度消耗'; }
    else if (commute > 2) { d3 = -8; n3 = '每天通勤 2 小时以上，比较累'; }
    else if (commute < 0.5) { d3 = 5; n3 = '通勤不到半小时，很轻松'; }
    else { n3 = '通勤时间适中'; }
    score += d3;
    items.push({ label: '通勤时间', delta: d3, note: n3 + '（每天 ' + commute + ' 小时）' });

    /* 4. 福利加成 */
    const d4 = hasInsurance ? 10 : -10;
    score += d4;
    items.push({ label: '五险一金', delta: d4, note: hasInsurance ? '有完整五险一金' : '无五险一金，保障缺失' });

    score = Math.max(0, Math.min(100, Math.round(score)));

    const grade = score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
    const gradeText = { S: '梦中情班', A: '相当不错', B: '中规中矩', C: '比较辛苦', D: '性价比堪忧' }[grade];

    return {
      score, grade, gradeText, salary, days, hours, commute, overtime, commuteCost, rent,
      hasInsurance, social, takeHome, netAfterRent, totalHours, workDays, hourly, items
    };
  }

  const r1 = n => Math.round(n * 10) / 10;
  const r2 = n => Math.round(n * 100) / 100;

  /* ---------- 渲染 ---------- */
  function render() {
    if (!rootEl) return;
    const R = evaluate();
    const g = $('#jvGrade', rootEl);
    $('#jvScore', rootEl).textContent = R.score;
    g.textContent = R.grade;
    g.className = 'jv-grade jv-g-' + R.grade;
    $('#jvGradeText', rootEl).textContent = R.gradeText;

    $('#jvHourly', rootEl).textContent = r2(R.hourly) + ' 元';
    $('#jvTakeHome', rootEl).textContent = '¥' + Math.round(R.takeHome).toLocaleString('zh-CN');
    $('#jvHoursTotal', rootEl).textContent = Math.round(R.totalHours) + ' 小时';
    $('#jvDays', rootEl).textContent = r1(R.workDays) + ' 天';

    $('#jvItems', rootEl).innerHTML = R.items.map(it =>
      '<div class="jv-row">' +
      '<span class="jv-lab">' + it.label + '</span>' +
      '<span class="jv-note">' + it.note + '</span>' +
      '<span class="jv-delta ' + (it.delta > 0 ? 'up' : it.delta < 0 ? 'down' : 'flat') + '">' +
      (it.delta > 0 ? '+' : '') + it.delta + '</span>' +
      '</div>'
    ).join('');

    const extra = [];
    extra.push(['月薪', '¥' + Math.round(R.salary).toLocaleString('zh-CN')]);
    extra.push(['社保公积金（约 ' + Math.round(SOCIAL_RATE * 100) + '%）', '−¥' + R.social.toLocaleString('zh-CN')]);
    extra.push(['通勤花费', '−¥' + Math.round(R.commuteCost).toLocaleString('zh-CN')]);
    if (R.rent > 0) extra.push(['房租', '−¥' + Math.round(R.rent).toLocaleString('zh-CN')]);
    extra.push(['扣房租后结余', '¥' + Math.round(R.netAfterRent).toLocaleString('zh-CN')]);
    $('#jvExtra', rootEl).innerHTML = extra.map(x =>
      '<div class="jv-kv"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'
    ).join('');
  }

  /* ---------- 分享图（750×1000） ---------- */
  function fitFont(c, text, wantPx, maxW) {
    let px = wantPx;
    c.font = '900 ' + px + 'px ' + FONT;
    while (px > 24 && c.measureText(text).width > maxW) {
      px -= 4;
      c.font = '900 ' + px + 'px ' + FONT;
    }
    return px;
  }

  function generateShareImage(R) {
    const W = 750, H = 1000;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    const grad = c.createLinearGradient(0, 0, W, H);
    /* Step 9：品牌渐变运行时读取 tokens 变量（画布不能直接用 CSS 变量），保持全站同色 */
    const brandCss = getComputedStyle(document.documentElement);
    grad.addColorStop(0, brandCss.getPropertyValue('--brand1').trim() || '#4a5ae6');
    grad.addColorStop(1, brandCss.getPropertyValue('--brand2').trim() || '#7c3aed');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);

    c.save();
    c.globalAlpha = 0.10;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(W - 50, 110, 210, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(80, H - 70, 160, 0, Math.PI * 2); c.fill();
    c.restore();

    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';

    c.fillStyle = 'rgba(255,255,255,.78)';
    c.font = '600 30px ' + FONT;
    c.fillText('我的工作性价比评分', W / 2, 130);

    const scoreStr = String(R.score);
    const sSize = fitFont(c, scoreStr, 260, W - 260);
    c.font = '900 ' + sSize + 'px ' + FONT;
    c.fillStyle = '#ffffff';
    c.fillText(scoreStr, W / 2, 430);

    c.fillStyle = 'rgba(255,255,255,.9)';
    c.font = '700 44px ' + FONT;
    c.fillText('分', W / 2 + sSize * 0.62, 430);

    /* 等级徽章 */
    const badgeW = 220, badgeH = 92, bx = (W - badgeW) / 2, by = 486;
    c.fillStyle = 'rgba(255,255,255,.20)';
    if (c.roundRect) { c.beginPath(); c.roundRect(bx, by, badgeW, badgeH, 46); c.fill(); }
    else c.fillRect(bx, by, badgeW, badgeH);
    c.fillStyle = '#ffffff';
    c.font = '900 56px ' + FONT;
    c.fillText(R.grade + ' 级', W / 2, by + 66);

    c.fillStyle = 'rgba(255,255,255,.92)';
    c.font = '600 34px ' + FONT;
    c.fillText(R.gradeText, W / 2, 640);

    /* 时薪大数字 */
    c.fillStyle = 'rgba(255,255,255,.72)';
    c.font = '500 28px ' + FONT;
    c.fillText('实际时薪（含通勤）', W / 2, 726);
    c.fillStyle = '#ffffff';
    c.font = '900 66px ' + FONT;
    c.fillText(r2(R.hourly) + ' 元/时', W / 2, 796);

    c.fillStyle = 'rgba(255,255,255,.80)';
    c.font = '500 26px ' + FONT;
    c.fillText('月薪 ' + Math.round(R.salary).toLocaleString('zh-CN') + ' 元 · 每周 ' + R.days + ' 天 · 每天 ' + R.hours + ' 小时', W / 2, 848);

    c.strokeStyle = 'rgba(255,255,255,.28)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(W / 2 - 130, 886); c.lineTo(W / 2 + 130, 886); c.stroke();

    c.fillStyle = 'rgba(255,255,255,.60)';
    c.font = '400 24px ' + FONT;
    c.fillText('由 ' + BRAND + ' 生成', W / 2, 930);

    return cv;
  }

  function toBlob(cv) {
    return new Promise(resolve => { cv.toBlob(b => resolve(b), 'image/png'); });
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

  async function share() {
    const btn = $('#jvShare', rootEl);
    if (btn) btn.disabled = true;
    try {
      const R = evaluate();
      const blob = await toBlob(generateShareImage(R));
      if (!blob) throw new Error('toBlob 失败');
      const name = 'jobvalue-' + R.score + R.grade + '.png';
      const file = (typeof File === 'function') ? new File([blob], name, { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title: '工作性价比评分', text: '我的工作性价比评分 ' + R.score + ' 分（' + R.grade + ' 级）' });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      download(blob, name);
      LB.toast('已生成分享图并下载', 'ok');
    } catch (e) {
      LB.toast('分享图生成失败，请重试', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function field(id, label, value, attrs) {
    return '<label class="jv-field"><span>' + label + '</span>' +
      '<input class="inp" id="' + id + '" type="number" value="' + value + '" ' + (attrs || '') + '></label>';
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>工作性价比计算</h1><p>综合月薪、通勤、加班、福利，计算工作性价比评分</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="card jv-result">' +
      '<div class="jv-score-wrap"><span class="jv-score" id="jvScore">—</span>' +
      '<div class="jv-grade-box"><span class="jv-grade jv-g-B" id="jvGrade">B</span>' +
      '<small id="jvGradeText">中规中矩</small></div></div>' +
      '<div class="res-grid jv-kpis">' +
      '<div class="res-card"><div class="rc-lab">实际时薪</div><div class="rc-val" id="jvHourly">—</div></div>' +
      '<div class="res-card"><div class="rc-lab">实际到手/月</div><div class="rc-val" id="jvTakeHome">—</div></div>' +
      '<div class="res-card"><div class="rc-lab">月总工时</div><div class="rc-val" id="jvHoursTotal">—</div></div>' +
      '<div class="res-card"><div class="rc-lab">月工作日</div><div class="rc-val" id="jvDays">—</div></div>' +
      '</div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">输入你的工作条件</span>' +
      '<div class="jv-grid">' +
      field('jvSalary', '月薪（元）', 10000, 'min="0" step="100" inputmode="decimal"') +
      field('jvDays', '每周工作天数', 5, 'min="5" max="7" step="1"') +
      field('jvHours', '每天工作小时', 8, 'min="8" max="12" step="0.5"') +
      field('jvCommute', '每天通勤小时', 1, 'min="0" max="4" step="0.5"') +
      field('jvOvertime', '每月加班小时', 0, 'min="0" max="80" step="1"') +
      field('jvCommuteCost', '通勤花费（元/月）', 200, 'min="0" step="10"') +
      field('jvRent', '房租（元/月，可选）', 0, 'min="0" step="100"') +
      '</div>' +
      '<label class="jv-check"><input type="checkbox" id="jvInsurance" checked> 有完整五险一金</label>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">评分明细</span>' +
      '<div class="jv-rows" id="jvItems"></div>' +
      '</div>' +
      '<div class="card tool-sec set-card">' +
      '<span class="tool-lab">收支明细</span>' +
      '<div class="jv-kvs" id="jvExtra"></div>' +
      '</div>' +
      '<div class="set-btns"><button class="btn btn-main js-primary-submit" id="jvShare" type="button">↗ 生成分享图</button></div>' +
      '<p class="cd-note">评分为公开评估模型的参考结果，五险一金按个人缴纳约 22% 估算；工时与薪资口径不同（如含餐补、年终奖）会与结果有偏差。全部计算在本机完成。</p>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    render();

    root.addEventListener('input', e => {
      if (e.target.closest('.jv-grid') || e.target.id === 'jvInsurance') render();
    });
    root.addEventListener('change', e => { if (e.target.id === 'jvInsurance') render(); });
    root.addEventListener('click', e => {
      if (e.target.closest('#jvShare')) { share(); return; }
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });
  }

  function unmount() { rootEl = null; }

  LB.router.register('jobvalue', { mount, unmount });
})();
