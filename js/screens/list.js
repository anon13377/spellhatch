// List screen (card W2): big Play button, 5 mode tiles, School test toggle, parts, starred words.
import { CONFIG } from "../../data/config.js";
import { today, dayToISO } from "../clock.js";
import { eggProgress } from "../rewards.js";
import { partCount } from "../round.js";
import * as typeMode from "../modes/type.js";
import * as buildMode from "../modes/build.js";
import * as matchingMode from "../modes/matching.js";
import * as choiceMode from "../modes/choice.js";
import * as gapMode from "../modes/gap.js";
import { h, speakerBtn, creatureImg, ICON, say, testCountdown, toast } from "./ui.js";
import { store, currentProfile, listPref, setListPref, disp, storeErrorText } from "./state.js";

export const MODES = { matching: matchingMode, choice: choiceMode, gap: gapMode, build: buildMode, type: typeMode };
export const MODE_ORDER = ["matching", "choice", "gap", "build", "type"];
export const MODE_LOOK = {
  matching: { emoji: "1f4f7", hearEmoji: "1f442", say: "Matching. Match each word to its picture.", hearSay: "Hear and Match. Listen, then tap the word." },
  choice: { emoji: "1f914", say: "Multiple Choice. Pick the right spelling." },
  gap: { emoji: "1f526", say: "Fill the Gap. Find the missing letters." },
  build: { emoji: "1f3f0", say: "Build It. Put the letters in order." },
  type: { emoji: "270f", say: "Type It. Spell the whole word." }
};
const MODE_TITLE = Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, m.meta.title]));

/**
 * Per-mode plan for a list: which words can play, Hear and Match fallback, or a disabled reason.
 * @returns {{ id, title, words: object[], hearMode: boolean, reason: string }}
 */
export function modePlan(modeId, list) {
  const mod = MODES[modeId];
  const words = list.words || [];
  if (modeId === "matching") {
    const withPics = mod.eligible(words);
    if (withPics.length >= CONFIG.round.matchingMinEligible) return { id: modeId, title: MODE_TITLE.matching, words: withPics, hearMode: false, reason: "" };
    return { id: modeId, title: "Hear and Match", words: words.slice(), hearMode: true, reason: words.length ? "" : "No words yet" };
  }
  const el = mod.eligible(words);
  const reason = el.length ? "" : modeId === "build" ? "Needs longer words" : modeId === "gap" ? "Needs words with 3+ letters" : "No words yet";
  return { id: modeId, title: MODE_TITLE[modeId], words: el, hearMode: false, reason };
}

/** The mode the big Play button starts: the next one after the last played, skipping disabled modes. */
export function nextMode(list, lastMode) {
  const start = lastMode ? MODE_ORDER.indexOf(lastMode) + 1 : 0;
  for (let k = 0; k < MODE_ORDER.length; k++) {
    const id = MODE_ORDER[(start + k) % MODE_ORDER.length];
    if (!modePlan(id, list).reason) return id;
  }
  return "type";
}

export function renderList(app, go, listId) {
  const p = currentProfile();
  if (!p) return go("#/who", true);
  const list = store.getList(listId);
  if (!list || !p.listIds.includes(listId)) { toast("That list is not here any more."); return go("#/home", true); }
  const pref = listPref(p.id, list.id);
  const test = !!pref.test;
  const parts = partCount(list.words.length);
  let part = Math.min(parts - 1, Math.max(0, pref.part || 0));
  const playId = nextMode(list, pref.lastMode);
  const playPlan = modePlan(playId, list);
  const c = (p.creatures && p.creatures[list.id]) || { id: list.eggId, state: "egg" };
  const prog = eggProgress(p, list);
  const countdown = testCountdown(list.testDate, dayToISO(today()));

  const playHash = (id) => `#/play/${encodeURIComponent(list.id)}/${id}${parts > 1 ? "/" + part : ""}`;
  const screen = h("div.screen.listscreen");
  screen.appendChild(h("div.topbar",
    h("button.btn.btn-ghost.back-btn", { type: "button", "aria-label": "Back to home", html: ICON.back, onclick: () => go("#/home") }),
    h("h1.title.ls-title", list.title),
    speakerBtn(() => list.title, "Read the list name")));

  screen.appendChild(h("div.ls-hero",
    h("div.ls-egg", creatureImg(c.id || list.eggId, c.state)),
    h("div.ls-info",
      h("div.eggbar", { role: "img", "aria-label": `Hatch ${Math.round(prog.hatch * 100)} percent, grow ${Math.round(prog.grow * 100)} percent` },
        h("span.hatch", { style: { width: prog.hatch * 50 + "%" } }), h("span.gap", { style: { width: (1 - prog.hatch) * 50 + "%" } }), h("span.grow", { style: { width: prog.grow * 50 + "%" } })),
      h("div.muted", `${list.words.length} words`, countdown ? h("span.lc-test", " " + countdown) : null))));

  // Big play button
  const playBtn = h("button.btn.btn-primary.btn-block.play-big", { type: "button", "aria-label": "Play " + playPlan.title, onclick: () => go(playHash(playId)) },
    h("span.play-icon", { html: ICON.play }), h("span.play-label", "Play"), h("span.play-mode", playPlan.title + (playId === "type" && test ? " (test)" : "")));
  screen.appendChild(playBtn);

  // Parts picker for long lists
  if (parts > 1) {
    const row = h("div.parts", { role: "radiogroup", "aria-label": "Pick a part" });
    for (let i = 0; i < parts; i++) {
      const from = i * CONFIG.round.partSize + 1, to = Math.min(list.words.length, (i + 1) * CONFIG.round.partSize);
      row.appendChild(h("button.part-chip", { type: "button", role: "radio", "aria-checked": String(i === part), "aria-label": `Part ${i + 1}, words ${from} to ${to}`,
        onclick: () => { setListPref(p.id, list.id, { part: i }); go("#/list/" + encodeURIComponent(list.id), true); } }, "Part " + (i + 1)));
    }
    screen.appendChild(h("div.section-head", h("h2.subtitle", "Parts"), speakerBtn(`This list is long, so it plays in ${parts} parts.`, "Read it to me")));
    screen.appendChild(row);
  }

  // Mode tiles
  screen.appendChild(h("div.section-head", h("h2.subtitle", "Games"), speakerBtn("Pick a game. " + MODE_ORDER.map((id) => { const pl = modePlan(id, list); return pl.hearMode ? MODE_LOOK.matching.hearSay : MODE_LOOK[id].say; }).join(" "), "Read the games")));
  const grid = h("div.mode-grid");
  for (const id of MODE_ORDER) {
    const plan = modePlan(id, list);
    const look = MODE_LOOK[id];
    const tile = h("div.mode-tile" + (plan.reason ? ".mode-off" : "") + (id === playId ? ".mode-next" : ""), { dataset: { mode: id } },
      h("button.mode-go", { type: "button", disabled: !!plan.reason, "aria-label": plan.title + (plan.reason ? ". " + plan.reason : ""), onclick: () => go(playHash(id)) },
        h("img.mode-icon", { src: `./assets/emoji/${plan.hearMode ? look.hearEmoji : look.emoji}.svg`, alt: "", draggable: "false" }),
        h("span.mode-name", plan.title + (id === "type" && test ? " (test)" : "")),
        plan.reason ? h("span.mode-reason", plan.reason) : null),
      h("button.mode-say", { type: "button", "aria-label": "Hear what " + plan.title + " is", html: ICON.speaker, onclick: () => say(plan.hearMode ? look.hearSay : look.say) }));
    grid.appendChild(tile);
  }
  screen.appendChild(grid);

  // School test toggle (Type It only)
  const toggle = h("button.toggle.test-toggle", { type: "button", role: "switch", "aria-checked": String(test), "aria-label": "School test for Type It",
    onclick: () => { setListPref(p.id, list.id, { test: !test }); say(!test ? "School test is on. Type It will check your words at the end." : "School test is off."); go("#/list/" + encodeURIComponent(list.id), true); } },
    h("span.toggle-knob"));
  screen.appendChild(h("div.card.test-card", h("div.test-text", h("b", "School test"), h("span.muted", "Type It with no checking or hints, just like a real test.")), toggle));

  // Words, star to make them challenge words (play last, double XP)
  screen.appendChild(h("div.section-head", h("h2.subtitle", "Words"), speakerBtn("Tap a word to hear it. Tap the star to make it a challenge word.", "Read it to me")));
  const words = h("div.word-chips");
  list.words.forEach((x, i) => {
    words.appendChild(h("div.word-chip" + (x.star ? ".starred" : ""),
      h("button.wc-word", { type: "button", "aria-label": "Hear " + disp(x.w), onclick: () => say(x.w) }, disp(x.w)),
      h("button.wc-star", { type: "button", "aria-pressed": String(!!x.star), "aria-label": (x.star ? "Unstar " : "Star ") + disp(x.w), html: ICON.star,
        onclick: () => {
          const l = store.getList(list.id);
          if (!l) return;
          l.words[i].star = !l.words[i].star;
          const r = store.saveList(l);
          if (!r.ok) return toast(storeErrorText(r.error), "bad");
          go("#/list/" + encodeURIComponent(list.id), true);
        } })));
  });
  screen.appendChild(words);
  app.appendChild(screen);
}
