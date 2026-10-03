// Fill the Gap (card W1-E). The word shows with blanks; tap letter tiles to fill them left to right.
import { CONFIG } from "../../data/config.js";
import { pickGaps, decoyLetters } from "../distractors.js";

export const meta = { id: "gap", title: "Fill the Gap", icon: "gap", batch: false };

const letterCount = (w) => [...String(w)].filter((c) => /[a-z]/i.test(c)).length;

/** Keeps words with at least 3 letters. @param {object[]} words @returns {object[]} */
export function eligible(words) { return (words || []).filter((x) => x && typeof x.w === "string" && letterCount(x.w) >= 3); }

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
  const r = rng(seed + 104729), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** @param {HTMLElement} el @param {object} ctx ModeCtx @returns {{destroy:Function}} */
export function mount(el, ctx) {
  const word = ctx.words[0];
  const target = word.w;
  const seed = ctx.seed || 0;
  const gaps = pickGaps(target, seed).slice().sort((a, b) => a - b);
  const gapSet = new Set(gaps);
  const decoys = decoyLetters(target, gaps, 3, seed);
  const trayLetters = shuffle([...gaps.map((i) => target[i]), ...decoys], seed);
  const timers = new Set();
  const startedAt = Date.now();
  let misses = 0, hintsUsed = 0, filled = 0, finished = false, destroyed = false;
  let lastTapAt = 0, lastTapEl = null;

  const root = document.createElement("div");
  root.className = "gap-root";
  const clue = ctx.silent
    ? (word.emoji
      ? `<img class="gap-pic" src="./assets/emoji/${word.emoji}.svg" alt="" draggable="false">`
      : `<p class="gap-def"></p>`)
    : "";
  root.innerHTML = `
    <div class="gap-top">
      ${ctx.silent ? "" : `<button type="button" class="speaker gap-speaker" aria-label="Hear the word again">\u{1F50A}</button>`}
      ${clue}
    </div>
    <div class="gap-word" role="group" aria-label="The word with missing letters"></div>
    <p class="gap-prompt">Tap the missing letters</p>
    <div class="gap-tray" role="group" aria-label="Letter tiles"></div>
    <div class="gap-bar"><button type="button" class="btn gap-hint" aria-label="Hint: fill the next letter">Hint (${CONFIG.coins.hintCost})</button></div>
    <p class="gap-cheer" aria-live="polite"></p>`;
  const defEl = root.querySelector(".gap-def");
  if (defEl) defEl.textContent = word.def || `Find the word with ${letterCount(target)} letters`;

  const wordEl = root.querySelector(".gap-word");
  const cells = [];
  [...target].forEach((ch, i) => {
    const c = document.createElement("span");
    c.dataset.index = String(i);
    if (gapSet.has(i)) {
      c.className = "gap-cell gap-blank";
      c.setAttribute("aria-label", "blank");
    } else {
      c.className = "gap-cell gap-fixed";
      c.textContent = ch;
    }
    wordEl.appendChild(c);
    cells.push(c);
  });

  const trayEl = root.querySelector(".gap-tray");
  const tiles = trayLetters.map((ch) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tile gap-tile";
    b.dataset.letter = ch;
    b.setAttribute("aria-label", `Letter ${ch}`);
    b.textContent = ch;
    trayEl.appendChild(b);
    return b;
  });
  el.appendChild(root);

  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms); timers.add(t); };
  const shake = (node) => { node.classList.remove("shake"); void node.offsetWidth; node.classList.add("shake"); later(() => node.classList.remove("shake"), 360); };
  const cheer = root.querySelector(".gap-cheer");

  function markNext() {
    cells.forEach((c) => c.classList.remove("gap-next"));
    if (filled < gaps.length) cells[gaps[filled]].classList.add("gap-next");
  }
  markNext();

  function fillNext() {
    const idx = gaps[filled];
    const c = cells[idx];
    c.textContent = target[idx];
    c.classList.remove("gap-blank", "gap-next");
    c.classList.add("gap-done", "pop");
    c.removeAttribute("aria-label");
    filled += 1;
    if (filled >= gaps.length) {
      finished = true;
      wordEl.classList.add("gap-complete");
      cells.forEach((x) => x.classList.add("gap-all-good"));
      root.querySelector(".gap-hint").disabled = true;
      tiles.forEach((t) => { t.disabled = true; });
      cheer.textContent = "Great job!";
      ctx.onResult({ w: target, misses, hintsUsed, skipped: false, ms: Date.now() - startedAt, correct: true });
      later(() => ctx.onDone(), 600);
    } else {
      markNext();
    }
  }

  const useTile = (t) => { t.disabled = true; t.classList.add("gap-used"); };

  function tapTile(t) {
    if (finished || t.disabled) return;
    if (t.dataset.letter === target[gaps[filled]]) {
      useTile(t);
      fillNext();
    } else {
      misses += 1;
      t.classList.add("bad");
      shake(t);
      later(() => t.classList.remove("bad"), 450);
    }
  }

  function hint() {
    if (finished) return;
    const hintBtn = root.querySelector(".gap-hint");
    if (!ctx.spendCoins(CONFIG.coins.hintCost)) { shake(hintBtn); return; }
    hintsUsed += 1;
    const letter = target[gaps[filled]];
    const t = tiles.find((x) => !x.disabled && x.dataset.letter === letter);
    if (t) useTile(t);
    fillNext();
  }

  function onClick(ev) {
    const t = ev.target.closest("button");
    if (!t || !root.contains(t)) return;
    const now = Date.now();
    if (t === lastTapEl && now - lastTapAt < 100) return;
    lastTapEl = t; lastTapAt = now;
    if (t.classList.contains("gap-tile")) tapTile(t);
    else if (t.classList.contains("gap-hint")) hint();
    else if (t.classList.contains("gap-speaker")) { if (!ctx.silent) ctx.speak(target); }
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
