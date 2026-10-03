// Spell Hatch distractor engine (card W1-C). Pure, seeded, no DOM, no network.
// Contract: CONTRACTS.md v1.2. Export names, parameters and defaults are frozen.
//
// makeDistractors(word, n, seed, dict)
//   Look-alike misspellings built from spelling rule families (doubles, vowel teams, silent letters,
//   -tion/-sion/-shun, c/k/ck, ph/f, -le/-el/-al, soft c/s, adjacent swap, dropped letter, schwa vowel).
//   Each pick prefers a family not used yet. Filtered: never the target, never a dict word (plus a small
//   built-in homophone list), unique, length within 2 of the target, no triple letters, no rude words.
//   Apostrophes, hyphens and any other non-letter characters stay exactly where they are.
//   Seeded random edits are the last resort, so any word with 2+ letters always yields exactly n.
//   1-letter words: returns as many as can be found (normally n), never the word itself, never throws.
// pickGaps(word, seed)
//   Indices to blank for Fill the Gap: rule sites first (silent letters, -tion, doubles, vowel teams,
//   ph, ck), then vowels. 1..ceil(letters/3) indices, at least 1 letter visible, never punctuation.
//   Words with fewer than 3 letters return [] (gap mode excludes them).
// decoyLetters(word, gaps, n, seed)
//   n distinct lowercase letters, none equal to a missing letter: vowels for vowel gaps,
//   look-alike or sound-alike consonants otherwise, then common letters.
import { DICT } from "../data/dictionary.js";
import { BLOCKED } from "../data/blocklist.js";
import { NAMES } from "../data/names.js";

const ABC = "abcdefghijklmnopqrstuvwxyz";
const VOWELS = "aeiou";
const isLetter = (ch) => ch >= "a" && ch <= "z";
const isVowel = (ch) => VOWELS.includes(ch);
const isCons = (ch) => isLetter(ch) && !isVowel(ch);

// mulberry32 seeded PRNG: returns a function giving floats in [0, 1).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FNV-1a, so seed 0 still gives each word its own order.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function seedNum(seed) {
  const x = Number(seed);
  return Number.isFinite(x) ? (Math.floor(x) >>> 0) : 0;
}
function makeRng(word, seed, salt) {
  return mulberry32((hashStr(word) ^ Math.imul(seedNum(seed) + 1, 0x9e3779b1) ^ salt) >>> 0);
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function norm(word) {
  return typeof word === "string" ? word.trim().toLowerCase() : "";
}

// Always rejected, whatever dict is passed: common real words that are classic misspelling traps.
const HOMOPHONES = new Set((
  "there their they're where wear were we're your you're to too two its it's here hear know no knew new " +
  "right write rite wright night knight knit which witch whether weather would wood whole hole one won " +
  "for four fore by buy bye see sea be bee ate eight son sun our hour peace piece week weak meet meat " +
  "flower flour tail tale pair pear pare mail male road rode rowed blue blew dear deer plain plane made maid " +
  "sale sail hair hare red read reed not knot nose knows wait weight way weigh break brake threw through " +
  "great grate steel steal allowed aloud cent sent scent fair fare bear bare whose who's than then " +
  "accept except affect effect loose lose quiet quite were wore war ware wise whys hi high hie so sew sow " +
  "some sum need knead kneed wring ring wrap rap wrote rote lamb lam climb clime thumb thum comb come " +
  "tow toe sight site cite might mite fight light lit kite bite whit white wit with dew due do " +
  "nun none" ).split(" "));
// Small rude-word guard (stored reversed so the source stays clean). A candidate containing one is rejected
// unless the target itself contains it.
const RUDE = ["kcuf", "tihs", "tnuc", "ssip", "kcid", "kcoc", "tuls", "erohw", "gaf", "ggin", "hctib", "nmad", "parc", "ssa", "ttub", "xes", "tit", "traf", "muc", "esra"]
  .map((s) => s.split("").reverse().join(""));

// Variant-aware form (CONTRACTS 1.3): lowercase, ph -> f, ck/c/q -> k, z -> s, doubled letters collapsed,
// a trailing e dropped. A candidate is blocked when it, or any apostrophe or hyphen token of it, matches a
// BLOCKED word exactly or after both are normalized this way.
function blockNorm(w) {
  let s = String(w).trim().toLowerCase().replace(/ph/g, "f").replace(/ck/g, "k").replace(/[cq]/g, "k").replace(/z/g, "s");
  s = s.replace(/([a-z])\1+/g, "$1");
  if (s.length > 1 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}
const setSize = (x) => (x && (x.size ?? x.length)) || 0;
const iterable = (x) => x && typeof x[Symbol.iterator] === "function";
let blockedLower = null, blockedNorm = null, blockedSize = -1, namesLower = null, namesSize = -1;
function isBlocked(c, keep) {
  if (iterable(BLOCKED) && (!blockedLower || setSize(BLOCKED) !== blockedSize)) {   // rebuilt if the list grows
    blockedLower = new Set([...BLOCKED].map((w) => String(w).trim().toLowerCase()));
    blockedNorm = new Set([...blockedLower].map(blockNorm).filter(Boolean));
    blockedSize = setSize(BLOCKED);
  }
  if (iterable(NAMES) && (!namesLower || setSize(NAMES) !== namesSize)) {
    namesLower = new Set([...NAMES].map((w) => String(w).trim().toLowerCase()));
    namesSize = setSize(NAMES);
  }
  // tokens copied unchanged from the target (the t in don't) are not judged; the edited ones are
  const forms = [c, ...c.split(/['-]/).filter((t) => t && !(keep && keep.has(t)))];
  for (const f of forms) {
    if (blockedLower && (blockedLower.has(f) || blockedNorm.has(blockNorm(f)))) return true;
    if (namesLower && namesLower.has(f)) return true;
  }
  return false;
}

// Split into letter runs and the fixed characters between them. Edits happen inside one run at a time.
function segments(w) {
  const parts = []; let cur = ""; const seps = [];
  for (const ch of w) {
    if (isLetter(ch)) cur += ch;
    else { parts.push(cur); seps.push(ch); cur = ""; }
  }
  parts.push(cur);
  return { parts, seps };
}
function join(parts, seps) {
  let s = parts[0];
  for (let i = 0; i < seps.length; i++) s += seps[i] + parts[i + 1];
  return s;
}

// Every match index of a literal substring.
function allIdx(s, sub) {
  const out = []; let i = s.indexOf(sub);
  while (i >= 0) { out.push(i); i = s.indexOf(sub, i + 1); }
  return out;
}
const rep = (s, i, len, by) => s.slice(0, i) + by + s.slice(i + len);

// ---- Rule families: each maps one letter run to candidate runs ----
const LETTER_SUBS = [ // [from, [to...]] literal substring swaps, applied at every occurrence
  // vowel teams
  ["vowel", [["ea", ["ee", "e"]], ["ee", ["ea", "e"]], ["ie", ["ei"]], ["ei", ["ie", "ee"]], ["ai", ["ay", "a"]],
    ["ay", ["ai", "ey"]], ["ou", ["ow", "o", "oo"]], ["ow", ["ou", "o"]], ["oa", ["ow", "o"]], ["oo", ["u", "ew", "o"]],
    ["au", ["aw", "o"]], ["aw", ["au"]], ["ue", ["oo", "ew"]], ["ew", ["oo", "ue"]], ["oi", ["oy"]], ["oy", ["oi"]],
    ["ight", ["ite", "it"]], ["igh", ["i", "ie", "y"]], ["ey", ["ay", "y"]]]],
  // silent letters (removal, or the sound written plainly)
  ["silent", [["kn", ["n"]], ["wr", ["r"]], ["mb", ["m"]], ["gh", ["", "g"]], ["wh", ["w"]], ["gn", ["n"]], ["ps", ["s"]],
    ["ould", ["ood", "oud"]], ["sten", ["sen"]], ["stle", ["sle", "sel"]], ["isl", ["il"]], ["alk", ["ak", "awk"]],
    ["alm", ["am"]], ["bt", ["t"]], ["rh", ["r"]], ["augh$", ["aff", "arf"]], ["ough$", ["uf", "uff"]]]],
  // -tion / -sion / -shun
  ["tion", [["tion", ["sion", "shun", "shion"]], ["ssion", ["tion", "shun"]], ["sion", ["tion", "shun", "zhun"]],
    ["cian", ["tion", "shun"]], ["cial", ["tial", "shal", "sial"]], ["tial", ["cial", "shal"]], ["ture", ["cher", "chur"]],
    ["cious", ["shus", "tious"]], ["tious", ["cious", "shus"]]]],
  // c / k / ck and hard ch
  ["ck", [["ck", ["k", "c", "kk"]], ["sch", ["sk", "sc"]], ["chr", ["kr"]], ["qu", ["kw"]]]],
  // ph / f
  ["ph", [["ph", ["f"]], ["ff", ["ph", "f"]]]],
];
const SUB_FAMILY = new Map(LETTER_SUBS);

function famSubs(run, table) {
  const out = [];
  for (const [pat, tos] of table) {
    const endOnly = pat.endsWith("$");            // "augh$" matches only at the end of the run
    const from = endOnly ? pat.slice(0, -1) : pat;
    for (const i of allIdx(run, from)) {
      if (endOnly && i + from.length !== run.length) continue;
      for (const to of tos) out.push(rep(run, i, from.length, to));
    }
  }
  return out;
}
function famDouble(run) {
  const out = [];
  for (let i = 0; i < run.length; i++) {
    const c = run[i];
    if (!isCons(c)) continue;
    if (run[i + 1] === c) { out.push(rep(run, i, 2, c)); continue; }       // undouble
    if (run[i - 1] === c) continue;
    if (i === 0 || "hjqvwxy".includes(c) || !isVowel(run[i - 1])) continue; // implausible doubles
    const nx = run[i + 1];
    // double between vowels (necessary -> neccessary), before l or r, or a final l, s or f (until -> untill)
    if ((nx && (isVowel(nx) || "lr".includes(nx))) || (!nx && "lsf".includes(c))) out.push(rep(run, i, 1, c + c));
  }
  return out;
}
function famSilentE(run) {
  const out = [];
  const n = run.length;
  // magic e after a single vowel: drop it (write -> writ) or write the vowel as a team (phone -> phoan)
  if (n >= 3 && run[n - 1] === "e" && isCons(run[n - 2]) && isVowel(run[n - 3]) && !isVowel(run[n - 4] || "")) {
    out.push(run.slice(0, -1));
    const team = { a: ["ai", "ay"], o: ["oa", "ow"], i: ["igh", "ie"], e: ["ee", "ea"], u: ["oo", "ew"] }[run[n - 3]] || [];
    for (const t of team) out.push(run.slice(0, n - 3) + t + run[n - 2]);
  }
  return out;
}
function famC(run) {
  const out = [];
  for (let i = 0; i < run.length; i++) {
    const c = run[i], nx = run[i + 1], pv = run[i - 1];
    if (c === "c" && nx !== "k" && nx !== "h") {
      if (nx && "eiy".includes(nx)) out.push(rep(run, i, 1, "s"));         // soft c: necessary -> nesessary
      else if (pv !== "c") out.push(rep(run, i, 1, "k"));                   // hard c: because -> bekause
      if (!nx && pv !== "c") out.push(run + "k");                           // magic -> magick
    }
    if (c === "k" && pv !== "c" && pv !== "s" && nx !== "n" && nx !== "k") out.push(rep(run, i, 1, nx && "eiy".includes(nx) ? "ck" : "c"));
    if (c === "s" && nx && "eiy".includes(nx) && pv !== "s" && i > 0) out.push(rep(run, i, 1, "c"));
  }
  return out;
}
function famEnding(run) {
  const out = []; const n = run.length;
  if (n < 4) return out;
  const end = run.slice(-2);
  const alts = { le: ["el", "al", "ul"], el: ["le", "al"], al: ["le", "el", "ul"], il: ["le", "al"] }[end];
  if (alts && isCons(run[n - 3])) for (const a of alts) out.push(run.slice(0, -2) + a);
  const end3 = run.slice(-3);
  const alts3 = { ful: ["full"], ous: ["us", "ious"], ent: ["ant"], ant: ["ent"], ary: ["ery", "ry"], ery: ["ary"] }[end3];
  if (alts3) for (const a of alts3) out.push(run.slice(0, -3) + a);
  if (run.endsWith("ence")) out.push(run.slice(0, -4) + "ance");
  if (run.endsWith("ance")) out.push(run.slice(0, -4) + "ence");
  return out;
}
// Inner-only swaps: ph -> ff and x -> ks are odd at the start of a word (ffone, ksray).
function famInner(run) {
  const out = [];
  for (const i of allIdx(run, "ph")) if (i > 0) out.push(rep(run, i, 2, "ff"));
  for (const i of allIdx(run, "x")) if (i > 0) out.push(rep(run, i, 1, "ks"), rep(run, i, 1, "cks"));
  return out;
}
function famSwap(run) {
  const out = [];
  // transpose two adjacent vowels only (freind, thier); never touches the first letter
  for (let i = 1; i < run.length - 1; i++) {
    if (run[i] !== run[i + 1] && isVowel(run[i]) && isVowel(run[i + 1])) out.push(run.slice(0, i) + run[i + 1] + run[i] + run.slice(i + 2));
  }
  return out;
}
// Consonant pairs that read naturally at the start of a word, and inside one when a dropped vowel joins two consonants.
const ONSETS = new Set("bl br ch cl cr dr fl fr gl gr pl pr sc sh sk sl sm sn sp st sw th tr tw wh wr".split(" "));
const JOINS = new Set(("bl br ch cl cr dr fl fr gl gr pl pr sc sh sk sl sm sn sp st sw th tr tw " +
  "nd nt ns nc ng nk mp rt rd rn rm rl rs rk rc rg rb ld lt lf lm lp lk ls ct pt ft").split(" "));
function famDrop(run) {
  const out = [];
  if (run.length < 4) return out;
  for (let i = 1; i < run.length - 1; i++) {
    const c = run[i], pv = run[i - 1], nx = run[i + 1];
    // one letter of a doubled consonant pair (rabit, litle)
    if (isCons(c) && nx === c) { out.push(rep(run, i, 1, "")); continue; }
    // an unstressed vowel between consonants, after the first vowel, when the join reads naturally (choclate)
    if (isVowel(c) && isCons(pv) && isCons(nx) && /[aeiou]/.test(run.slice(0, i - 1)) && /[aeiouy]/.test(run.slice(i + 1)) && JOINS.has(pv + nx)) {
      out.push(rep(run, i, 1, ""));
    }
  }
  return out;
}
function famSchwa(run) {
  const out = [];
  const map = { a: ["e", "u", "i"], e: ["i", "a"], i: ["e", "y"], o: ["u", "a"], u: ["o", "a"] };
  for (let i = 1; i < run.length; i++) {
    const c = run[i];
    if (!map[c] || isVowel(run[i - 1]) || isVowel(run[i + 1] || "")) continue; // single vowels only
    for (const v of map[c]) out.push(rep(run, i, 1, v));
  }
  return out;
}

// Family list: [name, isRuleFamily, fn]. Rule families target spelling rule sites and are tried first.
const FAMILIES = [
  ["double", true, famDouble],
  ["vowel", true, (r) => famSubs(r, SUB_FAMILY.get("vowel"))],
  ["silent", true, (r) => famSubs(r, SUB_FAMILY.get("silent")).concat(famSilentE(r))],
  ["tion", true, (r) => famSubs(r, SUB_FAMILY.get("tion"))],
  ["ck", true, (r) => famSubs(r, SUB_FAMILY.get("ck")).concat(famC(r))],
  ["ph", true, (r) => famSubs(r, SUB_FAMILY.get("ph")).concat(famInner(r))],
  ["ending", true, famEnding],
  ["schwa", false, famSchwa],
  ["swap", false, famSwap],
  ["drop", false, famDrop],
];

// Hard filter: the contract rules. Never relaxed.
function makeFilter(target, dict) {
  const keepTokens = new Set(target.split(/['-]/).filter(Boolean));
  const flatTarget = target.replace(/['-]/g, "");
  const has = (s) => {
    if (!dict || typeof dict.has !== "function") return false;
    return dict.has(s) || dict.has(s[0].toUpperCase() + s.slice(1));
  };
  return (c, seen) => {
    if (!c || c === target || seen.has(c)) return false;
    if (Math.abs(c.length - target.length) > 2) return false;
    if (!/[a-z]/.test(c)) return false;
    if (/([a-z])\1\1/.test(c)) return false;
    if (HOMOPHONES.has(c) || has(c)) return false;
    // the same word written without its apostrophe or hyphen counts as real too (dont, its)
    if (/['-]/.test(c) && has(c.replace(/['-]/g, ""))) return false;
    // shared child-safety blocklist (data/blocklist.js): the whole candidate or any token split on ' or -
    if (isBlocked(c, keepTokens)) return false;
    // the same checks with apostrophes and hyphens removed, so cun't cannot hide a rude word
    const flat = c.replace(/['-]/g, "");
    if (flat !== c && isBlocked(flat, null)) return false;
    // fallback: rude substrings, unless the target itself contains one
    for (const r of RUDE) if ((c.includes(r) || flat.includes(r)) && !target.includes(r) && !flatTarget.includes(r)) return false;
    return true;
  };
}

// Letter trigrams of real words, built once per dictionary on first use.
const TRI_CACHE = new WeakMap();
function trigramsOf(dict) {
  if (!dict || typeof dict !== "object" || typeof dict[Symbol.iterator] !== "function") return null;
  let t = TRI_CACHE.get(dict);
  if (t) return t;
  t = new Set();
  for (const w of dict) {
    const s = String(w).toLowerCase();
    for (const run of s.split(/[^a-z]+/)) for (let i = 0; i + 3 <= run.length; i++) t.add(run.slice(i, i + 3));
  }
  TRI_CACHE.set(dict, t);
  return t;
}
const consClusters = (s) => s.match(/[bcdfghjklmnpqrstvwxz]{3,}/g) || [];
const onsetOf = (s) => { const m = s.match(/^[bcdfghjklmnpqrstvwxz]{2}/); return m ? m[0] : ""; };
const trisOfWord = (w) => {
  const t = new Set();
  for (const run of w.split(/[^a-z]+/)) for (let i = 0; i + 3 <= run.length; i++) t.add(run.slice(i, i + 3));
  return t;
};

// Quality filter: looks like a believable try at the word. Relaxed only when nothing else is left.
function makeQuality(target, dict) {
  // Trigram check uses the bundled DICT (and the passed dict too, when it is a different large one).
  const tris = [trigramsOf(DICT), dict !== DICT ? trigramsOf(dict) : null].filter((t) => t && t.size > 500);
  const tTris = trisOfWord(target);
  const tClusters = consClusters(target);
  const tOnsets = target.split(/[^a-z]+/).map(onsetOf);
  const rare = [..."qxzjv"].filter((l) => !target.includes(l));
  return (c) => {
    const runs = c.split(/[^a-z]+/);
    for (const run of runs) if (run.length >= 2 && !/[aeiouy]/.test(run)) return false;
    if (!/[aeiouy]/.test(c)) return false;
    if (consClusters(c).some((cl) => !tClusters.some((t) => t.includes(cl)))) return false;
    for (let k = 0; k < runs.length; k++) {
      const on = onsetOf(runs[k]);
      if (on && on !== tOnsets[k] && !ONSETS.has(on)) return false;
    }
    for (const l of rare) if (c.includes(l)) return false;
    if (tris.length) {
      for (const g of trisOfWord(c)) if (!tTris.has(g) && !tris.some((t) => t.has(g))) return false;
    }
    return true;
  };
}

// Apply a run-level family to every run of the word, keeping separators fixed.
function familyCandidates(fn, seg) {
  const out = [];
  seg.parts.forEach((run, k) => {
    if (!run) return;
    for (const v of fn(run)) {
      if (!v || v === run) continue;
      const parts = seg.parts.slice(); parts[k] = v;
      out.push(join(parts, seg.seps));
    }
  });
  return out;
}

const LOOKALIKE = {
  a: "eou", b: "dpv", c: "ksx", d: "bt", e: "aio", f: "vt", g: "jqk", h: "nk", i: "eyl", j: "gi",
  k: "cgx", l: "itr", m: "nw", n: "mhu", o: "aue", p: "bqd", q: "pg", r: "nlw", s: "zc", t: "dfl",
  u: "ova", v: "fwb", w: "vm", x: "ksz", y: "iej", z: "sx",
};
const SOUNDALIKE = { b: "p", c: "k", d: "t", f: "v", g: "k", k: "c", m: "n", n: "m", p: "b", s: "c", t: "d", v: "f", z: "s", x: "ks" };
const VOWEL_SUBS = { a: ["e", "u", "i", "o", "ai"], e: ["a", "i", "u", "ee", "ea"], i: ["e", "y", "a", "ie"], o: ["u", "a", "oa", "oe"], u: ["o", "a", "oo"], y: ["i", "ie", "ey", "ee"] };

// Phonetic fallback edits for one run: vowel swaps (single and paired), c/k, s/c, ck/k, final e add/drop,
// a doubled final consonant, and for words over 4 letters a sound-alike consonant.
function phoneticRun(run) {
  const out = [];
  const n = run.length;
  const vpos = [];
  for (let i = 0; i < n; i++) if (VOWEL_SUBS[run[i]] && !(run[i] === "y" && i === 0)) vpos.push(i);
  for (const i of vpos) for (const v of VOWEL_SUBS[run[i]]) out.push(rep(run, i, 1, v));
  for (let i = 0; i < n; i++) {
    const c = run[i], nx = run[i + 1];
    if (c === "c" && nx !== "h" && nx !== "k") out.push(rep(run, i, 1, nx && "eiy".includes(nx) ? "s" : "k"));
    if (c === "k" && run[i - 1] !== "c") out.push(rep(run, i, 1, "c"), rep(run, i, 1, "ck"));
    if (c === "c" && nx === "k") out.push(rep(run, i, 2, "k"));
    if (c === "s" && nx && "eiy".includes(nx)) out.push(rep(run, i, 1, "c"));
    if (n > 4 && i > 0 && SOUNDALIKE[c]) out.push(rep(run, i, 1, SOUNDALIKE[c]));
  }
  if (n >= 2 && isCons(run[n - 1]) && !"hjqvwxy".includes(run[n - 1])) out.push(run + "e");
  if (n >= 3 && run[n - 1] === "e" && isCons(run[n - 2])) out.push(run.slice(0, -1));
  if (n >= 2 && isCons(run[n - 1]) && isVowel(run[n - 2]) && "bdgklmnprst".includes(run[n - 1])) out.push(run + run[n - 1]);
  // two vowel changes at once (short words run out of single edits fast)
  for (let a = 0; a < vpos.length; a++) for (let b = a + 1; b < vpos.length; b++) {
    for (const v1 of VOWEL_SUBS[run[vpos[a]]].slice(0, 3)) for (const v2 of VOWEL_SUBS[run[vpos[b]]].slice(0, 3)) {
      if (v1.length === 1 && v2.length === 1) out.push(rep(rep(run, vpos[b], 1, v2), vpos[a], 1, v1));
    }
  }
  return out;
}

// Emergency only: seeded single edits (look-alike, any letter, insertion), then two-letter substitutions.
function rawEdits(seg, rng) {
  const out = [];
  const runIdx = seg.parts.map((r, k) => k).filter((k) => seg.parts[k].length > 0);
  const single = [];
  for (const k of runIdx) {
    const run = seg.parts[k];
    for (let i = 0; i < run.length; i++) {
      for (const l of LOOKALIKE[run[i]] || "") single.push([0, k, rep(run, i, 1, l)]);
      for (const l of ABC) if (l !== run[i]) single.push([1, k, rep(run, i, 1, l)]);
    }
    for (let i = 0; i <= run.length; i++) for (const l of ABC) single.push([2, k, run.slice(0, i) + l + run.slice(i)]);
  }
  for (const [, k, v] of [0, 1, 2].flatMap((tier) => shuffle(single.filter((x) => x[0] === tier), rng))) {
    const parts = seg.parts.slice(); parts[k] = v; out.push(join(parts, seg.seps));
  }
  for (const k of runIdx) {
    const run = seg.parts[k];
    const pos = shuffle([...Array(run.length).keys()], rng);
    for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) {
      for (const l1 of shuffle([...ABC], rng).slice(0, 6)) for (const l2 of shuffle([...ABC], rng).slice(0, 6)) {
        const parts = seg.parts.slice(); parts[k] = rep(rep(run, pos[a], 1, l1), pos[b], 1, l2);
        out.push(join(parts, seg.seps));
      }
    }
  }
  return out;
}

/** @returns {string[]} never the word, never in dict, unique */
export function makeDistractors(word, n = 3, seed = 0, dict = DICT) {
  const target = norm(word);
  const want = Math.max(0, Math.floor(Number(n) || 0));
  if (!target || !want || !/[a-z]/.test(target)) return [];
  const seg = segments(target);
  const ok = makeFilter(target, dict);
  const good = makeQuality(target, dict);
  const rng = makeRng(target, seed, 0x51ed);

  // Each family's candidates in a seeded order; those failing the quality filter go to a reserve.
  const seen = new Set();
  const pools = [];
  const reserve = [];
  for (const [name, isRule, fn] of FAMILIES) {
    const valid = [];
    const local = new Set();
    for (const c of shuffle(familyCandidates(fn, seg), rng)) {
      if (local.has(c) || !ok(c, seen)) continue;
      local.add(c);
      (good(c) ? valid : reserve).push(c);
    }
    if (valid.length) pools.push({ name, isRule, items: valid });
  }
  // Rule families first (seeded order), then the generic ones; one pick per family per pass.
  const order = shuffle(pools.filter((p) => p.isRule), rng).concat(shuffle(pools.filter((p) => !p.isRule), rng));
  const out = [];
  const take = (c) => { if (out.length < want && ok(c, seen)) { seen.add(c); out.push(c); } };
  let progress = true;
  while (out.length < want && progress) {
    progress = false;
    for (const p of order) {
      if (out.length >= want) break;
      while (p.items.length) {
        const before = out.length;
        take(p.items.shift());
        if (out.length > before) { progress = true; break; }
      }
    }
  }
  // Then phonetic swaps that pass the quality filter, then the reserve, then the remaining phonetic swaps,
  // then raw edits (quality first). The contract filter applies at every step.
  const phon = out.length < want ? shuffle(familyCandidates(phoneticRun, seg), rng) : [];
  for (const c of phon) if (good(c)) take(c);
  for (const c of reserve) take(c);
  for (const c of phon) take(c);
  if (out.length < want) {
    const raw = rawEdits(seg, rng);
    for (const c of raw) { if (out.length >= want) break; if (good(c)) take(c); }
    for (const c of raw) { if (out.length >= want) break; take(c); }
  }
  return out;
}

// ---- Fill the Gap ----

// Rule sites as index groups with a priority (1 = spelling rule site, 2 = softer site).
function findSites(w) {
  const sites = [];
  const add = (idx, pri) => { if (idx.every((i) => isLetter(w[i] || ""))) sites.push({ idx, pri }); };
  const runStart = (i) => i === 0 || !isLetter(w[i - 1]);
  const runEnd = (i) => i >= w.length || !isLetter(w[i]);
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2), three = w.slice(i, i + 3), four = w.slice(i, i + 4);
    // silent letters
    if (two === "kn" && runStart(i)) add([i], 1);
    if (two === "wr" && runStart(i)) add([i], 1);
    if (two === "gn" && (runStart(i) || runEnd(i + 2))) add([i], 1);
    if (two === "ps" && runStart(i)) add([i], 1);
    if (two === "mb" && runEnd(i + 2)) add([i + 1], 1);
    if (two === "wh") add([i + 1], 1);
    if (two === "gh") add([i, i + 1], 1);
    if (two === "bt") add([i], 1);
    if (four === "ould") add([i + 2], 1);
    if (four === "sten" || four === "stle") add([i + 1], 1);
    if (three === "isl") add([i + 1], 1);
    if (three === "nsw" || three === "swo") add([i + 1 + (three === "nsw" ? 1 : 0)], 1);
    if (three === "alk" || three === "alm") add([i + 1], 1);
    // -tion, -sion, -cian, -cial, -tial
    if (four === "tion" || four === "sion" || four === "cian" || four === "cial" || four === "tial") add([i, i + 1], 1);
    // ph, ck, sch
    if (two === "ph" || two === "ck") add([i, i + 1], 1);
    if (three === "sch") add([i + 1, i + 2], 1);
    // double consonants
    if (isCons(w[i]) && w[i + 1] === w[i]) add([i, i + 1], 1);
    // vowel teams
    if (["ea", "ee", "ie", "ei", "ai", "ay", "ou", "ow", "oa", "oo", "au", "aw", "ue", "ew", "oi", "oy", "ey"].includes(two)) add([i, i + 1], 1);
    // softer sites: soft c, -le/-el/-al endings
    if (w[i] === "c" && "eiy".includes(w[i + 1] || "_")) add([i], 2);
    if ((two === "le" || two === "el" || two === "al") && runEnd(i + 2) && i > 0 && isCons(w[i - 1])) add([i, i + 1], 2);
  }
  // final silent (magic) e
  for (let i = 2; i < w.length; i++) {
    if (w[i] === "e" && runEnd(i + 1) && isCons(w[i - 1]) && isVowel(w[i - 2])) add([i], 1);
  }
  return sites;
}

/** @returns {number[]} indices to blank */
export function pickGaps(word, seed = 0) {
  const w = norm(word);
  const letterIdx = [];
  for (let i = 0; i < w.length; i++) if (isLetter(w[i])) letterIdx.push(i);
  if (letterIdx.length < 3) return [];
  const max = Math.min(Math.ceil(letterIdx.length / 3), letterIdx.length - 1);
  const rng = makeRng(w, seed, 0x6a95);
  const sites = findSites(w);
  const ordered = [1, 2].flatMap((p) => shuffle(sites.filter((s) => s.pri === p), rng));
  const chosen = new Set();
  const fits = (idx) => idx.every((i) => !chosen.has(i)) && chosen.size + idx.length <= max;
  for (const s of ordered) if (fits(s.idx)) s.idx.forEach((i) => chosen.add(i));
  // nothing fit whole: blank part of the top site
  if (!chosen.size && ordered.length) chosen.add(ordered[0].idx[0]);
  // then vowels (y counts when it is not the first letter), then any letter
  const vowels = letterIdx.filter((i) => isVowel(w[i]) || (w[i] === "y" && i > 0));
  for (const i of shuffle(vowels, rng)) if (chosen.size < max && !chosen.has(i)) chosen.add(i);
  if (!chosen.size) chosen.add(shuffle(letterIdx, rng)[0]);
  return [...chosen].sort((a, b) => a - b);
}

/** @returns {string[]} */
export function decoyLetters(word, gaps, n = 3, seed = 0) {
  const w = norm(word);
  const want = Math.max(0, Math.floor(Number(n) || 0));
  const missing = new Set();
  for (const g of Array.isArray(gaps) ? gaps : []) {
    const ch = w[g];
    if (Number.isInteger(g) && ch && isLetter(ch)) missing.add(ch);
  }
  const rng = makeRng(w, seed, 0x7c3d);
  const missingList = [...missing];
  // Tier 1: plausible for the missing letters (vowels for vowels, look-alikes for consonants).
  let tier1 = [];
  for (const m of missingList) {
    if (isVowel(m)) tier1.push(...VOWELS, "y");
    else tier1.push(...(LOOKALIKE[m] || ""));
  }
  tier1 = shuffle([...new Set(tier1)], rng);
  // Tier 2: common letters; tier 3: the rest of the alphabet.
  const common = missingList.length && missingList.every(isVowel) ? [...VOWELS, "y"] : [..."etaoinsrhld"];
  const tier2 = shuffle(common, rng);
  const tier3 = shuffle([...ABC], rng);
  // Letters already visible in the word go last (a spare "k" next to "k_ight" reads as a trick).
  const visible = new Set([...w].filter((ch, i) => isLetter(ch) && !(Array.isArray(gaps) && gaps.includes(i))));
  const all = [...tier1, ...tier2, ...tier3];
  const out = [];
  for (const l of [...all.filter((x) => !visible.has(x)), ...all.filter((x) => visible.has(x))]) {
    if (out.length >= want) break;
    if (!missing.has(l) && !out.includes(l)) out.push(l);
  }
  return out;
}
