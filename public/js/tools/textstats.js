/* LiteBox v5 · tools/textstats.js — 文本统计（纯本地，实时计算） */
(function () {
  const { $, debounce } = LB.dom;
  let rootEl = null;
  let debounceTimer = null;

  function count(text) {
    const chars = text.length;
    const noSpace = text.replace(/\s/g, '').length;
    const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
    const digits = (text.match(/\d/g) || []).length;
    const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/).length;
    const paras = (text.split(/\n+/).map(s => s.trim()).filter(Boolean)).length;
    const minutes = (cn + words) === 0 ? 0 : Math.max(1, Math.ceil((cn + words) / 400));
    return { chars, noSpace, cn, words, digits, lines, paras, minutes };
  }

  function render(t) {
    const c = count(t);
    $('#tsChars', rootEl).textContent = c.chars;
    $('#tsCn', rootEl).textContent = c.cn;
    $('#tsEn', rootEl).textContent = c.words;
    $('#tsRead', rootEl).textContent = c.chars === 0 ? '0 分钟' : (c.minutes + ' 分钟');
    $('#stNoSpace', rootEl).textContent = c.noSpace;
    $('#stDigits', rootEl).textContent = c.digits;
    $('#stLines', rootEl).textContent = c.lines;
    $('#stParas', rootEl).textContent = c.paras;
  }

  function html() {
    return (
      '<div class="tool-head">' +
      '<button class="back" data-back type="button" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<div><h1>文本统计</h1><p>字符 / 中英文 / 行段落实时统计，纯本地计算</p></div>' +
      '</div>' +
      '<div class="tool-body">' +
      '<div class="res-grid">' +
      '<div class="res-card"><div class="rc-lab">字符数</div><div class="rc-val" id="tsChars">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">中文字数</div><div class="rc-val" id="tsCn">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">英文单词</div><div class="rc-val" id="tsEn">0</div></div>' +
      '<div class="res-card"><div class="rc-lab">阅读时长</div><div class="rc-val" id="tsRead">0 分钟</div></div>' +
      '</div>' +
      '<div class="tool-sec"><span class="tool-lab">输入文本</span>' +
      '<textarea class="inp" id="tsIn" rows="12" placeholder="粘贴或输入要统计的文本…" spellcheck="false"></textarea></div>' +
      '<div class="tool-sec"><span class="tool-lab">明细</span>' +
      '<div class="card"><table class="stat-table"><tbody>' +
      '<tr><td>不含空格字符</td><td id="stNoSpace">0</td></tr>' +
      '<tr><td>数字个数</td><td id="stDigits">0</td></tr>' +
      '<tr><td>行数</td><td id="stLines">0</td></tr>' +
      '<tr><td>段落数</td><td id="stParas">0</td></tr>' +
      '</tbody></table></div></div>' +
      '<button class="btn btn-ghost js-primary-submit" id="tsCopy" type="button">复制全文</button>' +
      '</div>'
    );
  }

  function mount(root) {
    rootEl = root;
    root.innerHTML = html();
    const input = $('#tsIn', root);
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => render(input.value), 150);
    });
    $('#tsCopy', root).addEventListener('click', () => {
      LB.copyWithToast(input.value);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-back]')) LB.hash.go('home'); });
    render('');

    /* Step 6E：消费链路种子（textscan / ocr / stt / translate / fxrate 的「统计」按钮会写入）
       —— 文本统计是纯函数，拿到文本直接算，无需用户再点「统计」。 */
    const seed = LB.storage.get('litebox_text_seed', '');
    if (seed && String(seed).trim()) {
      input.value = String(seed);
      LB.storage.remove('litebox_text_seed');
      LB.toast('已接收上一步的结果', 'info');
    }
    render(input.value);
  }

  function unmount() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    rootEl = null;
  }

  LB.router.register('textstats', { mount, unmount });
})();
