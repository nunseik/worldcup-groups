/* ===========================================================================
   app.js — engine + rendering for worldcup-groups
   ---------------------------------------------------------------------------
   Reads the data model from data.js, computes standings + qualifiers, fills
   the knockout bracket, and lets the user predict every match through to a
   champion. State (predicted scores + bracket picks) persists in localStorage.

   NOTE on best-third-place assignment: FIFA's "Annex C" is a 495-row lookup
   that, for each set of 8 qualifying third-placed groups, fixes which group
   winner each one faces. Rather than transcribe the PDF, we solve the same
   constraint — match the 8 groups to the 8 R32 slots respecting each slot's
   published allowed-group set (THIRD_PLACE_SLOTS). This equals Annex C
   whenever that matching is unique; ambiguous cases resolve deterministically.
   =========================================================================== */

'use strict';

const STORAGE_KEY = 'wc2026-scenario-v2';

/* --- State ---------------------------------------------------------------
   results: array parallel to FIXTURES, each { hg, ag } as strings
            ('' = not entered; a fixture counts only when BOTH are filled).
   picks:   { matchId -> winning teamId } for knockout matches.

   data.js is the source of truth for OFFICIAL (played) results: those always
   come from FIXTURES and override anything in localStorage, so updating a
   real scoreline in data.js shows up immediately. localStorage only persists
   the user's PREDICTIONS for matches not yet officially played. */
let state = { results: [], picks: {} };

function fixtureKey(f) { return `${f.group}:${f.home}:${f.away}`; }

function defaultResults() {
  return FIXTURES.map((f) => ({
    hg: f.played ? String(f.hg) : '',
    ag: f.played ? String(f.ag) : '',
  }));
}

function loadState() {
  state = { results: defaultResults(), picks: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Apply saved predictions ONLY to fixtures not officially played in data.js.
    if (saved.predictions && typeof saved.predictions === 'object') {
      FIXTURES.forEach((f, i) => {
        if (f.played) return; // official result wins
        const p = saved.predictions[fixtureKey(f)];
        if (p) state.results[i] = { hg: p.hg ?? '', ag: p.ag ?? '' };
      });
    }
    if (saved.picks && typeof saved.picks === 'object') state.picks = saved.picks;
  } catch (e) {
    /* ignore corrupt storage */
  }
}

function saveState() {
  try {
    // Persist only predictions for not-yet-played fixtures, keyed by identity
    // so they survive schedule/index changes. Official results live in data.js.
    const predictions = {};
    FIXTURES.forEach((f, i) => {
      if (f.played) return;
      const r = state.results[i];
      if (r.hg !== '' || r.ag !== '') predictions[fixtureKey(f)] = r;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ predictions, picks: state.picks }));
  } catch (e) {
    /* storage may be unavailable; non-fatal */
  }
}

/* --- Fixture helpers ----------------------------------------------------- */
function fixtureResult(i) {
  const r = state.results[i];
  const hg = r.hg, ag = r.ag;
  if (hg === '' || ag === '') return null; // not played
  return { hg: Number(hg), ag: Number(ag) };
}

function groupFixtureIndexes(letter) {
  const idx = [];
  FIXTURES.forEach((f, i) => { if (f.group === letter) idx.push(i); });
  // Chronological order (ISO dates sort lexically); fall back to matchday.
  idx.sort((a, b) => {
    const da = FIXTURES[a].date || '', db = FIXTURES[b].date || '';
    return da.localeCompare(db) || (FIXTURES[a].md - FIXTURES[b].md) || (a - b);
  });
  return idx;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* "2026-06-11" -> "Jun 11" (date-only, no timezone math). '' if unknown. */
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}` : '';
}

/* --- Standings ----------------------------------------------------------- */
function computeStandings(letter) {
  const table = {};
  GROUPS[letter].forEach((id, seed) => {
    table[id] = { id, seed, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });

  groupFixtureIndexes(letter).forEach((i) => {
    const res = fixtureResult(i);
    if (!res) return;
    const f = FIXTURES[i];
    const h = table[f.home], a = table[f.away];
    h.p++; a.p++;
    h.gf += res.hg; h.ga += res.ag;
    a.gf += res.ag; a.ga += res.hg;
    if (res.hg > res.ag) { h.w++; h.pts += 3; a.l++; }
    else if (res.hg < res.ag) { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  });

  const rows = Object.values(table);
  rows.forEach((t) => { t.gd = t.gf - t.ga; });
  rows.sort(standingsCompare);
  rows.forEach((t, i) => { t.pos = i + 1; });
  return rows;
}

/* Primary FIFA criteria: points, goal difference, goals for.
   (Full head-to-head tie-breaks are intentionally simplified to these three;
   seed order is the final, deterministic tie-break.) */
function standingsCompare(a, b) {
  return (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf) || (a.seed - b.seed);
}

/* --- Best third-placed teams + slot assignment --------------------------- */
function rankedThirds() {
  const thirds = GROUP_LETTERS.map((letter) => {
    const t = computeStandings(letter)[2];
    return { group: letter, team: t };
  });
  thirds.sort((x, y) => standingsCompare(x.team, y.team));
  return thirds;
}

/* Match the 8 qualifying groups to the 8 third-place R32 slots, respecting
   each slot's allowed-group set. Returns { slotId -> group } or null. */
function assignThirds(groups) {
  const set = new Set(groups);
  const slots = Object.keys(THIRD_PLACE_SLOTS).map(Number);
  // Candidates per slot, restricted to the qualifying groups.
  const cand = {};
  slots.forEach((s) => {
    cand[s] = THIRD_PLACE_SLOTS[s].filter((g) => set.has(g));
  });
  // Backtracking, most-constrained slot first for a stable, fast solution.
  const order = slots.slice().sort((a, b) => cand[a].length - cand[b].length);
  const used = new Set();
  const out = {};
  function solve(k) {
    if (k === order.length) return true;
    const s = order[k];
    for (const g of cand[s]) {
      if (used.has(g)) continue;
      used.add(g); out[s] = g;
      if (solve(k + 1)) return true;
      used.delete(g); delete out[s];
    }
    return false;
  }
  return solve(0) ? out : null;
}

/* --- Knockout resolution ------------------------------------------------- */
const KO_BY_ID = {};
KO_MATCHES.forEach((m) => { KO_BY_ID[m.id] = m; });

/* Resolve every match's two team slots given current standings + picks.
   Returns { matchId -> { a, b, winner, loser } } with team ids or null. */
function resolveBracket() {
  // Group winners / runners-up / thirds from current standings.
  const standing = {};
  GROUP_LETTERS.forEach((l) => { standing[l] = computeStandings(l); });
  const thirds = rankedThirds();
  const qualifyingGroups = thirds.slice(0, 8).map((t) => t.group);
  const thirdSlot = assignThirds(qualifyingGroups) || {};
  const thirdTeamForSlot = {};
  Object.entries(thirdSlot).forEach(([slot, grp]) => {
    thirdTeamForSlot[slot] = standing[grp][2].id;
  });

  const resolved = {};

  function slotTeam(slot) {
    switch (slot.kind) {
      case 'winner': return standing[slot.group][0].id;
      case 'runner': return standing[slot.group][1].id;
      case 'third':  return thirdTeamForSlot[slot.match] ?? null;
      case 'winOf':  return resolved[slot.match] ? resolved[slot.match].winner : null;
      case 'loseOf': return resolved[slot.match] ? resolved[slot.match].loser : null;
      default: return null;
    }
  }

  // KO_MATCHES is ordered by id; every dependency points to a lower id, so a
  // single forward pass resolves correctly and also cleans stale picks.
  KO_MATCHES.forEach((m) => {
    const a = slotTeam(m.a);
    const b = slotTeam(m.b);
    let pick = state.picks[m.id];
    if (pick !== a && pick !== b) {
      if (pick !== undefined) { delete state.picks[m.id]; } // stale -> drop
      pick = undefined;
    }
    let winner = null, loser = null;
    if (pick !== undefined && a && b) {
      winner = pick;
      loser = pick === a ? b : a;
    }
    resolved[m.id] = { a, b, winner, loser };
  });

  return { resolved, thirds, qualifyingGroups, standing };
}

/* =========================================================================
   RENDERING
   ========================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);

function teamCell(id) {
  if (!id) return '<span class="muted">—</span>';
  const t = TEAMS[id];
  return `<span class="tflag">${t.flag}</span> ${t.name}`;
}

function gdText(gd) {
  if (gd > 0) return `<span class="gdpos">+${gd}</span>`;
  if (gd < 0) return `<span class="gdneg">−${Math.abs(gd)}</span>`;
  return '0';
}

/* ---- Group panels (standings + fixtures) -------------------------------- */
function standingsRowsHTML(letter) {
  return computeStandings(letter).map((t) => {
    const adv = t.pos <= 2 ? ' class="adv"' : '';
    return `<tr${adv}>
      <td>${t.pos}</td>
      <td class="tcol tname"><span>${TEAMS[t.id].flag}</span> ${TEAMS[t.id].name}</td>
      <td>${t.p}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td>
      <td>${gdText(t.gd)}</td><td class="pts">${t.pts}</td>
    </tr>`;
  }).join('');
}

function renderGroupPanel(letter) {
  const panel = document.getElementById('panel-' + letter.toLowerCase());
  if (!panel) return;
  const fixtures = groupFixtureIndexes(letter).map((i) => fixtureRow(i)).join('');

  panel.innerHTML = `
    <div class="panel-header"><h2>Group ${letter}</h2></div>
    <table class="standings">
      <thead><tr><th>#</th><th class="tcol">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
      <tbody data-body="${letter}">${standingsRowsHTML(letter)}</tbody>
    </table>
    <div class="fixtures">
      <h3 class="fixtures-title">Fixtures <span class="hint">— set scores to predict</span></h3>
      ${fixtures}
    </div>`;
}

/* Update ONLY the standings tbody — leaves the fixtures inputs (and the field
   the user is currently typing in) untouched so focus is preserved. */
function updateStandings(letter) {
  const tb = document.querySelector(`#panel-${letter.toLowerCase()} tbody[data-body]`);
  if (tb) tb.innerHTML = standingsRowsHTML(letter);
}

function fixtureRow(i) {
  const f = FIXTURES[i];
  const r = state.results[i];
  const set = r.hg !== '' && r.ag !== '';
  const when = formatDate(f.date) || `MD${f.md}`;
  return `<div class="fixture${set ? ' fx-set' : ''}" data-idx="${i}">
    <span class="fx-md">${when}</span>
    <span class="fx-team fx-home">${TEAMS[f.home].name} <span class="fx-flag">${TEAMS[f.home].flag}</span></span>
    <span class="fx-score">
      <input class="fx-goal" type="number" min="0" max="99" inputmode="numeric"
             data-idx="${i}" data-side="hg" value="${r.hg}" aria-label="${TEAMS[f.home].name} goals">
      <span class="fx-colon">:</span>
      <input class="fx-goal" type="number" min="0" max="99" inputmode="numeric"
             data-idx="${i}" data-side="ag" value="${r.ag}" aria-label="${TEAMS[f.away].name} goals">
    </span>
    <span class="fx-team fx-away"><span class="fx-flag">${TEAMS[f.away].flag}</span> ${TEAMS[f.away].name}</span>
    <button class="fx-clear" data-clear="${i}" title="Clear result" aria-label="Clear result">×</button>
  </div>`;
}

/* ---- Knockout bracket --------------------------------------------------- */
const ROUND_ORDER = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF:  [97, 98, 99, 100],
  SF:  [101, 102],
  F:   [104],
};
const ROUND_SEQUENCE = ['R32', 'R16', 'QF', 'SF', 'F'];

function renderBracket(resolved) {
  const wrap = document.getElementById('bracket-flow');
  if (!wrap) return;

  const cols = ROUND_SEQUENCE.map((round) => {
    const cards = ROUND_ORDER[round].map((id) => matchCard(id, resolved[id])).join('');
    return `<div class="bkt-round" data-round="${round}">
      <div class="bkt-round-label">${ROUND_LABELS[round]}</div>
      <div class="bkt-col">${cards}</div>
    </div>`;
  }).join('');

  wrap.innerHTML = cols;

  // Champion + third-place play-off summary.
  const champ = resolved[104] && resolved[104].winner;
  const tp = resolved[103];
  const summary = document.getElementById('bracket-summary');
  if (summary) {
    summary.innerHTML = `
      <div class="champion ${champ ? 'has-champ' : ''}">
        <span class="champion-label">Champion</span>
        <span class="champion-team">${champ ? teamCell(champ) : '<span class="muted">pick the final</span>'}</span>
      </div>
      <div class="thirdplace">
        <span class="tp-label">Third-place play-off</span>
        ${matchCard(103, tp)}
      </div>`;
  }
}

function matchCard(id, r) {
  r = r || { a: null, b: null, winner: null };
  return `<div class="bkt-match" data-match="${id}">
    ${slotEl(id, 'a', r.a, r.winner)}
    ${slotEl(id, 'b', r.b, r.winner)}
  </div>`;
}

function slotEl(matchId, side, teamId, winner) {
  const pickable = !!teamId;
  const isWinner = teamId && teamId === winner;
  const cls = ['bkt-slot'];
  if (isWinner) cls.push('is-winner');
  if (winner && !isWinner) cls.push('is-loser');
  if (!pickable) cls.push('is-empty');
  return `<button class="${cls.join(' ')}" ${pickable ? '' : 'disabled'}
      data-match="${matchId}" data-team="${teamId || ''}">
      ${teamCell(teamId)}
    </button>`;
}

/* =========================================================================
   ORCHESTRATION + EVENTS
   ========================================================================= */
function renderAll() {
  GROUP_LETTERS.forEach(renderGroupPanel);
  const { resolved } = resolveBracket();
  renderBracket(resolved);
  saveState();
}

function rerenderBracketOnly() {
  const { resolved } = resolveBracket();
  renderBracket(resolved);
  saveState();
}

function onScoreInput(e) {
  const el = e.target.closest('.fx-goal');
  if (!el) return;
  const i = Number(el.dataset.idx);
  const side = el.dataset.side;
  let v = el.value.trim();
  if (v !== '') {
    v = String(Math.max(0, Math.min(99, Math.floor(Number(v)) || 0)));
  }
  state.results[i][side] = v;
  el.value = v; // reflect clamping without rebuilding the input
  const fxEl = el.closest('.fixture');
  if (fxEl) fxEl.classList.toggle('fx-set', state.results[i].hg !== '' && state.results[i].ag !== '');
  // A change to group results can reshuffle qualifiers; refresh just the
  // standings (keeps input focus) and the whole bracket.
  updateStandings(FIXTURES[i].group);
  rerenderBracketOnly();
}

function onClick(e) {
  const clear = e.target.closest('.fx-clear');
  if (clear) {
    const i = Number(clear.dataset.clear);
    state.results[i] = { hg: '', ag: '' };
    renderGroupPanel(FIXTURES[i].group);
    rerenderBracketOnly();
    return;
  }
  const slot = e.target.closest('.bkt-slot');
  if (slot && slot.dataset.team) {
    const mid = Number(slot.dataset.match);
    if (state.picks[mid] === slot.dataset.team) {
      delete state.picks[mid]; // click the current winner again to deselect
    } else {
      state.picks[mid] = slot.dataset.team;
    }
    rerenderBracketOnly(); // resolveBracket() clears any now-stale downstream picks
    return;
  }
  const reset = e.target.closest('#reset-btn');
  if (reset) {
    if (confirm('Reset all predicted scores and bracket picks to the current real results?')) {
      localStorage.removeItem(STORAGE_KEY);
      loadState();
      renderAll();
    }
  }
}

function init() {
  loadState();
  renderAll();
  document.addEventListener('input', onScoreInput);
  document.addEventListener('click', onClick);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
