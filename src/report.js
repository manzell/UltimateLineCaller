/* Line Caller reports: box scores, combos, pass counts, and the page sent to families.
   The family page is built only from the whitelisted fields in html(): never ratings, tags, targets or contacts. */
const Report = (() => {
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const STAT_LABEL = { goal: 'Goal', assist: 'Assist', turn: 'Turnover', block: 'Block', oppturn: 'Opponent turnover', oppgoal: 'Opponent goal' };
  const blank = () => ({ played: 0, O: 0, D: 0, touch: 0, goal: 0, assist: 0, turn: 0, block: 0 });
  const onField = (pt) => [...new Set(pt.lineup.concat((pt.subs || []).map((s) => s.in)))];

  function totals(points) {
    const out = new Map();
    const get = (id) => { if (!out.has(id)) out.set(id, blank()); return out.get(id); };
    for (const pt of points) {
      onField(pt).forEach((id) => { const t = get(id); t.played += 1; t[pt.on] += 1; });
      (pt.events || []).forEach((e) => { if (!e.id) return; const t = get(e.id); if (t[e.t] !== undefined) t[e.t] += 1; });
    }
    return out;
  }

  // Who threw to whom: each touch following another touch in the same possession is one completed throw.
  function passes(points) {
    const out = new Map();
    for (const pt of points) {
      let last = null;
      for (const e of pt.events || []) {
        if (e.t === 'touch') {
          if (last && last !== e.id) { if (!out.has(last)) out.set(last, new Map()); const row = out.get(last); row.set(e.id, (row.get(e.id) || 0) + 1); }
          last = e.id;
        } else if (e.t !== 'assist') last = null;
      }
    }
    return out;
  }

  // For each thrower: how often they threw to women-matching players, against who was actually on the field.
  function targetBias(points, players) {
    const isW = new Map(players.map((p) => [p.id, p.match === 'W']));
    const rec = new Map();
    for (const pt of points) {
      const field = onField(pt).filter((id) => isW.has(id));
      let last = null;
      for (const e of pt.events || []) {
        if (e.t === 'touch') {
          if (last && last !== e.id && isW.has(last) && isW.has(e.id)) {
            if (!rec.has(last)) rec.set(last, { id: last, throws: 0, toW: 0, exp: 0 });
            const r = rec.get(last), mates = field.filter((id) => id !== last);
            r.throws += 1; if (isW.get(e.id)) r.toW += 1;
            r.exp += mates.length ? mates.filter((id) => isW.get(id)).length / mates.length : 0;
          }
          last = e.id;
        } else if (e.t !== 'assist') last = null;
      }
    }
    return [...rec.values()].map((r) => ({ ...r, share: r.toW / r.throws, expected: r.exp / r.throws, gap: r.toW / r.throws - r.exp / r.throws }));
  }

  // One player's record across a set of points.
  function playerSummary(points, id) {
    const out = { plus: 0, minus: 0, O: 0, Owon: 0, D: 0, Dwon: 0 };
    points.forEach((pt) => {
      if (!onField(pt).includes(id)) return;
      const won = pt.result === 'us';
      won ? out.plus++ : out.minus++;
      out[pt.on] += 1; if (won) out[pt.on + 'won'] += 1;
    });
    const map = passes(points);
    const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    out.throwsTo = sorted(map.get(id) || new Map());
    const from = new Map();
    map.forEach((row, a) => { if (row.has(id)) from.set(a, row.get(id)); });
    out.catchesFrom = sorted(from);
    return out;
  }

  // The play as people read it: an assist or goal is shown on the touch it belongs to.
  function narrative(events) {
    const items = [];
    (events || []).forEach((e, i) => {
      if (e.t === 'assist' || e.t === 'goal') {
        for (let j = items.length - 1; j >= 0; j--) {
          const it = items[j];
          if (it.t === 'touch' && it.id === e.id && !it.role) { it.role = e.t; it.idxs.push(i); return; }
          if (it.t !== 'touch') break;
        }
      }
      items.push({ t: e.t, id: e.id, unsure: e.unsure, idxs: [i] });
    });
    return items;
  }

  function subsetsOf(ids, size, emit) {
    const walk = (start, cur) => {
      if (cur.length === size) { emit(cur.join('|')); return; }
      for (let i = start; i <= ids.length - (size - cur.length); i++) walk(i + 1, cur.concat(ids[i]));
    };
    walk(0, []);
  }
  // Groups of a given size that started more than one point together, and how those points went.
  function combos(points, sizes) {
    const found = new Map();
    for (const pt of points) {
      const ids = pt.lineup.slice().sort();
      for (const size of sizes) {
        if (size > ids.length) continue;
        subsetsOf(ids, size, (key) => {
          if (!found.has(key)) found.set(key, { ids: key.split('|'), pts: 0, scored: 0, allowed: 0, O: 0, Owon: 0, D: 0, Dwon: 0 });
          const c = found.get(key), won = pt.result === 'us';
          c.pts += 1; won ? c.scored++ : c.allowed++;
          c[pt.on] += 1; if (won) c[pt.on + 'won'] += 1;
        });
      }
    }
    return [...found.values()].filter((c) => c.pts > 1).map((c) => ({ ...c, net: c.scored - c.allowed }))
      .sort((a, b) => b.net - a.net || b.pts - a.pts || b.ids.length - a.ids.length);
  }

  // Point-by-point line score, with a heavier box around whichever team started on offense.
  function lineScore(points, us, them) {
    let u = 0, t = 0;
    const heads = points.map((_, i) => `<th>${i + 1}</th>`).join('');
    const cells = points.map((p) => {
      p.result === 'us' ? u++ : t++;
      return { p, u, t };
    });
    const row = (who, label, final) => `<tr><th class="ln-team">${esc(label)}</th>${cells.map(({ p, u: a, t: b }) => {
      const scored = p.result === who;
      const offense = (who === 'us') === (p.on === 'O');
      return `<td class="${scored ? 'scored' : ''} ${offense ? 'off' : ''} ${scored && !offense ? 'break' : ''}">${scored ? (who === 'us' ? a : b) : ''}</td>`;
    }).join('')}<td class="ln-final">${final}</td></tr>`;
    return `<div class="tbl-wrap"><table class="ln"><thead><tr><th class="ln-team"></th>${heads}<th class="ln-final">Final</th></tr></thead><tbody>${row('us', us, u)}${row('them', them || 'Opponent', t)}</tbody></table></div>
      <p class="ln-note">Each filled box is the team that scored that point, with the running score. A heavy outline marks the team on offense. A red outline is a break: the team on defense scored.</p>`;
  }

  const COLS = [['touch', 'Touches'], ['goal', 'Goals'], ['assist', 'Assists'], ['turn', 'Turns'], ['block', 'Blocks']];
  const jerseyNum = (p) => { const n = parseInt(p.no, 10); return Number.isNaN(n) ? 9999 : n; };
  function statTable(players, map, extra) {
    const active = (t) => t.played > 0 || COLS.some(([k]) => t[k] > 0);
    const rows = players.filter((p) => map.has(p.id) && active(map.get(p.id))).sort((a, b) => map.get(b.id).played - map.get(a.id).played || jerseyNum(a) - jerseyNum(b));
    const sum = blank();
    rows.forEach((p) => COLS.forEach(([k]) => { sum[k] += map.get(p.id)[k]; }));
    const points = (t) => `${t.played} (${t.O}/${t.D})`;
    return `<div class="tbl-wrap"><table class="bx bx-box"><thead><tr><th class="bx-no">#</th><th class="bx-name">Player</th>${extra ? `<th>${esc(extra.label)}</th>` : ''}<th title="Total points (offense/defense)">Points</th>${COLS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((p) => `<tr><td class="bx-no">${esc(p.no)}</td><td class="bx-name">${esc(p.name)}</td>${extra ? `<td>${extra.value(p)}</td>` : ''}<td>${points(map.get(p.id))}</td>${COLS.map(([k]) => `<td>${map.get(p.id)[k]}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length + 3}">No stats yet.</td></tr>`}
      </tbody>${rows.length && !extra ? `<tfoot><tr><td></td><td class="bx-name">Team</td><td></td>${COLS.map(([k]) => `<td>${sum[k]}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  }
  const boxTable = (points, players) => statTable(players, totals(points));

  function pointList(points, players, positions) {
    const byId = new Map(players.map((p) => [p.id, p]));
    const abbr = (id) => { const p = positions.find((x) => x.id === id); return p ? p.abbr : ''; };
    const name = (id) => (byId.has(id) ? esc(byId.get(id).name) : 'Removed player');
    let us = 0, them = 0;
    return points.map((p, i) => {
      p.result === 'us' ? us++ : them++;
      const line = p.lineup.filter((id) => byId.has(id)).map((id) => `${name(id)}${abbr((p.roles || {})[id]) ? ` <small>${esc(abbr(p.roles[id]))}</small>` : ''}`).join(', ');
      const events = narrative(p.events).map((it) => (it.t === 'touch' && !it.role ? name(it.id) : !it.id ? `<b class="e-${it.t}">${STAT_LABEL[it.t]}</b>` : `<b class="e-${it.role || it.t}">${STAT_LABEL[it.role || it.t]}: ${name(it.id)}</b>`)).join(' → ');
      return `<div class="rp-pt"><p><strong>Point ${i + 1}</strong> · ${p.on === 'O' ? 'Offense' : 'Defense'} · ${p.result === 'us' ? 'We scored' : 'They scored'} · ${us}–${them} · ${clock(p.endedAt - p.startedAt)}</p><p>${line}</p>${events ? `<p class="rp-chain">${events}</p>` : ''}</div>`;
    }).reverse().join('');
  }

  const CSS = `
.tbl-wrap { overflow-x: auto; max-width: 100%; }
.ln { width: auto; border-collapse: separate; border-spacing: 2px; font-variant-numeric: tabular-nums; }
.ln th { font-size: .75rem; font-weight: 700; color: var(--muted); padding: 2px; min-width: 26px; text-align: center; }
.ln th.ln-team { text-align: left; color: var(--ink); font-size: .875rem; white-space: nowrap; padding-right: 8px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.ln td { width: 28px; min-width: 28px; height: 30px; text-align: center; border: 1px solid var(--line); border-radius: 3px; font-weight: 700; font-size: .875rem; }
.ln td.scored { background: var(--accent); color: var(--on-accent); }
.ln td.off { border: 3px solid var(--ink); }
.ln td.break { border: 3px solid var(--break); }
.ln td.ln-final, .ln th.ln-final { border: 0; font-size: 1.25rem; padding-left: 8px; color: var(--ink); min-width: 40px; }
.ln-note { font-size: .8125rem; color: var(--muted); margin: 4px 0 0; }
.bx { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
.bx th { font-size: .8125rem; color: var(--muted); font-weight: 700; padding: 4px 8px; text-align: right; white-space: nowrap; }
.bx td { padding: 7px 8px; text-align: right; border-top: 1px solid var(--line); }
.bx .bx-name, .bx .bx-no { text-align: left; white-space: nowrap; }
.bx .bx-no { color: var(--muted); width: 2.5em; }
.bx-box { width: auto; }
.bx-box th, .bx-box td { padding: 3px 4px; }
.bx-box th:not(.bx-name):not(.bx-no), .bx-box td:not(.bx-name):not(.bx-no) { width: 66px; min-width: 66px; max-width: 66px; text-align: center; }
.bx-box .bx-name { min-width: 120px; padding-right: 14px; }
.bx tfoot td { font-weight: 700; border-top: 2px solid var(--ink); }
.rp-chain b { padding: 0 5px; border-radius: 3px; color: #ffffff; font-weight: 700; }
.rp-chain .e-goal { background: #0b7a3e; } .rp-chain .e-assist { background: #1565c0; } .rp-chain .e-turn { background: #c62828; } .rp-chain .e-block { background: #7b3fb3; } .rp-chain .e-oppturn, .rp-chain .e-oppgoal { background: #8a6400; }
.rp { --break: #d31027; --ink: #11183a; --muted: #4c5577; --line: #c4cce0; --accent: #2632c9; --on-accent: #ffffff; color: var(--ink); background: #ffffff; font: 16px/1.4 system-ui, -apple-system, Roboto, sans-serif; }
.rp h1 { font-size: 1.75rem; margin: 0 0 4px; }
.rp h2 { font-size: 1.375rem; margin: 28px 0 8px; padding-top: 12px; border-top: 2px solid var(--ink); }
.rp h3 { font-size: 1.0625rem; margin: 16px 0 6px; }
.rp p { margin: 2px 0; }
.rp-nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.rp-nav a { padding: 8px 12px; border-radius: 6px; background: #e9edf5; color: var(--ink); text-decoration: none; font-size: .9375rem; }
.rp-pt { padding: 8px 0; border-top: 1px solid var(--line); }
.rp-pt small { color: var(--muted); }
.rp-chain { color: var(--muted); font-size: .9375rem; }
.rp-wrap { max-width: 920px; margin: 0 auto; padding: 16px; }
.rp-up { padding: 6px 0; border-top: 1px solid var(--line); }`;

  const dateText = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // Everything the page shows comes through this function. Add fields here only if families may see them.
  function safeData(team) {
    const players = team.players.map((p) => ({ id: p.id, no: p.no, name: p.name }));
    const positions = team.rules.positions.map((p) => ({ id: p.id, abbr: p.abbr }));
    const games = team.history.slice().reverse().map((h) => ({
      id: h.id, opponent: h.opponent, date: h.date, us: h.us, them: h.them,
      totals: Object.fromEntries(Object.entries(h.perPlayer).map(([id, v]) => [id, { played: v.played || 0, O: v.O || 0, D: v.D || 0, touch: v.touch || 0, goal: v.goal || 0, assist: v.assist || 0, turn: v.turn || 0, block: v.block || 0 }])),
      points: (h.points || []).map((p) => ({ lineup: p.lineup, roles: p.roles, on: p.on, result: p.result, startedAt: p.startedAt, endedAt: p.endedAt, subs: (p.subs || []).map((s) => ({ in: s.in, out: s.out })), events: (p.events || []).map((e) => ({ t: e.t, id: e.id })) })),
    }));
    const upcoming = (team.schedule || []).filter((x) => !x.gameId).map((x) => ({ date: x.date, time: x.time, opponent: x.opponent, location: x.location }));
    return { team: team.team, players, positions, games, upcoming };
  }

  // Plain links and tables with no scripts, so it opens in any mail app or browser.
  function fragment(team) {
    const d = safeData(team);
    const season = new Map();
    d.games.forEach((g) => Object.entries(g.totals).forEach(([id, v]) => {
      if (!season.has(id)) season.set(id, { ...blank(), games: 0 });
      const t = season.get(id);
      Object.keys(blank()).forEach((k) => { t[k] += v[k]; });
      if (v.played) t.games += 1;
    }));
    const wins = d.games.filter((g) => g.us > g.them).length, losses = d.games.filter((g) => g.us < g.them).length;
    const nav = [['season', 'Season'], ...(d.upcoming.length ? [['schedule', 'Upcoming']] : []), ...d.games.map((g) => [`game-${g.id}`, `vs ${g.opponent || 'Opponent'} ${g.us}–${g.them}`])];
    const games = d.games.map((g) => `<section id="game-${esc(g.id)}"><h2>vs ${esc(g.opponent || 'Opponent')} · ${g.us}–${g.them}</h2><p>${esc(dateText(g.date))}</p>
      ${g.points.length ? `<h3>Point flow</h3>${lineScore(g.points, d.team, g.opponent)}` : ''}
      <h3>Box score</h3>${statTable(d.players, new Map(Object.entries(g.totals).map(([id, v]) => [id, v])))}
      ${g.points.length ? `<h3>Points</h3>${pointList(g.points, d.players, d.positions)}` : ''}</section>`).join('');
    const upcoming = d.upcoming.length ? `<section id="schedule"><h2>Upcoming games</h2>${d.upcoming.map((u) => `<p class="rp-up">${esc(u.date)}${u.time ? ' · ' + esc(u.time) : ''} · vs ${esc(u.opponent)}${u.location ? ' · ' + esc(u.location) : ''}</p>`).join('')}</section>` : '';
    return `<div class="rp-wrap"><h1>${esc(d.team)}</h1><p>Record ${wins}–${losses}</p><nav class="rp-nav">${nav.map(([id, l]) => `<a href="#${esc(id)}">${esc(l)}</a>`).join('')}</nav>
      <section id="season"><h2>Season stats</h2>${statTable(d.players, season, { label: 'Games', value: (p) => season.get(p.id).games })}</section>${upcoming}${games}</div>`;
  }
  function html(team) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(team.team)} stats</title><style>${CSS}body{margin:0}</style></head><body class="rp">${fragment(team)}</body></html>`;
  }

  return { CSS, narrative, totals, passes, playerSummary, targetBias, statTable, combos, lineScore, boxTable, fragment, html, safeData };
})();
if (typeof module !== 'undefined') module.exports = Report;
