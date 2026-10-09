/*! image-to-toon v0.1.1 | MIT License | https://github.com/mamta-epili/image-to-toon/tree/main/packages/core#readme
 *  UMD 浏览器版：由 npm 包 dist/index.js（ESM，零依赖）转换为 UMD，无任何运行时依赖。
 *  暴露：window.CaricatureEngine / window.toonify / window.toonifyToDataUrl / window.PRESETS / window.LBToon
 *  同时提供 window.CarricatureEngine 作为拼写别名。 */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    var api = factory();
    root.LBToon = api;
    root.CaricatureEngine = api.CaricatureEngine;
    root.CaricatureError = api.CaricatureError;
    root.toonify = api.toonify;
    root.toonifyToDataUrl = api.toonifyToDataUrl;
    root.PRESETS = api.PRESETS;
    root.PRESET_NAMES = api.PRESET_NAMES;
    root.CarricatureEngine = api.CaricatureEngine;
  }
})(typeof self !== 'undefined' ? self : this, function () {
// src/types.ts
var CaricatureError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "CaricatureError";
    this.code = code;
    this.cause = cause;
  }
};

// src/canvas.ts
var MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp"
};
function mimeFor(format) {
  return MIME[format] ?? MIME.png;
}
function extensionFor(format) {
  return format === "jpeg" ? "jpg" : format;
}
function isBrowser() {
  return typeof document !== "undefined";
}
function createCanvas(width, height) {
  if (isBrowser()) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  }
  throw new CaricatureError("CANVAS_UNAVAILABLE", "No canvas implementation available in this environment.");
}
function get2d(canvas, willReadFrequently = true) {
  const ctx = canvas.getContext("2d", { willReadFrequently });
  if (!ctx) throw new CaricatureError("CANVAS_UNAVAILABLE", "Could not acquire a 2D canvas context.");
  return ctx;
}
function cloneCanvas(source) {
  const out = createCanvas(source.width, source.height);
  get2d(out).drawImage(source, 0, 0);
  return out;
}
function readImageData(canvas) {
  return get2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}
function writeImageData(canvas, data) {
  canvas.width = data.width;
  canvas.height = data.height;
  get2d(canvas).putImageData(data, 0, 0);
  return canvas;
}
function canvasFromImageData(data) {
  return writeImageData(createCanvas(data.width, data.height), data);
}
async function canvasToBlob(canvas, format, quality = 0.92) {
  const type = mimeFor(format);
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new CaricatureError("EXPORT_FAILED", "Canvas encoding returned no data.")),
      type,
      quality
    );
  });
}
async function canvasToDataUrl(canvas, format, quality = 0.92) {
  if (typeof canvas.toDataURL === "function") {
    return canvas.toDataURL(mimeFor(format), quality);
  }
  const blob = await canvasToBlob(canvas, format, quality);
  return blobToDataUrl(blob);
}
function blobToDataUrl(blob) {
  if (typeof FileReader === "undefined") {
    return blob.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const base64 = encodeBase64(binary);
      return `data:${blob.type || "application/octet-stream"};base64,${base64}`;
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new CaricatureError("EXPORT_FAILED", "Could not read blob as data URL."));
    reader.readAsDataURL(blob);
  });
}
var B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encodeBase64(binary) {
  if (typeof btoa !== "undefined") return btoa(binary);
  let out = "";
  for (let i = 0; i < binary.length; i += 3) {
    const c1 = binary.charCodeAt(i);
    const c2 = binary.charCodeAt(i + 1);
    const c3 = binary.charCodeAt(i + 2);
    out += B64_ALPHABET[c1 >> 2];
    out += B64_ALPHABET[(c1 & 3) << 4 | (Number.isNaN(c2) ? 0 : c2 >> 4)];
    out += Number.isNaN(c2) ? "=" : B64_ALPHABET[(c2 & 15) << 2 | (Number.isNaN(c3) ? 0 : c3 >> 6)];
    out += Number.isNaN(c3) ? "=" : B64_ALPHABET[c3 & 63];
  }
  return out;
}
function dataUrlToBlob(dataUrl) {
  const [header, body] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(header)?.[1] ?? "image/png";
  const binary = header.includes("base64") ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
function fitDimensions(width, height, maxDimension) {
  if (!maxDimension || maxDimension <= 0) return { width, height };
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
function resampleCanvas(source, width, height) {
  const target = createCanvas(width, height);
  const ctx = get2d(target, false);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return target;
}

// src/validation.ts
var DEFAULT_VALIDATION = {
  maxSizeBytes: 10 * 1024 * 1024,
  acceptedTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
  maxSourceDimension: 8192
};
function resolveValidation(input) {
  return { ...DEFAULT_VALIDATION, ...input ?? {} };
}
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function validateBlob(blob, options, fileName) {
  const label = fileName ? `"${fileName}"` : "The file";
  if (blob.size === 0) {
    throw new CaricatureError("INVALID_SOURCE", `${label} is empty.`);
  }
  if (options.maxSizeBytes > 0 && blob.size > options.maxSizeBytes) {
    throw new CaricatureError(
      "FILE_TOO_LARGE",
      `${label} is ${humanSize(blob.size)}, which exceeds the ${humanSize(options.maxSizeBytes)} limit.`
    );
  }
  const type = (blob.type || "").toLowerCase();
  if (options.acceptedTypes.length > 0 && type && !options.acceptedTypes.includes(type)) {
    throw new CaricatureError(
      "UNSUPPORTED_TYPE",
      `${label} has type "${type}". Accepted types: ${options.acceptedTypes.join(", ")}.`
    );
  }
}
function validateDimensions(width, height, options) {
  if (options.maxSourceDimension > 0 && Math.max(width, height) > options.maxSourceDimension) {
    throw new CaricatureError(
      "DIMENSION_EXCEEDED",
      `Image is ${width}x${height}px; the longest edge must not exceed ${options.maxSourceDimension}px.`
    );
  }
}
function isAcceptedFile(file, options) {
  const resolved = resolveValidation(options);
  try {
    validateBlob(file, resolved, file.name);
    return true;
  } catch {
    return false;
  }
}

// src/ingest.ts
function isBlobLike(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}
function isImageData(value) {
  return typeof ImageData !== "undefined" && value instanceof ImageData;
}
function isImageBitmap(value) {
  return typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap;
}
function isCanvasElement(value) {
  return isBrowser() && typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement;
}
function isImageElement(value) {
  return isBrowser() && typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement;
}
async function decodeBlob(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch (error) {
      if (!isBrowser()) {
        throw new CaricatureError("DECODE_FAILED", "Could not decode the supplied image data.", error);
      }
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageElement(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = (event) => reject(new CaricatureError("DECODE_FAILED", `Could not load the image at "${url}".`, event));
    img.src = url;
  });
}
async function fetchAsBlob(url) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new CaricatureError("DECODE_FAILED", `Fetching "${url}" failed with HTTP ${response.status}.`);
  }
  return response.blob();
}
async function loadSource(source, options) {
  const validation = resolveValidation(options?.validation);
  const maxDimension = options?.maxDimension ?? 0;
  let fileName;
  let mimeType;
  let size;
  let drawable;
  if (source == null) {
    throw new CaricatureError("INVALID_SOURCE", "No image source was provided.");
  }
  if (isImageData(source)) {
    const canvas2 = createCanvas(source.width, source.height);
    get2d(canvas2).putImageData(source, 0, 0);
    drawable = canvas2;
  } else if (isCanvasElement(source) || isImageBitmap(source)) {
    drawable = source;
  } else if (isImageElement(source)) {
    if (!source.complete || source.naturalWidth === 0) {
      await loadImageElement(source.src);
    }
    drawable = Object.assign(source, {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height
    });
  } else if (isBlobLike(source)) {
    const file = source;
    fileName = typeof file.name === "string" ? file.name : void 0;
    mimeType = source.type || void 0;
    size = source.size;
    validateBlob(source, validation, fileName);
    drawable = await decodeBlob(source);
  } else if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) throw new CaricatureError("INVALID_SOURCE", "The supplied image string is empty.");
    const blob = trimmed.startsWith("data:") ? dataUrlToBlob(trimmed) : await fetchAsBlob(trimmed);
    mimeType = blob.type || void 0;
    size = blob.size;
    fileName = trimmed.startsWith("data:") ? void 0 : trimmed.split("/").pop()?.split("?")[0];
    validateBlob(blob, validation, fileName);
    drawable = await decodeBlob(blob);
  } else {
    throw new CaricatureError("INVALID_SOURCE", "Unsupported image source type.");
  }
  const sourceWidth = drawable.width;
  const sourceHeight = drawable.height;
  if (!sourceWidth || !sourceHeight) {
    throw new CaricatureError("DECODE_FAILED", "Decoded image has no dimensions.");
  }
  validateDimensions(sourceWidth, sourceHeight, validation);
  const { width, height } = fitDimensions(sourceWidth, sourceHeight, maxDimension);
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(drawable, 0, 0, width, height);
  if (isImageBitmap(drawable)) drawable.close();
  return { canvas, width, height, fileName, mimeType, size };
}

// src/filters.ts
var clamp255 = (value) => value < 0 ? 0 : value > 255 ? 255 : value;
function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function toGrayscale(image) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const value = luma(data[i], data[i + 1], data[i + 2]);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  return image;
}
function grayscalePlane(image) {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(width * height);
  for (let p = 0, i = 0; p < out.length; p += 1, i += 4) {
    out[p] = luma(data[i], data[i + 1], data[i + 2]);
  }
  return out;
}
function boxBlur(image, radius, passes = 3) {
  const r = Math.max(0, Math.floor(radius));
  const fraction = radius - r;
  if (fraction > 1e-3) {
    const lower = cloneImageData(image);
    if (r > 0) boxBlurInt(lower, r, passes);
    boxBlurInt(image, r + 1, passes);
    blend(lower, image, fraction);
    image.data.set(lower.data);
    return image;
  }
  return boxBlurInt(image, r, passes);
}
function boxBlurInt(image, radius, passes) {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return image;
  const { width, height, data } = image;
  let src = data;
  let tmp = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < passes; pass += 1) {
    blurPass(src, tmp, width, height, r, true);
    blurPass(tmp, src, width, height, r, false);
  }
  tmp = null;
  return image;
}
function blurPass(src, dst, width, height, radius, horizontal) {
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const stepInner = horizontal ? 4 : width * 4;
  const stepOuter = horizontal ? width * 4 : 4;
  for (let o = 0; o < outer; o += 1) {
    const rowStart = o * stepOuter;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    let count = 0;
    for (let i = 0; i <= radius && i < inner; i += 1) {
      const idx = rowStart + i * stepInner;
      sumR += src[idx];
      sumG += src[idx + 1];
      sumB += src[idx + 2];
      sumA += src[idx + 3];
      count += 1;
    }
    for (let i = 0; i < inner; i += 1) {
      const idx = rowStart + i * stepInner;
      dst[idx] = sumR / count;
      dst[idx + 1] = sumG / count;
      dst[idx + 2] = sumB / count;
      dst[idx + 3] = sumA / count;
      const addIndex = i + radius + 1;
      if (addIndex < inner) {
        const a = rowStart + addIndex * stepInner;
        sumR += src[a];
        sumG += src[a + 1];
        sumB += src[a + 2];
        sumA += src[a + 3];
        count += 1;
      }
      const removeIndex = i - radius;
      if (removeIndex >= 0) {
        const s = rowStart + removeIndex * stepInner;
        sumR -= src[s];
        sumG -= src[s + 1];
        sumB -= src[s + 2];
        sumA -= src[s + 3];
        count -= 1;
      }
    }
  }
}
function kuwahara(image, radius) {
  const window = Math.max(1, radius / 2);
  const whole = Math.floor(window);
  const fraction = window - whole;
  if (fraction > 1e-3) {
    const lower = cloneImageData(image);
    kuwaharaWindow(lower, whole);
    kuwaharaWindow(image, whole + 1);
    blend(lower, image, fraction);
    image.data.set(lower.data);
    return image;
  }
  return kuwaharaWindow(image, whole);
}
function kuwaharaWindow(image, windowSize) {
  const { width, height, data } = image;
  const count = width * height;
  const q = Math.max(1, Math.round(windowSize));
  const meanOf = (channel) => {
    const plane = new Float32Array(count);
    for (let p = 0, i = 0; p < count; p += 1, i += 4) {
      if (channel < 3) {
        plane[p] = data[i + channel];
      } else {
        const l = luma(data[i], data[i + 1], data[i + 2]);
        plane[p] = channel === 3 ? l : l * l;
      }
    }
    return boxMeanPlane(plane, width, height, q);
  };
  const mR = meanOf(0);
  const mG = meanOf(1);
  const mB = meanOf(2);
  const mL = meanOf(3);
  const mL2 = meanOf(4);
  const variance = new Float32Array(count);
  for (let p = 0; p < count; p += 1) {
    const v = mL2[p] - mL[p] * mL[p];
    variance[p] = v > 0 ? v : 0;
  }
  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - q);
    const down = Math.min(height - 1, y + q);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - q);
      const right = Math.min(width - 1, x + q);
      let best = up * width + left;
      let bestVariance = variance[best];
      const candidates = [up * width + right, down * width + left, down * width + right];
      for (let c = 0; c < 3; c += 1) {
        const idx = candidates[c];
        if (variance[idx] < bestVariance) {
          bestVariance = variance[idx];
          best = idx;
        }
      }
      const i = (y * width + x) * 4;
      data[i] = mR[best];
      data[i + 1] = mG[best];
      data[i + 2] = mB[best];
    }
  }
  return image;
}
function boxMeanPlane(src, width, height, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    let n = 0;
    for (let x = 0; x <= radius && x < width; x += 1) {
      sum += src[row + x];
      n += 1;
    }
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / n;
      const add = x + radius + 1;
      if (add < width) {
        sum += src[row + add];
        n += 1;
      }
      const drop = x - radius;
      if (drop >= 0) {
        sum -= src[row + drop];
        n -= 1;
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let n = 0;
    for (let y = 0; y <= radius && y < height; y += 1) {
      sum += tmp[y * width + x];
      n += 1;
    }
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / n;
      const add = y + radius + 1;
      if (add < height) {
        sum += tmp[add * width + x];
        n += 1;
      }
      const drop = y - radius;
      if (drop >= 0) {
        sum -= tmp[drop * width + x];
        n -= 1;
      }
    }
  }
  return out;
}
function adjustColor(image, { brightness = 0, contrast = 1, saturation = 1 }) {
  const { data } = image;
  const shift = brightness * 255;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (saturation !== 1) {
      const l = luma(r, g, b);
      r = l + (r - l) * saturation;
      g = l + (g - l) * saturation;
      b = l + (b - l) * saturation;
    }
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }
    data[i] = clamp255(r + shift);
    data[i + 1] = clamp255(g + shift);
    data[i + 2] = clamp255(b + shift);
  }
  return image;
}
function posterize(image, levels) {
  const steps = Math.max(2, Math.min(64, levels));
  const size = 255 / (steps - 1);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) lut[v] = Math.round(Math.round(v / size) * size);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  return image;
}
function posterizeCel(image, levels, chromaSmoothing = 3) {
  const { width, height, data } = image;
  const count = width * height;
  const steps = Math.max(2, Math.min(64, levels));
  const y = new Float32Array(count);
  const cb = new Float32Array(count);
  const cr = new Float32Array(count);
  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    const l = luma(data[i], data[i + 1], data[i + 2]);
    y[p] = l;
    cb[p] = data[i + 2] - l;
    cr[p] = data[i] - l;
  }
  if (chromaSmoothing > 0) {
    const smoothed = [cb, cr].map((plane) => blurPlane(plane, width, height, Math.round(chromaSmoothing)));
    smoothed[0].forEach((v, idx) => cb[idx] = v);
    smoothed[1].forEach((v, idx) => cr[idx] = v);
  }
  const lumaStep = 255 / (steps - 1);
  const chromaStep = 255 / Math.max(8, steps * 3);
  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    const qy = Math.round(y[p] / lumaStep) * lumaStep;
    const qcb = Math.round(cb[p] / chromaStep) * chromaStep;
    const qcr = Math.round(cr[p] / chromaStep) * chromaStep;
    const r = qy + qcr;
    const b = qy + qcb;
    const g = (qy - 0.2126 * r - 0.0722 * b) / 0.7152;
    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
  return image;
}
function blurPlane(src, width, height, radius) {
  const r = Math.max(1, radius);
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    let n = 0;
    for (let x = 0; x <= r && x < width; x += 1) {
      sum += src[row + x];
      n += 1;
    }
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / n;
      const add = x + r + 1;
      if (add < width) {
        sum += src[row + add];
        n += 1;
      }
      const drop = x - r;
      if (drop >= 0) {
        sum -= src[row + drop];
        n -= 1;
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let n = 0;
    for (let y = 0; y <= r && y < height; y += 1) {
      sum += tmp[y * width + x];
      n += 1;
    }
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / n;
      const add = y + r + 1;
      if (add < height) {
        sum += tmp[add * width + x];
        n += 1;
      }
      const drop = y - r;
      if (drop >= 0) {
        sum -= tmp[drop * width + x];
        n -= 1;
      }
    }
  }
  return out;
}
function sobelMagnitude(plane, width, height) {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const tl = plane[i - width - 1];
      const t = plane[i - width];
      const tr = plane[i - width + 1];
      const l = plane[i - 1];
      const r = plane[i + 1];
      const bl = plane[i + width - 1];
      const b = plane[i + width];
      const br = plane[i + width + 1];
      const gx = tl + 2 * l + bl - (tr + 2 * r + br);
      const gy = tl + 2 * t + tr - (bl + 2 * b + br);
      out[i] = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 1020);
    }
  }
  return out;
}
function sobelGradientColor(image) {
  const { data, width, height } = image;
  const magnitude = new Float32Array(width * height);
  const angle = new Float32Array(width * height);
  const stride = width * 4;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      let best = 0;
      let bestGx = 0;
      let bestGy = 0;
      for (let c = 0; c < 3; c += 1) {
        const p = i * 4 + c;
        const tl = data[p - stride - 4];
        const t = data[p - stride];
        const tr = data[p - stride + 4];
        const l = data[p - 4];
        const r = data[p + 4];
        const bl = data[p + stride - 4];
        const b = data[p + stride];
        const br = data[p + stride + 4];
        const gx = tl + 2 * l + bl - (tr + 2 * r + br);
        const gy = tl + 2 * t + tr - (bl + 2 * b + br);
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > best) {
          best = mag;
          bestGx = gx;
          bestGy = gy;
        }
      }
      magnitude[i] = Math.min(1, best / 1020);
      angle[i] = Math.atan2(bestGy, bestGx);
    }
  }
  return { magnitude, angle };
}
function nonMaxSuppress(field, width, height) {
  const { magnitude, angle } = field;
  const out = new Float32Array(magnitude.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = magnitude[i];
      if (value <= 0) continue;
      let deg = angle[i] * 180 / Math.PI;
      if (deg < 0) deg += 180;
      let a;
      let b;
      if (deg < 22.5 || deg >= 157.5) {
        a = magnitude[i - 1];
        b = magnitude[i + 1];
      } else if (deg < 67.5) {
        a = magnitude[i - width - 1];
        b = magnitude[i + width + 1];
      } else if (deg < 112.5) {
        a = magnitude[i - width];
        b = magnitude[i + width];
      } else {
        a = magnitude[i - width + 1];
        b = magnitude[i + width - 1];
      }
      if (value >= a && value >= b) out[i] = value;
    }
  }
  return out;
}
function hysteresis(mask, width, height, low, high) {
  const out = new Float32Array(mask.length);
  const stack = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] >= high) {
      out[i] = mask[i];
      stack.push(i);
    }
  }
  while (stack.length > 0) {
    const i = stack.pop();
    const x = i % width;
    const y = i / width | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (out[n] === 0 && mask[n] >= low) {
          out[n] = mask[n];
          stack.push(n);
        }
      }
    }
  }
  return out;
}
function orientationField(image, smoothing = 12) {
  const { width, height } = image;
  const field = sobelGradientColor(image);
  const count = width * height;
  const doubledX = new Float32Array(count);
  const doubledY = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const magnitude = field.magnitude[i];
    const doubled = 2 * field.angle[i];
    doubledX[i] = Math.cos(doubled) * magnitude;
    doubledY[i] = Math.sin(doubled) * magnitude;
  }
  const smoothX = boxMeanPlane(doubledX, width, height, smoothing);
  const smoothY = boxMeanPlane(doubledY, width, height, smoothing);
  const rawWeight = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const magnitude = Math.hypot(smoothX[i], smoothY[i]);
    const confidence = (magnitude * 8 - 0.08) / 0.27;
    const clamped = confidence < 0 ? 0 : confidence > 1 ? 1 : confidence;
    rawWeight[i] = clamped * clamped * (3 - 2 * clamped);
  }
  const weight = boxMeanPlane(rawWeight, width, height, smoothing);
  const angle = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    angle[i] = 0.5 * Math.atan2(smoothY[i], smoothX[i]) + Math.PI / 2;
  }
  return { angle, weight };
}
function softenMask(mask, width, height, radius = 1) {
  return blurPlane(mask instanceof Float32Array ? mask : Float32Array.from(mask), width, height, radius);
}
function adaptiveThresholdMask(plane, width, height, radius, bias) {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += plane[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Float32Array(width * height);
  const r = Math.max(1, Math.round(radius));
  const offset = bias * 255;
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * (width + 1) + (x1 + 1)] - integral[y0 * (width + 1) + (x1 + 1)] - integral[(y1 + 1) * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      const mean = sum / area;
      const value = plane[y * width + x];
      out[y * width + x] = Math.max(0, Math.min(1, (mean - offset - value) / 32));
    }
  }
  return out;
}
function sobelMagnitudeColor(image) {
  const { data, width, height } = image;
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      let best = 0;
      for (let c = 0; c < 3; c += 1) {
        const p = i * 4 + c;
        const w = width * 4;
        const tl = data[p - w - 4];
        const t = data[p - w];
        const tr = data[p - w + 4];
        const l = data[p - 4];
        const r = data[p + 4];
        const bl = data[p + w - 4];
        const b = data[p + w];
        const br = data[p + w + 4];
        const gx = tl + 2 * l + bl - (tr + 2 * r + br);
        const gy = tl + 2 * t + tr - (bl + 2 * b + br);
        const mag = Math.sqrt(gx * gx + gy * gy) / 1020;
        if (mag > best) best = mag;
      }
      out[i] = best > 1 ? 1 : best;
    }
  }
  return out;
}
function dilate(mask, width, height, radius) {
  const whole = Math.max(0, Math.floor(radius));
  const fraction = radius - whole;
  if (fraction > 1e-3) {
    const lower = whole === 0 ? mask : dilateInt(mask, width, height, whole);
    const upper = dilateInt(mask, width, height, whole + 1);
    const out = new Float32Array(mask.length);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = lower[i] * (1 - fraction) + upper[i] * fraction;
    }
    return out;
  }
  return dilateInt(mask, width, height, whole);
}
function dilateInt(mask, width, height, radius) {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return mask;
  const tmp = new Float32Array(mask.length);
  const out = new Float32Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      for (let k = -r; k <= r; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= width) continue;
        const v = mask[y * width + xx];
        if (v > max) max = v;
      }
      tmp[y * width + x] = max;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      for (let k = -r; k <= r; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= height) continue;
        const v = tmp[yy * width + x];
        if (v > max) max = v;
      }
      out[y * width + x] = max;
    }
  }
  return out;
}
function compositeInk(image, mask, strength) {
  if (strength <= 0) return image;
  const { data } = image;
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    const ink = mask[p] * strength;
    if (ink <= 0) continue;
    const keep = 1 - ink;
    data[i] = data[i] * keep;
    data[i + 1] = data[i + 1] * keep;
    data[i + 2] = data[i + 2] * keep;
  }
  return image;
}
function radialExaggeration(image, strength) {
  if (strength <= 0) return image;
  const { width, height, data } = image;
  const src = new Uint8ClampedArray(data);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const amount = Math.min(1, strength) * 0.6;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * width + x) * 4;
      if (dist < 1e-4) {
        data[idx] = src[idx];
        data[idx + 1] = src[idx + 1];
        data[idx + 2] = src[idx + 2];
        data[idx + 3] = src[idx + 3];
        continue;
      }
      const norm = dist / maxR;
      const warped = Math.pow(norm, 1 + amount) * maxR;
      const scale = warped / dist;
      const sx = cx + dx * scale;
      const sy = cy + dy * scale;
      sampleBilinear(src, width, height, sx, sy, data, idx);
    }
  }
  return image;
}
function sampleBilinear(src, width, height, x, y, dst, dstIndex) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const cx0 = Math.max(0, Math.min(width - 1, x0));
  const cy0 = Math.max(0, Math.min(height - 1, y0));
  const i00 = (cy0 * width + cx0) * 4;
  const i10 = (cy0 * width + x1) * 4;
  const i01 = (y1 * width + cx0) * 4;
  const i11 = (y1 * width + x1) * 4;
  for (let c = 0; c < 4; c += 1) {
    const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
    const bottom = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
    dst[dstIndex + c] = top * (1 - fy) + bottom * fy;
  }
}
function blend(base, overlay, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  if (a === 0) return base;
  const bd = base.data;
  const od = overlay.data;
  for (let i = 0; i < bd.length; i += 4) {
    bd[i] = bd[i] * (1 - a) + od[i] * a;
    bd[i + 1] = bd[i + 1] * (1 - a) + od[i + 1] * a;
    bd[i + 2] = bd[i + 2] * (1 - a) + od[i + 2] * a;
  }
  return base;
}
function cloneImageData(image) {
  if (typeof ImageData !== "undefined") {
    return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  }
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}

// src/background.ts
var NAMED = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  transparent: [0, 0, 0]
};
function parseColor(input, fallback = [255, 255, 255]) {
  if (!input) return fallback;
  const value = input.trim().toLowerCase();
  if (NAMED[value]) return NAMED[value];
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16)
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
    return fallback;
  }
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (match) {
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return fallback;
}
function buildEllipseMask(width, height, config) {
  const mask = new Float32Array(width * height);
  const cx = config.subjectX * width;
  const cy = config.subjectY * height;
  const rx = Math.max(1, config.subjectRadiusX * width);
  const ry = Math.max(1, config.subjectRadiusY * height);
  const feather = Math.max(1e-3, config.subjectFeather);
  for (let y = 0; y < height; y += 1) {
    const dy = (y - cy) / ry;
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / rx;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const value = (1 + feather - distance) / feather;
      mask[y * width + x] = value <= 0 ? 0 : value >= 1 ? 1 : value;
    }
  }
  return mask;
}
function toMask(output, width, height) {
  if (output instanceof Float32Array) {
    if (output.length === width * height) return output;
    return resampleMask(output, Math.round(Math.sqrt(output.length * width / height)), output.length, width, height);
  }
  const { data, width: sw, height: sh } = output;
  const plane = new Float32Array(sw * sh);
  let opaque = true;
  for (let p = 0, i = 3; p < plane.length; p += 1, i += 4) {
    if (data[i] < 250) opaque = false;
  }
  for (let p = 0, i = 0; p < plane.length; p += 1, i += 4) {
    plane[p] = opaque ? (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 : data[i + 3] / 255;
  }
  if (sw === width && sh === height) return plane;
  return resampleMask(plane, sw, sh, width, height);
}
function resampleMask(src, sw, sh, width, height) {
  const out = new Float32Array(width * height);
  if (sw <= 0 || sh <= 0) return out;
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(sh - 1, Math.floor(y * sh / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(sw - 1, Math.floor(x * sw / width));
      out[y * width + x] = src[sy * sw + sx];
    }
  }
  return out;
}
function applyBackground(image, mask, config) {
  const type = config.background;
  if (type === "original") return image;
  const { width, height, data } = image;
  let blurred = null;
  if (type === "blur") {
    const copy = cloneImageData(image);
    boxBlur(copy, Math.max(1, Math.round(config.backgroundBlur)), 3);
    blurred = copy.data;
  }
  const solid = parseColor(config.backgroundColor);
  const from = parseColor(config.backgroundGradientFrom);
  const to = parseColor(config.backgroundGradientTo);
  const angle = (config.backgroundGradientAngle % 360 + 360) % 360;
  const radians = angle * Math.PI / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);
  const projections = [0, dirX * (width - 1), dirY * (height - 1), dirX * (width - 1) + dirY * (height - 1)];
  const min = Math.min(...projections);
  const span = Math.max(...projections) - min || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const subject = mask[p];
      if (subject >= 0.999) continue;
      const i = p * 4;
      if (type === "transparent") {
        data[i + 3] = Math.round(subject * 255);
        continue;
      }
      let r;
      let g;
      let b;
      if (type === "blur" && blurred) {
        r = blurred[i];
        g = blurred[i + 1];
        b = blurred[i + 2];
      } else if (type === "gradient") {
        const t = (dirX * x + dirY * y - min) / span;
        r = from[0] + (to[0] - from[0]) * t;
        g = from[1] + (to[1] - from[1]) * t;
        b = from[2] + (to[2] - from[2]) * t;
      } else {
        r = solid[0];
        g = solid[1];
        b = solid[2];
      }
      const inverse = 1 - subject;
      data[i] = data[i] * subject + r * inverse;
      data[i + 1] = data[i + 1] * subject + g * inverse;
      data[i + 2] = data[i + 2] * subject + b * inverse;
    }
  }
  return image;
}

// src/pipeline.ts
var DEFAULT_CONFIG = {
  mode: "color",
  style: "cartoon",
  edgeStrength: 0.8,
  edgeThickness: 1,
  posterizeLevels: 8,
  saturation: 1.3,
  contrast: 1.1,
  brightness: 0.02,
  smoothness: 3,
  adaptiveThreshold: true,
  thresholdBias: 0.02,
  exaggeration: 0,
  maxDimension: 1600,
  supersample: 1,
  paperTone: 253,
  sketchWash: 0.22,
  sketchHatching: 0,
  background: "original",
  backgroundColor: "#f0b429",
  backgroundGradientFrom: "#4dabf7",
  backgroundGradientTo: "#f783ac",
  backgroundGradientAngle: 135,
  backgroundBlur: 14,
  subjectX: 0.5,
  subjectY: 0.44,
  subjectRadiusX: 0.36,
  subjectRadiusY: 0.48,
  subjectFeather: 0.18
};
var RANGES = {
  edgeStrength: [0, 1],
  edgeThickness: [0, 4],
  posterizeLevels: [2, 32],
  saturation: [0, 3],
  contrast: [0, 3],
  brightness: [-1, 1],
  smoothness: [0, 12],
  thresholdBias: [-0.5, 0.5],
  exaggeration: [0, 1],
  maxDimension: [64, 8192],
  supersample: [1, 3],
  paperTone: [180, 255],
  sketchWash: [0, 1],
  sketchHatching: [0, 1],
  backgroundGradientAngle: [0, 360],
  backgroundBlur: [0, 40],
  subjectX: [0, 1],
  subjectY: [0, 1],
  subjectRadiusX: [0.05, 1.5],
  subjectRadiusY: [0.05, 1.5],
  subjectFeather: [0.01, 1]
};
var STYLES = ["cartoon", "comic", "painting", "sketch"];
var BACKGROUNDS = ["original", "blur", "solid", "gradient", "transparent"];
var COLOR_KEYS = ["backgroundColor", "backgroundGradientFrom", "backgroundGradientTo"];
var clampTo = (key, value) => {
  const range = RANGES[key];
  if (!range) return value;
  return Math.max(range[0], Math.min(range[1], value));
};
function resolveConfig(input, base = DEFAULT_CONFIG) {
  const merged = { ...base, ...input ?? {} };
  const out = { ...merged };
  for (const key of Object.keys(RANGES)) {
    const value = merged[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = clampTo(key, value);
    } else {
      out[key] = DEFAULT_CONFIG[key];
    }
  }
  for (const key of COLOR_KEYS) {
    if (typeof merged[key] !== "string" || !merged[key]) out[key] = DEFAULT_CONFIG[key];
  }
  out.mode = merged.mode === "grayscale" ? "grayscale" : "color";
  out.style = STYLES.includes(merged.style) ? merged.style : DEFAULT_CONFIG.style;
  out.background = BACKGROUNDS.includes(merged.background) ? merged.background : DEFAULT_CONFIG.background;
  out.adaptiveThreshold = Boolean(merged.adaptiveThreshold);
  return out;
}
var EDGE_GAIN = 2.4;
function stylize(image, config, onProgress = () => {
}, subjectMask) {
  const { width, height } = image;
  const style = config.style;
  if (config.exaggeration > 0) radialExaggeration(image, config.exaggeration);
  onProgress(0.12);
  smoothForStyle(image, config);
  onProgress(0.45);
  const ink = config.edgeStrength > 0 ? buildInkMask(image, config) : null;
  onProgress(0.66);
  adjustColor(image, {
    brightness: config.brightness,
    contrast: config.contrast,
    saturation: config.mode === "grayscale" ? 1 : config.saturation
  });
  const chromaSmoothing = Math.max(2, config.smoothness * 0.8);
  if (style === "cartoon") posterizeCel(image, config.posterizeLevels, chromaSmoothing);
  else if (style === "comic") posterizeCel(image, Math.max(2, config.posterizeLevels * 0.6), chromaSmoothing + 1);
  else if (style === "painting") posterizeCel(image, Math.min(32, config.posterizeLevels * 2.5), chromaSmoothing);
  if (config.mode === "grayscale" && style !== "sketch") toGrayscale(image);
  onProgress(0.82);
  if (style === "sketch") {
    const flow = config.sketchHatching > 0 ? orientationField(image, Math.max(16, Math.round(Math.max(width, height) / 10))) : null;
    renderSketch(image, ink, config, flow);
  } else if (ink) compositeInk(image, ink, inkStrengthFor(style, config.edgeStrength));
  onProgress(0.92);
  if (config.background !== "original") {
    applyBackground(image, subjectMask ?? buildEllipseMask(width, height, config), config);
  }
  onProgress(1);
  return image;
}
function smoothForStyle(image, config) {
  const radius = config.smoothness;
  if (radius <= 0) return;
  switch (config.style) {
    case "painting":
      kuwahara(image, radius + 3);
      kuwahara(image, Math.max(2, (radius + 3) / 2));
      break;
    case "comic":
      kuwahara(image, Math.max(2, radius + 1));
      break;
    case "sketch":
      boxBlur(image, Math.max(1, Math.min(3, radius / 3)), 2);
      break;
    case "cartoon":
    default:
      kuwahara(image, Math.max(1, radius));
      break;
  }
}
function buildInkMask(image, config) {
  const { width, height } = image;
  let source = image;
  if (config.style === "sketch") {
    source = cloneImageData(image);
    boxBlur(source, Math.max(1, Math.round(Math.max(image.width, image.height) / 900)), 2);
  }
  const bold = config.style === "sketch" || config.style === "comic";
  const gain = bold ? EDGE_GAIN * 1.4 : EDGE_GAIN;
  const field = sobelGradientColor(source);
  for (let i = 0; i < field.magnitude.length; i += 1) {
    field.magnitude[i] = Math.min(1, field.magnitude[i] * gain);
  }
  const thinned = nonMaxSuppress(field, width, height);
  const strongFraction = bold ? 0.05 : 0.035;
  const high = Math.max(0.06, Math.min(0.5, percentile(thinned, strongFraction)));
  const low = high * 0.4;
  const linked = hysteresis(thinned, width, height, low, high);
  let mask = new Float32Array(linked.length);
  for (let i = 0; i < linked.length; i += 1) {
    mask[i] = smoothstep(low, high, linked[i]);
  }
  if (config.adaptiveThreshold) {
    const radius = Math.max(2, Math.round(Math.max(width, height) / 180));
    const adaptive = adaptiveThresholdMask(grayscalePlane(source), width, height, radius, config.thresholdBias);
    const nearContour = dilate(mask, width, height, 2);
    for (let i = 0; i < mask.length; i += 1) {
      const gated = Math.min(smoothstep(low, high, adaptive[i] * (bold ? 1.6 : 1.2)), nearContour[i]);
      if (gated > mask[i]) mask[i] = gated;
    }
  }
  if (config.edgeThickness > 0) {
    mask = dilate(mask, width, height, config.edgeThickness);
  }
  return softenMask(mask, width, height, 1);
}
function percentile(values, fraction) {
  const bins = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value <= 0) continue;
    bins[Math.min(255, value * 255 | 0)] += 1;
    count += 1;
  }
  if (count === 0) return 1;
  const target = Math.max(1, Math.round(count * fraction));
  let seen = 0;
  for (let bin = 255; bin >= 0; bin -= 1) {
    seen += bins[bin];
    if (seen >= target) return bin / 255;
  }
  return 0;
}
function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function inkStrengthFor(style, edgeStrength) {
  if (style === "painting") return edgeStrength * 0.35;
  if (style === "comic") return Math.min(1, edgeStrength * 1.15);
  return edgeStrength;
}
function renderSketch(image, ink, config, flow) {
  const { data, width, height } = image;
  const paper = config.paperTone;
  const wash = config.mode === "grayscale" ? 0 : config.sketchWash;
  const strength = Math.min(1, config.edgeStrength * 1.25);
  const hatching = config.sketchHatching;
  const period = Math.max(6, Math.round(Math.max(width, height) / 70));
  const wobble = period * 0.22;
  const baseAngle = 0.62;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const shade = luma(data[i], data[i + 1], data[i + 2]) / 255;
      const depth = smoothstep(0.86, 0.08, shade);
      const structureHint = flow ? flow.weight[p] : 1;
      const flatGate = Math.max(0.35, Math.max(structureHint, smoothstep(0.55, 0.85, depth)));
      let tone = paper * (1 - depth * (0.34 - 0.28 * hatching) * flatGate);
      const structure = flow ? flow.weight[p] : 1;
      const shading = Math.max(smoothstep(0.22, 0.6, structure), smoothstep(0.72, 0.95, depth));
      if (hatching > 0 && depth > 0.08 && shading > 0.02) {
        let cos = Math.cos(baseAngle);
        let sin = Math.sin(baseAngle);
        if (flow) {
          let delta = flow.angle[p] - baseAngle;
          delta = wrapOrientation(delta);
          const bend = Math.max(-0.45, Math.min(0.45, delta)) * flow.weight[p] * 0.7;
          cos = Math.cos(baseAngle + bend);
          sin = Math.sin(baseAngle + bend);
        }
        const first = smoothstep(0.1, 0.38, depth);
        const second = smoothstep(0.42, 0.68, depth);
        const third = smoothstep(0.84, 0.99, depth);
        const halfWidth = 0.45 + depth * 0.85;
        let coverage2 = strokeCoverage(x, y, cos, sin, period, wobble, halfWidth, 0) * first;
        if (second > 0) {
          coverage2 += strokeCoverage(x, y, cos, sin, period, wobble, halfWidth, period * 0.5) * second;
        }
        if (third > 0) {
          coverage2 += strokeCoverage(x, y, cos, -sin, period * 1.37, wobble * 0.8, halfWidth, period * 0.41) * third * 0.8;
        }
        tone *= 1 - Math.min(1, coverage2) * hatching * shading * 0.55;
      }
      tone += (hash(x, y) - 0.5) * 2.5;
      let r = tone;
      let g = tone;
      let b = tone;
      if (wash > 0) {
        const scale = tone / 255;
        r = tone * (1 - wash) + (data[i] + 40) * wash * scale;
        g = tone * (1 - wash) + (data[i + 1] + 40) * wash * scale;
        b = tone * (1 - wash) + (data[i + 2] + 40) * wash * scale;
      }
      const coverage = ink ? Math.min(1, ink[p] * strength) : 0;
      const keep = 1 - coverage;
      data[i] = r * keep + 26 * coverage;
      data[i + 1] = g * keep + 28 * coverage;
      data[i + 2] = b * keep + 34 * coverage;
    }
  }
}
function strokeCoverage(x, y, cos, sin, period, wobble, halfWidth, offset) {
  const along = x * -sin + y * cos;
  const across = x * cos + y * sin + offset + Math.sin(along * 0.035) * wobble;
  const index = Math.floor(across / period);
  const distance = Math.abs(across - index * period - period / 2);
  const coverage = smoothstep(halfWidth + 1, halfWidth, distance);
  if (coverage <= 0) return 0;
  const dashLength = period * 7;
  const position = along / dashLength;
  const dash = Math.floor(position);
  const jitter = hash(index * 31 + 7, dash * 17 + 3);
  if (jitter < 0.1) return 0;
  const t = position - dash;
  const taper = smoothstep(0, 0.07, t) * smoothstep(1, 0.93, t);
  return coverage * taper * (0.62 + jitter * 0.38);
}
function wrapOrientation(delta) {
  let value = delta;
  while (value > Math.PI / 2) value -= Math.PI;
  while (value < -Math.PI / 2) value += Math.PI;
  return value;
}
function hash(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// src/presets.ts
var PRESETS = {
  /** Flat cel-shaded colour with clean outlines. */
  cartoon: {
    style: "cartoon",
    mode: "color",
    edgeStrength: 0.8,
    edgeThickness: 1,
    posterizeLevels: 8,
    smoothness: 3,
    saturation: 1.3,
    contrast: 1.1,
    adaptiveThreshold: true
  },
  /** Printed-comic look: fewer colours, heavier ink. */
  comic: {
    style: "comic",
    mode: "color",
    edgeStrength: 0.95,
    edgeThickness: 2,
    posterizeLevels: 6,
    smoothness: 4,
    saturation: 1.55,
    contrast: 1.3,
    adaptiveThreshold: true
  },
  /** Soft painterly regions, barely any ink. */
  painting: {
    style: "painting",
    mode: "color",
    edgeStrength: 0.4,
    edgeThickness: 1,
    posterizeLevels: 10,
    smoothness: 5,
    saturation: 1.45,
    contrast: 1.05,
    adaptiveThreshold: false
  },
  /** Clean line drawing on paper with a light colour wash — no hatching. */
  sketch: {
    style: "sketch",
    mode: "color",
    edgeStrength: 0.9,
    edgeThickness: 0.6,
    smoothness: 3,
    sketchWash: 0.22,
    sketchHatching: 0,
    paperTone: 253,
    adaptiveThreshold: true
  },
  /** The same drawing, shaded with drawn pencil strokes. */
  pencil: {
    style: "sketch",
    mode: "color",
    edgeStrength: 0.85,
    edgeThickness: 0.5,
    smoothness: 3,
    sketchWash: 0.18,
    sketchHatching: 0.5,
    paperTone: 253,
    adaptiveThreshold: true
  },
  /** Bold black marker strokes on white — no colour. */
  marker: {
    style: "sketch",
    mode: "grayscale",
    edgeStrength: 1,
    edgeThickness: 1,
    smoothness: 4,
    sketchWash: 0,
    sketchHatching: 0,
    paperTone: 255,
    thresholdBias: 0.06,
    adaptiveThreshold: true
  },
  /** Cartoon subject on a warm solid backdrop, like a caricature stall print. */
  portrait: {
    style: "cartoon",
    mode: "color",
    edgeStrength: 0.85,
    edgeThickness: 1,
    posterizeLevels: 7,
    smoothness: 3,
    saturation: 1.35,
    exaggeration: 0.15,
    background: "solid",
    backgroundColor: "#f0b429",
    subjectRadiusX: 0.38,
    subjectRadiusY: 0.5,
    subjectFeather: 0.16
  }
};
var PRESET_NAMES = Object.keys(PRESETS);

// src/engine.ts
var CaricatureEngine = class {
  constructor(options = {}) {
    this.maskCache = null;
    this.listeners = /* @__PURE__ */ new Map();
    this.stateListeners = /* @__PURE__ */ new Set();
    this.abortController = null;
    this.runToken = 0;
    this.config = resolveConfig(options.config);
    this.validation = resolveValidation(options.validation);
    this.driver = options.driver ?? null;
    this.segmentation = options.segmentation ?? null;
    this.state = {
      status: "idle",
      isProcessing: false,
      progress: 0,
      error: null,
      result: null,
      source: null,
      config: this.config
    };
    if (options.onStateChange) this.stateListeners.add(options.onStateChange);
  }
  // ---------------------------------------------------------------- state ---
  /** Immutable snapshot of the current engine state. */
  getState() {
    return { ...this.state, config: { ...this.config } };
  }
  getConfig() {
    return { ...this.config };
  }
  get isProcessing() {
    return this.state.isProcessing;
  }
  get progress() {
    return this.state.progress;
  }
  get error() {
    return this.state.error;
  }
  get result() {
    return this.state.result;
  }
  /** Subscribes to every state transition. Returns an unsubscribe function. */
  subscribe(listener) {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }
  /** Subscribes to a single lifecycle event. */
  on(event, handler) {
    const set = this.listeners.get(event) ?? /* @__PURE__ */ new Set();
    set.add(handler);
    this.listeners.set(event, set);
    return () => set.delete(handler);
  }
  emit(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }
  patch(partial) {
    this.state = { ...this.state, ...partial, config: this.config };
    const snapshot = this.getState();
    this.stateListeners.forEach((listener) => listener(snapshot));
    this.emit("statechange", { state: snapshot });
  }
  // --------------------------------------------------------------- config ---
  /** Merges a partial config; every numeric value is clamped to its valid range. */
  updateConfig(partial) {
    this.config = resolveConfig(partial, this.config);
    this.patch({});
    this.emit("configchange", { config: this.getConfig() });
    if (partial.mode) this.emit("modechange", { mode: this.config.mode });
    return this.getConfig();
  }
  setMode(mode) {
    return this.updateConfig({ mode });
  }
  /** Switches the rendering algorithm: `cartoon`, `comic`, `painting` or `sketch`. */
  setStyle(style) {
    return this.updateConfig({ style });
  }
  getStyle() {
    return this.config.style;
  }
  /**
   * Replaces everything outside the subject.
   *
   * ```ts
   * engine.setBackground('gradient', { backgroundGradientFrom: '#4dabf7', backgroundGradientTo: '#f783ac' });
   * engine.setBackground('transparent');   // export a cut-out PNG
   * ```
   */
  setBackground(background, options = {}) {
    return this.updateConfig({ ...options, background });
  }
  /** Applies a tuned preset (`cartoon`, `comic`, `painting`, `sketch`, `pencil`, `marker`, `portrait`). */
  applyPreset(name) {
    return this.updateConfig(PRESETS[name]);
  }
  getMode() {
    return this.config.mode;
  }
  /** Restores the shipped defaults without touching the loaded source. */
  resetConfig() {
    this.config = { ...DEFAULT_CONFIG };
    this.patch({});
    this.emit("configchange", { config: this.getConfig() });
    return this.getConfig();
  }
  setValidation(options) {
    this.validation = resolveValidation({ ...this.validation, ...options });
    return { ...this.validation };
  }
  /** Swaps the AI backend at runtime. Pass `null` to return to local canvas processing. */
  setDriver(driver) {
    this.driver = driver;
  }
  getDriver() {
    return this.driver;
  }
  /**
   * Supplies a subject matte provider so background replacement follows the
   * person instead of the built-in ellipse. Pass `null` to go back to the heuristic.
   */
  setSegmentation(segmentation) {
    this.segmentation = segmentation;
    this.maskCache = null;
  }
  getSegmentation() {
    return this.segmentation;
  }
  // ------------------------------------------------------------ processing ---
  /** Decodes, validates and stores a source image without stylizing it. */
  async load(source) {
    this.patch({ status: "loading", error: null, progress: 0 });
    try {
      const loaded = await loadSource(source, {
        validation: this.validation,
        maxDimension: this.config.maxDimension
      });
      this.maskCache = null;
      this.patch({ status: "idle", source: loaded, result: null });
      return loaded;
    } catch (error) {
      const wrapped = toCaricatureError(error);
      this.patch({ status: "error", error: wrapped, isProcessing: false });
      this.emit("error", { error: wrapped });
      throw wrapped;
    }
  }
  /**
   * Runs the full pipeline. Pass a source to load it first, or omit it to
   * re-render the already loaded image with the current config.
   */
  async process(source) {
    if (source !== void 0) await this.load(source);
    const loaded = this.state.source;
    if (!loaded) {
      const error = new CaricatureError("NO_SOURCE", "Call load(source) or process(source) before processing.");
      this.patch({ status: "error", error });
      this.emit("error", { error });
      throw error;
    }
    this.abortController?.abort();
    this.abortController = new AbortController();
    const token = ++this.runToken;
    const startedAt = now();
    this.patch({ status: "processing", isProcessing: true, progress: 0, error: null });
    this.emit("start", { source: loaded });
    const onProgress = (progress) => {
      if (token !== this.runToken) return;
      const clamped = Math.max(0, Math.min(1, progress));
      this.patch({ progress: clamped });
      this.emit("progress", { progress: clamped });
    };
    try {
      const config = this.getConfig();
      let canvas;
      if (this.driver) {
        const blob = await canvasToBlob(loaded.canvas, "png");
        const output = await this.driver.process(blob, {
          config,
          mode: config.mode,
          source: loaded,
          signal: this.abortController.signal,
          onProgress
        });
        canvas = await normalizeDriverOutput(output);
      } else {
        const scale = Math.max(1, Math.min(3, config.supersample));
        const workWidth = Math.round(loaded.width * scale);
        const workHeight = Math.round(loaded.height * scale);
        const mask = config.background === "original" ? null : await this.resolveMask(loaded, workWidth, workHeight);
        await nextTick();
        const source2 = scale > 1 ? resampleCanvas(loaded.canvas, workWidth, workHeight) : cloneCanvas(loaded.canvas);
        const working = readImageData(source2);
        stylize(working, config, onProgress, mask);
        canvas = canvasFromImageData(working);
        if (scale > 1) canvas = resampleCanvas(canvas, loaded.width, loaded.height);
      }
      if (token !== this.runToken) {
        throw new CaricatureError("ABORTED", "Processing was superseded by a newer run.");
      }
      const result = {
        canvas,
        width: canvas.width,
        height: canvas.height,
        mode: config.mode,
        config,
        durationMs: Math.round(now() - startedAt),
        driver: this.driver?.name
      };
      this.patch({ status: "success", isProcessing: false, progress: 1, result, error: null });
      this.emit("complete", { result });
      return result;
    } catch (error) {
      const wrapped = toCaricatureError(error);
      if (token === this.runToken) {
        this.patch({ status: "error", isProcessing: false, error: wrapped });
        this.emit("error", { error: wrapped });
      }
      throw wrapped;
    }
  }
  /** Cancels an in-flight run (AI drivers receive the abort signal). */
  cancel() {
    this.abortController?.abort();
    this.runToken += 1;
    if (this.state.isProcessing) {
      this.patch({ status: "idle", isProcessing: false, progress: 0 });
    }
  }
  /**
   * Clears source, result, error and progress.
   * @param options.keepSource keep the loaded image and drop only the result.
   * @param options.keepConfig keep the current config (default `true`).
   */
  reset(options = {}) {
    const { keepSource = false, keepConfig = true } = options;
    this.cancel();
    if (!keepConfig) this.config = { ...DEFAULT_CONFIG };
    this.state = {
      status: "idle",
      isProcessing: false,
      progress: 0,
      error: null,
      result: null,
      source: keepSource ? this.state.source : null,
      config: this.config
    };
    this.patch({});
    this.emit("reset", {});
  }
  // ---------------------------------------------------------------- export ---
  /** The processed canvas. Throws if nothing has been processed yet. */
  getCanvasElement() {
    const result = this.state.result;
    if (!result) throw new CaricatureError("NO_RESULT", "Nothing has been processed yet.");
    return result.canvas;
  }
  /** The decoded source canvas, useful for a before/after preview. */
  getSourceCanvas() {
    return this.state.source?.canvas ?? null;
  }
  getImageData() {
    return readImageData(this.getCanvasElement());
  }
  async getBlob(options = {}) {
    const { format = "png", quality = 0.92 } = options;
    return canvasToBlob(this.getCanvasElement(), format, quality);
  }
  /** Full `data:` URL of the processed image. */
  async getBase64(options = {}) {
    const { format = "png", quality = 0.92 } = options;
    return canvasToDataUrl(this.getCanvasElement(), format, quality);
  }
  /** Object URL for the processed image — remember to `URL.revokeObjectURL()`. */
  async getObjectUrl(options = {}) {
    return URL.createObjectURL(await this.getBlob(options));
  }
  async getFile(options = {}) {
    const { format = "png", quality = 0.92 } = options;
    const blob = await this.getBlob({ format, quality });
    return new File([blob], this.buildFileName(options.fileName, format), { type: mimeFor(format) });
  }
  /** Triggers a browser download of the processed image. */
  async downloadImage(options = {}) {
    const { format = "png", quality = 0.92 } = options;
    const blob = await this.getBlob({ format, quality });
    if (!isBrowser()) {
      throw new CaricatureError("EXPORT_FAILED", "downloadImage() requires a browser environment.");
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = this.buildFileName(options.fileName, format);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    return blob;
  }
  /** Multipart payload ready to `fetch(url, { method: 'POST', body })`. */
  async toFormData(options = {}) {
    const { format = "png", quality = 0.92, fieldName = "file", includeMetadata = true, extraFields } = options;
    const fileName = this.buildFileName(options.fileName, format);
    const blob = await this.getBlob({ format, quality });
    const form = new FormData();
    form.append(fieldName, blob, fileName);
    if (includeMetadata) {
      const payload = await this.toJSON({ format, quality, fileName: options.fileName });
      const { base64: _omit, ...metadata } = payload;
      form.append("metadata", JSON.stringify(metadata));
    }
    for (const [key, value] of Object.entries(extraFields ?? {})) form.append(key, value);
    return form;
  }
  /** JSON payload (base64 included) ready for an API call or a DB column. */
  async toJSON(options = {}) {
    const { format = "png", quality = 0.92 } = options;
    const result = this.state.result;
    if (!result) throw new CaricatureError("NO_RESULT", "Nothing has been processed yet.");
    const base64 = await this.getBase64({ format, quality });
    const blob = await this.getBlob({ format, quality });
    return {
      fileName: this.buildFileName(options.fileName, format),
      mimeType: mimeFor(format),
      width: result.width,
      height: result.height,
      mode: result.mode,
      config: result.config,
      base64,
      size: blob.size,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      driver: result.driver
    };
  }
  /** Releases listeners and in-flight work. */
  destroy() {
    this.cancel();
    this.listeners.clear();
    this.stateListeners.clear();
    this.state = { ...this.state, source: null, result: null };
  }
  /**
   * Runs the segmentation driver once per loaded image and caches the matte.
   * A failing driver never fails the render — the heuristic ellipse takes over.
   */
  async resolveMask(source, width, height) {
    if (!this.segmentation) return null;
    if (this.maskCache && this.maskCache.canvas === source.canvas && this.maskCache.mask.length === width * height) {
      return this.maskCache.mask;
    }
    try {
      const output = await this.segmentation.segment(source, this.abortController?.signal);
      const mask = toMask(output, width, height);
      this.maskCache = { canvas: source.canvas, mask };
      return mask;
    } catch (error) {
      this.patch({
        error: new CaricatureError(
          "SEGMENTATION_FAILED",
          `Segmentation driver "${this.segmentation.name}" failed; falling back to the heuristic subject mask.`,
          error
        )
      });
      return null;
    }
  }
  buildFileName(requested, format) {
    const ext = extensionFor(format);
    if (requested) return requested.includes(".") ? requested : `${requested}.${ext}`;
    const original = this.state.source?.fileName;
    const stem = original ? original.replace(/\.[^.]+$/, "") : "caricature";
    return `${stem}-toon.${ext}`;
  }
};
function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
function toCaricatureError(error) {
  if (error instanceof CaricatureError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new CaricatureError("ABORTED", "Processing was cancelled.", error);
  }
  return new CaricatureError("DRIVER_FAILED", error instanceof Error ? error.message : String(error), error);
}
async function normalizeDriverOutput(output) {
  const loaded = await loadSource(output, {
    validation: { maxSizeBytes: 0, acceptedTypes: [], maxSourceDimension: 0 }
  });
  return loaded.canvas;
}
async function toonify(source, config) {
  const engine = new CaricatureEngine({ config });
  return engine.process(source);
}
async function toonifyToDataUrl(source, config, exportOptions) {
  const engine = new CaricatureEngine({ config });
  await engine.process(source);
  return engine.getBase64(exportOptions);
}

// src/drivers.ts
async function defaultParse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json();
    const candidate = body.image ?? body.output ?? body.url ?? body.result ?? body.data;
    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    if (typeof value === "string") return value;
    throw new CaricatureError("DRIVER_FAILED", "AI driver response contained no recognizable image field.");
  }
  return response.blob();
}
function createRemoteAIDriver(options) {
  const {
    url,
    name = "remote",
    method = "POST",
    fieldName = "image",
    json = false,
    parseResponse = defaultParse
  } = options;
  return {
    name,
    async process(input, context) {
      const headers = typeof options.headers === "function" ? await options.headers() : { ...options.headers ?? {} };
      const extra = typeof options.extra === "function" ? options.extra(context) : { ...options.extra ?? {} };
      context.onProgress(0.2);
      let body;
      if (json) {
        const base64 = await blobToBase64(input);
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ [fieldName]: base64, mode: context.mode, config: context.config, ...extra });
      } else {
        const form = new FormData();
        form.append(fieldName, input, context.source.fileName ?? "source.png");
        form.append("mode", context.mode);
        form.append("config", JSON.stringify(context.config));
        for (const [key, value] of Object.entries(extra)) form.append(key, value);
        body = form;
      }
      let response;
      try {
        response = await fetch(url, { method, headers, body, signal: context.signal });
      } catch (error) {
        throw new CaricatureError("DRIVER_FAILED", `AI driver "${name}" could not reach ${url}.`, error);
      }
      context.onProgress(0.8);
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new CaricatureError(
          "DRIVER_FAILED",
          `AI driver "${name}" failed with HTTP ${response.status}. ${detail.slice(0, 200)}`.trim()
        );
      }
      const output = await parseResponse(response, context);
      context.onProgress(1);
      return output;
    }
  };
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new CaricatureError("DRIVER_FAILED", "Could not encode the source image."));
    reader.readAsDataURL(blob);
  });
}
function createCustomDriver(name, handler) {
  return { name, process: handler };
}
function createReplicateDriver(options) {
  const {
    version,
    url = "https://api.replicate.com/v1/predictions",
    apiToken,
    name = "replicate",
    imageField = "image",
    pollIntervalMs = 1500,
    timeoutMs = 12e4
  } = options;
  const authHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    if (apiToken) headers.Authorization = `Token ${apiToken}`;
    return headers;
  };
  return {
    name,
    async process(input, context) {
      const image = await blobToBase64(input);
      const extra = typeof options.input === "function" ? options.input(context) : { ...options.input ?? {} };
      context.onProgress(0.15);
      const created = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        signal: context.signal,
        body: JSON.stringify({ version, input: { [imageField]: image, ...extra } })
      });
      if (!created.ok) {
        const detail = await created.text().catch(() => "");
        throw new CaricatureError("DRIVER_FAILED", `Replicate returned HTTP ${created.status}. ${detail.slice(0, 200)}`.trim());
      }
      let prediction = await created.json();
      const started = Date.now();
      while (prediction.status && !["succeeded", "failed", "canceled"].includes(prediction.status)) {
        if (Date.now() - started > timeoutMs) {
          throw new CaricatureError("DRIVER_FAILED", `Replicate prediction timed out after ${timeoutMs} ms.`);
        }
        await delay(pollIntervalMs);
        context.onProgress(Math.min(0.9, 0.2 + (Date.now() - started) / timeoutMs));
        const pollUrl = prediction.urls?.get ?? `${url.replace(/\/$/, "")}/${prediction.id ?? ""}`;
        const polled = await fetch(pollUrl, { headers: authHeaders(), signal: context.signal });
        if (!polled.ok) {
          throw new CaricatureError("DRIVER_FAILED", `Replicate polling failed with HTTP ${polled.status}.`);
        }
        prediction = await polled.json();
      }
      if (prediction.status !== "succeeded") {
        throw new CaricatureError("DRIVER_FAILED", `Replicate prediction ${prediction.status}: ${String(prediction.error ?? "")}`.trim());
      }
      const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (typeof output !== "string") {
        throw new CaricatureError("DRIVER_FAILED", "Replicate prediction returned no image URL.");
      }
      context.onProgress(1);
      return output;
    }
  };
}
function createHuggingFaceDriver(options) {
  const { model, apiToken, endpoint, name = "huggingface", parameters } = options;
  const url = endpoint ?? `https://api-inference.huggingface.co/models/${model}`;
  return {
    name,
    async process(input, context) {
      const headers = {};
      if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
      context.onProgress(0.25);
      let body = input;
      if (parameters) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ inputs: await blobToBase64(input), parameters });
      }
      const response = await fetch(url, { method: "POST", headers, body, signal: context.signal });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new CaricatureError(
          "DRIVER_FAILED",
          `HuggingFace returned HTTP ${response.status}. ${detail.slice(0, 200)}`.trim()
        );
      }
      context.onProgress(0.9);
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        const first = Array.isArray(payload) ? payload[0] : payload;
        const value = first?.image ?? first?.generated_image ?? first?.output;
        if (typeof value !== "string") {
          throw new CaricatureError("DRIVER_FAILED", "HuggingFace response contained no image.");
        }
        context.onProgress(1);
        return value.startsWith("data:") || value.startsWith("http") ? value : `data:image/png;base64,${value}`;
      }
      context.onProgress(1);
      return response.blob();
    }
  };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/segmentation.ts
async function optionalImport(specifier) {
  try {
    return await import(
      /* @vite-ignore */
      /* webpackIgnore: true */
      specifier
    );
  } catch (error) {
    throw new CaricatureError(
      "SEGMENTATION_FAILED",
      `This segmentation driver needs "${specifier}". Install it: npm i ${specifier}`,
      error
    );
  }
}
async function decodeToImageData(source) {
  const loaded = await loadSource(source, {
    validation: { maxSizeBytes: 0, acceptedTypes: [], maxSourceDimension: 0 }
  });
  return readImageData(loaded.canvas);
}
function createMediaPipeSegmentation(options = {}) {
  const {
    modelAssetPath = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
    wasmPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
    delegate = "GPU",
    name = "mediapipe-selfie"
  } = options;
  let segmenter = null;
  return {
    name,
    async segment(source) {
      if (!segmenter) {
        const vision = await optionalImport("@mediapipe/tasks-vision");
        const FilesetResolver = vision.FilesetResolver;
        const ImageSegmenter = vision.ImageSegmenter;
        const fileset = await FilesetResolver.forVisionTasks(wasmPath);
        segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: "IMAGE",
          outputCategoryMask: true,
          outputConfidenceMasks: true
        });
      }
      const result = segmenter.segment(source.canvas);
      let mask;
      const confidence = result.confidenceMasks?.[result.confidenceMasks.length - 1];
      if (confidence) {
        mask = Float32Array.from(confidence.getAsFloat32Array());
      } else if (result.categoryMask) {
        const categories = result.categoryMask.getAsUint8Array();
        mask = new Float32Array(categories.length);
        for (let i = 0; i < categories.length; i += 1) mask[i] = categories[i] > 0 ? 1 : 0;
      } else {
        throw new CaricatureError("SEGMENTATION_FAILED", "MediaPipe returned no mask.");
      }
      result.confidenceMasks?.forEach((m) => m.close?.());
      result.categoryMask?.close?.();
      result.close?.();
      return mask;
    }
  };
}
function createImglySegmentation(options = {}) {
  const { name = "imgly-background-removal", config } = options;
  return {
    name,
    async segment(source) {
      const mod = await optionalImport("@imgly/background-removal");
      const removeBackground = mod.removeBackground;
      const input = await canvasToBlob(source.canvas, "png");
      const cutout = await removeBackground(input, config);
      return decodeToImageData(cutout);
    }
  };
}
function createRemoteSegmentation(options) {
  const { url, name = "remote-segmentation", method = "POST", fieldName = "image" } = options;
  return {
    name,
    async segment(source, signal) {
      const headers = typeof options.headers === "function" ? await options.headers() : { ...options.headers ?? {} };
      const form = new FormData();
      form.append(fieldName, await canvasToBlob(source.canvas, "png"), source.fileName ?? "source.png");
      const response = await fetch(url, { method, headers, body: form, signal });
      if (!response.ok) {
        throw new CaricatureError("SEGMENTATION_FAILED", `Segmentation endpoint answered HTTP ${response.status}.`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = await response.json();
        const value = body.mask ?? body.image ?? body.output ?? body.url;
        if (typeof value !== "string") {
          throw new CaricatureError("SEGMENTATION_FAILED", "Segmentation response contained no mask field.");
        }
        return decodeToImageData(value);
      }
      return decodeToImageData(await response.blob());
    }
  };
}
function createCustomSegmentation(name, segment) {
  return { name, segment };
}



return {
  CaricatureEngine: CaricatureEngine,
  CaricatureError: CaricatureError,
  DEFAULT_CONFIG: DEFAULT_CONFIG,
  DEFAULT_VALIDATION: DEFAULT_VALIDATION,
  PRESETS: PRESETS,
  PRESET_NAMES: PRESET_NAMES,
  adaptiveThresholdMask: adaptiveThresholdMask,
  adjustColor: adjustColor,
  applyBackground: applyBackground,
  blend: blend,
  blobToDataUrl: blobToDataUrl,
  boxBlur: boxBlur,
  boxMeanPlane: boxMeanPlane,
  buildEllipseMask: buildEllipseMask,
  canvasFromImageData: canvasFromImageData,
  canvasToBlob: canvasToBlob,
  canvasToDataUrl: canvasToDataUrl,
  cloneCanvas: cloneCanvas,
  cloneImageData: cloneImageData,
  compositeInk: compositeInk,
  createCanvas: createCanvas,
  createCustomDriver: createCustomDriver,
  createCustomSegmentation: createCustomSegmentation,
  createHuggingFaceDriver: createHuggingFaceDriver,
  createImglySegmentation: createImglySegmentation,
  createMediaPipeSegmentation: createMediaPipeSegmentation,
  createRemoteAIDriver: createRemoteAIDriver,
  createRemoteSegmentation: createRemoteSegmentation,
  createReplicateDriver: createReplicateDriver,
  dataUrlToBlob: dataUrlToBlob,
  dilate: dilate,
  extensionFor: extensionFor,
  fitDimensions: fitDimensions,
  grayscalePlane: grayscalePlane,
  hysteresis: hysteresis,
  isAcceptedFile: isAcceptedFile,
  kuwahara: kuwahara,
  loadSource: loadSource,
  luma: luma,
  mimeFor: mimeFor,
  nonMaxSuppress: nonMaxSuppress,
  orientationField: orientationField,
  parseColor: parseColor,
  posterize: posterize,
  posterizeCel: posterizeCel,
  radialExaggeration: radialExaggeration,
  readImageData: readImageData,
  resampleCanvas: resampleCanvas,
  resolveConfig: resolveConfig,
  resolveValidation: resolveValidation,
  sobelGradientColor: sobelGradientColor,
  sobelMagnitude: sobelMagnitude,
  sobelMagnitudeColor: sobelMagnitudeColor,
  softenMask: softenMask,
  stylize: stylize,
  toGrayscale: toGrayscale,
  toMask: toMask,
  toonify: toonify,
  toonifyToDataUrl: toonifyToDataUrl,
  validateBlob: validateBlob,
  validateDimensions: validateDimensions
};
});
