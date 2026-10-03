// Multiple Choice (card W1-E). Hear the word, pick the right spelling out of 4.
import { CONFIG } from "../../data/config.js";
import { makeDistractors } from "../distractors.js";

export const meta = { id: "choice", title: "Multiple Choice", icon: "list", batch: false };

/** Keeps all words. @param {object[]} words @returns {object[]} */
export function eligible(words) { return (words || []).filter((x) => x && typeof x.w === "string" && x.w.length > 0); }

function rng(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const r = rng(seed + 7919), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Build exactly 4 unique options: the word plus 3 distractors. */
function buildOptions(word, seed) {
  const want = (CONFIG.round.choiceOptions || 4) - 1;
  const out = [word];
  const seen = new Set([word.toLowerCase()]);
  let ds = [];
  try { ds = makeDistractors(word, want, seed) || []; } catch { ds = []; }
  for (const d of ds) { if (typeof d === "string" && d && !seen.has(d.toLowerCase())) { seen.add(d.toLowerCase()); out.push(d); } }
  // last resort padding so there are always 4 options
  const pads = ["e", "a", "i", "o", "u", "s", "r"];
  for (let k = 0; out.length < want + 1 && k < 60; k++) {
    const p = pads[k % pads.length];
    const pos = (seed + k) % (word.length + 1);
    const cand = word.slice(0, pos) + p + word.slice(pos);
    if (!seen.has(cand.toLowerCase())) { seen.add(cand.toLowerCase()); out.push(cand); }
  }
  return out;
}

/** @param {HTMLElement} el @param {object} ctx ModeCtx @returns {{destroy:Function}} */
export function mount(el, ctx) {
  const word = ctx.words[0];
  const target = word.w;
  const options = shuffle(buildOptions(target, ctx.seed || 0), ctx.seed || 0);
  const timers = new Set();
  const startedAt = Date.now();
  let misses = 0, hintsUsed = 0, finished = false, destroyed = false;
  let lastTapAt = 0, lastTapEl = null;

  const root = document.createElement("div");
  root.className = "choice-root";
  const clue = ctx.silent
    ? (word.emoji
      ? `<img class="choice-pic" src="./assets/emoji/${word.emoji}.svg" alt="" draggable="false">`
      : `<p class="choice-def"></p>`)
    : "";
  root.innerHTML = `
    <div class="choice-top">
      ${ctx.silent ? "" : `<button type="button" class="speaker choice-speaker" aria-label="Hear the word again">\u{1F50A}</button>`}
      ${clue}
      <p class="choice-prompt">${ctx.silent ? "Which spelling is right?" : "Tap the right spelling"}</p>
    </div>
    <div class="choice-options" role="group" aria-label="Spelling choices"></div>
    <div class="choice-bar"><button type="button" class="btn choice-hint" aria-label="Hint: remove one wrong choice">Hint (${CONFIG.coins.hintCost})</button></div>
    <p class="choice-cheer" aria-live="polite"></p>`;
  const defEl = root.querySelector(".choice-def");
  if (defEl) defEl.textContent = word.def || `Find the word with ${target.replace(/[^a-z]/gi, "").length} letters`;
  const optsEl = root.querySelector(".choice-options");
  options.forEach((o) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice-option";
    b.dataset.value = o;
    b.setAttribute("aria-label", `Spelling: ${o}`);
    b.textContent = o;
    optsEl.appendChild(b);
  });
  el.appendChild(root);

  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms); timers.add(t); };
  const shake = (node) => { node.classList.remove("shake"); void node.offsetWidth; node.classList.add("shake"); later(() => node.classList.remove("shake"), 360); };
  const cheer = root.querySelector(".choice-cheer");

  function pick(btn) {
    if (finished || btn.disabled) return;
    if (btn.dataset.value === target) {
      finished = true;
      btn.classList.add("choice-right", "pop");
      root.querySelectorAll(".choice-option").forEach((b) => { if (b !== btn) b.disabled = true; });
      root.querySelector(".choice-hint").disabled = true;
      cheer.textContent = "Great job!";
      ctx.onResult({ w: target, misses, hintsUsed, skipped: false, ms: Date.now() - startedAt, correct: true });
      later(() => ctx.onDone(), 600);
    } else {
      misses += 1;
      btn.disabled = true;
      btn.classList.add("choice-wrong");
      shake(btn);
    }
  }

  function hint() {
    if (finished) return;
    const hintBtn = root.querySelector(".choice-hint");
    const wrongLeft = [...root.querySelectorAll(".choice-option")].filter((b) => !b.disabled && b.dataset.value !== target);
    if (wrongLeft.length === 0) { shake(hintBtn); return; }
    if (!ctx.spendCoins(CONFIG.coins.hintCost)) { shake(hintBtn); return; }
    hintsUsed += 1;
    const b = wrongLeft[0];
    b.disabled = true;
    b.classList.add("choice-removed");
  }

  function onClick(ev) {
    const t = ev.target.closest("button");
    if (!t || !root.contains(t)) return;
    const now = Date.now();
    if (t === lastTapEl && now - lastTapAt < 100) return;
    lastTapEl = t; lastTapAt = now;
    if (t.classList.contains("choice-option")) pick(t);
    else if (t.classList.contains("choice-hint")) hint();
    else if (t.classList.contains("choice-speaker")) { if (!ctx.silent) ctx.speak(target); }
  }
  root.addEventListener("mousedown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
  root.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest("button")) ev.preventDefault(); });
  root.addEventListener("keyup", (ev) => { if (ev.key === " " && ev.target.closest("button")) ev.preventDefault(); });
  root.addEventListener("click", onClick);

  if (!ctx.silent) ctx.speak(target);

  return {
    destroy() {
      destroyed = true;
      timers.forEach(clearTimeout); timers.clear();
      root.removeEventListener("click", onClick);
      root.remove();
    }
  };
}
