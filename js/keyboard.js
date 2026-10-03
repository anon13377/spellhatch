// Spell Hatch on-screen keyboard (W1-D). Big buttons only: no <input>, so no OS keyboard and no autocorrect.
// Taps use the click event only (no touchstart plus click pair), so one tap can never fire twice.

const QWERTY = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ABC = ["abcdefg", "hijklmn", "opqrstu", "vwxyz"];
const MIN_GAP_MS = 60;     // taps on the same key faster than this are ignored
const FLASH_MS = 380;

const ICON_BACK = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9l5 6M17 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** @param {HTMLElement} el @param {{onKey:Function,onBackspace:Function,onEnter:Function,onSpeak:Function}} handlers @param {{layout?:"qwerty"|"abc"}} [opts]
 *  @returns {{destroy:Function, flash:Function}} */
export function mountKeyboard(el, handlers, opts) {
  const h = handlers || {};
  const layout = opts && opts.layout === "qwerty" ? QWERTY : ABC;
  const showBack = !(opts && opts.backspace === false);
  const enterLabel = (opts && opts.enterLabel) || "Check";
  const doc = el.ownerDocument;
  const timers = new Set();
  const lastTap = new Map();   // key id -> time of last accepted tap
  const letterBtn = new Map();
  let alive = true;

  const root = doc.createElement("div");
  root.className = "kb";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Keyboard");

  function makeBtn(cls, id, label, html) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "kb-key " + cls;
    b.dataset.key = id;
    if (label) b.setAttribute("aria-label", label);
    b.innerHTML = html;
    return b;
  }

  layout.forEach((letters, ri) => {
    const row = doc.createElement("div");
    row.className = "kb-row";
    for (const ch of letters) {
      const b = makeBtn("kb-letter", ch, "", ch);
      letterBtn.set(ch, b);
      row.appendChild(b);
    }
    if (showBack && ri === layout.length - 1) row.appendChild(makeBtn("kb-wide kb-back", "Backspace", "Backspace", ICON_BACK));
    root.appendChild(row);
  });

  const hasSpeak = typeof h.onSpeak === "function";
  const hasEnter = typeof h.onEnter === "function";
  if (hasSpeak || hasEnter) {
    const row = doc.createElement("div");
    row.className = "kb-row kb-row-actions";
    if (hasSpeak) row.appendChild(makeBtn("kb-wide kb-speak", "speak", "Hear the word", ICON_SPEAKER));
    if (hasEnter) row.appendChild(makeBtn("kb-wide kb-enter", "Enter", enterLabel, ICON_CHECK + '<span class="kb-enter-text">' + enterLabel + "</span>"));
    root.appendChild(row);
  }
  el.appendChild(root);

  function later(fn, ms) {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  }

  function press(btn) {
    btn.classList.add("kb-down");
    later(() => btn.classList.remove("kb-down"), 120);
  }

  function fire(id) {
    if (!alive) return;
    if (id === "Backspace") { if (typeof h.onBackspace === "function") h.onBackspace(); }
    else if (id === "Enter") { if (hasEnter) h.onEnter(); }
    else if (id === "speak") { if (hasSpeak) h.onSpeak(); }
    else if (typeof h.onKey === "function") h.onKey(id);
  }

  // Keep focus off the keys while tapping, so a physical Enter never re-activates a tapped button.
  const onMouseDown = (e) => { if (e.target.closest && e.target.closest(".kb-key")) e.preventDefault(); };
  const onClick = (e) => {
    const btn = e.target.closest && e.target.closest(".kb-key");
    if (!btn || !root.contains(btn)) return;
    const id = btn.dataset.key;
    const now = e.timeStamp || Date.now();
    const prev = lastTap.get(id);
    if (prev !== undefined && now - prev < MIN_GAP_MS) return;
    lastTap.set(id, now);
    press(btn);
    fire(id);
  };
  root.addEventListener("mousedown", onMouseDown);
  root.addEventListener("click", onClick);

  // Enter and Space are only ours while focus is on the page body or inside the mode's own root.
  const scope = (opts && opts.scope) || el;
  const mine = () => { const a = doc.activeElement; return !a || a === doc.body || a === doc.documentElement || scope.contains(a); };
  const onKeyDown = (e) => {
    if (!alive || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key;
    if (k === "Backspace") {
      e.preventDefault();
      const bb = root.querySelector('[data-key="Backspace"]');
      if (bb) press(bb);
      fire("Backspace");
    } else if (k === "Enter") {
      if (!mine()) return;
      e.preventDefault();
      if (!hasEnter) return;
      const b = root.querySelector('[data-key="Enter"]');
      if (b) press(b);
      fire("Enter");
    } else if (k === " " || k === "Spacebar") {
      if (mine()) e.preventDefault();
    } else if (typeof k === "string" && k.length === 1) {
      const ch = k.toLowerCase();
      if (letterBtn.has(ch)) {
        e.preventDefault();
        press(letterBtn.get(ch));
        fire(ch);
      }
    }
  };
  const onKeyUp = (e) => { if (alive && (e.key === " " || e.key === "Enter") && mine()) e.preventDefault(); };
  doc.addEventListener("keydown", onKeyDown);
  doc.addEventListener("keyup", onKeyUp);

  return {
    flash(letter, ok) {
      const b = letterBtn.get(String(letter || "").toLowerCase());
      if (!b || !alive) return;
      const cls = ok ? "kb-ok" : "kb-bad";
      b.classList.remove("kb-ok", "kb-bad");
      void b.offsetWidth;
      b.classList.add(cls);
      later(() => b.classList.remove(cls), FLASH_MS);
    },
    destroy() {
      if (!alive) return;
      alive = false;
      doc.removeEventListener("keydown", onKeyDown);
      doc.removeEventListener("keyup", onKeyUp);
      root.removeEventListener("mousedown", onMouseDown);
      root.removeEventListener("click", onClick);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (root.parentNode) root.parentNode.removeChild(root);
    }
  };
}
