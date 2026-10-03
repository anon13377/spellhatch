// Home (card W2): buddy creature, daily goal ring, streak, coins, XP level bar, list cards with egg progress.
import { CONFIG, levelFromXp } from "../../data/config.js";
import { eggProgress } from "../rewards.js";
import { today, dayToISO } from "../clock.js";
import { LISTS } from "../../data/lists.js";
import { h, speakerBtn, avatarImg, creatureImg, creatureName, holdButton, ICON, toast, testCountdown, say } from "./ui.js";
import { session, currentProfile, playerLists, saveListPipeline, updateProfile, getUi, setUi, storeErrorText } from "./state.js";

/** Which creature and state the buddy shows. */
export function buddyOf(p) {
  const starter = { id: CONFIG.creatures.starterId, state: p.starter || "egg" };
  if (!p.buddy || p.buddy === CONFIG.creatures.starterId) return starter;
  let best = null;
  for (const c of Object.values(p.creatures || {})) {
    if (c && c.id === p.buddy && (c.state === "baby" || c.state === "grown")) {
      if (!best || c.state === "grown") best = { id: c.id, state: c.state };
    }
  }
  return best || starter;
}

/** Hatched creatures (unique species, best state), starter first. */
export function hatchedCreatures(p) {
  const out = new Map();
  if (p.starter === "baby" || p.starter === "grown") out.set(CONFIG.creatures.starterId, p.starter);
  for (const c of Object.values(p.creatures || {})) {
    if (!c || (c.state !== "baby" && c.state !== "grown")) continue;
    if (!out.has(c.id) || c.state === "grown") out.set(c.id, c.state);
  }
  return [...out.entries()].map(([id, state]) => ({ id, state }));
}

export function isIosSafariTab() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const standalone = navigator.standalone === true || (globalThis.matchMedia && matchMedia("(display-mode: standalone)").matches);
  return ios && !otherBrowser && !standalone;
}

export function renderHome(app, go) {
  const p = currentProfile();
  if (!p) return go("#/who", true);
  const day = today();
  const todayIso = dayToISO(day);
  const lv = levelFromXp(p.xp);
  const dailyWords = p.daily && p.daily.day === day ? p.daily.words : 0;
  const goal = CONFIG.daily.goalWords;
  const streak = p.streak && (p.streak.lastDay === day || p.streak.lastDay === day - 1) ? p.streak.count : 0;
  const buddy = buddyOf(p);

  const screen = h("div.screen.home");

  // ----- top bar
  const gear = holdButton({ label: "Grown-ups: press and hold for 2 seconds", onDone: () => { session.parentUnlocked = true; go("#/parent"); } });
  gear.classList.add("home-gear");
  screen.appendChild(h("div.topbar",
    h("button.player-chip", { type: "button", "aria-label": `Switch player. Now playing: ${p.name}`, onclick: () => go("#/who") }, avatarImg(p.avatar, "chip-avatar"), h("span.chip-name", p.name)),
    h("span.spacer"),
    h("span.pill.pill-streak", { title: "Streak", "aria-label": `${streak} day streak` }, h("span", { html: ICON.flame }), h("span.pill-num", String(streak))),
    h("span.pill.pill-coins", { title: "Coins", "aria-label": `${p.coins} coins` }, h("span", { html: ICON.coin }), h("span.pill-num", String(p.coins))),
    gear));

  // ----- hero: buddy + goal ring + level
  const pDaily = Math.min(1, dailyWords / goal);
  const ring = h("div.ring.goal-ring", { style: { "--p": String(pDaily) }, role: "img", "aria-label": `Daily goal: ${Math.min(dailyWords, goal)} of ${goal} words` },
    h("span", h("b", String(Math.min(dailyWords, goal))), h("small", "/" + goal)));
  const bubbleText = buddy.state === "egg" ? "Play a game to hatch me!" : (dailyWords >= goal ? "Goal done! You rock!" : `Hi ${p.name}! Let's spell!`);
  const buddyBtn = h("button.buddy", { type: "button", "aria-label": buddy.state === "egg" ? "Your egg" : creatureName(buddy.id),
    onclick: () => { buddyBtn.classList.remove("buddy-bounce"); void buddyBtn.offsetWidth; buddyBtn.classList.add("buddy-bounce"); say(bubbleText); } },
    creatureImg(buddy.id, buddy.state, "buddy-img"));
  screen.appendChild(h("section.hero.card",
    h("div.hero-buddy", h("div.bubble", bubbleText), buddyBtn),
    h("div.hero-side",
      h("div.goal", ring, h("div.goal-text", h("b", "Daily goal"), h("span.muted", dailyWords >= goal ? "Done today!" : `${goal - dailyWords} more word${goal - dailyWords === 1 ? "" : "s"}`))),
      h("div.level",
        h("div.level-row", h("b", "Level " + lv.level), h("span.muted", `${lv.intoLevel} / ${lv.needed} XP`)),
        h("div.xpbar", { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(lv.needed), "aria-valuenow": String(lv.intoLevel), "aria-label": "Level progress" },
          h("span", { style: { width: Math.round((lv.intoLevel / lv.needed) * 100) + "%" } }))))));

  // ----- iOS add to home screen tip
  const ui = getUi();
  if (isIosSafariTab() && !ui.iosTipDismissed) {
    const tip = h("div.card.tip", { role: "note" },
      h("p", h("b", "Grown-ups: "), "add Spell Hatch to the Home Screen so progress is kept. Tap the Share button, then \"Add to Home Screen\"."),
      h("button.btn.btn-ghost.tip-close", { type: "button", "aria-label": "Dismiss tip", html: ICON.close, onclick: () => { setUi({ iosTipDismissed: true }); tip.remove(); } }));
    screen.appendChild(tip);
  }

  // ----- lists
  const lists = playerLists(p);
  screen.appendChild(h("div.section-head", h("h2.subtitle", "My lists"), speakerBtn(() => lists.length ? "Pick a list to play. " + lists.map((l) => l.title).join(". ") : "No lists yet.", "Read my lists")));
  if (!lists.length) {
    const starter = LISTS.find((l) => l.id === "b_animals_1") || LISTS[0];
    screen.appendChild(h("div.card.empty",
      h("p", "No word lists yet. A grown-up can add your school words: press and hold the gear at the top."),
      starter ? h("button.btn.btn-primary.btn-block.starter-btn", { type: "button", onclick: () => {
        const r = saveListPipeline({ id: starter.id, title: starter.title, lang: p.settings.voice, words: starter.words, testDate: null, source: "bundled" }, [p.id]);
        if (!r.ok) return toast(storeErrorText(r.error), "bad");
        go("#/list/" + encodeURIComponent(starter.id));
      } }, h("span", { html: ICON.play }), "Try " + starter.title) : null));
  } else {
    const grid = h("div.list-grid");
    for (const l of lists) grid.appendChild(listCard(p, l, todayIso, go));
    screen.appendChild(grid);
  }

  // ----- creature collection (tap to make one your buddy)
  const hatched = hatchedCreatures(p);
  if (hatched.length > 1) {
    const row = h("div.collection");
    for (const c of hatched) {
      const on = buddy.id === c.id;
      row.appendChild(h("button.collect", { type: "button", "aria-pressed": String(on), "aria-label": `Make ${creatureName(c.id)} your buddy`,
        onclick: () => { updateProfile(p.id, (q) => { q.buddy = c.id; }); say(creatureName(c.id) + " is your buddy!"); go("#/home", true); } },
        creatureImg(c.id, c.state)));
    }
    screen.appendChild(h("div.section-head", h("h2.subtitle", "My creatures"), speakerBtn("Tap a creature to make it your buddy.", "Read it to me")));
    screen.appendChild(row);
  }

  app.appendChild(screen);
}

function listCard(p, l, todayIso, go) {
  const prog = eggProgress(p, l);
  const c = (p.creatures && p.creatures[l.id]) || { id: l.eggId, state: "egg" };
  const countdown = testCountdown(l.testDate, todayIso);
  const state = c.state === "grown" ? "Grown!" : c.state === "baby" ? "Hatched" : "Egg";
  return h("button.list-card.card", { type: "button", dataset: { list: l.id }, "aria-label": `${l.title}, ${l.words.length} words${countdown ? ", " + countdown : ""}`,
    onclick: () => go("#/list/" + encodeURIComponent(l.id)) },
    h("div.lc-art" + (c.state === "egg" && prog.hatch > 0.75 ? ".wobble-soft" : ""), creatureImg(c.id || l.eggId, c.state || "egg")),
    h("div.lc-body",
      h("div.lc-title", l.title),
      h("div.lc-meta", h("span.muted", `${l.words.length} words`), countdown ? h("span.lc-test" + (countdown === "Test today!" ? ".lc-test-now" : ""), countdown) : null),
      h("div.eggbar.lc-bar", { role: "img", "aria-label": `${state}. Hatch ${Math.round(prog.hatch * 100)} percent, grow ${Math.round(prog.grow * 100)} percent` },
        h("span.hatch", { style: { width: prog.hatch * 50 + "%" } }),
        h("span.gap", { style: { width: (1 - prog.hatch) * 50 + "%" } }),
        h("span.grow", { style: { width: prog.grow * 50 + "%" } })),
      h("div.lc-state.muted", state)));
}
