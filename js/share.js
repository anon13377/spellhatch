// Card W1-G: share links (LZ-compressed list in the URL hash) and QR codes. Pure except renderQR.
import { LZ } from "../vendor/lz-string.mjs";
import qrcode from "../vendor/qrcode.mjs";
import { CONFIG } from "../data/config.js";

const WORD_RE = /^[a-z]+(?:['-][a-z]+)*$/;
const MAX_WORD_LEN = 30;
const MAX_WORDS = 300;

function words(list) {
  return (list && Array.isArray(list.words) ? list.words : []).map((x) => (typeof x === "string" ? { w: x, star: false } : x || {}));
}

/** @returns {string} "#l=<payload>" */
export function encodeList(list) {
  const ws = words(list);
  const s = [];
  ws.forEach((x, i) => { if (x.star) s.push(i); });
  const body = { v: 1, t: String((list && list.title) || ""), g: list && list.lang === "en-GB" ? "en-GB" : "en-US", w: ws.map((x) => String(x.w || "")), s };
  return "#l=" + LZ.compressToEncodedURIComponent(JSON.stringify(body));
}

// FNV-1a 32 bit, hex. Stable across runs, so the same link twice gives the same id.
function hashId(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "s_" + h.toString(16).padStart(8, "0");
}

/** Accepts with or without the leading "#". @returns {object|null} List */
export function decodeList(hash) {
  try {
    if (typeof hash !== "string") return null;
    let h = hash.trim();
    const hi = h.indexOf("#");
    if (hi >= 0) h = h.slice(hi + 1);
    let payload = null;
    for (const part of h.split("&")) {
      if (part.startsWith("l=")) { payload = part.slice(2); break; }
    }
    if (!payload) return null;
    const json = LZ.decompressFromEncodedURIComponent(payload);
    if (!json) return null;
    const o = JSON.parse(json);
    if (!o || typeof o !== "object" || !Array.isArray(o.w)) return null;
    const stars = new Set(Array.isArray(o.s) ? o.s.filter((n) => Number.isInteger(n)) : []);
    const seen = new Map();
    const out = [];
    o.w.forEach((raw, i) => {
      if (typeof raw !== "string") return;
      const w = raw.trim().toLowerCase();
      if (w.length > MAX_WORD_LEN || !WORD_RE.test(w)) return;
      if (seen.has(w)) { if (stars.has(i)) seen.get(w).star = true; return; }
      if (out.length >= MAX_WORDS) return;
      const entry = { w, star: stars.has(i) };
      seen.set(w, entry);
      out.push(entry);
    });
    if (!out.length) return null;
    let title = typeof o.t === "string" ? o.t.replace(/\s+/g, " ").trim().slice(0, 40).trim() : "";
    if (!title) title = "Shared list";
    return { id: hashId(payload), title, lang: o.g === "en-GB" ? "en-GB" : "en-US", words: out, testDate: null, source: "shared", eggId: "" };
  } catch {
    return null;
  }
}

/** @returns {{ok:boolean, reason?:"too_long"}} */
export function renderQR(el, url) {
  const doc = el.ownerDocument;
  while (el.firstChild) el.removeChild(el.firstChild);
  const text = String(url == null ? "" : url);
  if (text.length > CONFIG.share.qrMaxUrlLength) {
    const p = doc.createElement("p");
    p.className = "qr-too-long";
    p.setAttribute("role", "status");
    p.textContent = "This list is too long for a QR code. Please use the link instead.";
    el.appendChild(p);
    return { ok: false, reason: "too_long" };
  }
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const total = n + quiet * 2;
  const avail = el.clientWidth || 0;
  const target = avail >= 200 ? Math.min(avail, 360) : (avail > 0 ? avail : 240);
  const size = Math.max(Math.min(target, 360), avail > 0 && avail < 200 ? avail : 200);
  const NS = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${total} ${total}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR code for this word list. Scan it with a camera to open the list.");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.style.maxWidth = "100%";
  svg.style.height = "auto";
  const bg = doc.createElementNS(NS, "rect");
  bg.setAttribute("width", String(total));
  bg.setAttribute("height", String(total));
  bg.setAttribute("fill", "#ffffff");
  svg.appendChild(bg);
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  const path = doc.createElementNS(NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#000000");
  svg.appendChild(path);
  el.appendChild(svg);
  return { ok: true };
}
