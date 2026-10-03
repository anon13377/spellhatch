// Matching and Hear and Match (card W1-E). Batch mode: up to 6 words on one screen.
import { CONFIG } from "../../data/config.js";

export const meta = { id: "matching", title: "Matching", icon: "puzzle", batch: true };

/** Keeps words that have an emoji. @param {object[]} words @returns {object[]} */
export function eligible(words) { return (words || []).filter((x) => x && typeof x.w === "string" && x.w && x.emoji); }

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
  const r = rng(seed), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** round.js must pass eligible() words only (those with an emoji); a word without one is filtered out and never reported.
 * @param {HTMLElement} el @param {object} ctx ModeCtx @returns {{destroy:Function}} */
export function mount(el, ctx) {
  const hear = !!ctx.hearMode;
  const max = CONFIG.round.matchingBatch || 6;
  const src = (ctx.words || []).filter((x) => x && x.w).slice(0, max);
  const items = (hear ? src : src.filter((x) => x.emoji)).map((x, i) => ({
    i, w: x.w, emoji: x.emoji, def: x.def, misses: 0, hintsUsed: 0, matched: false, t0: 0
  }));
  const seed = ctx.seed || 0;
  const timers = new Set();
  const startedAt = Date.now();
  let lastDoneAt = startedAt;
  let remaining = items.length;
  let selected = null;          // item selected in normal mode
  let awaiting = false;         // hear mode: true between a right pick and the next spoken word
  let destroyed = false;
  let lastTapAt = 0, lastTapEl = null;

  const root = document.createElement("div");
  root.className = "matching-root" + (hear ? " matching-hear" : "");
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms); timers.add(t); };
  const shake = (node) => { node.classList.remove("shake"); void node.offsetWidth; node.classList.add("shake"); later(() => node.classList.remove("shake"), 360); };
  const picSrc = (hex) => `./assets/emoji/${hex}.svg`;

  const hintHtml = `<div class="matching-bar"><button type="button" class="btn matching-hint" aria-label="Hint: show one correct match">Hint (${CONFIG.coins.hintCost})</button></div>`;
  const cheerHtml = `<p class="matching-cheer" aria-live="polite"></p>`;

  const wordOrder = hear ? shuffle(items, seed + 1) : items;       // word cards
  const hearOrder = hear ? shuffle(items, seed + 31) : [];          // targets
  const picOrder = hear ? [] : shuffle(items, seed + 17);           // picture cards

  function wordCard(it) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "matching-card matching-word";
    b.dataset.i = String(it.i);
    b.setAttribute("aria-label", `Word: ${it.w}`);
    b.textContent = it.w;
    return b;
  }

  if (hear) {
    root.innerHTML = `
      <div class="matching-top">
        ${ctx.silent ? "" : `<button type="button" class="speaker matching-speaker" aria-label="Hear the word">\u{1F50A}</button>`}
        <div class="matching-clue"></div>
        <p class="matching-prompt">Tap the word you hear</p>
      </div>
      <div class="matching-wordgrid" role="group" aria-label="Words"></div>
      ${hintHtml}${cheerHtml}`;
    const grid = root.querySelector(".matching-wordgrid");
    wordOrder.forEach((it) => grid.appendChild(wordCard(it)));
  } else {
    root.innerHTML = `
      <p class="matching-prompt">Tap a word, then tap its picture</p>
      <div class="matching-cols">
        <div class="matching-col matching-words" role="group" aria-label="Words"></div>
        <div class="matching-col matching-pics" role="group" aria-label="Pictures"></div>
      </div>
      ${hintHtml}${cheerHtml}`;
    const wc = root.querySelector(".matching-words"), pc = root.querySelector(".matching-pics");
    items.forEach((it) => wc.appendChild(wordCard(it)));
    picOrder.forEach((it, n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "matching-card matching-pic";
      b.dataset.i = String(it.i);
      b.dataset.hex = it.emoji;
      b.setAttribute("aria-label", `Picture ${n + 1}`);
      const img = document.createElement("img");
      img.src = picSrc(it.emoji); img.alt = ""; img.draggable = false;
      b.appendChild(img);
      pc.appendChild(b);
    });
  }
  el.appendChild(root);

  const cheer = root.querySelector(".matching-cheer");
  const wordBtn = (it) => root.querySelector(`.matching-word[data-i="${it.i}"]`);
  const hintBtn = root.querySelector(".matching-hint");

  function report(it) {
    const now = Date.now();
    ctx.onResult({ w: it.w, misses: it.misses, hintsUsed: it.hintsUsed, skipped: false, ms: now - lastDoneAt, correct: true });
    lastDoneAt = now;
    remaining -= 1;
    if (remaining <= 0) {
      cheer.textContent = "You matched them all!";
      hintBtn.disabled = true;
      later(() => ctx.onDone(), 600);
    }
  }

  // ----- normal mode -----
  function pickWord(it, node) {
    if (it.matched) return;
    root.querySelectorAll(".matching-word.matching-selected").forEach((n) => n.classList.remove("matching-selected"));
    selected = it;
    node.classList.add("matching-selected");
    if (!ctx.silent) ctx.speak(it.w);
  }
  function pickPic(node) {
    if (node.classList.contains("matching-locked")) return;
    if (!selected) { shake(node); return; }
    const it = selected;
    if (node.dataset.hex === it.emoji) {
      const wn = wordBtn(it);
      it.matched = true; selected = null;
      [wn, node].forEach((n) => { n.classList.remove("matching-selected", "matching-flash"); n.classList.add("matching-locked", "pop"); n.disabled = true; });
      report(it);
    } else {
      it.misses += 1;
      const wn = wordBtn(it);
      selected = null;
      wn.classList.remove("matching-selected");
      node.classList.add("matching-wrong");
      wn.classList.add("matching-wrong");
      shake(node); shake(wn);
      later(() => { node.classList.remove("matching-wrong"); wn.classList.remove("matching-wrong"); }, 450);
    }
  }

  // ----- hear mode -----
  const target = () => hearOrder.filter((x) => !x.matched)[0] || null;
  function announce() {
    awaiting = false;
    const it = target();
    const clue = root.querySelector(".matching-clue");
    if (!it) { clue.innerHTML = ""; return; }
    if (ctx.silent) {
      clue.innerHTML = "";
      if (it.emoji) {
        const img = document.createElement("img");
        img.className = "matching-cluepic"; img.src = picSrc(it.emoji); img.alt = ""; img.draggable = false;
        clue.appendChild(img);
      } else if (it.def) {
        const p = document.createElement("p"); p.className = "matching-def"; p.textContent = it.def; clue.appendChild(p);
      } else {
        const p = document.createElement("p"); p.className = "matching-def"; p.textContent = `${it.w.length} letters`; clue.appendChild(p);
      }
    } else {
      ctx.speak(it.w);
    }
  }
  function pickHear(it, node) {
    const t = target();
    if (!t || it.matched || awaiting) return;
    if (it === t) {
      it.matched = true;
      node.classList.remove("matching-flash");
      node.classList.add("matching-locked", "pop");
      node.disabled = true;
      report(it);
      if (remaining > 0) { awaiting = true; later(announce, 500); } else root.querySelector(".matching-clue").innerHTML = "";
    } else {
      t.misses += 1;
      node.classList.add("matching-wrong");
      shake(node);
      later(() => node.classList.remove("matching-wrong"), 450);
    }
  }

  function hint() {
    if (remaining <= 0) return;
    const it = hear ? target() : ((selected && !selected.matched) ? selected : items.find((x) => !x.matched));
    if (!it) return;
    if (!ctx.spendCoins(CONFIG.coins.hintCost)) { shake(hintBtn); return; }
    it.hintsUsed += 1;
    const nodes = [wordBtn(it)];
    if (!hear) nodes.push(root.querySelector(`.matching-pic[data-hex="${it.emoji}"]:not(.matching-locked)`));
    nodes.filter(Boolean).forEach((n) => n.classList.add("matching-flash"));
    later(() => nodes.filter(Boolean).forEach((n) => n.classList.remove("matching-flash")), 1600);
  }

  function onClick(ev) {
    const t = ev.target.closest("button");
    if (!t || !root.contains(t) || t.disabled) return;
    const now = Date.now();
    if (t === lastTapEl && now - lastTapAt < 100) return;
    lastTapEl = t; lastTapAt = now;
    if (t.classList.contains("matching-hint")) return hint();
    if (t.classList.contains("matching-speaker")) {
      const it = target();
      if (it && !ctx.silent) ctx.speak(it.w);
      return;
    }
    const it = items[Number(t.dataset.i)];
    if (!it) return;
    if (t.classList.contains("matching-word")) {
      if (hear) pickHear(it, t); else pickWord(it, t);
    } else if (t.classList.contains("matching-pic")) {
      pickPic(t);
    }
  }
  root.addEventListener("mousedown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
  root.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest("button")) ev.preventDefault(); });
  root.addEventListener("keyup", (ev) => { if (ev.key === " " && ev.target.closest("button")) ev.preventDefault(); });
  root.addEventListener("click", onClick);

  if (!items.length) later(() => ctx.onDone(), 0);
  else if (hear) announce();

  return {
    destroy() {
      destroyed = true;
      timers.forEach(clearTimeout); timers.clear();
      root.removeEventListener("click", onClick);
      root.remove();
    }
  };
}
