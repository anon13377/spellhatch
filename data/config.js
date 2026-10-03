// Spell Hatch tunable numbers (SCOPE section 4). Every reward and round number lives here.
// rewards.js and round.js must read these values; never hard-code them elsewhere.

export const CONFIG = {
  round: {
    singleSessionMax: 30,   // lists up to this size play as one round
    partSize: 10,           // longer lists play in parts of this size
    matchingBatch: 6,       // pairs per Matching screen
    matchingMinEligible: 3, // fewer words with emoji than this -> Hear and Match
    choiceOptions: 4,
    requeueOnce: true       // a missed or skipped word comes back once at the end (not in Test mode)
  },
  xp: {
    firstTry: 10,
    afterMiss: 4,
    starMultiplier: 2,
    perfectRound: 25,
    dailyGoal: 60
  },
  coins: {
    firstTry: 2,
    perfectRound: 10,
    dailyGoal: 20,
    hintCost: 5,
    skipCost: 10,
    startingCoins: 0
  },
  levels: {
    // XP needed to go from level n to level n + 1 is perLevel * n
    perLevel: 100
  },
  daily: {
    goalWords: 10           // correct words in one local day
  },
  creatures: {
    starterId: "c00",
    listEggIds: ["c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09", "c10", "c11"],
    starterGrowDays: 3      // starter grows after finished rounds on this many different days
  },
  badges: [
    { id: "first-round", label: "First Round" },
    { id: "streak-3", label: "3 Day Streak" },
    { id: "streak-7", label: "7 Day Streak" },
    { id: "streak-30", label: "30 Day Streak" },
    { id: "perfect", label: "Perfect Round" },
    { id: "words-100", label: "100 Words" },
    { id: "words-500", label: "500 Words" },
    { id: "words-1000", label: "1000 Words" },
    { id: "first-hatch", label: "First Hatch" },
    { id: "all-hatched", label: "All 12 Hatched" }
  ],
  speech: {
    rate: 0.85,
    voicesTimeoutMs: 1500,
    speakTimeoutMs: 3000,
    mutedCheckMs: 800
  },
  share: {
    qrMaxUrlLength: 900
  },
  ocr: {
    tesseractVersion: "7.0.0",
    maxEdgePx: 1500
  },
  storage: {
    prefix: "sh:",
    schemaVersion: 1
  }
};

// XP needed to finish level n (n >= 1)
export function xpForLevel(n) {
  return CONFIG.levels.perLevel * n;
}

// Derive { level, intoLevel, needed } from total XP. Level 1 at 0 XP, level 2 at 100, level 3 at 300, level 4 at 600.
export function levelFromXp(totalXp) {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level += 1;
  }
  return { level, intoLevel: rest, needed: xpForLevel(level) };
}
