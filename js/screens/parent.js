// Grown-ups area (card W2). Reached by press and hold on the gear (no PIN).
// Lists (paste, scan, ready-made, edit, star, test date, delete), Share (link + QR), Players, Backup, Settings.
import { LISTS } from "../../data/lists.js";
import { encodeList, renderQR } from "../share.js";
import { initSpeech } from "../speech.js";
import { h, ICON, toast, dialog, avatarImg, AVATARS, testCountdown } from "./ui.js";
import { today, dayToISO } from "../clock.js";
import {
  store, session, currentProfile, applyProfileLook, updateProfile, parseWords, saveListPipeline,
  deleteListEverywhere, removeListFromPlayer, playerLists, storeErrorText, disp
} from "./state.js";
import { renderNewPlayer } from "./who.js";

const MAX_WORDS = 300;
// Worksheet header words: pre-unchecked after a scan when they sit in the first two lines or next to a colon.
const HEADER_WORDS = new Set(["name", "date", "week", "spelling", "list", "words", "test", "class", "teacher", "grade", "unit", "lesson"]);
const TOPIC_NAMES = { colorsshapes: "Colors and Shapes", fairytales: "Fairy Tales", dolch: "Sight Words (Dolch)" };
const LEVELS = ["Easy", "Medium", "Hard", "Challenge"];

const TABS = [["lists", "Lists"], ["players", "Players"], ["backup", "Backup"], ["settings", "Settings"]];

export function renderParent(app, go, parts) {
  const p = currentProfile();
  if (!p) return go("#/who", true);
  if (!session.parentUnlocked) return go("#/home", true);
  const [section = "lists", a, b] = parts;
  const tab = section === "add" || section === "list" || section === "share" ? "lists" : section;

  const screen = h("div.screen.parent");
  screen.appendChild(h("div.topbar.parent-top",
    h("h1.title.parent-title", "Grown-ups"),
    h("span.spacer"),
    h("button.btn.btn-primary.parent-done", { type: "button", onclick: () => { session.parentUnlocked = false; go("#/home"); } }, "Done")));
  const nav = h("nav.parent-tabs", { "aria-label": "Grown-ups sections" });
  for (const [id, label] of TABS) {
    nav.appendChild(h("a.parent-tab" + (id === tab ? ".on" : ""), { href: "#/parent/" + id, "aria-current": id === tab ? "page" : false }, label));
  }
  screen.appendChild(nav);
  const body = h("div.parent-body");
  screen.appendChild(body);
  app.appendChild(screen);

  const ctx = { p, go, body };
  if (section === "lists") listsTab(ctx);
  else if (section === "add" && a === "paste") pasteForm(ctx);
  else if (section === "add" && a === "scan") scanForm(ctx);
  else if (section === "add" && a === "pick") pickForm(ctx);
  else if (section === "list" && a) editList(ctx, decodeURIComponent(a));
  else if (section === "share" && a) shareList(ctx, decodeURIComponent(a));
  else if (section === "players" && a === "new") { screen.remove(); renderNewPlayer(app, go, { title: "New player", onCreated: () => go("#/parent/players", true) }); }
  else if (section === "players") playersTab(ctx);
  else if (section === "backup") backupTab(ctx);
  else if (section === "settings") settingsTab(ctx, b || a);
  else listsTab(ctx);
}

// ---------- helpers ----------
function field(label, input, hint) {
  const id = "f_" + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h("div.field", h("label.field-label", { for: id }, label), input, hint ? h("small.muted", hint) : null);
}
function errorBox() { return h("p.form-error", { role: "alert", hidden: true }); }
function showError(box, msg) { box.textContent = msg; box.hidden = false; box.scrollIntoView({ block: "nearest" }); }
export async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try { if (input) { input.select(); return document.execCommand("copy"); } } catch { /* ignore */ }
  return false;
}
function playersPicker(p) {
  const box = h("div.field", h("span.field-label", "Add for"));
  const row = h("div.check-row");
  for (const q of store.listProfiles()) {
    row.appendChild(h("label.check", h("input", { type: "checkbox", value: q.id, checked: q.id === p.id }), avatarImg(q.avatar, "check-avatar"), q.name));
  }
  box.appendChild(row);
  box.selected = () => [...row.querySelectorAll("input:checked")].map((x) => x.value);
  return box;
}
function titleInput(v = "") { return h("input.sh-input.f-title", { type: "text", maxlength: "40", value: v, placeholder: "Week 6 Words", autocomplete: "off" }); }
function dateInput(v = "") { return h("input.sh-input.f-date", { type: "date", value: v || "" }); }
function backRow(go, to, label = "Back") {
  return h("button.btn.btn-ghost.back-btn.parent-back", { type: "button", onclick: () => go(to) }, h("span", { html: ICON.back }), label);
}

// ---------- Lists ----------
function listsTab({ p, go, body }) {
  body.appendChild(h("h2.subtitle", `Lists for ${p.name}`));
  body.appendChild(h("div.add-row",
    h("a.btn.btn-primary.add-paste", { href: "#/parent/add/paste" }, "Type or paste"),
    h("a.btn.add-scan", { href: "#/parent/add/scan" }, "Scan a photo"),
    h("a.btn.add-pick", { href: "#/parent/add/pick" }, "Ready-made lists")));
  const lists = playerLists(p);
  if (!lists.length) body.appendChild(h("p.muted", "No lists yet. Add your child's spelling words with one of the buttons above."));
  const todayIso = dayToISO(today());
  for (const l of lists) {
    const cd = testCountdown(l.testDate, todayIso);
    body.appendChild(h("div.card.plist", { dataset: { list: l.id } },
      h("div.plist-main", h("b", l.title), h("span.muted", `${l.words.length} words${l.words.some((x) => x.star) ? ", " + l.words.filter((x) => x.star).length + " starred" : ""}${cd ? ", " + cd : ""}`)),
      h("div.plist-actions",
        h("a.btn.plist-edit", { href: "#/parent/list/" + encodeURIComponent(l.id) }, "Edit"),
        h("a.btn.plist-share", { href: "#/parent/share/" + encodeURIComponent(l.id) }, "Share"))));
  }
  const kb = Math.round(store.bytesUsed() / 1024);
  body.appendChild(h("p.muted.storage-note", `Storage used on this device: about ${kb} KB.`));
}

function pasteForm({ p, go, body }) {
  const err = errorBox();
  const title = titleInput();
  const words = h("textarea.sh-input.f-words", { rows: "8", placeholder: "One word per line, or separated by commas", spellcheck: "false", autocapitalize: "off" });
  const count = h("small.muted.f-count", "0 words");
  words.addEventListener("input", () => { const n = parseWords(words.value).length; count.textContent = `${n} word${n === 1 ? "" : "s"}${n >= MAX_WORDS ? " (the most allowed)" : ""}`; });
  const date = dateInput();
  const who = playersPicker(p);
  body.append(backRow(go, "#/parent/lists"), h("h2.subtitle", "Type or paste words"),
    h("div.card.form",
      field("List name", title),
      field("Words", words), count,
      field("Test date (optional)", date, "Shows a countdown on the list card."),
      who, err,
      h("button.btn.btn-primary.btn-block.f-save", { type: "button", onclick: save }, "Save list")));
  function save() {
    const list = { title: title.value || "My words", lang: p.settings.voice, words: parseWords(words.value), testDate: date.value || null, source: "paste" };
    if (!list.words.length) return showError(err, storeErrorText("empty"));
    const ids = who.selected();
    if (!ids.length) return showError(err, "Pick at least one player.");
    const r = saveListPipeline(list, ids);
    if (!r.ok) return showError(err, storeErrorText(r.error));
    toast(`Saved "${r.list.title}" with ${r.list.words.length} words.`, "good");
    go("#/parent/lists", true);
  }
}

/** Which scanned words to pre-uncheck: header words in the first two lines or next to a colon. */
export function headerWordsToUncheck(rawText) {
  const out = new Set();
  const lines = String(rawText || "").split(/\r?\n/).filter((l) => /[a-z]/i.test(l));
  const firstTwo = lines.slice(0, 2).join(" ").toLowerCase();
  const near = new Set();
  for (const m of String(rawText || "").matchAll(/([A-Za-z]+)\s*:|:\s*([A-Za-z]+)/g)) near.add((m[1] || m[2]).toLowerCase());
  for (const w of HEADER_WORDS) {
    if (new RegExp("\\b" + w + "\\b").test(firstTwo) || near.has(w)) out.add(w);
  }
  return out;
}

function scanForm({ p, go, body }) {
  const err = errorBox();
  const file = h("input.f-file", { type: "file", accept: "image/*", capture: "environment" });
  const pickBtn = h("label.btn.btn-primary.btn-block.scan-pick", "Take or choose a photo", file);
  const progress = h("div.scan-progress", { hidden: true, role: "progressbar", "aria-label": "Reading the photo", "aria-valuemin": "0", "aria-valuemax": "100" }, h("span"));
  const status = h("p.muted.scan-status", "Use a clear, flat photo of the word list in good light. Printed words work best.");
  const review = h("div.scan-review");
  body.append(backRow(go, "#/parent/lists"), h("h2.subtitle", "Scan a word list"), h("div.card.form", pickBtn, progress, status, err), review);

  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    err.hidden = true;
    review.replaceChildren();
    progress.hidden = false;
    status.textContent = "Reading the photo... The first scan downloads the reader (a few MB), so it can take a minute.";
    const set = (x) => { progress.firstChild.style.width = Math.round(x * 100) + "%"; progress.setAttribute("aria-valuenow", String(Math.round(x * 100))); };
    set(0);
    try {
      const { scanImage } = await import("../ocr.js");
      const res = await scanImage(f, set);
      progress.hidden = true;
      if (!res.words.length) { status.textContent = ""; return showError(err, "No words were found in that photo. Try a brighter, flatter picture, or type the words."); }
      status.textContent = `Found ${res.words.length} word${res.words.length === 1 ? "" : "s"}. Check them below.`;
      showReview(res.words.slice(0, MAX_WORDS), headerWordsToUncheck(res.rawText), res.words.length > MAX_WORDS);
    } catch (e) {
      progress.hidden = true;
      status.textContent = "";
      showError(err, (e && e.message) || "Could not read the photo. Try again, or type the words.");
    }
  });

  function showReview(words, uncheck, capped) {
    const rows = h("div.tag-list");
    const addRow = (w, on) => {
      const cb = h("input.tag-on", { type: "checkbox", checked: on, "aria-label": "Keep this word" });
      const inp = h("input.sh-input.tag-word", { type: "text", value: disp(w), spellcheck: "false", autocapitalize: "off", "aria-label": "Word" });
      const row = h("div.tag" + (on ? "" : ".tag-off"), cb, inp, h("button.btn.btn-ghost.tag-del", { type: "button", "aria-label": "Remove word", html: ICON.close, onclick: () => row.remove() }));
      cb.addEventListener("change", () => row.classList.toggle("tag-off", !cb.checked));
      rows.appendChild(row);
    };
    for (const w of words) addRow(w, !uncheck.has(w));
    const extra = h("input.sh-input.tag-new", { type: "text", placeholder: "Add a missing word", spellcheck: "false", autocapitalize: "off" });
    const title = titleInput();
    const date = dateInput();
    const who = playersPicker(p);
    const err2 = errorBox();
    review.append(h("div.card.form",
      h("p.muted", "Untick or remove anything that is not a spelling word. Tap a word to fix it." + (uncheck.size ? " Header words like \"name\" and \"date\" start unticked." : "") + (capped ? ` Only the first ${MAX_WORDS} words are kept.` : "")),
      rows,
      h("div.row", extra, h("button.btn.tag-add", { type: "button", onclick: () => { for (const w of parseWords(extra.value)) addRow(w, true); extra.value = ""; } }, "Add")),
      field("List name", title), field("Test date (optional)", date), who, err2,
      h("button.btn.btn-primary.btn-block.f-save", { type: "button", onclick: () => {
        const kept = [...rows.querySelectorAll(".tag")].filter((r) => r.querySelector(".tag-on").checked).map((r) => r.querySelector(".tag-word").value);
        const ws = parseWords(kept.join(" ")).slice(0, MAX_WORDS);
        if (!ws.length) return showError(err2, storeErrorText("empty"));
        const ids = who.selected();
        if (!ids.length) return showError(err2, "Pick at least one player.");
        const r = saveListPipeline({ title: title.value || "Scanned words", lang: p.settings.voice, words: ws, testDate: date.value || null, source: "scan" }, ids);
        if (!r.ok) return showError(err2, storeErrorText(r.error));
        toast(`Saved "${r.list.title}" with ${r.list.words.length} words.`, "good");
        go("#/parent/lists", true);
      } }, "Save list")));
  }
}

function pickForm({ p, go, body }) {
  const topics = [...new Set(LISTS.map((l) => l.topic))];
  topics.sort((x, y) => (x === "dolch" ? -1 : y === "dolch" ? 1 : x.localeCompare(y)));
  let topic = "all", level = 0;
  const chips = h("div.chip-row.topic-row");
  const lvl = h("div.chip-row.level-row");
  const out = h("div.pick-grid");
  const name = (t) => TOPIC_NAMES[t] || t.charAt(0).toUpperCase() + t.slice(1);
  const chip = (label, on, fn) => h("button.chip" + (on ? ".on" : ""), { type: "button", "aria-pressed": String(on), onclick: fn }, label);
  function draw() {
    chips.replaceChildren(chip("All", topic === "all", () => { topic = "all"; draw(); }), ...topics.map((t) => chip(name(t), topic === t, () => { topic = t; draw(); })));
    lvl.replaceChildren(chip("Any level", level === 0, () => { level = 0; draw(); }), ...LEVELS.map((L, i) => chip(L, level === i + 1, () => { level = i + 1; draw(); })));
    out.replaceChildren();
    const me = store.getProfile(p.id);
    for (const l of LISTS) {
      if (topic !== "all" && l.topic !== topic) continue;
      if (level && l.topic !== "dolch" && l.level !== level) continue;
      const have = me.listIds.includes(l.id);
      out.appendChild(h("div.card.pick-card", { dataset: { list: l.id } },
        h("b", l.title),
        h("span.muted.pick-words", l.words.slice(0, 6).map((x) => disp(x.w)).join(", ") + (l.words.length > 6 ? ", ..." : "")),
        h("span.muted", `${l.words.length} words`),
        h("button.btn" + (have ? "" : ".btn-primary") + ".pick-add", { type: "button", disabled: have, onclick: () => {
          const r = saveListPipeline({ id: l.id, title: l.title, lang: me.settings.voice, words: l.words, testDate: null, source: "bundled" }, [p.id]);
          if (!r.ok) return toast(storeErrorText(r.error), "bad");
          toast(`Added "${l.title}".`, "good");
          draw();
        } }, have ? "Added" : "Add")));
    }
    if (!out.children.length) out.appendChild(h("p.muted", "No lists for that choice."));
  }
  draw();
  body.append(backRow(go, "#/parent/lists"), h("h2.subtitle", "Ready-made lists"), h("p.muted", "Pick a topic and level. Each list is added for " + p.name + "."), chips, lvl, out);
}

function editList({ p, go, body }, id) {
  const list = store.getList(id);
  if (!list) { body.appendChild(h("p", "That list was not found.")); return; }
  const work = list.words.map((x) => ({ ...x }));
  const err = errorBox();
  const title = titleInput(list.title);
  const date = dateInput(list.testDate || "");
  const rows = h("div.tag-list.edit-words");
  function drawRows() {
    rows.replaceChildren();
    work.forEach((x, i) => {
      const inp = h("input.sh-input.tag-word", { type: "text", value: disp(x.w), spellcheck: "false", autocapitalize: "off", "aria-label": "Word" });
      inp.addEventListener("change", () => { x.w = inp.value; });
      rows.appendChild(h("div.tag", { dataset: { w: x.w } },
        h("button.btn.btn-ghost.tag-star" + (x.star ? ".on" : ""), { type: "button", "aria-pressed": String(!!x.star), "aria-label": "Challenge word (plays last, double XP)", html: ICON.star, onclick: () => { x.star = !x.star; drawRows(); } }),
        inp,
        h("button.btn.btn-ghost.tag-del", { type: "button", "aria-label": "Remove word", html: ICON.close, onclick: () => { work.splice(i, 1); drawRows(); } })));
    });
  }
  drawRows();
  const more = h("textarea.sh-input.f-more", { rows: "3", placeholder: "Add more words", spellcheck: "false", autocapitalize: "off" });
  body.append(backRow(go, "#/parent/lists"), h("h2.subtitle", "Edit list"),
    h("div.card.form",
      field("List name", title),
      field("Test date (optional)", date),
      h("div.field", h("span.field-label", "Words"), h("small.muted", "Star = challenge word: it plays last and pays double XP."), rows),
      field("Add words", more),
      err,
      h("button.btn.btn-primary.btn-block.f-save", { type: "button", onclick: save }, "Save changes"),
      h("a.btn.btn-block", { href: "#/parent/share/" + encodeURIComponent(list.id) }, "Share this list")),
    h("div.card.form.danger-zone",
      h("button.btn.btn-block.f-remove", { type: "button", onclick: removeMine }, `Remove from ${p.name} only`),
      h("button.btn.btn-block.btn-danger.f-delete", { type: "button", onclick: del }, "Delete list for everyone")));

  function save() {
    const words = work.concat(parseWords(more.value).map((w) => ({ w, star: false })));
    const r = saveListPipeline({ ...list, title: title.value || list.title, testDate: date.value || null, words }, []);
    if (!r.ok) return showError(err, storeErrorText(r.error));
    toast("Saved.", "good");
    go("#/parent/lists", true);
  }
  async function removeMine() {
    const ok = await dialog({ title: "Remove this list?", body: `"${list.title}" will be removed from ${p.name}. Any creature already hatched stays.`, buttons: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Remove", kind: "danger", value: true }] });
    if (!ok) return;
    removeListFromPlayer(p.id, list.id);
    toast("Removed.");
    go("#/parent/lists", true);
  }
  async function del() {
    const ok = await dialog({ title: "Delete this list?", body: `"${list.title}" will be deleted for every player on this device. Hatched creatures stay.`, buttons: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Delete", kind: "danger", value: true }] });
    if (!ok) return;
    const r = deleteListEverywhere(list.id);
    if (!r.ok) return showError(err, storeErrorText(r.error));
    toast("List deleted.");
    go("#/parent/lists", true);
  }
}

export function shareUrl(list) {
  const base = location.href.split("#")[0].split("?")[0];
  return base + encodeList(list);
}

function shareList({ go, body }, id) {
  const list = store.getList(id);
  if (!list) { body.appendChild(h("p", "That list was not found.")); return; }
  const url = shareUrl(list);
  const link = h("input.sh-input.share-link", { type: "text", readonly: true, value: url, "aria-label": "Share link" });
  const copyBtn = h("button.btn.btn-primary.share-copy", { type: "button", onclick: async () => { const ok = await copyText(url, link); toast(ok ? "Link copied." : "Select the link and copy it.", ok ? "good" : ""); } }, "Copy link");
  const qr = h("div.qr-box");
  body.append(backRow(go, "#/parent/lists"), h("h2.subtitle", `Share "${list.title}"`),
    h("div.card.form",
      h("p.muted", "Send this link, or let another phone scan the QR code. The words travel inside the link: nothing is uploaded."),
      h("div.row.share-row", link, copyBtn),
      qr));
  renderQR(qr, url);
}

// ---------- Players ----------
function playersTab({ p, go, body }) {
  body.appendChild(h("h2.subtitle", "Players"));
  for (const q of store.listProfiles()) {
    const name = h("input.sh-input.pl-name", { type: "text", maxlength: "20", value: q.name, "aria-label": "Name" });
    const av = h("button.pl-avatar", { type: "button", "aria-label": "Change picture", onclick: async () => {
      const grid = h("div.np-avatars");
      const v = await new Promise((resolve) => {
        for (const [id] of AVATARS) grid.appendChild(h("button.np-avatar", { type: "button", "aria-label": id, onclick: () => resolve(id) }, avatarImg(id)));
        dialog({ title: "Pick a picture", body: grid, buttons: [{ label: "Cancel", kind: "ghost", value: null }] }).then(() => resolve(null));
      });
      document.querySelector(".sh-modal-back")?.remove();
      if (!v) return;
      const r = updateProfile(q.id, (x) => { x.avatar = v; });
      if (!r.ok) return toast(storeErrorText(r.error), "bad");
      go("#/parent/players", true);
    } }, avatarImg(q.avatar));
    body.appendChild(h("div.card.pl-row", { dataset: { pid: q.id } }, av, name,
      h("button.btn.pl-save", { type: "button", onclick: () => {
        const n = name.value.replace(/\s+/g, " ").trim().slice(0, 20);
        if (!n) return toast("A name is needed.");
        const r = updateProfile(q.id, (x) => { x.name = n; });
        toast(r.ok ? "Saved." : storeErrorText(r.error), r.ok ? "good" : "bad");
      } }, "Save"),
      h("button.btn.btn-danger.pl-del", { type: "button", onclick: async () => {
        const ok = await dialog({ title: `Delete ${q.name}?`, body: `All of ${q.name}'s progress, coins and creatures on this device will be gone. Make a backup first if you are not sure.`, buttons: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Delete", kind: "danger", value: true }] });
        if (!ok) return;
        store.deleteProfile(q.id);
        // Lists that no player uses any more are removed too
        for (const id of q.listIds) if (!store.listProfiles().some((x) => x.listIds.includes(id))) store.deleteList(id);
        if (q.id === p.id) { session.profileId = null; session.parentUnlocked = false; return go("#/who", true); }
        go("#/parent/players", true);
      } }, "Delete")));
  }
  body.appendChild(h("a.btn.btn-primary.btn-block.pl-add", { href: "#/parent/players/new" }, "Add player"));
}

// ---------- Backup ----------
function backupTab({ go, body }) {
  const code = store.exportBackup();
  const out = h("textarea.sh-input.backup-out", { rows: "4", readonly: true, "aria-label": "Backup code" });
  out.value = code;
  const inp = h("textarea.sh-input.backup-in", { rows: "4", placeholder: "Paste a backup code here", spellcheck: "false", autocapitalize: "off", "aria-label": "Backup code to restore" });
  const err = errorBox();
  const MSG = { format: "That does not look like a Spell Hatch backup code.", checksum: "That code is incomplete or was changed. Copy the whole code again.", shape: "That backup code is damaged.", version: "That backup is from a newer version of Spell Hatch.", quota: storeErrorText("quota") };
  body.append(h("h2.subtitle", "Backup"),
    h("div.card.form",
      h("p.muted", "Save this code somewhere safe (for example, email it to yourself). It holds every player and list on this device."),
      out,
      h("button.btn.btn-primary.backup-copy", { type: "button", onclick: async () => { const ok = await copyText(code, out); toast(ok ? "Backup code copied." : "Select the code and copy it.", ok ? "good" : ""); } }, "Copy backup code")),
    h("h2.subtitle", "Restore"),
    h("div.card.form",
      h("p.muted", "Paste a backup code to bring players and lists back. Players with the same id are replaced by the backup."),
      inp, err,
      h("button.btn.backup-import", { type: "button", onclick: () => {
        err.hidden = true;
        const r = store.importBackup(inp.value);
        if (!r.ok) return showError(err, MSG[r.error] || "Could not restore that code.");
        toast(`Restored ${r.profiles} player${r.profiles === 1 ? "" : "s"} and ${r.lists} list${r.lists === 1 ? "" : "s"}.`, "good");
        const cur = currentProfile();
        if (!cur) { session.profileId = null; session.parentUnlocked = false; return go("#/who", true); }
        applyProfileLook(cur);
        go("#/parent/backup", true);
      } }, "Restore")));
}

// ---------- Settings ----------
function settingsTab({ p: me, go, body }) {
  const players = store.listProfiles();
  // Which player's settings are being edited. Changing it never changes who is playing.
  const p = (session.settingsFor && store.getProfile(session.settingsFor)) || me;
  body.appendChild(h("h2.subtitle", `Settings for ${p.name}`));
  if (players.length > 1) {
    body.appendChild(h("div.chip-row.settings-who", players.map((q) => h("button.chip" + (q.id === p.id ? ".on" : ""), { type: "button", "aria-pressed": String(q.id === p.id),
      onclick: () => { session.settingsFor = q.id; go("#/parent/settings", true); } }, avatarImg(q.avatar, "check-avatar"), q.name))));
  }
  const s = p.settings;
  const set = (patch) => {
    const r = updateProfile(p.id, (x) => { Object.assign(x.settings, patch); });
    if (!r.ok) return toast(storeErrorText(r.error), "bad");
    if (p.id === me.id) applyProfileLook(store.getProfile(p.id));
    go("#/parent/settings", true);
  };
  // Some devices (often Android) have no en-GB voice: say so, speech.js falls back to another English voice.
  const voiceNote = h("small.muted.voice-note", { hidden: true }, "UK voice is not on this device, using another English voice.");
  initSpeech().then((info) => {
    if (info && info.voices && info.voices.length && !info.voices.some((v) => v.lang === "en-GB") && s.voice === "en-GB") voiceNote.hidden = false;
  }).catch(() => {});
  const seg = (name, cls, options, value, onPick) => h("div.setting",
    h("span.setting-label", name),
    h("div.seg." + cls, { role: "radiogroup", "aria-label": name }, options.map(([v, label]) => h("button.seg-btn" + (v === value ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(v === value), dataset: { v }, onclick: () => onPick(v) }, label))));
  const toggle = (name, cls, desc, on, onFlip) => h("div.setting",
    h("div.setting-text", h("span.setting-label", name), desc ? h("small.muted", desc) : null),
    h("button.toggle." + cls, { type: "button", role: "switch", "aria-checked": String(!!on), "aria-label": name, onclick: () => onFlip(!on) }, h("span.toggle-knob")));
  body.appendChild(h("div.card.form.settings",
    seg("Voice", "set-voice", [["en-US", "US English"], ["en-GB", "UK English"]], s.voice, (v) => set({ voice: v })),
    voiceNote,
    seg("Keyboard", "set-keyboard", [["abc", "ABC (big keys)"], ["qwerty", "QWERTY (for older kids)"]], s.keyboard, (v) => set({ keyboard: v })),
    toggle("Dyslexia-friendly font", "set-dyslexia", "Uses OpenDyslexic for the spelling words.", s.dyslexiaFont, (v) => set({ dyslexiaFont: v })),
    toggle("Sound effects", "set-sfx", "Little chimes for right answers and hatching.", s.sfx, (v) => set({ sfx: v })),
    toggle("Silent mode", "set-silent", "No talking: shows a picture or a clue instead of reading the word.", s.silent, (v) => set({ silent: v }))));
  const persisted = h("small.muted.persist-note", "");
  try { navigator.storage && navigator.storage.persisted && navigator.storage.persisted().then((v) => { persisted.textContent = v ? "This browser will keep Spell Hatch data." : "This browser may clear data after a while. Add to Home Screen and make backups."; }); } catch { /* ignore */ }
  body.appendChild(h("div.card.form", h("b", "Storage"), h("span.muted", `About ${Math.round(store.bytesUsed() / 1024)} KB used.`), persisted));
}
