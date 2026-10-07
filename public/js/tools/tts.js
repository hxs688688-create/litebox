/* LiteBox v5 · tools/tts.js — 文字转语音（在线 Edge TTS 分段合成 → 失败降级本机朗读） */
(function () {
  'use strict';

  const { $ } = LB.dom;
  const HAS_API = location.protocol === 'http:' || location.protocol === 'https:';

  let rootEl = null;
  let alive = false;

  let jobId = 0;          /* 合成任务代次：停止/切走时 ++ 作废进行中任务 */
  let audioUrls = [];     /* 每段音频 blob URL，unmount/停止时 revoke */

  /* 音色列表（任务给定，默认选中第 1 个） */
  const VOICES = [
    ['zh-CN-XiaoxiaoNeural', '晓晓 · 女声 / 温柔'],
    ['zh-CN-XiaoyiNeural',   '晓伊 · 女声 / 活泼'],
    ['zh-CN-XiaochenNeural', '晓辰 · 女声 / 知性'],
    ['zh-CN-XiaohanNeural',  '晓涵 · 女声 / 优雅'],
    ['zh-CN-XiaomengNeural', '晓梦 · 女声 / 清新'],
    ['zh-CN-XiaomoNeural',   '晓墨 · 女声 / 文艺'],
    ['zh-CN-XiaoqiuNeural',  '晓秋 · 女声 / 成熟'],
    ['zh-CN-YunxiNeural',    '云希 · 男声 / 清朗'],
    ['zh-CN-YunyangNeural',  '云扬 · 男声 / 阳光'],
    ['zh-CN-YunjianNeural',  '云健 · 男声 / 稳重'],
    ['zh-CN-YunfengNeural',  '云枫 · 男声 / 磁性'],
    ['zh-CN-YunhaoNeural',   '云皓 · 男声 / 豪迈'],
    ['zh-CN-YunxiaNeural',   '云夏 · 男声 / 热情'],
    ['zh-CN-YunyeNeural',    '云野 · 男声 / 自然'],
    ['zh-CN-YunzeNeural',    '云泽 · 男声 / 深沉'],
    ['en-US-AriaNeural',     'Aria · English / 女声'],
    ['en-US-GuyNeural',      'Guy · English / 男声'],
    ['ja-JP-NanamiNeural',   'Nanami · 日本語'],
    ['ko-KR-SunHiNeural',    'SunHi · 한국어']
  ];

  /* 长文本按标点分段，每段不超过 180 字符（Step 4C 后端 /api/speech 限制 200，留标点余量） */
  function splitText(text) {
    const MAX = 180;
    const out = [];
    let cur = '';
    for (const ch of text) {
      cur += ch;
      if (cur.length >= MAX && /[。！？!?；;，,、\n]/.test(ch)) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) out.push(cur.trim());
    return out.length ? out : [''];
  }

  /* 本机试听（不消耗 API） */
  function nativeSpeak(text) {
    if (!('speechSynthesis' in window)) throw new Error('当前设备没有本机语音引擎');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = Math.min(2, Math.max(0.5, +$('#ttsRate', rootEl).value || 1));
    u.pitch = 1;
    speechSynthesis.speak(u);
  }

  /* 在线合成（任务给定流程）：分段 → POST /api/speech → audio/mpeg 二进制 */
  async function synthesize(text) {
    const stat = $('#ttsStat', rootEl);
    const audio = $('#ttsAudio', rootEl);
    const btn = $('#ttsGo', rootEl);
    const list = $('#ttsList', rootEl);
    audioUrls.forEach(u => URL.revokeObjectURL(u));
    audioUrls = [];
    list.innerHTML = '';
    const my = ++jobId; /* 用于停止时作废本次任务 */
    btn.disabled = true;
    btn.textContent = '⏳ 合成中…';
    stat.hidden = false;
    stat.style.color = '';
    stat.textContent = '正在准备…';

    try {
      if (!HAS_API) throw new Error('在线语音服务需要在部署环境使用');
      const segs = splitText(text);
      let ok = 0;

      for (let i = 0; i < segs.length; i++) {
        if (my !== jobId) throw new Error('已停止');
        stat.textContent = '⏳ 正在生成第 ' + (i + 1) + ' / ' + segs.length + ' 段…';

        const r = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: segs[i],
            voice: $('#ttsVoice', rootEl).value,
            speed: +$('#ttsRate', rootEl).value,
            pitch: Math.round(+$('#ttsPitch', rootEl).value)
          }),
          cache: 'no-store'
        });

        if (!r.ok) {
          let msg = '语音服务返回 ' + r.status;
          try { const x = await r.json(); msg = (x.error && x.error.message) || msg; } catch (_) {}
          throw new Error(msg);
        }

        const blob = await r.blob();
        if (!blob.size) throw new Error('返回了空音频');

        const url = URL.createObjectURL(blob);
        audioUrls.push(url);

        /* 第 1 段设置到 audio 播放器 */
        if (i === 0) {
          audio.src = url;
          audio.hidden = false;
        }

        /* 每段一个下载按钮 */
        const row = document.createElement('div');
        row.className = 'tts-row';
        row.classList.add('lb-fade-in-up'); /* Step 10：分段结果入场 */
        row.innerHTML = '<span>第 ' + (i + 1) + ' 段 · MP3</span>' +
          '<button class="btn btn-ghost btn-sm" data-dl="' + url + '" data-name="LiteBox-段' + (i + 1) + '.mp3">⬇️ 下载 MP3</button>';
        list.appendChild(row);

        ok++;
      }

      stat.textContent = '✅ 合成完成 · 共 ' + ok + ' 段，可直接播放或下载';
      LB.toast('语音合成完成', 'ok');
    } catch (e) {
      if (e.message === '已停止') return;
      stat.style.color = 'var(--err)';
      stat.textContent = '⚠️ 在线合成暂时不可用，已切换为本机朗读';
      try {
        nativeSpeak(text.slice(0, 500));
      } catch (_) {
        stat.textContent = '❌ 合成暂时不可用，请稍后重试';
      }
    } finally {
      if (alive && rootEl) {
        btn.disabled = false;
        btn.textContent = '✨ 开始合成';
      }
    }
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    const savedVoice = LB.storage.get('litebox_tts_voice_online', VOICES[0][0]);
    const voiceOpts = VOICES.map(v =>
      '<option value="' + v[0] + '"' + (v[0] === savedVoice ? ' selected' : '') + '>' + v[1] + '</option>'
    ).join('');
    root.innerHTML =
      '<div class="card">' +
      '  <div class="tts-brand"><span class="tts-brand-ic">🎙️</span><div><b>LiteBox 语音空间</b>' +
      '  <small>在线生成高质量语音，生成后可直接播放或下载</small></div></div>' +
      '  <div class="tts-tawrap">' +
      '    <textarea class="inp tts-ta" id="ttsTa" rows="8" maxlength="6000" placeholder="输入要转换的文字…"></textarea>' +
      '    <span class="tts-count" id="ttsCount">0 / 6000</span>' +
      '  </div>' +
      '  <div class="tts-ctl">' +
      '    <p class="cd-note">⚠️ 当前使用云端通用语音合成，暂不支持指定具体音色；点击「 本机试听」可使用本机高质量音色（依赖系统 TTS）</p>' +
      '    <label class="ac-field">声音<select class="inp" id="ttsVoice">' + voiceOpts + '</select></label>' +
      '    <label class="ac-field">语速<input type="range" id="ttsRate" min="0.5" max="2" step="0.1" value="1"><output id="ttsRateV">1.0x</output></label>' +
      '    <label class="ac-field">音调<input type="range" id="ttsPitch" min="-50" max="50" step="5" value="0"><output id="ttsPitchV">0Hz</output></label>' +
      '  </div>' +
      '  <div class="tts-btns">' +
      '    <button class="btn btn-ghost" id="ttsPrev">🔊 本机试听</button>' +
      '    <button class="btn btn-main" id="ttsGo">✨ 开始合成</button>' +
      '    <button class="btn btn-ghost" id="ttsStop">⏹ 停止</button>' +
      '  </div>' +
      '  <div class="tts-stat" id="ttsStat" hidden></div>' +
      '  <p class="cd-note" id="ttsSegTip">文字较长时会自动分成多段生成，每段可单独下载</p>' +
      '  <div id="ttsList" class="tts-list"></div>' +
      '  <audio controls id="ttsAudio" class="tts-audio" hidden></audio>' +
      '</div>';

    const ta = $('#ttsTa', root);
    ta.addEventListener('input', () => {
      $('#ttsCount', root).textContent = ta.value.length + ' / 6000';
    });
    $('#ttsRate', root).addEventListener('input', e => {
      $('#ttsRateV', root).textContent = (+e.target.value).toFixed(1) + 'x';
    });
    $('#ttsPitch', root).addEventListener('input', e => {
      $('#ttsPitchV', root).textContent = Math.round(+e.target.value) + 'Hz';
    });
    $('#ttsVoice', root).addEventListener('change', e => {
      LB.storage.set('litebox_tts_voice_online', e.target.value);
    });
    $('#ttsPrev', root).addEventListener('click', () => {
      try {
        nativeSpeak((ta.value || '你好，这是 LiteBox 本机试听。').slice(0, 500));
        LB.toast('本机朗读已开始', 'ok');
      } catch (err) {
        LB.toast(err.message || '当前设备没有本机语音引擎', 'err');
      }
    });
    $('#ttsGo', root).addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) { LB.toast('请先输入文字', 'err'); return; }
      synthesize(text);
    });
    $('#ttsStop', root).addEventListener('click', () => {
      jobId++; /* 作废当前任务 */
      audioUrls.forEach(u => URL.revokeObjectURL(u));
      audioUrls = [];
      const audio = $('#ttsAudio', root);
      audio.pause();
      audio.removeAttribute('src');
      audio.hidden = true;
      try { speechSynthesis.cancel(); } catch (_) {}
      const btn = $('#ttsGo', root);
      btn.disabled = false;
      btn.textContent = '✨ 开始合成';
      $('#ttsStat', root).hidden = true;
      LB.toast('已停止', 'ok');
    });
    /* 下载事件委托 */
    $('#ttsList', root).addEventListener('click', e => {
      const b = e.target.closest('[data-dl]');
      if (!b) return;
      const a = document.createElement('a');
      a.href = b.dataset.dl;
      a.download = b.dataset.name;
      a.click();
    });
  }

  function unmount() {
    alive = false;
    jobId++; /* 作废进行中任务 */
    audioUrls.forEach(u => URL.revokeObjectURL(u));
    audioUrls = [];
    try { speechSynthesis.cancel(); } catch (_) {}
    rootEl = null;
  }

  LB.router.register('tts', { mount, unmount });
})();
