/* Line Caller interface. State lives in one object; every change saves and re-renders. */
(() => {
  const E = Engine;
  const KEY_STORE = 'linecaller.v1';
  const root = document.getElementById('app');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const BASE_SKILLS = [['h', 'Handling'], ['c', 'Cutting'], ['d', 'Defense'], ['s', 'Stamina']];
  const MATCH = { W: 'women-matching', M: 'men-matching' };
  const TARGET_LABEL = { least: 'Least', less: 'Less', average: 'Average', more: 'More', most: 'Most' };
  const STAT_LABEL = { goal: 'Goal', assist: 'Assist', turn: 'Turnover', block: 'Block' };
  const MODE_LABEL = { develop: 'Develop', balanced: 'Balanced', competitive: 'Competitive', win: 'Universe' };
  const SCHEMES = [['system', 'Automatic', 'Follows your device'], ['light', 'Light', 'Bright and plain'], ['dark', 'Dark', 'Easy at dusk'], ['field', 'Field', 'Deep turf green'], ['ocean', 'Ocean', 'Cool blues'], ['sunrise', 'Sunrise', 'Warm and soft'], ['sun', 'High sun', 'Maximum contrast outdoors']];
  const newDraft = (plan) => ({ alt: 0, on: null, ratio: null, line: {}, plan: plan || null });
  const newPlayer = (name, f) => ({ id: uid(), name, no: '', aliases: '', match: 'M', h: 3, c: 3, d: 3, s: 3, tags: [], target: 'average', minPts: 2, contacts: [], ...f });

  let Root = null, S = null, tab = 'game', sel = null, editing = null, seasonView = false, ptView = 'time', pointsSource = 'current', backupText = '', notice = '';
  let playerOpen = null, openMic = false, fixLine = false;
  let editIdx = null, settingsOpen = false, matchResult = null;
  let comboSize = '2', sendFor = null, reportNote = '', downloads = null;
  let memo = null, previews = null, confirmKey = null, confirmTimer = null, menu = null, voice = null;

  /* ---------- Example data, clearly labelled in the app ---------- */
  function example() {
    const rows = [
      ['Ari N.', 5, 3, 3, 4, ['Leader']], ['Bea T.', 4, 3, 4, 3, ['Puller']], ['Cal R.', 4, 2, 3, 4, []], ['Dee M.', 3, 4, 3, 5, []],
      ['Eli S.', 2, 5, 3, 4, ['Deep']], ['Fen W.', 2, 4, 4, 5, ['Lockdown']], ['Gus P.', 3, 3, 5, 4, ['Lockdown', 'Leader']], ['Hana K.', 3, 4, 2, 3, []],
      ['Ike O.', 2, 3, 4, 3, []], ['Jo V.', 4, 3, 2, 2, ['Puller']], ['Kai L.', 1, 3, 3, 4, ['Rookie']], ['Lux B.', 2, 2, 3, 3, ['Rookie']],
      ['Mo D.', 2, 4, 3, 3, ['Deep']], ['Nia F.', 1, 2, 2, 4, ['Rookie']],
    ];
    const players = rows.map(([name, h, c, d, s, tags], i) => newPlayer(name, { id: 'ex' + i, no: String(i * 3 + 4), match: i % 2 ? 'W' : 'M', h, c, d, s, tags }));
    const rules = E.defaultRules();
    const game = { id: 'exg', opponent: 'Riverside', startOn: 'O', mode: 'balanced', out: {}, startedAt: Date.now() - 32 * E.MIN, points: [], live: null, draft: newDraft() };
    const durs = [2.6, 3.4, 2.1, 4.2, 3, 2.7, 3.6];
    const results = ['us', 'them', 'us', 'us', 'them', 'them', 'us'];
    const avail = players.map((p) => p.id);
    let t = Date.now() - (durs.reduce((a, b) => a + b, 0) + durs.length * 1.5) * E.MIN;
    durs.forEach((d, i) => {
      const ctx = E.context(game, rules);
      const best = E.suggest(game, players, rules, { ctx, count: 1 })[0];
      const end = t + d * E.MIN;
      const events = [];
      best.ids.slice(0, 4).forEach((id) => E.addEvent(events, { t: 'touch', id }, end));
      if (results[i] === 'us') E.addEvent(events, { t: 'goal', id: best.ids[4] }, end);
      game.points.push({ lineup: best.ids, roles: best.roles, on: ctx.on, ratio: ctx.ratio, startedAt: t, endedAt: end, result: results[i], avail, subs: [], events });
      t = end + 1.5 * E.MIN;
    });
    const soon = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    return { id: 'ex-team', isExample: true, team: 'Example Flyers', players, rules, game, history: [], schedule: [{ id: 'ex-s1', date: soon, time: '10:00 AM', opponent: 'Harbor City', location: 'Magnuson Field 4' }] };
  }
  const blank = (rules, name) => ({ id: 't' + uid(), isExample: false, team: name || 'My team', players: [], rules: rules || E.defaultRules(), game: null, history: [], schedule: [] });
  const freshRoot = () => ({ v: 3, updatedAt: 0, active: 'ex-team', teams: [example()] });
  const activeTeam = () => Root.teams.find((t) => t.id === Root.active) || Root.teams[0];

  // Brings data saved by earlier versions forward.
  function migrate(s) {
    if (s.teams) { s.teams.forEach((t) => { t.schedule = t.schedule || []; t.players.forEach((p) => { p.contacts = p.contacts || []; }); }); return s; }
    s.schedule = s.schedule || [];
    s.players.forEach((p) => { p.contacts = p.contacts || []; });
    if (s.isExample) return freshRoot();
    const r = s.rules;
    if ((s.v || 1) < 2) {
      const pos = E.defaultPositions();
      if (r.shape) {
        for (const on of ['O', 'D']) {
          const h = r.shape[on].H, d = r.shape[on].D, c = r.size - h - d;
          pos[0][on] = { min: h }; pos[1][on] = { min: c }; pos[2][on] = { min: d };
        }
        pos[0].floor = r.floor.H; pos[1].floor = r.floor.C; pos[2].floor = r.floor.D;
        delete r.shape; delete r.floor;
      }
      r.positions = pos;
      const targets = { less: 'less', even: 'average', more: 'more' };
      s.players.forEach((p) => { p.target = targets[p.target] || 'average'; p.minPts = 2; p.aliases = ''; p.no = p.no || ''; });
      if (s.game) {
        s.game.draft = newDraft();
        s.game.points.forEach((p) => { p.events = p.events || []; });
        if (s.game.live) s.game.live.events = [];
      }
    }
    r.positions.forEach((p) => { p.O = { min: p.O.min }; p.D = { min: p.D.min }; });
    s.id = 't' + uid();
    const updatedAt = s.updatedAt || Date.now();
    delete s.v; delete s.updatedAt;
    return { v: 3, updatedAt, active: s.id, teams: [s] };
  }

  /* ---------- Saving: on this device first, then to your account when the page runs on claude.ai ---------- */
  let db = null, pushTimer = null;
  function save() {
    try { localStorage.setItem(KEY_STORE, JSON.stringify(Root)); } catch (e) { /* storage blocked: the session still works */ }
    if (db && Root.teams.some((t) => !t.isExample)) { clearTimeout(pushTimer); pushTimer = setTimeout(() => { db.doc('teams/main').set({ json: JSON.stringify(Root), updatedAt: Root.updatedAt }).catch(() => {}); }, 1200); }
  }
  function load() {
    try { const raw = localStorage.getItem(KEY_STORE); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* fall through */ }
    return freshRoot();
  }
  async function connect() {
    if (!window.claude || !window.claude.use) return;
    try {
      downloads = await window.claude.use('downloads');
      db = await window.claude.use('db');
      if (!db) return;
      const snap = await db.doc('teams/main').get();
      const data = snap && snap.exists ? snap.data() : null;
      if (data && data.json && data.updatedAt > Root.updatedAt) { Root = migrate(JSON.parse(data.json)); S = activeTeam(); touch(); render(); try { localStorage.setItem(KEY_STORE, JSON.stringify(Root)); } catch (e) { /* keep going */ } }
    } catch (e) { /* offline: keep what this device has */ }
  }

  const touch = () => { memo = null; previews = null; };
  function commit(fn) { fn(); Root.updatedAt = Date.now(); touch(); save(); render(); }
  function commitLight(fn) { fn(); Root.updatedAt = Date.now(); save(); render(); }
  function uiChange(fn) { fn(); render(); }

  /* ---------- Derived values ---------- */
  const G = () => S.game;
  const P = (id) => S.players.find((p) => p.id === id);
  const POS = (id) => S.rules.positions.find((p) => p.id === id);
  const posName = (id) => (POS(id) ? POS(id).name : 'Player');
  const mixed = () => S.rules.division === 'mixed';
  const allSkills = () => BASE_SKILLS.concat(S.rules.positions.filter((p) => !BASE_SKILLS.some(([k]) => k === p.skill)).map((p) => [p.skill, p.name]));
  const stats = () => { if (!memo) memo = {}; if (!memo.stats) memo.stats = E.replay(G(), S.players, S.rules); return memo.stats; };
  function ctx() {
    if (!memo) memo = {};
    if (!memo.ctx) {
      const c = E.context(G(), S.rules), d = G().draft;
      memo.ctx = { ...c, on: d.on || c.on, ratio: c.ratio && (d.ratio || c.ratio) };
    }
    return memo.ctx;
  }
  const targetSize = () => Math.min(S.rules.size, S.players.filter((p) => !G().out[p.id]).length);
  const placedIds = () => Object.keys(G().draft.line);
  function options() {
    if (!memo) memo = {};
    if (!memo.options) {
      const g = G(), fixed = g.draft.line;
      let list = E.suggest(g, S.players, S.rules, { ctx: ctx(), stats: stats(), fixed, count: 6 });
      const plan = g.draft.plan;
      if (plan && !placedIds().length && plan.on === ctx().on && plan.ids.every((id) => P(id) && !g.out[id])) {
        const ev = E.evaluate(g, S.players, S.rules, plan.ids, { ctx: ctx(), stats: stats() });
        if (ev) { const key = plan.ids.slice().sort().join(); list = [ev, ...list.filter((o) => o.ids.slice().sort().join() !== key)].slice(0, 6); }
      }
      memo.options = list;
    }
    return memo.options;
  }
  const suggestion = () => { const list = options(); return list[Math.min(G().draft.alt, list.length - 1)] || null; };
  function placedLine() {
    if (!memo) memo = {};
    if (memo.placed === undefined) {
      const ids = placedIds();
      memo.placed = ids.length ? E.evaluate(G(), S.players, S.rules, ids, { ctx: ctx(), stats: stats(), fixed: G().draft.line, partial: ids.length < targetSize() }) : null;
    }
    return memo.placed;
  }
  function getPreviews() {
    if (previews) return previews;
    const g = G();
    const done = g.points.map((p) => p.endedAt - p.startedAt);
    const avg = done.length ? done.reduce((a, b) => a + b, 0) / done.length : 3 * E.MIN;
    previews = {};
    for (const r of ['us', 'them']) previews[r] = E.preview(g, S.players, S.rules, r, avg);
    return previews;
  }
  const activePt = () => (editIdx !== null ? G().points[editIdx] : G().live);
  const liveElapsed = () => { const l = G().live; return (l.pausedAt || Date.now()) - l.startedAt; };
  const liveOnField = () => {
    const l = activePt(); let ids = l.lineup.slice();
    for (const s of l.subs || []) ids = ids.map((x) => (x === s.out ? s.in : x));
    return ids;
  };
  const countIn = (pos) => Object.values(G().draft.line).filter((x) => x === pos).length;
  // Best-rated position, unless the remaining spots are all needed to meet a minimum.
  function bestPos(id) {
    const p = P(id), on = ctx().on;
    const ranked = S.rules.positions.slice().sort((a, b) => E.rate(p, b.skill) - E.rate(p, a.skill));
    const open = S.rules.positions.reduce((sum, x) => sum + Math.max(0, x[on].min - countIn(x.id)), 0);
    if (targetSize() - placedIds().length <= open) { const need = ranked.find((x) => countIn(x.id) < x[on].min); if (need) return need.id; }
    return ranked[0].id;
  }

  /* ---------- Small view helpers ---------- */
  const tipAttr = (t) => `data-tip="${esc(t)}"`;
  const seg = (act, value, opts, extra) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-a="${act}" data-v="${v}" ${extra || ''} aria-pressed="${String(v) === String(value)}">${l}</button>`).join('')}</div>`;
  const MODE_HINT = { develop: 'Freshest players and rookies first.', balanced: 'Rotates everyone and keeps skill high.', win: 'Your best seven. Tiredness barely counts.', competitive: 'Your top seven, resting about two a point so they last the game.' };
  const modeSeg = () => `<div class="mode">${seg('mode', G().mode, [['develop', 'Develop'], ['balanced', 'Balanced'], ['competitive', 'Competitive'], ['win', 'Universe']])}<span class="small muted">${MODE_HINT[G().mode]}</span></div>`;
  const stepper = (act, value, min, max, extra, shown) => `<span class="step"><button type="button" data-a="${act}" data-d="-1" ${extra || ''} aria-label="Less" ${value <= min ? 'disabled' : ''}>−</button><b>${shown === undefined ? value : shown}</b><button type="button" data-a="${act}" data-d="1" ${extra || ''} aria-label="More" ${value >= max ? 'disabled' : ''}>+</button></span>`;
  const twoTap = (key, act, label, confirmLabel, cls, extra) => `<button type="button" class="btn small-btn ${cls || ''}" data-a="confirm" data-key="${key}" data-then="${act}" ${extra || ''}>${confirmKey === key ? confirmLabel : label}</button>`;
  const FRESH_TIP = { Fresh: 'Fresh: ready for a long point.', OK: 'OK: can play, but has been working.', Tired: 'Tired: needs a rest. A long point now is a risk.' };
  const freshPill = (e) => { const f = E.fresh(e); return `<span class="fr ${f}" ${tipAttr(`${FRESH_TIP[f]} Energy ${Math.round(e)} of 100.`)}>${f}</span>`; };
  const pts = (s) => `${s.played}/${s.target.toFixed(1)} pts`;
  const owedText = (s) => { const d = s.target - s.played; return d >= 0.75 ? `Owed ${d.toFixed(1)}` : d <= -0.75 ? `Over ${(-d).toFixed(1)}` : 'On target'; };
  const owedTip = (s) => `Played ${s.played}. Fair share so far is ${s.target.toFixed(1)} points, based on who has been available and each player's target.`;
  const matchBadge = (p) => (mixed() ? `<span class="mb ${p.match}" ${tipAttr(p.match === 'W' ? 'WMP: women-matching player' : 'MMP: men-matching player')}>${p.match === 'W' ? 'WMP' : 'MMP'}</span>` : '');
  const tile = (p, small) => `<span class="tile ${mixed() ? p.match : ''} ${small ? 'sm' : ''}" aria-label="Jersey ${esc(p.no || 'not set')}">${esc(p.no || '–')}</span>`;
  // Badge during a game: the player's energy, shading to yellow, orange and red as they tire.
  const heat = (e) => (e >= 75 ? '' : e >= 65 ? 'h1' : e >= 55 ? 'h2' : e >= 40 ? 'h3' : 'h4');
  const freshTile = (p, small) => { const e = Math.round(stats().get(p.id).energy); return `<span class="tile ${mixed() ? p.match : ''} ${heat(e)} ${small ? 'sm' : ''}" title="Energy ${e} of 100" aria-label="Energy ${e} of 100">${e}</span>`; };
  const nameTag = (p) => `${p.no ? `<span class="no">#${esc(p.no)}</span> ` : ''}${esc(p.name)}`;
  const energyKey = '<span class="small muted" title="100 is fully rested. Yellow, orange and red mean tiring.">Badge is energy, out of 100</span>';
  const ratingTip = (p) => allSkills().map(([k, l]) => `${l} ${E.rate(p, k)}`).join(', ');
  const posAbbr = (id) => (POS(id) ? POS(id).abbr : '?');

  const whoName = (id) => (P(id) ? esc(P(id).name) : 'Removed player');
  const evChip = (e, suffix) => (e.t === 'touch' ? `<span class="ev">${whoName(e.id)}${suffix || ''}</span>` : e.t === 'oppturn' ? '<span class="ev stat e-oppturn">Opponent turnover</span>' : `<span class="ev stat e-${e.t}">${STAT_LABEL[e.t]}: ${whoName(e.id)}${suffix || ''}</span>`);
  function narrativeHtml(events, drag, suffix) {
    return Report.narrative(events).map((it, i) => {
      const attrs = drag ? `data-drag="ev:${i}" data-evi="${i}"` : '';
      const q = suffix && it.unsure ? ' ?' : '';
      if (it.t === 'touch' && !it.role) return `<span class="ev" ${attrs}>${whoName(it.id)}${q}</span>`;
      if (!it.id) return `<span class="ev stat e-${it.t}" ${attrs}>${it.t === 'oppgoal' ? 'Opponent goal' : 'Opponent turnover'}</span>`;
      const kind = it.role || it.t;
      return `<span class="ev stat e-${kind}" ${attrs}>${STAT_LABEL[kind]}: ${whoName(it.id)}${q}</span>`;
    }).join('<span class="muted arrow"> → </span>');
  }
  function lineCard(id, pos) {
    const p = P(id), def = POS(pos), rating = def ? E.rate(p, def.skill) : '';
    return `<button type="button" class="pc ${sel === id ? 'sel' : ''}" data-a="tap-line" data-id="${id}" data-drag="${id}">
      ${freshTile(p)}<span class="nm"><span class="tx">${nameTag(p)}</span></span>
      <span class="sub">${matchBadge(p)}<span class="meta"><span ${tipAttr(ratingTip(p))}>${esc(posName(pos))} ${rating}</span></span></span></button>`;
  }
  function benchRow(id, live) {
    const p = P(id), s = stats().get(id), owed = s.target - s.played;
    const short = S.rules.positions.slice(0, 3).map((x) => `${x.abbr}${E.rate(p, x.skill)}`).join(' ');
    return `<div class="br ${sel === id ? 'sel' : ''} ${owed >= 0.75 ? 'owed' : ''}">
      <button type="button" class="br-main" data-a="${live ? 'tap-bench-live' : 'tap-bench'}" data-id="${id}" ${live ? '' : `data-drag="${id}"`}>
      ${freshTile(p)}<span class="nm"><span class="tx">${nameTag(p)}</span></span>
      <span class="sub">${matchBadge(p)}<span class="meta"><span class="owe" ${tipAttr(owedTip(s))}>${owedText(s)}</span> · ${s.played} pts · <span ${tipAttr(ratingTip(p))}>${short}</span>${p.tags.length ? ' · ' + esc(p.tags.join(', ')) : ''}</span></span></button>
      <button type="button" class="sit" data-a="sit" data-id="${id}" aria-label="${esc(p.name)} is not at this game">Not here</button></div>`;
  }
  const sortByOwed = (ids) => ids.slice().sort((a, b) => { const x = stats().get(a), y = stats().get(b); return (y.target - y.played) - (x.target - x.played) || y.energy - x.energy; });

  function strength(line) {
    return `<div class="strength">${line.strength.map((v) => `<div class="st" ${tipAttr(`${v.label}: this line averages ${v.line.toFixed(1)}. The tick is your available team at ${v.team.toFixed(1)}.`)}><div class="row"><span>${esc(v.label)}</span><b>${v.line.toFixed(1)}</b></div><div class="meter"><i style="width:${v.line / 5 * 100}%"></i><u style="left:${v.team / 5 * 100}%"></u></div></div>`).join('')}</div>`;
  }
  const legend = () => (mixed() ? `<span class="legend small"><span class="tile W sm" aria-hidden="true"></span>WMP <span class="tile M sm" aria-hidden="true"></span>MMP</span>` : '');

  /* ---------- Game screens ---------- */
  function scoreboard(live) {
    const g = G(), sc = E.score(g), c = live ? { on: g.live.on, ratio: g.live.ratio, pointNo: g.points.length + 1, halftime: false } : ctx();
    const onLabel = c.on === 'O' ? 'Offense' : 'Defense';
    const major = Math.ceil(S.rules.size / 2), minor = Math.floor(S.rules.size / 2);
    const ratioLabel = c.ratio && (c.ratio === 'W' ? `${major} women / ${minor} men` : `${major} men / ${minor} women`);
    const atEnd = Math.max(sc.us, sc.them) >= S.rules.gameTo;
    return `<section class="score" aria-label="Score">
      <div class="nums"><div class="side"><b>${sc.us}</b><span class="team">${esc(S.team)}</span></div><span class="dash">–</span><div class="side"><b>${sc.them}</b><span class="team">${esc(g.opponent || 'Opponent')}</span></div></div>
      <div class="chips">
        <span class="label">Point ${c.pointNo}</span>
        ${live ? `<span class="chip on${c.on}">${onLabel}</span>` : `<button type="button" class="chip on${c.on}" data-a="flip-on" aria-label="Next point is ${onLabel}. Tap to switch.">${onLabel} ⇄</button>`}
        ${c.ratio ? (live ? `<span class="chip">${ratioLabel}</span>` : `<button type="button" class="chip" data-a="flip-ratio">${ratioLabel} ⇄</button>`) : ''}
        ${c.halftime ? '<span class="chip">After halftime</span>' : ''}
      </div>
      <div class="right">
        ${g.points.length ? '<button type="button" class="btn small-btn" data-a="edit-prev">Previous point</button>' : ''}
        ${!live && g.points.length ? '<button type="button" class="btn small-btn" data-a="undo">Undo last point</button>' : ''}
        ${twoTap('end', 'end-game', atEnd ? 'Finish game' : 'End game', 'Tap again to end', atEnd ? 'primary' : '')}
      </div></section>`;
  }

  function positionGroups() {
    const g = G(), on = ctx().on, line = g.draft.line;
    const room = placedIds().length < targetSize();
    const plural = (n) => (/s$/i.test(n) ? n : n + 's');
    return S.rules.positions.map((p) => {
      const ids = placedIds().filter((id) => line[id] === p.id), min = p[on].min;
      const openReq = Math.max(0, min - ids.length);
      const count = min ? `${ids.length} of ${min} minimum` : String(ids.length);
      return `<div class="role-group" data-drop="${p.id}"><div class="label">${esc(plural(p.name))} · ${count}</div><div class="cards">
        ${ids.map((id) => lineCard(id, p.id)).join('')}
        ${Array.from({ length: openReq }, () => `<button type="button" class="slot" data-a="fill-pos" data-v="${p.id}">Open</button>`).join('')}
        ${room && !openReq ? `<button type="button" class="slot optional" data-a="fill-pos" data-v="${p.id}">Add</button>` : ''}
      </div></div>`;
    }).join('');
  }
  function selectionBar() {
    if (!sel || !P(sel)) return '';
    const p = P(sel), g = G();
    if (g.live || editIdx !== null) {
      const onField = liveOnField().includes(sel);
      const help = fixLine ? (onField ? 'Tap the player who should be in this spot.' : 'Tap the player they should replace.') : (onField ? 'Tap a bench player to sub them in.' : 'Tap a player on the field to sub out.');
      return `<div class="selbar"><p><strong>${esc(p.name)}</strong> selected. ${help}</p><button type="button" class="btn small-btn" data-a="clear-sel">Cancel</button></div>`;
    }
    const onLine = !!g.draft.line[sel];
    return `<div class="selbar"><p><strong>${esc(p.name)}</strong> selected. ${onLine ? 'Tap a bench player to replace, or another line player to trade spots.' : 'Tap a line player to replace.'}</p>
      ${onLine ? `<button type="button" class="btn small-btn" data-a="remove-line" data-id="${sel}">Take off line</button>` : ''}<button type="button" class="btn small-btn" data-a="sit" data-id="${sel}">Not here</button><button type="button" class="btn small-btn" data-a="clear-sel">Cancel</button></div>`;
  }
  function suggestionPanel() {
    const g = G(), list = options(), s = suggestion(), full = placedIds().length >= targetSize();
    const rows = s ? S.rules.positions.map((p) => {
      const ids = s.ids.filter((id) => s.roles[id] === p.id);
      return ids.length ? `<div class="sug-row"><span class="label" ${tipAttr(p.name)}>${esc(p.abbr)}</span><div class="sug-chips">${ids.map((id) => { const on = !!g.draft.line[id]; return `<button type="button" class="sug ${on ? 'placed' : ''}" data-a="add-sug" data-id="${id}" data-v="${p.id}">${freshTile(P(id), true)}<span>${nameTag(P(id))}</span></button>`; }).join('')}</div></div>` : '';
    }).join('') : '<p class="muted">Mark at least one player as here to get a suggestion.</p>';
    return `<section class="panel suggest" aria-label="Suggested line">
      <div class="panel-head"><h3>Suggested line</h3>${modeSeg()}</div>
      ${rows}
      ${s && s.plan ? `<p class="small muted">${s.plan.rest.length ? `Resting from your top seven: ${esc(s.plan.rest.join(', '))}` : 'Your full top seven'} · About ${s.plan.left} ${s.plan.left === 1 ? 'point' : 'points'} left.</p>` : ''}
      ${s ? strength(s) : ''}
      ${s && s.warnings.length ? `<div class="warns small">${s.warnings.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
      <div class="chips"><button type="button" class="btn small-btn primary" data-a="use-sug" ${s && !full ? '' : 'disabled'}>${placedIds().length ? 'Fill open spots' : 'Use this line'}</button>
      <button type="button" class="btn small-btn" data-a="alt" ${list.length < 2 ? 'disabled' : ''}>Another option (${Math.min(g.draft.alt, list.length - 1) + 1} of ${list.length})</button></div>
    </section>`;
  }
  function voiceBox() {
    if (!voice) return '';
    const isPlay = voice.kind === 'play';
    return `<section class="voice" aria-label="Voice">
      <div class="panel-head"><h3>${voice.open ? 'Open mic' : isPlay ? 'Say the play' : 'Say the line'}</h3><button type="button" class="btn small-btn" data-a="voice-close">Close</button></div>
      <div class="chips">${voice.open ? '<button type="button" class="btn small-btn rec-on" data-a="open-mic">Turn off open mic</button>' : `<button type="button" class="btn small-btn ${voice.listening ? 'rec-on' : 'primary'}" data-a="voice-rec">${voice.listening ? 'Stop' : 'Record'}</button>${editIdx === null ? '<button type="button" class="btn small-btn" data-a="open-mic">Open mic</button>' : ''}`}<span class="small muted" id="voice-status" role="status">${esc(voice.status || '')}</span></div>
      <textarea id="voice-text" data-c="voice" aria-label="What you said" placeholder="${voice.open ? 'Listening…' : isPlay ? 'Ari throws to Bea, Bea to Cal, Cal to Dee, goal' : 'Handlers Ari, Bea, Cal. Cutters Dee, Fen, Gus, Hana.'}">${esc(voice.text)}</textarea>
      ${voice.open ? `<p class="small muted">${voice.last ? `Last heard: ${esc(voice.last)}` : (isPlay ? 'Talk the way you normally would. Stats add themselves, and a goal stops the clock so you can review. It stays on for the next point.' : 'Say your line, like "Handlers Ari, Bea. Cutters Dee, Fen." Players go in as you talk.')}</p>` : `<div id="voice-preview">${voicePreview()}</div>`}</section>`;
  }
  function voicePreview() {
    if (!voice || !voice.text.trim()) return '<p class="small muted">Your words appear above. Fix any mistakes before adding them.</p>';
    return voice.kind === 'play' ? playPreview() : linePreview();
  }
  const notes = (unknown) => (unknown.length ? `<p class="small muted">Words not used: ${esc(unknown.join(', '))}. If one is a name, add it under that player's "Sounds like".</p>` : '');
  const benchNow = () => { const on = liveOnField(); return S.players.filter((p) => !on.includes(p.id) && !G().out[p.id]); };
  const parseLive = (text, opts) => E.parsePlay(text, liveOnField().filter(P).map(P), { ...opts, bench: benchNow() });
  const canEndByVoice = () => editIdx === null && G().live && !G().live.review;
  function playPreview() {
    const r = parseLive(voice.text);
    const items = narrativeHtml(r.events, false, true);
    const any = r.events.length;
    return `<div class="chain">${items || '<span class="muted">No players recognized yet.</span>'}</div>${r.events.some((e) => e.unsure) ? '<p class="small muted">A ? means the name was a close guess.</p>' : ''}${notes(r.unknown)}
      <div class="chips">${r.hasGoal && canEndByVoice() ? '' : `<button type="button" class="btn small-btn" data-a="voice-add" ${any ? '' : 'disabled'}>Add to this point</button>`}
      ${r.hasGoal && canEndByVoice() ? '<button type="button" class="btn small-btn primary" data-a="voice-add" data-v="us">Add and we scored</button>' : ''}
      ${r.theyScored && canEndByVoice() ? '<button type="button" class="btn small-btn primary" data-a="voice-add" data-v="them">Add and they scored</button>' : ''}</div>`;
  }
  const voicePlayers = () => S.players.filter((p) => !G().out[p.id]);
  function linePreview() {
    const r = E.parseLine(voice.text, voicePlayers(), S.rules.positions);
    const parts = [];
    if (r.clear) parts.push('<span class="ev stat">Clear the line</span>');
    if (r.useSuggestion) parts.push('<span class="ev stat">Use the suggested line</span>');
    r.swaps.forEach((s) => parts.push(`<span class="ev">${esc(P(s.in).name)} in for ${esc(P(s.out).name)}</span>`));
    r.remove.forEach((id) => parts.push(`<span class="ev">${esc(P(id).name)} off</span>`));
    r.assign.forEach((a) => parts.push(`<span class="ev">${esc(P(a.id).name)}${a.unsure ? ' ?' : ''}: ${a.pos ? esc(posName(a.pos)) : 'best fit'}</span>`));
    return `<div class="chain">${parts.join(' ') || '<span class="muted">No players recognized yet.</span>'}</div>${notes(r.unknown)}
      <div class="chips"><button type="button" class="btn small-btn primary" data-a="voice-line" ${parts.length ? '' : 'disabled'}>Set line</button></div>`;
  }

  function draftScreen() {
    const g = G(), line = placedLine(), ids = placedIds(), target = targetSize();
    const rest = S.players.filter((p) => !g.out[p.id] && !g.draft.line[p.id]).map((p) => p.id);
    const gone = S.players.filter((p) => g.out[p.id]);
    const missing = target - ids.length;
    return `${scoreboard(false)}
    <div class="game">
      <div class="col">
        <section class="panel">
          <div class="panel-head"><h2>Your line</h2>${legend()}${energyKey}<span class="right"><span class="small muted">${ids.length} of ${target}</span>
            <button type="button" class="btn small-btn" data-a="voice-open" data-v="line">Voice</button>
            ${ids.length ? '<button type="button" class="btn small-btn" data-a="clear-line">Clear</button>' : ''}</span></div>
          ${voiceBox()}
          ${positionGroups()}
          ${line ? strength(line) : ''}
          ${line && line.warnings.length ? `<div class="warns" role="status"><b>Check this line</b>${line.warnings.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
        </section>
        ${suggestionPanel()}
        <div class="sticky-go">${selectionBar()}<button type="button" class="btn go" data-a="start-point" ${missing || !ids.length ? 'disabled' : ''}>${!target ? 'No players available' : missing ? `Pick ${missing} more` : 'Start point'}</button></div>
      </div>
      <section class="panel" aria-label="Bench" data-drop="bench">
        <div class="panel-head"><h2>Bench</h2><span class="small muted">Most owed first. Tap to add, or drag.</span></div>
        <div class="list">${sortByOwed(rest).map((id) => benchRow(id)).join('') || '<p class="muted">Everyone available is on the line.</p>'}</div>
        ${gone.length ? `<div class="label">Not at this game</div><div class="list">${gone.map((p) => `<button type="button" class="br-main gone" data-a="sit" data-id="${p.id}">${freshTile(p)}<span class="nm"><span class="tx">${nameTag(p)}</span></span><span class="sub small">Tap to bring back</span></button>`).join('')}</div>` : ''}
      </section>
    </div>`;
  }

  function offFieldNote(pt) {
    const on = new Set(pt.lineup.concat((pt.subs || []).map((s) => s.in)));
    const off = [...new Set((pt.events || []).filter((e) => e.id && !on.has(e.id)).map((e) => e.id))].filter(P);
    if (!off.length) return '';
    return `<div class="warns" role="status"><b>Check the lineup</b>${off.map((id) => `<span class="off-row">${esc(P(id).name)} has a stat this point but isn't listed on the field. <button type="button" class="btn small-btn" data-a="fix-with" data-id="${id}">Put ${esc(P(id).name)} on the line</button></span>`).join('')}</div>`;
  }
  const fixBar = () => (fixLine ? '<div class="selbar"><p><strong>Fixing the lineup.</strong> Tap someone on the field, then who should be there instead. No sub is recorded.</p><button type="button" class="btn small-btn primary" data-a="fix-line">Done fixing</button></div>' : '');
  function compactLine(pv, title) {
    if (!pv.line) return '';
    const onLabel = pv.ctx.on === 'O' ? 'O point' : 'D point';
    return `<div><h3>${title}</h3><p class="small muted">${onLabel}${pv.ctx.halftime ? ', after halftime' : ''}</p><div class="compact">${S.rules.positions.flatMap((r) => pv.line.ids.filter((id) => pv.line.roles[id] === r.id).map((id) => `<div>${freshTile(P(id), true)}<span class="cn">${nameTag(P(id))}</span><span class="tag" ${tipAttr(r.name)}>${esc(r.abbr)}</span></div>`)).join('')}</div></div>`;
  }
  const liveCount = (id, t) => (activePt().events || []).filter((e) => e.id === id && e.t === t).length;
  function fieldCard(id) {
    const p = P(id), s = stats().get(id), pos = (activePt().roles || {})[id];
    const counts = [['touch', 'T', 'Touches'], ['goal', 'G', 'Goals'], ['assist', 'A', 'Assists'], ['turn', 'TO', 'Turnovers'], ['block', 'B', 'Blocks']].filter(([k]) => liveCount(id, k) > 0);
    return `<button type="button" class="pc onfield ${sel === id ? 'sel' : ''}" data-a="tap-field" data-id="${id}" data-press="${id}">
      ${freshTile(p)}<span class="nm"><span class="tx">${nameTag(p)}</span></span>
      <span class="sub">${matchBadge(p)}<span class="meta"><span ${tipAttr(posName(pos))}>${esc(posAbbr(pos))}</span> · ${counts.length ? counts.map(([k, l, name]) => `<span ${tipAttr(`${name} this point`)}><b>${l}${liveCount(id, k)}</b></span>`).join(' ') : 'No touches yet'}</span></span></button>`;
  }
  function chainStrip() {
    const ev = activePt().events || [];
    const items = narrativeHtml(ev, true);
    return `<div class="chain-row"><div class="chain" aria-live="polite">${items || '<span class="muted">Tap a player for a touch. Hold for goal, assist, turnover or block.</span>'}</div>${ev.length > 1 ? '<span class="small muted chain-hint">Hold and drag to reorder</span>' : ''}${ev.length ? '<button type="button" class="btn small-btn" data-a="undo-stat">Undo</button>' : ''}<button type="button" class="btn small-btn" data-a="voice-open" data-v="play">Voice</button></div>`;
  }
  function liveScreen() {
    const g = G(), onField = liveOnField(), pv = getPreviews();
    const rest = S.players.filter((p) => !onField.includes(p.id) && !g.out[p.id]).map((p) => p.id);
    return `${scoreboard(true)}
    <div class="game">
      <section class="panel">
        <div class="live-top"><div class="timer-wrap"><div class="timer ${g.live.pausedAt ? 'paused' : ''}" id="timer">${clock(liveElapsed())}</div>${g.live.review ? '' : `<button type="button" class="btn small-btn" data-a="pause">${g.live.pausedAt ? 'Resume' : 'Pause'}</button>`}</div>
        ${g.live.review
          ? `<div class="review"><div><h3>${g.live.review.result === 'us' ? 'We scored' : 'They scored'}</h3><p class="small muted">Check the play and the lineup, then finalize.</p></div><div class="chips"><button type="button" class="btn small-btn" data-a="keep-playing">Keep playing</button><button type="button" class="btn primary" data-a="finalize">Finalize point</button></div></div>`
          : '<div class="score-btns"><button type="button" class="btn primary" data-a="result" data-v="us">We scored</button><button type="button" class="btn" data-a="result" data-v="them">They scored</button></div>'}</div>
        ${g.live.review ? offFieldNote(g.live) : ''}
        ${fixBar()}
        ${selectionBar()}
        ${voiceBox()}
        ${chainStrip()}
        <div class="panel-head"><span class="label">On the field</span>${legend()}${energyKey}</div>
        <div class="cards">${onField.map(fieldCard).join('')}</div>
        <div class="panel-foot"><span class="chips">${twoTap('cancel-pt', 'cancel-point', 'Cancel this point', 'Tap again to cancel')}<button type="button" class="btn small-btn" data-a="fix-line">${fixLine ? 'Done fixing' : 'Fix lineup'}</button></span><button type="button" class="btn small-btn opp" data-a="opp-turn">Opponent turnover</button></div>
      </section>
      <section class="panel" data-drop="none">
        <div class="panel-head"><h2>Next up</h2>${modeSeg()}</div>
        <div class="next-cols">${compactLine(pv.us, 'If we score')}${compactLine(pv.them, 'If they score')}</div>
        <div class="label">Bench</div>
        <div class="list">${sortByOwed(rest).map((id) => benchRow(id, true)).join('')}</div>
      </section>
    </div>`;
  }

  function pointEditor() {
    const g = G(), i = editIdx, p = g.points[i], len = g.points.length;
    let us = 0, them = 0;
    g.points.slice(0, i + 1).forEach((x) => { x.result === 'us' ? us++ : them++; });
    const onField = liveOnField().filter(P);
    return `<section class="panel">
      <div class="panel-head"><h2>Point ${i + 1}</h2><span class="chip on${p.on}">${p.on === 'O' ? 'Offense' : 'Defense'}</span><span>${p.result === 'us' ? 'We scored' : 'They scored'} · <b>${us}–${them}</b></span>
        <span class="right"><button type="button" class="btn small-btn" data-a="edit-step" data-d="-1" ${i ? '' : 'disabled'}>Earlier</button><button type="button" class="btn small-btn" data-a="edit-step" data-d="1" ${i < len - 1 ? '' : 'disabled'}>Later</button><button type="button" class="btn small-btn primary" data-a="edit-done">Done</button></span></div>
      <div class="time-row"><span class="label">Point length</span><span class="step"><button type="button" data-a="pt-time" data-d="-15" aria-label="15 seconds less">−15</button><input id="pt-time" type="text" inputmode="numeric" data-c="pt-time" value="${clock(p.endedAt - p.startedAt)}" aria-label="Point length, minutes and seconds"><button type="button" data-a="pt-time" data-d="15" aria-label="15 seconds more">+15</button></span></div>
      ${offFieldNote(p)}${fixBar()}${selectionBar()}
      ${voiceBox()}
      ${chainStrip()}
      <div class="panel-head"><span class="label">On the field</span>${legend()}</div>
      <div class="cards">${onField.map(fieldCard).join('')}</div>
      ${fixLine ? `<div class="label">Not on the field</div><div class="list">${S.players.filter((x) => !onField.includes(x.id)).map((x) => benchRow(x.id, true)).join('')}</div>` : ''}
      <div class="panel-foot"><span class="chips"><button type="button" class="btn small-btn" data-a="pt-view-all">All points</button><button type="button" class="btn small-btn" data-a="fix-line">${fixLine ? 'Done fixing' : 'Fix lineup'}</button></span><button type="button" class="btn small-btn opp" data-a="opp-turn">Opponent turnover</button></div>
    </section>`;
  }

  function setupScreen() {
    if (!S.players.length) return `<section class="panel"><h2>Add your players first</h2><p>Your roster is empty. Add names and rate each player, then come back to start a game.</p><div><button type="button" class="btn primary" data-a="tab" data-v="roster">Go to Teams</button></div></section>`;
    const s = S.setup || (S.setup = { opponent: '', startOn: 'O', out: {} });
    const here = S.players.filter((p) => !s.out[p.id]).length;
    const next = S.schedule.filter((x) => !x.gameId).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 4);
    const last = lastFinal();
    return `${last && !last.sent ? `<div class="banner"><span>Final: ${esc(S.team)} ${last.us}, ${esc(last.opponent || 'Opponent')} ${last.them}.</span><button type="button" class="btn small-btn" data-a="send-open">Send report</button></div>` : ''}
    <section class="panel"><h2>New game</h2>
      ${next.length ? `<div class="field"><span class="label">Scheduled</span><div class="attend">${next.map((x) => `<button type="button" class="tog" data-a="pick-scheduled" data-id="${x.id}" aria-pressed="${s.scheduleId === x.id}">${esc(longDate(x.date))} vs ${esc(x.opponent)}</button>`).join('')}</div></div>` : ''}
      <div class="form-row"><label class="field grow"><span class="label">Opponent</span><input id="opp" type="text" data-c="setup-opp" value="${esc(s.opponent)}" placeholder="Opponent name" autocomplete="off"></label>
      <div class="field"><span class="label">First point we play</span>${seg('setup-on', s.startOn, [['O', 'Offense'], ['D', 'Defense']])}</div></div>
      <div class="field"><span class="label">Who's here? ${here} of ${S.players.length}</span><div class="attend">${S.players.map((p) => `<button type="button" class="tog" data-a="setup-out" data-id="${p.id}" aria-pressed="${!s.out[p.id]}">${esc(p.name)}</button>`).join('')}</div></div>
      <button type="button" class="btn go" data-a="start-game" ${here ? '' : 'disabled'}>Start game</button></section>`;
  }

  /* ---------- Roster ---------- */
  function teamsPanel() {
    return `<section class="panel"><div class="panel-head"><h2>Teams</h2></div>
      <div class="taglist">${Root.teams.map((t) => `<button type="button" class="tog" data-a="switch-team" data-v="${t.id}" aria-pressed="${t.id === S.id}">${esc(t.team)}${t.game ? ' · in game' : ''}</button>`).join('')}</div>
      <div class="form-row"><label class="field grow"><span class="label">This team's name</span><input id="team-name" type="text" data-c="team" value="${esc(S.team)}" autocomplete="off"></label>
      ${Root.teams.length > 1 ? twoTap('delteam-' + S.id, 'delete-team', 'Delete team', 'Tap again to delete', 'danger') : ''}</div>
      <form class="form-row" data-form="team"><label class="field grow"><span class="label">New team</span><input id="new-team" type="text" placeholder="Team name" autocomplete="off"></label><button class="btn primary" type="submit">Add team</button></form>
      <p class="small muted">A new team starts with this team's rules and an empty roster.</p></section>`;
  }
  const longDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const lastFinal = () => S.history.find((h) => h.id === S.lastFinal) || S.history[S.history.length - 1];
  const subscribers = () => S.players.flatMap((p) => (p.contacts || []).filter((c) => c.subscribed).map((c) => c.email));
  function gamesPanel() {
    const list = S.schedule.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const upcoming = list.filter((x) => !x.gameId), played = list.filter((x) => x.gameId).reverse();
    const row = (x) => `<div class="game-row"><div class="game-info"><strong>${esc(longDate(x.date))}${x.time ? ' · ' + esc(x.time) : ''} vs ${esc(x.opponent || 'Opponent')}</strong>${x.location ? `<span class="small muted">${esc(x.location)}</span>` : ''}${x.gameId ? `<span class="small">Final ${x.us}–${x.them}</span>` : ''}</div>
      <div class="chips">${x.gameId ? `<button type="button" class="btn small-btn" data-a="send-open">Send report</button>${(S.history.find((h) => h.id === x.gameId) || {}).points ? twoTap('reopen-' + x.id, 'reopen-game', 'Reopen', 'Tap again to reopen', '', `data-id="${x.gameId}" ${S.game ? 'disabled' : ''}`) : ''}` : `<button type="button" class="btn small-btn primary" data-a="start-scheduled" data-id="${x.id}" ${S.game ? 'disabled' : ''}>Start</button>`}${twoTap('delgame-' + x.id, 'del-schedule', 'Remove', 'Tap again', 'danger', `data-id="${x.id}"`)}</div></div>`;
    return `<section class="panel"><h2>${esc(S.team)} games</h2>
      <form class="form-row" data-form="schedule"><label class="field grow"><span class="label">Opponent</span><input id="sch-opp" type="text" autocomplete="off" required></label>
      <label class="field"><span class="label">Date</span><input id="sch-date" type="date" required></label><label class="field"><span class="label">Time</span><input id="sch-time" type="text" placeholder="10:00 AM" autocomplete="off"></label>
      <label class="field grow"><span class="label">Location</span><input id="sch-loc" type="text" autocomplete="off"></label><button class="btn primary" type="submit">Add game</button></form>
      ${upcoming.length ? `<div class="label">Upcoming</div>${upcoming.map(row).join('')}` : '<p class="muted">No upcoming games.</p>'}
      ${played.length ? `<div class="label">Played</div>${played.map(row).join('')}` : ''}</section>`;
  }
  function subscribersPanel() {
    const rows = S.players.flatMap((p) => (p.contacts || []).map((c) => `<div class="sub-row"><span><strong>${esc(c.name || c.email)}</strong> <span class="small muted">${esc(c.relation)} of ${esc(p.name)} · ${esc(c.email)}</span></span><button type="button" class="tog here" data-a="toggle-sub" data-id="${p.id}" data-v="${c.id}" aria-pressed="${c.subscribed}">${c.subscribed ? 'Subscribed' : 'Off'}</button></div>`));
    return `<section class="panel"><div class="panel-head"><h2>Stats subscribers</h2>${S.history.length ? '<button type="button" class="btn small-btn" data-a="send-open">Send latest report</button>' : ''}</div>
      <p class="small muted">Add a player's or parent's email on the player's card. Reports include stats, points, box scores and the schedule. Ratings, tags and playtime targets are never included.</p>
      ${rows.join('') || '<p class="muted">No contacts yet. Tap a player below to add one.</p>'}</section>`;
  }
  function sendSheet() {
    const list = [...new Set(subscribers())], native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    return `<div class="scrim" data-a="send-close" data-self="1"><div class="sheet wide" role="dialog" aria-label="Send report">
      <div class="panel-head"><h2>Send report</h2><button type="button" class="btn small-btn primary" data-a="send-close">Done</button></div>
      <p>${list.length ? `${list.length} ${list.length === 1 ? 'subscriber' : 'subscribers'}. Addresses go in BCC so families don't see each other's email.` : 'No subscribers yet. You can still save the report.'}</p>
      <div class="chips">${native ? `<button type="button" class="btn small-btn primary" data-a="send-email" ${list.length ? '' : 'disabled'}>Open in email</button>` : ''}
      ${downloads ? '<button type="button" class="btn small-btn" data-a="send-save">Save report file</button>' : ''}
      <button type="button" class="btn small-btn" data-a="send-copy" ${list.length ? '' : 'disabled'}>Copy addresses</button></div>
      ${!native ? '<p class="small muted">This preview can\'t open your email app. In the Android app, Open in email starts a message with the report attached and everyone in BCC.</p>' : ''}
      ${reportNote ? `<p class="small" role="status">${esc(reportNote)}</p>` : ''}
      <textarea id="send-list" readonly aria-label="Subscriber addresses" class="send-list">${esc(list.join(', '))}</textarea>
      <div class="label">What families get</div>
      <div class="rp report-preview">${Report.fragment(S)}</div></div></div>`;
  }
  function rosterScreen() {
    const skills = allSkills(), g = S.game;
    return `${teamsPanel()}${gamesPanel()}<section class="panel"><div class="panel-head"><h2>${esc(S.team)} roster</h2><span class="small muted">Tap a number to change it. Tap a name for jersey, tags and playtime.</span></div>
      <form class="form-row" data-form="add"><label class="field grow"><span class="label">Add players (separate names with commas)</span><input id="add-name" type="text" placeholder="Sam, Priya, Theo" autocomplete="off"></label><button class="btn primary" type="submit">Add</button></form>
      ${S.players.length ? `<div class="tbl-scroll"><table><thead><tr><th>Player</th>${g ? '<th>This game</th>' : ''}${skills.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
      ${S.players.map((p) => `<tr><td><button type="button" class="who" data-a="edit" data-id="${p.id}"><span class="who-row">${tile(p, true)}<strong>${esc(p.name)}</strong></span><span>${[p.target !== 'average' ? `${TARGET_LABEL[p.target]} time` : '', `Min ${E.minPointsOf(p)}`, ...p.tags].filter(Boolean).map(esc).join(' · ')}</span></button></td>
      ${g ? `<td><button type="button" class="tog here" data-a="sit" data-id="${p.id}" aria-pressed="${!g.out[p.id]}">${g.out[p.id] ? 'Not here' : 'Here'}</button></td>` : ''}
      ${skills.map(([k, l]) => { const v = E.rate(p, k); return `<td><button type="button" class="rate ${v >= 5 ? 'high' : ''}" style="--lv:${(v - 1) * 2.2}" data-a="cycle" data-id="${p.id}" data-k="${k}" aria-label="${esc(p.name)} ${esc(l)} ${v}">${v}</button></td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No players yet. Add names above.</p>'}</section>${subscribersPanel()}`;
  }
  function editSheet() {
    const p = P(editing); if (!p) return '';
    return `<div class="scrim" data-a="close-sheet" data-self="1"><div class="sheet" role="dialog" aria-label="Edit ${esc(p.name)}">
      <div class="form-row"><label class="field grow"><span class="label">Name</span><input id="edit-name" type="text" data-c="edit-name" value="${esc(p.name)}" autocomplete="off"></label>
      <label class="field jersey"><span class="label">Jersey</span><input id="edit-no" type="text" inputmode="numeric" data-c="edit-no" value="${esc(p.no)}" autocomplete="off"></label><button type="button" class="btn primary" data-a="close-sheet">Done</button></div>
      <div class="field"><span class="label">Gender</span>${seg('set-match', p.match, [['M', 'Male (MMP)'], ['W', 'Female (WMP)']])}</div>
      ${allSkills().map(([k, l]) => `<div class="field"><span class="label">${esc(l)}</span><div class="pips">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-a="set-skill" data-k="${k}" data-v="${v}" aria-pressed="${E.rate(p, k) === v}">${v}</button>`).join('')}</div></div>`).join('')}
      <div class="field"><span class="label">Tags</span><div class="taglist">${S.rules.tags.map((t) => `<button type="button" class="tog" data-a="toggle-tag" data-v="${esc(t)}" aria-pressed="${p.tags.includes(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">Playtime target</span>${seg('set-target', p.target, E.TARGETS.map((t) => [t, TARGET_LABEL[t]]))}</div>
      <div class="rl"><span>Minimum points per game</span>${stepper('set-min', E.minPointsOf(p), 0, 15)}</div>
      <label class="field"><span class="label">Sounds like (for voice)</span><input id="edit-alias" type="text" data-c="edit-alias" value="${esc(p.aliases || '')}" placeholder="Other spellings or nicknames, separated by commas" autocomplete="off"></label>
      <div class="field"><span class="label">Contacts for stats emails</span>
        ${(p.contacts || []).map((c) => `<div class="sub-row"><span><strong>${esc(c.name || c.email)}</strong> <span class="small muted">${esc(c.relation)} · ${esc(c.email)}</span></span><span class="chips"><button type="button" class="tog here" data-a="toggle-sub" data-id="${p.id}" data-v="${c.id}" aria-pressed="${c.subscribed}">${c.subscribed ? 'Subscribed' : 'Off'}</button><button type="button" class="btn small-btn danger" data-a="del-contact" data-v="${c.id}">Remove</button></span></div>`).join('')}
        <form class="form-row" data-form="contact"><label class="field grow"><span class="label">Name</span><input id="c-name" type="text" autocomplete="off"></label><label class="field grow"><span class="label">Email</span><input id="c-email" type="email" autocomplete="off" required></label><label class="field"><span class="label">Who</span><select id="c-rel"><option>Parent</option><option>Player</option></select></label><button class="btn" type="submit">Add</button></form></div>
      <div>${twoTap('del-' + p.id, 'delete-player', 'Remove player', 'Tap again to remove', 'danger')}</div>
    </div></div>`;
  }

  /* ---------- Playtime and stats ---------- */
  const STAT_KEYS = [['touch', 'Touches'], ['goal', 'Goals'], ['assist', 'Assists'], ['turn', 'Turnovers'], ['block', 'Blocks']];
  function statTotals(season) {
    const g = G(), totals = new Map(S.players.map((p) => [p.id, { played: 0, O: 0, D: 0, ms: 0, games: 0, touch: 0, goal: 0, assist: 0, turn: 0, block: 0 }]));
    const add = (id, v) => { const t = totals.get(id); if (!t) return; t.played += v.played || 0; t.O += v.O || 0; t.D += v.D || 0; t.ms += v.ms || 0; if (v.played) t.games += 1; STAT_KEYS.forEach(([k]) => { t[k] += v[k] || 0; }); };
    if (season) S.history.forEach((h) => Object.entries(h.perPlayer).forEach(([id, v]) => add(id, v)));
    if (g) {
      stats().forEach((s, id) => add(id, s));
      if (g.live) g.live.events.forEach((e) => { const t = totals.get(e.id); if (t) t[e.t] += 1; });
    }
    return totals;
  }
  function playtimeScreen() {
    const g = G(), showSeason = seasonView || !g;
    const viewSeg = seg('pt-view', ptView, [['time', 'Playtime'], ['stats', 'Stats'], ['points', 'Points'], ['sheet', 'Scoresheet'], ['combos', 'Combos']]);
    if (ptView === 'points') return pointsScreen(viewSeg);
    if (ptView === 'sheet') return scoresheetScreen(viewSeg);
    if (ptView === 'stats') return statsScreen(viewSeg);
    if (ptView === 'combos') return combosScreen(viewSeg);
    const toggle = `<span class="right">${viewSeg}${seg('season', showSeason ? 'season' : 'game', [...(g ? [['game', 'This game']] : []), ['season', 'Season']])}</span>`;
    let body = '';
    if (showSeason) {
      const totals = statTotals(true);
      const max = Math.max(1, ...[...totals.values()].map((t) => t.played));
      const avg = [...totals.values()].reduce((a, t) => a + t.played, 0) / Math.max(1, totals.size);
      body = `<div class="pt head"><span>Player</span><span>Points (tick is team average, ${avg.toFixed(1)})</span><span class="r">Points</span><span class="r opt">Games</span><span class="r">Min</span><span></span></div>` +
        S.players.slice().sort((a, b) => totals.get(b.id).played - totals.get(a.id).played).map((p) => { const t = totals.get(p.id); return `<div class="pt"><span class="nm">${esc(p.name)}</span><div class="meter"><i style="width:${t.played / max * 100}%"></i><u style="left:${avg / max * 100}%"></u></div><span class="r">${t.played}</span><span class="r opt">${t.games}</span><span class="r">${Math.round(t.ms / E.MIN)}</span><span></span></div>`; }).join('');
      if (!S.history.length && !g) body += '<p class="muted">Finished games add up here.</p>';
    } else {
      const st = stats();
      const max = Math.max(1, ...[...st.values()].flatMap((s) => [s.played, s.target]));
      body = `<div class="pt head"><span>Player</span><span>Points (tick is target)</span><span class="r">Pts / target</span><span class="r opt">O / D</span><span class="r">Time</span><span>Energy</span></div>` +
        S.players.slice().sort((a, b) => (st.get(b.id).target - st.get(b.id).played) - (st.get(a.id).target - st.get(a.id).played)).map((p) => { const s = st.get(p.id), minP = E.minPointsOf(p), under = s.played < minP; return `<div class="pt"><span class="nm"><span class="tx">${esc(p.name)}</span></span><div class="meter" ${tipAttr(`${s.played} played, target ${s.target.toFixed(1)}, minimum ${minP}`)}><i style="width:${s.played / max * 100}%"></i><u style="left:${s.target / max * 100}%"></u></div><span class="r ${under ? 'under' : ''}">${s.played} / ${s.target.toFixed(1)}</span><span class="r opt">${s.O} / ${s.D}</span><span class="r">${clock(s.ms)}</span>${freshPill(s.energy)}</div>`; }).join('');
    }
    return `<section class="panel"><div class="panel-head"><h2>Playtime</h2>${toggle}</div><div>${body}</div></section>${matchPanel(showSeason)}`;
  }

  function gameSources() {
    const g = G();
    const count = (pts, who) => pts.filter((p) => p.result === who).length;
    const dated = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return [...(g ? [{ key: 'current', label: `This game vs ${g.opponent || 'Opponent'}`, opponent: g.opponent, points: g.points }] : []),
      ...S.history.filter((h) => h.points).slice().reverse().map((h) => ({ key: h.id, label: `${dated(h.date)} vs ${h.opponent || 'Opponent'}, ${h.us}–${h.them}`, opponent: h.opponent, points: h.points }))]
      .map((x) => ({ ...x, us: count(x.points, 'us'), them: count(x.points, 'them') }));
  }
  const pickSource = (sources) => sources.find((x) => x.key === pointsSource) || sources[0];
  const sourceSelect = (sources, src) => `<label class="field"><span class="label">Game</span><select id="points-src" data-c="points-src">${sources.map((x) => `<option value="${esc(x.key)}" ${x === src ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>`;
  const viewHead = (title, viewSeg) => `<div class="panel-head"><h2>${title}</h2><span class="right">${viewSeg}</span></div>`;

  function pointsScreen(viewSeg) {
    const sources = gameSources(), src = pickSource(sources), head = viewHead('Points', viewSeg);
    if (!src) return `<section class="panel">${head}<p class="muted">Finished points show up here.</p></section>`;
    let us = 0, them = 0;
    const rows = src.points.map((p, i) => {
      p.result === 'us' ? us++ : them++;
      const name = (id) => (P(id) ? esc(P(id).name) : 'Removed player');
      const chips = p.lineup.filter((id) => P(id)).map((id) => `<span class="sug static">${tile(P(id), true)}<span>${name(id)}</span><span class="tag small muted" ${tipAttr(posName((p.roles || {})[id]))}>${esc(posAbbr((p.roles || {})[id]))}</span></span>`).join('');
      const events = narrativeHtml(p.events);
      const subs = (p.subs || []).map((s) => `${name(s.in)} in for ${name(s.out)}`).join(', ');
      return `<article class="pp"><div class="pp-head"><strong>Point ${i + 1}</strong><span class="chip on${p.on}">${p.on === 'O' ? 'Offense' : 'Defense'}</span><span>${p.result === 'us' ? 'We scored' : 'They scored'}</span><b class="pp-score">${us}–${them}</b><span class="muted small">${clock(p.endedAt - p.startedAt)}</span>${src.key === 'current' ? `<button type="button" class="btn small-btn pp-edit" data-a="edit-point" data-v="${i}">Edit</button>` : ''}</div>
        <div class="sug-chips">${chips}</div>
        ${events ? `<div class="chain">${events}</div>` : ''}${subs ? `<p class="small muted">Subs: ${subs}</p>` : ''}</article>`;
    }).reverse().join('');
    const reopen = src.key !== 'current' ? `<div>${twoTap('reopen-p-' + src.key, 'reopen-game', 'Reopen this game to edit', 'Tap again to reopen', '', `data-id="${src.key}" ${G() ? 'disabled' : ''}`)}${G() ? ' <span class="small muted">Finish the game in progress first.</span>' : ''}</div>` : '';
    return `<section class="panel">${head}${sourceSelect(sources, src)}${reopen}${rows || '<p class="muted">No points played yet.</p>'}</section>`;
  }

  /* Handlers first, then cutters; each split by matchup on a mixed team. */
  function sheetGroups(points) {
    const handlerId = (S.rules.positions.find((p) => p.skill === 'h') || S.rules.positions[0]).id;
    const floor = (S.rules.positions.find((p) => p.skill === 'h') || S.rules.positions[0]).floor;
    const isHandler = (p) => E.rate(p, 'h') >= floor;
    const cutScore = (p) => (E.rate(p, 'c') + E.rate(p, 'h') + E.rate(p, 'd')) / 3;
    const byHandler = (a, b) => E.rate(b, 'h') - E.rate(a, 'h') || E.rate(b, 'c') - E.rate(a, 'c') || a.name.localeCompare(b.name);
    const byCutter = (a, b) => cutScore(b) - cutScore(a) || a.name.localeCompare(b.name);
    const inGroup = (fn, order) => S.players.filter(fn).sort(order);
    return mixed()
      ? [['MMP Handlers', inGroup((p) => isHandler(p) && p.match !== 'W', byHandler)], ['WMP Handlers', inGroup((p) => isHandler(p) && p.match === 'W', byHandler)], ['MMP Cutters', inGroup((p) => !isHandler(p) && p.match !== 'W', byCutter)], ['WMP Cutters', inGroup((p) => !isHandler(p) && p.match === 'W', byCutter)]]
      : [['Handlers', inGroup(isHandler, byHandler)], ['Cutters', inGroup((p) => !isHandler(p), byCutter)]];
  }
  function scoresheetScreen(viewSeg) {
    const sources = gameSources(), src = pickSource(sources), head = viewHead('Scoresheet', viewSeg);
    if (!src) return `<section class="panel landscape">${head}<p class="muted">Finished points show up here.</p></section>`;
    const pts = src.points;
    const durs = pts.map((p) => p.endedAt - p.startedAt).sort((a, b) => a - b);
    const median = durs.length ? durs[Math.floor(durs.length / 2)] : 0;
    const weight = (p) => { const d = p.endedAt - p.startedAt; return d >= median * 1.35 ? 'long' : d <= median * 0.7 ? 'short' : ''; };
    const played = (p) => new Set(p.lineup.concat((p.subs || []).map((x) => x.in)));
    const sets = pts.map(played), weights = pts.map(weight);
    const slash = (cls) => `<svg viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true"><line x1="1" y1="9" x2="9" y2="1" class="sl ${cls}"></line></svg>`;
    const has = (pt, id, t) => (pt.events || []).some((e) => e.id === id && e.t === t);
    const marks = (pt, id) => {
      const top = (has(pt, id, 'assist') ? '<span class="mk mk-a">A</span>' : '') + (has(pt, id, 'goal') ? '<span class="mk mk-g">G</span>' : '');
      const low = (has(pt, id, 'turn') ? '<span class="mk mk-t">T</span>' : '') + (has(pt, id, 'block') ? '<span class="mk mk-d">D</span>' : '');
      return (top ? `<span class="mks tl">${top}</span>` : '') + (low ? `<span class="mks br">${low}</span>` : '');
    };
    let u = 0, t = 0;
    const scores = pts.map((p) => { p.result === 'us' ? u++ : t++; return `${u}-${t}`; });
    const heads = pts.map((p, i) => `<th class="${p.result === 'us' ? 'us' : ''}">${i + 1}</th>`).join('');
    const body = sheetGroups(pts).filter(([, list]) => list.length).map(([label, list]) => `<tr class="ss-group"><th class="ss-name">${label}</th><td colspan="${pts.length}"></td></tr>` + list.map((p) => `<tr><th class="ss-name"><span class="ss-who">${tile(p, true)}<span>${esc(p.name)}</span></span></th>${pts.map((pt, i) => `<td class="${pt.result === 'us' ? 'us' : ''}" aria-label="${sets[i].has(p.id) ? 'Played' : 'Sat'} point ${i + 1}">${sets[i].has(p.id) ? slash(weights[i]) : ''}${marks(pt, p.id)}</td>`).join('')}</tr>`).join('')).join('');
    return `<section class="panel landscape">${head}${sourceSelect(sources, src)}
      <p class="small muted ss-key">${slash('short')} short point ${slash('')} typical ${slash('long')} long point <span class="ss-tint"></span> we scored · <b class="mk mk-a">A</b> assist <b class="mk mk-g">G</b> goal <b class="mk mk-t">T</b> turnover <b class="mk mk-d">D</b> block</p>
      ${pts.length ? `<div class="tbl-wrap"><table class="ss"><thead><tr><th class="ss-name">Point</th>${heads}</tr><tr><th class="ss-name">Started on</th>${pts.map((p) => `<th class="${p.result === 'us' ? 'us' : ''}">${p.on}</th>`).join('')}</tr></thead><tbody>${body}</tbody><tfoot><tr><th class="ss-name">Score</th>${scores.map((s, i) => `<td class="${pts[i].result === 'us' ? 'us' : ''}">${s}</td>`).join('')}</tr></tfoot></table></div>` : '<p class="muted">No points played yet.</p>'}</section>`;
  }
  function statsScreen(viewSeg) {
    const sources = gameSources(), head = viewHead('Stats', viewSeg);
    const season = pointsSource === 'season' || !sources.length;
    const options = `<option value="season" ${season ? 'selected' : ''}>Season</option>`;
    if (season) {
      const totals = statTotals(true);
      return `<section class="panel">${head}<label class="field"><span class="label">Show</span><select id="points-src" data-c="points-src">${options}${sources.map((x) => `<option value="${esc(x.key)}">${esc(x.label)}</option>`).join('')}</select></label><h3>Season</h3>${Report.statTable(S.players, totals, { label: 'Games', value: (p) => totals.get(p.id).games })}<p class="small muted">Points are total (offense/defense).</p></section>`;
    }
    const src = pickSource(sources);
    return `<section class="panel">${head}<label class="field"><span class="label">Show</span><select id="points-src" data-c="points-src">${options}${sources.map((x) => `<option value="${esc(x.key)}" ${x === src ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      <h3>Point flow</h3>${Report.lineScore(src.points, S.team, src.opponent)}<h3>Box score</h3>${Report.boxTable(src.points, S.players)}<p class="small muted">Points are total (offense/defense).</p></section>`;
  }
  function matchPanel(season) {
    const g = G();
    const games = season ? S.history.filter((h) => h.points).concat(g ? [g] : []) : (g ? [g] : []);
    const count = games.reduce((n, x) => n + x.points.length, 0);
    const key = `${S.id}:${season}:${count}`;
    let body;
    if (count < 3) body = '<p class="muted">Play at least three points to compare.</p>';
    else if (!matchResult || matchResult.key !== key) body = `<div><button type="button" class="btn small-btn primary" data-a="run-match">Compare ${count} points</button></div>`;
    else {
      const list = matchResult.list, top = list[0], next = list[1], pct = (x) => Math.round(x * 100);
      const close = top.avg - next.avg < 0.05;
      body = `<p>${close ? `Your calling sits between <strong>${MODE_LABEL[top.mode]}</strong> and <strong>${MODE_LABEL[next.mode]}</strong>.` : `Your calling looks most like <strong>${MODE_LABEL[top.mode]}</strong>.`}</p>
        <div class="match">${list.map((x, i) => `<div class="match-row ${i === 0 ? 'top' : ''}"><span>${MODE_LABEL[x.mode]}</span><div class="meter"><i style="width:${pct(x.avg)}%"></i></div><b>${pct(x.avg)}%</b></div>`).join('')}</div>
        <p class="small muted">The percent of players you called who are also on the line that setting would have suggested at that moment.</p>`;
    }
    return `<section class="panel"><h2>Which style are you calling?</h2>${body}</section>`;
  }
  function combosScreen(viewSeg) {
    const g = G(), season = seasonView || !g;
    const pts = season ? S.history.flatMap((h) => h.points || []).concat(g ? g.points : []) : g.points;
    const head = viewHead('Combos', viewSeg);
    const toggle = seg('season', season ? 'season' : 'game', [...(g ? [['game', 'This game']] : []), ['season', 'Season']]);
    const sizes = comboSize === '4' ? [4, 5, 6, 7] : [Number(comboSize)];
    const list = Report.combos(pts, sizes).slice(0, 40);
    const nameOf = (id) => (P(id) ? P(id).name : 'Removed player');
    const rows = list.map((c) => `<tr><td class="bx-name cb-names">${c.ids.map((id) => esc(nameOf(id))).join(', ')}</td><td>${c.pts}</td><td>${c.scored}–${c.allowed}</td><td><b>${c.net > 0 ? '+' : ''}${c.net}</b></td><td>${c.O ? `${c.Owon}/${c.O}` : '–'}</td><td>${c.D ? `${c.Dwon}/${c.D}` : '–'}</td></tr>`).join('');
    const passes = Report.passes(pts);
    const volume = new Map();
    passes.forEach((row, a) => row.forEach((n, b) => { volume.set(a, (volume.get(a) || 0) + n); volume.set(b, (volume.get(b) || 0) + n); }));
    const ids = [...volume.keys()].filter(P).sort((a, b) => volume.get(b) - volume.get(a));
    const max = Math.max(1, ...ids.flatMap((a) => ids.map((b) => (passes.get(a) && passes.get(a).get(b)) || 0)));
    const short = (id) => P(id).no || P(id).name.slice(0, 3);
    const cell = (a, b) => {
      if (a === b) return '<td class="hm-self"></td>';
      const n = (passes.get(a) && passes.get(a).get(b)) || 0;
      if (!n) return `<td ${tipAttr(`${nameOf(a)} to ${nameOf(b)}: no throws`)}></td>`;
      const level = 0.15 + 0.85 * (n / max);
      const hue = !mixed() ? '' : P(a).match === P(b).match ? (P(a).match === 'W' ? 'ww' : 'mm') : 'xx';
      return `<td ${tipAttr(`${nameOf(a)} to ${nameOf(b)}: ${n}`)}><i class="${hue}" style="opacity:${level.toFixed(2)}"></i><b class="${level > 0.7 ? 'hot' : ''}">${n}</b></td>`;
    };
    const bias = mixed() ? Report.targetBias(pts, S.players).filter((b) => b.throws >= 4 && Math.abs(b.gap) >= 0.15).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, 3) : [];
    const flagged = new Set(bias.map((b) => b.id));
    const pctOf = (x) => Math.round(x * 100);
    const biasNote = !mixed() ? '' : bias.length ? `<div class="warns"><b>Biggest gaps in who they throw to</b>${bias.map((b) => `<span>${esc(nameOf(b.id))}: ${b.toW} of ${b.throws} throws to WMPs (${pctOf(b.share)}%), with ${pctOf(b.expected)}% of teammates on the field being WMPs.</span>`).join('')}</div>` : '<p class="small muted">No one stands out yet. A player needs at least 4 logged throws to be compared.</p>';
    const hmLegend = mixed() ? '<p class="small muted hm-key"><i class="ww"></i> WMP to WMP <i class="mm"></i> MMP to MMP <i class="xx"></i> Cross-matchup</p>' : '';
    const rowTotal = (a) => [...(passes.get(a) || new Map()).values()].reduce((x, y) => x + y, 0);
    const matrix = ids.length ? `<div class="tbl-wrap"><table class="hm"><thead><tr><th class="hm-name">Thrower ↓ / Receiver →</th>${ids.map((id) => `<th ${tipAttr(nameOf(id))}>${esc(short(id))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ids.map((a) => `<tr class="${flagged.has(a) ? 'flagged' : ''}"><th class="hm-name">${esc(nameOf(a))}</th>${ids.map((b) => cell(a, b)).join('')}<td class="hm-total">${rowTotal(a)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Log touches during a point and throws show up here.</p>';
    return `<section class="panel">${head}
      <div class="chips">${toggle}${seg('combo-size', comboSize, [['2', 'Pairs'], ['3', 'Trios'], ['4', '4 or more']])}</div>
      <p class="small muted">Groups that started more than one point together. Offense is scored on O points; Defense is breaks on D points.</p>
      ${rows ? `<div class="tbl-wrap"><table class="bx"><thead><tr><th class="bx-name">Players</th><th>Points</th><th>Won–lost</th><th>+/–</th><th>Offense</th><th>Defense</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No group has played more than one point together yet.</p>'}
      <h3>Who threw to whom</h3><p class="small muted">Darker boxes mean more throws. Tap a box for names.</p>${hmLegend}${matrix}${biasNote}</section>`;
  }

  /* ---------- Players ---------- */
  function playersScreen() {
    if (!S.players.length) return '<section class="panel"><h2>Players</h2><p class="muted">Add players under Teams and they show up here.</p></section>';
    const totals = statTotals(true);
    const num = (p) => { const n = parseInt(p.no, 10); return Number.isNaN(n) ? 9999 : n; };
    const rows = S.players.slice().sort((a, b) => num(a) - num(b) || a.name.localeCompare(b.name)).map((p) => {
      const t = totals.get(p.id);
      return `<button type="button" class="player-row" data-a="open-player" data-id="${p.id}">${tile(p)}<span class="nm"><span class="tx">${nameTag(p)}</span></span><span class="small muted">${t.games} ${t.games === 1 ? 'game' : 'games'} · ${t.played} pts · ${t.goal} G · ${t.assist} A · ${t.block} D · ${t.turn} T</span></button>`;
    }).join('');
    return `<section class="panel"><h2>Players</h2><div class="player-list">${rows}</div></section>`;
  }
  function playerProfile(p) {
    const g = G(), count = (pts, who) => pts.filter((x) => x.result === who).length;
    const dated = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const zero = { played: 0, O: 0, D: 0, touch: 0, goal: 0, assist: 0, turn: 0, block: 0 };
    const games = [
      ...(g ? [{ key: 'current', label: `${dated(g.startedAt)} vs ${g.opponent || 'Opponent'}`, note: 'In progress', us: count(g.points, 'us'), them: count(g.points, 'them'), t: Report.totals(g.points).get(p.id) || zero, points: g.points }] : []),
      ...S.history.slice().reverse().map((h) => ({ key: h.id, label: `${dated(h.date)} vs ${h.opponent || 'Opponent'}`, note: '', us: h.us, them: h.them, t: { ...zero, ...(h.perPlayer[p.id] || {}) }, points: h.points || [] })),
    ].filter((x) => x.t.played > 0);
    const all = games.flatMap((x) => x.points);
    const sum = { ...zero };
    games.forEach((x) => Object.keys(zero).forEach((k) => { sum[k] += x.t[k] || 0; }));
    const rec = Report.playerSummary(all, p.id);
    const net = rec.plus - rec.minus;
    const figures = [['Games', games.length], ['Points', `${sum.played} (${sum.O}/${sum.D})`], ['+/–', `${net > 0 ? '+' : ''}${net}`], ['Touches', sum.touch], ['Goals', sum.goal], ['Assists', sum.assist], ['Turns', sum.turn], ['Blocks', sum.block], ['O points scored', rec.O ? `${rec.Owon}/${rec.O}` : '–'], ['Breaks on D', rec.D ? `${rec.Dwon}/${rec.D}` : '–']];
    const partner = (list) => list.slice(0, 5).map(([id, n]) => (P(id) ? `<span class="sug static">${tile(P(id), true)}<span>${esc(P(id).name)}</span><b>${n}</b></span>` : '')).join('') || '<span class="muted small">None logged yet.</span>';
    const cols = ['touch', 'goal', 'assist', 'turn', 'block'];
    const gameRows = games.map((x) => `<tr><td class="bx-name"><button type="button" class="linkish" data-a="open-game-stats" data-v="${esc(x.key)}">${esc(x.label)}</button>${x.note ? ` <span class="small muted">${x.note}</span>` : ''}</td><td>${x.us}–${x.them}</td><td>${x.t.played} (${x.t.O}/${x.t.D})</td>${cols.map((k) => `<td>${x.t[k] || 0}</td>`).join('')}</tr>`).join('');
    const pointBlocks = games.filter((x) => x.points.length).map((x, gi) => {
      let us = 0, them = 0;
      const rows = x.points.map((pt, i) => {
        pt.result === 'us' ? us++ : them++;
        const on = pt.lineup.includes(p.id) || (pt.subs || []).some((s) => s.in === p.id);
        if (!on) return '';
        const mine = (pt.events || []).filter((e) => e.id === p.id && e.t !== 'touch').map((e) => evChip(e)).join(' ');
        const touches = (pt.events || []).filter((e) => e.id === p.id && e.t === 'touch').length;
        return `<div class="pp-row"><strong>Point ${i + 1}</strong><span>${pt.on === 'O' ? 'Offense' : 'Defense'}</span><span class="muted">${esc(posName((pt.roles || {})[p.id]))}</span><span>${pt.result === 'us' ? 'Won' : 'Lost'} ${us}–${them}</span><span class="muted">${clock(pt.endedAt - pt.startedAt)}</span><span class="muted">${touches} ${touches === 1 ? 'touch' : 'touches'}</span>${mine}</div>`;
      }).join('');
      return `<details ${gi === 0 ? 'open' : ''}><summary>${esc(x.label)} · ${x.t.played} points</summary>${rows}</details>`;
    }).join('');
    return `<section class="panel">
      <div class="panel-head"><h2>${nameTag(p)}</h2><span class="right"><button type="button" class="btn small-btn" data-a="edit" data-id="${p.id}">Edit player</button><button type="button" class="btn small-btn primary" data-a="close-player">All players</button></span></div>
      <p class="small muted">${allSkills().map(([k, l]) => `${esc(l)} ${E.rate(p, k)}`).join(' · ')}${p.tags.length ? ' · ' + esc(p.tags.join(', ')) : ''} · ${TARGET_LABEL[p.target]} playtime · Minimum ${E.minPointsOf(p)}</p>
      <div class="figures">${figures.map(([l, v]) => `<div class="figure"><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
      <h3>Games</h3>
      ${games.length ? `<div class="tbl-wrap"><table class="bx bx-box"><thead><tr><th class="bx-name">Game</th><th>Final</th><th>Points</th><th>Touches</th><th>Goals</th><th>Assists</th><th>Turns</th><th>Blocks</th></tr></thead><tbody>${gameRows}</tbody></table></div>` : '<p class="muted">No games yet.</p>'}
      <div class="partners"><div><h3>Throws most to</h3><div class="sug-chips">${partner(rec.throwsTo)}</div></div><div><h3>Catches most from</h3><div class="sug-chips">${partner(rec.catchesFrom)}</div></div></div>
      <h3>Points played</h3>${pointBlocks || '<p class="muted">No point details saved.</p>'}
    </section>`;
  }

  /* ---------- Rules ---------- */
  function positionsPanel() {
    const r = S.rules;
    const skillOpts = (p) => BASE_SKILLS.slice(0, 3).concat([['own', 'Its own rating']]).map(([k, l]) => `<option value="${k}" ${(k === 'own' ? !BASE_SKILLS.some(([x]) => x === p.skill) : p.skill === k) ? 'selected' : ''}>${l}</option>`).join('');
    const limit = (p, i, on, title) => `<div class="rl"><span>${title}</span>${stepper('pos-limit', p[on].min, 0, r.size, `data-i="${i}" data-on="${on}"`)}</div>`;
    const over = (on, label) => { const lo = r.positions.reduce((a, p) => a + p[on].min, 0); return lo > r.size ? `<span class="bad-text">${label} minimums add to ${lo}, but only ${r.size} players fit. Lower one.</span>` : ''; };
    return `<section class="panel span-all"><h2>Positions</h2><p class="small muted">Set the fewest of each position you'll accept on a line. They don't need to add up to the full line. Leave a position at 0 for no requirement.</p>
      <div class="pos-grid">${r.positions.map((p, i) => `<div class="pos">
        <div class="form-row"><label class="field grow"><span class="label">Name</span><input id="pos-name-${p.id}" type="text" data-c="pos-name" data-i="${i}" value="${esc(p.name)}" autocomplete="off"></label>
        <label class="field grow"><span class="label">Rated on</span><select id="pos-skill-${p.id}" data-c="pos-skill" data-i="${i}">${skillOpts(p)}</select></label></div>
        ${limit(p, i, 'O', 'Minimum on offense points')}${limit(p, i, 'D', 'Minimum on defense points')}
        <div class="rl"><span>Lowest rating allowed</span>${stepper('pos-floor', p.floor, 1, 5, `data-i="${i}"`)}</div>
        ${r.positions.length > 1 ? `<div>${twoTap('delpos-' + p.id, 'del-pos', 'Remove position', 'Tap again to remove', 'danger', `data-i="${i}"`)}</div>` : ''}
      </div>`).join('')}</div>
      <div class="totals small">${over('O', 'Offense')}${over('D', 'Defense')}</div>
      ${r.positions.length < E.MAX_POSITIONS ? `<form class="form-row" data-form="pos"><label class="field grow"><span class="label">New position</span><input id="new-pos" type="text" placeholder="Deep" autocomplete="off"></label><button class="btn primary" type="submit">Add position</button></form>` : `<p class="small muted">${E.MAX_POSITIONS} positions is the limit.</p>`}
    </section>`;
  }
  function rulesScreen() {
    const r = S.rules;
    return `<div class="rules">
      <section class="panel"><h2>Game</h2>
        <div class="rl"><span>Players on the field</span>${stepper('rule', r.size, 4, 7, 'data-k="size"')}</div>
        <div class="rl"><span>Halftime at</span>${stepper('rule', r.halfAt, 1, 25, 'data-k="halfAt"')}</div>
        <div class="rl"><span>Game to</span>${stepper('rule', r.gameTo, 1, 25, 'data-k="gameTo"')}</div>
        <div class="rl"><span>Division</span>${seg('division', r.division, [['open', 'Single'], ['mixed', 'Mixed']])}</div>
        ${r.division === 'mixed' ? `<div class="rl"><span>Gender ratio</span>${seg('ratio-mode', r.ratioMode, [['abba', 'ABBA'], ['fixed', 'Fixed']])}</div>
        <div class="rl"><span>${r.ratioMode === 'abba' ? 'First point has more' : 'Extra player is'}</span>${seg('ratio-start', r.ratioStart, [['W', 'Women'], ['M', 'Men']])}</div>` : ''}
        <h3>Playing time</h3>
        <div class="rl"><span>Points anyone can fall behind target</span>${stepper('rule', r.tolerance, 1, 6, 'data-k="tolerance"')}</div>
        <div class="rl"><span>Points in a row before a rest</span>${stepper('rule', r.maxStreak, 1, 6, 'data-k="maxStreak"')}</div>
      </section>
      <section class="panel"><h2>Tag rules</h2>
        ${r.tagRules.map((t, i) => `<div class="tr"><div class="tr-top"><strong>${esc(t.tag)}</strong><button type="button" class="chip" data-a="tagrule-when" data-i="${i}">${t.when === 'all' ? 'Every point' : t.when === 'D' ? 'Defense points' : 'Offense points'} ⇄</button></div><div class="tr-steps"><span class="tr-step"><span class="small muted">At least</span>${stepper('tagrule', t.min || 0, 0, r.size, `data-i="${i}" data-k="min"`)}</span><span class="tr-step"><span class="small muted">At most</span>${stepper('tagrule', t.max === null ? r.size : t.max, 0, r.size, `data-i="${i}" data-k="max"`, t.max === null ? 'Any' : t.max)}</span></div></div>`).join('')}
        <form class="form-row" data-form="tag"><label class="field grow"><span class="label">New tag</span><input id="new-tag" type="text" placeholder="Zone thrower" autocomplete="off"></label><button class="btn" type="submit">Add tag</button></form>
        <div class="taglist">${r.tags.map((t) => `<span class="chip">${esc(t)}<button type="button" data-a="del-tag" data-v="${esc(t)}" aria-label="Remove ${esc(t)}">✕</button></span>`).join('')}</div>
      </section>
      ${positionsPanel()}
      <section class="panel"><h2>Backup</h2><p class="small muted">Copy this to your notes before you switch devices or reinstall.</p>
        <div class="chips"><button type="button" class="btn small-btn" data-a="backup">Copy backup</button><button type="button" class="btn small-btn" data-a="restore">Restore from text below</button></div>
        <textarea id="backup" aria-label="Backup text" data-c="backup-text" placeholder="Paste a backup here to restore it">${esc(backupText)}</textarea>
        ${notice ? `<p class="small" role="status">${esc(notice)}</p>` : ''}
      </section></div>`;
  }

  /* ---------- Render ---------- */
  function menuView() {
    if (!menu || !P(menu.id)) return '';
    return `<div class="menu-scrim" data-a="menu-close" data-self="1"><div class="menu" id="stat-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu" aria-label="${esc(P(menu.id).name)}"><div class="label">${esc(P(menu.id).name)}</div>
      ${Object.entries(STAT_LABEL).map(([t, l]) => `<button type="button" data-a="stat" data-v="${t}" role="menuitem">${l}</button>`).join('')}
      ${editIdx === null ? '<button type="button" data-a="menu-sub" role="menuitem">Sub out</button>' : ''}</div></div>`;
  }
  function settingsSheet() {
    const cur = Root.theme || 'system';
    return `<div class="scrim" data-a="settings-close" data-self="1"><div class="sheet" role="dialog" aria-label="Settings">
      <div class="panel-head"><h2>Settings</h2><button type="button" class="btn small-btn primary" data-a="settings-close">Done</button></div>
      <div class="label">Color scheme</div>
      <div class="schemes">${SCHEMES.map(([k, l, d]) => `<button type="button" class="scheme" data-a="set-scheme" data-v="${k}" aria-pressed="${cur === k}" data-preview="${k}"><span class="swatch"><i></i><i></i><i></i></span><strong>${l}</strong><span class="small muted">${d}</span></button>`).join('')}</div>
      <div class="label">Voice listens for</div>
      <div>${seg('voice-mode', Root.voiceMode || 'focused', [['focused', 'My roster'], ['any', 'Any words']])}</div>
      <p class="small muted">My roster is more accurate because it only listens for your players and ultimate words. If a name isn't being heard, it may be spelled in a way the recognizer doesn't know. Add a common spelling under that player's "Sounds like", or try Any words.</p>
    </div></div>`;
  }
  function applyScheme() { const t = Root.theme || 'system'; if (t === 'system') delete document.documentElement.dataset.scheme; else document.documentElement.dataset.scheme = t; }
  function render() {
    applyScheme();
    const active = document.activeElement && document.activeElement.id;
    const caret = active && document.activeElement.selectionStart;
    const g = S.game;
    let view;
    if (tab === 'game') view = !g ? setupScreen() : editIdx !== null && g.points[editIdx] ? pointEditor() : g.live ? liveScreen() : draftScreen();
    else if (tab === 'roster') view = rosterScreen();
    else if (tab === 'players') view = playerOpen && P(playerOpen) ? playerProfile(P(playerOpen)) : playersScreen();
    else if (tab === 'time') view = (g || S.history.length) ? playtimeScreen() : '<section class="panel"><h2>Playtime</h2><p class="muted">Start a game and each player\'s points and minutes show up here.</p></section>';
    else view = rulesScreen();
    const tabs = [['game', 'Game'], ['roster', 'Teams'], ['players', 'Players'], ['time', 'Playtime'], ['rules', 'Rules']];
    root.innerHTML = `<div class="wrap">
      <header class="bar"><h1 class="brand">Line Caller</h1><button type="button" class="team-now" data-a="tab" data-v="roster">${esc(S.team)}</button><nav class="tabs">${tabs.map(([k, l]) => `<button type="button" class="tab" data-a="tab" data-v="${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}<button type="button" class="tab" data-a="settings-open">Settings</button></nav></header>
      ${S.isExample ? `<div class="banner"><span>You're looking at an example team. The players and ratings are made up.</span>${twoTap('clear', 'clear-example', 'Clear it and add my team', 'Tap again to clear')}</div>` : ''}
      ${view}</div>${editing ? editSheet() : ''}${sendFor ? sendSheet() : ''}${settingsOpen ? settingsSheet() : ''}${menuView()}`;
    if (active) { const el = document.getElementById(active); if (el) { el.focus(); if (caret !== null && caret !== undefined && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ } } }
    const m = document.getElementById('stat-menu');
    if (m) { const b = m.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(window.innerWidth - b.width - 8, b.left)) + 'px'; m.style.top = Math.max(8, Math.min(window.innerHeight - b.height - 8, b.top)) + 'px'; }
    wake();
  }

  /* Keep the screen on during a point. */
  let lock = null;
  async function wake() {
    const want = S.game && S.game.live;
    try {
      if (want && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!want && lock) { await lock.release(); lock = null; }
    } catch (e) { /* the screen may sleep; timing still works */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
  setInterval(() => { const el = document.getElementById('timer'); if (el && S.game && S.game.live) el.textContent = clock(liveElapsed()); }, 500);

  /* ---------- Tooltips ---------- */
  const tipEl = document.createElement('div');
  tipEl.id = 'tip'; tipEl.hidden = true; tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);
  let tipTimer = null, tipPinned = false;
  function showTip(target, ms) {
    tipEl.textContent = target.dataset.tip;
    tipEl.hidden = false;
    const r = target.getBoundingClientRect(), b = tipEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2));
    const top = r.top - b.height - 8 >= 8 ? r.top - b.height - 8 : r.bottom + 8;
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
    clearTimeout(tipTimer);
    if (ms) tipTimer = setTimeout(hideTip, ms);
  }
  function hideTip() { tipEl.hidden = true; tipPinned = false; clearTimeout(tipTimer); }
  root.addEventListener('mouseover', (ev) => { const t = ev.target.closest('[data-tip]'); if (t && !tipPinned) showTip(t); });
  root.addEventListener('mouseout', (ev) => { if (ev.target.closest('[data-tip]') && !tipPinned) hideTip(); });

  /* ---------- Line building ---------- */
  function place(id, pos) { const line = G().draft.line; delete line[id]; line[id] = pos; }
  function dropPlayer(id, pos, targetId) {
    const g = G(), line = g.draft.line, onLine = !!line[id];
    if (targetId && targetId !== id && line[targetId]) {
      commit(() => {
        const tp = line[targetId];
        if (onLine) { const mine = line[id]; line[id] = tp; line[targetId] = mine; } else { delete line[targetId]; place(id, tp); }
      });
      return;
    }
    if (pos === 'bench') { if (onLine) commit(() => { delete line[id]; }); return; }
    if (!pos || !POS(pos)) return;
    if (onLine) { if (line[id] !== pos) commit(() => { line[id] = pos; }); return; }
    if (placedIds().length < targetSize()) commit(() => place(id, pos));
    else flash('The line is full. Drop on a player to replace them.');
  }
  function flash(msg) {
    tipEl.textContent = msg; tipEl.hidden = false;
    tipEl.style.left = Math.max(8, window.innerWidth / 2 - tipEl.getBoundingClientRect().width / 2) + 'px';
    tipEl.style.top = '72px';
    clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 2500);
  }
  function addStats(list) {
    const at = Date.now(), pt = activePt();
    pt.events = pt.events || [];
    list.forEach((ev) => E.addEvent(pt.events, ev, at));
  }
  function fixPlayer(out, inn) {
    const pt = activePt();
    commit(() => {
      if (pt.lineup.includes(out)) pt.lineup = pt.lineup.map((x) => (x === out ? inn : x));
      else (pt.subs || []).forEach((s) => { if (s.in === out) s.in = inn; });
      pt.roles = pt.roles || {};
      pt.roles[inn] = pt.roles[out]; delete pt.roles[out];
      sel = null;
    });
  }
  function subLive(out, inn) {
    if (fixLine) { fixPlayer(out, inn); return; }
    const g = G();
    commit(() => { g.live.subs = g.live.subs || []; g.live.subs.push({ out, in: inn, at: Date.now() }); g.live.roles[inn] = g.live.roles[out]; sel = null; });
  }

  /* ---------- Speech ---------- */
  const Speech = (() => {
    let want = false, rec = null, base = '', cur = '', cb = null, plug = null;
    const NOMIC = "The microphone isn't available here. Type in the box, or tap the mic on your keyboard.";
    const join = (a, b) => [a, b].filter(Boolean).join(' ');
    const emit = () => cb.onText(join(base, cur));
    const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const tidy = (s) => (s || '').replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim();
    async function startNative() {
      if (!plug) plug = window.Capacitor.registerPlugin('OfflineSpeech');
      await plug.removeAllListeners();
      await plug.addListener('partial', (d) => { cur = tidy(d.text); if (cb.onPhrase) cb.onText(cur); else emit(); });
      await plug.addListener('phrase', (d) => {
        const t = tidy(d.text); cur = '';
        if (!t) { if (cb.onPhrase) cb.onText(''); return; }
        if (cb.onPhrase) cb.onPhrase(t); else { base = join(base, t); emit(); }
      });
      await plug.addListener('error', () => { want = false; cb.onError("The microphone stopped. Tap to start it again."); });
      if (cb.onStatus) cb.onStatus('Getting the microphone ready…');
      try {
        await plug.start(cb.words ? { words: cb.words } : {});
        if (cb.onStatus) cb.onStatus(cb.onPhrase ? 'Listening. Just talk.' : 'Listening…');
      } catch (e) {
        want = false;
        cb.onError(e && e.code === 'denied' ? 'Line Caller needs microphone permission. You can turn it on in Android settings.' : NOMIC);
      }
    }
    function startWeb() {
      const C = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!C) { want = false; cb.onError(NOMIC); return; }
      rec = new C();
      rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
      rec.onresult = (e) => {
        if (cb.onPhrase) {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) cb.onPhrase(e.results[i][0].transcript); else interim += e.results[i][0].transcript; }
          cur = interim; cb.onText(cur); return;
        }
        cur = Array.from(e.results).map((r) => r[0].transcript).join(' '); emit();
      };
      rec.onerror = (e) => { if (e.error === 'no-speech') return; want = false; cb.onError(NOMIC); };
      rec.onend = () => { if (!cb.onPhrase) { base = join(base, cur); } cur = ''; if (want) { try { rec.start(); } catch (e) { /* already running */ } } else cb.onStop(); };
      try { rec.start(); } catch (e) { want = false; cb.onError(NOMIC); }
    }
    return {
      start(initial, handlers) { cb = handlers; base = initial; cur = ''; want = true; if (isNative()) startNative().catch(() => { want = false; cb.onError(NOMIC); }); else startWeb(); },
      stop() { want = false; if (isNative()) { if (plug) plug.stop().catch(() => {}); cb.onStop(); } else if (rec) { try { rec.stop(); } catch (e) { cb.onStop(); } } },
      cancel() { if (want) this.stop(); },
    };
  })();
  function refreshVoice() {
    const p = document.getElementById('voice-preview'); if (p) p.innerHTML = voicePreview();
  }
  function applyLine(r) {
    const d = G().draft;
    if (r.clear) d.line = {};
    if (r.assign.length >= targetSize()) d.line = {};
    r.swaps.forEach((s) => { const pos = d.line[s.out]; delete d.line[s.out]; place(s.in, pos || bestPosIn(s.in)); });
    r.remove.forEach((id) => { delete d.line[id]; });
    r.assign.forEach((x) => {
      if (!d.line[x.id] && Object.keys(d.line).length >= targetSize()) return;
      memo = null; place(x.id, x.pos || d.line[x.id] || bestPos(x.id));
    });
    memo = null;
    if (r.useSuggestion) { const s = suggestion(); if (s) s.ids.forEach((id) => { if (!d.line[id]) d.line[id] = s.roles[id]; }); }
  }
  function heard(text) {
    const g = G();
    if (!g || editIdx !== null || !text.trim()) return;
    if (voice) { voice.last = text; voice.text = ''; }
    if (!g.live) {
      const r = E.parseLine(text, voicePlayers(), S.rules.positions, { pos: voice && voice.linePos });
      if (voice) voice.linePos = r.lastPos || voice.linePos;
      if (r.assign.length || r.swaps.length || r.remove.length || r.clear || r.useSuggestion) commit(() => applyLine(r)); else render();
      return;
    }
    const chain = E.chainOf(g.live.events).filter((e) => e.t === 'touch');
    const holder = chain.length ? chain[chain.length - 1].id : undefined;
    const r = parseLive(text, { holder });
    const events = r.events.filter((e) => !e.seed);
    if (r.hasGoal && !r.events.some((e) => e.t === 'goal') && holder) events.push({ t: 'goal', id: holder });
    const ending = !g.live.review;
    if (r.hasGoal && ending) { addStats(events); A.result({ v: 'us' }); return; }
    if (r.theyScored && ending) { addStats(events); A.result({ v: 'them' }); return; }
    if (events.length) commitLight(() => addStats(events)); else render();
  }
  const speechWords = () => (Root.voiceMode === 'any' ? undefined : E.speechVocabulary(S.players, S.rules.positions));
  function startOpenMic() {
    voice = { kind: G().live ? 'play' : 'line', text: '', listening: true, open: true, status: 'Listening. Just talk.', last: '' };
    render();
    Speech.start('', {
      words: speechWords(),
      onStatus(m) { if (voice) { voice.status = m; const el = document.getElementById('voice-status'); if (el) el.textContent = m; } },
      onPhrase(t) { heard(t); },
      onText(t) { if (!voice) return; voice.text = t; const box = document.getElementById('voice-text'); if (box) box.value = t; },
      onStop() { if (!voice) return; voice.listening = false; render(); },
      onError(msg) { if (!voice) return; voice.listening = false; voice.status = `${msg} Press Enter after each phrase to add it.`; render(); },
    });
  }
  function stopVoice() { if (voice && voice.listening) Speech.cancel(); }

  /* ---------- Actions ---------- */
  function resume(l) { if (!l.pausedAt) return; const d = Date.now() - l.pausedAt; l.startedAt += d; (l.subs || []).forEach((s) => { s.at += d; }); delete l.pausedAt; }
  const A = {
    tab(d) { stopVoice(); uiChange(() => { tab = d.v; sel = null; voice = null; menu = null; editIdx = null; fixLine = false; }); },
    confirm(d, el) {
      if (confirmKey === d.key) { clearTimeout(confirmTimer); confirmKey = null; A[d.then](d, el); return; }
      confirmKey = d.key; render(); clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { confirmKey = null; render(); }, 3000);
    },
    'clear-example'() { commit(() => { const fresh = blank(); Root.teams[Root.teams.indexOf(S)] = fresh; Root.active = fresh.id; S = fresh; tab = 'roster'; editing = null; sel = null; }); },
    'switch-team'(d) { stopVoice(); editIdx = null; playerOpen = null; commit(() => { Root.active = d.v; S = activeTeam(); sel = null; voice = null; editing = null; pointsSource = 'current'; }); },
    'delete-team'() { commit(() => { Root.teams = Root.teams.filter((t) => t !== S); Root.active = Root.teams[0].id; S = activeTeam(); sel = null; voice = null; }); },
    'clear-sel'() { uiChange(() => { sel = null; }); },
    'tap-bench'(d) {
      const g = G(), line = g.draft.line, id = d.id;
      if (sel && line[sel]) { const out = sel; commit(() => { const pos = line[out]; delete line[out]; place(id, pos); sel = null; }); return; }
      if (sel === id) return uiChange(() => { sel = null; });
      if (placedIds().length < targetSize()) { commit(() => { place(id, bestPos(id)); sel = null; }); return; }
      uiChange(() => { sel = id; });
    },
    'tap-line'(d) {
      const g = G(), line = g.draft.line, id = d.id;
      if (!sel) return uiChange(() => { sel = id; });
      if (sel === id) return uiChange(() => { sel = null; });
      const other = sel;
      if (line[other]) { commit(() => { const a = line[other]; line[other] = line[id]; line[id] = a; sel = null; }); return; }
      commit(() => { const pos = line[id]; delete line[id]; place(other, pos); sel = null; });
    },
    'remove-line'(d) { commit(() => { delete G().draft.line[d.id]; sel = null; }); },
    'clear-line'() { commit(() => { G().draft.line = {}; sel = null; }); },
    'fill-pos'(d) {
      const g = G(), avail = S.players.filter((p) => !g.out[p.id] && !g.draft.line[p.id]);
      if (!sel || g.draft.line[sel]) {
        if (sel && g.draft.line[sel]) { const id = sel; return commit(() => { g.draft.line[id] = d.v; sel = null; }); }
        return flash('Tap a bench player to add them, or drag one here.');
      }
      if (avail.some((p) => p.id === sel)) { const id = sel; commit(() => { place(id, d.v); sel = null; }); }
    },
    sit(d) { if (G().live && liveOnField().includes(d.id)) { flash('Sub them out first.'); return; } commit(() => { const g = G(); if (g.out[d.id]) delete g.out[d.id]; else { g.out[d.id] = true; delete g.draft.line[d.id]; } g.draft.alt = 0; sel = null; }); },
    alt() { commit(() => { const d = G().draft; d.alt = (Math.min(d.alt, options().length - 1) + 1) % options().length; sel = null; }); },
    'use-sug'() { const s = suggestion(); if (s) commit(() => { const line = G().draft.line; s.ids.forEach((id) => { if (!line[id]) line[id] = s.roles[id]; }); sel = null; }); },
    'add-sug'(d) {
      const g = G(), line = g.draft.line;
      if (line[d.id]) return commit(() => { delete line[d.id]; });
      if (placedIds().length >= targetSize()) return flash('The line is full.');
      commit(() => place(d.id, d.v));
    },
    mode(d) { commit(() => { G().mode = d.v; G().draft.alt = 0; G().draft.plan = null; }); },
    'flip-on'() { commit(() => { const d = G().draft; d.on = ctx().on === 'O' ? 'D' : 'O'; d.alt = 0; d.plan = null; d.line = {}; }); },
    'flip-ratio'() { commit(() => { const d = G().draft; d.ratio = ctx().ratio === 'W' ? 'M' : 'W'; d.alt = 0; d.plan = null; }); },
    'start-point'() {
      const c = ctx(), g = G(), line = { ...g.draft.line };
      stopVoice();
      commit(() => { g.live = { lineup: Object.keys(line), roles: line, on: c.on, ratio: c.ratio, startedAt: Date.now(), avail: S.players.filter((p) => !g.out[p.id]).map((p) => p.id), subs: [], events: [] }; sel = null; voice = null; });
      if (openMic) startOpenMic();
    },
    'cancel-point'() { stopVoice(); commit(() => { G().live = null; sel = null; voice = null; }); },
    result(d) {
      const g = G(), l = g.live;
      if (l.review) return;
      commit(() => {
        if (!l.pausedAt) l.pausedAt = Date.now();
        l.review = { result: d.v };
        if (d.v === 'them') E.addEvent(l.events, { t: 'oppgoal' }, Date.now());
        sel = null;
      });
    },
    finalize() {
      const g = G(), l = g.live, pv = getPreviews()[l.review.result];
      stopVoice();
      commit(() => {
        const { pausedAt, review, ...finished } = l;
        g.points.push({ ...finished, endedAt: pausedAt, result: review.result });
        g.live = null; sel = null; voice = null; fixLine = false;
        g.draft = newDraft(pv.line ? { ids: pv.line.ids, on: pv.ctx.on } : null);
      });
      if (openMic) startOpenMic();
    },
    'keep-playing'() {
      const l = G().live;
      commit(() => {
        delete l.review;
        const last = l.events[l.events.length - 1];
        if (last && (last.t === 'goal' || last.t === 'oppgoal')) { const at = last.at; while (l.events.length && l.events[l.events.length - 1].at === at) l.events.pop(); }
        resume(l);
      });
    },
    'fix-line'() { uiChange(() => { fixLine = !fixLine; sel = null; }); },
    'fix-with'(d) { uiChange(() => { fixLine = true; sel = d.id; }); },
    undo() { editIdx = null; commit(() => { const g = G(), p = g.points.pop(); const { endedAt, result, ...live } = p; live.events = live.events || []; live.pausedAt = endedAt;
      const last = live.events[live.events.length - 1];
      if (last && (last.t === 'goal' || last.t === 'oppgoal')) { const at = last.at; while (live.events.length && live.events[live.events.length - 1].at === at) live.events.pop(); } g.live = live; g.draft = newDraft(); }); },
    'undo-stat'() { (editIdx !== null ? commit : commitLight)(() => { const ev = activePt().events; const at = ev[ev.length - 1].at; while (ev.length && ev[ev.length - 1].at === at) ev.pop(); }); },
    'tap-field'(d) {
      if (fixLine && !sel) return uiChange(() => { sel = d.id; });
      if (sel) {
        if (sel === d.id) return uiChange(() => { sel = null; });
        if (!liveOnField().includes(sel)) return subLive(d.id, sel);
        return uiChange(() => { sel = d.id; });
      }
      (editIdx !== null ? commit : commitLight)(() => addStats([{ t: 'touch', id: d.id }]));
    },
    'tap-bench-live'(d) {
      if (sel && liveOnField().includes(sel)) return subLive(sel, d.id);
      uiChange(() => { sel = sel === d.id ? null : d.id; });
    },
    'menu-close'() { uiChange(() => { menu = null; }); },
    stat(d) { const id = menu.id; menu = null; if (d.v === 'goal' && editIdx === null && !G().live.review) { addStats([{ t: 'goal', id }]); A.result({ v: 'us' }); return; } (editIdx !== null ? commit : commitLight)(() => addStats([{ t: d.v, id }])); },
    'opp-turn'() { (editIdx !== null ? commit : commitLight)(() => addStats([{ t: 'oppturn' }])); },
    pause() { const l = G().live; commitLight(() => { if (l.pausedAt) resume(l); else l.pausedAt = Date.now(); }); },
    'edit-prev'() { stopVoice(); uiChange(() => { editIdx = G().points.length - 1; sel = null; voice = null; }); },
    'edit-point'(d) { uiChange(() => { editIdx = Number(d.v); tab = 'game'; sel = null; voice = null; }); },
    'edit-step'(d) { stopVoice(); uiChange(() => { editIdx += Number(d.d); voice = null; fixLine = false; sel = null; }); },
    'edit-done'() { stopVoice(); uiChange(() => { editIdx = null; voice = null; fixLine = false; sel = null; }); },
    'pt-view-all'() { stopVoice(); uiChange(() => { editIdx = null; voice = null; tab = 'time'; ptView = 'points'; pointsSource = 'current'; }); },
    'pt-time'(d) { commit(() => { const p = activePt(); p.endedAt = Math.max(p.startedAt + 1000, p.endedAt + Number(d.d) * 1000); }); },
    'settings-open'() { uiChange(() => { settingsOpen = true; }); },
    'settings-close'() { uiChange(() => { settingsOpen = false; }); },
    'set-scheme'(d) { commit(() => { Root.theme = d.v; }); },
    'voice-mode'(d) { commit(() => { Root.voiceMode = d.v; }); },
    'run-match'() { const g = G(), season = seasonView || !g; const games = season ? S.history.filter((h) => h.points).concat(g ? [g] : []) : [g]; const count = games.reduce((n, x) => n + x.points.length, 0); const r = E.profileMatch(games, S.players, S.rules); uiChange(() => { matchResult = { key: `${S.id}:${season}:${count}`, list: r.list }; }); },
    'menu-sub'() { uiChange(() => { sel = menu.id; menu = null; }); },
    'voice-open'(d) { uiChange(() => { voice = { kind: d.v, text: '', listening: false, status: '' }; }); },
    'voice-close'() { stopVoice(); uiChange(() => { voice = null; openMic = false; }); },
    'voice-rec'() {
      if (voice.listening) { Speech.stop(); return; }
      voice.listening = true; voice.status = 'Listening…'; render();
      Speech.start(voice.text, {
        words: speechWords(),
        onStatus(m) { if (voice) { voice.status = m; const el = document.getElementById('voice-status'); if (el) el.textContent = m; } },
        onText(t) { if (!voice) return; voice.text = t; const box = document.getElementById('voice-text'); if (box) box.value = t; refreshVoice(); },
        onStop() { if (!voice) return; voice.listening = false; voice.status = ''; render(); },
        onError(msg) { if (!voice) return; voice.listening = false; voice.status = msg; render(); },
      });
    },
    'voice-add'(d) {
      const r = parseLive(voice.text);
      stopVoice();
      if (d.v) { addStats(r.events); voice = null; A.result({ v: d.v }); return; }
      commitLight(() => { addStats(r.events); voice = null; });
    },
    'voice-line'() {
      const r = E.parseLine(voice.text, voicePlayers(), S.rules.positions);
      stopVoice();
      commit(() => { applyLine(r); voice = null; sel = null; });
    },
    'end-game'() {
      stopVoice();
      editIdx = null;
      commit(() => {
        const g = G(), sc = E.score(g), st = E.replay(g, S.players, S.rules), perPlayer = {};
        st.forEach((s, id) => { if (s.played) perPlayer[id] = { played: s.played, O: s.O, D: s.D, ms: s.ms, touch: s.touch, goal: s.goal, assist: s.assist, turn: s.turn, block: s.block }; });
        S.history.push({ id: g.id, opponent: g.opponent, date: g.startedAt, us: sc.us, them: sc.them, perPlayer, points: g.points, startOn: g.startOn, mode: g.mode, out: g.out });
        S.history.sort((x, y) => x.date - y.date);
        S.lastFinal = g.id;
        S.history.slice(0, -20).forEach((h) => { delete h.points; });
        let entry = S.schedule.find((x) => x.id === g.scheduleId);
        if (!entry) { const d = new Date(g.startedAt); entry = { id: uid(), date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, time: '', opponent: g.opponent, location: '' }; S.schedule.push(entry); }
        entry.gameId = g.id; entry.us = sc.us; entry.them = sc.them;
        S.game = null; S.setup = null; sel = null; voice = null;
        if (subscribers().length) { sendFor = true; reportNote = ''; }
      });
    },
    'setup-on'(d) { commit(() => { S.setup.startOn = d.v; }); },
    'setup-out'(d) { commit(() => { if (S.setup.out[d.id]) delete S.setup.out[d.id]; else S.setup.out[d.id] = true; }); },
    'start-game'() { commit(() => { const s = S.setup; S.game = { id: uid(), scheduleId: s.scheduleId || null, opponent: s.opponent, startOn: s.startOn, mode: 'balanced', out: { ...s.out }, startedAt: Date.now(), points: [], live: null, draft: newDraft() }; }); },
    edit(d) { uiChange(() => { editing = d.id; }); },
    'close-sheet'() { uiChange(() => { editing = null; }); },
    cycle(d) { commit(() => { const p = P(d.id), v = E.rate(p, d.k); p[d.k] = v >= 5 ? 1 : v + 1; }); },
    'set-skill'(d) { commit(() => { P(editing)[d.k] = Number(d.v); }); },
    'toggle-tag'(d) { commit(() => { const p = P(editing); p.tags = p.tags.includes(d.v) ? p.tags.filter((t) => t !== d.v) : p.tags.concat(d.v); }); },
    'set-target'(d) { commit(() => { P(editing).target = d.v; }); },
    'set-min'(d) { commit(() => { const p = P(editing); p.minPts = E.minPointsOf(p) + Number(d.d); }); },
    'set-match'(d) { commit(() => { P(editing).match = d.v; }); },
    'delete-player'() { commit(() => { const id = editing; S.players = S.players.filter((p) => p.id !== id); editing = null; if (S.game) { delete S.game.draft.line[id]; S.game.points.forEach((p) => { p.avail = p.avail.filter((x) => x !== id); p.lineup = p.lineup.filter((x) => x !== id); p.events = (p.events || []).filter((e) => e.id !== id); }); if (S.game.live) { S.game.live.lineup = S.game.live.lineup.filter((x) => x !== id); S.game.live.events = S.game.live.events.filter((e) => e.id !== id); } } }); },
    season(d) { uiChange(() => { seasonView = d.v === 'season'; }); },
    'reopen-game'(d) {
      stopVoice();
      commit(() => {
        const i = S.history.findIndex((h) => h.id === d.id), h = S.history[i];
        S.history.splice(i, 1);
        const entry = S.schedule.find((x) => x.gameId === h.id);
        if (entry) { delete entry.gameId; delete entry.us; delete entry.them; }
        S.game = { id: h.id, scheduleId: entry ? entry.id : null, opponent: h.opponent, startOn: h.startOn || (h.points[0] ? h.points[0].on : 'O'), mode: h.mode || 'balanced', out: h.out || {}, startedAt: h.date, points: h.points, live: null, draft: newDraft() };
        S.setup = null; tab = 'game'; sendFor = null; sel = null; voice = null; pointsSource = 'current';
        editIdx = h.points.length ? h.points.length - 1 : null;
      });
    },
    'open-player'(d) { uiChange(() => { playerOpen = d.id; }); },
    'close-player'() { uiChange(() => { playerOpen = null; }); },
    'open-game-stats'(d) { uiChange(() => { tab = 'time'; ptView = 'stats'; pointsSource = d.v; }); },
    'open-mic'() {
      if (voice && voice.open) { openMic = false; voice.open = false; stopVoice(); voice.listening = false; voice.status = ''; render(); return; }
      openMic = true;
      startOpenMic();
    },
    'pt-view'(d) { uiChange(() => { ptView = d.v; }); },
    'combo-size'(d) { uiChange(() => { comboSize = d.v; }); },
    'del-schedule'(d) { commit(() => { S.schedule = S.schedule.filter((x) => x.id !== d.id); }); },
    'pick-scheduled'(d) { commit(() => { const x = S.schedule.find((y) => y.id === d.id); S.setup.scheduleId = d.id; S.setup.opponent = x.opponent; }); },
    'start-scheduled'(d) { commit(() => { const x = S.schedule.find((y) => y.id === d.id); S.setup = { opponent: x.opponent, startOn: 'O', out: {}, scheduleId: x.id }; tab = 'game'; }); },
    'toggle-sub'(d) { commit(() => { const c = P(d.id).contacts.find((x) => x.id === d.v); c.subscribed = !c.subscribed; }); },
    'del-contact'(d) { commit(() => { const p = P(editing); p.contacts = p.contacts.filter((x) => x.id !== d.v); }); },
    'send-open'() { uiChange(() => { sendFor = true; reportNote = ''; }); },
    'send-close'() { uiChange(() => { sendFor = null; }); },
    async 'send-email'() {
      const list = [...new Set(subscribers())], last = lastFinal();
      const summary = last ? `${S.team} ${last.us}, ${last.opponent || 'Opponent'} ${last.them}.` : `${S.team} stats.`;
      const b64 = btoa(unescape(encodeURIComponent(Report.html(S))));
      try {
        await window.Capacitor.registerPlugin('EmailComposer').open({ bcc: list, subject: `${S.team} stats: ${summary}`, body: `${summary}\n\nOpen the attached page for the box score, every point and season stats.`, attachments: [{ type: 'base64', path: b64, name: `${S.team.replace(/[^A-Za-z0-9]+/g, '-')}-stats.html` }] });
        if (last) commit(() => { last.sent = true; reportNote = 'Your email app is open. Tap send there to finish.'; }); else uiChange(() => { reportNote = 'Your email app is open. Tap send there to finish.'; });
      } catch (e) { uiChange(() => { reportNote = 'No email app opened. Set one up on this device, or save the report instead.'; }); }
    },
    async 'send-save'() {
      try { await downloads.save({ filename: `${S.team.replace(/[^A-Za-z0-9]+/g, '-')}-stats.html`, data: Report.html(S) }); uiChange(() => { reportNote = 'Report saved. Attach it to an email to your subscribers.'; }); } catch (e) { uiChange(() => { reportNote = 'The report was not saved. Try again if you still need it.'; }); }
    },
    'send-copy'() {
      const list = [...new Set(subscribers())].join(', ');
      const done = (m) => uiChange(() => { reportNote = m; });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(list).then(() => done('Addresses copied. Paste them into BCC.'), () => done('Copying was blocked. Select the addresses in the box below.'));
      else done('Select the addresses in the box below.');
    },
    rule(d) { commit(() => { S.rules[d.k] += Number(d.d); redraft(); }); },
    'pos-limit'(d) {
      commit(() => {
        S.rules.positions[d.i][d.on].min += Number(d.d);
        redraft();
      });
    },
    'pos-floor'(d) { commit(() => { S.rules.positions[d.i].floor += Number(d.d); redraft(); }); },
    'del-pos'(d) { commit(() => { S.rules.positions.splice(Number(d.i), 1); redraft(); }); },
    division(d) { commit(() => { S.rules.division = d.v; redraft(); }); },
    'ratio-mode'(d) { commit(() => { S.rules.ratioMode = d.v; redraft(); }); },
    'ratio-start'(d) { commit(() => { S.rules.ratioStart = d.v; redraft(); }); },
    tagrule(d) { commit(() => { const t = S.rules.tagRules[d.i]; if (d.k === 'min') t.min = (t.min || 0) + Number(d.d); else { const cur = t.max === null ? S.rules.size : t.max; const nx = cur + Number(d.d); t.max = nx >= S.rules.size ? null : nx; } redraft(); }); },
    'tagrule-when'(d) { commit(() => { const t = S.rules.tagRules[d.i]; t.when = t.when === 'all' ? 'O' : t.when === 'O' ? 'D' : 'all'; redraft(); }); },
    'del-tag'(d) { commit(() => { const r = S.rules; r.tags = r.tags.filter((t) => t !== d.v); r.tagRules = r.tagRules.filter((t) => t.tag !== d.v); S.players.forEach((p) => { p.tags = p.tags.filter((t) => t !== d.v); }); redraft(); }); },
    backup() {
      backupText = JSON.stringify(Root); notice = '';
      const done = (msg) => { notice = msg; render(); const t = document.getElementById('backup'); if (t) t.select(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(backupText).then(() => done('Backup copied.'), () => done('Copying was blocked. The backup is selected below, so copy it from there.'));
      else done('The backup is selected below. Copy it from there.');
    },
    restore() {
      try {
        const next = JSON.parse(backupText);
        if (!next.players || !next.rules) throw new Error('shape');
        commit(() => { Root = migrate(next); Root.teams.forEach((t) => { t.isExample = false; }); S = activeTeam(); notice = 'Backup restored.'; });
      } catch (e) { notice = 'That text is not a Line Caller backup. Paste the whole backup and try again.'; render(); }
    },
  };
  const bestPosIn = (id) => { memo = memo || {}; return bestPos(id); };
  const redraft = () => { if (S.game && !S.game.live) { S.game.draft = newDraft(); } };

  /* ---------- Touch gestures: hold for the stat menu, hold or drag to move players ---------- */
  let g0 = null, dragging = null, suppressClick = false;
  const suppress = () => { suppressClick = true; setTimeout(() => { suppressClick = false; }, 400); };
  function openMenu(id, x, y) { menu = { id, x: x + 8, y: y - 20 }; hideTip(); render(); }
  function moveNarrative(from, to, side) {
    const pt = activePt(), items = Report.narrative(pt.events);
    let at = to > from ? to - 1 : to;
    if (side === 'after') at += 1;
    if (at === from) return;
    const [moving] = items.splice(from, 1);
    items.splice(at, 0, moving);
    const flat = items.flatMap((it) => it.idxs.map((i) => pt.events[i]));
    commit(() => { pt.events = E.reflow(flat); });
  }
  function beginDrag(id, x, y, el) {
    if (id.startsWith('ev:')) {
      el.classList.add('dragged');
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.textContent = el.textContent;
      document.body.appendChild(ghost);
      dragging = { ev: Number(id.slice(3)), ghost, el };
      hideTip();
      moveDrag(x, y);
      return;
    }
    const p = P(id);
    if (!p) return;
    el.classList.add('dragged');
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    ghost.textContent = `${p.no ? '#' + p.no + ' ' : ''}${p.name}`;
    document.body.appendChild(ghost);
    dragging = { id, ghost, el, zone: null };
    hideTip();
    moveDrag(x, y);
  }
  function moveDrag(x, y) {
    const { ghost } = dragging;
    ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
    if (dragging.ev !== undefined) {
      let best = null, dist = Infinity;
      document.querySelectorAll('[data-evi]').forEach((el) => {
        el.classList.remove('ins-before', 'ins-after');
        const r = el.getBoundingClientRect(), d = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 2);
        if (d < dist) { dist = d; best = { el, side: x < r.left + r.width / 2 ? 'before' : 'after' }; }
      });
      if (best) { best.el.classList.add(best.side === 'before' ? 'ins-before' : 'ins-after'); dragging.to = Number(best.el.dataset.evi); dragging.side = best.side; }
      return;
    }
    const under = document.elementFromPoint(x, y);
    const zone = under && under.closest('[data-drop]');
    if (dragging.zone !== zone) {
      if (dragging.zone) dragging.zone.classList.remove('drop-on');
      if (zone && zone.dataset.drop !== 'none') zone.classList.add('drop-on');
      dragging.zone = zone;
    }
    dragging.under = under;
  }
  function endDrag(apply) {
    const d = dragging; dragging = null;
    d.ghost.remove(); d.el.classList.remove('dragged');
    if (d.ev !== undefined) {
      document.querySelectorAll('.ins-before,.ins-after').forEach((el) => el.classList.remove('ins-before', 'ins-after'));
      suppress();
      if (apply && d.to !== undefined && d.to !== d.ev) moveNarrative(d.ev, d.to, d.side);
      return;
    }
    if (d.zone) d.zone.classList.remove('drop-on');
    suppress();
    if (!apply || !d.zone) return;
    const cardEl = d.under && d.under.closest('.pc[data-id]');
    dropPlayer(d.id, d.zone.dataset.drop, cardEl ? cardEl.dataset.id : null);
  }
  function clearHold() { if (g0 && g0.timer) clearTimeout(g0.timer); g0 = null; }
  root.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    hideTip();
    if (e.target.closest('[data-tip],.sit')) return;
    const el = e.target.closest('[data-press],[data-drag]');
    if (!el) return;
    g0 = { el, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse', press: el.dataset.press, drag: el.dataset.drag, timer: null };
    const start = g0;
    if (start.press) start.timer = setTimeout(() => { g0 = null; suppress(); openMenu(start.press, start.x, start.y); }, 450);
    else if (!start.mouse) start.timer = setTimeout(() => { g0 = null; beginDrag(start.drag, start.x, start.y, start.el); if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { /* optional */ } }, 220);
  });
  document.addEventListener('pointermove', (e) => {
    if (dragging) { moveDrag(e.clientX, e.clientY); return; }
    if (!g0) return;
    if (Math.hypot(e.clientX - g0.x, e.clientY - g0.y) > 8) {
      const s = g0; clearHold();
      if (s.drag && s.mouse) beginDrag(s.drag, e.clientX, e.clientY, s.el);
    }
  });
  document.addEventListener('pointerup', () => { if (dragging) endDrag(true); else clearHold(); });
  document.addEventListener('pointercancel', () => { if (dragging) endDrag(false); else clearHold(); });
  document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest('input,textarea')) return;
    e.preventDefault();
    const el = e.target.closest('[data-press]');
    if (el && e.button === 2) openMenu(el.dataset.press, e.clientX, e.clientY);
  });

  root.addEventListener('click', (ev) => {
    if (suppressClick) { suppressClick = false; return; }
    const jump = ev.target.closest('.report-preview a[href^="#"]');
    if (jump) { ev.preventDefault(); const t = document.getElementById(jump.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ block: 'start' }); return; }
    const tipTarget = ev.target.closest('[data-tip]');
    if (tipTarget) { ev.stopPropagation(); showTip(tipTarget, 3500); tipPinned = true; return; }
    const el = ev.target.closest('[data-a]');
    if (!el) return;
    if (el.dataset.self && ev.target !== el) return;
    if (el.disabled) return;
    const fn = A[el.dataset.a];
    if (fn) fn(el.dataset, el);
  });
  root.addEventListener('change', (ev) => {
    const key = ev.target.dataset.c, v = ev.target.value, i = ev.target.dataset.i;
    if (key === 'setup-opp') commit(() => { S.setup.opponent = v; });
    if (key === 'edit-name' && v.trim()) commit(() => { P(editing).name = v.trim(); });
    if (key === 'edit-no') commit(() => { P(editing).no = v.trim(); });
    if (key === 'edit-alias') commit(() => { P(editing).aliases = v; });
    if (key === 'pt-time') {
      const m = v.trim().match(/^(\d+)(?::(\d{1,2}))?$/);
      if (m) commit(() => { const p = activePt(), ms = (Number(m[1]) * 60 + Number(m[2] || 0)) * 1000; p.endedAt = p.startedAt + Math.max(1000, ms); });
      else render();
    }
    if (key === 'points-src') uiChange(() => { pointsSource = v; });
    if (key === 'team' && v.trim()) commit(() => { S.team = v.trim(); });
    if (key === 'pos-name' && v.trim()) commit(() => { const p = S.rules.positions[i]; p.name = v.trim(); p.abbr = makeAbbr(p.name, p.id); });
    if (key === 'pos-skill') commit(() => { const p = S.rules.positions[i]; p.skill = v === 'own' ? 'x_' + p.id : v; });
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.target.id === 'voice-text' && voice && voice.open && ev.key === 'Enter') { ev.preventDefault(); heard(ev.target.value); }
  });
  root.addEventListener('input', (ev) => {
    if (ev.target.dataset.c === 'backup-text') backupText = ev.target.value;
    if (ev.target.dataset.c === 'voice' && voice) { voice.text = ev.target.value; refreshVoice(); }
  });
  function makeAbbr(name, selfId) {
    const clean = name.replace(/[^A-Za-z0-9]/g, '') || 'P';
    const taken = S.rules.positions.filter((p) => p.id !== selfId).map((p) => p.abbr);
    for (let n = 1; n <= Math.min(clean.length, 4); n++) { const a = clean[0].toUpperCase() + clean.slice(1, n); if (!taken.includes(a)) return a; }
    return clean.slice(0, 3) + (taken.length + 1);
  }
  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target.dataset.form;
    if (form === 'add') {
      const names = document.getElementById('add-name').value.split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length) commit(() => { names.forEach((n) => S.players.push(newPlayer(n))); });
    }
    if (form === 'schedule') {
      const opponent = document.getElementById('sch-opp').value.trim(), date = document.getElementById('sch-date').value;
      if (opponent && date) commit(() => { S.schedule.push({ id: uid(), opponent, date, time: document.getElementById('sch-time').value.trim(), location: document.getElementById('sch-loc').value.trim() }); });
    }
    if (form === 'contact') {
      const email = document.getElementById('c-email').value.trim();
      if (email.includes('@')) commit(() => { const p = P(editing); p.contacts = p.contacts || []; p.contacts.push({ id: uid(), name: document.getElementById('c-name').value.trim(), email, relation: document.getElementById('c-rel').value, subscribed: true }); });
    }
    if (form === 'team') {
      const name = document.getElementById('new-team').value.trim();
      if (name) commit(() => { const t = blank(JSON.parse(JSON.stringify(S.rules)), name); Root.teams.push(t); Root.active = t.id; S = t; sel = null; });
    }
    if (form === 'tag') {
      const t = document.getElementById('new-tag').value.trim();
      if (t && !S.rules.tags.includes(t)) commit(() => { S.rules.tags.push(t); S.rules.tagRules.push({ tag: t, min: 0, max: null, when: 'all' }); });
    }
    if (form === 'pos') {
      const name = document.getElementById('new-pos').value.trim();
      if (name && !S.rules.positions.some((p) => p.name.toLowerCase() === name.toLowerCase())) commit(() => { const id = 'p' + uid(); S.rules.positions.push({ id, name, abbr: makeAbbr(name, id), skill: 'x_' + id, floor: 1, O: { min: 0 }, D: { min: 0 } }); redraft(); });
    }
  });

  const sharedCss = document.createElement('style');
  sharedCss.textContent = Report.CSS;
  document.head.appendChild(sharedCss);
  Root = load();
  S = activeTeam();
  render();
  setTimeout(connect, 0);
})();
