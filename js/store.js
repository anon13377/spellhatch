// Spell Hatch store (card W1-A). Profiles and lists in an injectable Storage.
// Keys: sh:index = {profiles:[ids], lists:[ids]}, sh:p:<id>, sh:l:<id> (prefix from CONFIG.storage.prefix).
// Return values: every write method returns {ok:true} on success or {ok:false, error} with error one of
//   "quota" (setItem threw; previous data and index are left intact), "invalid" (bad input shape).
// importBackup returns {ok:true, profiles:n, lists:n} or {ok:false, error} with error one of
//   "format", "checksum", "shape", "quota". It is all or nothing.
// Reads never throw: missing or unparsable items give null and are dropped from listings.
import { CONFIG } from "../data/config.js";

const PREFIX = CONFIG.storage.prefix;
const INDEX_KEY = PREFIX + "index";
const P_PREFIX = PREFIX + "p:";
const L_PREFIX = PREFIX + "l:";
const BACKUP_TAG = "SH1";
const READ_FAILED = Symbol("readFailed"); // getItem threw: unknown, not the same as missing
const MAX_WORDS = 300;

/** A fresh profile with every Profile field at its default. */
export function newProfile(name, avatar) {
  return {
    v: CONFIG.storage.schemaVersion,
    id: "p_" + randomId(),
    name: String(name == null ? "" : name).trim().slice(0, 20),
    avatar,
    createdAt: new Date().toISOString(),
    xp: 0,
    level: 1,
    coins: CONFIG.coins.startingCoins,
    streak: { count: 0, lastDay: 0 },
    daily: { day: 0, words: 0, claimed: false },
    badges: [],
    totals: { words: 0, rounds: 0, perfect: 0 },
    playDays: 0,
    buddy: null,
    starter: "egg",
    creatures: {},
    listIds: [],
    wordStats: {},
    settings: { voice: "en-US", dyslexiaFont: false, sfx: true, silent: false, keyboard: "abc" }
  };
}

function randomId() {
  let s = "";
  while (s.length < 8) s += Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  return s.slice(0, 8);
}

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// Migration hook: bring any older or partial profile up to the current schema. Keyed by v.
function migrate(obj) {
  const base = newProfile(obj.name, obj.avatar);
  const out = { ...base };
  for (const k of Object.keys(obj)) out[k] = obj[k];
  for (const k of ["streak", "daily", "totals", "settings"]) {
    out[k] = isObj(obj[k]) ? { ...base[k], ...obj[k] } : base[k];
  }
  if (out.settings.keyboard !== "qwerty" && out.settings.keyboard !== "abc") out.settings.keyboard = "abc";
  for (const k of ["badges", "listIds"]) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ["creatures", "wordStats"]) if (!isObj(out[k])) out[k] = {};
  if (typeof out.createdAt !== "string") out.createdAt = base.createdAt;
  for (const k of ["xp", "coins", "playDays"]) if (!Number.isFinite(out[k]) || out[k] < 0) out[k] = base[k];
  if (!Number.isFinite(out.level) || out.level < 1) out.level = 1;
  // Future schema steps go here, e.g. if (out.v < 2) { ... }
  out.v = Math.max(CONFIG.storage.schemaVersion, Number(out.v) || 0);
  return out;
}

const validProfile = (p) => isObj(p) && typeof p.id === "string" && p.id.length > 0 && typeof p.name === "string";
const validWord = (w) => isObj(w) && typeof w.w === "string";
const validList = (l) => isObj(l) && typeof l.id === "string" && l.id.length > 0 && Array.isArray(l.words) && l.words.length >= 1 && l.words.length <= MAX_WORDS && l.words.every(validWord);

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function toB64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s) {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** @param {Storage} storage injectable; defaults to localStorage
 *  @returns {{listProfiles:Function,getProfile:Function,saveProfile:Function,deleteProfile:Function,listLists:Function,getList:Function,saveList:Function,deleteList:Function,exportBackup:Function,importBackup:Function,bytesUsed:Function}} */
export function createStore(storage = globalThis.localStorage) {
  const rawGet = (k) => { try { const v = storage.getItem(k); return typeof v === "string" ? v : null; } catch { return READ_FAILED; } };
  const parse = (k) => { const raw = rawGet(k); if (raw === null || raw === READ_FAILED) return null; try { return JSON.parse(raw); } catch { return null; } };
  const allKeys = () => {
    const keys = [];
    try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (typeof k === "string") keys.push(k); } } catch { /* ignore */ }
    return keys;
  };
  const strIds = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string") : []);

  function scanIndex() {
    const idx = { profiles: [], lists: [] };
    for (const k of allKeys()) {
      if (k.startsWith(P_PREFIX)) idx.profiles.push(k.slice(P_PREFIX.length));
      else if (k.startsWith(L_PREFIX)) idx.lists.push(k.slice(L_PREFIX.length));
    }
    return idx;
  }

  // Returns a usable index; rebuilds it from a key scan when missing or corrupted (best effort write-back).
  function readIndex() {
    const raw = parse(INDEX_KEY);
    if (isObj(raw) && Array.isArray(raw.profiles) && Array.isArray(raw.lists)) {
      return { profiles: strIds(raw.profiles), lists: strIds(raw.lists) };
    }
    const idx = scanIndex();
    if (idx.profiles.length || idx.lists.length) { try { storage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch { /* keep in memory */ } }
    return idx;
  }

  const readProfile = (id) => { const o = parse(P_PREFIX + id); return validProfile(o) ? migrate(o) : null; };
  const readList = (id) => { const o = parse(L_PREFIX + id); return validList(o) ? o : null; };

  // Write the item, then the index. If either setItem throws, restore the previous item and report quota.
  function writeItem(kind, id, obj) {
    const key = (kind === "p" ? P_PREFIX : L_PREFIX) + id;
    const field = kind === "p" ? "profiles" : "lists";
    const prev = rawGet(key);
    if (prev === READ_FAILED) return { ok: false, error: "quota" }; // cannot guarantee a rollback, so write nothing
    try { storage.setItem(key, JSON.stringify(obj)); } catch { return { ok: false, error: "quota" }; }
    const idx = readIndex();
    if (!idx[field].includes(id)) {
      idx[field].push(id);
      try { storage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch {
        try { if (prev === null) storage.removeItem(key); else storage.setItem(key, prev); } catch { /* ignore */ }
        return { ok: false, error: "quota" };
      }
    }
    return { ok: true };
  }

  function removeItem(kind, id) {
    const field = kind === "p" ? "profiles" : "lists";
    try { storage.removeItem((kind === "p" ? P_PREFIX : L_PREFIX) + id); } catch { return { ok: false, error: "quota" }; }
    const idx = readIndex();
    idx[field] = idx[field].filter((x) => x !== id);
    try { storage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch { /* dangling ids are dropped on read */ }
    return { ok: true };
  }

  const listAll = (field, reader) => readIndex()[field].map(reader).filter((x) => x !== null);

  const api = {
    listProfiles: () => listAll("profiles", readProfile),
    getProfile: (id) => readProfile(id),
    saveProfile(p) {
      if (!validProfile(p)) return { ok: false, error: "invalid" };
      return writeItem("p", p.id, p);
    },
    deleteProfile: (id) => removeItem("p", id),
    listLists: () => listAll("lists", readList),
    getList: (id) => readList(id),
    saveList(l) {
      if (!validList(l)) return { ok: false, error: "invalid" };
      return writeItem("l", l.id, l);
    },
    deleteList: (id) => removeItem("l", id),

    exportBackup() {
      const body = toB64Url(JSON.stringify({ v: CONFIG.storage.schemaVersion, profiles: api.listProfiles(), lists: api.listLists() }));
      return BACKUP_TAG + "." + body + "." + fnv1a(body);
    },

    importBackup(code) {
      if (typeof code !== "string") return { ok: false, error: "format" };
      const parts = code.replace(/\s+/g, "").split(".");
      if (parts.length !== 3 || parts[0] !== BACKUP_TAG || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[0-9a-f]{8}$/.test(parts[2])) {
        return { ok: false, error: "format" };
      }
      if (fnv1a(parts[1]) !== parts[2]) return { ok: false, error: "checksum" };
      let data;
      try { data = JSON.parse(fromB64Url(parts[1])); } catch { return { ok: false, error: "format" }; }
      if (isObj(data) && Number(data.v) > CONFIG.storage.schemaVersion) return { ok: false, error: "version" };
      if (!isObj(data) || !Array.isArray(data.profiles) || !Array.isArray(data.lists)) return { ok: false, error: "shape" };
      if (!data.profiles.every(validProfile) || !data.lists.every(validList)) return { ok: false, error: "shape" };
      const profiles = [...new Map(data.profiles.map((p) => [p.id, p])).values()].map(migrate);
      const lists = [...new Map(data.lists.map((l) => [l.id, l])).values()];
      const writes = [
        ...profiles.map((p) => [P_PREFIX + p.id, JSON.stringify(p), "profiles", p.id]),
        ...lists.map((l) => [L_PREFIX + l.id, JSON.stringify(l), "lists", l.id])
      ];
      const idx = readIndex();
      for (const [, , field, id] of writes) if (!idx[field].includes(id)) idx[field].push(id);
      const undo = [];
      const idxPrev = rawGet(INDEX_KEY);
      const prevs = writes.map(([key]) => rawGet(key));
      if (idxPrev === READ_FAILED || prevs.includes(READ_FAILED)) return { ok: false, error: "quota" }; // nothing written yet
      try {
        for (let i = 0; i < writes.length; i++) { undo.push([writes[i][0], prevs[i]]); storage.setItem(writes[i][0], writes[i][1]); }
        storage.setItem(INDEX_KEY, JSON.stringify(idx));
      } catch {
        for (const [key, prev] of undo.reverse()) { try { if (prev === null) storage.removeItem(key); else storage.setItem(key, prev); } catch { /* ignore */ } }
        try { if (idxPrev === null) storage.removeItem(INDEX_KEY); else storage.setItem(INDEX_KEY, idxPrev); } catch { /* ignore */ }
        return { ok: false, error: "quota" };
      }
      return { ok: true, profiles: profiles.length, lists: lists.length };
    },

    bytesUsed() {
      let n = 0;
      for (const k of allKeys()) if (k.startsWith(PREFIX)) n += (k.length + (typeof rawGet(k) === "string" ? rawGet(k).length : 0)) * 2;
      return n;
    }
  };
  return api;
}
