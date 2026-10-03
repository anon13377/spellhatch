// Small DOM helpers shared by the screens (card W2). No framework.
import { speak } from "../speech.js";
import { CREATURES, creatureSrc } from "../../assets/creatures/creatures.js";
import { currentProfile } from "./state.js";

/** h("div.card", {onclick}, child, "text") */
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className += (el.className ? " " : "") + v;
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const ICON = {
  speaker: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  flame: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 2 1 3 2 3.2C11 8 11 5 12 2z" fill="#ff7a29"/><path d="M12 13c1.4 1.3 2.5 2.3 2.5 4a2.5 2.5 0 0 1-5 0c0-1.4.9-2.3 2.5-4z" fill="#ffd166"/></svg>',
  coin: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="#ffb020" stroke="#d98a00" stroke-width="1.6"/><circle cx="12" cy="12" r="6" fill="none" stroke="#fff3c4" stroke-width="1.6"/></svg>',
  skip: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M5 5l8 7-8 7zM13 5l8 7-8 7z" fill="currentColor"/></svg>'
};

/** Big round speaker that reads `text` (string or function). */
export function speakerBtn(text, label = "Read it to me", cls = "") {
  return h("button.speaker.sh-speak" + (cls ? "." + cls : ""), {
    type: "button", "aria-label": label, html: ICON.speaker,
    onclick: (e) => { e.stopPropagation(); say(typeof text === "function" ? text() : text); }
  });
}

/** Speak with the current player's voice. Silent mode still speaks screen labels only when asked by a tap. */
export function say(text) {
  const p = currentProfile();
  const lang = (p && p.settings && p.settings.voice) || "en-US";
  return speak(text, { lang });
}

export function creatureName(id) {
  const c = CREATURES.find((x) => x.id === id);
  return c ? c.name : "Buddy";
}
export function creatureImg(id, state, cls = "") {
  return h("img.creature-img" + (cls ? "." + cls : ""), { src: creatureSrc(id, state), alt: state === "egg" ? "An egg" : creatureName(id), draggable: "false" });
}

// Avatars: Twemoji pictures already bundled in assets/emoji (no typing needed).
export const AVATARS = [
  ["fox", "1f98a"], ["cat", "1f431"], ["dog", "1f415"], ["owl", "1f989"], ["frog", "1f438"], ["panda", "1f43c"],
  ["tiger", "1f42f"], ["rabbit", "1f407"], ["bear", "1f43b"], ["penguin", "1f427"], ["unicorn", "1f984"], ["monkey", "1f412"],
  ["koala", "1f428"], ["octopus", "1f419"], ["dinosaur", "1f996"], ["dragon", "1f409"], ["bee", "1f41d"], ["butterfly", "1f98b"],
  ["whale", "1f433"], ["rocket", "1f680"]
];
export function avatarImg(avatar, cls = "") {
  const hex = (AVATARS.find((a) => a[0] === avatar) || AVATARS[0])[1];
  return h("img.avatar-img" + (cls ? "." + cls : ""), { src: "./assets/emoji/" + hex + ".svg", alt: "", draggable: "false" });
}

/** Toast at the bottom of the screen. */
export function toast(msg, kind = "") {
  const old = document.querySelector(".sh-toast");
  if (old) old.remove();
  const t = h("div.sh-toast" + (kind ? ".sh-toast-" + kind : ""), { role: "status", dataset: { t: String(Date.now()) } }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("sh-toast-out"), 3200);
  setTimeout(() => t.remove(), 3700);
}

/** Simple modal dialog. buttons: [{label, kind, value}]. Resolves with the chosen value (or null). */
export function dialog({ title, body, buttons }) {
  return new Promise((resolve) => {
    const back = h("div.sh-modal-back", { role: "presentation" });
    const box = h("div.sh-modal.card", { role: "dialog", "aria-modal": "true", "aria-label": title || "Message" });
    if (title) box.appendChild(h("h2.subtitle", title));
    if (body) box.appendChild(body instanceof Node ? body : h("p", body));
    const row = h("div.sh-modal-actions");
    const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    for (const b of buttons || [{ label: "OK", kind: "primary", value: true }]) {
      row.appendChild(h("button.btn" + (b.kind ? ".btn-" + b.kind : ""), { type: "button", onclick: () => close(b.value) }, b.label));
    }
    box.appendChild(row);
    back.appendChild(box);
    back.addEventListener("click", (e) => { if (e.target === back) close(null); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    const first = row.querySelector(".btn-primary, .btn-danger") || row.querySelector("button");
    if (first) first.focus();
  });
}

/**
 * Press and hold for `ms` (with a progress ring) to fire onDone. Used for the grown-ups gear.
 * Pointer, touch and keyboard (hold Enter or Space) all work.
 */
export function holdButton({ label, ms = 2000, onDone, html }) {
  const btn = h("button.sh-hold", { type: "button", "aria-label": label, html: '<span class="sh-hold-ring"></span>' + (html || ICON.gear) });
  let start = 0, raf = 0, fired = false;
  const set = (p) => btn.style.setProperty("--p", String(p));
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / ms);
    set(p);
    if (p >= 1) { fired = true; stop(false); onDone(); return; }
    raf = requestAnimationFrame(tick);
  };
  const begin = (e) => {
    if (e) e.preventDefault();
    if (start) return;
    fired = false; start = performance.now(); btn.classList.add("sh-holding");
    raf = requestAnimationFrame(tick);
  };
  const stop = (showTip = true) => {
    const held = start ? performance.now() - start : 0;
    cancelAnimationFrame(raf); start = 0; set(0); btn.classList.remove("sh-holding");
    if (showTip && !fired && held < ms) {
      btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake");
      toast("Grown-ups: press and hold the gear for 2 seconds.");
    }
  };
  btn.addEventListener("pointerdown", begin);
  btn.addEventListener("pointerup", () => stop(true));
  btn.addEventListener("pointerleave", () => { if (start) stop(false); });
  btn.addEventListener("pointercancel", () => stop(false));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) begin(e); else if (e.key === "Enter" || e.key === " ") e.preventDefault(); });
  btn.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stop(true); } });
  btn.addEventListener("click", (e) => e.preventDefault());
  return btn;
}

/** Count a number up inside el. Resolves when done. */
export function countUp(el, from, to, ms = 700) {
  return new Promise((resolve) => {
    if (reducedMotion() || to === from) { el.textContent = String(to); return resolve(); }
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}
export function reducedMotion() {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
export const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 60) : ms));

// ---------- tiny sound effects (Web Audio, no files) ----------
let audio = null;
export function sfx(kind) {
  const p = currentProfile();
  if (p && p.settings && p.settings.sfx === false) return;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === "suspended") audio.resume();
    const notes = { good: [660, 880], tap: [520], hatch: [523, 659, 784, 1047], level: [440, 554, 659, 880], coin: [988, 1319] }[kind] || [600];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      const t = audio.currentTime + i * 0.09;
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.25);
    });
  } catch { /* sound is optional */ }
}

/** "Test in 3 days", "Test today!", "Test tomorrow", or "" (past or none). */
export function testCountdown(testDate, todayIso) {
  if (!testDate) return "";
  const d = Math.round((Date.parse(testDate + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / 86400000);
  if (Number.isNaN(d) || d < 0) return "";
  if (d === 0) return "Test today!";
  if (d === 1) return "Test tomorrow";
  return "Test in " + d + " days";
}
