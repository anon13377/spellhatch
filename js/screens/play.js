// Play screen (card W2): drives js/round.js, mounts one mode per step with a ModeCtx, then saves through rewards.
import { CONFIG } from "../../data/config.js";
import { speak, isMutedLikely } from "../speech.js";
import { applyRound } from "../rewards.js";
import { createRound } from "../round.js";
import { h, ICON, dialog, toast, sfx, speakerBtn } from "./ui.js";
import { store, session, currentProfile, listPref, setListPref, saveProfile, updateProfile, getUi, setUi, storeErrorText } from "./state.js";
import { MODES, modePlan, MODE_LOOK } from "./list.js";

let active = null;   // the running round view, destroyed on navigation

/** Called by the router before any screen change. */
export function leavePlay() {
  if (active) { active.destroy(); active = null; }
}

export function renderPlay(app, go, listId, modeId, partStr) {
  leavePlay();
  const p = currentProfile();
  if (!p) return go("#/who", true);
  const list = store.getList(listId);
  if (!list || !MODES[modeId]) return go("#/home", true);
  const plan = modePlan(modeId, list);
  if (plan.reason) { toast(plan.reason); return go("#/list/" + encodeURIComponent(list.id), true); }
  const pref = listPref(p.id, list.id);
  const isTest = modeId === "type" && !!pref.test;
  const part = Math.max(0, Number(partStr) || 0);
  const settings = p.settings || {};
  const mod = MODES[modeId];
  const round = createRound(list, modeId, { eligible: plan.words, isTest, coins: p.coins, part });

  let handle = null, token = 0, finished = false, destroyed = false;

  // ----- chrome around the mode
  const quit = h("button.btn.btn-ghost.quit-btn", { type: "button", "aria-label": "Stop playing", html: ICON.close, onclick: askQuit });
  const bar = h("div.round-progress", { role: "progressbar", "aria-label": "Round progress", "aria-valuemin": "0" }, h("span"));
  const coinNum = h("span.pill-num", String(round.coins()));
  const coinPill = h("span.pill.pill-coins.play-coins", { "aria-label": "Coins" }, h("span", { html: ICON.coin }), coinNum);
  const skipBtn = isTest ? null : h("button.btn.skip-btn", { type: "button", "aria-label": `Skip this word, costs ${CONFIG.coins.skipCost} coins`, onclick: doSkip },
    h("span", { html: ICON.skip }), h("span.skip-text", "Skip"), h("span.pill.skip-cost", String(CONFIG.coins.skipCost)));
  const stage = h("div.play-stage");
  const screen = h("div.screen.play" + (isTest ? ".play-test" : ""), { dataset: { mode: modeId } },
    h("div.play-top", quit, bar, coinPill),
    h("div.play-sub",
      speakerBtn(() => (plan.hearMode ? MODE_LOOK.matching.hearSay : MODE_LOOK[modeId].say) + (isTest ? " This is a school test: spell each word, then tap Check." : ""), "Hear how to play", "play-how"),
      h("span.play-title", plan.title + (isTest ? ": School test" : "")), h("span.spacer"), skipBtn),
    stage);
  app.appendChild(screen);

  function refresh() {
    const total = round.total(), done = round.finished();
    bar.firstChild.style.width = Math.round((done / Math.max(1, total)) * 100) + "%";
    bar.setAttribute("aria-valuemax", String(total));
    bar.setAttribute("aria-valuenow", String(done));
    coinNum.textContent = String(round.coins());
    if (skipBtn) skipBtn.disabled = !round.canSkip();
  }

  function speakWord(text) {
    const pr = speak(text, { lang: settings.voice || "en-US" });
    pr.then(() => { if (!destroyed && isMutedLikely()) soundHint(); });
    return pr;
  }

  function mountStep(step) {
    if (handle) { try { handle.destroy(); } catch { /* ignore */ } handle = null; }
    stage.replaceChildren();
    const my = ++token;
    const live = () => my === token && !destroyed;
    const ctx = {
      words: step.words,
      lang: settings.voice || "en-US",
      isTest,
      silent: !!settings.silent,
      hearMode: plan.hearMode,
      keyboard: settings.keyboard === "qwerty" ? "qwerty" : "abc",
      speak: (t) => (live() ? speakWord(t) : Promise.resolve()),
      seed: step.seed,
      coins: round.coins(),
      spendCoins: (n) => {
        if (!live()) return false;
        const ok = round.spendCoins(n);
        refresh();
        if (!ok) { coinPill.classList.remove("shake"); void coinPill.offsetWidth; coinPill.classList.add("shake"); }
        else sfx("coin");
        return ok;
      },
      onResult: (partial) => {
        if (!live()) return;
        if (round.report(partial)) { if (partial.correct !== false && !isTest) sfx("good"); refresh(); }
      },
      onDone: () => { if (live()) advance(); }
    };
    try {
      handle = mod.mount(stage, ctx);
    } catch (e) {
      console.error(e);
      toast("Oops, that game had a problem. Let's try the next word.");
      setTimeout(() => { if (live()) advance(); }, 300);
    }
    refresh();
  }

  function advance() {
    if (finished || destroyed) return;
    const step = round.next();
    if (!step) return finish();
    mountStep(step);
  }

  function doSkip() {
    if (!round.skip()) { refresh(); return; }
    toast("Skipped! That word will come back at the end.");
    advance();
  }

  async function askQuit() {
    const v = await dialog({ title: "Stop playing?", body: "This round will not count if you stop now.", buttons: [{ label: "Keep playing", kind: "primary", value: false }, { label: "Stop", kind: "ghost", value: true }] });
    if (v) go("#/list/" + encodeURIComponent(list.id));   // destroy() charges any coins spent
  }

  // One-time friendly hint, shown as a banner above the game (never covers it).
  function soundHint() {
    if (destroyed || session.soundHintShown || getUi().soundHintShown) return;
    session.soundHintShown = true;
    setUi({ soundHintShown: true });
    const banner = h("div.sound-hint", { role: "status" },
      h("span.sound-hint-text", { title: "On iPhone or iPad, flip the ringer switch on the side." }, "No sound? Turn it up."),
      h("button.btn.btn-primary.sound-ok", { type: "button", onclick: () => banner.remove() }, "OK"),
      h("button.btn.sound-silent", { type: "button", onclick: () => {
        banner.remove();
        updateProfile(p.id, (q) => { q.settings.silent = true; });
        settings.silent = true;
        toast("Silent mode is on: you will see a picture or a clue instead. Change it in the grown-ups area.");
      } }, "Pictures"));
    screen.appendChild(banner);
  }

  function finish() {
    finished = true;
    if (handle) { try { handle.destroy(); } catch { /* ignore */ } handle = null; }
    const summary = round.summary();
    const before = store.getProfile(p.id) || p;
    const { profile: after, events } = applyRound(before, list, summary);
    const r = saveProfile(after);
    setListPref(p.id, list.id, { lastMode: modeId });
    session.lastResult = { profileId: p.id, listId: list.id, mode: modeId, part, isTest, summary, events, before, after, saveError: r.ok ? null : r.error };
    if (!r.ok) toast(storeErrorText(r.error), "bad");
    active = null;
    go("#/results", true);
  }

  // Leaving before the end: no rewards, but coins already spent on hints and skips stay spent.
  function chargeSpent() {
    const spent = round.coinsSpent();
    if (finished || charged || spent <= 0) return;
    charged = true;
    const r = updateProfile(p.id, (q) => { q.coins = Math.max(0, (Number(q.coins) || 0) - spent); });
    if (!r.ok) toast(storeErrorText(r.error), "bad");
  }
  let charged = false;
  active = { destroy() { destroyed = true; token++; if (handle) { try { handle.destroy(); } catch { /* ignore */ } handle = null; } chargeSpent(); } };
  window.addEventListener("pagehide", chargeSpent, { once: true });
  if (session.speech && session.speech.available === false && !settings.silent) setTimeout(() => { if (!destroyed) soundHint(); }, 400);
  advance();
}
