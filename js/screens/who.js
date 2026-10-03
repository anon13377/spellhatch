// "Who's playing?" (card W2): big avatar tiles, Add player, and the "A list was shared with you" picker.
import { unlockSpeech } from "../speech.js";
import { h, speakerBtn, avatarImg, AVATARS, toast, say, dialog } from "./ui.js";
import { store, session, selectProfile, createPlayer, saveListPipeline, storeErrorText } from "./state.js";
import { levelFromXp } from "../../data/config.js";

/** @param {HTMLElement} app @param {(hash:string)=>void} go */
export function renderWho(app, go) {
  const profiles = store.listProfiles();
  const share = session.pendingShare;
  const screen = h("div.screen.who");

  if (share) {
    screen.appendChild(h("div.card.share-banner", { role: "status" },
      h("div.share-banner-text",
        h("strong", "A list was shared with you"),
        h("span", `"${share.title}", ${share.words.length} word${share.words.length === 1 ? "" : "s"}`)),
      h("button.btn.btn-ghost.share-cancel", { type: "button", onclick: () => { session.pendingShare = null; go("#/who"); toast("Shared list not added."); } }, "No thanks")));
  }

  screen.appendChild(h("div.brand", h("img.brand-egg", { src: "./assets/creatures/c00-egg.svg", alt: "" }), h("span", "Spell Hatch")));
  screen.appendChild(h("div.who-head",
    h("h1.title", share ? "Add it for who?" : "Who's playing?"),
    speakerBtn(() => (share ? "Who should get the new list?" : "Who's playing? Tap your picture."), "Read it to me")));

  const grid = h("div.who-grid");
  for (const p of profiles) {
    const lv = levelFromXp(p.xp).level;
    grid.appendChild(h("button.who-tile", {
      type: "button", "aria-label": `${p.name}, level ${lv}`, dataset: { pid: p.id },
      onclick: () => pick(p.id)
    }, avatarImg(p.avatar, "who-avatar"), h("span.who-name", p.name), h("span.who-level", "Level " + lv)));
  }
  grid.appendChild(h("button.who-tile.who-add", { type: "button", "aria-label": "Add player", onclick: () => go("#/who/new") },
    h("span.who-plus", { html: '<svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' }),
    h("span.who-name", "Add player")));
  screen.appendChild(grid);
  app.appendChild(screen);

  function pick(pid) {
    unlockSpeech();               // must run inside the tap, before any await (iOS)
    selectProfile(pid);
    if (session.pendingShare) {
      const list = session.pendingShare;
      session.pendingShare = null;
      const existing = store.getList(list.id);
      const r = existing ? saveListPipeline(existing, [pid]) : saveListPipeline(list, [pid]);
      if (!r.ok) { toast(storeErrorText(r.error), "bad"); go("#/home"); return; }
      toast(`Added "${r.list.title}"!`, "good");
    }
    go("#/home");
  }
}

/** Add player: name (the only typing) and a picture. */
export function renderNewPlayer(app, go, { onCreated, title = "New player" } = {}) {
  const used = new Set(store.listProfiles().map((p) => p.avatar));
  let avatar = (AVATARS.find(([id]) => !used.has(id)) || AVATARS[Math.floor(Math.random() * AVATARS.length)])[0];
  const screen = h("div.screen.newplayer");
  const back = h("button.btn.btn-ghost.back-btn", { type: "button", "aria-label": "Back", onclick: () => go("#/who") }, h("span", { html: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
  const preview = h("div.np-preview", avatarImg(avatar, "np-preview-img"));
  const name = h("input.sh-input.np-name", { type: "text", maxlength: "20", autocomplete: "off", autocapitalize: "words", spellcheck: "false", placeholder: "Name", "aria-label": "Player name" });
  const grid = h("div.np-avatars", { role: "radiogroup", "aria-label": "Pick a picture" });
  for (const [id] of AVATARS) {
    const b = h("button.np-avatar", { type: "button", role: "radio", "aria-checked": String(id === avatar), "aria-label": id, dataset: { avatar: id },
      onclick: () => {
        avatar = id;
        grid.querySelectorAll(".np-avatar").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.avatar === id)));
        preview.replaceChildren(avatarImg(avatar, "np-preview-img"));
        say(id);
      } }, avatarImg(id));
    grid.appendChild(b);
  }
  const create = h("button.btn.btn-primary.btn-block.np-create", { type: "button", onclick: submit }, "Let's go!");
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  if (session.pendingShare && !onCreated) {
    screen.appendChild(h("div.card.share-banner", { role: "status" }, h("div.share-banner-text", h("strong", "A list was shared with you"), h("span", `Make a player first, then "${session.pendingShare.title}" is added for them.`))));
  }
  screen.append(
    h("div.row", back, h("h1.title.np-title", title), h("span.spacer"), speakerBtn("Type your name, then pick a picture.", "Read it to me")),
    h("div.card.np-card", preview, h("label.np-label", { for: "np-name" }, "Name"), name, h("p.np-label", "Pick a picture"), grid),
    create);
  if (!store.listProfiles().length && !onCreated) {
    // A fresh device: let a grown-up bring players back from a backup code without making a player first.
    screen.appendChild(h("button.btn.btn-ghost.btn-block.np-restore", { type: "button", onclick: restore }, "Grown-ups: restore from a backup code"));
  }
  name.id = "np-name";
  app.appendChild(screen);
  setTimeout(() => name.focus(), 50);

  function submit() {
    const n = name.value.replace(/\s+/g, " ").trim();
    if (!n) { name.classList.remove("shake"); void name.offsetWidth; name.classList.add("shake"); name.focus(); toast("Type a name first."); return; }
    unlockSpeech();
    const r = createPlayer(n, avatar);
    if (!r.ok) { toast(storeErrorText(r.error), "bad"); return; }
    if (onCreated) return onCreated(r.profile);
    // From the "Who's playing?" flow: go straight in (counts as picking the profile).
    selectProfile(r.profile.id);
    if (session.pendingShare) {
      const list = session.pendingShare;
      session.pendingShare = null;
      const res = saveListPipeline(store.getList(list.id) || list, [r.profile.id]);
      if (res.ok) toast(`Added "${res.list.title}"!`, "good"); else toast(storeErrorText(res.error), "bad");
    }
    go("#/home", true);
  }
}

async function restore() {
  const box = h("textarea.sh-input.restore-in", { rows: "4", placeholder: "Paste the backup code", spellcheck: "false", autocapitalize: "off", "aria-label": "Backup code" });
  const v = await dialog({ title: "Restore from backup", body: box, buttons: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Restore", kind: "primary", value: true }] });
  if (!v) return;
  const r = store.importBackup(box.value);
  if (!r.ok) { toast(r.error === "checksum" ? "That code is incomplete. Copy the whole code again." : "That backup code did not work.", "bad"); return; }
  toast(`Restored ${r.profiles} player${r.profiles === 1 ? "" : "s"} and ${r.lists} list${r.lists === 1 ? "" : "s"}.`, "good");
  location.hash = "#/who";
}
