// Spell Hatch app entry (card W2): hash router, shared-link import, speech init, service worker, storage.persist().
// Routes: #/who  #/who/new  #/home  #/list/<id>  #/play/<id>/<mode>[/<part>]  #/results  #/parent[/...]
// A shared list arrives as #l=<payload> (js/share.js); it is decoded, offered to a player, and the hash is stripped.
import { initSpeech, unlockSpeech } from "./speech.js";
import { decodeList } from "./share.js";
import { store, session, getUi, setUi, selectProfile } from "./screens/state.js";
import { toast } from "./screens/ui.js";
import { renderWho, renderNewPlayer } from "./screens/who.js";
import { renderHome } from "./screens/home.js";
import { renderList } from "./screens/list.js";
import { renderPlay, leavePlay } from "./screens/play.js";
import { renderResults } from "./screens/results.js";
import { renderParent } from "./screens/parent.js";

const app = document.getElementById("app");

/** Navigate. replace=true swaps the history entry (no Back to it). */
export function go(hash, replace = false) {
  if (location.hash === hash) { route(); return; }
  if (replace) { history.replaceState(null, "", location.pathname + location.search + hash); route(); }
  else location.hash = hash;
}

function parse() {
  const raw = location.hash.replace(/^#\/?/, "");
  return raw.split("/").filter((s) => s !== "");
}

function route() {
  leavePlay();
  // Toasts older than a moment belong to the previous screen.
  document.querySelectorAll(".sh-toast").forEach((t) => { if (Date.now() - Number(t.dataset.t || 0) > 400) t.remove(); });
  document.querySelectorAll(".sh-modal-back").forEach((x) => x.remove());
  const [name, ...rest] = parse();
  if (name !== "parent") { session.parentUnlocked = false; session.settingsFor = null; }
  app.replaceChildren();
  app.dataset.screen = name || "who";
  window.scrollTo(0, 0);
  // Every screen except Who and Add player needs a chosen player.
  if (!session.profileId && name !== "who") {
    history.replaceState(null, "", location.pathname + location.search + "#/who");
    app.dataset.screen = "who";
    return renderWho(app, go);
  }
  switch (name) {
    case "home": return renderHome(app, go);
    case "list": return renderList(app, go, decodeURIComponent(rest[0] || ""));
    case "play": return renderPlay(app, go, decodeURIComponent(rest[0] || ""), rest[1], rest[2]);
    case "results": return renderResults(app, go);
    case "parent": return renderParent(app, go, rest);
    case "who":
      if (rest[0] === "new") return renderNewPlayer(app, go, { title: store.listProfiles().length ? "New player" : "Hi! What's your name?" });
      return renderWho(app, go);
    default:
      history.replaceState(null, "", location.pathname + location.search + "#/who");
      app.dataset.screen = "who";
      return renderWho(app, go);
  }
}

/** A shared list link: decode it, keep it for the "Who's playing?" picker, strip the hash. */
function takeSharedList() {
  const hash = location.hash || "";
  if (!/^#l=/.test(hash) && !/[#&]l=/.test(hash)) return;
  const list = decodeList(hash);
  history.replaceState(null, "", location.pathname + location.search + "#/who");
  if (!list) { setTimeout(() => toast("That shared link did not work. Ask for a new one."), 300); return; }
  session.pendingShare = list;
}

function boot() {
  takeSharedList();
  const ui = getUi();
  const profiles = store.listProfiles();
  const last = ui.lastProfile && store.getProfile(ui.lastProfile);
  const [name] = parse();
  if (session.pendingShare || !name || name === "who") {
    // A fresh launch starts at "Who's playing?" (or Add player when there is nobody yet).
    if (!profiles.length) history.replaceState(null, "", location.pathname + location.search + "#/who/new");
    else if (name !== "who") history.replaceState(null, "", location.pathname + location.search + "#/who");
  } else if (last) {
    // A reload in the middle of the app keeps the player and the screen.
    selectProfile(last.id);
  }
  // iOS needs one speech call inside a user tap. The profile tap does it; this covers a reload mid-app.
  document.addEventListener("pointerdown", () => unlockSpeech(), { capture: true, once: true });
  window.addEventListener("hashchange", () => {
    if (/^#l=/.test(location.hash) || /[#&]l=/.test(location.hash)) { takeSharedList(); session.profileId = null; }
    route();
  });
  route();

  initSpeech().then((info) => { session.speech = info; }).catch(() => { session.speech = { available: false, voices: [] }; });

  // Ask the browser to keep our data (Safari clears unvisited sites after 7 days). Once per device.
  try {
    if (!ui.persistAsked && navigator.storage && navigator.storage.persist) {
      setUi({ persistAsked: true });
      navigator.storage.persist().catch(() => {});
    }
  } catch { /* ignore */ }

  // Offline support. Relative path, so it works under /<repo>/ on GitHub Pages.
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
      // Second phase: once the page is idle, ask the worker to cache every word picture for offline Matching.
      navigator.serviceWorker.ready.then((reg) => {
        const post = () => { try { (navigator.serviceWorker.controller || reg.active).postMessage({ type: "warm" }); } catch { /* ignore */ } };
        if ("requestIdleCallback" in window) requestIdleCallback(post, { timeout: 5000 }); else setTimeout(post, 2000);
      }).catch(() => {});
    });
  }
}

boot();
