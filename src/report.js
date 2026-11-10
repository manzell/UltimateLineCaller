/* Line Caller reports: box scores, combos, pass counts, and the page sent to families.
   The family page is built only from the whitelisted fields in html(): never ratings, tags, targets or contacts. */
const Report = (() => {
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const STAT_LABEL = { goal: 'Goal', assist: 'Assist', turn: 'Turnover', block: 'Block', oppturn: 'Opponent turnover', oppgoal: 'Opponent goal', opppass: 'Opponent pass' };
  const blank = () => ({ played: 0, O: 0, D: 0, touch: 0, goal: 0, comp: 0, rec: 0, assist: 0, turn: 0, drop: 0, block: 0 });
  const label = (e) => (e.t === 'goal' && e.sub === 'callahan' ? 'Callahan' : e.t === 'turn' ? (e.sub === 'drop' ? 'Drop' : e.sub === 'throw' ? 'Throwaway' : 'Turnover') : e.t === 'block' && e.sub === 'int' ? 'Interception' : STAT_LABEL[e.t]);
  const onField = (pt) => [...new Set(pt.lineup.concat((pt.subs || []).map((s) => s.in)))];

  function totals(points) {
    const out = new Map();
    const get = (id) => { if (!out.has(id)) out.set(id, blank()); return out.get(id); };
    for (const pt of points) {
      onField(pt).forEach((id) => { const t = get(id); t.played += 1; t[pt.on] += 1; });
      (pt.events || []).forEach((e) => { if (!e.id) return; const t = get(e.id); if (t[e.t] !== undefined) t[e.t] += 1; if (e.t === 'turn' && e.sub === 'drop') t.drop += 1; });
      // Time on the field: the whole point, unless subbed in or out partway.
      const start = pt.startedAt || 0, end = pt.endedAt || start, subs = pt.subs || [];
      const timeOn = (id) => { const out1 = subs.find((s) => s.out === id), in1 = subs.find((s) => s.in === id); const a = in1 && !pt.lineup.includes(id) ? in1.at : start, b = out1 ? out1.at : end; return Math.max(0, Math.min(end, b) - Math.max(start, a)); };
      onField(pt).forEach((id) => { const t = get(id); t.ms = (t.ms || 0) + timeOn(id); });
      // Completed throws and catches.
      let last = null;
      for (const e of pt.events || []) {
        if (e.t === 'touch') { if (last && last !== e.id) { get(last).comp += 1; get(e.id).rec += 1; } last = e.id; } else if (e.t !== 'assist') last = null;
      }
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
      const prev = items[items.length - 1];
      if (e.t === 'opppass' && prev && prev.t === 'opppass') { prev.n += 1; prev.idxs.push(i); return; }
      if (e.t === 'touch' && prev && prev.t === 'block' && prev.sub === 'int' && prev.id === e.id && prev.idxs.length === 1) { prev.idxs.push(i); return; }
      if (e.t === 'assist' || e.t === 'goal') {
        for (let j = items.length - 1; j >= 0; j--) {
          const it = items[j];
          if (it.t === 'touch' && it.id === e.id && !it.role) { it.role = e.t; if (e.t === 'goal' && e.sub) it.sub = e.sub; it.idxs.push(i); return; }
          if (it.t !== 'touch') break;
        }
      }
      items.push({ t: e.t, id: e.id, sub: e.sub, unsure: e.unsure, idxs: [i], ...(e.t === 'opppass' ? { n: 1 } : {}) });
    });
    return items;
  }

  // Throw type on the arrow into a catch: forehand, backhand or other.
  const THROW = { f: 'FH', b: 'BH', o: 'Oth' };
  const THROW_NAME = { f: 'Forehand', b: 'Backhand', o: 'Other throw' };
  const isPass = (items, i) => i > 0 && items[i].t === 'touch' && (items[i - 1].t === 'touch' || (items[i - 1].t === 'block' && items[i - 1].sub === 'int'));
  const arrowHtml = (events, items, i) => { const e = isPass(items, i) ? events[items[i].idxs[0]] : null; if (!isPass(items, i)) return ' · '; return e && THROW[e.throwType] ? ` →<sup title="${THROW_NAME[e.throwType]}">${THROW[e.throwType]}</sup> ` : ' → '; };

  // Which team has the disc right now, from the start of the point and every change of possession.
  function holder(pt) {
    let side = pt.on === 'O' ? 'us' : 'them';
    for (const e of pt.events || []) {
      if (e.t === 'turn') side = 'them';
      else if (e.t === 'block' || e.t === 'oppturn') side = 'us';
      else if (e.t === 'goal' && e.sub === 'callahan') side = 'us';
      else if (e.t === 'touch') side = 'us';
    }
    return side;
  }
  const oppLabel = (it) => (it.t === 'opppass' ? (it.n > 1 ? `Opponent passes ×${it.n}` : 'Opponent pass') : STAT_LABEL[it.t]);

  // Who had the disc through a point. Timing comes from when each event was entered.
  function possession(pt) {
    const dur = Math.max(1, pt.endedAt - pt.startedAt);
    const flips = [];
    let side = pt.on === 'O' ? 'us' : 'them', catches = 0, last = null;
    for (const e of pt.events || []) {
      // A catch while the other team had the disc means a turnover nobody logged.
      if (e.t === 'touch' && side === 'them') { flips.push({ e, from: side, to: 'us', mark: 'T', unlogged: true }); side = 'us'; }
      if (e.t === 'touch') { if (last && last !== e.id) catches++; last = e.id; continue; }
      if (e.t === 'assist') continue;
      last = null;
      // Turning it over (or a block) while already without the disc means the other side lost it first.
      if ((e.t === 'turn' && side === 'them') || ((e.t === 'block' || e.t === 'oppturn') && side === 'us') || (e.t === 'opppass' && side === 'us')) { const to = side === 'us' ? 'them' : 'us'; flips.push({ e, from: side, to, mark: 'T', unlogged: true }); side = to; }
      if (e.t === 'opppass') continue;
      if (e.t === 'turn') { flips.push({ e, from: side, to: 'them', mark: 'T' }); side = 'them'; }
      else if (e.t === 'block') { flips.push({ e, from: side, to: 'us', mark: e.sub === 'int' ? 'I' : 'B' }); side = 'us'; }
      else if (e.t === 'goal' && e.sub === 'callahan' && side === 'them') { flips.push({ e, from: side, to: 'us', mark: 'C' }); side = 'us'; }
      else if (e.t === 'oppturn') { flips.push({ e, from: side, to: 'us', mark: 'T' }); side = 'us'; }
    }
    // Whoever scored had the disc at the end.
    if (pt.result && pt.result !== side) { flips.push({ e: { t: pt.result === 'us' ? 'oppturn' : 'turn' }, from: side, to: pt.result, mark: 'T', unlogged: true }); side = pt.result; }
    // Entries added or reordered later have no useful time; those get spaced between their neighbors.
    let floor = 0;
    const raw = flips.map((f) => { const v = (f.e.at - pt.startedAt) / dur; if (Number.isFinite(v) && v > floor && v < 1) { floor = v; return v; } return null; });
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== null) continue;
      let j = i; while (j < raw.length && raw[j] === null) j++;
      const lo = i ? raw[i - 1] : 0, hi = j < raw.length ? raw[j] : 1;
      for (let k = i; k < j; k++) raw[k] = lo + ((hi - lo) * (k - i + 1)) / (j - i + 1);
    }
    const marks = flips.map((f, i) => ({ pos: raw[i], label: f.mark, side: f.from, title: f.unlogged ? 'Turnover (not logged)' : label(f.e) }));
    const segments = [];
    let at = 0, cur = pt.on === 'O' ? 'us' : 'them';
    flips.forEach((f, i) => { segments.push({ from: at, to: raw[i], side: cur }); at = raw[i]; cur = f.to; });
    segments.push({ from: at, to: 1, side: cur });
    const oppPasses = (pt.events || []).filter((e) => e.t === 'opppass').length;
    return { segments, marks, catches, oppPasses };
  }
  const TEAM_COLOR = '#1f7a9c';
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : TEAM_COLOR);
  // Black or white text, whichever reads better on the team color.
  const inkOn = (hex) => { const n = parseInt(safeColor(hex).slice(1), 16), l = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] > 0.4 ? '#11183a' : '#ffffff'; };
  function possessionBar(pt, color) {
    const p = possession(pt), pct = (x) => (x * 100).toFixed(1), c = safeColor(color);
    const us = `background:${c};color:${inkOn(c)}`;
    return `<div class="pb" role="img" aria-label="Disc possession through the point"><div class="pb-bar">${p.segments.map((s) => `<i class="${s.side}" style="left:${pct(s.from)}%;width:${pct(s.to - s.from)}%${s.side === 'us' ? ';' + us : ''}"></i>`).join('')}</div>${p.marks.map((m) => `<b class="${m.side}" style="left:${pct(m.pos)}%${m.side === 'us' ? ';' + us : ''}" title="${esc(m.title)}">${m.label}</b>`).join('')}</div>`;
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
          if (!found.has(key)) found.set(key, { ids: key.split('|'), pts: 0, ms: 0, scored: 0, allowed: 0, O: 0, Owon: 0, D: 0, Dwon: 0 });
          const c = found.get(key), won = pt.result === 'us';
          c.pts += 1; c.ms += Math.max(0, (pt.endedAt || 0) - (pt.startedAt || 0)); won ? c.scored++ : c.allowed++;
          c[pt.on] += 1; if (won) c[pt.on + 'won'] += 1;
        });
      }
    }
    return [...found.values()].filter((c) => c.pts > 1).map((c) => ({ ...c, net: c.scored - c.allowed }))
      .sort((a, b) => b.net - a.net || b.pts - a.pts || b.ids.length - a.ids.length);
  }

  // Point-by-point line score, with a heavier box around whichever team started on offense.
  function lineScore(points, us, them, opts) {
    let u = 0, t = 0;
    const durs = points.map((p) => Math.max(0, (p.endedAt || 0) - (p.startedAt || 0))), sorted = durs.slice().sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
    // Longer points get wider columns.
    const wide = points.map((_, i) => (median ? Math.round(Math.max(20, Math.min(72, 28 * (durs[i] / median)))) : 28));
    const w = (i) => `style="width:${wide[i]}px;min-width:${wide[i]}px"`;
    const heads = points.map((_, i) => `<th ${w(i)}>${i + 1}</th>`).join('');
    const cells = points.map((p, i) => {
      p.result === 'us' ? u++ : t++;
      return { p, u, t, i };
    });
    const row = (who, label, final) => `<tr><th class="ln-team">${esc(label)}</th>${cells.map(({ p, u: a, t: b, i }) => {
      const scored = p.result === who;
      const offense = (who === 'us') === (p.on === 'O');
      const text = scored ? (who === 'us' ? a : b) : '';
      const mins = `Point ${i + 1}: ${Math.floor(durs[i] / 60000)}:${String(Math.round(durs[i] / 1000) % 60).padStart(2, '0')}`;
      return `<td class="${scored ? 'scored' : ''} ${offense ? 'off' : ''} ${scored && !offense ? 'break' : ''}" ${w(i)} title="${mins}">${opts && opts.link ? `<button type="button" class="ln-open" data-a="flow-point" data-v="${i}" aria-label="${mins}">${text}</button>` : text}</td>`;
    }).join('')}<td class="ln-final">${final}</td></tr>`;
    return `<div class="tbl-wrap"><table class="ln"><thead><tr><th class="ln-team"></th>${heads}<th class="ln-final">Final</th></tr></thead><tbody>${row('us', us, u)}${row('them', them || 'Opponent', t)}</tbody></table></div>
      <p class="ln-note">Each filled box is the team that scored that point, with the running score. A heavy outline marks the team on offense. A red outline is a break: the team on defense scored. Wider columns were longer points.${opts && opts.link ? ' Tap a box to see that point.' : ''}</p>`;
  }

  const COLS = [['touch', 'Touches'], ['goal', 'Goals'], ['comp', 'Completions'], ['rec', 'Receptions'], ['assist', 'Assists'], ['turn', 'Turnovers'], ['block', 'Blocks']];
  const statVal = (t, k) => (k === 'throw' ? (t.turn || 0) - (t.drop || 0) : t[k] || 0);
  const jerseyNum = (p) => { const n = parseInt(p.no, 10); return Number.isNaN(n) ? 9999 : n; };
  function statTable(players, map, extra, opts) {
    const nameCell = (p) => (opts && opts.link ? `<button type="button" class="linkish" data-a="go-player" data-id="${esc(p.id)}">${esc(p.name)}</button>` : esc(p.name));
    const active = (t) => t.played > 0 || COLS.some(([k]) => statVal(t, k) > 0);
    const time = opts && opts.time;
    const mins = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const sortVal = (p, k) => { const t = map.get(p.id); return k === 'no' ? jerseyNum(p) : k === 'name' ? 0 : k === 'extra' ? Number(extra.value(p)) || 0 : k === 'played' ? t.played : k === 'ms' ? t.ms || 0 : statVal(t, k); };
    const sort = (opts && opts.sort) || { key: 'played', dir: -1 };
    const rows = players.filter((p) => map.has(p.id) && active(map.get(p.id))).sort((a, b) => (sort.key === 'name' ? sort.dir * a.name.localeCompare(b.name) : sort.dir * (sortVal(a, sort.key) - sortVal(b, sort.key))) || map.get(b.id).played - map.get(a.id).played || jerseyNum(a) - jerseyNum(b));
    const th = (k, label, cls, title) => { const on = opts && opts.sortable && sort.key === k; return `<th class="${cls || ''}"${title ? ` title="${title}"` : ''}${on ? ` aria-sort="${sort.dir < 0 ? 'descending' : 'ascending'}"` : ''}>${opts && opts.sortable ? `<button type="button" class="sorth" data-a="box-sort" data-v="${k}">${label}${on ? (sort.dir < 0 ? ' ▾' : ' ▴') : ''}</button>` : label}</th>`; };
    const sum = {};
    COLS.forEach(([k]) => { sum[k] = rows.reduce((a, p) => a + statVal(map.get(p.id), k), 0); });
    const points = (t) => `${t.played} (${t.O}/${t.D})`;
    return `<div class="tbl-wrap"><table class="bx bx-box"><thead><tr>${th('no', '#', 'bx-no')}${th('name', 'Player', 'bx-name')}${extra ? th('extra', esc(extra.label)) : ''}${th('played', 'Points', '', 'Total points (offense/defense)')}${time ? th('ms', 'Playtime') : ''}${COLS.map(([k, l]) => th(k, l)).join('')}</tr></thead><tbody>
      ${rows.map((p) => `<tr><td class="bx-no">${esc(p.no)}</td><td class="bx-name">${nameCell(p)}</td>${extra ? `<td>${extra.value(p)}</td>` : ''}<td>${points(map.get(p.id))}</td>${time ? `<td>${mins(map.get(p.id).ms)}</td>` : ''}${COLS.map(([k]) => `<td>${statVal(map.get(p.id), k)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length + 4}">No stats yet.</td></tr>`}
      </tbody>${rows.length && !extra ? `<tfoot><tr><td></td><td class="bx-name">Team</td><td></td>${time ? '<td></td>' : ''}${COLS.map(([k]) => `<td>${sum[k]}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  }
  const boxTable = (points, players, opts) => statTable(players, totals(points), null, opts);

  // Team stats for both sides, from who had the disc and how each point ended.
  function teamStats(points) {
    const side = () => ({ goals: 0, holds: 0, breaks: 0, comp: 0, oGoals: 0, oPoss: 0, dGoals: 0, dPoss: 0, clean: 0, turns: 0, throwaways: 0, drops: 0, blocks: 0, ms: 0 });
    const us = side(), them = side();
    for (const pt of points) {
      const ev = pt.events || [];
      const p = possession(pt), dur = Math.max(0, (pt.endedAt || 0) - (pt.startedAt || 0));
      const seq = p.segments.map((s) => s.side);
      // A goal with no logged turnover before it still means the scorer had the disc.
      if (pt.result && seq[seq.length - 1] !== pt.result) seq.push(pt.result);
      p.segments.forEach((s) => { (s.side === 'us' ? us : them).ms += (s.to - s.from) * dur; });
      const possUs = seq.filter((x) => x === 'us').length, possThem = seq.length - possUs;
      const weOnO = pt.on === 'O';
      if (pt.result === 'us') { us.goals++; weOnO ? us.holds++ : us.breaks++; if (weOnO && possUs === 1) us.clean++; }
      if (pt.result === 'them') { them.goals++; weOnO ? them.breaks++ : them.holds++; if (!weOnO && possThem === 1) them.clean++; }
      if (weOnO) { us.oPoss += possUs; us.oGoals += pt.result === 'us' ? 1 : 0; them.dPoss += possThem; them.dGoals += pt.result === 'them' ? 1 : 0; }
      else { us.dPoss += possUs; us.dGoals += pt.result === 'us' ? 1 : 0; them.oPoss += possThem; them.oGoals += pt.result === 'them' ? 1 : 0; }
      let last = null;
      for (const e of ev) {
        if (e.t === 'touch') { if (last && last !== e.id) us.comp++; last = e.id; continue; }
        if (e.t !== 'assist') last = null;
        if (e.t === 'opppass') them.comp++;
        if (e.t === 'turn') { us.turns++; e.sub === 'drop' ? us.drops++ : us.throwaways++; }
        if (e.t === 'block') { us.blocks++; them.turns++; }
        if (e.t === 'oppturn' || (e.t === 'goal' && e.sub === 'callahan')) them.turns++;
      }
    }
    // Every possession that didn't end in that team's goal was a turnover, logged or not.
    us.turns = Math.max(us.turns, us.oPoss + us.dPoss - us.goals);
    them.turns = Math.max(them.turns, them.oPoss + them.dPoss - them.goals);
    return { us, them };
  }
  function teamTable(points, usName, themName) {
    const { us, them } = teamStats(points);
    const pct = (a, b) => (b ? ` (${Math.round((a / b) * 100)}%)` : '');
    const mins = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const top = us.ms + them.ms;
    const rows = [
      ['Goals (Holds / Breaks)', (x) => `${x.goals} (${x.holds}/${x.breaks})`],
      ['Completions', (x, o) => (x === them && !x.comp && o.comp ? '–' : String(x.comp))],
      ['Offense: Goals / Possessions', (x) => `${x.oGoals}/${x.oPoss}${pct(x.oGoals, x.oPoss)}`],
      ['Defense: Goals / Possessions', (x) => `${x.dGoals}/${x.dPoss}${pct(x.dGoals, x.dPoss)}`],
      ['Clean Holds', (x) => String(x.clean)],
      ['Turnovers (Throwaways, Drops)', (x) => { if (x !== us) return String(x.turns); const other = x.turns - x.throwaways - x.drops; return `${x.turns} (${x.throwaways}, ${x.drops}${other > 0 ? `, ${other} not logged` : ''})`; }],
      ['Blocks', (x) => (x === us ? String(x.blocks) : '–')],
      ['Time of Possession', (x) => `${mins(x.ms)}${pct(x.ms, top)}`],
    ];
    return `<div class="tbl-wrap"><table class="ts"><thead><tr><th class="ts-us">${esc(usName)}</th><th></th><th class="ts-them">${esc(themName || 'Opponent')}</th></tr></thead><tbody>${rows.map(([label, f]) => `<tr><td class="ts-us">${f(us, them)}</td><th class="ts-label">${label}</th><td class="ts-them">${f(them, us)}</td></tr>`).join('')}</tbody></table></div>
      <p class="ln-note">Possessions count each time a team has the disc; every possession that doesn't end in a goal is a turnover, including ones nobody logged. Opponent completions come from the Opponent pass button; their blocks aren't tracked.</p>`;
  }

  function pointList(points, players, positions, color) {
    pointList.color = color;
    const byId = new Map(players.map((p) => [p.id, p]));
    const abbr = (id) => { const p = positions.find((x) => x.id === id); return p ? p.abbr : ''; };
    const name = (id) => (byId.has(id) ? esc(byId.get(id).name) : 'Removed player');
    let us = 0, them = 0;
    return points.map((p, i) => {
      p.result === 'us' ? us++ : them++;
      const line = p.lineup.filter((id) => byId.has(id)).map((id) => `${name(id)}${abbr((p.roles || {})[id]) ? ` <small>${esc(abbr(p.roles[id]))}</small>` : ''}`).join(', ');
      const items = narrative(p.events);
      const events = items.map((it, k) => (k ? arrowHtml(p.events, items, k) : '') + (it.t === 'touch' && !it.role ? name(it.id) : !it.id ? `<b class="e-${it.t}">${oppLabel(it)}</b>` : `<b class="e-${it.role || it.t}">${label({ t: it.role || it.t, sub: it.sub })}: ${name(it.id)}</b>`)).join('');
      return `<div class="rp-pt"><p><strong>Point ${i + 1}</strong> · ${p.on === 'O' ? 'Offense' : 'Defense'} · ${p.result === 'us' ? 'We scored' : 'They scored'} · ${us}–${them} · ${clock(p.endedAt - p.startedAt)}</p>${possessionBar(p, pointList.color)}<p>${line}</p>${events ? `<p class="rp-chain">${events}</p>` : ''}</div>`;
    }).reverse().join('');
  }

  const CSS = `
.tbl-wrap { overflow-x: auto; max-width: 100%; }
.ln { width: auto; border-collapse: separate; border-spacing: 2px; font-variant-numeric: tabular-nums; }
.ln th { font-size: .75rem; font-weight: 700; color: var(--muted); padding: 2px; min-width: 26px; text-align: center; }
.ln th.ln-team { text-align: left; color: var(--ink); font-size: .875rem; white-space: nowrap; padding-right: 8px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.ln td { width: 28px; min-width: 20px; height: 30px; padding: 0; text-align: center; border: 1px solid var(--line); border-radius: 3px; font-weight: 700; font-size: .875rem; }
.ln td.scored { background: var(--accent); color: var(--on-accent); }
.ln .ln-open { display: block; width: 100%; height: 100%; min-height: 26px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: center; cursor: pointer; }
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
.bx-box th:not(.bx-name):not(.bx-no), .bx-box td:not(.bx-name):not(.bx-no) { width: 88px; min-width: 88px; max-width: 88px; text-align: center; }
.bx-box .bx-name { min-width: 120px; padding-right: 14px; }
.bx tfoot td { font-weight: 700; border-top: 2px solid var(--ink); }
.rp-chain b { padding: 0 5px; border-radius: 3px; color: #ffffff; font-weight: 700; }
.rp-chain .e-goal { background: #0b7a3e; } .rp-chain .e-assist { background: #1565c0; } .rp-chain .e-turn { background: #c62828; } .rp-chain .e-block { background: #7b3fb3; } .rp-chain .e-oppturn, .rp-chain .e-oppgoal, .rp-chain .e-opppass { background: #8a6400; }
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
.pb { position: relative; height: 34px; min-width: 120px; }
.pb-bar { position: absolute; left: 0; right: 0; top: 0; height: 14px; border-radius: 7px; overflow: hidden; }
.pb-bar i { position: absolute; top: 0; bottom: 0; }
.pb-bar i.us { background: #1f7a9c; } .pb-bar i.them { background: rgba(130, 136, 152, .28); }
.pb b { position: absolute; top: 15px; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; color: #ffffff; font: 700 11px/18px system-ui, sans-serif; text-align: center; }
.pb b.us { background: #1f7a9c; } .pb b.them { background: #8a90a0; }
.ts { border-collapse: collapse; width: auto; min-width: 320px; font-variant-numeric: tabular-nums; }
.ts th, .ts td { padding: 5px 10px; border-top: 1px solid var(--line); }
.ts thead th { border-top: 0; font-size: .875rem; }
.ts .ts-us, .ts thead th.ts-us { text-align: right; font-weight: 700; white-space: nowrap; }
.ts .ts-them, .ts thead th.ts-them { text-align: left; font-weight: 700; white-space: nowrap; }
.ts .ts-label { text-align: center; font-weight: 400; color: var(--muted); font-size: .875rem; white-space: nowrap; }
.rp-wrap { max-width: 920px; margin: 0 auto; padding: 16px; }
.rp-up { padding: 6px 0; border-top: 1px solid var(--line); }`;

  /* ---------- One-page printable scoresheet, as a PDF built by hand ---------- */
  // rows: [{ name, no, match }] in print order; points as stored. Landscape letter, black ink except the jersey icons.
  function scoresheetPdf({ title, subtitle, points, rows, mixed, halfAt }) {
    const W = 792, H = 612, M = 22, ops = [];
    const plain = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([\\()])/g, '\\$1');
    const num = (x) => Math.round(x * 100) / 100;
    const y = (top) => num(H - top);
    const widthOf = (s, size, bold) => String(s).length * size * (bold ? 0.58 : 0.52);
    const text = (s, x, top, size, bold, align, rgb) => {
      const w = widthOf(s, size, bold), x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ops.push(`${rgb || '0 0 0'} rg BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(x0)} ${y(top + size * 0.78)} Td (${plain(s)}) Tj ET`);
    };
    const line = (x1, t1, x2, t2, w) => ops.push(`${num(w)} w 0 0 0 RG ${num(x1)} ${y(t1)} m ${num(x2)} ${y(t2)} l S`);
    const box = (x, top, w, h, fill) => ops.push(`${fill} rg ${num(x)} ${y(top + h)} ${num(w)} ${num(h)} re f`);
    const fit = (s, size, max, bold) => { let out = String(s); while (out.length > 1 && widthOf(out, size, bold) > max) out = out.slice(0, -1); return out.length < String(s).length ? out.slice(0, -1) + '.' : out; };
    const n = Math.max(1, points.length);
    let us = 0, them = 0;
    const scores = points.map((p) => { p.result === 'us' ? us++ : them++; return `${us}-${them}`; });
    text(title, M, M, 14, true);
    text(subtitle, W - M, M + 2, 10, false, 'right');
    const nameW = 150, hh = 13, top0 = M + 26, keyH = 14;
    const colW = Math.min(60, (W - 2 * M - nameW) / n);
    const gridW = nameW + colW * n;
    const avail = H - M - keyH - top0 - 3 * hh;
    const rowH = Math.max(8, Math.min(32, avail / Math.max(1, rows.length)));
    const bodyTop = top0 + 2 * hh, bodyBottom = bodyTop + rowH * rows.length;
    // We-scored columns get a light shade, top to bottom.
    points.forEach((p, i) => { if (p.result === 'us') box(M + nameW + i * colW, top0, colW, bodyBottom + hh - top0, '0.9 0.9 0.9'); });
    const hs = Math.min(9, colW * 0.42);
    text('Point', M + 4, top0 + 2.5, 8, true);
    text('Started on', M + 4, top0 + hh + 2.5, 8, true);
    points.forEach((p, i) => { const cx = M + nameW + (i + 0.5) * colW; text(String(i + 1), cx, top0 + 2.5, hs, true, 'center'); text(p.on, cx, top0 + hh + 2.5, hs, false, 'center'); });
    const durs = points.map((p) => p.endedAt - p.startedAt).sort((a, b) => a - b), median = durs.length ? durs[Math.floor(durs.length / 2)] : 0;
    const weight = (p) => { const d = p.endedAt - p.startedAt; return d >= median * 1.35 ? 2.2 : d <= median * 0.7 ? 0.6 : 1.2; };
    const played = points.map((p) => new Set(p.lineup.concat((p.subs || []).map((s) => s.in))));
    const has = (pt, id, t) => (pt.events || []).some((e) => e.id === id && e.t === t);
    const ms = Math.min(7, rowH * 0.36, colW * 0.3);
    rows.forEach((r, k) => {
      const top = bodyTop + k * rowH;
      const ih = Math.min(rowH - 3, 15), fs = Math.min(9, ih * 0.62), label = r.no ? `#${r.no}` : '#', iw = Math.max(ih, widthOf(label, fs, true) + 5);
      const color = !mixed ? '0 0 0' : r.match === 'W' ? '0.69 0.09 0.42' : '0.04 0.44 0.49';
      const ix = M + 3, it = top + (rowH - ih) / 2;
      if (mixed && r.match === 'W') { const rx = ih / 2, c = 0.55 * rx; const x0 = ix, x1 = ix + iw, t0 = it, t1 = it + ih; ops.push(`${color} rg ${num(x0 + rx)} ${y(t0)} m ${num(x1 - rx)} ${y(t0)} l ${num(x1 - rx + c)} ${y(t0)} ${num(x1)} ${y(t0 + rx - c)} ${num(x1)} ${y(t0 + rx)} c ${num(x1)} ${y(t1 - rx + c)} ${num(x1 - rx + c)} ${y(t1)} ${num(x1 - rx)} ${y(t1)} c ${num(x0 + rx)} ${y(t1)} l ${num(x0 + rx - c)} ${y(t1)} ${num(x0)} ${y(t1 - rx + c)} ${num(x0)} ${y(t1 - rx)} c ${num(x0)} ${y(t0 + rx - c)} ${num(x0 + rx - c)} ${y(t0)} ${num(x0 + rx)} ${y(t0)} c f`); }
      else box(ix, it, iw, ih, color);
      text(label, ix + iw / 2, it + (ih - fs * 0.78) / 2 - 0.4, fs, true, 'center', '1 1 1');
      const ns = Math.min(10, rowH * 0.6);
      text(fit(r.name, ns, nameW - iw - 12), ix + iw + 5, top + (rowH - ns * 0.78) / 2, ns, false);
      points.forEach((pt, i) => {
        const x = M + nameW + i * colW;
        if (played[i].has(r.id)) { const pad = Math.min(colW, rowH) * 0.16; line(x + pad, top + rowH - pad, x + colW - pad, top + pad, weight(pt)); }
        const tl = (has(pt, r.id, 'assist') ? 'A' : '') + (has(pt, r.id, 'goal') ? 'G' : ''), br = (has(pt, r.id, 'turn') ? 'T' : '') + (has(pt, r.id, 'block') ? 'D' : '');
        if (tl) text(tl, x + 1.5, top + 1.2, ms, true);
        if (br) text(br, x + colW - 1.5, top + rowH - ms * 0.78 - 1.2, ms, true, 'right');
      });
    });
    text('Score', M + 4, bodyBottom + 2.5, 8, true);
    scores.forEach((s, i) => text(s, M + nameW + (i + 0.5) * colW, bodyBottom + 3, Math.min(8, colW * 0.3), true, 'center'));
    // Grid on top of the shading and marks.
    const bottom = bodyBottom + hh;
    for (let i = 0; i <= n; i++) line(M + nameW + i * colW, top0, M + nameW + i * colW, bottom, 0.4);
    line(M, top0, M, bottom, 0.4);
    [top0, top0 + hh, bodyTop, bodyBottom, bottom].forEach((t) => line(M, t, M + gridW, t, t === bodyTop || t === bodyBottom ? 0.9 : 0.4));
    rows.forEach((_, k) => { if (k) line(M, bodyTop + k * rowH, M + gridW, bodyTop + k * rowH, 0.25); });
    // A heavy line between the first and second half.
    if (halfAt) { let u2 = 0, t2 = 0; for (let i = 0; i < points.length - 1; i++) { points[i].result === 'us' ? u2++ : t2++; if (Math.max(u2, t2) >= halfAt) { const x = M + nameW + (i + 1) * colW; line(x, top0, x, bottom, 2.6); break; } } }
    text('Slash = played (thick: long point, thin: short point) · Shaded column = we scored · A assist · G goal · T turnover · D block', M, H - M - 8, 7.5, false);
    const content = ops.join('\n');
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ];
    let out = '%PDF-1.4\n';
    const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  /* ---------- Field diagram: portrait, the team drawn first attacks the top endzone ---------- */
  // Positions are fractions of the field, 0 to 1. Endzones are the top and bottom 20 of 120 yards.
  const FW = 40, FH = 120;
  // A plausible layout when nobody tapped where things happened.
  function formation(n, attacking, at) {
    const hx = at ? at.x : 0.5, hy = at ? at.y : 0.66;
    const spots = attacking
      ? [[hx, hy], [hx - 0.2, hy + 0.04], [hx + 0.2, hy + 0.04], [0.5, hy - 0.14], [0.5, hy - 0.22], [0.5, hy - 0.3], [0.5, hy - 0.38]]
      : [[0.5, 0.56], [0.36, 0.5], [0.64, 0.5], [0.2, 0.4], [0.8, 0.4], [0.5, 0.34], [0.5, 0.18]];
    return spots.slice(0, n).map(([x, y]) => ({ x: Math.min(0.95, Math.max(0.05, x)), y: Math.min(0.97, Math.max(0.03, y)) }));
  }
  // The passes and stats of the possession in progress, from events that were placed on the field.
  function possessionTrail(events) {
    let start = 0;
    (events || []).forEach((e, i) => { if (['turn', 'block', 'oppturn', 'goal', 'oppgoal'].includes(e.t)) start = e.t === 'block' ? i : i + 1; });
    return (events || []).slice(start).filter((e) => e.x !== undefined && (e.t === 'touch' || e.t === 'block'));
  }
  function fieldSvg(o) {
    const X = (v) => (v * FW).toFixed(2), Y = (v) => (v * FH).toFixed(2);
    const team = (t, flip) => {
      const f = (p) => (flip ? { ...p, x: 1 - p.x, y: 1 - p.y } : p);
      const lines = (t.trail || []).map(f).map((p, i, arr) => (i ? `<line x1="${X(arr[i - 1].x)}" y1="${Y(arr[i - 1].y)}" x2="${X(p.x)}" y2="${Y(p.y)}" class="f-pass" stroke="${t.color}"/>` : '')).join('');
      const marks = (t.marks || []).map(f).map((m) => `<g class="f-mark"><circle cx="${X(m.x)}" cy="${Y(m.y)}" r="1.6" fill="${m.kind === 'T' ? '#c62828' : '#7b3fb3'}"/><text x="${X(m.x)}" y="${(m.y * FH + 0.55).toFixed(2)}" class="f-mk">${m.kind}</text></g>`).join('');
      const dots = (t.dots || []).map(f).map((d) => `<g class="f-dot${d.hold ? ' hold' : ''}">${d.hold ? `<circle cx="${X(d.x)}" cy="${Y(d.y)}" r="3.4" class="f-ring" stroke="${t.color}"/>` : ''}<circle cx="${X(d.x)}" cy="${Y(d.y)}" r="2.3" fill="${t.color}"/><text x="${X(d.x)}" y="${(d.y * FH + 0.8).toFixed(2)}" fill="${inkOn(t.color)}" class="f-no">${esc(d.label)}</text>${d.hold ? `<ellipse cx="${(d.x * FW + 2.6).toFixed(2)}" cy="${(d.y * FH - 2.4).toFixed(2)}" rx="1.3" ry="0.55" class="f-disc"/>` : ''}</g>`).join('');
      return lines + marks + dots;
    };
    const pend = o.pending ? `<circle cx="${X(o.pending.x)}" cy="${Y(o.pending.y)}" r="2.2" class="f-pending"/>` : '';
    return `<svg class="field-svg${o.interactive ? ' tappable' : ''}" viewBox="0 0 ${FW} ${FH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(o.label || 'Field')}">
      <rect x="0" y="0" width="${FW}" height="${FH}" class="f-grass"/><rect x="0" y="0" width="${FW}" height="20" class="f-zone"/><rect x="0" y="100" width="${FW}" height="20" class="f-zone"/>
      <line x1="0" y1="20" x2="${FW}" y2="20" class="f-line"/><line x1="0" y1="100" x2="${FW}" y2="100" class="f-line"/>
      <text x="${FW / 2}" y="4" class="f-ez">${esc(o.topLabel || 'Attacking')}</text><text x="${FW / 2}" y="118" class="f-ez">${esc(o.bottomLabel || 'Defending')}</text>
      <circle cx="${FW / 2}" cy="40" r="0.6" class="f-brick"/><circle cx="${FW / 2}" cy="80" r="0.6" class="f-brick"/>
      ${(o.teams || []).map((t, i) => team(t, i === 1)).join('')}${pend}</svg>`;
  }
  const FIELD_CSS = `.field-svg { display: block; width: 100%; max-width: 360px; height: auto; margin: 0 auto; border-radius: 10px; touch-action: manipulation; }
.field-svg.tappable { cursor: crosshair; }
.f-grass { fill: #3f8f55; } .f-zone { fill: #357d49; } .f-line, .f-brick { stroke: rgba(255,255,255,.8); stroke-width: .35; fill: rgba(255,255,255,.8); }
.f-ez { fill: rgba(255,255,255,.55); font: 700 1.7px system-ui, sans-serif; text-anchor: middle; letter-spacing: .15px; text-transform: uppercase; }
.f-pass { stroke-width: .55; stroke-dasharray: 1.1 .9; fill: none; opacity: .95; }
.f-no { font: 700 2.4px system-ui, sans-serif; text-anchor: middle; } .f-mk { font: 700 2px system-ui, sans-serif; text-anchor: middle; fill: #fff; }
.f-ring { fill: none; stroke-width: .6; } .f-disc { fill: #fff; stroke: #333; stroke-width: .15; }
.f-dot circle:not(.f-ring) { stroke: rgba(255,255,255,.85); stroke-width: .3; }
.f-pending { fill: rgba(255,255,255,.35); stroke: #fff; stroke-width: .4; stroke-dasharray: .8 .5; }`;

  const dateText = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // Only real YouTube links are ever shown as links.
  function videoUrl(s) {
    try { const u = new URL(String(s || '').trim()); return u.protocol === 'https:' && /(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname) ? u.href : ''; } catch (e) { return ''; }
  }
  // Everything the page shows comes through this function. Add fields here only if families may see them.
  function safeData(team) {
    const players = team.players.map((p) => ({ id: p.id, no: p.no, name: p.name }));
    const positions = team.rules.positions.map((p) => ({ id: p.id, abbr: p.abbr }));
    const games = team.history.slice().reverse().map((h) => ({
      id: h.id, opponent: h.opponent, date: h.date, video: videoUrl(h.video), us: h.us, them: h.them,
      totals: Object.fromEntries(Object.entries(h.perPlayer).map(([id, v]) => { const pt = totals(h.points || []).get(id) || {}; return [id, { played: v.played || 0, O: v.O || 0, D: v.D || 0, touch: v.touch || 0, goal: v.goal || 0, comp: pt.comp || 0, rec: pt.rec || 0, assist: v.assist || 0, turn: v.turn || 0, drop: v.drop || 0, block: v.block || 0 }]; })),
      points: (h.points || []).map((p) => ({ lineup: p.lineup, roles: p.roles, on: p.on, result: p.result, startedAt: p.startedAt, endedAt: p.endedAt, subs: (p.subs || []).map((s) => ({ in: s.in, out: s.out })), events: (p.events || []).map((e) => ({ t: e.t, id: e.id, sub: e.sub, at: e.at, throwType: e.throwType })) })),
    }));
    const upcoming = (team.schedule || []).filter((x) => !x.gameId).map((x) => ({ date: x.date, time: x.time, opponent: x.opponent, location: x.location }));
    return { team: team.team, color: safeColor(team.color), logo: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(team.logo || '') ? team.logo : '', players, positions, games, upcoming };
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
    const games = d.games.map((g) => `<section id="game-${esc(g.id)}"><h2>vs ${esc(g.opponent || 'Opponent')} · ${g.us}–${g.them}</h2><p>${esc(dateText(g.date))}${g.video ? ` · <a href="${esc(g.video)}">Watch the game video</a>` : ''}</p>
      ${g.points.length ? `<h3>Point flow</h3>${lineScore(g.points, d.team, g.opponent)}` : ''}
      ${g.points.length ? `<h3>Team stats</h3>${teamTable(g.points, d.team, g.opponent)}` : ''}<h3>Box score</h3>${statTable(d.players, new Map(Object.entries(g.totals).map(([id, v]) => [id, v])))}
      ${g.points.length ? `<h3>Points</h3>${pointList(g.points, d.players, d.positions, d.color)}` : ''}</section>`).join('');
    const upcoming = d.upcoming.length ? `<section id="schedule"><h2>Upcoming games</h2>${d.upcoming.map((u) => `<p class="rp-up">${esc(u.date)}${u.time ? ' · ' + esc(u.time) : ''} · vs ${esc(u.opponent)}${u.location ? ' · ' + esc(u.location) : ''}</p>`).join('')}</section>` : '';
    return `<div class="rp-wrap"><h1>${d.logo ? `<img src="${d.logo}" alt="" width="44" height="44" style="vertical-align:middle;margin-right:10px;border-radius:6px">` : ''}${esc(d.team)}</h1><p>Record ${wins}–${losses}</p><nav class="rp-nav">${nav.map(([id, l]) => `<a href="#${esc(id)}">${esc(l)}</a>`).join('')}</nav>
      <section id="season"><h2>Season stats</h2>${statTable(d.players, season, { label: 'Games', value: (p) => season.get(p.id).games })}</section>${upcoming}${games}</div>`;
  }
  function html(team) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(team.team)} stats</title><style>${CSS}body{margin:0}</style></head><body class="rp">${fragment(team)}</body></html>`;
  }

  return { CSS, FIELD_CSS, fieldSvg, formation, possessionTrail, safeColor, inkOn, teamStats, teamTable, holder, oppLabel, scoresheetPdf, label, videoUrl, isPass, THROW, THROW_NAME, possession, possessionBar, narrative, totals, passes, playerSummary, targetBias, statTable, combos, lineScore, boxTable, fragment, html, safeData };
})();
if (typeof module !== 'undefined') module.exports = Report;
