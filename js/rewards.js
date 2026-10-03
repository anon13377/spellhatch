// Spell Hatch rewards engine (card W1-F). Implements SCOPE section 4 and CONTRACTS v1.2.
// Pure: applyRound never mutates its inputs, never reads the clock and never touches storage.
// The day always comes from summary.day. Every number comes from data/config.js.
//
// Event order returned by applyRound (each type appears only when it applies, except xp and coins):
//   1. xp      value: number   XP earned by the round itself (words + perfect bonus), 0 allowed, always emitted
//   2. coins   value: number   coins earned by the round itself (first-try words + perfect bonus), 0 allowed, always emitted
//   3. daily   value: { xp, coins }   the daily goal was reached for the first time on summary.day
//   4. level   value: number   the new level, one event per level gained (after round XP and daily XP)
//   5. streak  value: number   the new streak count, emitted when summary.day is a new play day
//   6. hatch   value: { creatureId, listId }   starter c00 first (listId null), then the list creature
//   7. grow    value: { creatureId, listId }   same order as hatch
//   8. badge   value: string   badge id, in CONFIG.badges order, each awarded once per profile

import { CONFIG, levelFromXp } from "../data/config.js";

function clone(v) {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Fill any missing Profile v1.2 fields on the copy so older or partial profiles still score.
function normalize(p) {
  p.xp = Math.max(0, num(p.xp));
  p.level = Math.max(1, num(p.level) || 1);
  p.coins = Math.max(0, num(p.coins));
  if (!p.streak || typeof p.streak !== "object") p.streak = { count: 0, lastDay: 0 };
  p.streak.count = num(p.streak.count);
  p.streak.lastDay = num(p.streak.lastDay);
  if (!p.daily || typeof p.daily !== "object") p.daily = { day: 0, words: 0, claimed: false };
  if (!Array.isArray(p.badges)) p.badges = [];
  if (!p.totals || typeof p.totals !== "object") p.totals = { words: 0, rounds: 0, perfect: 0 };
  p.totals.words = num(p.totals.words);
  p.totals.rounds = num(p.totals.rounds);
  p.totals.perfect = num(p.totals.perfect);
  p.playDays = num(p.playDays);
  if (p.starter !== "baby" && p.starter !== "grown") p.starter = "egg";
  if (!p.creatures || typeof p.creatures !== "object") p.creatures = {};
  if (!p.wordStats || typeof p.wordStats !== "object") p.wordStats = {};
  return p;
}

function listWords(list) {
  const words = list && Array.isArray(list.words) ? list.words : [];
  const out = [];
  const seen = new Set();
  for (const x of words) {
    const w = typeof x === "string" ? x : x && x.w;
    if (typeof w === "string" && w && !seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

function starredSet(list) {
  const s = new Set();
  const words = list && Array.isArray(list.words) ? list.words : [];
  for (const x of words) if (x && typeof x === "object" && x.star && typeof x.w === "string") s.add(x.w);
  return s;
}

function hatched(state) { return state === "baby" || state === "grown"; }

/** Pure. @returns {{profile:object, events:Array<{type:string,value:any}>}} */
export function applyRound(profile, list, summary) {
  const p = normalize(clone(profile || {}));
  const s = summary || {};
  const day = num(s.day);
  const isTest = s.isTest === true;
  const perfect = s.perfect === true;
  const listId = (typeof s.listId === "string" && s.listId) ? s.listId : (list && list.id) || "";
  const stars = starredSet(list);
  const results = Array.isArray(s.results) ? s.results : [];

  const events = [];
  const bonus = [];   // level, streak, hatch, grow, badge, appended in that order after xp, coins, daily

  // Words: XP, coins, wordStats. One WordResult per word per round; a repeated word scores only once.
  let roundXp = 0;
  let roundCoins = 0;
  let correctWords = 0;
  const scored = new Set();
  if (listId && (!p.wordStats[listId] || typeof p.wordStats[listId] !== "object")) p.wordStats[listId] = {};
  const stats = listId ? p.wordStats[listId] : {};
  for (const r of results) {
    if (!r || typeof r.w !== "string" || !r.w) continue;
    const prev = Array.isArray(stats[r.w]) ? stats[r.w] : [0, 0, 0];
    const st = [num(prev[0]), num(prev[1]), num(prev[2])];
    st[2] += Math.max(0, Math.floor(num(r.misses)));
    const correct = r.correct === true;
    if (correct && day > 0) {
      if (st[0] === 0) st[0] = day;
      else if (st[1] === 0 && day > st[0]) st[1] = day;
    }
    stats[r.w] = st;

    if (scored.has(r.w)) continue;
    scored.add(r.w);
    if (!correct) continue;
    correctWords += 1;
    const first = isTest || r.firstTry === true;
    const mult = stars.has(r.w) ? CONFIG.xp.starMultiplier : 1;
    roundXp += (first ? CONFIG.xp.firstTry : CONFIG.xp.afterMiss) * mult;
    if (first) roundCoins += CONFIG.coins.firstTry;
  }
  if (perfect) {
    roundXp += CONFIG.xp.perfectRound;
    roundCoins += CONFIG.coins.perfectRound;
  }

  const oldLevel = Math.max(p.level, levelFromXp(p.xp).level);
  p.xp += roundXp;
  p.coins = Math.max(0, p.coins - Math.max(0, num(s.coinsSpent))) + roundCoins;
  events.push({ type: "xp", value: roundXp });
  events.push({ type: "coins", value: roundCoins });

  // Daily goal: correct words per local day, paid once per day.
  // A day earlier than daily.day (clock moved back) skips daily accounting entirely.
  const dailyDay = num(p.daily.day);
  if (day > dailyDay) p.daily = { day, words: 0, claimed: false };
  if (day >= dailyDay) {
    p.daily.words = num(p.daily.words) + correctWords;
    p.daily.claimed = p.daily.claimed === true;
  }
  if (day >= dailyDay && !p.daily.claimed && p.daily.words >= CONFIG.daily.goalWords) {
    p.daily.claimed = true;
    p.xp += CONFIG.xp.dailyGoal;
    p.coins += CONFIG.coins.dailyGoal;
    events.push({ type: "daily", value: { xp: CONFIG.xp.dailyGoal, coins: CONFIG.coins.dailyGoal } });
  }

  // Level: derived from total XP, never lost.
  const newLevel = Math.max(oldLevel, levelFromXp(p.xp).level);
  for (let n = oldLevel + 1; n <= newLevel; n++) bonus.push({ type: "level", value: n });
  p.level = newLevel;

  // Streak and play days. Same day: no change. Next day: +1. Gap (or first play): reset to 1.
  // A day earlier than lastDay (clock moved back) changes neither.
  const last = p.streak.lastDay;
  if (day > last) {
    p.streak.count = (last > 0 && day === last + 1) ? p.streak.count + 1 : 1;
    p.streak.lastDay = day;
    p.playDays += 1;
    bonus.push({ type: "streak", value: p.streak.count });
  }

  // Totals.
  p.totals.words += correctWords;
  p.totals.rounds += 1;
  if (perfect) p.totals.perfect += 1;

  // Creatures: starter c00, then the list creature.
  const hatches = [];
  const grows = [];
  const starterId = CONFIG.creatures.starterId;
  if (p.starter === "egg") {
    p.starter = "baby";
    hatches.push({ creatureId: starterId, listId: null });
  }
  if (p.starter === "baby" && p.playDays >= CONFIG.creatures.starterGrowDays) {
    p.starter = "grown";
    grows.push({ creatureId: starterId, listId: null });
  }
  const words = listWords(list);
  if (listId) {
    let c = p.creatures[listId];
    if (!c || typeof c !== "object") {
      c = { id: eggForList(listId), state: "egg" };
      p.creatures[listId] = c;
    }
    if (c.state !== "baby" && c.state !== "grown") c.state = "egg";
    if (words.length) {
      const allFirst = words.every((w) => Array.isArray(stats[w]) && num(stats[w][0]) > 0);
      const allSecond = words.every((w) => Array.isArray(stats[w]) && num(stats[w][1]) > 0);
      if (c.state === "egg" && allFirst) {
        c.state = "baby";
        hatches.push({ creatureId: c.id, listId });
      }
      if (c.state === "baby" && allSecond) {
        c.state = "grown";
        grows.push({ creatureId: c.id, listId });
      }
    }
  }
  for (const v of hatches) bonus.push({ type: "hatch", value: v });
  for (const v of grows) bonus.push({ type: "grow", value: v });

  // Badges, each once, in CONFIG order.
  const hatchedSpecies = new Set();
  for (const k of Object.keys(p.creatures)) {
    const c = p.creatures[k];
    if (c && hatched(c.state)) hatchedSpecies.add(c.id);
  }
  const starterHatched = hatched(p.starter);
  const earned = {
    "first-round": p.totals.rounds >= 1,
    "streak-3": p.streak.count >= 3,
    "streak-7": p.streak.count >= 7,
    "streak-30": p.streak.count >= 30,
    "perfect": p.totals.perfect >= 1,
    "words-100": p.totals.words >= 100,
    "words-500": p.totals.words >= 500,
    "words-1000": p.totals.words >= 1000,
    "first-hatch": starterHatched || hatchedSpecies.size > 0,
    "all-hatched": starterHatched && CONFIG.creatures.listEggIds.every((id) => hatchedSpecies.has(id))
  };
  for (const b of CONFIG.badges) {
    if (earned[b.id] && !p.badges.includes(b.id)) {
      p.badges.push(b.id);
      bonus.push({ type: "badge", value: b.id });
    }
  }

  return { profile: p, events: events.concat(bonus) };
}

/** @returns {{hatch:number, grow:number}} each 0..1 */
export function eggProgress(profile, list) {
  const words = listWords(list);
  if (!words.length) return { hatch: 0, grow: 0 };
  const id = list && list.id;
  const stats = (profile && profile.wordStats && id && profile.wordStats[id]) || {};
  let first = 0;
  let second = 0;
  for (const w of words) {
    const st = stats[w];
    if (Array.isArray(st)) {
      if (num(st[0]) > 0) first += 1;
      if (num(st[1]) > 0) second += 1;
    }
  }
  return { hatch: first / words.length, grow: second / words.length };
}

/** @returns {string} "c01".."c11" */
export function eggForList(listId) {
  // FNV-1a 32 bit with a final avalanche mix, so similar ids spread over all 11 species.
  let h = 0x811c9dc5;
  const str = String(listId == null ? "" : listId);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  const ids = CONFIG.creatures.listEggIds;
  return ids[(h >>> 0) % ids.length];
}
