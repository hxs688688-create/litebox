/* LiteBox v5· tools/biolab.js — 生物实验计算器（Step 5I 新增）
 *
 * 5 个计算器，顶部 seg 切换：
 *   1. 细胞铺板   —— 已知浓度与目标密度，算每孔吸多少悬液 + 补多少培养基
 *   2. 溶液配制   —— 已知目标浓度/体积/分子量，算称多少溶质
 *   3. 稀释计算   —— 母液稀释到目标浓度，算吸多少母液 + 补多少稀释液
 *   4. 动物剂量   —— 体表面积法（Km因子）跨物种剂量换算
 *   5. 转染用量   —— DNA 与转染试剂总量
 *
 * 【单位约定（最容易出错的地方，务必留意）】
 *  · 细胞浓度单位是「万/mL」和「万/孔」，两者相除直接得到 mL
 *  · 溶液配制：c×V×M —— V 必须是升（L），所以表单填 mL 时要 /1000
 *  · 动物剂量：体重字段填 g，需 /1000 换成 kg 再乘 mg/kg
 *
 * 【结果呈现】沿用项目既有的 .res-card / .res-grid 样式
 *   （tools.css 已定义 label(.rc-lab) + 值(.rc-val) 的上下结构，
 *    无需新增 CSS；spec 里给的 span/b 结构是水平排列，与项目现有视觉不符，
 *    故按项目规范实现为上下结构）。
 */
(function () {
  'use strict';

  const { $, $$ } = LB.dom;

  /* Km 因子（体表面积法换算）：小鼠 3 · 大鼠 6 · 人 37 */
  const KM = { mouse: 3, rat: 6, human: 37 };

  function mount(root) {
    root.innerHTML =
      '<div class="tool-head">' +
        '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
        '<div><h1>生物实验计算器</h1><p>细胞铺板 · 溶液配制 · 稀释 · 动物剂量 · 转染用量，纯本地计算不上传</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
        '<div class="seg" id="blTabs">' +
          '<button type="button" class="on" data-tab="plate">细胞铺板</button>' +
          '<button type="button" data-tab="solution">溶液配制</button>' +
          '<button type="button" data-tab="dilute">稀释计算</button>' +
          '<button type="button" data-tab="animal">动物剂量</button>' +
          '<button type="button" data-tab="transfect">转染用量</button>' +
        '</div>' +
        '<div id="blBody" style="margin-top:16px"></div>' +
        '<div class="tip" style="margin-top:16px">' +
          '⚠️ 计算结果仅供参考，请对照试剂说明书或权威实验协议复核。不同细胞株 / 试剂盒的推荐值可能不同。' +
        '</div>' +
      '</div>';

    const body = $('#blBody', root);

    /* ---------- 结果渲染助手（沿用项目 .res-card 结构） ---------- */
    function out(id, cards) {
      const el = $('#' + id, root);
      if (!el) return;
      el.innerHTML = cards.map(function (c) {
        return '<div class="res-card"' + (c.hi ? ' style="border-color:var(--brand1)"' : '') + '>' +
          '<div class="rc-lab">' + c.k + '</div>' +
          '<div class="rc-val"' + (c.hi ? ' style="color:var(--brand1)"' : '') + '>' + c.v + '</div>' +
        '</div>';
      }).join('');
    }
    function num(id) { return parseFloat($('#' + id, root).value); }

    /* ================================================================
     * 1. 细胞铺板
     * needVol = (目标密度 × 孔数) / 当前浓度 = 需吸取的细胞悬液体积
     * ================================================================ */
    function renderPlate() {
      body.innerHTML =
        '<div class="field"><label>当前细胞悬液浓度（万/mL）</label>' +
          '<input class="inp" id="pl-c0" type="number" inputmode="decimal" value="100" step="any"></div>' +
        '<div class="field"><label>目标密度（万/孔）</label>' +
          '<input class="inp" id="pl-c1" type="number" inputmode="decimal" value="5" step="any"></div>' +
        '<div class="field"><label>孔板类型</label>' +
          '<select class="inp" id="pl-type">' +
            '<option value="0.1">96 孔（0.1 mL/孔）</option>' +
            '<option value="0.5">24 孔（0.5 mL/孔）</option>' +
            '<option value="2" selected>6 孔（2.0 mL/孔）</option>' +
          '</select></div>' +
        '<div class="field"><label>孔数</label>' +
          '<input class="inp" id="pl-n" type="number" inputmode="numeric" value="6" min="1" step="1"></div>' +
        '<button class="btn btn-main js-primary-submit" id="pl-go" type="button" style="width:100%;margin-top:4px">计算</button>' +
        '<div id="pl-out" class="res-grid" style="margin-top:16px"></div>';

      $('#pl-go', root).onclick = function () {
        const c0 = num('pl-c0'), c1 = num('pl-c1');
        const vol = parseFloat($('#pl-type', root).value);
        const n = num('pl-n');
        if (!(c0 > 0) || !(c1 > 0) || !(n > 0)) { LB.toast('请输入有效数值', 'err'); return; }

        const needVol = (c1 * n) / c0;/* mL */
        const totalVol = vol * n;             /* mL */
        const mediaVol = totalVol - needVol;

        if (mediaVol < 0) {
          out('pl-out', []);
          $('#pl-out', root).innerHTML =
            '<div class="tip" style="color:var(--err)">⚠️ 所需悬液 ' + needVol.toFixed(3) +
            ' mL 超过总培养基体积 ' + totalVol.toFixed(3) + ' mL，请提高悬液浓度或减少孔数。</div>';
          return;
        }
        out('pl-out', [
          { k: '吸取细胞悬液', v: needVol.toFixed(3) + ' mL', hi: true },
          { k: '补加培养基', v: mediaVol.toFixed(3) + ' mL', hi: true },
          { k: '每孔总体积', v: vol + ' mL' },
          { k: '总孔数', v: n + ' 孔' }
        ]);
      };
    }

    /* ================================================================
     * 2. 溶液配制  mass = c × V × M（V 转升）
     * ================================================================ */
    function renderSolution() {
      body.innerHTML =
        '<div class="field"><label>目标浓度（mol/L）</label>' +
          '<input class="inp" id="so-c" type="number" inputmode="decimal" value="0.1" step="any"></div>' +
        '<div class="field"><label>目标体积（mL）</label>' +
          '<input class="inp" id="so-v" type="number" inputmode="decimal" value="500" step="any"></div>' +
        '<div class="field"><label>分子量（g/mol）</label>' +
          '<input class="inp" id="so-m" type="number" inputmode="decimal" value="58.44" step="any" placeholder="如 NaCl 58.44"></div>' +
        '<button class="btn btn-main js-primary-submit" id="so-go" type="button" style="width:100%;margin-top:4px">计算</button>' +
        '<div id="so-out" class="res-grid" style="margin-top:16px"></div>';

      $('#so-go', root).onclick = function () {
        const c = num('so-c');
        const v = num('so-v') / 1000;   /* mL → L */
        const m = num('so-m');
        if (!(c > 0) || !(v > 0) || !(m > 0)) { LB.toast('请输入有效数值', 'err'); return; }

        const mass = c * v * m;         /* g */
        out('so-out', [
          { k: '称取溶质', v: mass.toFixed(4) + ' g', hi: true },
          { k: '定容体积', v: (v * 1000).toFixed(0) + ' mL' },
          { k: '溶质摩尔数', v: (c * v).toFixed(4) + ' mol' }
        ]);
      };
    }

    /* ================================================================
     * 3. 稀释计算  C1V1 = C2V2
     * ================================================================ */
    function renderDilute() {
      body.innerHTML =
        '<div class="field"><label>母液浓度 C1（任意单位）</label>' +
          '<input class="inp" id="di-c1" type="number" inputmode="decimal" value="10" step="any"></div>' +
        '<div class="field"><label>目标浓度 C2（同一单位）</label>' +
          '<input class="inp" id="di-c2" type="number" inputmode="decimal" value="1" step="any"></div>' +
        '<div class="field"><label>目标体积 V2（mL）</label>' +
          '<input class="inp" id="di-v2" type="number" inputmode="decimal" value="10" step="any"></div>' +
        '<button class="btn btn-main js-primary-submit" id="di-go" type="button" style="width:100%;margin-top:4px">计算</button>' +
        '<div id="di-out" class="res-grid" style="margin-top:16px"></div>';

      $('#di-go', root).onclick = function () {
        const c1 = num('di-c1'), c2 = num('di-c2'), v2 = num('di-v2');
        if (!(c1 > 0) || !(c2 > 0) || !(v2 > 0)) { LB.toast('请输入有效数值', 'err'); return; }
        if (c2 > c1) { LB.toast('目标浓度不能大于母液浓度', 'err'); return; }

        const v1 = (c2 * v2) / c1;      /* 吸取母液体积 */
        const diluent = v2 - v1;
        out('di-out', [
          { k: '吸取母液 V1', v: v1.toFixed(4) + ' mL', hi: true },
          { k: '补加稀释液', v: diluent.toFixed(4) + ' mL', hi: true },
          { k: '稀释倍数', v: (c1 / c2).toFixed(2) + ' 倍' },
          { k: '目标总体积', v: v2 + ' mL' }
        ]);
      };
    }

    /* ================================================================
     * 4. 动物剂量（体表面积法 Km 换算）
     * ================================================================ */
    function renderAnimal() {
      body.innerHTML =
        '<div class="field"><label>原始剂量（mg/kg）</label>' +
          '<input class="inp" id="an-dose" type="number" inputmode="decimal" value="10" step="any"></div>' +
        '<div class="field"><label>该动物体重（g）</label>' +
          '<input class="inp" id="an-weight" type="number" inputmode="decimal" value="20" step="any"></div>' +
        '<div class="field"><label>换算方向</label>' +
          '<select class="inp" id="an-dir">' +
            '<option value="m2h">小鼠 → 人</option>' +
            '<option value="r2h">大鼠 → 人</option>' +
            '<option value="h2m">人 → 小鼠</option>' +
          '</select></div>' +
        '<button class="btn btn-main js-primary-submit" id="an-go" type="button" style="width:100%;margin-top:4px">计算</button>' +
        '<div id="an-out" class="res-grid" style="margin-top:16px"></div>';

      $('#an-go', root).onclick = function () {
        const dose = num('an-dose');
        const w = num('an-weight') / 1000;    /* g → kg */
        const dir = $('#an-dir', root).value;
        if (!(dose > 0) || !(w > 0)) { LB.toast('请输入有效数值', 'err'); return; }

        let converted, direction;
        if (dir === 'm2h') {
          converted = dose * KM.mouse / KM.human;   direction = '小鼠 → 人';
        } else if (dir === 'r2h') {
          converted = dose * KM.rat / KM.human;     direction = '大鼠 → 人';
        } else {
          converted = dose * KM.human / KM.mouse;   direction = '人 → 小鼠';
        }
        const totalDose = dose * w;                 /* mg */
        out('an-out', [
          { k: '换算方向', v: direction },
          { k: '换算后剂量', v: converted.toFixed(2) + ' mg/kg', hi: true },
          { k: '该动物总剂量', v: totalDose.toFixed(3) + ' mg' },
          { k: '该动物体重', v: w.toFixed(3) + ' kg' }
        ]);
        $('#an-out', root).insertAdjacentHTML('afterend',
          '<div class="tip" style="margin-top:10px;font-size:12px">Km 因子：小鼠 ' + KM.mouse +
          ' · 大鼠 ' + KM.rat + ' · 人 ' + KM.human + '。本换算基于体表面积法，仅供剂量换算参考。</div>');
      };
    }

    /* ================================================================
     * 5. 转染用量
     * ================================================================ */
    function renderTransfect() {
      body.innerHTML =
        '<div class="field"><label>每孔 DNA（μg）</label>' +
          '<input class="inp" id="tf-dna" type="number" inputmode="decimal" value="0.5" step="any"></div>' +
        '<div class="field"><label>孔数</label>' +
          '<input class="inp" id="tf-n" type="number" inputmode="numeric" value="6" min="1" step="1"></div>' +
        '<div class="field"><label>试剂:DNA 比例（μL:μg）</label>' +
          '<input class="inp" id="tf-ratio" type="number" inputmode="decimal" value="2" step="any"></div>' +
        '<button class="btn btn-main js-primary-submit" id="tf-go" type="button" style="width:100%;margin-top:4px">计算</button>' +
        '<div id="tf-out" class="res-grid" style="margin-top:16px"></div>';

      $('#tf-go', root).onclick = function () {
        const dna = num('tf-dna'), n = num('tf-n'), ratio = num('tf-ratio');
        if (!(dna > 0) || !(n > 0) || !(ratio > 0)) { LB.toast('请输入有效数值', 'err'); return; }

        const totalDNA = dna * n;         /* μg */
        const reagent = totalDNA * ratio; /* μL */
        out('tf-out', [
          { k: '总 DNA', v: totalDNA.toFixed(3) + ' μg', hi: true },
          { k: '转染试剂', v: reagent.toFixed(3) + ' μL', hi: true },
          { k: '孔数', v: n + ' 孔' },
          { k: '每孔试剂', v: (reagent / n).toFixed(3) + ' μL' }
        ]);
        $('#tf-out', root).insertAdjacentHTML('afterend',
          '<div class="tip" style="margin-top:10px;font-size:12px">以 Lipo3000 为例常用比例 1:1.5 ~ 1:2，请对照试剂说明书确认。</div>');
      };
    }

    const RENDERERS = {
      plate: renderPlate,
      solution: renderSolution,
      dilute: renderDilute,
      animal: renderAnimal,
      transfect: renderTransfect
    };

    function show(tab) {
      /* 切换 tab 时清掉上一屏残留的提示块 */
      const old = $('.tip[style*="font-size:12px"]', body);
      if (old) old.remove();
      const fn = RENDERERS[tab] || RENDERERS.plate;
      fn();
    }

    $('#blTabs', root).addEventListener('click', function (e) {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      $$('#blTabs button', root).forEach(function (x) { x.classList.toggle('on', x === b); });
      show(b.dataset.tab);
    });

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) LB.hash.go('home');
    });

    show('plate');
  }

  function unmount() {}

  LB.router.register('biolab', { mount, unmount });
})();