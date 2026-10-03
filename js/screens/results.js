// Results (card W2): stars, XP and coins count up, then rewards events in order (daily goal, level, streak,
// hatch with wobble and crack, grow, badges). Everything plays inline, so Play again and Home are always tappable.
import { CONFIG } from "../../data/config.js";
import { eggProgress } from "../rewards.js";
import { h, ICON, creatureImg, creatureName, countUp, wait, sfx, say, speakerBtn } from "./ui.js";
import { store, session, currentProfile, disp } from "./state.js";
import { buddyOf } from "./home.js";

export function starsFor(summary) {
  const r = summary.results || [];
  if (!r.length) return 0;
  if (summary.perfect) return 3;
  const good = r.filter((x) => (summary.isTest ? x.correct : x.firstTry)).length / r.length;
  if (good >= 0.7) return 2;
  return r.some((x) => x.correct) ? 1 : 0;
}

const BADGE_LABEL = Object.fromEntries(CONFIG.badges.map((b) => [b.id, b.label]));

export function renderResults(app, go) {
  const res = session.lastResult;
  const p = currentProfile();
  if (!res || !p || res.profileId !== p.id) return go("#/home", true);
  const { summary, events, after } = res;
  const list = store.getList(res.listId);
  const xpEv = events.find((e) => e.type === "xp");
  const coinEv = events.find((e) => e.type === "coins");
  const stars = starsFor(summary);
  const buddy = buddyOf(after);
  const correct = summary.results.filter((r) => r.correct).length;
  const cheer = summary.perfect ? "Perfect round!" : stars >= 2 ? "Great job!" : correct ? "Nice work! Keep practicing." : "Good try! Let's practice more.";

  const screen = h("div.screen.results");
  const buddyImg = creatureImg(buddy.id, buddy.state, "res-buddy-img");
  screen.appendChild(h("div.res-head",
    h("div.res-buddy", h("div.bubble", `${correct} of ${summary.results.length} words right!`), buddyImg),
    h("div.res-stars", { role: "img", "aria-label": `${stars} of 3 stars` },
      [0, 1, 2].map((i) => h("span.res-star" + (i < stars ? ".on" : ""), { html: ICON.star, style: { animationDelay: 200 + i * 220 + "ms" } }))),
    h("h1.title.res-title", cheer, " ", speakerBtn(`${cheer} You got ${correct} of ${summary.results.length} words.`, "Read it to me"))));

  const xpNum = h("b.res-num", { dataset: { value: String(xpEv ? xpEv.value : 0) } }, "0");
  const coinNum = h("b.res-num", { dataset: { value: String(coinEv ? coinEv.value : 0) } }, "0");
  screen.appendChild(h("div.res-totals",
    h("div.card.res-xp", h("span.res-label", "XP"), h("span.res-plus", "+"), xpNum),
    h("div.card.res-coins", h("span", { html: ICON.coin }), h("span.res-plus", "+"), coinNum,
      summary.coinsSpent ? h("small.muted.res-spent", `(${summary.coinsSpent} spent)`) : null)));

  // Egg progress for this list's own creature: left half blue (hatch), right half green (grow).
  if (list) {
    const was = eggProgress(res.before || after, list), now = eggProgress(after, list);
    const c = (after.creatures && after.creatures[list.id]) || { id: list.eggId, state: "egg" };
    const label = c.state === "grown" ? "Grown!" : c.state === "baby" ? "Hatched! Spell every word again on another day to grow it." : "Spell every word right once to hatch the egg.";
    const hatch = h("span.hatch"), gap = h("span.gap"), grow = h("span.grow");
    const set = (pr) => { hatch.style.width = pr.hatch * 50 + "%"; gap.style.width = (1 - pr.hatch) * 50 + "%"; grow.style.width = pr.grow * 50 + "%"; };
    set(was);
    screen.appendChild(h("div.card.res-egg", { dataset: { hatch: String(now.hatch), grow: String(now.grow) } },
      h("div.res-egg-art", creatureImg(c.id || list.eggId, c.state || "egg")),
      h("div.res-egg-body",
        h("b", list.title),
        h("div.eggbar.res-eggbar", { role: "img", "aria-label": `Hatch ${Math.round(now.hatch * 100)} percent, grow ${Math.round(now.grow * 100)} percent` }, hatch, gap, grow),
        h("small.muted", label))));
    setTimeout(() => set(now), 700);
  }

  const feed = h("div.res-feed", { "aria-live": "polite" });
  screen.appendChild(feed);

  // Words: right first time, right after a try, or to practice
  const chips = h("div.word-chips.res-words");
  for (const r of summary.results) {
    const kind = r.firstTry ? "first" : r.correct ? "after" : "miss";
    chips.appendChild(h("button.word-chip.res-word.res-" + kind, { type: "button", "aria-label": `${disp(r.w)}, ${kind === "first" ? "right first time" : kind === "after" ? "right after a try" : "practice this one"}`, onclick: () => say(r.w) },
      h("span.res-mark", kind === "first" ? "✓" : kind === "after" ? "↻" : "•"), h("span", disp(r.w))));
  }
  screen.appendChild(h("h2.subtitle", "Your words"));
  screen.appendChild(chips);

  const partSeg = res.part ? "/" + res.part : "";
  screen.appendChild(h("div.res-actions",
    h("button.btn.btn-primary.again-btn", { type: "button", onclick: () => go(`#/play/${encodeURIComponent(res.listId)}/${res.mode}${partSeg}`) }, h("span", { html: ICON.play }), h("span.again-long", "Play again"), h("span.again-short", "Again")),
    list ? h("button.btn.list-btn", { type: "button", "aria-label": "More games", onclick: () => go("#/list/" + encodeURIComponent(res.listId)) }, "Games") : null,
    h("button.btn.home-btn", { type: "button", "aria-label": "Home", onclick: () => go("#/home") }, "Home")));
  if (res.saveError) screen.appendChild(h("p.card.res-warn", "Your progress could not be saved on this device. Ask a grown-up to free some space."));

  app.appendChild(screen);
  animate();

  async function animate() {
    const alive = () => screen.isConnected;
    await wait(500);
    if (!alive()) return;
    try { screen.querySelector(".res-totals").scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch { /* ignore */ }
    sfx("coin");
    await Promise.all([countUp(xpNum, 0, Number(xpNum.dataset.value)), countUp(coinNum, 0, Number(coinNum.dataset.value))]);
    for (const ev of events) {
      if (!alive()) return;
      if (ev.type === "xp" || ev.type === "coins") continue;
      const card = eventCard(ev);
      if (!card) continue;
      feed.appendChild(card);
      requestAnimationFrame(() => card.classList.add("in"));
      try { card.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* old browsers */ }
      if (ev.type === "hatch" || ev.type === "grow") {
        await playHatch(card, ev);
      } else {
        sfx(ev.type === "level" ? "level" : "coin");
        await wait(900);
      }
    }
    if (alive()) screen.dataset.celebrated = "1";
  }

  function eventCard(ev) {
    switch (ev.type) {
      case "daily": return h("div.card.res-ev.ev-daily", { dataset: { ev: "daily" } }, h("span.ev-icon", { html: '<img src="./assets/emoji/1f3c6.svg" alt="">' }), h("div", h("b", "Daily goal done!"), h("span", ` +${ev.value.xp} XP, +${ev.value.coins} coins`)));
      case "level": return h("div.card.res-ev.ev-level", { dataset: { ev: "level" } }, h("span.ev-icon", { html: '<img src="./assets/emoji/2b50.svg" alt="">' }), h("div", h("b", `Level ${ev.value}!`), h("span", " You leveled up.")));
      case "streak": return h("div.card.res-ev.ev-streak", { dataset: { ev: "streak" } }, h("span.ev-icon", { html: ICON.flame }), h("div", h("b", `${ev.value} day streak!`), h("span", ev.value > 1 ? " Keep it going tomorrow." : " Come back tomorrow to grow it.")));
      case "badge": return h("div.card.res-ev.ev-badge", { dataset: { ev: "badge", badge: ev.value } }, h("span.ev-icon", { html: '<img src="./assets/emoji/1f947.svg" alt="">' }), h("div", h("b", "New badge: "), h("span", BADGE_LABEL[ev.value] || ev.value)));
      case "hatch":
      case "grow": {
        const id = ev.value.creatureId;
        const from = ev.type === "hatch" ? "egg" : "baby";
        const stageEl = h("div.hatch-stage", creatureImg(id, from, "hatch-from"));
        return h("div.card.res-ev.ev-" + ev.type, { dataset: { ev: ev.type, creature: id } }, stageEl,
          h("div.hatch-text", h("b", ev.type === "hatch" ? "Your egg is hatching!" : `${creatureName(id)} is growing!`)));
      }
      default: return null;
    }
  }

  async function playHatch(card, ev) {
    const id = ev.value.creatureId;
    const stageEl = card.querySelector(".hatch-stage");
    const text = card.querySelector(".hatch-text");
    stageEl.classList.add(ev.type === "hatch" ? "wobble" : "glow");
    await wait(ev.type === "hatch" ? 1300 : 900);
    if (ev.type === "hatch") { stageEl.classList.add("cracked"); await wait(450); }
    sfx("hatch");
    const next = ev.type === "hatch" ? "baby" : "grown";
    stageEl.replaceChildren(creatureImg(id, next, "hatch-to"), h("span.burst"));
    stageEl.classList.remove("wobble", "glow", "cracked");
    stageEl.classList.add("revealed");
    text.replaceChildren(h("b", ev.type === "hatch" ? `Meet ${creatureName(id)}!` : `${creatureName(id)} grew up!`));
    if (ev.type === "hatch") say(`Meet ${creatureName(id)}!`);
    await wait(1000);
  }
}
