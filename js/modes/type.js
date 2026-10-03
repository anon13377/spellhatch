// Spell Hatch Type It (W1-D). Hear the word, type it on the big on-screen keyboard (or a physical one).
import { mountKeyboard } from "../keyboard.js";
import { CONFIG } from "../../data/config.js";

export const meta = { id: "type", title: "Type It", icon: "keyboard", batch: false };

/** Keeps all words. @param {object[]} words @returns {object[]} */
export function eligible(words) { return Array.isArray(words) ? words.slice() : []; }

const FIXED = /[^a-z]/;   // apostrophes, hyphens and anything else that is not a letter are pre-filled
const DONE_MS = 520;      // celebration length, so onDone lands well inside 800 ms

const SPEAKER_SVG = '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** @param {HTMLElement} el @param {object} ctx ModeCtx @returns {{destroy:Function}} */
export function mount(el, ctx) {
  const doc = el.ownerDocument;
  const entry = ctx.words[0];
  const word = String(entry.w).toLowerCase();
  const chars = [...word];
  const isTest = !!ctx.isTest;
  const timers = new Set();
  const t0 = Date.now();
  let alive = true;
  let finished = false;
  let misses = 0;
  let hintsUsed = 0;
  let coinsLeft = Number(ctx.coins) || 0;

  const root = doc.createElement("div");
  root.className = "type-root" + (isTest ? " type-test" : "");

  // ---- clue area: speaker, or picture / definition in silent mode
  const clue = doc.createElement("div");
  clue.className = "type-clue";
  let speakBtn = null;
  if (!ctx.silent) {
    speakBtn = doc.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "speaker type-speaker";
    speakBtn.setAttribute("aria-label", "Hear the word again");
    speakBtn.innerHTML = SPEAKER_SVG;
    clue.appendChild(speakBtn);
  } else {
    if (entry.emoji) {
      const img = doc.createElement("img");
      img.className = "type-pic";
      img.alt = "Picture clue";
      img.src = "./assets/emoji/" + entry.emoji + ".svg";
      img.addEventListener("error", () => { img.remove(); });
      clue.appendChild(img);
    }
    if (entry.def || !entry.emoji) {
      const d = doc.createElement("p");
      d.className = "type-def";
      d.textContent = entry.def || "Silent mode: spell the word you see in your mind.";
      clue.appendChild(d);
    }
  }
  if (isTest) {
    const tag = doc.createElement("div");
    tag.className = "type-tag";
    tag.textContent = "School test";
    root.appendChild(tag);
  }
  root.appendChild(clue);

  // ---- answer slots
  const slotsEl = doc.createElement("div");
  slotsEl.className = "type-slots";
  slotsEl.setAttribute("aria-label", "Answer, " + chars.filter((c) => !FIXED.test(c)).length + " letters");
  const slots = chars.map((ch) => {
    const s = doc.createElement("div");
    const fixed = FIXED.test(ch);
    s.className = "tile type-slot " + (fixed ? "fixed type-fixed" : "slot");
    s.textContent = fixed ? ch : "";
    slotsEl.appendChild(s);
    return { ch, fixed, el: s, filled: false };
  });
  const letterSlots = slots.filter((s) => !s.fixed);
  root.appendChild(slotsEl);

  // ---- hint button (practice only)
  let hintBtn = null, costPill = null;
  if (!isTest) {
    const bar = doc.createElement("div");
    bar.className = "type-actions";
    hintBtn = doc.createElement("button");
    hintBtn.type = "button";
    hintBtn.className = "btn type-hint";
    hintBtn.setAttribute("aria-label", "Hint: show the next letter, costs " + CONFIG.coins.hintCost + " coins");
    hintBtn.innerHTML = '<span class="type-hint-text">Hint</span>';
    costPill = doc.createElement("span");
    costPill.className = "pill type-cost";
    costPill.textContent = String(CONFIG.coins.hintCost);
    costPill.setAttribute("aria-hidden", "true");
    hintBtn.appendChild(costPill);
    if (coinsLeft < CONFIG.coins.hintCost) costPill.classList.add("type-poor");
    bar.appendChild(hintBtn);
    root.appendChild(bar);
  }

  const kbHost = doc.createElement("div");
  kbHost.className = "type-kb";
  root.appendChild(kbHost);
  el.appendChild(root);

  function safeSpeak(t) { try { Promise.resolve(ctx.speak(t)).catch(() => {}); } catch (e) { /* speech is best effort */ } }
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
  function setSlot(s, letter, extra) {
    s.el.textContent = letter;
    s.el.classList.remove("slot");
    s.el.classList.add("filled");
    if (extra) s.el.classList.add(extra);
    s.filled = true;
  }
  function clearSlot(s) {
    s.el.textContent = "";
    s.el.classList.remove("filled", "good", "type-hinted");
    s.el.classList.add("slot");
    s.filled = false;
  }
  const nextPractice = () => letterSlots.find((s) => !s.filled);

  function report(correct) {
    ctx.onResult({ w: entry.w, misses, hintsUsed, skipped: false, ms: Date.now() - t0, correct });
    later(() => { ctx.onDone(); }, DONE_MS);
  }

  function finishPractice() {
    finished = true;
    root.classList.add("type-celebrate");
    for (const s of letterSlots) s.el.classList.add("good");
    animate(slotsEl, "pop", 300);
    report(true);
  }

  function finishTest() {
    finished = true;
    root.classList.add("type-submitted");
    const typed = letterSlots.filter((s) => s.filled).map((s) => s.el.textContent).join("");
    const target = chars.filter((c) => !FIXED.test(c)).join("");
    const ok = typed === target;
    if (!ok) misses = 1;
    report(ok);
  }

  // ---- input handling
  function onKey(letter) {
    if (!alive || finished) return;
    letter = String(letter).toLowerCase();
    if (isTest) {
      const s = nextPractice();
      if (!s) return;
      setSlot(s, letter);
      return;
    }
    const s = nextPractice();
    if (!s) return;
    if (letter === s.ch) {
      setSlot(s, letter, "good");
      kb.flash(letter, true);
      animate(s.el, "pop", 260);
      if (!nextPractice()) finishPractice();
    } else {
      misses += 1;
      kb.flash(letter, false);
      animate(s.el, "shake", 340);
      animate(s.el, "bad", 420);
    }
  }
  function onBackspace() {
    if (!alive || finished || !isTest) return;
    for (let i = letterSlots.length - 1; i >= 0; i--) {
      if (letterSlots[i].filled) { clearSlot(letterSlots[i]); return; }
    }
  }
  function onEnter() {
    if (!alive || finished || !isTest) return;
    if (!letterSlots.some((s) => s.filled)) return;
    finishTest();
  }
  function onSpeak() {
    if (!alive || ctx.silent) return;
    safeSpeak(entry.w);
  }
  function onHint() {
    if (!alive || finished || isTest) return;
    const s = nextPractice();
    if (!s) return;
    if (!ctx.spendCoins(CONFIG.coins.hintCost)) {
      costPill.classList.add("type-poor");
      animate(costPill, "shake", 340);
      return;
    }
    hintsUsed += 1;
    coinsLeft -= CONFIG.coins.hintCost;
    if (coinsLeft < CONFIG.coins.hintCost) costPill.classList.add("type-poor");
    setSlot(s, s.ch, "type-hinted");
    animate(s.el, "pop", 260);
    if (!nextPractice()) finishPractice();
  }

  const kb = mountKeyboard(kbHost, {
    onKey,
    onBackspace,
    onEnter: isTest ? onEnter : undefined,
    onSpeak: undefined
  }, { layout: ctx.keyboard === "qwerty" ? "qwerty" : "abc", enterLabel: "Check", backspace: isTest, scope: root });

  if (speakBtn) speakBtn.addEventListener("click", onSpeak);
  if (hintBtn) hintBtn.addEventListener("click", onHint);
  const noFocus = (e) => e.preventDefault();
  for (const b of [speakBtn, hintBtn]) if (b) b.addEventListener("mousedown", noFocus);

  if (!ctx.silent) safeSpeak(entry.w);

  return {
    destroy() {
      if (!alive) return;
      alive = false;
      kb.destroy();
      if (speakBtn) speakBtn.removeEventListener("click", onSpeak);
      if (hintBtn) hintBtn.removeEventListener("click", onHint);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (root.parentNode) root.parentNode.removeChild(root);
    }
  };
}
