/* LiteBox v5 · tools/stt.js — 语音转文字（/api/transcribe 文件识别 → 失败降级提示，另支持 Web Speech 实时口述） */
(function () {
  'use strict';

  const { $ } = LB.dom;

  let rootEl = null;
  let alive = false;

  let sttFile = null;      /* 已选择的音频文件 */
  let rec = null;          /* SpeechRecognition 实例 */
  let recRunning = false;
  let recBase = '';

  const MAX_MB = 10;
  const EXT_OK = ['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg', 'webm'];

  function extOk(name) {
    const i = name.lastIndexOf('.');
    if (i < 0) return false;
    return EXT_OK.indexOf(name.slice(i + 1).toLowerCase()) >= 0;
  }

  function pickFile(file) {
    if (!alive || !rootEl || !file) return;
    const okType = (file.type && file.type.indexOf('audio/') === 0) || extOk(file.name);
    if (!okType) { LB.toast('请选择音频文件（MP3 / WAV / M4A 等）', 'err'); return; }
    if (file.size > MAX_MB * 1048576) { LB.toast('文件过大：请选择 ' + MAX_MB + 'MB 以内的音频', 'err'); return; }
    sttFile = file;
    $('#sttFname', rootEl).textContent = file.name;
    $('#sttFsize', rootEl).textContent = LB.img.fmtSize(file.size);
    $('#sttGo', rootEl).disabled = false;
    LB.toast('音频已选择', 'ok');
  }

  /* 文件转写（任务给定流程）：multipart 上传，60 秒超时 */
  async function transcribe() {
    if (!alive || !rootEl) return;
    const btn = $('#sttGo', rootEl);
    const stat = $('#sttStat', rootEl);
    if (!sttFile) { LB.toast('先选择音频', 'err'); return; }
    btn.disabled = true;
    stat.hidden = false;
    stat.textContent = '⏳ 正在识别音频，请稍候…';

    try {
      const fd = new FormData();
      fd.append('file', sttFile);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000); /* 60 秒超时 */

      const r = await fetch('/api/transcribe', {
        method: 'POST',
        body: fd,
        signal: ctrl.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);

      if (!r.ok) {
        let msg = '语音识别服务返回 ' + r.status;
        try { const x = await r.json(); msg = (x.error && x.error.message) || msg; } catch (_) {}
        throw new Error(msg);
      }

      const d = await r.json();
      const text = d.text || (d.data && d.data.text) || '';
      if (!text) throw new Error('没有识别到文字');

      $('#sttOut', rootEl).value = text;
      stat.textContent = '✅ 转写完成，可直接编辑、复制或送入文本转换';
      LB.toast('语音转文字完成', 'ok');
    } catch (e) {
      const msg = e.name === 'AbortError' ? '识别超时，请尝试更短音频' : (e.message || '在线语音识别暂时不可达');
      stat.textContent = '❌ ' + msg;
      LB.toast('语音转文字失败', 'err');
    } finally {
      if (alive && rootEl) btn.disabled = false;
    }
  }

  /* 实时口述（Web Speech API，任务给定流程） */
  function liveDictate() {
    if (!alive || !rootEl) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { LB.toast('当前浏览器不支持实时语音输入', 'err'); return; }
    const liveBtn = $('#sttLive', rootEl);
    const stat = $('#sttStat', rootEl);
    const outTextarea = $('#sttOut', rootEl);

    if (recRunning) {
      rec.stop();
      return;
    }

    rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      recRunning = true;
      recBase = outTextarea.value.trim();
      liveBtn.textContent = '⏹ 停止口述';
      stat.hidden = false;
      stat.textContent = '🎙️ 正在听，请直接说话…';
    };

    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) {
          recBase += (recBase ? ' ' : '') + x[0].transcript.trim();
        } else {
          interim += x[0].transcript;
        }
      }
      outTextarea.value = (recBase + (interim ? ' ' + interim : '')).trim();
    };

    rec.onerror = e => {
      recRunning = false;
      liveBtn.textContent = '🎙️ 实时口述';
      stat.textContent = '❌ ' + (e.error === 'not-allowed' ? '请允许麦克风与语音识别权限' : '实时语音输入失败');
    };

    rec.onend = () => {
      recRunning = false;
      liveBtn.textContent = '🎙️ 实时口述';
      if (outTextarea.value.trim()) {
        stat.hidden = false;
        stat.textContent = '✅ 口述完成，可继续编辑';
      }
    };

    rec.start();
  }

  function clearAll() {
    sttFile = null;
    $('#sttFname', rootEl).textContent = '点击选择音频文件';
    $('#sttFsize', rootEl).textContent = '';
    $('#sttGo', rootEl).disabled = true;
    $('#sttOut', rootEl).value = '';
    $('#sttStat', rootEl).hidden = true;
  }

  function mount(root) {
    rootEl = root;
    alive = true;
    root.innerHTML =
      '<div class="card">' +
      '  <div class="dropzone stt-drop" id="sttDrop">' +
      '    <div class="stt-dz-ic">🎧</div>' +
      '    <div class="stt-fname" id="sttFname">点击选择音频文件</div>' +
      '    <div class="stt-fsize" id="sttFsize"></div>' +
      '    <small>MP3 / WAV / M4A / FLAC / AAC / OGG / WEBM · 最大 10MB</small>' +
      '    <button class="btn btn-ghost btn-sm stt-pick" id="sttPick">选择文件</button>' +
      '  </div>' +
      '  <input type="file" id="sttFile" accept="audio/*,.mp3,.wav,.m4a,.flac,.aac,.ogg,.webm" hidden>' +
      '  <div class="stt-btns">' +
      '    <button class="btn btn-main" id="sttGo" disabled>✨ 开始转写</button>' +
      '    <button class="btn btn-ghost" id="sttLive">🎙️ 实时口述</button>' +
      '    <button class="btn btn-ghost" id="sttClear">清空</button>' +
      '  </div>' +
      '  <div class="stt-stat" id="sttStat" hidden></div>' +
      '  <textarea class="inp stt-out" id="sttOut" rows="10" placeholder="识别结果会显示在这里，可编辑"></textarea>' +
      '  <div class="stt-foot">' +
      '    <button class="btn btn-ghost btn-sm" id="sttCopy">📋 复制文字</button>' +
      '    <button class="btn btn-ghost btn-sm" id="sttToTc">🔀 送入文本转换</button>' +
      '    <button class="btn btn-ghost btn-sm" id="sttTxt">⬇️ 导出 TXT</button>' +
      '  </div>' +
      '</div>';

    const drop = $('#sttDrop', root);
    const input = $('#sttFile', root);
    drop.addEventListener('click', () => input.click());
    $('#sttPick', root).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) pickFile(f);
    });
    const onOver = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.addEventListener('dragover', onOver);
    drop.addEventListener('dragenter', onOver);
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) pickFile(f);
    });

    $('#sttGo', root).addEventListener('click', transcribe);
    $('#sttLive', root).addEventListener('click', liveDictate);
    $('#sttClear', root).addEventListener('click', e => LB.confirm(e.currentTarget, clearAll));
    /* Step 5I：同步复制，去掉 async/await（手势不跨任务） */
    $('#sttCopy', root).addEventListener('click', () => {
      const el = $('#sttOut', root);
      const t = el && el.value ? el.value : '';   /* 从 DOM 现读 */
      if (!t) { LB.toast('没有可复制的文字', 'err'); return; }
      LB.copyNow(t, '已复制');
    });
    $('#sttToTc', root).addEventListener('click', () => {
      const t = $('#sttOut', root).value;
      if (!t) { LB.toast('没有可送入的文字', 'err'); return; }
      LB.storage.set('litebox_tc_seed', t);
      LB.hash.go('textconvert');
    });
    $('#sttTxt', root).addEventListener('click', () => {
      const t = $('#sttOut', root).value;
      if (!t) { LB.toast('没有可导出的文字', 'err'); return; }
      LB.img.download(new Blob([t], { type: 'text/plain;charset=utf-8' }), 'LiteBox-转写结果.txt');
    });
  }

  function unmount() {
    alive = false;
    if (rec) {
      rec.onend = rec.onerror = rec.onresult = rec.onstart = null;
      try { rec.stop(); } catch (_) {}
      rec = null;
    }
    recRunning = false;
    try { speechSynthesis.cancel(); } catch (_) {}
    sttFile = null;
    rootEl = null;
  }

  LB.router.register('stt', { mount, unmount });
})();
