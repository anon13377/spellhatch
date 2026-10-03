// Spell Hatch Build It (W1-D). Every letter is a tile; tap the tiles in spelling order.
import { CONFIG } from "../../data/config.js";

export const meta = { id: "build", title: "Build It", icon: "blocks", batch: false };

const FIXED = /[^a-z]/;   // apostrophes and hyphens are pre-filled, never tiles
const DONE_MS = 520;

const SPEAKER_SVG = '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** Keeps words with at least 2 distinct letters. @param {object[]} words @returns {object[]} */
export function eligible(words) {
  if (!Array.isArray(words)) return [];
  return words.filter((x) => {
    const letters = [...String((x && x.w) || "").toLowerCase()].filter((c) => !FIXED.test(c));
    return new Set(letters).size >= 2;
  });
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Seeded shuffle of the word's letters that is never equal to the correct order.
function shuffleLetters(letters, seed, salt) {
  const rnd = mulberry32((Number(seed) || 0) * 7919 + hashStr(salt));
  const target = letters.join("");
  let out = letters.slice();
  for (let attempt = 0; attempt < 40; attempt++) {
    out = letters.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.join("") !== target) return out;
  }
  // Fallback (needs 2 distinct letters): swap the first two different letters.
  out = letters.slice();
  for (let i = 1; i < out.length; i++) {
    if (out[i] !== out[0]) { [out[0], out[i]] = [out[i], out[0]]; break; }
  }
  return out;
}

/** @param {HTMLElement} el @param {object} ctx ModeCtx @returns {{destroy:Function}} */
export function mount(el, ctx) {
  const doc = el.ownerDocument;
  const entry = ctx.words[0];
  const word = String(entry.w).toLowerCase();
  const chars = [...word];
  const letters = chars.filter((c) => !FIXED.test(c));
  const timers = new Set();
  const t0 = Date.now();
  let alive = true;
  let finished = false;
  let misses = 0;
  let hintsUsed = 0;
  let coinsLeft = Number(ctx.coins) || 0;

  const root = doc.createElement("div");
  root.className = "build-root";

  const clue = doc.createElement("div");
  clue.className = "build-clue";
  let speakBtn = null;
  if (!ctx.silent) {
    speakBtn = doc.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "speaker build-speaker";
    speakBtn.setAttribute("aria-label", "Hear the word again");
    speakBtn.innerHTML = SPEAKER_SVG;
    clue.appendChild(speakBtn);
  } else {
    if (entry.emoji) {
      const img = doc.createElement("img");
      img.className = "build-pic";
      img.alt = "Picture clue";
      img.src = "./assets/emoji/" + entry.emoji + ".svg";
      img.addEventListener("error", () => { img.remove(); });
      clue.appendChild(img);
    }
    if (entry.def || !entry.emoji) {
      const d = doc.createElement("p");
      d.className = "build-def";
      d.textContent = entry.def || "Silent mode: build the word you see in your mind.";
      clue.appendChild(d);
    }
  }
  root.appendChild(clue);

  // answer slots
  const slotsEl = doc.createElement("div");
  slotsEl.className = "build-slots";
  slotsEl.setAttribute("aria-label", "Answer, " + letters.length + " letters");
  const slots = chars.map((ch) => {
    const s = doc.createElement("div");
    const fixed = FIXED.test(ch);
    s.className = "tile build-slot " + (fixed ? "fixed build-fixed" : "slot");
    if (fixed) s.textContent = ch;
    slotsEl.appendChild(s);
    return { ch, fixed, el: s, tile: null };
  });
  const letterSlots = slots.filter((s) => !s.fixed);
  root.appendChild(slotsEl);

  // tray of shuffled tiles: each tile has a permanent cell so the tray never reflows
  const tray = doc.createElement("div");
  tray.className = "build-tray";
  tray.setAttribute("aria-label", "Letter tiles");
  const order = shuffleLetters(letters, ctx.seed, word);
  const tiles = order.map((ch, i) => {
    const cell = doc.createElement("div");
    cell.className = "build-cell";
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "tile build-tile";
    b.textContent = ch;
    b.setAttribute("aria-label", "Letter " + ch);
    cell.appendChild(b);
    tray.appendChild(cell);
    return { ch, btn: b, cell, slot: null, locked: false, i };
  });
  root.appendChild(tray);

  const bar = doc.createElement("div");
  bar.className = "build-actions";
  const hintBtn = doc.createElement("button");
  hintBtn.type = "button";
  hintBtn.className = "btn build-hint";
  hintBtn.setAttribute("aria-label", "Hint: show the next letter, costs " + CONFIG.coins.hintCost + " coins");
  hintBtn.innerHTML = '<span class="build-hint-text">Hint</span>';
  const costPill = doc.createElement("span");
  costPill.className = "pill build-cost";
  costPill.textContent = String(CONFIG.coins.hintCost);
  costPill.setAttribute("aria-hidden", "true");
  hintBtn.appendChild(costPill);
  if (coinsLeft < CONFIG.coins.hintCost) costPill.classList.add("build-poor");
  bar.appendChild(hintBtn);
  root.appendChild(bar);
  el.appendChild(root);

  function later(fn, ms) {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  }
  function animate(node, cls, ms) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    later(() => node.classList.remove(cls), ms);
  }
  function safeSpeak(t) { try { Promise.resolve(ctx.speak(t)).catch(() => {}); } catch (e) { /* speech is best effort */ } }
  const nextSlot = () => letterSlots.find((s) => !s.tile);

  function place(tile, slot, extra) {
    slot.tile = tile;
    tile.slot = slot;
    slot.el.classList.remove("slot");
    slot.el.classList.add("filled");
    slot.el.appendChild(tile.btn);
    tile.cell.classList.add("build-empty");
    if (extra) { tile.locked = true; tile.btn.classList.add("build-hinted"); }
    tile.btn.classList.add("good");
  }
  function unplace(tile) {
    const slot = tile.slot;
    slot.tile = null;
    tile.slot = null;
    slot.el.classList.remove("filled");
    slot.el.classList.add("slot");
    tile.btn.classList.remove("good");
    tile.cell.appendChild(tile.btn);
    tile.cell.classList.remove("build-empty");
  }

  function finish() {
    finished = true;
    root.classList.add("build-celebrate");
    animate(slotsEl, "pop", 300);
    ctx.onResult({ w: entry.w, misses, hintsUsed, skipped: false, ms: Date.now() - t0, correct: true });
    later(() => { ctx.onDone(); }, DONE_MS);
  }

  function onTile(tile, ev) {
    if (!alive || finished) return;
    const now = ev && ev.timeStamp ? ev.timeStamp : Date.now();
    // A tap within 60 ms of the last tap on the same tile is a double fire: ignore it.
    if (ev && tile.last !== undefined && now - tile.last < 60) return;
    tile.last = now;
    if (tile.slot) {
      if (!tile.locked) unplace(tile);   // returning a tile is never a miss
      return;
    }
    const s = nextSlot();
    if (!s) return;
    if (tile.ch === s.ch) {
      place(tile, s);
      animate(tile.btn, "pop", 260);
      if (!nextSlot()) finish();
    } else {
      misses += 1;
      animate(tile.btn, "shake", 340);
      animate(tile.btn, "bad", 420);
    }
  }
  function onHint() {
    if (!alive || finished) return;
    const s = nextSlot();
    if (!s) return;
    if (!ctx.spendCoins(CONFIG.coins.hintCost)) { costPill.classList.add("build-poor"); animate(costPill, "shake", 340); return; }
    hintsUsed += 1;
    coinsLeft -= CONFIG.coins.hintCost;
    if (coinsLeft < CONFIG.coins.hintCost) costPill.classList.add("build-poor");
    // use a tile in the tray if there is one with the right letter (there always is)
    const tile = tiles.find((t) => !t.slot && t.ch === s.ch);
    if (tile) place(tile, s, "hint");
    animate(s.el, "pop", 260);
    if (!nextSlot()) finish();
  }
  function onSpeak() { if (alive && !ctx.silent) safeSpeak(entry.w); }

  const handlers = tiles.map((t) => { const fn = (ev) => onTile(t, ev); t.btn.addEventListener("click", fn); return fn; });
  hintBtn.addEventListener("click", onHint);
  const noFocus = (e) => e.preventDefault();
  const swallow = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const a = doc.activeElement;
    if (!a || a === doc.body || a === doc.documentElement || root.contains(a)) e.preventDefault();
  };
  for (const b of [speakBtn, hintBtn, ...tiles.map((t) => t.btn)]) if (b) b.addEventListener("mousedown", noFocus);
  doc.addEventListener("keydown", swallow);
  doc.addEventListener("keyup", swallow);
  if (speakBtn) speakBtn.addEventListener("click", onSpeak);

  if (!ctx.silent) safeSpeak(entry.w);

  return {
    destroy() {
      if (!alive) return;
      alive = false;
      tiles.forEach((t, i) => t.btn.removeEventListener("click", handlers[i]));
      hintBtn.removeEventListener("click", onHint);
      doc.removeEventListener("keydown", swallow);
      doc.removeEventListener("keyup", swallow);
      if (speakBtn) speakBtn.removeEventListener("click", onSpeak);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (root.parentNode) root.parentNode.removeChild(root);
    }
  };
}
