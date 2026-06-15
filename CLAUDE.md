# worldcup-groups

A FIFA World Cup 2026 group standings website. Shows the standings table for all
12 groups (A–L) of the 48-team tournament, with the top-2 qualifying teams of each
group highlighted.

## Stack

- **Pure HTML + CSS only — no JavaScript, no build step, no dependencies.**
- Two source files: `index.html` and `style.css`.
- Opens directly in a browser; also served via GitHub Pages.

## Key conventions

- **No JS.** Interactivity is done entirely with CSS. Group tab navigation uses
  hidden `<input type="radio" name="tabs">` elements at the top of `<body>` plus
  `:checked ~ ...` sibling selectors. Keep this pattern — do not add scripts.
- **Standings tables** all share the same column order: `# | Team | P | W | D | L | GD | Pts`.
  This ordering is load-bearing: the header tooltips are applied purely in CSS by
  column position (`.standings thead th:nth-child(n)::after`), with zero per-cell
  markup. If you add/reorder columns, update the `nth-child` tooltip rules to match.
- **Rounded table corners** use a `border-collapse: separate` model with per-cell
  `border-radius` (NOT `overflow: hidden`), so header tooltips can render on top
  without being clipped. Don't reintroduce `overflow: hidden` on `.standings`.
- **Qualifying rows** get the `adv` class (green tint + green left border). Top 2
  of each group.
- **Flags** are Unicode emoji (including subdivision flags for England 🏴 and
  Scotland 🏴).

## Data

Standings are hardcoded in `index.html`. The tournament is in progress, so update
the relevant group's `<tbody>` rows (P/W/D/L/GD/Pts and row order) as results come
in. Groups that haven't played yet show all zeros.

## Preview / deploy

- Local preview: `python3 -m http.server 5500` (see `.claude/launch.json`), or just
  open `index.html`.
- Live site: https://nunseik.github.io/worldcup-groups/ — GitHub Pages deploys from
  the `main` branch root on every push.

## Future ideas

- Match-outcome predictions / scenario picker (intentionally deferred — would be the
  first feature to consider adding, and the only likely reason to introduce JS).
