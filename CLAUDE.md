# worldcup-groups

A FIFA World Cup 2026 website. Shows the standings table for all 12 groups (A–L) of
the 48-team tournament (top-2 of each group highlighted), an interactive
**match-by-match prediction picker**, and the full official **knockout bracket** that
the user can predict all the way to a champion.

## Stack

- **Vanilla HTML + CSS + JS — no build step, no runtime dependencies.**
- Site files: `index.html`, `style.css`, `data.js`, `app.js`.
- Tooling (not shipped to the browser): `scripts/update-results.mjs` +
  `.github/workflows/update-results.yml` auto-refresh results.
- Opens directly in a browser; also served via GitHub Pages.

## Architecture

- **`data.js` is the single source of truth** — `TEAMS`, `GROUPS`, `FIXTURES`
  (72 group matches), the knockout structure (`KO_MATCHES`, official 2026 slotting),
  and `THIRD_PLACE_SLOTS`. To update results as the tournament progresses, edit
  `FIXTURES` / `PLAYED_RESULTS` in `data.js` — **not** the HTML.
- **`app.js`** computes standings, ranks qualifiers, assigns best-third-placed teams,
  fills the bracket, renders everything, and handles prediction interaction.
- **Persistence:** `data.js` is authoritative for **official (played) results** — they
  always override `localStorage`, so editing a real scoreline in `FIXTURES` /
  `PLAYED_RESULTS` shows up immediately for everyone. `localStorage`
  (`wc2026-scenario-v2`) only stores the user's **predictions** for not-yet-played
  matches plus their bracket picks (`loadState` / `saveState`). Bump the storage key
  if you change the saved shape.
- **`index.html`** holds only the page shell: the radio tab inputs, nav, empty
  `<section class="group-panel">` placeholders (filled by JS), and the
  `#bracket` section.

## Key conventions

- **Group tab navigation stays pure CSS**: hidden `<input type="radio" name="tabs">`
  at the top of `<body>` + `:checked ~ ...` sibling selectors target `#panel-x`. JS
  only fills panel *contents*; do not move tab switching into JS.
- **Standings tables** keep the column order `# | Team | P | W | D | L | GD | Pts`.
  Load-bearing: header tooltips are applied purely in CSS by column position
  (`.standings thead th:nth-child(n)::after`). `app.js` re-emits this exact `<thead>`;
  if you change columns, update both the render in `app.js` and the `nth-child` rules.
- **Rounded table corners** use `border-collapse: separate` + per-cell `border-radius`
  (NOT `overflow: hidden`), so tooltips can escape. Don't reintroduce overflow:hidden.
- **Qualifying rows** get the `adv` class (top 2 of each group), applied by `app.js`.
- **Flags** are Unicode emoji (incl. subdivision flags for England 🏴 and Scotland 🏴),
  defined once per team in `TEAMS`.
- **Tie-breakers** are simplified to Points → GD → GF → seed order (`standingsCompare`
  in `app.js`); full head-to-head rules are intentionally not implemented.
- **Best-third-place assignment**: FIFA's "Annex C" 495-row lookup is *not* transcribed.
  `assignThirds` instead matches the 8 qualifying groups to the 8 R32 third-place slots
  respecting each slot's published allowed-group set (`THIRD_PLACE_SLOTS`). This equals
  Annex C whenever the matching is unique. If you ever need exact Annex C fidelity,
  replace `assignThirds` with the transcribed table.

## Bracket

Official 2026 progression is encoded verbatim in `KO_MATCHES` (R32 matches 73–88 →
R16 → QF → SF → third-place play-off 103 / Final 104). Slots resolve from group
standings (`winner`/`runner`/`third`) or earlier matches (`winOf`/`loseOf`). Picking a
winner re-propagates forward and drops any now-invalid downstream picks
(`resolveBracket`).

## Auto-updating results

- **`scripts/update-results.mjs`** (Node 18+, no deps) pulls 2026 group-stage
  results from the [openfootball public-domain dataset](https://github.com/openfootball/worldcup.json)
  and rewrites two auto-generated blocks in `data.js`: `PLAYED_RESULTS` (finished
  scorelines) and `FIXTURE_DATES` (kick-off date for every group match, played or
  not). It loads `data.js` via `node:vm`, maps source matches to our fixtures by
  the **unordered pair of team ids** (so our synthetic schedule order doesn't
  matter), orients scores to our home/away, and only writes **group** matches
  (knockouts stay user-picked). `app.js` lists each group's fixtures in real
  chronological order (by `FIXTURE_DATES`) and shows the date.
  Source team names that differ from `TEAMS[].name` are handled by `NAME_ALIASES`
  (e.g. "Czech Republic" → `cze`); add new aliases there if the updater logs an
  "Unmapped team" warning. Run locally: `node scripts/update-results.mjs`.
- **`.github/workflows/update-results.yml`** runs it every 30 min (and on manual
  dispatch); if `data.js` changed it commits, which redeploys Pages. Because
  official results override `localStorage`, new scores reach all visitors while
  their bracket predictions persist.
- openfootball's 2026 groups currently match our seeded `GROUPS` exactly. If a
  future real draw diverges, the updater logs "groups out of sync" warnings and
  skips unmatched matches rather than writing bad data.

## Preview / deploy

- Local preview: `python3 -m http.server 5500` (see `.claude/launch.json`), or just
  open `index.html`.
- Live site: https://nunseik.github.io/worldcup-groups/ — GitHub Pages deploys from
  the `main` branch root on every push.

## Future ideas

- Exact Annex C third-place table; full head-to-head tie-breakers; shareable scenario
  URLs (encode `state` into the hash).
