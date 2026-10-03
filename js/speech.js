// Card W1-B: speech via the browser's built-in speechSynthesis (no network, no API).
// Safe to import in Node: with no speechSynthesis every function degrades quietly and nothing throws.
import { CONFIG } from "../data/config.js";

const SP = CONFIG.speech;

// Firefox Android reports 3-letter codes such as "eng-USA". Best-guess map to 2-letter regions.
const REGION3 = { USA: "US", GBR: "GB", AUS: "AU", CAN: "CA", IND: "IN", IRL: "IE", ZAF: "ZA", NZL: "NZ", SGP: "SG", PHL: "PH", NGA: "NG", KEN: "KE" };

let initPromise = null;      // cached initSpeech() result
let current = null;          // iOS garbage-collection bug: keep the live utterance referenced
let currentSettle = null;    // resolves the in-flight speak() when a newer one cancels it
let unlockUtter = null;
let unlocked = false;
let mutedLikely = false;
let speakSeq = 0;

function synth() {
  try { return globalThis.speechSynthesis || null; } catch { return null; }
}
function hasSpeech() {
  return !!(synth() && typeof globalThis.SpeechSynthesisUtterance === "function");
}

/** "en_US" -> "en-US", "eng-USA" -> "en-US", "eng" -> "en", "EN-gb" -> "en-GB". */
function normLang(raw) {
  if (typeof raw !== "string") return "";
  const parts = raw.trim().replace(/_/g, "-").split("-").filter(Boolean);
  if (!parts.length) return "";
  let lang = parts[0].toLowerCase();
  if (lang === "eng") lang = "en";
  let region = parts[1] || "";
  if (region.length === 3 && !/^\d{3}$/.test(region)) {
    const r = region.toUpperCase();
    region = REGION3[r] || "";
  } else region = region.toUpperCase();
  return region ? lang + "-" + region : lang;
}

function listVoices() {
  const s = synth();
  let raw = [];
  try { raw = Array.from((s && s.getVoices && s.getVoices()) || []); } catch { raw = []; }
  const out = [];
  for (const v of raw) {
    if (!v) continue;
    const lang = normLang(v.lang);
    if (lang === "en" || lang.startsWith("en-")) out.push({ voice: v, lang, name: String(v.name || ""), local: v.localService === true });
  }
  return out;
}

function pickVoice(voices, lang) {
  if (!voices.length) return null;
  const want = normLang(lang) || "en-US";
  const family = want.split("-")[0];
  const exact = voices.filter((v) => v.lang === want);
  const pick = exact.find((v) => v.local) || exact[0]
    || voices.filter((v) => v.lang === family || v.lang.startsWith(family + "-")).sort((a, b) => Number(b.local) - Number(a.local))[0]
    || null;
  return pick ? pick.voice : null; // null: let the browser use its default voice
}

/** @returns {Promise<{available:boolean, voices:{lang:string,name:string}[]}>} */
export async function initSpeech() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const none = { available: false, voices: [] };
    try {
      if (!hasSpeech()) return none;
      const s = synth();
      let found = listVoices();
      if (!found.length) {
        found = await new Promise((resolve) => {
          let done = false, poll = null, timer = null;
          const finish = () => {
            if (done) return; done = true;
            clearInterval(poll); clearTimeout(timer);
            try { s.removeEventListener && s.removeEventListener("voiceschanged", check); } catch { /* ignore */ }
            resolve(listVoices());
          };
          const check = () => { if (listVoices().length) finish(); };
          try { s.addEventListener && s.addEventListener("voiceschanged", check); } catch { /* ignore */ }
          poll = setInterval(check, 100);
          timer = setTimeout(finish, SP.voicesTimeoutMs);
        });
      }
      const voices = found.map((v) => ({ lang: v.lang, name: v.name }));
      if (!voices.length) initPromise = null; // do not cache an empty result; a later call re-checks
      return { available: voices.length > 0, voices };
    } catch {
      return none;
    }
  })();
  return initPromise;
}

/** Call inside a user tap (iOS unlock): speaks one silent utterance, once. */
export function unlockSpeech() {
  try {
    if (unlocked || !hasSpeech()) return;
    const u = new globalThis.SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.lang = "en-US";
    unlockUtter = u; // keep referenced
    u.onend = u.onerror = () => { if (unlockUtter === u) unlockUtter = null; };
    synth().speak(u);
    unlocked = true; // only after the utterance was queued
  } catch { unlockUtter = null; /* never throw; retry on next tap */ }
}

/** Resolves on end, error, or after CONFIG.speech.speakTimeoutMs. Never rejects. */
export function speak(text, opts) {
  return new Promise((resolve) => {
    try {
      const str = text == null ? "" : String(text);
      if (!hasSpeech() || !str.trim()) return resolve();
      const s = synth();
      const o = opts || {};
      const lang = normLang(o.lang) || "en-US";
      const rate = typeof o.rate === "number" && o.rate > 0 ? o.rate : SP.rate;

      // Settle whatever was in flight, then cancel it.
      if (currentSettle) { const f = currentSettle; currentSettle = null; f("superseded"); }
      const seq = ++speakSeq;
      try { s.cancel(); } catch { /* ignore */ }
      // Chrome quirk: speech can stay paused or pending after cancel; resume() unsticks it.
      try { if (s.paused || s.pending) s.resume(); } catch { /* ignore */ }

      const u = new globalThis.SpeechSynthesisUtterance(str);
      u.lang = lang;
      u.rate = rate;
      const voice = pickVoice(listVoices(), lang);
      if (voice) u.voice = voice;
      current = u;

      let started = false, settled = false, mutedTimer = null, timeout = null;
      const settle = (why) => {
        if (settled) return; settled = true;
        clearTimeout(timeout); clearTimeout(mutedTimer);
        if (currentSettle === settle) currentSettle = null;
        // A superseded call says nothing about muting; a natural end without a start does.
        if (why !== "superseded" && seq === speakSeq && !started && why !== "error-canceled") mutedLikely = true;
        resolve();
      };
      u.onstart = () => { started = true; if (seq === speakSeq) { mutedLikely = false; clearTimeout(mutedTimer); } };
      u.onend = () => settle("end");
      u.onerror = (e) => {
        const code = e && e.error;
        settle(code === "canceled" || code === "interrupted" ? "error-canceled" : "error");
      };
      currentSettle = settle;
      mutedTimer = setTimeout(() => { if (!started && seq === speakSeq) mutedLikely = true; }, SP.mutedCheckMs);
      timeout = setTimeout(() => settle("timeout"), SP.speakTimeoutMs);
      s.speak(u);
    } catch {
      resolve();
    }
  });
}

/** True when the last speak() never started (iOS mute switch, or no voices). */
export function isMutedLikely() {
  return mutedLikely;
}
