# Spell Hatch

Spelling practice games for kids 6 to 12. Five game modes, eggs that hatch into creatures, and no account, server or API needed. It runs entirely in the browser and works offline once loaded.

## Put it on GitHub Pages

1. Create a new GitHub repository (for example `spellhatch`).
2. Drag everything in this folder into the repository's "Add file > Upload files" page and commit.
3. Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. Open `https://<your-name>.github.io/spellhatch/` and use "Add to Home Screen" on phones and tablets.

After changing any app file, bump `CACHE_VERSION` at the top of `sw.js` (for example sh-v2 to sh-v3) so installed copies pick up the update.

The `tests/` folder and `package.json` are for development only. They are harmless on Pages and can be left in.

## Developing

No install step. Needs Node 20+ and Chrome.

- Run every test suite: `node tests/run.mjs` (or `node tests/run.mjs W1-C` for one card)
- Lint: `node tests/lint.mjs`
- Local server: `node tests/serve.mjs 8080`, then open http://127.0.0.1:8080/spellhatch/
- Mode harness: `demo.html?mode=type&words=knight` (see the comment at the top of demo.html)
- Screenshots: `node tests/shot.mjs "demo.html?mode=build" build`

The plan, contracts and work cards live one folder up: SCOPE.md, CONTRACTS.md, TASKS.md, VALIDATION.md.
