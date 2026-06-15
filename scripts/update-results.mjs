#!/usr/bin/env node
/* ===========================================================================
   update-results.mjs — auto-fill official group results into data.js
   ---------------------------------------------------------------------------
   Pulls the FIFA World Cup 2026 group-stage results from the openfootball
   public-domain dataset (no API key) and rewrites the PLAYED_RESULTS block in
   data.js. Run by .github/workflows/update-results.yml on a schedule; can also
   be run locally:  node scripts/update-results.mjs

   Design notes:
   - Only GROUP-stage matches are written. Knockout outcomes stay user-picked.
   - Matches are mapped to our fixtures by the *unordered pair of team ids*, so
     it doesn't matter that our synthetic schedule differs from the real one.
   - Scores are oriented to OUR fixture's home/away, not the source's.
   - Output is deterministic (sorted, no timestamps) so unchanged data => no
     commit.
   =========================================================================== */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data.js');

/* Source team name (normalized) -> our team id, for names that don't match
   TEAMS[].name exactly. Names that already match are resolved automatically. */
const NAME_ALIASES = {
  'czech republic': 'cze',
  'korea republic': 'kor',
  'south korea': 'kor',
  'united states': 'usa',
  'usa': 'usa',
  'turkiye': 'tur',
  'cote divoire': 'civ',
  'ivory coast': 'civ',
  'cabo verde': 'cpv',
  'cape verde': 'cpv',
  'congo dr': 'cod',
  'dr congo': 'cod',
  'ir iran': 'irn',
  'iran': 'irn',
  'bosnia and herzegovina': 'bih',
  'bosnia herzegovina': 'bih',
};

const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Load TEAMS / GROUPS / FIXTURES out of data.js without modifying it. */
function loadData() {
  const code = fs.readFileSync(DATA_PATH, 'utf8') +
    '\n__exported = { TEAMS, GROUPS, GROUP_LETTERS, FIXTURES };';
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.__exported;
}

function buildNameIndex(TEAMS) {
  const idx = { ...NAME_ALIASES };
  for (const [id, t] of Object.entries(TEAMS)) idx[norm(t.name)] = id;
  return idx;
}

async function main() {
  const { TEAMS, GROUPS, GROUP_LETTERS, FIXTURES } = loadData();
  const nameIndex = buildNameIndex(TEAMS);

  // pair-of-ids -> fixture (group fixtures only; all 6 pairings exist per group)
  const pairKey = (a, b) => [a, b].sort().join('|');
  const fixtureByPair = new Map();
  for (const f of FIXTURES) fixtureByPair.set(`${f.group}:${pairKey(f.home, f.away)}`, f);

  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const resolve = (name) => nameIndex[norm(name)] || null;

  const results = {};       // "group:home:away" -> [hg, ag]   (finished only)
  const dates = {};         // "group:home:away" -> "yyyy-mm-dd" (all group matches)
  const warnings = [];
  let applied = 0;

  for (const m of data.matches || []) {
    const gm = /^Group ([A-L])$/.exec(m.group || '');
    if (!gm) continue;                          // group stage only
    const group = gm[1];

    const id1 = resolve(m.team1), id2 = resolve(m.team2);
    if (!id1 || !id2) {
      warnings.push(`Unmapped team in ${m.group}: "${m.team1}" / "${m.team2}"`);
      continue;
    }
    const fx = fixtureByPair.get(`${group}:${pairKey(id1, id2)}`);
    if (!fx) {
      warnings.push(`No fixture for ${m.group}: ${m.team1} v ${m.team2} (groups out of sync?)`);
      continue;
    }
    const fxKey = `${fx.group}:${fx.home}:${fx.away}`;

    if (m.date) dates[fxKey] = m.date;
    if (m.score && Array.isArray(m.score.ft)) {
      // goals per team id, then orient to our fixture's home/away
      const goals = { [id1]: m.score.ft[0], [id2]: m.score.ft[1] };
      results[fxKey] = [goals[fx.home], goals[fx.away]];
      applied++;
    }
  }

  let src = fs.readFileSync(DATA_PATH, 'utf8');
  src = replaceBlock(src, 'PLAYED_RESULTS', renderEntries(FIXTURES, results,
    ([hg, ag]) => `[${hg}, ${ag}]`));
  src = replaceBlock(src, 'FIXTURE_DATES', renderEntries(FIXTURES, dates,
    (d) => `'${d}'`));
  fs.writeFileSync(DATA_PATH, src);

  console.log(`Applied ${applied} group results, ${Object.keys(dates).length} dates.`);
  if (warnings.length) console.warn('Warnings:\n  ' + warnings.join('\n  '));
}

/* Build the entry lines for a generated block, in fixture order (group A..L,
   matchday order) with per-group comments, for stable diffs. */
function renderEntries(FIXTURES, map, fmtValue) {
  const lines = [];
  let lastGroup = null;
  for (const f of FIXTURES) {
    const key = `${f.group}:${f.home}:${f.away}`;
    if (!(key in map)) continue;
    if (f.group !== lastGroup) { lines.push(`  // Group ${f.group}`); lastGroup = f.group; }
    lines.push(`  '${key}': ${fmtValue(map[key])},`);
  }
  return lines;
}

/* Replace `const NAME = { ... };` in data.js, preserving the AUTO-GENERATED header. */
function replaceBlock(src, name, lines) {
  const block =
    `const ${name} = {\n` +
    '  // AUTO-GENERATED by scripts/update-results.mjs from the openfootball\n' +
    '  // public-domain dataset. Do not edit by hand — re-run the updater.\n' +
    (lines.length ? lines.join('\n') + '\n' : '') +
    '};';
  const re = new RegExp(`const ${name} = \\{[\\s\\S]*?\\n\\};`);
  if (!re.test(src)) throw new Error(`Could not locate ${name} block in data.js`);
  return src.replace(re, block);
}

main().catch((err) => { console.error(err); process.exit(1); });
