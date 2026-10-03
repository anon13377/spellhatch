// The only source of "today" in Spell Hatch.
// Day numbers are whole days since 2020-01-01 in DEVICE LOCAL time. 0 means "never".
// Test override: globalThis.__SH_NOW = "2026-10-04T08:00" (local time), or the page URL ?now=2026-10-04T08:00

const EPOCH_UTC = Date.UTC(2020, 0, 1);
const DAY_MS = 86400000;

function overrideString() {
  if (typeof globalThis.__SH_NOW === "string" && globalThis.__SH_NOW) return globalThis.__SH_NOW;
  if (typeof location !== "undefined" && location.search) {
    const v = new URLSearchParams(location.search).get("now");
    if (v) return v;
  }
  return null;
}

// Current time as a Date, honoring the test override. "YYYY-MM-DDTHH:MM" without a zone parses as local time.
export function now() {
  const o = overrideString();
  if (o) {
    const d = new Date(o.length === 10 ? o + "T12:00" : o);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid clock override: " + o);
    return d;
  }
  return new Date();
}

// Day number of a local Date (uses local calendar parts, never toISOString)
export function dayOf(date) {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH_UTC) / DAY_MS) + 1;
}

export function today() {
  return dayOf(now());
}

// Day number to "YYYY-MM-DD"
export function dayToISO(n) {
  const d = new Date(EPOCH_UTC + (n - 1) * DAY_MS);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// "YYYY-MM-DD" to day number
export function isoToDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH_UTC) / DAY_MS) + 1;
}
