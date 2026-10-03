// Card W1-G: photo to word list. Tesseract.js loads from jsdelivr only when a scan starts.
import { CONFIG } from "../data/config.js";

/** Pure. @returns {string[]} */
export function cleanWords(rawText) {
  const text = String(rawText == null ? "" : rawText).replace(/[‘’ʼ`]/g, "'");
  const out = [];
  const seen = new Set();
  for (const tok of text.replace(/[^A-Za-z'-]+/g, " ").split(" ")) {
    const w = tok.replace(/^['-]+|['-]+$/g, "").toLowerCase();
    if (w.length < 2 || !/^[a-z][a-z'-]*$/.test(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

const FRIENDLY = "Could not read the photo. Try a brighter, flatter picture, or type the words.";

async function readSize(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}

async function toGrayCanvas(file) {
  let bmp = null, w = 0, h = 0;
  try {
    const size = await readSize(file);
    const scale = Math.min(1, CONFIG.ocr.maxEdgePx / Math.max(size.w, size.h));
    w = Math.max(1, Math.round(size.w * scale));
    h = Math.max(1, Math.round(size.h * scale));
    bmp = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
  } catch { bmp = null; }
  if (!bmp) {
    bmp = await createImageBitmap(file);
    const scale = Math.min(1, CONFIG.ocr.maxEdgePx / Math.max(bmp.width, bmp.height));
    w = Math.max(1, Math.round(bmp.width * scale));
    h = Math.max(1, Math.round(bmp.height * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Loading stages fill 0 to 0.5 of the bar, recognizing fills 0.5 to 1.
const LOAD_STAGES = ["loading tesseract core", "initializing tesseract", "loading language traineddata", "initializing api"];

/** @returns {Promise<{words:string[], rawText:string}>} */
export async function scanImage(file, onProgress) {
  const report = (p) => { try { if (typeof onProgress === "function") onProgress(Math.max(0, Math.min(1, p))); } catch { /* ignore */ } };
  let worker = null, canvas = null, last = 0;
  const mono = (p) => { last = Math.max(last, p); report(last); };
  try {
    report(0);
    canvas = await toGrayCanvas(file);
    const mod = await import("https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js");
    const T = mod.default || mod;
    worker = await T.createWorker("eng", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
      langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
      logger: (m) => {
        if (!m || typeof m.progress !== "number") return;
        if (m.status === "recognizing text") { mono(0.5 + m.progress / 2); return; }
        const i = LOAD_STAGES.indexOf(m.status);
        if (i >= 0) mono(0.5 * (i + m.progress) / LOAD_STAGES.length);
      }
    });
    const res = await worker.recognize(canvas);
    const text = (res && res.data && res.data.text) || "";
    mono(1);
    return { words: cleanWords(text), rawText: text };
  } catch (e) {
    throw new Error(FRIENDLY, { cause: e });
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (worker) { try { await worker.terminate(); } catch { /* ignore */ } }
  }
}
