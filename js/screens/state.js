// Spell Hatch app state shared by every screen (card W2): the store, the current player, small UI prefs,
// and the list save pipeline from CONTRACTS ("normalize words > fill emoji and def > set eggId > store.saveList").
import { createStore, newProfile } from "../store.js";
import { eggForList } from "../rewards.js";
import { EMOJI, DEFS } from "../../data/emoji.js";

export const store = createStore();

const UI_KEY = "sh:ui";
const MAX_WORDS = 300;
const WORD_RE = /^[a-z]+(?:['-][a-z]+)*$/;

/** In-memory session state (not saved). */
export const session = {
  profileId: null,
  parentUnlocked: false,
  lastResult: null,      // { profileId, listId, mode, part, isTest, summary, events, before, after }
  pendingShare: null,    // decoded shared List waiting for a player
  soundHintShown: false
};

// ---------- UI prefs (one small key; per-viewer conveniences only) ----------
function readUi() {
  try { const o = JSON.parse(localStorage.getItem(UI_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}
export function getUi() { return readUi(); }
export function setUi(patch) {
  const o = { ...readUi(), ...patch };
  try { localStorage.setItem(UI_KEY, JSON.stringify(o)); } catch { /* best effort */ }
  return o;
}
/** Per player, per list prefs: { lastMode, test, part } */
export function listPref(pid, listId) {
  const ui = readUi();
  return (ui.lists && ui.lists[pid + "|" + listId]) || {};
}
export function setListPref(pid, listId, patch) {
  const ui = readUi();
  const lists = ui.lists || {};
  lists[pid + "|" + listId] = { ...(lists[pid + "|" + listId] || {}), ...patch };
  setUi({ lists });
}

// ---------- players ----------
export function currentProfile() {
  return session.profileId ? store.getProfile(session.profileId) : null;
}
export function selectProfile(id) {
  session.profileId = id;
  setUi({ lastProfile: id });
  applyProfileLook(store.getProfile(id));
}
/** Dyslexia font class on <html> follows the current player's setting. */
export function applyProfileLook(p) {
  const on = !!(p && p.settings && p.settings.dyslexiaFont);
  document.documentElement.classList.toggle("dyslexia", on);
}
export function createPlayer(name, avatar) {
  const p = newProfile(name, avatar);
  const r = store.saveProfile(p);
  return r.ok ? { ok: true, profile: p } : { ok: false, error: r.error };
}
/** Save a profile; returns {ok, error}. */
export function saveProfile(p) {
  return store.saveProfile(p);
}
export function updateProfile(id, fn) {
  const p = store.getProfile(id);
  if (!p) return { ok: false, error: "missing" };
  fn(p);
  return store.saveProfile(p);
}

// ---------- words ----------
/** Display form: the Dolch word "i" (and i'm, i'll...) shows as "I". */
export function disp(w) {
  return String(w || "").replace(/^i(?=$|')/, "I");
}

/** Text from a parent (paste) to clean, lowercase, unique words. Keeps 1-letter words ("a", "I"). */
export function parseWords(text) {
  const out = [];
  const seen = new Set();
  const norm = String(text || "")
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[‐‑‒]/g, "-");
  for (let tok of norm.split(/[\s,;/|]+/)) {
    tok = tok.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
    if (!tok || tok.length > 30 || !WORD_RE.test(tok) || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

/** Normalize a Word[] (or strings) and fill emoji and def from data/emoji.js. */
export function normalizeWords(words) {
  const out = [];
  const seen = new Map();
  for (const x of words || []) {
    const raw = typeof x === "string" ? x : x && x.w;
    const [w] = parseWords(raw);
    if (!w) continue;
    const star = !!(x && typeof x === "object" && x.star);
    if (seen.has(w)) { if (star) seen.get(w).star = true; continue; }
    if (out.length >= MAX_WORDS) break;
    const entry = { w, star };
    if (EMOJI[w]) entry.emoji = EMOJI[w];
    if (DEFS[w]) entry.def = DEFS[w];
    seen.set(w, entry);
    out.push(entry);
  }
  return out;
}

export function randomListId() {
  return "l_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

/**
 * The save pipeline. list: {id?, title, lang, words, testDate, source}. Adds the list id to every player in
 * profileIds (deduped). Returns {ok, list, error}.
 */
export function saveListPipeline(list, profileIds = []) {
  const words = normalizeWords(list.words);
  if (!words.length) return { ok: false, error: "empty" };
  const id = list.id || randomListId();
  const clean = {
    id,
    title: String(list.title || "My words").replace(/\s+/g, " ").trim().slice(0, 40) || "My words",
    lang: list.lang === "en-GB" ? "en-GB" : "en-US",
    words,
    testDate: /^\d{4}-\d{2}-\d{2}$/.test(list.testDate || "") ? list.testDate : null,
    source: ["paste", "scan", "bundled", "shared"].includes(list.source) ? list.source : "paste",
    eggId: eggForList(id)
  };
  const r = store.saveList(clean);
  if (!r.ok) return { ok: false, error: r.error };
  for (const pid of profileIds) {
    const res = updateProfile(pid, (p) => { if (!p.listIds.includes(id)) p.listIds.push(id); });
    if (!res.ok && res.error === "quota") return { ok: false, error: "quota", list: clean };
  }
  return { ok: true, list: clean };
}

/** Delete a list from the store and from every player: listIds and wordStats go, creatures stay (a hatched one is kept for good). */
export function deleteListEverywhere(listId) {
  for (const p of store.listProfiles()) {
    const had = p.listIds.includes(listId) || (p.wordStats && p.wordStats[listId]);
    if (!had) continue;
    p.listIds = p.listIds.filter((x) => x !== listId);
    if (p.wordStats) delete p.wordStats[listId];
    store.saveProfile(p);
  }
  return store.deleteList(listId);
}

/** Remove a list from one player only (keeps it for others; deletes it when nobody has it). */
export function removeListFromPlayer(pid, listId) {
  updateProfile(pid, (p) => {
    p.listIds = p.listIds.filter((x) => x !== listId);
    if (p.wordStats) delete p.wordStats[listId];
  });
  const still = store.listProfiles().some((p) => p.listIds.includes(listId));
  if (!still) store.deleteList(listId);
}

/** The lists of a player, in their order, skipping missing ones. */
export function playerLists(p) {
  if (!p) return [];
  return p.listIds.map((id) => store.getList(id)).filter(Boolean);
}

/** A friendly message for a store error code. */
export function storeErrorText(err) {
  if (err === "quota") return "This device is out of space for Spell Hatch. Delete some old lists to make room, then try again.";
  if (err === "empty") return "No words found. Type or paste at least one word.";
  return "Something went wrong while saving. Please try again.";
}
