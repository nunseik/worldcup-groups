/* ===========================================================================
   data.js — single source of truth for worldcup-groups
   ---------------------------------------------------------------------------
   Everything the page renders (standings, fixtures, knockout bracket) is
   derived from the structures in this file. To update the tournament as
   results come in, edit FIXTURES below (set `played: true` and a scoreline)
   — NOT the HTML. app.js recomputes standings, qualifiers and the bracket.
   =========================================================================== */

/* --- Teams ---------------------------------------------------------------
   id -> { name, flag }.  Flags are the same Unicode emoji used previously,
   including the England / Scotland subdivision flags. */
const TEAMS = {
  // Group A
  mex: { name: 'Mexico',        flag: '🇲🇽' },
  kor: { name: 'South Korea',   flag: '🇰🇷' },
  cze: { name: 'Czechia',       flag: '🇨🇿' },
  rsa: { name: 'South Africa',  flag: '🇿🇦' },
  // Group B
  sui: { name: 'Switzerland',          flag: '🇨🇭' },
  can: { name: 'Canada',               flag: '🇨🇦' },
  qat: { name: 'Qatar',                flag: '🇶🇦' },
  bih: { name: 'Bosnia & Herzegovina', flag: '🇧🇦' },
  // Group C
  sco: { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  bra: { name: 'Brazil',   flag: '🇧🇷' },
  mar: { name: 'Morocco',  flag: '🇲🇦' },
  hai: { name: 'Haiti',    flag: '🇭🇹' },
  // Group D
  usa: { name: 'USA',       flag: '🇺🇸' },
  aus: { name: 'Australia', flag: '🇦🇺' },
  par: { name: 'Paraguay',  flag: '🇵🇾' },
  tur: { name: 'Turkey',    flag: '🇹🇷' },
  // Group E
  ger: { name: 'Germany',     flag: '🇩🇪' },
  ecu: { name: 'Ecuador',     flag: '🇪🇨' },
  civ: { name: 'Ivory Coast', flag: '🇨🇮' },
  cuw: { name: 'Curaçao',     flag: '🇨🇼' },
  // Group F
  ned: { name: 'Netherlands', flag: '🇳🇱' },
  jpn: { name: 'Japan',       flag: '🇯🇵' },
  tun: { name: 'Tunisia',     flag: '🇹🇳' },
  swe: { name: 'Sweden',      flag: '🇸🇪' },
  // Group G
  bel: { name: 'Belgium',     flag: '🇧🇪' },
  irn: { name: 'Iran',        flag: '🇮🇷' },
  egy: { name: 'Egypt',       flag: '🇪🇬' },
  nzl: { name: 'New Zealand', flag: '🇳🇿' },
  // Group H
  esp: { name: 'Spain',        flag: '🇪🇸' },
  uru: { name: 'Uruguay',      flag: '🇺🇾' },
  ksa: { name: 'Saudi Arabia', flag: '🇸🇦' },
  cpv: { name: 'Cape Verde',   flag: '🇨🇻' },
  // Group I
  fra: { name: 'France',  flag: '🇫🇷' },
  sen: { name: 'Senegal', flag: '🇸🇳' },
  nor: { name: 'Norway',  flag: '🇳🇴' },
  irq: { name: 'Iraq',    flag: '🇮🇶' },
  // Group J
  arg: { name: 'Argentina', flag: '🇦🇷' },
  aut: { name: 'Austria',   flag: '🇦🇹' },
  alg: { name: 'Algeria',   flag: '🇩🇿' },
  jor: { name: 'Jordan',    flag: '🇯🇴' },
  // Group K
  por: { name: 'Portugal',   flag: '🇵🇹' },
  col: { name: 'Colombia',   flag: '🇨🇴' },
  uzb: { name: 'Uzbekistan', flag: '🇺🇿' },
  cod: { name: 'DR Congo',   flag: '🇨🇩' },
  // Group L
  eng: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  cro: { name: 'Croatia', flag: '🇭🇷' },
  pan: { name: 'Panama',  flag: '🇵🇦' },
  gha: { name: 'Ghana',   flag: '🇬🇭' },
};

/* --- Groups --------------------------------------------------------------
   Letter -> ordered array of 4 team ids (seed order, used by the schedule). */
const GROUPS = {
  A: ['mex', 'kor', 'cze', 'rsa'],
  B: ['sui', 'can', 'qat', 'bih'],
  C: ['sco', 'bra', 'mar', 'hai'],
  D: ['usa', 'aus', 'par', 'tur'],
  E: ['ger', 'ecu', 'civ', 'cuw'],
  F: ['ned', 'jpn', 'tun', 'swe'],
  G: ['bel', 'irn', 'egy', 'nzl'],
  H: ['esp', 'uru', 'ksa', 'cpv'],
  I: ['fra', 'sen', 'nor', 'irq'],
  J: ['arg', 'aut', 'alg', 'jor'],
  K: ['por', 'col', 'uzb', 'cod'],
  L: ['eng', 'cro', 'pan', 'gha'],
};

const GROUP_LETTERS = Object.keys(GROUPS);

/* --- Fixtures ------------------------------------------------------------
   Round-robin via a fixed 1-factorisation of the 4 seeds (0..3):
     MD1: 0v3, 1v2   MD2: 0v2, 1v3   MD3: 0v1, 2v3
   Matchday 1 of groups A, B and C is PLAYED with scorelines that reproduce
   the standings the site shipped with; everything else is unplayed (the
   matches the user predicts).

   A fixture: { group, md, home, away, played, hg, ag }
   (hg/ag = home/away goals; only meaningful when played === true) */
const SCHEDULE = [
  [0, 3], [1, 2],   // MD1
  [0, 2], [1, 3],   // MD2
  [0, 1], [2, 3],   // MD3
];

function buildFixtures() {
  const fixtures = [];
  for (const letter of GROUP_LETTERS) {
    const ids = GROUPS[letter];
    SCHEDULE.forEach((pair, idx) => {
      const md = Math.floor(idx / 2) + 1;
      fixtures.push({
        group: letter,
        md,
        home: ids[pair[0]],
        away: ids[pair[1]],
        played: false,
        hg: 0,
        ag: 0,
      });
    });
  }
  return fixtures;
}

const FIXTURES = buildFixtures();

/* Official played group results, keyed by "group:home:away". This block is
   refreshed automatically by scripts/update-results.mjs (openfootball source);
   you can also edit it by hand if running the updater isn't convenient. */
const PLAYED_RESULTS = {
  // AUTO-GENERATED by scripts/update-results.mjs from the openfootball
  // public-domain dataset. Do not edit by hand — re-run the updater.
  // Group A
  'A:mex:rsa': [2, 0],
  'A:kor:cze': [2, 1],
  // Group B
  'B:sui:qat': [1, 1],
  'B:can:bih': [1, 1],
  // Group C
  'C:sco:hai': [1, 0],
  'C:bra:mar': [1, 1],
  // Group D
  'D:usa:par': [4, 1],
  'D:aus:tur': [2, 0],
  // Group E
  'E:ger:cuw': [7, 1],
  'E:ecu:civ': [0, 1],
  // Group F
  'F:ned:jpn': [2, 2],
  'F:tun:swe': [1, 5],
  // Group H
  'H:esp:cpv': [0, 0],
};

FIXTURES.forEach((f) => {
  const r = PLAYED_RESULTS[`${f.group}:${f.home}:${f.away}`];
  if (r) {
    f.played = true;
    f.hg = r[0];
    f.ag = r[1];
  }
});

/* --- Knockout structure --------------------------------------------------
   Official 2026 bracket (FIFA / Wikipedia "2026 FIFA World Cup knockout
   stage"). Each match has two slots resolved as:
     { kind: 'winner', group }      group winner
     { kind: 'runner', group }      group runner-up
     { kind: 'third',  match }      best-3rd assigned to this match (see below)
     { kind: 'winOf',  match }      winner of an earlier match
     { kind: 'loseOf', match }      loser of an earlier match (3rd-place game)
*/
const W = (group) => ({ kind: 'winner', group });
const R = (group) => ({ kind: 'runner', group });
const T = (match) => ({ kind: 'third', match });
const Wm = (match) => ({ kind: 'winOf', match });
const Lm = (match) => ({ kind: 'loseOf', match });

const KO_MATCHES = [
  // Round of 32 (matches 73–88)
  { id: 73, round: 'R32', a: R('A'), b: R('B') },
  { id: 74, round: 'R32', a: W('E'), b: T(74) },
  { id: 75, round: 'R32', a: W('F'), b: R('C') },
  { id: 76, round: 'R32', a: W('C'), b: R('F') },
  { id: 77, round: 'R32', a: W('I'), b: T(77) },
  { id: 78, round: 'R32', a: R('E'), b: R('I') },
  { id: 79, round: 'R32', a: W('A'), b: T(79) },
  { id: 80, round: 'R32', a: W('L'), b: T(80) },
  { id: 81, round: 'R32', a: W('D'), b: T(81) },
  { id: 82, round: 'R32', a: W('G'), b: T(82) },
  { id: 83, round: 'R32', a: R('K'), b: R('L') },
  { id: 84, round: 'R32', a: W('H'), b: R('J') },
  { id: 85, round: 'R32', a: W('B'), b: T(85) },
  { id: 86, round: 'R32', a: W('J'), b: R('H') },
  { id: 87, round: 'R32', a: W('K'), b: T(87) },
  { id: 88, round: 'R32', a: R('D'), b: R('G') },

  // Round of 16 (matches 89–96)
  { id: 89, round: 'R16', a: Wm(74), b: Wm(77) },
  { id: 90, round: 'R16', a: Wm(73), b: Wm(75) },
  { id: 91, round: 'R16', a: Wm(76), b: Wm(78) },
  { id: 92, round: 'R16', a: Wm(79), b: Wm(80) },
  { id: 93, round: 'R16', a: Wm(83), b: Wm(84) },
  { id: 94, round: 'R16', a: Wm(81), b: Wm(82) },
  { id: 95, round: 'R16', a: Wm(86), b: Wm(88) },
  { id: 96, round: 'R16', a: Wm(85), b: Wm(87) },

  // Quarter-finals (97–100)
  { id: 97,  round: 'QF', a: Wm(89), b: Wm(90) },
  { id: 98,  round: 'QF', a: Wm(93), b: Wm(94) },
  { id: 99,  round: 'QF', a: Wm(91), b: Wm(92) },
  { id: 100, round: 'QF', a: Wm(95), b: Wm(96) },

  // Semi-finals (101–102)
  { id: 101, round: 'SF', a: Wm(97), b: Wm(98) },
  { id: 102, round: 'SF', a: Wm(99), b: Wm(100) },

  // Third-place play-off (103) and Final (104)
  { id: 103, round: '3P', a: Lm(101), b: Lm(102) },
  { id: 104, round: 'F',  a: Wm(101), b: Wm(102) },
];

const ROUND_LABELS = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF:  'Quarter-finals',
  SF:  'Semi-finals',
  '3P': 'Third place',
  F:   'Final',
};

/* --- Best-third-place allocation -----------------------------------------
   The 8 R32 matches that take a best-third-placed team, and the fixed set of
   groups each one is allowed to draw from (FIFA "Annex C" constraints, as
   published on Wikipedia). Given the 8 groups whose third-placed team
   qualifies, app.js finds the matching of groups -> these slots that respects
   every allowed-set. FIFA's Annex C table is exactly such a matching; this
   reproduces it whenever the matching is unique. See NOTE in app.js. */
const THIRD_PLACE_SLOTS = {
  74: ['A', 'B', 'C', 'D', 'F'],
  77: ['C', 'D', 'F', 'G', 'H'],
  79: ['C', 'E', 'F', 'H', 'I'],
  80: ['E', 'H', 'I', 'J', 'K'],
  81: ['B', 'E', 'F', 'I', 'J'],
  82: ['A', 'E', 'H', 'I', 'J'],
  85: ['E', 'F', 'G', 'I', 'J'],
  87: ['D', 'E', 'I', 'J', 'L'],
};
