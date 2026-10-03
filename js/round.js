// Spell Hatch round engine (card W2). Pure core: no DOM, no storage. Implements CONTRACTS "Answer semantics".
//
//   const r = createRound(list, "type", { eligible, isTest, coins, part, seed, day });
//   while (!r.done()) {
//     const step = r.next();        // { words: Word[], seed, index, total } (null when finished)
//     ...mount the mode with step.words; forward each ctx.onResult(partial) to r.report(partial)...
//     ...a Skip button calls r.skip() (costs CONFIG.coins.skipCost)...
//   }
//   const summary = r.summary();    // RoundSummary for rewards.applyRound
//
// Rules:
// - Words come from opts.eligible (the mode's eligible() output) or list.words, in list order.
// - Lists longer than CONFIG.round.singleSessionMax play in parts of CONFIG.round.partSize (opts.part, 0 based).
// - Inside the part, starred words play last.
// - Batch modes (matching) take up to CONFIG.round.matchingBatch words per step, balanced so the last batch
//   is not smaller than CONFIG.round.matchingMinEligible when that can be avoided.
// - A word with misses > 0, a wrong Test answer is NOT requeued; in practice a missed or skipped word is requeued ONCE.
// - Only the word's FIRST appearance decides firstTry. Final WordResult: correct when any appearance finished
//   without a skip (Test: the typed answer was right), misses and hints summed, skipped when any appearance was skipped.
// - The coin balance is held here: spendCoins(n) and skip() take from it; summary().coinsSpent reports the total.
import { CONFIG } from "../data/config.js";
import { today } from "./clock.js";

/** Number of parts a list of n words plays in. */
export function partCount(n) {
  const R = CONFIG.round;
  return n > R.singleSessionMax ? Math.ceil(n / R.partSize) : 1;
}

/** The words of part `part` (0 based), starred words moved last. */
export function partWords(words, part = 0) {
  const R = CONFIG.round;
  const all = (words || []).filter((x) => x && typeof x.w === "string" && x.w);
  let slice = all;
  if (all.length > R.singleSessionMax) {
    const p = Math.max(0, Math.min(partCount(all.length) - 1, Math.floor(Number(part) || 0)));
    slice = all.slice(p * R.partSize, (p + 1) * R.partSize);
  }
  return slice.filter((x) => !x.star).concat(slice.filter((x) => x.star));
}

/**
 * @param {object} list  List (id, words)
 * @param {string} mode  "type"|"build"|"matching"|"choice"|"gap"
 * @param {{eligible?:object[], isTest?:boolean, coins?:number, part?:number, seed?:number, day?:number, batch?:boolean, batchSize?:number}} [opts]
 */
export function createRound(list, mode, opts) {
  const o = opts || {};
  const isTest = o.isTest === true && mode === "type";
  const batch = typeof o.batch === "boolean" ? o.batch : mode === "matching";
  const batchSize = Math.max(1, o.batchSize || CONFIG.round.matchingBatch);
  const source = Array.isArray(o.eligible) ? o.eligible : (list && list.words) || [];
  // De-duplicate by word, keep the first entry
  const seen = new Set();
  const uniq = source.filter((x) => x && typeof x.w === "string" && !seen.has(x.w) && seen.add(x.w));
  const words = partWords(uniq, o.part);
  const baseSeed = Number.isFinite(o.seed) ? Math.floor(o.seed) : Math.floor(Math.random() * 1e9);

  let coins = Math.max(0, Math.floor(Number(o.coins) || 0));
  let coinsSpent = 0;
  let stepNo = 0;
  const queue = words.map((w) => ({ word: w, n: 1 }));   // n: appearance number
  const rec = new Map();       // w -> record
  const order = [];            // first-appearance order
  let current = null;          // { entries: [{word,n}], reported: Set }

  function record(w) {
    if (!rec.has(w)) {
      rec.set(w, { w, firstTry: false, firstDone: false, correct: false, misses: 0, hintsUsed: 0, skipped: false, ms: 0, requeued: false });
      order.push(w);
    }
    return rec.get(w);
  }

  function apply(entry, partial) {
    const r = record(entry.word.w);
    const misses = Math.max(0, Math.floor(Number(partial.misses) || 0));
    const hints = Math.max(0, Math.floor(Number(partial.hintsUsed) || 0));
    const skipped = partial.skipped === true;
    const correct = !skipped && partial.correct !== false;
    r.misses += misses;
    r.hintsUsed += hints;
    r.ms += Math.max(0, Number(partial.ms) || 0);
    if (skipped) r.skipped = true;
    if (correct) r.correct = true;
    if (entry.n === 1 && !r.firstDone) {
      r.firstDone = true;
      r.firstTry = correct && misses === 0 && hints === 0;
    }
    const needsAgain = skipped || misses > 0 || !correct;
    if (!isTest && CONFIG.round.requeueOnce && entry.n === 1 && needsAgain && !r.requeued) {
      r.requeued = true;
      queue.push({ word: entry.word, n: 2 });
    }
  }

  const api = {
    isTest,
    batch,
    /** Words in this round (first appearances), in play order. */
    words: () => words.slice(),
    /** Total planned appearances so far (grows when a word is requeued). */
    total: () => words.length + order.filter((w) => rec.get(w).requeued).length,
    /** Finished appearances. */
    finished: () => api.total() - queue.length - (current ? current.entries.length - current.reported.size : 0),
    coins: () => coins,
    coinsSpent: () => coinsSpent,
    spendCoins(n) {
      const c = Math.max(0, Math.floor(Number(n) || 0));
      if (coins < c) return false;
      coins -= c; coinsSpent += c;
      return true;
    },
    canSkip: () => !isTest && !!current && current.reported.size < current.entries.length && coins >= CONFIG.coins.skipCost,
    /** Next step: { words, seed, index } or null when the round is over. Unreported words of the previous step are dropped as skipped. */
    next() {
      if (current) {
        for (const e of current.entries) if (!current.reported.has(e.word.w)) apply(e, { w: e.word.w, misses: 0, hintsUsed: 0, skipped: true, ms: 0, correct: false });
        current = null;
      }
      if (!queue.length) return null;
      // Batches never leave a tiny last screen: when the rest after a full batch would be under
      // CONFIG.round.matchingMinEligible words, split evenly instead (7 words play as 4 + 3, not 6 + 1).
      let take = batch ? Math.min(batchSize, queue.length) : 1;
      const minLast = CONFIG.round.matchingMinEligible;
      if (batch && queue.length > batchSize && queue.length - batchSize < minLast) take = Math.ceil(queue.length / 2);
      const entries = queue.splice(0, take);
      current = { entries, reported: new Set() };
      for (const e of entries) record(e.word.w);
      stepNo += 1;
      return { words: entries.map((e) => e.word), seed: (baseSeed + stepNo * 7919) >>> 0, index: stepNo, repeat: entries.every((e) => e.n === 2) };
    },
    /** Forward a mode's onResult partial. Returns true when it was accepted. Once per word per step. */
    report(partial) {
      if (!current || !partial || typeof partial.w !== "string") return false;
      const e = current.entries.find((x) => x.word.w === partial.w);
      if (!e || current.reported.has(e.word.w)) return false;
      current.reported.add(e.word.w);
      apply(e, isTest ? { ...partial, hintsUsed: 0, skipped: false } : partial);
      return true;
    },
    /** True when every word of the current step has reported. */
    stepComplete: () => !current || current.reported.size >= current.entries.length,
    /** Skip the current step's unreported words. Costs CONFIG.coins.skipCost once. Not in Test mode. */
    skip() {
      if (!api.canSkip()) return false;
      api.spendCoins(CONFIG.coins.skipCost);
      for (const e of current.entries) {
        if (current.reported.has(e.word.w)) continue;
        current.reported.add(e.word.w);
        apply(e, { w: e.word.w, misses: 0, hintsUsed: 0, skipped: true, ms: 0, correct: false });
      }
      return true;
    },
    done: () => queue.length === 0 && (!current || current.reported.size >= current.entries.length),
    /** WordResult[] in first-appearance order. */
    results() {
      return order.map((w) => {
        const r = rec.get(w);
        return { w, correct: r.correct, firstTry: r.firstTry, misses: r.misses, hintsUsed: r.hintsUsed, skipped: r.skipped, ms: Math.round(r.ms) };
      });
    },
    /** RoundSummary for rewards.applyRound. */
    summary() {
      const results = api.results();
      const perfect = results.length > 0 && (isTest ? results.every((r) => r.correct) : results.every((r) => r.firstTry && r.correct && !r.skipped));
      return {
        listId: (list && list.id) || "",
        mode,
        results,
        perfect,
        coinsSpent,
        isTest,
        day: Number.isFinite(o.day) ? o.day : today()
      };
    }
  };
  return api;
}
