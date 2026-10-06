/* LiteBox v5 · tools/ffmpeg-common.js — FFmpeg.wasm 共享封装（Step 16 · A1）
   vconv（视频转码）与 acut（音频转码）都用这一份，避免把 80 行加载/搬运逻辑抄两遍。

   ★ 实测结论（真实 Chrome，@ffmpeg/core 0.12.6 UMD，32MB wasm）：
     · 可用：libx264 / mpeg4 / libvpx(VP8) / aac / libmp3lame / libopus / libvorbis / flac / pcm_s16le
       —— mp4 / mkv / mov / avi / webm / mp3 / wav / flac / ogg / m4a 全部转码成功；
     · **libx265 不可用**：2 秒 320×240 的测试片 45 秒都跑不完（wasm 下极慢），会长时间无响应；
     · **libvpx-vp9 不可用**：一旦执行会把 worker 打崩，之后所有任务都失败。
     所以两个工具的编码选项里 H.265 / VP9 保留在列表里但置灰（disabled），并写明原因。

   ★ 实例策略：**全局单例**。每跑一个新实例都要重新加载 32MB wasm 且容易把内存打满
     （实测连续 new FFmpeg() 第二次就崩），所以共用一个实例；
     任务失败时调 reset() 丢弃实例，下次自动重建。

   ★ 每次任务结束会删掉虚拟文件系统里的输入/输出文件，避免 MEMFS 随使用次数膨胀。 */
(function () {
  'use strict';

  const SCRIPT_URL = 'vendor/ffmpeg/ffmpeg.min.js';
  const CORE_FILE = 'ffmpeg-core.js';
  const WASM_FILE = 'ffmpeg-core.wasm';

  let inst = null;        /* 常驻 FFmpeg 实例 */
  let loading = null;     /* 加载中的 Promise（并发调用共享） */
  let scriptP = null;     /* 脚本注入 Promise */

  function injectScript() {
    if (window.FFmpegWASM) return Promise.resolve();
    if (scriptP) return scriptP;
    scriptP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_URL;
      s.onload = resolve;
      s.onerror = () => { scriptP = null; reject(new Error('转码组件加载失败，请检查网络')); };
      document.head.appendChild(s);
    });
    return scriptP;
  }

  /* onStage(stage) —— 'script' | 'core'，供 UI 显示加载进度文案 */
  function ensure(onStage) {
    if (inst) return Promise.resolve(inst);
    if (loading) return loading;
    loading = (async () => {
      if (onStage) onStage('script');
      await injectScript();
      const { FFmpeg } = window.FFmpegWASM;
      if (!FFmpeg) throw new Error('转码组件加载失败');
      const f = new FFmpeg();
      if (onStage) onStage('core');
      const base = new URL('vendor/ffmpeg/', document.baseURI).href;
      await f.load({ coreURL: base + CORE_FILE, wasmURL: base + WASM_FILE });
      inst = f;
      return f;
    })();
    return loading.catch(e => { loading = null; throw e; }).then(f => { loading = null; return f; });
  }

  /* 实例崩了/超时后调用，下次 ensure() 会重建 */
  function reset() {
    if (inst) { try { inst.terminate(); } catch (_) {} }
    inst = null;
    loading = null;
  }

  /* 跑一次转码
     opts: { file, inputName, args, outName, mime, onProgress(0..1), onStage } */
  async function run(opts) {
    const f = await ensure(opts.onStage);
    const inName = opts.inputName || 'input.bin';
    let progHandler = null;
    if (opts.onProgress) {
      progHandler = ({ progress }) => {
        const p = Number(progress);
        if (isFinite(p)) opts.onProgress(Math.max(0, Math.min(1, p)));
      };
      f.on('progress', progHandler);
    }
    try {
      await f.writeFile(inName, new Uint8Array(await opts.file.arrayBuffer()));
      const code = await f.exec(['-y', '-i', inName].concat(opts.args));
      let data;
      try {
        data = await f.readFile(opts.outName);
      } catch (_) {
        throw new Error('转码未产出文件（exit ' + code + '），可能是该编码组合不被支持');
      }
      if (!data || !data.length) throw new Error('转码输出为空（exit ' + code + '）');
      return new Blob([data], { type: opts.mime || 'application/octet-stream' });
    } catch (e) {
      /* exec 抛异常通常意味着 worker 已崩，丢弃实例让下次重建 */
      if (!/转码未产出|输出为空/.test(String(e && e.message))) reset();
      throw e;
    } finally {
      if (progHandler) { try { f.off('progress', progHandler); } catch (_) {} }
      try { await f.deleteFile(inName); } catch (_) {}
      try { await f.deleteFile(opts.outName); } catch (_) {}
    }
  }

  LB.ffmpeg = {
    load: ensure,
    run: run,
    reset: reset,
    isReady: () => !!inst,
    /* 加载阶段文案 */
    stageText: s => s === 'script' ? '正在加载转码组件…' : '正在加载 FFmpeg 核心（约 32MB，首次较慢）…'
  };
})();
