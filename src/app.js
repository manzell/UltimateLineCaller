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
  const STAT_MENU = [['goal', '', 'Goal'], ['assist', '', 'Assist'], ['turn', 'throw', 'Throwaway'], ['turn', 'drop', 'Drop'], ['block', '', 'Block (D)'], ['block', 'int', 'Interception']];
  const MODE_LABEL = { develop: 'Develop', balanced: 'Balanced', competitive: 'Competitive', win: 'Universe' };
  const SCHEMES = [['system', 'Automatic', 'Follows your device'], ['light', 'Light', 'Bright and plain'], ['dark', 'Dark', 'Easy at dusk'], ['field', 'Field', 'Deep turf green'], ['ocean', 'Ocean', 'Cool blues'], ['sunrise', 'Sunrise', 'Warm and soft'], ['sun', 'High sun', 'Maximum contrast outdoors'], ['press', 'Newsprint', 'Old black-and-white paper'], ['team', 'Current team', 'Colors from your team']];
  const newDraft = (plan) => ({ alt: 0, on: null, ratio: null, line: {}, plan: plan || null });
  const newPlayer = (name, f) => ({ id: uid(), name, no: '', aliases: '', match: 'M', h: 3, c: 3, d: 3, s: 3, tags: [], target: 'average', minPts: 2, contacts: [], ...f });

  let Root = null, S = null, tab = 'game', sel = null, editing = null, seasonView = false, ptView = 'time', pointsSource = 'current', backupText = '', notice = '';
  let rankBy = 'plus', boxOpen = false, bkEdit = null, teamComp = 'all', bkRename = null, playDiv = 'all', muShut = new Set(), gamesShut = new Set(), linkDraft = null, teamOpen = null, teamFilter = 'all', teamQuery = '', schedDiv = 'all', siteShut = new Set(), scoreEntry = null, sheetOpen = false, schedSite = 'all', searchHits = [], importing = null, compView = null, compSub = 'overview', fieldEdit = null, schedDate = null, muSel = null, schedOpen = false, pendingSpot = null, schedKind = 'game', dirCache = [], navBack = null, editingComp = null, reporting = null, attendingPrac = null, halftimeOpen = false, pointSheet = null, boxSort = null, ptSort = null, editingGame = null, capNotice = null, audioCtx = null;
  const tableSorts = {};
  benchFilter = 'all', insight = null, sampler = null;
  const insightCache = new Map();
  let playerOpen = null, openMic = false, fixLine = false, teamView = 'roster', coachNote = '';
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
    if (s.teams) {
    s.competitions = s.competitions || [];
    s.teams.forEach((t) => { (t.competitions || []).forEach((c) => { if (!s.competitions.some((x) => x.id === c.id)) s.competitions.push({ admins: [], sites: [], matchups: [], slotMin: 90, rules: {}, ...c, groups: (c.groups || []).map((g) => (typeof g === 'string' ? { name: g, teams: [] } : g)), at: Date.now() }); }); delete t.competitions; });
    s.teams.forEach((t) => { if (t.rules.ratioMode === 'fixed') t.rules.ratioMode = 'call'; Object.entries({ timeoutsPerHalf: 2, floaters: 0, softCap: 0, softCapAdd: 1, hardCap: 0, timeCap: 0, capAlarms: false }).forEach(([k, v]) => { if (t.rules[k] === undefined) t.rules[k] = v; }); t.schedule = t.schedule || []; t.players.forEach((p) => { p.contacts = p.contacts || []; }); }); return s; }
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
    if (CloudLink) CloudLink.schedule();
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
      sampler = await window.claude.use('sample');
      if (sampler) render();
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
  const POS = (id) => rules().positions.find((p) => p.id === id);
  const posName = (id) => (POS(id) ? POS(id).name : 'Player');
  const mixed = () => rules().division === 'mixed';
  const allSkills = () => BASE_SKILLS.concat(rules().positions.filter((p) => !BASE_SKILLS.some(([k]) => k === p.skill)).map((p) => [p.skill, p.name]));
  const stats = () => { if (!memo) memo = {}; if (!memo.stats) memo.stats = E.replay(G(), S.players, rules()); return memo.stats; };
  function ctx() {
    if (!memo) memo = {};
    if (!memo.ctx) {
      const c = E.context(G(), rules()), d = G().draft;
      memo.ctx = { ...c, on: d.on || c.on, ratio: c.ratio && (d.ratio || c.ratio) };
    }
    return memo.ctx;
  }
  const targetSize = () => Math.min(rules().size, S.players.filter((p) => !G().out[p.id]).length);
  const placedIds = () => Object.keys(G().draft.line);
  function options() {
    if (!memo) memo = {};
    if (!memo.options) {
      const g = G(), fixed = g.draft.line;
      let list = E.suggest(g, S.players, rules(), { ctx: ctx(), stats: stats(), fixed, count: 6 });
      const plan = g.draft.plan;
      if (plan && !placedIds().length && plan.on === ctx().on && plan.ids.every((id) => P(id) && !g.out[id])) {
        const ev = E.evaluate(g, S.players, rules(), plan.ids, { ctx: ctx(), stats: stats() });
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
      memo.placed = ids.length ? E.evaluate(G(), S.players, rules(), ids, { ctx: ctx(), stats: stats(), fixed: G().draft.line, partial: ids.length < targetSize() }) : null;
    }
    return memo.placed;
  }
  function getPreviews() {
    if (previews) return previews;
    const g = G();
    const done = g.points.map((p) => p.endedAt - p.startedAt);
    const avg = done.length ? done.reduce((a, b) => a + b, 0) / done.length : 3 * E.MIN;
    previews = {};
    for (const r of ['us', 'them']) previews[r] = E.preview(g, S.players, rules(), r, avg);
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
    const ranked = rules().positions.slice().sort((a, b) => E.rate(p, b.skill) - E.rate(p, a.skill));
    const open = rules().positions.reduce((sum, x) => sum + Math.max(0, x[on].min - countIn(x.id)), 0);
    if (targetSize() - placedIds().length <= open) { const need = ranked.find((x) => countIn(x.id) < x[on].min); if (need) return need.id; }
    return ranked[0].id;
  }

  /* ---------- Small view helpers ---------- */
  const tipAttr = (t) => `data-tip="${esc(t)}"`;
  const seg = (act, value, opts, extra) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-a="${act}" data-v="${v}" ${extra || ''} aria-pressed="${String(v) === String(value)}">${l}</button>`).join('')}</div>`;
  const MODE_HINT = { develop: 'Freshest players and rookies first.', balanced: 'Rotates everyone and keeps skill high.', win: 'Your best seven. Tiredness barely counts.', competitive: 'Your top seven, resting about two a point so they last the game.' };
  const modeSeg = (small) => `<div class="mode ${small ? 'mode-sm' : ''}">${seg('mode', G().mode, [['develop', 'Develop'], ['balanced', 'Balanced'], ['competitive', 'Competitive'], ['win', 'Universe']])}<span class="small muted">${MODE_HINT[G().mode]}</span></div>`;
  const stepper = (act, value, min, max, extra, shown) => `<span class="step"><button type="button" data-a="${act}" data-d="-1" ${extra || ''} aria-label="Less" ${value <= min ? 'disabled' : ''}>−</button><b>${shown === undefined ? value : shown}</b><button type="button" data-a="${act}" data-d="1" ${extra || ''} aria-label="More" ${value >= max ? 'disabled' : ''}>+</button></span>`;
  const twoTap = (key, act, label, confirmLabel, cls, extra) => `<button type="button" class="btn small-btn ${cls || ''}" data-a="confirm" data-key="${key}" data-then="${act}" ${extra || ''}>${confirmKey === key ? confirmLabel : label}</button>`;
  const FRESH_TIP = { Fresh: 'Fresh: ready for a long point.', OK: 'OK: can play, but has been working.', Tired: 'Tired: needs a rest. A long point now is a risk.' };
  const freshPill = (e) => { const f = E.fresh(e); return `<span class="fr ${f}" ${tipAttr(`${FRESH_TIP[f]} Energy ${Math.round(e)} of 100.`)}>${f}</span>`; };
  const pts = (s) => `${s.played}/${s.target.toFixed(1)} pts`;
  const owedText = (s) => { const d = s.target - s.played; return d >= 0.75 ? `Owed ${d.toFixed(1)}` : d <= -0.75 ? `Over ${(-d).toFixed(1)}` : 'On target'; };
  const owedTip = (s) => `Played ${s.played}. Fair share so far is ${s.target.toFixed(1)} points, based on who has been available and each player's target.`;
  // Youth teams say Gx/Bx and girls/boys instead of WMP/MMP and women/men.
  const GL = (m) => (S.youth ? (m === 'W' ? 'Gx' : 'Bx') : (m === 'W' ? 'WMP' : 'MMP'));
  const GW = (m, cap) => { const w = S.youth ? (m === 'W' ? 'girls' : 'boys') : (m === 'W' ? 'women' : 'men'); return cap ? w[0].toUpperCase() + w.slice(1) : w; };
  const gWords = (s) => (S.youth ? s.replace(/women-matching/g, 'Gx').replace(/men-matching/g, 'Bx') : s);
  const matchBadge = (p) => (mixed() ? `<span class="mb ${p.match}" ${tipAttr(S.youth ? `${GL(p.match)}: ${GW(p.match) === 'girls' ? 'girl' : 'boy'}-matching player` : p.match === 'W' ? 'WMP: women-matching player' : 'MMP: men-matching player')}>${GL(p.match)}</span>` : '');
  const tile = (p, small) => `<span class="tile ${mixed() ? p.match : ''} ${small ? 'sm' : ''}" aria-label="Jersey ${esc(p.no || 'not set')}">${esc(p.no || '–')}</span>`;
  // Badge during a game: the player's energy, shading to yellow, orange and red as they tire.
  const heat = (e) => (e >= 75 ? 'h0' : e >= 65 ? 'h1' : e >= 55 ? 'h2' : e >= 40 ? 'h3' : 'h4');
  const freshTile = (p) => { const e = Math.round(stats().get(p.id).energy); return `<span class="fb ${heat(e)}" title="Energy ${e} of 100" aria-label="Energy ${e} of 100">${e}</span>`; };
  const nameTag = (p) => `${p.no ? `<span class="no">#${esc(p.no)}</span> ` : ''}${esc(p.name)}`;
  const energyKey = '<span class="small muted" title="100 is fully rested. Green is fresh; yellow, orange and red mean tiring.">Number is energy, out of 100</span>';
  const ratingTip = (p) => allSkills().map(([k, l]) => `${l} ${E.rate(p, k)}`).join(', ');
  const posAbbr = (id) => (POS(id) ? POS(id).abbr : '?');

  const pLink = (p) => `<button type="button" class="linkish plink" data-a="go-player" data-id="${esc(p.id)}">${esc(p.name)}</button>`;
  const whoName = (id) => (P(id) ? esc(P(id).name) : 'Removed player');
  const evChip = (e, suffix) => (e.t === 'touch' ? `<span class="ev">${whoName(e.id)}${suffix || ''}</span>` : e.t === 'oppturn' ? '<span class="ev stat e-oppturn">Opponent turnover</span>' : `<span class="ev stat e-${e.t}">${Report.label(e)}: ${whoName(e.id)}${suffix || ''}</span>`);
  function narrativeHtml(events, drag, suffix) {
    const items = Report.narrative(events);
    return items.map((it, i) => {
      let arrow = '';
      if (i) {
        const pass = Report.isPass(items, i), ti = it.idxs[0], tt = pass ? events[ti].throwType : null;
        const sup = tt ? `<sup ${tipAttr(Report.THROW_NAME[tt])}>${Report.THROW[tt]}</sup>` : '';
        arrow = pass ? `<span class="muted arrow ${drag ? 'arr-press' : ''}" ${drag ? `data-press="arr:${ti}" title="Hold to mark forehand or backhand"` : ''}> →${sup} </span>` : '<span class="sep" aria-hidden="true"></span>';
      }
      return arrow + chipOf(it, i);
    }).join('');
    function chipOf(it, i) {
      const gi = it.role === 'goal' || it.t === 'goal' ? it.idxs.find((k) => events[k].t === 'goal') : undefined;
      const fixed = gi !== undefined || it.t === 'oppgoal';
      const attrs = drag ? `${fixed ? '' : `data-drag="ev:${i}" `}data-evi="${i}"${gi !== undefined ? ` data-press="goal:${gi}"` : ''}` : '';
      const q = suffix && it.unsure ? ' ?' : '';
      if (it.t === 'touch' && !it.role) return `<span class="ev" ${attrs}>${whoName(it.id)}${q}</span>`;
      if (!it.id) return `<span class="ev stat e-${it.t}" ${attrs}>${Report.oppLabel(it)}</span>`;
      const kind = it.role || it.t;
      return `<span class="ev stat e-${kind}" ${attrs}>${Report.label({ t: kind, sub: it.sub })}: ${whoName(it.id)}${q}</span>`;
    }
  }
  const isPuller = (p) => p.tags.some((t) => t.toLowerCase() === 'puller');
  // Before the pull: Puller-tagged players get a ring, and a hold on a line card picks who pulls.
  const pullOpen = () => { const g = G(); return g.live ? g.live.on === 'D' && !g.live.puller && !g.live.review && !(g.live.events || []).length : ctx().on === 'D'; };
  function lineCard(id, pos) {
    const p = P(id), def = POS(pos), rating = def ? E.rate(p, def.skill) : '', pull = pullOpen();
    return `<button type="button" class="pc ${sel === id ? 'sel' : ''} ${pull && isPuller(p) && canPull(p) ? 'pull-ring' : ''}" data-a="tap-line" data-id="${id}" data-drag="${id}" ${pull ? `data-press="${id}"` : ''}>
      <span class="nm">${freshTile(p)}<span class="tx">${nameTag(p)}</span></span>
      <span class="sub">${matchBadge(p)}<span class="meta"><span ${tipAttr(ratingTip(p))}>${esc(posName(pos))} ${rating}</span></span></span></button>`;
  }
  function benchRow(id, live) {
    const p = P(id), s = stats().get(id), owed = s.target - s.played;
    const short = rules().positions.slice(0, 3).map((x) => `${x.abbr}${E.rate(p, x.skill)}`).join(' ');
    return `<div class="br ${sel === id ? 'sel' : ''} ${owed >= 0.75 ? 'owed' : ''}">
      <button type="button" class="br-main" data-a="${live ? 'tap-bench-live' : 'tap-bench'}" data-id="${id}" ${live ? '' : `data-drag="${id}"`}>
      <span class="nm">${freshTile(p)}<span class="tx">${nameTag(p)}</span></span>
      <span class="sub">${matchBadge(p)}<span class="meta"><span class="owe" ${tipAttr(owedTip(s))}>${owedText(s)}</span> · ${s.played} pts · <span ${tipAttr(ratingTip(p))}>${short}</span>${p.tags.length ? ' · ' + esc(p.tags.join(', ')) : ''}</span></span></button>
      <button type="button" class="sit" data-a="sit" data-id="${id}" aria-label="${esc(p.name)} is not at this game">Not here</button></div>`;
  }
  function benchFilters() {
    const opts = [['all', 'All']];
    if (mixed()) opts.push(['g:W', GL('W')], ['g:M', GL('M')]);
    rules().positions.forEach((x) => opts.push([`p:${x.id}`, x.name.endsWith('s') ? x.name : x.name + 's']));
    const tags = rules().tags.filter((t) => S.players.some((p) => p.tags.includes(t)));
    tags.forEach((t) => opts.push([`t:${t}`, t.endsWith('s') ? t : t + 's']));
    if (tags.some((t) => /^rookie$/i.test(t)) && !tags.some((t) => /^vet/i.test(t))) opts.push(['vets', 'Vets']);
    (S.lines || []).filter((l) => l.ids.some(P)).forEach((l) => opts.push([`l:${l.id}`, `☰ ${l.name}`]));
    if (!opts.some(([k]) => k === benchFilter)) benchFilter = 'all';
    const lineOn = benchFilter.startsWith('l:') && !G().live ? benchFilter.slice(2) : null;
    return `<div class="bench-filters" role="group" aria-label="Show on the bench">${lineOn ? `<button type="button" class="btn small-btn primary" data-a="use-line" data-id="${lineOn}">Put this line in</button>` : ''}${opts.map(([k, l]) => `<button type="button" class="tog" data-a="bench-filter" data-v="${esc(k)}" aria-pressed="${benchFilter === k}">${esc(l)}</button>`).join('')}</div>`;
  }
  function benchMatch(id) {
    const p = P(id), f = benchFilter;
    if (f === 'all') return true;
    if (f.startsWith('g:')) return (p.match === 'W') === (f === 'g:W');
    if (f.startsWith('p:')) { const best = Math.max(...rules().positions.map((x) => E.rate(p, x.skill))); const pos = rules().positions.find((x) => x.id === f.slice(2)); return pos && E.rate(p, pos.skill) === best; }
    if (f.startsWith('t:')) return p.tags.includes(f.slice(2));
    if (f.startsWith('l:')) { const l = (S.lines || []).find((x) => x.id === f.slice(2)); return !!l && l.ids.includes(id); }
    if (f === 'vets') return !p.tags.some((t) => /^rookie$/i.test(t));
    return true;
  }
  const benchList = (ids, live) => { const shown = sortByOwed(ids).filter(benchMatch); return shown.map((id) => benchRow(id, live)).join('') || `<p class="muted">${ids.length ? 'No one on the bench matches this filter.' : 'Everyone available is on the line.'}</p>`; };
  const sortByOwed = (ids) => ids.slice().sort((a, b) => { const x = stats().get(a), y = stats().get(b); return (y.target - y.played) - (x.target - x.played) || y.energy - x.energy; });

  function strength(line) {
    return `<div class="strength">${line.strength.map((v) => `<div class="st" ${tipAttr(`${v.label}: this line rates ${v.line.toFixed(1)}. The tick is your available team at ${v.team.toFixed(1)}.${v.note ? ' ' + v.note : ''}`)}><div class="row"><span>${esc(v.label)}</span><b>${v.line.toFixed(1)}</b></div><div class="meter"><i style="width:${v.line / 5 * 100}%"></i><u style="left:${v.team / 5 * 100}%"></u></div></div>`).join('')}</div>`;
  }
  const legend = () => (mixed() ? `<span class="legend small"><span class="tile W sm" aria-hidden="true"></span>${GL('W')} <span class="tile M sm" aria-hidden="true"></span>${GL('M')}</span>` : '');

  /* ---------- Game screens ---------- */
  function scoreboard(live) {
    const g = G(), sc = E.score(g), c = live ? { on: g.live.on, ratio: g.live.ratio, pointNo: g.points.length + 1, halftime: false } : ctx();
    const onLabel = c.on === 'O' ? 'Offense' : 'Defense';
    const major = Math.ceil(rules().size / 2), minor = Math.floor(rules().size / 2);
    const ratioLabel = c.ratio && (c.ratio === 'W' ? `${major} ${GW('W')} / ${minor} ${GW('M')}` : `${major} ${GW('M')} / ${minor} ${GW('W')}`);
    const atEnd = Math.max(sc.us, sc.them) >= (g.capTo || rules().gameTo);
    return `<section class="score" aria-label="Score">
      <div class="nums"><div class="side"><b>${sc.us}</b><span class="team">${esc(S.team)}</span></div><span class="dash">–</span><div class="side"><b>${sc.them}</b><span class="team">${esc(g.opponent || 'Opponent')}</span></div></div>
      <div class="chips">
        <span class="label">Point ${c.pointNo}</span>
        ${live ? `<span class="chip on${c.on}">${onLabel}</span>` : `<button type="button" class="chip on${c.on}" data-a="flip-on" aria-label="Next point is ${onLabel}. Tap to switch.">${onLabel} ⇄</button>`}
        ${c.ratio ? (live ? `<span class="chip">${ratioLabel}</span>` : `<button type="button" class="chip" data-a="flip-ratio">${ratioLabel}${rules().ratioMode === 'abba' ? '' : (rules().ratioMode === 'call' ? c.on === 'O' : c.caller === 'us') ? ' · we call' : ' · they call'} ⇄</button>`) : ''}
        ${!live && gendzone() && !g.points.length ? `<button type="button" class="chip" data-a="gendzone-first" data-v="${g.gendzoneUs === false ? 'us' : 'them'}" aria-label="Tap to switch who starts in the gendzone">${g.gendzoneUs === false ? 'They' : 'We'} start in the gendzone ⇄</button>` : ''}
        ${S.castKey && CloudLink && CloudLink.user ? '<span class="chip live-chip" title="Fans can follow this game on Gamecast">● Gamecast</span>' : ''}
        ${c.halftime ? '<span class="chip">After halftime</span>' : ''}${g.halftimeAt ? '<button type="button" class="chip" data-a="halftime-open">Halftime summary</button>' : ''}
      </div>
      <div class="right">
        ${CAPS.some(([k]) => rv(k, 0)) ? `<span class="chip gclock" id="gclock">${capClock(g)}</span>` : ''}
        <button type="button" class="btn small-btn" data-a="open-sheet">Scoresheet</button>${g.points.length ? '<button type="button" class="btn small-btn" data-a="open-box">Box score</button>' : ''}
        ${g.points.length ? '<button type="button" class="btn small-btn" data-a="edit-prev">Previous point</button>' : ''}
        ${!live && g.points.length ? '<button type="button" class="btn small-btn" data-a="undo">Undo last point</button>' : ''}
        ${twoTap('end', 'end-game', atEnd ? 'Finish game' : 'End game', 'Tap again to end', atEnd ? 'primary' : '')}
      </div>${timeoutRow(g)}${capNotice ? `<div class="cap-note" role="alert"><b>${esc(capNotice)}</b><button type="button" class="btn small-btn" data-a="cap-ok">OK</button></div>` : ''}</section>`;
  }

  function positionGroups() {
    const g = G(), on = ctx().on, line = g.draft.line;
    const room = placedIds().length < targetSize();
    const plural = (n) => (/s$/i.test(n) ? n : n + 's');
    return rules().positions.map((p) => {
      const ids = placedIds().filter((id) => line[id] === p.id), min = p[on].min;
      const openReq = Math.max(0, min - ids.length);
      const count = min ? `${ids.length} of ${min} minimum` : String(ids.length);
      const n = ids.length + openReq + (room && !openReq ? 1 : 0);
      return `<div class="role-group" data-drop="${p.id}"><div class="label">${esc(plural(p.name))} · ${count}</div><div class="cards" style="--cols:${n === 4 || n <= 2 ? 2 : 3}">
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
    const rows = s ? rules().positions.map((p) => {
      const ids = s.ids.filter((id) => s.roles[id] === p.id);
      return ids.length ? `<div class="sug-row"><span class="label" ${tipAttr(p.name)}>${esc(p.abbr)}</span><div class="sug-chips">${ids.map((id) => { const on = !!g.draft.line[id]; return `<button type="button" class="sug ${on ? 'placed' : ''}" data-a="add-sug" data-id="${id}" data-v="${p.id}">${freshTile(P(id))}<span>${nameTag(P(id))}</span></button>`; }).join('')}</div></div>` : '';
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
    const r = E.parseLine(voice.text, voicePlayers(), rules().positions);
    const parts = [];
    if (r.clear) parts.push('<span class="ev stat">Clear the line</span>');
    if (r.useSuggestion) parts.push('<span class="ev stat">Use the suggested line</span>');
    r.swaps.forEach((s) => parts.push(`<span class="ev">${esc(P(s.in).name)} in for ${esc(P(s.out).name)}</span>`));
    r.remove.forEach((id) => parts.push(`<span class="ev">${esc(P(id).name)} off</span>`));
    r.assign.forEach((a) => parts.push(`<span class="ev">${esc(P(a.id).name)}${a.unsure ? ' ?' : ''}: ${a.pos ? esc(posName(a.pos)) : 'best fit'}</span>`));
    return `<div class="chain">${parts.join(' ') || '<span class="muted">No players recognized yet.</span>'}</div>${notes(r.unknown)}
      <div class="chips"><button type="button" class="btn small-btn primary" data-a="voice-line" ${parts.length ? '' : 'disabled'}>Set line</button></div>`;
  }

  const role = () => Root.gameRole || 'both';
  const gendzone = () => rules().division === 'mixed' && rules().ratioMode === 'gendzone';
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
          ${line && line.warnings.length ? `<div class="warns" role="status"><b>Check this line</b>${line.warnings.map((w) => `<span>${esc(gWords(w))}</span>`).join('')}</div>` : ''}
        </section>
        ${role() === 'events' ? '' : suggestionPanel()}
        <div class="sticky-go">${selectionBar()}<button type="button" class="btn go" data-a="start-point" ${missing || !ids.length ? 'disabled' : ''}>${!target ? 'No players available' : missing ? `Pick ${missing} more` : 'Start point'}</button>${!missing && ids.length ? '<button type="button" class="btn go-alt" data-a="start-point" data-untimed="1" title="For points entered after the fact, or when nobody is running the clock">Untimed point</button>' : ''}</div>
      </div>
      <section class="panel" aria-label="Bench" data-drop="bench">
        <div class="panel-head"><h2>Bench</h2><span class="small muted">Most owed first. Tap to add, or drag.</span></div>
        ${benchFilters()}
        <div class="list">${benchList(rest)}</div>
        ${gone.length ? `<div class="label">Not at this game</div><div class="list">${gone.map((p) => `<button type="button" class="br-main gone" data-a="sit" data-id="${p.id}"><span class="nm">${freshTile(p)}<span class="tx">${nameTag(p)}</span></span><span class="sub small">Tap to bring back</span></button>`).join('')}</div>` : ''}
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
    return `<div><h3>${title}</h3><p class="small muted">${onLabel}${pv.ctx.halftime ? ', after halftime' : ''}</p><div class="compact">${rules().positions.flatMap((r) => pv.line.ids.filter((id) => pv.line.roles[id] === r.id).map((id) => `<div>${freshTile(P(id))}<span class="cn">${nameTag(P(id))}</span><span class="tag" ${tipAttr(r.name)}>${esc(r.abbr)}</span></div>`)).join('')}</div></div>`;
  }
  const liveCount = (id, t) => (activePt().events || []).filter((e) => e.id === id && e.t === t).length;
  function fieldCard(id) {
    const p = P(id), s = stats().get(id), pos = (activePt().roles || {})[id];
    const counts = [['touch', 'T', 'Touches'], ['goal', 'G', 'Goals'], ['assist', 'A', 'Assists'], ['turn', 'TO', 'Turnovers'], ['block', 'B', 'Blocks']].filter(([k]) => liveCount(id, k) > 0);
    return `<button type="button" class="pc onfield ${sel === id ? 'sel' : ''} ${editIdx === null && pullOpen() && isPuller(p) && canPull(p) ? 'pull-ring' : ''}" data-a="tap-field" data-id="${id}" data-press="${id}">
      <span class="nm">${freshTile(p)}<span class="tx">${nameTag(p)}</span></span>
      <span class="sub">${matchBadge(p)}<span class="meta"><span ${tipAttr(posName(pos))}>${esc(posAbbr(pos))}</span> · ${counts.length ? counts.map(([k, l, name]) => `<span ${tipAttr(`${name} this point`)}><b>${l}${liveCount(id, k)}</b></span>`).join(' ') : 'No touches yet'}</span></span></button>`;
  }
  // Portrait field for visual entry: tap where it happened, then tap or hold the player.
  function entryField() {
    const pt = activePt(), ev = pt.events || [], trail = Report.possessionTrail(ev).filter((e) => e.t === 'touch');
    const last = trail[trail.length - 1];
    const dots = trail.map((e) => ({ x: e.x, y: e.y, label: P(e.id) ? (P(e.id).no || P(e.id).name.slice(0, 2)) : '?', hold: e === last && Report.holder(pt) === 'us' }));
    const marks = ev.filter((e) => e.x !== undefined && (e.t === 'turn' || e.t === 'block' || e.t === 'opppass' || e.t === 'oppturn')).slice(-4).map((e) => ({ x: e.x, y: e.y, kind: e.t === 'turn' ? 'T' : e.t === 'block' ? (e.sub === 'int' ? 'I' : 'B') : e.t === 'opppass' ? 'P' : 'T' }));
    return `<div class="entry-field">${Report.fieldSvg({ interactive: true, pending: pendingSpot, teams: [{ color: Report.safeColor(S.color), trail, dots, marks }], label: 'Tap where the play happened' })}
      <p class="small muted">${pendingSpot ? 'Now tap the player (or hold for a stat), or use Opponent pass / turnover.' : 'Tap the field where it happened, then the player. We attack the top endzone.'}${pendingSpot ? ' <button type="button" class="btn small-btn" data-a="spot-clear">Clear spot</button>' : ''}</p></div>`;
  }
  function chainStrip() {
    const ev = activePt().events || [];
    const pull = activePt().puller && P(activePt().puller) ? `<span class="ev stat e-pull">Pull: ${whoName(activePt().puller)}</span>${ev.length ? '<span class="sep" aria-hidden="true"></span>' : ' '}` : '';
    const items = narrativeHtml(ev, true);
    return `<div class="chain-row"><div class="chain" aria-live="polite">${pull}${items || '<span class="muted">Tap a player for a touch. Hold for goal, assist, turnover or block.</span>'}</div>${ev.length > 1 ? '<span class="small muted chain-hint">Hold and drag to reorder</span>' : ''}${ev.length ? '<button type="button" class="btn small-btn" data-a="undo-stat">Undo</button>' : ''}<button type="button" class="btn small-btn" data-a="voice-open" data-v="play">Voice</button></div>`;
  }
  function linesLive() {
    const g = G(), pv = getPreviews(), onField = liveOnField().filter(P);
    return `${scoreboard(true)}<div class="game">
      <section class="panel"><div class="timer ${g.live.pausedAt ? 'paused' : ''} ${g.live.untimed ? 'untimed' : ''}" id="timer">${g.live.untimed ? 'Untimed' : clock(liveElapsed())}</div>
        ${g.live.review ? `<div class="warns"><b>${g.live.review.result === 'us' ? 'We scored' : 'They scored'}</b><span>Waiting for the point to be finalized.</span></div>` : ''}
        <div class="label">On the field</div><div class="compact">${onField.map((id) => `<div>${freshTile(P(id))}<span class="cn">${nameTag(P(id))}</span></div>`).join('')}</div></section>
      <section class="panel"><div class="panel-head"><h2>Next up</h2>${modeSeg(true)}</div><div class="next-cols">${compactLine(pv.us, 'If we score')}${compactLine(pv.them, 'If they score')}</div></section></div>`;
  }
  // When we have the disc: our turnover. When they do: their pass or turnover.
  function turnBtns(pt, review) {
    if (Report.holder(pt) === 'us') return '<button type="button" class="btn small-btn" data-a="our-turn">Our turnover</button>';
    return `${review ? '' : '<button type="button" class="btn small-btn opp" data-a="opp-pass">Opponent pass</button>'}<button type="button" class="btn small-btn opp" data-a="opp-turn">Opponent turnover</button>`;
  }
  function liveScreen() {
    if (role() === 'lines') return linesLive();
    const g = G(), onField = liveOnField(), pv = getPreviews();
    const rest = S.players.filter((p) => !onField.includes(p.id) && !g.out[p.id]).map((p) => p.id);
    return `${scoreboard(true)}
    <div class="game">
      <section class="panel">
        <div class="live-top"><div class="timer-wrap"><div class="timer ${g.live.pausedAt ? 'paused' : ''} ${g.live.untimed ? 'untimed' : ''}" id="timer">${g.live.untimed ? 'Untimed' : clock(liveElapsed())}</div>${g.live.review || g.live.untimed ? '' : `<button type="button" class="btn small-btn" data-a="pause">${g.live.pausedAt ? 'Resume' : 'Pause'}</button>${g.live.pausedAt ? twoTap('reset-clock', 'reset-clock', 'Reset', 'Tap again: back to 0:00') : ''}`}</div>
        ${g.live.review
          ? `<div class="review"><div><h3>${g.live.review.result === 'us' ? 'We scored' : 'They scored'}</h3><p class="small muted">Check the play and the lineup, then finalize.</p></div><div class="chips"><button type="button" class="btn small-btn" data-a="keep-playing">Keep playing</button><button type="button" class="btn primary" data-a="finalize">Finalize point</button></div></div>`
          : '<div class="score-btns"><button type="button" class="btn primary" data-a="result" data-v="us">We scored</button><button type="button" class="btn" data-a="result" data-v="them">They scored</button></div>'}</div>
        ${g.live.review ? offFieldNote(g.live) : ''}
        ${fixBar()}
        ${selectionBar()}
        ${voiceBox()}
        ${chainStrip()}
        ${Root.entryMode === 'field' && !g.live.review ? entryField() : ''}
        <div class="panel-head"><span class="label">On the field</span>${legend()}${energyKey}<span class="right"><button type="button" class="btn small-btn" data-a="entry-mode" data-v="${Root.entryMode === 'field' ? 'list' : 'field'}">${Root.entryMode === 'field' ? 'Hide field' : 'Field view'}</button></span></div>
        <div class="cards">${onField.map(fieldCard).join('')}</div>
        <div class="panel-foot"><span class="chips">${twoTap('cancel-pt', 'cancel-point', 'Cancel this point', 'Tap again to cancel')}<button type="button" class="btn small-btn" data-a="fix-line">${fixLine ? 'Done fixing' : 'Fix lineup'}</button></span><span class="chips">${turnBtns(g.live, !!g.live.review)}</span></div>
      </section>
      <section class="panel" data-drop="none">
        ${role() === 'events' ? '' : `<div class="panel-head"><h2>Next up</h2>${modeSeg(true)}</div>
        <div class="next-cols">${compactLine(pv.us, 'If we score')}${compactLine(pv.them, 'If they score')}</div>`}
        <div class="label">Bench</div>
        ${benchFilters()}
        <div class="list">${benchList(rest, true)}</div>
      </section>
    </div>`;
  }

  function pointEditor() {
    const g = G(), i = editIdx, p = g.points[i], len = g.points.length;
    let us = 0, them = 0;
    g.points.slice(0, i + 1).forEach((x) => { x.result === 'us' ? us++ : them++; });
    const onField = liveOnField().filter(P);
    return `<section class="panel">
      <div class="panel-head"><h2>Point ${i + 1}</h2>${seg('pt-set', p.on, [['O', 'Offense'], ['D', 'Defense']], 'data-k="on"')}${seg('pt-set', p.result, [['us', 'We scored'], ['them', 'They scored']], 'data-k="result"')}<b>${us}–${them}</b>
        <span class="right"><button type="button" class="btn small-btn" data-a="edit-step" data-d="-1" ${i ? '' : 'disabled'}>Earlier</button><button type="button" class="btn small-btn" data-a="edit-step" data-d="1" ${i < len - 1 ? '' : 'disabled'}>Later</button><button type="button" class="btn small-btn primary" data-a="edit-done">Done</button></span></div>
      <div class="time-row"><span class="label">Point length</span><span class="step"><button type="button" data-a="pt-time" data-d="-15" aria-label="15 seconds less">−15</button><input id="pt-time" type="text" inputmode="numeric" data-c="pt-time" value="${clock(p.endedAt - p.startedAt)}" aria-label="Point length, minutes and seconds"><button type="button" data-a="pt-time" data-d="15" aria-label="15 seconds more">+15</button></span></div>
      ${offFieldNote(p)}${fixBar()}${selectionBar()}
      ${voiceBox()}
      ${chainStrip()}
      <div class="panel-head"><span class="label">On the field</span>${legend()}</div>
      <div class="cards">${onField.map(fieldCard).join('')}</div>
      ${fixLine ? `<div class="label">Not on the field</div><div class="list">${S.players.filter((x) => !onField.includes(x.id)).map((x) => benchRow(x.id, true)).join('')}</div>` : ''}
      <div class="panel-foot"><span class="chips"><button type="button" class="btn small-btn" data-a="pt-view-all">All points</button><button type="button" class="btn small-btn" data-a="fix-line">${fixLine ? 'Done fixing' : 'Fix lineup'}</button><button type="button" class="btn small-btn" data-a="pt-insert" data-v="before">Insert point before</button><button type="button" class="btn small-btn" data-a="pt-insert" data-v="after">Insert point after</button>${twoTap('ptdel-' + i, 'pt-delete', 'Delete point', 'Tap again', 'danger')}</span><span class="chips">${turnBtns(p, false)}</span></div>
    </section>`;
  }

  // Sort by date, then by clock time, whether written 9:00 AM or 21:00.
  const whenKey = (x) => { const m = /(\d{1,2})(?::(\d\d))?\s*([ap])?/i.exec(x.time || ''); let h = m ? Number(m[1]) % 24 : 0; if (m && m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0); return `${x.date} ${String(h).padStart(2, '0')}:${m && m[2] ? m[2] : '00'}`; };
  function setupScreen() {
    if (!S.players.length) return `<section class="panel"><h2>Add your players first</h2><p>Your roster is empty. Add names and rate each player, then come back to start a game.</p><div><button type="button" class="btn primary" data-a="tab" data-v="roster">Go to Teams</button></div></section>`;
    const s = S.setup || (S.setup = { opponent: '', startOn: 'O', out: {} });
    const here = S.players.filter((p) => !s.out[p.id]).length;
    const next = S.schedule.filter((x) => !x.gameId && x.kind !== 'practice').sort((a, b) => whenKey(a).localeCompare(whenKey(b))).slice(0, 6);
    const last = lastFinal(), pick = s.scheduleId && S.schedule.find((x) => x.id === s.scheduleId), comp = s.competitionId && compOf(s.competitionId);
    return `${last && !last.sent ? `<div class="banner"><span>Final: ${esc(S.team)} ${last.us}, ${esc(last.opponent || 'Opponent')} ${last.them}.</span>${(last.points || []).length ? `<button type="button" class="btn small-btn" data-a="open-sheet" data-v="${last.id}">Scoresheet</button><button type="button" class="btn small-btn" data-a="open-box" data-v="${last.id}">Box score</button>` : ''}<button type="button" class="btn small-btn" data-a="send-open">Send report</button></div>` : ''}
    <section class="panel"><h2>Start a game</h2>
      ${next.length ? `<div class="field"><span class="label">Pick the game</span><div class="pick-games">${next.map((x) => `<button type="button" class="tog game-pick" data-a="pick-scheduled" data-id="${x.id}" aria-pressed="${s.scheduleId === x.id}"><strong>vs ${esc(x.opponent || 'Opponent')}</strong><span class="small">${esc(longDate(x.date))}${x.time ? ' · ' + esc(x.time) : ''}</span><span class="small muted">${compLabel(x)}${x.location ? ' · ' + esc(x.location) : ''}</span></button>`).join('')}</div></div>`
        : '<p class="muted">No games on the schedule. League games appear here once your league schedules them.</p>'}
      <div class="chips"><button type="button" class="btn small-btn" data-a="create-game">Create a scrimmage</button></div>
      ${pick ? `${gendzone() ? `<div class="field"><span class="label">Starts in the gendzone</span>${seg('gendzone-first', s.gendzoneUs === false ? 'them' : 'us', [['us', 'Us'], ['them', 'Them']])}</div>` : ''}
      <div class="field"><span class="label">Who's here? ${here} of ${S.players.length}</span><div class="attend">${S.players.map((p) => { const r = s.scheduleId && (S.rsvpAnswers || {})[`${s.scheduleId}_${p.id}`]; return `<button type="button" class="tog" data-a="setup-out" data-id="${p.id}" aria-pressed="${!s.out[p.id]}">${esc(p.name)}${r ? ` <span class="rsvp-mark rsvp-${r.status}" title="RSVP: ${r.status}">${r.status === 'yes' ? '✓' : r.status === 'no' ? '✗' : '?'}</span>` : ''}</button>`; }).join('')}</div></div>
      <button type="button" class="btn go" data-a="start-game" ${here ? '' : 'disabled'}>Start game vs ${esc(pick.opponent || 'Opponent')}</button>` : ''}</section>
    ${pick ? `<section class="panel"><details class="setup-rules"><summary><h2>Game Rules</h2><span class="small muted">${rules().size} a side · to ${rules().gameTo} · half at ${rules().halfAt}${rules().division === 'mixed' ? ' · mixed' : ''}${comp ? ` · ${esc(comp.name)} rules` : ''}</span></summary>${gameRulesBody(true)}<p class="small muted">${comp ? `These start as ${esc(comp.name)}'s rules. ` : "These start as your team's rules. "}Changes here are for this game only, when both captains agree.</p></details></section>` : ''}`;
  }

  /* ---------- Roster ---------- */
  function teamsPanel() {
    return `<section class="panel"><div class="panel-head"><h2>This team</h2><span class="right">${S.history.length || (S.game && S.game.points.length) ? insightBtn('team', S.id, 'Team insights') : ''}</span></div>
      <div class="form-row"><label class="field grow"><span class="label">Team name</span><input id="team-name" type="text" data-c="team" value="${esc(S.team)}" autocomplete="off"></label><label class="field"><span class="label">Nickname</span><input type="text" data-c="team-nick" value="${esc(S.nickname || '')}" placeholder="Prime" autocomplete="off"></label>
      ${Root.teams.length > 1 && isAdmin() ? twoTap('delteam-' + S.id, 'delete-team', 'Delete team', 'Tap again to delete', 'danger') : ''}</div>
      <div class="field"><span class="label">Linked teams</span><div class="taglist">${(S.links || []).map((l) => `<span class="chip">${Root.teams.some((t) => t.id === l.id) ? `<button type="button" class="linkish" data-a="switch-team" data-v="${l.id}">${esc(l.name)}</button>` : esc(l.name)}<button type="button" data-a="unlink-team" data-v="${l.id}" aria-label="Unlink ${esc(l.name)}">✕</button></span>`).join('')}<input type="text" class="link-input" data-c="add-link" list="link-list" placeholder="Link a team, like your 6th grade team" autocomplete="off"></div>
        <datalist id="link-list">${[...new Set([...Root.teams.filter((t) => t.id !== S.id).map((t) => t.team), ...dirNames()])].map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
      <label class="check"><input type="checkbox" data-c="youth" ${S.youth ? 'checked' : ''}> Youth team <span class="small muted">(Gx/Bx instead of WMP/MMP)</span></label>
      ${isAdmin() ? `<div class="form-row brand-row"><label class="field"><span class="label">Team color</span><input type="color" data-c="team-color" value="${Report.safeColor(S.color)}"></label>
        <div class="field"><span class="label">Logo</span><div class="chips">${S.logo ? `<img class="logo-prev" src="${S.logo}" alt="Team logo">` : ''}<label class="btn small-btn file-btn">${S.logo ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/*" data-c="team-logo" hidden></label>${S.logo ? '<button type="button" class="btn small-btn" data-a="logo-remove">Remove</button>' : ''}</div></div></div>` : (S.logo ? `<img class="logo-prev" src="${S.logo}" alt="Team logo">` : '')}
      ${isAdmin() ? `<div class="pal-row"><span class="label">Team colors</span>${['Primary', 'Secondary', 'Tertiary'].map((l, i) => `<label class="pal-pick" title="${l}"><input type="color" data-c="pal" data-i="${i}" value="${((S.palette || [])[i]) || (i ? '#888888' : Report.safeColor(S.color))}"><span class="small">${l}</span></label>`).join('')}</div>` : ''}
      ${S.palette && S.palette.length ? `<p class="small muted">Pick <b>Current team</b> under Settings → Color scheme to use them.</p>` : ''}</section>`;
  }
  // The day a finished game was scheduled for, or the day it was played if it wasn't on the schedule.
  const gameDay = (h, t) => { const x = ((t || S).schedule || []).find((y) => y.gameId === h.id); return x && x.date ? x.date : localDay(new Date(h.date)); };
  const shortDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const longDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const lastFinal = () => S.history.find((h) => h.id === S.lastFinal) || S.history[S.history.length - 1];
  const subscribers = () => S.players.flatMap((p) => (p.contacts || []).filter((c) => c.subscribed).map((c) => c.email));
  function gamesPanel() {
    const all = S.schedule.slice().sort((a, b) => whenKey(a).localeCompare(whenKey(b)));
    const today = localDay();
    const games = all.filter((x) => x.kind !== 'practice'), practices = all.filter((x) => x.kind === 'practice');
    const upcoming = games.filter((x) => !x.gameId), played = games.filter((x) => x.gameId).reverse();
    const pracNext = practices.filter((x) => x.date >= today), pracPast = practices.filter((x) => x.date < today).reverse();
    const rsvpOf = (x) => { const ans = Object.values(S.rsvpAnswers || {}).filter((v) => v.game === x.id && P(v.player)); if (!ans.length) return ''; const n = (s) => ans.filter((v) => v.status === s).length; return `<details class="rsvp-list"><summary class="small">RSVP: ${n('yes')} yes · ${n('no')} no · ${n('maybe')} maybe</summary>${ans.map((v) => `<span class="small rsvp-${v.status}">${esc(P(v.player).name)}: ${v.status}${v.note ? ` (${esc(v.note)})` : ''}</span>`).join('')}</details>`; };
    const editRow = (x) => `<form class="form-row game-edit" data-form="schedule-edit" data-id="${x.id}">${x.kind === 'practice' ? '' : `<label class="field grow"><span class="label">Opponent</span><input id="se-opp" type="text" list="opp-list" value="${esc(x.opponent || '')}" autocomplete="off"></label>`}<label class="field"><span class="label">Date</span><input id="se-date" type="date" value="${esc(x.date || '')}" required></label><label class="field"><span class="label">Time</span><input id="se-time" type="text" value="${esc(x.time || '')}" placeholder="10:00 AM" autocomplete="off"></label><label class="field grow"><span class="label">Location</span><input id="se-loc" type="text" list="loc-list" value="${esc(x.location || '')}" autocomplete="off"></label>${x.kind === 'practice' ? '' : (x.fixtureId && x.competitionId ? '' : `<label class="field"><span class="label">Competition</span><select id="se-comp">${compOptions(x.competitionId ? `${x.competitionId}|${x.group || ''}` : '', true)}</select></label>`)}<button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-a="game-edit" data-id="">Cancel</button></form>`;
    const reportRow = (x) => `<form class="game-edit report-form" data-form="report-score" data-id="${x.id}"><strong>${esc(longDate(x.date))} vs ${esc(x.opponent || 'Opponent')}: report the score</strong>
      <div class="form-row"><label class="field"><span class="label">${esc(S.team)}</span><input id="rs-us" type="number" min="0" max="99" inputmode="numeric" required data-c="rs-us" value="${esc(reporting.us || '')}"></label><label class="field"><span class="label">${esc(x.opponent || 'Opponent')}</span><input id="rs-them" type="number" min="0" max="99" inputmode="numeric" required data-c="rs-them" value="${esc(reporting.them || '')}"></label></div>
      <span class="label">Who played? ${Object.keys(reporting.attend).length} of ${S.players.length}</span><div class="attend">${S.players.map((p) => `<button type="button" class="tog" data-a="report-attend" data-id="${p.id}" aria-pressed="${!!reporting.attend[p.id]}">${esc(p.name)}</button>`).join('')}</div>
      <div class="chips"><button class="btn primary" type="submit">Save score</button><button class="btn" type="button" data-a="report-close">Cancel</button></div></form>`;
    const row = (x) => (editingGame === x.id ? editRow(x) : reporting && reporting.id === x.id ? reportRow(x) : `<div class="game-row"><div class="game-info"><strong>${esc(longDate(x.date))}${x.time ? ' · ' + esc(x.time) : ''} vs ${esc(x.opponent || 'Opponent')}</strong><span class="small muted">${compLabel(x)}${x.location ? ' · ' + esc(x.location) : ''}${x.lat != null ? ` · <a href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}" target="_blank" rel="noopener">Directions</a>` : ''}</span>${x.gameId ? `<span class="small">Final ${x.us}–${x.them}${(S.history.find((h) => h.id === x.gameId) || {}).reported ? ' · reported' : ''}</span>` : ''}${x.gameId ? '' : rsvpOf(x)}</div>
      <div class="chips">${x.gameId ? `<button type="button" class="btn small-btn" data-a="send-open">Send report</button>${((S.history.find((h) => h.id === x.gameId) || {}).points || []).length ? twoTap('reopen-' + x.id, 'reopen-game', 'Reopen', 'Tap again to reopen', '', `data-id="${x.gameId}" ${S.game ? 'disabled' : ''}`) : ''}` : `<button type="button" class="btn small-btn primary" data-a="start-scheduled" data-id="${x.id}" ${S.game ? 'disabled' : ''}>Start</button><button type="button" class="btn small-btn" data-a="report-open" data-id="${x.id}">Report score</button>`}<button type="button" class="btn small-btn" data-a="game-edit" data-id="${x.id}">Edit</button>${twoTap('delgame-' + x.id, 'del-schedule', 'Remove', x.gameId || (S.game && S.game.scheduleId === x.id) ? 'Tap again: deletes its stats' : 'Tap again', 'danger', `data-id="${x.id}"`)}</div></div>`);
    const pracRow = (x) => {
      if (editingGame === x.id) return editRow(x);
      const here = Object.keys(x.attend || {}).filter((id) => P(id) && x.attend[id]).length;
      return `<div class="game-row prac"><div class="game-info"><strong>Practice · ${esc(longDate(x.date))}${x.time ? ' · ' + esc(x.time) : ''}</strong>${x.location ? `<span class="small muted">${esc(x.location)}</span>` : ''}<span class="small">${x.attend ? `${here} of ${S.players.length} here` : 'Attendance not taken'}</span>${x.date >= today ? rsvpOf(x) : ''}
        ${attendingPrac === x.id ? `<div class="attend">${S.players.map((p) => `<button type="button" class="tog" data-a="attend-toggle" data-id="${x.id}" data-p="${p.id}" aria-pressed="${!!(x.attend || {})[p.id]}">${esc(p.name)}</button>`).join('')}</div>` : ''}</div>
        <div class="chips"><button type="button" class="btn small-btn ${attendingPrac === x.id ? 'primary' : ''}" data-a="attend-open" data-id="${attendingPrac === x.id ? '' : x.id}">${attendingPrac === x.id ? 'Done' : 'Attendance'}</button><button type="button" class="btn small-btn" data-a="game-edit" data-id="${x.id}">Edit</button>${twoTap('delgame-' + x.id, 'del-schedule', 'Remove', 'Tap again', 'danger', `data-id="${x.id}"`)}</div></div>`;
    };
    const known = [...new Set([...Root.teams.filter((t) => t.id !== S.id).map((t) => t.team), ...dirNames()])];
    return `<section class="panel"><h2>${esc(S.team)} schedule</h2>${rsvpPanel()}${castPanel()}
      <div class="chips"><button type="button" class="btn small-btn ${schedOpen && schedKind === 'game' ? 'primary' : ''}" data-a="sched-new" data-v="game">Create game</button><button type="button" class="btn small-btn ${schedOpen && schedKind === 'practice' ? 'primary' : ''}" data-a="sched-new" data-v="practice">Add practice</button><button type="button" class="btn small-btn ${importing ? 'primary' : ''}" data-a="sched-import">Import from text</button>${S.schedule.length ? '<button type="button" class="btn small-btn" data-a="sched-export">Copy as text</button>' : ''}</div>
      ${importing ? importPanel() : ''}
      ${schedOpen ? `<form class="form-row sched-form" data-form="schedule"><input id="sch-kind" type="hidden" value="${schedKind}">
      ${schedKind === 'practice' ? '' : '<label class="field grow"><span class="label">Opponent</span><input id="sch-opp" type="text" list="opp-list" autocomplete="off" placeholder="Name, or pick a team"></label>'}
      <label class="field"><span class="label">Date</span><input id="sch-date" type="date" required></label><label class="field"><span class="label">Time</span><input id="sch-time" type="text" placeholder="10:00 AM" autocomplete="off"></label>
      <label class="field grow"><span class="label">Location</span><input id="sch-loc" type="text" list="loc-list" autocomplete="off"></label>
      ${schedKind === 'practice' || !comps().some(isCompAdmin) ? '' : `<label class="field"><span class="label">Competition</span><select id="sch-comp">${compOptions('', true)}</select></label>`}<button class="btn primary" type="submit">Add ${schedKind === 'practice' ? 'practice' : 'scrimmage'}</button></form>` : ''}
      <datalist id="loc-list">${locationList().map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <datalist id="opp-list">${known.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      ${upcoming.length ? `<div class="label">Upcoming games</div>${upcoming.map(row).join('')}` : '<p class="muted">No upcoming games.</p>'}
      ${pracNext.length ? `<div class="label">Upcoming practices</div>${pracNext.map(pracRow).join('')}` : ''}
      ${played.length ? `<div class="label">Played</div>${played.map(row).join('')}` : ''}
      ${pracPast.length ? `<details class="past-prac" ${pracPast.some((x) => x.id === attendingPrac || x.id === editingGame) ? 'open' : ''}><summary class="label">Past practices (${pracPast.length})</summary>${pracPast.map(pracRow).join('')}</details>` : ''}</section>`;
  }
  // Picking a listed team as the opponent ties both schedules to one shared fixture.
  function linkOpponent(x) {
    if (x.kind === 'practice') return;
    const hit = dirCache.find((d) => d.id !== S.id && d.name.toLowerCase() === (x.opponent || '').toLowerCase());
    if (hit) { x.oppTeamId = hit.id; if (CloudLink && CloudLink.user && S.access) CloudLink.fixture(S, x); } else { delete x.oppTeamId; }
  }
  const dirNames = () => dirCache.map((d) => d.name);
  function importPanel() {
    const rows = importing.rows;
    return `<div class="import-box"><label class="field"><span class="label">Paste a schedule: one game or practice per line</span><textarea id="import-text" rows="6" placeholder="Sat Nov 14 9am vs Tigers at Franklin HS East&#10;Practice Tue 11/17 5:30pm at Garfield">${esc(importing.text || '')}</textarea></label>
      <div class="chips"><button type="button" class="btn small-btn primary" data-a="import-read">Read schedule</button>${aiReady() ? `<button type="button" class="btn small-btn" data-a="import-ai" ${importing.busy ? 'disabled' : ''}>${importing.busy ? 'Reading…' : '✨ Read with AI'}</button>` : ''}<button type="button" class="btn small-btn" data-a="sched-import">Cancel</button></div>
      ${rows ? (rows.length ? `<div class="import-rows">${rows.map((x, i) => `<label class="import-row"><input type="checkbox" data-a="import-toggle" data-i="${i}" ${x.on ? 'checked' : ''}><span><strong>${esc(longDate(x.date))}${x.time ? ' · ' + esc(x.time) : ''}</strong> ${x.kind === 'practice' ? 'Practice' : `vs ${esc(x.opponent)}`}${x.location ? ` <span class="muted">at ${esc(x.location)}</span>` : ''}</span></label>`).join('')}</div><div class="chips"><button type="button" class="btn primary" data-a="import-add">Add ${rows.filter((x) => x.on).length} to the schedule</button></div>` : '<p class="small muted">No dates found. Each line needs a date like Nov 14, 11/14 or 2026-11-14.</p>') : ''}</div>`;
  }
  function copyText(txt, ok) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => flash(ok), () => { importing = { text: txt, rows: null }; render(); flash('Copying was blocked; the text is in the box.'); });
    else { importing = { text: txt, rows: null }; render(); }
  }
  const localDay = (d) => { const x = d || new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  // Players whose family said no start the game marked as not here.
  const rsvpOut = (gameId) => Object.fromEntries(Object.values(S.rsvpAnswers || {}).filter((v) => v.game === gameId && v.status === 'no').map((v) => [v.player, true]));
  const rsvpKey = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const b = new Uint8Array(22); crypto.getRandomValues(b); return [...b].map((x) => c[x % c.length]).join(''); };
  const rsvpUrl = () => `${window.SITE_URL || ''}rsvp.html#${S.rsvpKey}`;
  const castUrl = () => `${window.SITE_URL || ''}cast.html#${S.castKey}`;
  function castPanel() {
    if (!CloudLink || S.isExample || !CloudLink.user) return '';
    if (!S.castKey) return '<div class="chips"><button type="button" class="btn small-btn" data-a="cast-make">Make a Gamecast link</button><span class="small muted">A live scoreboard and field anyone can watch during your games.</span></div>';
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    return `<div class="rsvp-box"><label class="field grow"><span class="label">Gamecast link (live, anyone can watch)</span><input type="text" readonly value="${esc(castUrl())}"></label><div class="chips"><button type="button" class="btn small-btn" data-a="cast-copy">Copy link</button>${native ? '<button type="button" class="btn small-btn" data-a="cast-share">Share</button>' : ''}${twoTap('cast-new', 'cast-reset', 'New link', 'Tap again: old link stops working', 'danger')}</div><p class="small muted">Shows the score, clock, who's on (numbers and names) and the play-by-play while a game is going.</p></div>`;
  }
  function rsvpPanel() {
    if (!CloudLink || S.isExample) return '';
    if (!CloudLink.user) return '<p class="small muted">Sign in (Settings) to make an RSVP link families can use.</p>';
    if (!S.rsvpKey) return '<div class="chips"><button type="button" class="btn small-btn" data-a="rsvp-make">Make an RSVP link</button><span class="small muted">Families open it to say who\'s coming to each game. No sign-in needed.</span></div>';
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    return `<div class="rsvp-box"><label class="field grow"><span class="label">RSVP link for families</span><input type="text" readonly value="${esc(rsvpUrl())}" data-select="1"></label><div class="chips"><button type="button" class="btn small-btn" data-a="rsvp-copy">Copy link</button>${native ? '<button type="button" class="btn small-btn" data-a="rsvp-share">Share</button>' : ''}${twoTap('rsvp-new', 'rsvp-reset', 'New link', 'Tap again: old link stops working', 'danger')}</div><p class="small muted">Anyone with the link can see the schedule and the roster names, and answer for any player.</p></div>`;
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
      ${downloads || (CloudLink && !native) ? '<button type="button" class="btn small-btn" data-a="send-save">Save report file</button>' : ''}
      <button type="button" class="btn small-btn" data-a="send-copy" ${list.length ? '' : 'disabled'}>Copy addresses</button></div>
      ${!native ? '<p class="small muted">This page can\'t open your email app. In the Android app, Open in email starts a message with the report attached and everyone in BCC.</p>' : ''}
      ${reportNote ? `<p class="small" role="status">${esc(reportNote)}</p>` : ''}
      <textarea id="send-list" readonly aria-label="Subscriber addresses" class="send-list">${esc(list.join(', '))}</textarea>
      <div class="label">What families get</div>
      <div class="rp report-preview">${Report.fragment(S)}</div></div></div>`;
  }
  // Every team this account can see: its own, listed teams, and teams that exist only as names in a competition.
  function allTeams() {
    const map = new Map();
    const add = (id, f) => { const cur = map.get(id) || { id, comps: [] }; map.set(id, { ...cur, ...f, comps: cur.comps }); return map.get(id); };
    Root.teams.forEach((t) => add(t.id, { kind: 'mine', name: t.team, nick: t.nickname || '', logo: t.logo || '', color: t.color || '', youth: !!t.youth, players: t.players.length, inGame: !!t.game, example: !!t.isExample }));
    dirCache.forEach((d) => { if (!map.has(d.id)) add(d.id, { kind: 'listed', name: d.name, color: d.color || '' }); });
    comps().forEach((c) => (c.groups || []).forEach((g) => (g.teams || []).forEach((tm) => {
      const x = map.get(tm.id) || add(tm.id, { kind: tm.id.startsWith('name:') ? 'open' : 'listed', name: tm.name });
      if (x.kind !== 'mine') Object.assign(x, { name: tm.name, ...(tm.nick ? { nick: tm.nick } : {}), ...(tm.logo ? { logo: tm.logo } : {}), ...(tm.color ? { color: tm.color } : {}), ...(tm.palette ? { palette: tm.palette } : {}), ...(tm.links ? { links: tm.links } : {}) });
      x.comps.push({ id: c.id, label: `${c.name} · ${g.name}` });
    })));
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
  }
  function teamsList() {
    const kinds = [['all', 'All'], ['mine', 'My teams'], ['listed', 'Other teams'], ['open', 'No admin']];
    if (teamComp !== 'all' && !compOf(teamComp)) teamComp = 'all';
    const q = teamQuery.toLowerCase(), list = allTeams().filter((t) => (teamFilter === 'all' || t.kind === teamFilter) && (teamComp === 'all' || t.comps.some((c) => c.id === teamComp)) && (!q || t.name.toLowerCase().includes(q) || (t.nick || '').toLowerCase().includes(q)));
    const badge = (t) => (t.kind === 'open' ? '<span class="tag-comp friendly">No admin</span>' : t.kind === 'listed' ? '<span class="tag-comp friendly">Not yours</span>' : '') + (t.youth ? ' <span class="tag-comp">Youth</span>' : '') + (t.inGame ? ' <span class="live-chip">● In game</span>' : '');
    return `<section class="panel"><div class="panel-head"><h2>Teams</h2><span class="small muted">${list.length} shown</span></div>
      <div class="form-row"><label class="field grow"><span class="label">Find a team</span><input type="search" data-input="team-q" value="${esc(teamQuery)}" placeholder="Name or nickname" autocomplete="off"></label><div class="field"><span class="label">Show</span>${seg('team-filter', teamFilter, kinds)}</div>${comps().length ? `<label class="field"><span class="label">Competition</span><select data-c="team-comp"><option value="all">All competitions</option>${comps().map((c) => `<option value="${c.id}" ${teamComp === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}</div>
      <div class="team-list">${list.map((t) => `<button type="button" class="team-card" data-a="team-open" data-id="${esc(t.id)}">
        <span class="team-mark" style="background:${Report.safeColor(t.color)}">${t.logo ? `<img src="${t.logo}" alt="">` : esc((t.name || '?').slice(0, 1))}</span>
        <span class="team-text"><strong>${esc(t.name)}${t.nick ? ` <span class="muted">“${esc(t.nick)}”</span>` : ''}</strong><span class="small">${badge(t)}</span><span class="small muted">${t.kind === 'mine' ? `${t.players} players` : ''}${t.comps.length ? `${t.kind === 'mine' ? ' · ' : ''}${t.comps.map((c) => esc(c.label)).join(', ')}` : ''}</span></span></button>`).join('') || '<p class="muted">No teams match.</p>'}</div></section>
    <section class="panel"><h2>Add a team</h2><form class="form-row" data-form="team"><label class="field grow"><span class="label">Team name</span><input id="new-team" type="text" placeholder="Whitman 7th" autocomplete="off"></label><button class="btn primary" type="submit">Add team</button></form><p class="small muted">A new team starts with the current team's rules and an empty roster.</p></section>`;
  }
  // Teams with no admin keep their details on the competitions that list them; those competitions' admins look after them.
  function phEditor(t) {
    const pal = t.palette && t.palette.length ? t.palette : [Report.safeColor(t.color)];
    return `<div class="ph-edit"><div class="form-row"><label class="field grow"><span class="label">Team name</span><input type="text" data-c="ph-name" data-id="${esc(t.id)}" value="${esc(t.name)}" autocomplete="off"></label><label class="field"><span class="label">Nickname</span><input type="text" data-c="ph-nick" data-id="${esc(t.id)}" value="${esc(t.nick || '')}" autocomplete="off"></label></div>
      <div class="form-row brand-row"><div class="field"><span class="label">Logo</span><div class="chips">${t.logo ? `<img class="logo-prev" src="${t.logo}" alt="">` : ''}<label class="btn small-btn file-btn">${t.logo ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/*" data-c="ph-logo" data-id="${esc(t.id)}" hidden></label>${t.logo ? `<button type="button" class="btn small-btn" data-a="ph-logo-rm" data-id="${esc(t.id)}">Remove</button>` : ''}</div></div>
        <div class="pal-row"><span class="label">Team colors</span>${['Primary', 'Secondary', 'Tertiary'].map((l, i) => `<label class="pal-pick"><input type="color" data-c="ph-pal" data-id="${esc(t.id)}" data-i="${i}" value="${pal[i] || '#888888'}"><span class="small">${l}</span></label>`).join('')}</div></div></div>`;
  }
  function phUpdate(id, patch) {
    comps().forEach((c) => {
      let hit = false;
      (c.groups || []).forEach((g) => (g.teams || []).forEach((tm) => { if (tm.id === id) { Object.assign(tm, patch); hit = true; } }));
      (c.matchups || []).forEach((m) => [m.a, m.b].forEach((x) => { if (x.id === id && patch.name) { x.name = patch.name; if (m.slot) publishMatchup(c, m); } }));
      if (hit) touchComp(c);
    });
  }
  const canEditTeam = (id) => !!(CloudLink && CloudLink.god) || comps().some((c) => isCompAdmin(c) && teamInComp(c, id));
  function teamInfo(id) {
    const t = allTeams().find((x) => x.id === id);
    if (!t) { teamOpen = null; return teamsList(); }
    const open = t.kind === 'open', edit = open && canEditTeam(id);
    const when = (m) => (m.slot ? m.slot.date + m.slot.start : m.date || '');
    const games = comps().flatMap((c) => (c.matchups || []).filter((m) => (m.slot || m.result) && (m.a.id === id || m.b.id === id)).map((m) => ({ c, m }))).sort((x, y) => when(x.m).localeCompare(when(y.m)));
    const links = [...(t.links || []), ...Root.teams.filter((o) => (o.links || []).some((l) => l.id === id)).map((o) => ({ id: o.id, name: o.team }))].filter((l, i, all) => all.findIndex((q) => q.id === l.id) === i);
    const others = allTeams().filter((x) => x.id !== id && !x.example);
    return `<section class="panel"><div class="panel-head"><button type="button" class="btn small-btn back" data-a="team-close" aria-label="All teams">←</button><h2>${esc(t.name)}</h2><span class="small muted">${open ? 'No admin yet. Its competitions\' admins look after it.' : 'Run by its own coaches'}</span></div>
      ${t.comps.length ? `<div class="label">Competitions</div><div class="taglist">${t.comps.map((c) => `<button type="button" class="chip" data-a="comp-open" data-id="${c.id}" data-go="1">${esc(c.label)}</button>`).join('')}</div>` : ''}
      <div class="label">Games</div>${games.map(({ c, m }) => { const f = m.slot && fieldById(c, m.slot.fieldId); return `<div class="sub-row"><span><strong>${esc(longDate(m.slot ? m.slot.date : m.date))}${m.slot ? ' · ' + ampm(m.slot.start) : ''}</strong> ${esc(m.a.name)} vs ${esc(m.b.name)} <span class="small muted">${f ? esc(f.label) + ' · ' : ''}${esc(c.name)}${m.playoff ? ' · playoff' : ''}</span></span>${m.result ? `<b>${m.result.a}–${m.result.b}</b>` : ''}</div>`; }).join('') || '<p class="small muted">None yet.</p>'}
      ${links.length || edit ? `<div class="label">Linked teams</div><div class="taglist">${links.map((l) => `<span class="chip"><button type="button" class="linkish" data-a="team-open" data-id="${esc(l.id)}">${esc(l.name)}</button>${edit ? `<button type="button" data-a="ph-unlink" data-id="${esc(id)}" data-v="${esc(l.id)}" aria-label="Unlink ${esc(l.name)}">✕</button>` : ''}</span>`).join('')}${edit ? `<input type="text" class="link-input" data-c="ph-link" data-id="${esc(id)}" list="all-team-list" placeholder="Link a team" autocomplete="off">` : ''}</div>` : ''}
      ${edit ? phEditor(t) : ''}</section>
      ${edit ? `<section class="panel"><h2>Team admin</h2><p class="small muted">Give ${esc(t.name)} an admin and it's theirs to run: roster, staff, games and stats. It's added to the app with them as team admin; you stay on its staff until they remove you.</p>
        <form class="form-row" data-form="team-admin" data-id="${esc(id)}"><label class="field grow"><span class="label">Their Google email</span><input name="email" type="email" autocomplete="off" required></label><button class="btn primary" type="submit">Make them admin</button></form>
        <div class="chips"><button type="button" class="btn" data-a="team-adopt" data-id="${esc(id)}">Run it myself</button></div></section>
        <section class="panel"><h2>Merge</h2><p class="small muted">For a team entered twice. Its games, results, seeds and links move to the team you pick, and this record goes away.</p>
        <form class="form-row" data-form="team-merge" data-id="${esc(id)}"><label class="field grow"><span class="label">Merge ${esc(t.name)} into</span><select name="to">${others.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.kind === 'mine' ? ' (yours)' : x.kind === 'open' ? ' (no admin)' : ''}</option>`).join('')}</select></label><button class="btn" type="submit">Merge</button></form></section>` : ''}
      <datalist id="all-team-list">${others.map((x) => `<option value="${esc(x.name)}"></option>`).join('')}</datalist>`;
  }
  // Put a team with no admin on this device as a real team, keeping its id's games.
  function adoptTeam(id) {
    const old = allTeams().find((x) => x.id === id);
    if (!old) return null;
    const t = blank(JSON.parse(JSON.stringify(S.rules)), old.name); Object.assign(t, { nickname: old.nick || '', logo: old.logo || undefined, color: old.color || undefined, palette: old.palette || undefined, links: (old.links || []).slice() }); Root.teams.push(t);
    mergeTeamRefs(id, { id: t.id, name: t.team });
    (old.links || []).forEach((l) => { const o = Root.teams.find((x) => x.id === l.id); if (o) o.links = (o.links || []).filter((x) => x.id !== id && x.id !== t.id).concat({ id: t.id, name: t.team }); });
    return t;
  }
  function rosterScreen() {
    const back = '<div class="chips"><button type="button" class="btn small-btn" data-a="team-close">← All teams</button></div>';
    if (teamView === 'coaches') return `${back}${teamsPanel()}${teamSeg()}${staffPanel()}`;
    if (teamView === 'lines') return `${back}${teamsPanel()}${teamSeg()}${linesPanel()}`;
    const skills = allSkills(), g = S.game;
    return `${back}${teamsPanel()}${teamSeg()}${gamesPanel()}<section class="panel"><div class="panel-head"><h2>${esc(S.team)} roster</h2><span class="small muted">Tap a number to change it. Tap a name for jersey, tags and playtime.</span></div>
      <form class="form-row" data-form="add"><label class="field grow"><span class="label">Add players (separate names with commas)</span><input id="add-name" type="text" data-input="person-search" placeholder="Sam, Priya, Theo" autocomplete="off"><span id="person-hits" class="person-hits"></span></label><button class="btn primary" type="submit">Add</button></form>
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
      <div class="form-row"><label class="field grow"><span class="label">Nickname</span><input type="text" data-c="edit-nick" value="${esc(p.nick || '')}" placeholder="Shown with their name" autocomplete="off"></label>
        <label class="check"><input type="checkbox" data-a="edit-youth" ${p.youth ? 'checked' : ''}> Youth player</label></div>
      ${(() => { const per = personFor(p); return `<div class="field"><span class="label">Account</span><div class="form-row"><label class="field grow"><span class="label">${p.youth ? 'Player email (optional for youth players)' : "Player's Google email"}</span><input type="email" data-c="edit-email" value="${esc(per.email || '')}" autocomplete="off"></label><span class="small muted">${per.uid ? 'Signed in' : per.email ? 'Placeholder until they sign in' : 'Placeholder'}</span></div>${p.youth ? `<p class="small muted">Parents listed below (Who: Parent) manage this player's account.${(per.guardians || []).length ? ' Parents: ' + per.guardians.map(esc).join(', ') : ''}</p>` : ''}</div>`; })()}
      <div class="field"><span class="label">Gender</span>${seg('set-match', p.match, [['M', S.youth ? 'Boy (Bx)' : 'Male (MMP)'], ['W', S.youth ? 'Girl (Gx)' : 'Female (WMP)']])}</div>
      ${allSkills().map(([k, l]) => `<div class="field"><span class="label">${esc(l)}</span><div class="pips">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-a="set-skill" data-k="${k}" data-v="${v}" aria-pressed="${E.rate(p, k) === v}">${v}</button>`).join('')}</div></div>`).join('')}
      <div class="field"><span class="label">Tags</span><div class="taglist">${rules().tags.map((t) => `<button type="button" class="tog" data-a="toggle-tag" data-v="${esc(t)}" aria-pressed="${p.tags.includes(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">Playtime target</span>${seg('set-target', p.target, E.TARGETS.map((t) => [t, TARGET_LABEL[t]]))}</div>
      <div class="rl"><span>Minimum points per game</span>${stepper('set-min', E.minPointsOf(p), 0, 15)}</div>
      <label class="field"><span class="label">Sounds like (for voice)</span><input id="edit-alias" type="text" data-c="edit-alias" value="${esc(p.aliases || '')}" placeholder="Other spellings or nicknames, separated by commas" autocomplete="off"></label>
      <div class="field"><span class="label">Contacts for stats emails</span>
        ${(p.contacts || []).map((c) => `<div class="sub-row"><span><strong>${esc(c.name || c.email)}</strong> <span class="small muted">${esc(c.relation)} · ${esc(c.email)}</span></span><span class="chips"><button type="button" class="tog here" data-a="toggle-sub" data-id="${p.id}" data-v="${c.id}" aria-pressed="${c.subscribed}">${c.subscribed ? 'Subscribed' : 'Off'}</button><button type="button" class="btn small-btn danger" data-a="del-contact" data-v="${c.id}">Remove</button></span></div>`).join('')}
        <form class="form-row" data-form="contact"><label class="field grow"><span class="label">Name</span><input id="c-name" type="text" autocomplete="off"></label><label class="field grow"><span class="label">Email</span><input id="c-email" type="email" autocomplete="off" required></label><label class="field"><span class="label">Who</span><select id="c-rel"><option>Parent</option><option>Guardian</option><option>Player</option><option>Other</option></select></label><button class="btn" type="submit">Add</button></form></div>
      <div>${twoTap('del-' + p.id, 'delete-player', 'Remove player', 'Tap again to remove', 'danger')}</div>
    </div></div>`;
  }

  /* ---------- Playtime and stats ---------- */
  const STAT_KEYS = [['touch', 'Touches'], ['goal', 'Goals'], ['assist', 'Assists'], ['turn', 'Turnovers'], ['drop', 'Drops'], ['block', 'Blocks']];
  function statTotals(season) {
    const g = G(), totals = new Map(S.players.map((p) => [p.id, { played: 0, O: 0, D: 0, ms: 0, games: 0, touch: 0, goal: 0, comp: 0, rec: 0, assist: 0, turn: 0, drop: 0, block: 0 }]));
    const passing = (points) => Report.totals(points || []).forEach((v, id) => { const t = totals.get(id); if (t) { t.comp += v.comp; t.rec += v.rec; } });
    const add = (id, v) => { const t = totals.get(id); if (!t) return; t.played += v.played || 0; t.O += v.O || 0; t.D += v.D || 0; t.ms += v.ms || 0; if (v.played || v.attended) t.games += 1; STAT_KEYS.forEach(([k]) => { t[k] += v[k] || 0; }); };
    if (season) S.history.forEach((h) => { Object.entries(h.perPlayer).forEach(([id, v]) => add(id, v)); passing(h.points); });
    if (g) {
      stats().forEach((s, id) => add(id, s));
      passing(g.points);
      if (g.live) g.live.events.forEach((e) => { const t = totals.get(e.id); if (t && t[e.t] !== undefined) t[e.t] += 1; if (t && e.t === 'turn' && e.sub === 'drop') t.drop += 1; });
    }
    return totals;
  }
  const ptHead = (k, label, cls, st) => `<span class="${cls}"><button type="button" class="sorth" data-a="pt-sort" data-v="${k}" ${st.key === k ? `aria-sort="${st.dir < 0 ? 'descending' : 'ascending'}"` : ''}>${label}${st.key === k ? (st.dir < 0 ? ' ▾' : ' ▴') : ''}</button></span>`;
  function playtimeScreen() {
    const g = G(), showSeason = seasonView || !g;
    const viewSeg = seg('pt-view', ptView, [['time', 'Playtime'], ['points', 'Points'], ['combos', 'Combos']]);
    if (ptView === 'points') return pointsScreen(viewSeg);
    if (ptView === 'sheet') ptView = 'points';
    if (ptView === 'stats') ptView = 'time';
    if (ptView === 'combos') return combosScreen(viewSeg);
    const toggle = `<span class="right">${viewSeg}${seg('season', showSeason ? 'season' : 'game', [...(g ? [['game', 'This game']] : []), ['season', 'Season']])}</span>`;
    let body = '';
    if (showSeason) {
      const totals = statTotals(true);
      const max = Math.max(1, ...[...totals.values()].map((t) => t.played));
      const avg = [...totals.values()].reduce((a, t) => a + t.played, 0) / Math.max(1, totals.size);
      const sv = (p, k) => { const t = totals.get(p.id); return k === 'games' ? t.games : k === 'min' ? t.ms : t.played; };
      const st = ptSort && ['name', 'played', 'games', 'min'].includes(ptSort.key) ? ptSort : { key: 'played', dir: -1 };
      body = `<div class="pt head">${ptHead('name', 'Player', '', st)}<span>Points (tick is team average, ${avg.toFixed(1)})</span>${ptHead('played', 'Points', 'r', st)}${ptHead('games', 'Games', 'r opt', st)}${ptHead('min', 'Min', 'r', st)}<span></span></div>` +
        S.players.slice().sort((a, b) => (st.key === 'name' ? st.dir * a.name.localeCompare(b.name) : st.dir * (sv(a, st.key) - sv(b, st.key))) || totals.get(b.id).played - totals.get(a.id).played).map((p) => { const t = totals.get(p.id); return `<div class="pt"><span class="nm">${pLink(p)}</span><div class="meter"><i style="width:${t.played / max * 100}%"></i><u style="left:${avg / max * 100}%"></u></div><span class="r">${t.played}</span><span class="r opt">${t.games}</span><span class="r">${Math.round(t.ms / E.MIN)}</span><span></span></div>`; }).join('');
      if (!S.history.length && !g) body += '<p class="muted">Finished games add up here.</p>';
    } else {
      const st = stats();
      const gs = ptSort && ['name', 'played', 'O', 'ms', 'energy'].includes(ptSort.key) ? ptSort : { key: 'owed', dir: -1 };
      const max = Math.max(1, ...[...st.values()].flatMap((s) => [s.played, s.target]));
      body = `<div class="pt head">${ptHead('name', 'Player', '', gs)}<span>Points (tick is target)</span>${ptHead('played', 'Pts / target', 'r', gs)}${ptHead('O', 'O / D', 'r opt', gs)}${ptHead('ms', 'Time', 'r', gs)}${ptHead('energy', 'Energy', '', gs)}</div>` +
        S.players.slice().sort((a, b) => (gs.key === 'name' ? gs.dir * a.name.localeCompare(b.name) : gs.key === 'owed' ? gs.dir * ((st.get(a.id).target - st.get(a.id).played) - (st.get(b.id).target - st.get(b.id).played)) : gs.dir * (st.get(a.id)[gs.key] - st.get(b.id)[gs.key])) || a.name.localeCompare(b.name)).map((p) => { const s = st.get(p.id), minP = E.minPointsOf(p), under = s.played < minP; return `<div class="pt"><span class="nm"><span class="tx">${pLink(p)}</span></span><div class="meter" ${tipAttr(`${s.played} played, target ${s.target.toFixed(1)}, minimum ${minP}`)}><i style="width:${s.played / max * 100}%"></i><u style="left:${s.target / max * 100}%"></u></div><span class="r ${under ? 'under' : ''}">${s.played} / ${s.target.toFixed(1)}</span><span class="r opt">${s.O} / ${s.D}</span><span class="r">${clock(s.ms)}</span>${freshPill(s.energy)}</div>`; }).join('');
    }
    return `<section class="panel"><div class="panel-head"><h2>Playtime</h2>${toggle}</div><div>${body}</div></section>${matchPanel(showSeason)}`;
  }

  function gameSources() {
    const g = G();
    const count = (pts, who) => pts.filter((p) => p.result === who).length;
    const dated = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return [...(g ? [{ key: 'current', label: `This game vs ${g.opponent || 'Opponent'}`, opponent: g.opponent, points: g.points }] : []),
      ...S.history.filter((h) => h.points).slice().reverse().map((h) => ({ key: h.id, label: `${shortDay(gameDay(h))} vs ${h.opponent || 'Opponent'}, ${h.us}–${h.them}`, opponent: h.opponent, points: h.points }))]
      .map((x) => ({ ...x, us: count(x.points, 'us'), them: count(x.points, 'them') }));
  }
  const pickSource = (sources) => sources.find((x) => x.key === pointsSource) || sources[0];
  const sourceSelect = (sources, src) => `<label class="field"><span class="label">Game</span><select id="points-src" data-c="points-src">${sources.map((x) => `<option value="${esc(x.key)}" ${x === src ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>`;
  const gameRec = (key) => (key === 'current' ? S.game : S.history.find((h) => h.id === key));
  function videoRow(key) {
    const rec = gameRec(key);
    if (!rec) return '';
    const url = Report.videoUrl(rec.video);
    return `<div class="form-row video-row"><label class="field grow"><span class="label">YouTube link</span><input type="url" inputmode="url" data-c="video" data-k="${esc(key)}" value="${esc(rec.video || '')}" placeholder="https://youtu.be/..." autocomplete="off"></label>${url ? `<a class="btn small-btn" href="${esc(url)}" target="_blank" rel="noopener">▶ Watch</a>` : ''}</div>`;
  }
  function videoStartRow(key) {
    const rec = gameRec(key);
    if (!rec || !Report.videoUrl(rec.video)) return '';
    return `<div class="form-row"><label class="field"><span class="label">Video time when point 1 starts</span><input type="text" inputmode="numeric" data-c="video-start" data-k="${esc(key)}" value="${clock((rec.videoStart || 0) * 1000)}" placeholder="0:00"></label><span class="small muted">Each point links to its moment in the video.</span></div>`;
  }
  const viewHead = (title, viewSeg) => `<div class="panel-head"><h2>${title}</h2><span class="right">${viewSeg}</span></div>`;

  function videoAt(rec, src, p) {
    const url = rec && Report.videoUrl(rec.video);
    if (!url || !src.points.length) return '';
    const s = Math.max(0, Math.round((rec.videoStart || 0) + (p.startedAt - src.points[0].startedAt) / 1000));
    try { const u = new URL(url); u.searchParams.set('t', `${s}s`); return `<a class="vid-at" href="${esc(u.href)}" target="_blank" rel="noopener" title="Watch this point">▶ ${clock(s * 1000)}</a>`; } catch (e) { return ''; }
  }
  function pointCard(src, p, i, us, them) {
      const name = (id) => (P(id) ? esc(P(id).name) : 'Removed player');
      const ev = p.events || [], goal = ev.find((e) => e.t === 'goal'), assist = ev.find((e) => e.t === 'assist');
      const by = p.result === 'us' ? (goal && P(goal.id) ? `${goal.sub === 'callahan' ? 'Callahan' : 'Goal'}: ${nameTag(P(goal.id))}` : 'We scored') : 'Opponent goal';
      const poss = Report.possession(p);
      const tally = (title, match) => { const m = new Map(); ev.filter(match).forEach((e) => { if (e.id) m.set(e.id, (m.get(e.id) || 0) + 1); }); return m.size ? `<span><b>${title}:</b> ${[...m].map(([id, n]) => `${name(id)} ${n}`).join(', ')}</span>` : ''; };
      // Blocks, interceptions and Callahans are opponent turnovers too.
      const opp = ev.filter((e) => e.t === 'oppturn' || e.t === 'block' || (e.t === 'goal' && e.sub === 'callahan')).length;
      const notes = [tally('Throwaways', (e) => e.t === 'turn' && e.sub !== 'drop'), tally('Drops', (e) => e.t === 'turn' && e.sub === 'drop'), tally('Blocks', (e) => e.t === 'block' && e.sub !== 'int'), tally('Interceptions', (e) => e.t === 'block' && e.sub === 'int'), opp ? `<span><b>Opponent turnovers:</b> ${opp}</span>` : ''].join('');
      const chips = p.lineup.filter((id) => P(id)).map((id) => `<span class="sug static">${tile(P(id), true)}<span>${name(id)}</span><span class="tag small muted" ${tipAttr(posName((p.roles || {})[id]))}>${esc(posAbbr((p.roles || {})[id]))}</span></span>`).join('');
      const events = (p.puller && P(p.puller) ? `<span class="ev stat e-pull">Pull: ${name(p.puller)}</span>${p.events && p.events.length ? '<span class="sep" aria-hidden="true"></span>' : ''}` : '') + narrativeHtml(p.events);
      const subs = (p.subs || []).map((s) => `${name(s.in)} in for ${name(s.out)}`).join(', ');
      return `<article class="pp">
        <div class="pg"><span class="pg-no">${i + 1}</span><span class="pg-score ${p.result}">${us} - ${them}</span>
          <div class="pg-by"><strong>${by}</strong>${assist && P(assist.id) ? `<span class="small muted">Assist: ${nameTag(P(assist.id))}</span>` : ''}</div>
          <span class="pg-start on${p.on}" title="${p.on === 'O' ? 'Started on offense' : 'Started on defense'}">${p.on}</span>
          ${Report.possessionBar(p, S.color)}
          <div class="pg-len"><b>${clock(p.endedAt - p.startedAt)}</b>${videoAt(gameRec(src.key), src, p)}<span class="small muted">${poss.catches} ${poss.catches === 1 ? 'catch' : 'catches'}</span>${poss.oppPasses ? `<span class="small muted">${poss.oppPasses} opp. ${poss.oppPasses === 1 ? 'pass' : 'passes'}</span>` : ''}</div>
          <div class="pg-notes small">${notes || '<span class="muted">No turnovers or blocks</span>'}</div>
          ${src.key === 'current' ? `<button type="button" class="btn small-btn pg-edit" data-a="edit-point" data-v="${i}">Edit</button>` : ''}</div>
        <div class="sug-chips">${chips}</div>
        ${events ? `<div class="chain quiet">${events}</div>` : ''}${subs ? `<p class="small muted">Subs: ${subs}</p>` : ''}</article>`;
  }
  function halftimeView() {
    const g = S.game, sc = E.score({ points: g.points.slice(0, g.halftimeAt || g.points.length) }), st = stats();
    const tot = Report.totals(g.points), lead = (k, label) => { const top = [...tot].filter(([id, v]) => P(id) && v[k]).sort((a, b) => b[1][k] - a[1][k]).slice(0, 3); return top.length ? `<div><span class="label">${label}</span>${top.map(([id, v]) => `<div>${esc(P(id).name)} <b>${v[k]}</b></div>`).join('')}</div>` : ''; };
    const owe = S.players.filter((p) => !g.out[p.id]).map((p) => ({ p, s: st.get(p.id) })).filter((x) => x.s && E.minPointsOf(x.p) > x.s.played).sort((a, b) => (E.minPointsOf(b.p) - b.s.played) - (E.minPointsOf(a.p) - a.s.played));
    const behind = S.players.filter((p) => !g.out[p.id]).map((p) => ({ p, s: st.get(p.id) })).filter((x) => x.s && x.s.target - x.s.played >= 1).sort((a, b) => (b.s.target - b.s.played) - (a.s.target - a.s.played)).slice(0, 6);
    return `<div class="scrim" data-a="halftime-close" data-self="1"><div class="sheet half-sheet" role="dialog" aria-label="Halftime">
      <div class="half-burst" aria-hidden="true"><span class="half-disc"></span><span class="half-word">Halftime</span></div>
      <div class="half-score"><div><b>${sc.us}</b><span>${esc(S.team)}</span></div><span class="dash">–</span><div><b>${sc.them}</b><span>${esc(g.opponent || 'Opponent')}</span></div></div>
      <h3>Team stats</h3>${Report.teamTable(g.points.slice(0, g.halftimeAt || g.points.length), S.team, g.opponent)}
      <div class="half-leads">${lead('goal', 'Goals')}${lead('assist', 'Assists')}${lead('block', 'Blocks')}${lead('comp', 'Completions')}</div>
      ${owe.length ? `<div class="warns"><b>Still need their minimum</b>${owe.map((x) => `<span>${esc(x.p.name)}: ${x.s.played} of ${E.minPointsOf(x.p)} points</span>`).join('')}</div>` : ''}
      ${behind.length ? `<h3>Furthest behind their share</h3><div class="half-behind">${behind.map((x) => `<span>${esc(x.p.name)} <b>${x.s.played}</b>/${x.s.target.toFixed(1)}</span>`).join('')}</div>` : ''}
      <div class="chips"><button type="button" class="btn primary" data-a="halftime-close">Start the second half</button></div></div></div>`;
  }
  function pointSheetView() {
    const src = gameSources().find((x) => x.key === pointSheet.key), p = src && src.points[pointSheet.i];
    if (!p) return '';
    let us = 0, them = 0;
    src.points.slice(0, pointSheet.i + 1).forEach((x) => { x.result === 'us' ? us++ : them++; });
    return `<div class="scrim" data-a="point-close" data-self="1"><div class="sheet point-sheet" role="dialog" aria-label="Point ${pointSheet.i + 1}"><div class="panel-head"><h2>Point ${pointSheet.i + 1}</h2><span class="right"><button type="button" class="btn small-btn" data-a="flow-point" data-v="${pointSheet.i - 1}" ${pointSheet.i ? '' : 'disabled'}>Earlier</button><button type="button" class="btn small-btn" data-a="flow-point" data-v="${pointSheet.i + 1}" ${pointSheet.i < src.points.length - 1 ? '' : 'disabled'}>Later</button><button type="button" class="btn small-btn primary" data-a="point-close">Done</button></span></div>${pointCard(src, p, pointSheet.i, us, them)}</div></div>`;
  }
  function pointsScreen(viewSeg) {
    const sources = gameSources(), src = pickSource(sources), head = viewHead('Points', viewSeg);
    if (!src) return `<section class="panel">${head}<p class="muted">Finished points show up here.</p></section>`;
    let us = 0, them = 0;
    const rows = src.points.map((p, i) => {
      p.result === 'us' ? us++ : them++;
      return pointCard(src, p, i, us, them);
    }).join('');
    const pgHead = rows ? `<div class="pg pg-head"><span>#</span><span>Score</span><span>Scored by</span><span>Start</span><span>Disc possession (bar is the whole point)</span><span></span><span>Turnovers and blocks</span></div><p class="small muted pg-key"><i class="us" style="background:${Report.safeColor(S.color)}"></i> Our disc <i class="them"></i> Their disc · B block · I interception · T turnover</p>` : '';
    const reopen = src.key !== 'current' ? `<div>${twoTap('reopen-p-' + src.key, 'reopen-game', 'Reopen this game to edit', 'Tap again to reopen', '', `data-id="${src.key}" ${G() ? 'disabled' : ''}`)}${G() ? ' <span class="small muted">Finish the game in progress first.</span>' : ''}</div>` : '';
    return `<section class="panel">${head}${sourceSelect(sources, src)}${videoRow(src.key)}${videoStartRow(src.key)}${reopen}${pgHead}${rows || '<p class="muted">No points played yet.</p>'}</section>`;
  }

  /* Handlers first, then cutters; each split by matchup on a mixed team. */
  function sheetGroups(points) {
    const handlerId = (rules().positions.find((p) => p.skill === 'h') || rules().positions[0]).id;
    const floor = (rules().positions.find((p) => p.skill === 'h') || rules().positions[0]).floor;
    const isHandler = (p) => E.rate(p, 'h') >= floor;
    const cutScore = (p) => (E.rate(p, 'c') + E.rate(p, 'h') + E.rate(p, 'd')) / 3;
    const byHandler = (a, b) => E.rate(b, 'h') - E.rate(a, 'h') || E.rate(b, 'c') - E.rate(a, 'c') || a.name.localeCompare(b.name);
    const byCutter = (a, b) => cutScore(b) - cutScore(a) || a.name.localeCompare(b.name);
    const inGroup = (fn, order) => S.players.filter(fn).sort(order);
    return mixed()
      ? [[`${GL('M')} Handlers`, inGroup((p) => isHandler(p) && p.match !== 'W', byHandler)], [`${GL('W')} Handlers`, inGroup((p) => isHandler(p) && p.match === 'W', byHandler)], [`${GL('M')} Cutters`, inGroup((p) => !isHandler(p) && p.match !== 'W', byCutter)], [`${GL('W')} Cutters`, inGroup((p) => !isHandler(p) && p.match === 'W', byCutter)]]
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
    const halfIdx = (() => { let u = 0, t = 0; for (let i = 0; i < pts.length; i++) { pts[i].result === 'us' ? u++ : t++; if (Math.max(u, t) >= rules().halfAt) return i; } return -1; })();
    const hc = (i) => (i === halfIdx && i < pts.length - 1 ? ' half-line' : '');
    // Between points in the current game, a column for the next point: tap a player to put them on or take them off.
    const g = G(), nextCol = src.key === 'current' && g && !g.live, line = nextCol ? g.draft.line : {}, full = nextCol && placedIds().length >= targetSize();
    const nextHead = nextCol ? `<th class="ss-next">Next</th>` : '', nextOn = nextCol ? `<th class="ss-next">${ctx().on}</th>` : '';
    const nextCell = (p) => (!nextCol ? '' : g.out[p.id] ? '<td class="ss-next out" aria-label="Not here">–</td>' : `<td class="ss-next ${line[p.id] ? 'in' : ''}"><button type="button" data-a="sheet-line" data-id="${p.id}" aria-pressed="${!!line[p.id]}" aria-label="${line[p.id] ? 'Take off' : 'Put on'} the next point" ${!line[p.id] && full ? 'disabled' : ''}>${line[p.id] ? '●' : ''}</button></td>`);
    const heads = pts.map((p, i) => `<th class="${p.result === 'us' ? 'us' : ''}${hc(i)}">${i + 1}</th>`).join('') + nextHead;
    const body = sheetGroups(pts).filter(([, list]) => list.length).map(([label, list]) => `<tr class="ss-group"><th class="ss-name">${label}</th><td colspan="${pts.length + (nextCol ? 1 : 0)}"></td></tr>` + list.map((p) => `<tr><th class="ss-name"><span class="ss-who">${tile(p, true)}<span>${pLink(p)}</span></span></th>${pts.map((pt, i) => `<td class="${pt.result === 'us' ? 'us' : ''}${hc(i)}" aria-label="${sets[i].has(p.id) ? 'Played' : 'Sat'} point ${i + 1}">${sets[i].has(p.id) ? slash(weights[i]) : ''}${marks(pt, p.id)}</td>`).join('')}${nextCell(p)}</tr>`).join('')).join('');
    return `<section class="panel landscape">${head}${sourceSelect(sources, src)}${pts.length ? '<div class="chips"><button type="button" class="btn small-btn" data-a="print-sheet">Printable PDF</button></div>' : ''}
      <p class="small muted ss-key">${slash('short')} short point ${slash('')} typical ${slash('long')} long point <span class="ss-tint"></span> we scored · <b class="mk mk-a">A</b> assist <b class="mk mk-g">G</b> goal <b class="mk mk-t">T</b> turnover <b class="mk mk-d">D</b> block</p>
      ${nextCol ? `<p class="small">Next point: <b>${placedIds().length} of ${targetSize()}</b> picked. Tap the Next column to put players on or take them off.</p>` : ''}
      ${pts.length || nextCol ? `<div class="tbl-wrap"><table class="ss"><thead><tr><th class="ss-name">Point</th>${heads}</tr><tr><th class="ss-name">Started on</th>${pts.map((p, i) => `<th class="${p.result === 'us' ? 'us' : ''}${hc(i)}">${p.on}</th>`).join('')}${nextOn}</tr></thead><tbody>${body}</tbody><tfoot><tr><th class="ss-name">Score</th>${scores.map((s, i) => `<td class="${pts[i].result === 'us' ? 'us' : ''}${hc(i)}">${s}</td>`).join('')}${nextCol ? '<td class="ss-next"></td>' : ''}</tr></tfoot></table></div>` : '<p class="muted">No points played yet.</p>'}</section>`;
  }
  function statsScreen(viewSeg) {
    const sources = gameSources(), head = viewHead('Box Score', viewSeg);
    const season = pointsSource === 'season' || !sources.length;
    const options = `<option value="season" ${season ? 'selected' : ''}>Season</option>`;
    if (season) {
      const totals = statTotals(true);
      return `<section class="panel">${head}<label class="field"><span class="label">Show</span><select id="points-src" data-c="points-src">${options}${sources.map((x) => `<option value="${esc(x.key)}">${esc(x.label)}</option>`).join('')}</select></label><div class="chips">${S.history.length ? insightBtn('team', S.id, 'Season insights') : ''}</div><h3>Season</h3>${Report.statTable(S.players, totals, { label: 'Games', value: (p) => totals.get(p.id).games }, { link: true, sortable: true, sort: boxSort, time: true })}<p class="small muted">Points are total (offense/defense).</p></section>`;
    }
    const src = pickSource(sources);
    return `<section class="panel">${head}<label class="field"><span class="label">Show</span><select id="points-src" data-c="points-src">${options}${sources.map((x) => `<option value="${esc(x.key)}" ${x === src ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      ${videoRow(src.key)}<div class="chips">${insightBtn('game', src.key, 'Game insights')}</div><h3>Point flow</h3>${Report.lineScore(src.points, S.team, src.opponent, { link: true })}${src.points.length ? `<h3>Team stats</h3>${Report.teamTable(src.points, S.team, src.opponent)}` : ''}<h3>Box score</h3>${Report.boxTable(src.points, S.players, { link: true, sortable: true, sort: boxSort, time: true })}<p class="small muted">Points are total (offense/defense).</p></section>`;
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
    const passes = Report.passes(pts);
    const between = (ids) => ids.reduce((s, x) => s + ids.reduce((t, y) => t + ((x !== y && passes.get(x) && passes.get(x).get(y)) || 0), 0), 0);
    const together = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    const rows = list.map((c) => `<tr><td class="bx-name cb-names">${c.ids.map((id) => (P(id) ? pLink(P(id)) : 'Removed player')).join(', ')}</td><td data-v="${c.pts}">${c.pts} (${c.O}/${c.D})</td><td data-v="${c.ms}">${together(c.ms)} (${clock(c.ms / c.pts)})</td><td>${c.scored}</td><td>${c.allowed}</td><td><b>${c.net > 0 ? '+' : ''}${c.net}</b></td><td>${between(c.ids)}</td></tr>`).join('');
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
    const biasNote = !mixed() ? '' : bias.length ? `<div class="warns"><b>Biggest gaps in who they throw to</b>${bias.map((b) => `<span>${esc(nameOf(b.id))}: ${b.toW} of ${b.throws} throws to ${GL('W')} players (${pctOf(b.share)}%), with ${pctOf(b.expected)}% of teammates on the field being ${GL('W')}.</span>`).join('')}</div>` : '<p class="small muted">No one stands out yet. A player needs at least 4 logged throws to be compared.</p>';
    const hmLegend = mixed() ? `<p class="small muted hm-key"><i class="ww"></i> ${GL('W')} to ${GL('W')} <i class="mm"></i> ${GL('M')} to ${GL('M')} <i class="xx"></i> Cross-matchup</p>` : '';
    const rowTotal = (a) => [...(passes.get(a) || new Map()).values()].reduce((x, y) => x + y, 0);
    const matrix = ids.length ? `<div class="tbl-wrap"><table class="hm"><thead><tr><th class="hm-name">Thrower ↓ / Receiver →</th>${ids.map((id) => `<th ${tipAttr(nameOf(id))}>${esc(short(id))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ids.map((a) => `<tr class="${flagged.has(a) ? 'flagged' : ''}"><th class="hm-name">${pLink(P(a))}</th>${ids.map((b) => cell(a, b)).join('')}<td class="hm-total">${rowTotal(a)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Log touches during a point and throws show up here.</p>';
    return `<section class="panel">${head}
      <div class="chips">${toggle}${seg('combo-size', comboSize, [['2', 'Pairs'], ['3', 'Trios'], ['4', '4 or more']])}</div>
      <p class="small muted">Groups that started more than one point together.</p>
      ${rows ? `<div class="tbl-wrap"><table class="bx" data-sort-id="combos"><thead><tr><th class="bx-name">Players</th><th>Points (Off/Def)</th><th title="Time on the field together">Total Playtime (Avg per point)</th><th title="Goals for">GF</th><th title="Goals against">GA</th><th>+/–</th><th title="Completed passes between these players, both directions">Passes</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No group has played more than one point together yet.</p>'}
      <h3>Who threw to whom</h3><p class="small muted">Darker boxes mean more throws. Tap a box for names.</p>${hmLegend}${matrix}${biasNote}</section>`;
  }

  /* ---------- Insights: an AI looks for interesting stats ---------- */
  const aiReady = () => !!(sampler || window.FIREBASE_CONFIG);
  const insightBtn = (kind, key, label) => (aiReady() ? `<button type="button" class="btn small-btn" data-a="insight" data-k="${kind}" data-v="${esc(key)}">✨ ${label || 'Insights'}</button>` : '');
  // Players go out as codes like P3, never by name, and come back as names on this device.
  const codeOf = (id) => { const i = S.players.findIndex((p) => p.id === id); return i < 0 ? 'P0' : `P${i + 1}`; };
  function compactPoint(pt) {
    const items = Report.narrative(pt.events);
    const ev = pt.events || [];
    const play = items.map((it, k) => {
      const thr = Report.isPass(items, k) && ev[it.idxs[0]].throwType ? `(${Report.THROW[ev[it.idxs[0]].throwType]})` : '';
      return thr + (it.id ? `${codeOf(it.id)}${it.role || it.t !== 'touch' ? ':' + Report.label({ t: it.role || it.t, sub: it.sub }) : ''}` : Report.oppLabel(it));
    }).join(' > ');
    return { on: pt.on, result: pt.result === 'us' ? 'we scored' : 'they scored', seconds: Math.round((pt.endedAt - pt.startedAt) / 1000), line: pt.lineup.map(codeOf), subs: (pt.subs || []).map((s) => `${codeOf(s.in)} for ${codeOf(s.out)}`), play };
  }
  const totalsOut = (map) => Object.fromEntries([...map].filter(([id, v]) => P(id) && v.played).map(([id, v]) => [codeOf(id), { points: v.played, O: v.O, D: v.D, touches: v.touch, goals: v.goal, assists: v.assist, throwaways: (v.turn || 0) - (v.drop || 0), drops: v.drop || 0, blocks: v.block }]));
  const gameOut = (label, points) => ({ game: label, final: `${points.filter((p) => p.result === 'us').length}-${points.filter((p) => p.result === 'them').length}`, box: totalsOut(Report.totals(points)), points: points.map(compactPoint) });
  function insightData(kind, key) {
    const roster = S.players.map((p) => ({ code: codeOf(p.id), jersey: p.no || '', matching: mixed() ? GL(p.match) : undefined }));
    const all = S.history.filter((h) => h.points).map((h) => ({ label: `vs ${h.opponent || 'Opponent'}`, points: h.points })).concat(S.game ? [{ label: `vs ${S.game.opponent || 'Opponent'} (in progress)`, points: S.game.points }] : []);
    if (kind === 'game') {
      const src = gameSources().find((x) => x.key === key);
      return { subject: `this one game (${src.label})`, data: { roster, ...gameOut(src.label, src.points) } };
    }
    if (kind === 'player') {
      const p = P(key), games = all.filter((g) => g.points.some((pt) => pt.lineup.includes(p.id) || (pt.subs || []).some((s) => s.in === p.id))).slice(-10);
      const pts = games.flatMap((g) => g.points), rec = Report.playerSummary(pts, p.id);
      return { subject: `player ${codeOf(p.id)}`, data: { player: codeOf(p.id), roster, record: rec && { plus: rec.plus, minus: rec.minus, Opoints: rec.O, Oscored: rec.Owon, Dpoints: rec.D, breaks: rec.Dwon, throwsTo: rec.throwsTo.slice(0, 8).map(([id, n]) => [codeOf(id), n]), catchesFrom: rec.catchesFrom.slice(0, 8).map(([id, n]) => [codeOf(id), n]) }, games: games.map((g) => ({ game: g.label, box: totalsOut(Report.totals(g.points))[codeOf(p.id)] || null, pointsPlayed: g.points.filter((pt) => pt.lineup.includes(p.id) || (pt.subs || []).some((s) => s.in === p.id)).map(compactPoint) })) } };
    }
    const games = all.slice(-12);
    const pairs = Report.combos(games.flatMap((g) => g.points), [2, 3]).slice(0, 15).map((c) => ({ players: c.ids.map(codeOf), points: c.pts, goals: c.scored, against: c.allowed }));
    return { subject: 'the whole team this season', data: { team: S.team, roster, season: totalsOut(statTotals(true)), bestGroups: pairs, games: games.map((g) => gameOut(g.label, g.points)) } };
  }
  function insightPrompt(kind, key) {
    const { subject, data } = insightData(kind, key);
    return `You are the stats analyst for ${S.youth ? 'a youth' : 'an'} ultimate frisbee team. Look through the data below and find 5 to 8 genuinely interesting, specific stats or patterns about ${subject}: things a coach would not see at a glance, such as streaks, who connects with whom, how the team does on offense versus defense points, long versus short points, comebacks, throw types, or turnovers in context.

Rules:
- Write each insight as one short bullet starting with "- ", and include the numbers behind it.
- Players appear only as codes like P3. Refer to players only by those codes, never invent names, and never guess anyone's gender or age.
- Use only what the data shows. Don't speculate about causes you can't see.
- Keep the tone positive and fair; ${S.youth ? 'parents and kids may read this' : 'players may read this'}. Frame weaknesses as things to work on.
- No heading, no intro, no closing line.

Glossary: O = point started on offense, D = started on defense. A "break" is scoring on a D point. In "play", ">" separates events in order; "(FH)"/"(BH)" before a catch is the throw type. "seconds" is point length.

DATA:
${JSON.stringify(data)}`;
  }
  async function askAI(prompt) {
    if (sampler) { const r = await sampler(prompt, { modelTier: 'default' }); return r.text; }
    const cfg = window.FIREBASE_CONFIG;
    const call = async (model) => {
      const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey };
      try { const u = window.firebase && firebase.auth().currentUser; if (u) headers.Authorization = `Firebase ${await u.getIdToken()}`; } catch (e) { /* signed out is fine */ }
      return fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${cfg.projectId}/models/${model}:generateContent`, { method: 'POST', headers, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6 } }) });
    };
    let res = await call('gemini-3.8-flash');
    if (res.status === 404) res = await call('gemini-3.5-flash-lite');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body.error && body.error.message) || `error ${res.status}`;
      throw new Error(/not been used|disabled|firebasevertexai|PERMISSION_DENIED/i.test(msg) ? 'AI Logic is not turned on for this Firebase project yet.' : msg);
    }
    return ((body.candidates || [])[0] || { content: { parts: [] } }).content.parts.map((x) => x.text || '').join('');
  }
  function insightHtml(text) {
    const named = esc(text).replace(/\bP(\d+)\b/g, (m, n) => { const p = S.players[Number(n) - 1]; return p ? `<b>${esc(p.name)}</b>` : m; }).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    const lines = named.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^[-*•]\s/.test(l));
    return bullets.length ? `<ul class="insights">${bullets.map((l) => `<li>${l.replace(/^[-*•]\s+/, '')}</li>`).join('')}</ul>` : lines.map((l) => `<p>${l}</p>`).join('');
  }
  function insightSheet() {
    const who = insight.kind === 'player' && P(insight.key) ? P(insight.key).name : insight.kind === 'game' ? 'This game' : S.team;
    const body = insight.status === 'loading' ? '<p class="muted" role="status">Looking for interesting stats…</p>'
      : insight.status === 'error' ? `<div class="warns" role="status"><b>Insights didn't load</b><span>${esc(insight.error)}</span></div>`
        : insightHtml(insight.text);
    return `<div class="scrim" data-a="insight-close" data-self="1"><div class="sheet" role="dialog" aria-label="Insights">
      <div class="panel-head"><h2>Insights: ${esc(who)}</h2><span class="right">${insight.status === 'loading' ? '' : '<button type="button" class="btn small-btn" data-a="insight-again">Ask again</button>'}<button type="button" class="btn small-btn primary" data-a="insight-close">Done</button></span></div>
      ${body}
      <p class="small muted">Written by AI from your stats, so double-check anything surprising. Player names are swapped for codes before the stats leave this device.</p></div></div>`;
  }
  async function runInsight(kind, key, fresh) {
    const id = `${S.id}:${kind}:${key}`;
    insight = { kind, key, status: 'loading' };
    render();
    if (!fresh && insightCache.has(id)) { insight = { kind, key, status: 'done', text: insightCache.get(id) }; render(); return; }
    try {
      const text = await askAI(insightPrompt(kind, key));
      insightCache.set(id, text);
      if (insight && insight.key === key) { insight = { kind, key, status: 'done', text }; render(); }
    } catch (e) {
      if (insight && insight.key === key) { insight = { kind, key, status: 'error', error: e.code === 'not_granted' ? 'Claude access was turned off for this page.' : (e.message || String(e)) }; render(); }
    }
  }

  /* ---------- Printable scoresheet ---------- */
  async function printSheet() {
    const src = pickSource(gameSources());
    if (!src || !src.points.length) return;
    const rows = sheetGroups(src.points).flatMap(([, list]) => list).map((p) => ({ id: p.id, name: p.name, no: p.no, match: p.match }));
    const rec = gameRec(src.key), sx = rec && S.schedule.find((y) => y.gameId === rec.id || (rec.scheduleId && y.id === rec.scheduleId)), when = sx && sx.date ? new Date(sx.date + 'T12:00:00') : rec ? new Date(rec.startedAt || rec.date) : new Date();
    const bytes = Report.scoresheetPdf({ title: `${S.team} vs ${src.opponent || 'Opponent'}`, subtitle: `${when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${src.key === 'current' ? 'Score' : 'Final'} ${src.us}-${src.them}`, points: src.points, rows, mixed: mixed(), halfAt: rules().halfAt });
    const filename = `${S.team}-vs-${src.opponent || 'opponent'}-scoresheet.pdf`.replace(/[^A-Za-z0-9.]+/g, '-');
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    try {
      if (native) {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        const fsys = window.Capacitor.registerPlugin('Filesystem'), share = window.Capacitor.registerPlugin('Share');
        const saved = await fsys.writeFile({ path: filename, data: btoa(bin), directory: 'CACHE' });
        await share.share({ title: 'Scoresheet', url: saved.uri, dialogTitle: 'Print or send the scoresheet' });
        return;
      }
      if (downloads) { await downloads.save({ filename, data: bytes }); return; }
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const win = window.open(url, '_blank');
      if (!win) { const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); }
    } catch (e) { if (!e || (e.code !== 'declined' && !/cancel/i.test(e.message || ''))) flash("The PDF didn't open. Try again."); }
  }

  /* ---------- Every game on every team ---------- */
  function gamesScreen() {
    const watch = (rec) => (rec && Report.videoUrl(rec.video) ? `<a class="btn small-btn" href="${esc(Report.videoUrl(rec.video))}" target="_blank" rel="noopener">▶ Video</a>` : '');
    const today = localDay(), live = [], todays = [], upcoming = [], done = [];
    const dated = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const seen = new Set(), canLink = comps().some(isCompAdmin);
    Root.teams.forEach((t) => {
      if (t.game) live.push({ t, kind: 'live', key: t.game.id, sort: '0', title: `${t.team} vs ${t.game.opponent || 'Opponent'}`, when: dated(t.game.startedAt), score: `${t.game.points.filter((p) => p.result === 'us').length}–${t.game.points.filter((p) => p.result === 'them').length}`, btn: `${watch(t.game)}<button type="button" class="btn small-btn primary" data-a="open-any" data-team="${t.id}" data-v="current">Open</button>` });
      (t.schedule || []).filter((x) => x.kind !== 'practice').forEach((x) => {
        if (x.fixtureId) seen.add(x.fixtureId);
        if (x.gameId) return;
        if (t.game && t.game.scheduleId === x.id) return;
        const row = { t, kind: 'upcoming', key: x.id, sort: whenKey(x), title: `${t.team} vs ${x.opponent || 'Opponent'}`, when: `${longDate(x.date)}${x.time ? ' · ' + x.time : ''}${x.location ? ' · ' + x.location : ''}`, score: '', comp: x.competitionId ? compLabel(x) : '' };
        if (x.date < today) done.push({ ...row, btn: `${t.game ? '' : `<button type="button" class="btn small-btn" data-a="any-start" data-team="${t.id}" data-id="${x.id}">Open</button>`}<button type="button" class="btn small-btn primary" data-a="score-open" data-team="${t.id}" data-id="${x.id}">Enter score</button>` });
        else (x.date === today ? todays : upcoming).push({ ...row, btn: t.game ? '' : `<button type="button" class="btn small-btn ${x.date === today ? 'primary' : ''}" data-a="any-start" data-team="${t.id}" data-id="${x.id}">Start</button>` });
      });
      t.history.forEach((h) => { const x = t.schedule.find((y) => y.gameId === h.id); if (x && x.fixtureId) seen.add(x.fixtureId); done.push({ t, kind: 'done', key: h.id, sort: whenKey({ date: gameDay(h, t), time: x ? x.time : '' }), title: `${t.team} vs ${h.opponent || 'Opponent'}`, when: `${longDate(gameDay(h, t))}${x && x.time ? ' · ' + x.time : ''}`, score: `${h.us}–${h.them}`, comp: h.competitionId ? compLabel(h) : x && x.competitionId ? compLabel(x) : '', opp: h.opponent, grp: h.group || (x && x.group) || '', btn: `${!h.matchupId && !(x && x.fixtureId) && canLink ? `<button type="button" class="btn small-btn" data-a="link-open" data-team="${t.id}" data-id="${h.id}" data-comp="${esc(h.competitionId || (x && x.competitionId) || '')}">Link to league</button>` : ''}${watch(h)}${(h.points || []).length ? `<button type="button" class="btn small-btn" data-a="open-any" data-team="${t.id}" data-v="${h.id}">Box score</button>` : '<span class="small muted">Score only</span>'}` }); });
    });
    // League games between teams that aren't ours, from competitions we run or play in.
    myComps().forEach((c) => (c.matchups || []).filter((m) => m.slot && !seen.has(m.id)).forEach((m) => {
      const f = fieldById(c, m.slot.fieldId), x = { date: m.slot.date, time: ampm(m.slot.start) };
      const row = { league: true, c, m, kind: 'league', key: m.id, sort: whenKey(x), title: `${m.a.name} vs ${m.b.name}`, when: `${longDate(m.slot.date)} · ${ampm(m.slot.start)}${f ? ' · ' + f.label : ''}`, score: m.result ? `${m.result.a}–${m.result.b}` : '', comp: `<span class="tag-comp">${esc(c.name)}${m.group ? ' · ' + esc(m.group) : ''}</span>` };
      const btn = isCompAdmin(c) ? `<button type="button" class="btn small-btn ${m.result ? '' : 'primary'}" data-a="score-open" data-comp="${c.id}" data-id="${m.id}">${m.result ? 'Edit score' : 'Enter score'}</button>` : '';
      if (m.result || m.slot.date < today) done.push({ ...row, btn });
      else (m.slot.date === today ? todays : upcoming).push({ ...row, btn });
    }));
    upcoming.sort((a, b) => a.sort.localeCompare(b.sort)); todays.sort((a, b) => a.sort.localeCompare(b.sort)); done.sort((a, b) => a.sort.localeCompare(b.sort));
    const del = (g) => (g.league ? '' : twoTap(`anydel-${g.t.id}-${g.key}`, 'any-del', 'Delete', g.kind === 'upcoming' ? 'Tap again' : 'Tap again: deletes its stats', 'danger', `data-team="${g.t.id}" data-kind="${g.kind}" data-id="${esc(g.key)}"`));
    const row = (g) => `<div class="game-row"><div class="game-info"><strong>${esc(g.title)}${g.score ? ` · ${g.score}` : ''}</strong><span class="small muted">${esc(g.when)}${g.comp ? ' · ' : ''}${g.comp || ''}</span></div><div class="chips">${g.btn || ''}${del(g)}</div></div>`;
    const full = (g) => row(g) + (linkDraft && linkDraft.id === g.key && !g.league ? leagueLinkRow(g) : '');
    const block = (title, list) => (list.length ? `<button type="button" class="grp-toggle" data-a="games-toggle" data-v="${title}" aria-expanded="${!gamesShut.has(title)}"><span class="caret">${gamesShut.has(title) ? '▸' : '▾'}</span>${title} <span class="small muted">${list.length}</span></button>${gamesShut.has(title) ? '' : list.map(full).join('')}` : '');
    return `<section class="panel"><h2>Games</h2>${block('In progress', live)}${block('Today', todays)}${block('Upcoming', upcoming)}${block('Finished', done) || (live.length || upcoming.length || todays.length ? '' : '<p class="muted">No games yet. Add one under Teams.</p>')}</section>`;
  }
  function scoreSheetView() {
    const s = scoreEntry;
    return `<div class="scrim" data-a="score-close" data-self="1"><div class="sheet score-sheet" role="dialog" aria-label="Enter the score"><h2>Final score</h2><p class="small muted">${esc(s.when || '')}</p>
      <form data-form="final-score" class="final-form"><label class="field"><span class="label">${esc(s.names[0])}</span><input id="fs-a" type="number" min="0" max="99" inputmode="numeric" value="${s.a == null ? '' : s.a}" required></label><span class="dash">–</span><label class="field"><span class="label">${esc(s.names[1])}</span><input id="fs-b" type="number" min="0" max="99" inputmode="numeric" value="${s.b == null ? '' : s.b}" required></label>
      <div class="chips"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-a="score-close">Cancel</button></div></form></div></div>`;
  }
  // A reported final on a team's own schedule, with no point-by-point record.
  function reportFinal(t, x, us, them) {
    const id = uid();
    t.history.push({ id, opponent: x.opponent, date: new Date(`${x.date}T12:00:00`).getTime(), us, them, perPlayer: {}, points: [], reported: true, ...(x.competitionId ? { competitionId: x.competitionId, group: x.group } : {}) });
    t.history.sort((p, q) => p.date - q.date);
    Object.assign(x, { gameId: id, us, them });
  }
  const teamSeg = () => `<div>${seg('team-view', teamView === 'comps' ? 'roster' : teamView, [['roster', 'Roster'], ['lines', 'Lines'], ['coaches', 'Staff']])}</div>`;
  const myEmail = () => (CloudLink && CloudLink.user ? (CloudLink.user.email || '').toLowerCase() : '');
  const isAdmin = () => !S.access || S.access.admin === myEmail() || !!(CloudLink && CloudLink.god) || (S.staff || []).some((st) => st.email && st.email === myEmail() && (st.roles || [st.role]).includes('admin'));
  function coachesPanel() {
    if (!CloudLink) return '<section class="panel"><h2>Coaches</h2><p class="muted">Coaches are available in the Android app and on the desktop site, once you sign in.</p></section>';
    if (!CloudLink.user) return '<section class="panel"><h2>Coaches</h2><p>Sign in with Google to share this team with other coaches.</p><div><button type="button" class="btn small-btn primary" data-a="cloud-in">Sign in with Google</button></div></section>';
    if (S.isExample) return '<section class="panel"><h2>Coaches</h2><p class="muted">Add your own team to invite coaches. The example team stays on this device.</p></section>';
    const acc = S.access || { admin: myEmail(), coaches: [myEmail()] }, admin = acc.admin === myEmail();
    return `<section class="panel"><h2>Coaches</h2><p class="small muted">Coaches can see everything on this team, including ratings, and can record games. They sign in with Google using the email address below.</p>
      ${acc.coaches.map((c) => `<div class="sub-row"><span><strong>${esc(c)}</strong> ${c === acc.admin ? '<span class="small muted">Admin</span>' : ''}${c === myEmail() ? ' <span class="small muted">You</span>' : ''}</span>${admin && c !== acc.admin ? twoTap('rmcoach-' + c, 'remove-coach', 'Remove', 'Tap again', 'danger', `data-v="${esc(c)}"`) : ''}</div>`).join('')}
      ${admin ? `<form class="form-row" data-form="coach"><label class="field grow"><span class="label">Invite by Google email</span><input id="coach-email" type="email" autocomplete="off" required></label><button class="btn primary" type="submit">Invite</button></form>` : '<p class="small muted">Only the admin can invite or remove coaches.</p>'}
      ${coachNote ? `<p class="small" role="status">${esc(coachNote)}</p>` : ''}
    </section>`;
  }

  /* ---------- People: one record per person, whether or not they've signed in yet ---------- */
  const people = () => Root.people || (Root.people = {});
  function newPerson(f) { const per = { id: uid() + uid(), name: '', nickname: '', email: '', youth: false, guardians: [], uid: '', teamId: S.id, createdBy: myEmail() || '', at: Date.now(), ...f }; people()[per.id] = per; return per; }
  const personByEmail = (email) => email && Object.values(people()).find((x) => x.email === email.toLowerCase());
  function personFor(p) { let per = p.personId && people()[p.personId]; if (!per) { per = newPerson({ name: p.name, youth: !!(p.youth || S.youth) }); p.personId = per.id; } return per; }
  // Keep a player's person record in step with the roster and the player's parent contacts.
  function syncPerson(p) {
    const per = personFor(p), guardians = [...new Set((p.contacts || []).filter((c) => /parent|guardian/i.test(c.relation || '')).map((c) => c.email.toLowerCase()))];
    const want = { name: p.name, nickname: p.nick || '', youth: !!p.youth, guardians };
    if (Object.keys(want).some((k) => JSON.stringify(per[k]) !== JSON.stringify(want[k]))) { Object.assign(per, want); per.at = Date.now(); }
    guardians.forEach((e) => { if (!personByEmail(e)) newPerson({ email: e, role: 'parent', name: ((p.contacts || []).find((c) => c.email.toLowerCase() === e) || {}).name || e }); });
  }
  const STAFF_ROLES = [['admin', 'Team admin'], ['head', 'Head coach'], ['assistant', 'Assistant coach']];
  const rolesOf = (st) => (st.roles && st.roles.length ? st.roles : st.role ? [st.role] : []);
  const roleName = (k) => (STAFF_ROLES.find((r) => r[0] === k) || [0, 'Coach'])[1];
  function staffPanel() {
    const acc = S.access, admin = isAdmin(), staff = S.staff || [];
    const status = (st) => { const per = st.personId && people()[st.personId]; return per && per.uid ? '<span class="small muted">Has an account</span>' : st.email ? '<span class="small muted">Invited, not signed in yet</span>' : '<span class="small muted">No email yet</span>'; };
    return `<section class="panel"><h2>Staff</h2><p class="small muted">Admins, head coaches and assistants. Anyone with an email here can sign in with Google using it to open this team, see everything (ratings included) and record games.</p>
      ${acc ? `<div class="sub-row"><span><strong>${esc(acc.admin)}</strong> <span class="tag-comp">Team admin</span> <span class="small muted">created the team</span></span></div>` : ''}
      ${staff.map((st) => `<div class="sub-row"><span><strong>${esc(st.name || st.email)}</strong> ${rolesOf(st).map((k) => `<span class="tag-comp">${roleName(k)}</span>`).join(' ') || '<span class="tag-comp friendly">No role</span>'} ${st.email ? `<span class="small muted">${esc(st.email)}</span>` : ''} ${status(st)}</span>${admin ? `<span class="chips"><span class="seg" role="group">${STAFF_ROLES.map(([k, l]) => `<button type="button" data-a="staff-role" data-id="${st.id}" data-v="${k}" aria-pressed="${rolesOf(st).includes(k)}">${l.replace(' coach', '')}</button>`).join('')}</span>${twoTap('rmstaff-' + st.id, 'staff-remove', 'Remove', 'Tap again', 'danger', `data-id="${st.id}"`)}</span>` : ''}</div>`).join('')}
      ${acc ? acc.coaches.filter((e) => e !== acc.admin && !staff.some((st) => st.email === e)).map((e) => `<div class="sub-row"><span><strong>${esc(e)}</strong> <span class="small muted">Has access</span></span>${admin ? twoTap('rmcoach-' + e, 'remove-coach', 'Remove', 'Tap again', 'danger', `data-v="${esc(e)}"`) : ''}</div>`).join('') : ''}
      ${admin ? `<form class="form-row" data-form="staff"><label class="field grow"><span class="label">Name</span><input id="staff-name" type="text" autocomplete="off"></label><label class="field grow"><span class="label">Google email</span><input id="staff-email" type="email" autocomplete="off"></label><label class="field"><span class="label">Role</span><select id="staff-role">${STAFF_ROLES.map(([k, l]) => `<option value="${k}" ${k === 'head' ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="btn primary" type="submit">Add</button></form>` : '<p class="small muted">Only the team admin can change staff.</p>'}
      ${CloudLink && !CloudLink.user ? '<p class="small muted">Sign in so staff can open this team on their own devices.</p>' : ''}
      ${coachNote ? `<p class="small" role="status">${esc(coachNote)}</p>` : ''}</section>`;
  }
  // Everything this account is, across teams and competitions.
  function myRoles() {
    const me = myEmail(); if (!me) return [];
    const out = [];
    comps().filter((c) => (c.admins || []).includes(me)).forEach((c) => out.push(['League admin', c.name]));
    Root.teams.forEach((t) => {
      if (t.access && t.access.admin === me) out.push(['Team admin', t.team]);
      (t.staff || []).filter((st) => st.email === me).forEach((st) => rolesOf(st).forEach((k) => out.push([roleName(k), t.team])));
      if (t.access && t.access.coaches.includes(me) && !(t.staff || []).some((st) => st.email === me) && t.access.admin !== me) out.push(['Coach', t.team]);
      t.players.forEach((p) => { const per = p.personId && people()[p.personId]; if (per && per.email === me) out.push(['Player', t.team]); if (per && (per.guardians || []).includes(me)) out.push(['Parent', `${p.name} on ${t.team}`]); });
    });
    Object.values(people()).filter((x) => (x.guardians || []).includes(me) && !Root.teams.some((t) => t.players.some((p) => p.personId === x.id))).forEach((x) => out.push(['Parent', x.name]));
    return out;
  }

  /* ---------- Saved lines ---------- */
  function linesPanel() {
    const lines = S.lines || [];
    return `<section class="panel"><h2>Lines</h2><p class="small muted">Save groups you call often. They show up as bench filters, with a button to put the whole line in.</p>
      ${lines.map((l) => `<div class="line-edit"><div class="panel-head"><input type="text" class="line-name" data-c="line-name" data-id="${l.id}" value="${esc(l.name)}" aria-label="Line name"><span class="small muted">${l.ids.filter(P).length} players</span>${twoTap('delline-' + l.id, 'del-line', 'Delete', 'Tap again', 'danger', `data-id="${l.id}"`)}</div>
        <div class="attend">${S.players.map((p) => `<button type="button" class="tog" data-a="line-toggle" data-id="${l.id}" data-p="${p.id}" aria-pressed="${l.ids.includes(p.id)}">${esc(p.name)}</button>`).join('')}</div></div>`).join('')}
      <form class="form-row" data-form="line"><label class="field grow"><span class="label">New line</span><input id="new-line" type="text" placeholder="Zone O" autocomplete="off"></label><button class="btn primary" type="submit">Add line</button></form></section>`;
  }

  /* ---------- Competitions: league seasons and tournaments, run by their admins ---------- */
  const comps = () => Root.competitions || (Root.competitions = []);
  const myComps = () => comps().filter((c) => isCompAdmin(c) || teamInComp(c, S.id) || S.schedule.some((x) => x.competitionId === c.id));
  const isCompAdmin = (c) => !!c && (!!(CloudLink && CloudLink.god) || (!c.readOnly && (!(c.admins || []).length || (!!myEmail() && c.admins.includes(myEmail())))));
  const teamInComp = (c, id) => (c.groups || []).some((g) => (g.teams || []).some((t) => t.id === id));
  const groupOf = (c, id) => (c.groups || []).find((g) => (g.teams || []).some((t) => t.id === id));
  const fieldsOf = (c) => (c.sites || []).flatMap((s) => (s.fields || []).map((f) => ({ site: s, field: f, label: `${s.name} – ${f.name}` })));
  const fieldById = (c, id) => fieldsOf(c).find((x) => x.field.id === id);
  const touchComp = (c) => { c.at = Date.now(); };
  function compOptions(sel, adminOnly) {
    const opts = ['<option value="">Friendly / scrimmage</option>'];
    comps().filter((c) => (adminOnly ? isCompAdmin(c) : true)).forEach((c) => {
      opts.push(`<option value="${c.id}|" ${sel === c.id + '|' ? 'selected' : ''}>${esc(c.name)}</option>`);
      (c.groups || []).forEach((g) => opts.push(`<option value="${c.id}|${esc(g.name)}" ${sel === `${c.id}|${g.name}` ? 'selected' : ''}>${esc(c.name)} · ${esc(g.name)}</option>`));
    });
    return opts.join('');
  }
  const compLabel = (x) => { const c = x.competitionId && compOf(x.competitionId); return `<span class="tag-comp ${c ? '' : 'friendly'}">${c ? `${esc(c.name)}${x.group ? ' · ' + esc(x.group) : ''}` : 'Friendly'}</span>`; };
  // Every field this team might play on, for the location box.
  const locationList = () => [...new Set(myComps().flatMap((c) => fieldsOf(c).map((f) => f.label)))];
  // Pick a known team by name: a listed team, one of ours, or just a name.
  function teamRef(name) {
    const n = name.trim(), low = n.toLowerCase();
    const own = Root.teams.find((t) => t.team.toLowerCase() === low);
    if (own) return { id: own.id, name: own.team };
    const hit = dirCache.find((d) => d.name.toLowerCase() === low);
    return hit ? { id: hit.id, name: hit.name } : { id: 'name:' + low.replace(/[^a-z0-9]+/g, '-'), name: n };
  }
  const HM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const hm = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const ampm = (t) => { const n = HM(t), h = Math.floor(n / 60), m = n % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Open game slots: each field's hours, cut into game-length pieces.
  // The open windows on one day, for each field.
  function windowsOn(c, date) {
    const wd = new Date(`${date}T12:00:00`).getDay();
    return fieldsOf(c).map(({ site, field, label }) => ({ siteId: site.id, fieldId: field.id, label, wins: siteHours(site).filter((w) => w.days.includes(wd) && !(w.from && date < w.from) && !(w.to && date > w.to)).map((w) => [HM(w.start), HM(w.end)]) })).filter((f) => f.wins.length);
  }
  function slotDates(c) {
    const dates = new Set();
    (c.sites || []).forEach((s) => siteHours(s).forEach((w) => {
      if (!w.from || !w.to) return;
      for (let d = new Date(`${w.from}T12:00:00`); localDay(d) <= w.to && dates.size < 400; d.setDate(d.getDate() + 1)) if (w.days.includes(d.getDay())) dates.add(localDay(d));
    }));
    (c.matchups || []).forEach((m) => { if (m.slot) dates.add(m.slot.date); });
    return [...dates].sort();
  }
  const lenOf = (c, m) => m.len || c.slotMin || 90;
  // A team plays at one site per day, never twice at once, and a field holds one game at a time.
  function slotProblem(c, mu, slot, newLen) {
    const len = newLen || lenOf(c, mu), others = (c.matchups || []).filter((m) => m.id !== mu.id && m.slot && m.slot.date === slot.date);
    const f = fieldById(c, slot.fieldId), site = f ? f.site.id : null;
    const s0 = HM(slot.start), overlaps = (m) => HM(m.slot.start) < s0 + len && s0 < HM(m.slot.start) + lenOf(c, m);
    if (others.some((m) => m.slot.fieldId === slot.fieldId && overlaps(m))) return 'That field is busy then.';
    const win = (windowsOn(c, slot.date).find((x) => x.fieldId === slot.fieldId) || { wins: [] }).wins.some(([s, e]) => HM(slot.start) >= s && HM(slot.start) + len <= e);
    if (!win) return `A ${len}-minute game doesn't fit in the field's hours there.`;
    for (const team of [mu.a, mu.b].filter((x) => !isTbd(x))) {
      for (const m of others.filter((o) => [o.a.id, o.b.id].includes(team.id))) {
        const of = fieldById(c, m.slot.fieldId);
        if (of && of.site.id !== site) return `${team.name} already plays at ${of.site.name} that day. A team stays at one site per day.`;
        if (overlaps(m)) return `${team.name} already has a game at ${ampm(m.slot.start)}.`;
      }
    }
    return '';
  }
  // A scheduled matchup becomes a game on both teams' schedules.
  function fixtureOf(c, mu) {
    const f = mu.slot && fieldById(c, mu.slot.fieldId);
    return { ...(mu.result ? { final: { [mu.a.id]: mu.result.a, [mu.b.id]: mu.result.b } } : {}), matchupId: mu.id, competitionId: c.id, group: mu.group || '', teams: [mu.a.id, mu.b.id], names: { [mu.a.id]: mu.a.name, [mu.b.id]: mu.b.name }, date: mu.slot ? mu.slot.date : '', time: mu.slot ? ampm(mu.slot.start) : '', location: f ? f.label : '', lat: f && f.field.lat != null ? f.field.lat : null, lng: f && f.field.lng != null ? f.field.lng : null, cancelled: !mu.slot, at: Date.now() };
  }
  function applyFixtureLocal(fx, id) {
    Root.teams.forEach((t) => {
      if (!fx.teams.includes(t.id)) { if (t.schedule.some((y) => y.fixtureId === id && !y.gameId)) t.schedule = t.schedule.filter((y) => !(y.fixtureId === id && !y.gameId)); return; }
      const other = fx.teams.find((x) => x !== t.id), x = t.schedule.find((y) => y.fixtureId === id);
      if (fx.cancelled) { if (x && !x.gameId) t.schedule = t.schedule.filter((y) => y !== x); return; }
      const want = { fixtureId: id, kind: 'game', oppTeamId: other, opponent: fx.names[other] || 'Opponent', date: fx.date, time: fx.time, location: fx.location, competitionId: fx.competitionId, group: fx.group, lat: fx.lat, lng: fx.lng, fixtureAt: fx.at };
      if (x) { if (!x.gameId) Object.assign(x, want); } else t.schedule.push({ id: uid(), ...want });
    });
  }
  function publishMatchup(c, mu) {
    const fx = fixtureOf(c, mu);
    applyFixtureLocal(fx, mu.id);
    if (CloudLink && CloudLink.user) CloudLink.leagueFixture(mu.id, fx);
  }

  function placeMatchup(id, fieldId, start, len) {
    const c = compOf(compView), m = (c.matchups || []).find((x) => x.id === id), slot = { fieldId, date: schedDate, start };
    if (!m) return;
    const why = slotProblem(c, m, slot, len);
    if (why) { flash(why); render(); return; }
    commit(() => { m.slot = slot; if (len) m.len = len; touchComp(c); publishMatchup(c, m); muSel = null; });
  }
  // Why a matchup can't be played at this site today, if it can't.
  function siteConflict(c, m) {
    const sitesFor = (id) => new Set((c.matchups || []).filter((x) => x.id !== m.id && x.slot && x.slot.date === schedDate && (x.a.id === id || x.b.id === id)).map((x) => (fieldById(c, x.slot.fieldId) || { site: {} }).site.id));
    const sa = sitesFor(m.a.id), sb = sitesFor(m.b.id), all = new Set([...sa, ...sb]);
    if (schedSite !== 'all') { const away = [...all].find((s) => s !== schedSite); if (away) { const s = (c.sites || []).find((x) => x.id === away); return `${sa.has(away) ? m.a.name : m.b.name} plays at ${s ? s.name : 'another site'} that day`; } return ''; }
    return all.size > 1 ? 'These teams are already at different sites that day' : '';
  }
  // Make every team's schedule and the shared game records match the competitions as they are now.
  function reconcile() {
    let removed = 0, fixed = 0;
    comps().filter(isCompAdmin).forEach((c) => {
      const live = new Map((c.matchups || []).filter((m) => m.slot).map((m) => [m.id, m]));
      Root.teams.forEach((t) => {
        const before = t.schedule.length;
        t.schedule = t.schedule.filter((x) => x.gameId || x.competitionId !== c.id || !x.fixtureId || live.has(x.fixtureId));
        removed += before - t.schedule.length;
      });
      (c.matchups || []).forEach((m) => { publishMatchup(c, m); fixed++; });
      if (CloudLink && CloudLink.user) CloudLink.reconcileFixtures(c.id, [...live.keys()]);
    });
    Root.teams.forEach((t) => t.schedule.forEach((x) => { if (x.competitionId && !compOf(x.competitionId) && !x.fixtureId) { delete x.competitionId; delete x.group; } }));
    return { removed, fixed };
  }
  function competitionsScreen() {
    const c = compView && compOf(compView);
    if (!c) {
      const list = myComps(), admin = list.filter(isCompAdmin), playing = list.filter((x) => !isCompAdmin(x));
      const row = (x) => `<div class="game-row"><div class="game-info"><strong>${esc(x.name)}</strong><span class="small muted">${x.kind === 'tournament' ? 'Tournament' : 'League season'} · ${(x.groups || []).length} ${x.kind === 'tournament' ? 'pools' : 'divisions'} · ${(x.groups || []).reduce((n, g) => n + (g.teams || []).length, 0)} teams · ${fieldsOf(x).length} fields${isCompAdmin(x) ? ' · you run this' : ''}</span></div><div class="chips"><button type="button" class="btn small-btn ${isCompAdmin(x) ? 'primary' : ''}" data-a="comp-open" data-id="${x.id}">Open</button></div></div>`;
      return `<section class="panel"><h2>Competitions</h2><p class="small muted">League seasons and tournaments. Admins set the rules, divisions, fields and schedule; games show up on each team's schedule.</p>
        ${admin.length ? `<div class="label">You run</div>${admin.map(row).join('')}` : ''}
        ${playing.length ? `<div class="label">Your teams play in</div>${playing.map(row).join('')}` : ''}
        ${!list.length ? '<p class="muted">No competitions yet.</p>' : ''}
        <form class="form-row" data-form="comp"><label class="field grow"><span class="label">New competition</span><input id="new-comp" type="text" placeholder="Fall League 2026" autocomplete="off"></label><label class="field"><span class="label">Kind</span><select id="new-comp-kind"><option value="league">League season</option><option value="tournament">Tournament</option></select></label><button class="btn primary" type="submit">Create</button></form>
        <p class="small muted">You become its admin and can add other admins by email.</p></section>`;
    }
    const admin = isCompAdmin(c), groupWord = c.kind === 'tournament' ? 'Pool' : 'Division';
    const subs = [['overview', 'Overview'], ['standings', 'Standings'], ['leaders', 'Leaders'], ['divisions', `${groupWord}s`], ['rules', 'Rules'], ['fields', 'Fields'], ['matchups', 'Matchups'], ['schedule', 'Schedule'], ['playoffs', 'Playoffs']];
    let body = '';
    if (compSub === 'overview') body = compOverview(c, admin);
    else if (compSub === 'divisions') body = compDivisions(c, admin, groupWord);
    else if (compSub === 'rules') body = admin ? `<p class="small muted">Defaults for every game in ${esc(c.name)}. Captains can still agree to changes for one game when they start it.</p>${gameRulesBody(true)}` : compRulesSummary(c);
    else if (compSub === 'fields') body = compFields(c, admin);
    else if (compSub === 'matchups') body = compMatchups(c, admin, groupWord);
    else if (compSub === 'standings') body = compStandings(c);
    else if (compSub === 'leaders') body = compLeaders(c);
    else if (compSub === 'playoffs') body = compPlayoffs(c, admin);
    else body = compSchedule(c, admin);
    return `<section class="panel"><div class="panel-head"><button type="button" class="btn small-btn back" data-a="comp-close" aria-label="Back">←</button><h2>${esc(c.name)}</h2><span class="small muted">${c.kind === 'tournament' ? 'Tournament' : 'League season'}${admin ? '' : ' · view only'}</span></div>
      <div class="comp-tabs">${seg('comp-sub', compSub, subs)}</div>${body}</section>`;
  }
  // Every result: scores entered on matchups, or finals of games our own teams tracked.
  function compResults(c) {
    return (c.matchups || []).map((m) => {
      let r = m.result;
      if (!r) { const t = Root.teams.find((x) => x.id === m.a.id || x.id === m.b.id), x = t && t.schedule.find((y) => y.fixtureId === m.id && y.gameId); if (x) r = t.id === m.a.id ? { a: x.us, b: x.them } : { a: x.them, b: x.us }; }
      return r ? { a: m.a.id, b: m.b.id, sa: Number(r.a), sb: Number(r.b), group: m.group, playoff: !!m.playoff } : null;
    }).filter(Boolean);
  }
  function compStandings(c) {
    const res = compResults(c).filter((r) => !r.playoff), groups = (c.groups || []).length ? c.groups : [{ name: c.name, teams: [] }];
    const nameOf = (id) => { for (const g of c.groups || []) { const t = (g.teams || []).find((x) => x.id === id); if (t) return t.name; } return id; };
    const pct = (x) => (x.gp ? x.pct.toFixed(3).replace(/^0/, '') : '–');
    return groups.map((g, gi) => {
      const ids = (g.teams || []).map((t) => t.id), rows = Report.standings(ids, res.filter((r) => ids.includes(r.a) && ids.includes(r.b)));
      return `<h3>${esc(g.name)}</h3><div class="tbl-wrap"><table class="bx bx-box standings" data-sort-id="stand-${c.id}-${gi}"><thead><tr><th class="bx-no">#</th><th class="bx-name">Team</th><th>W-L${rows.some((x) => x.t) ? '-T' : ''}</th><th>Win %</th><th>Goals scored</th><th>Goals against</th><th>+/–</th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr><td class="bx-no" data-v="${i + 1}">${i + 1}</td><td class="bx-name">${esc(nameOf(x.id))}</td><td data-v="${x.pct}">${x.w}-${x.l}${rows.some((y) => y.t) ? '-' + x.t : ''}</td><td data-v="${x.pct}">${pct(x)}</td><td>${x.gf}</td><td>${x.ga}</td><td data-v="${x.diff}">${x.diff > 0 ? '+' : ''}${x.diff}</td></tr>`).join('') || '<tr><td colspan="7">No teams yet.</td></tr>'}</tbody></table></div>`;
    }).join('') + '<p class="small muted">Playoff games are left out. Ranked by win %. Ties: head-to-head between two teams; in bigger ties, a team that beat all the others goes first, then +/–, total wins, and goals scored. Tap a column to sort by it.</p>';
  }
  // Player leaders, from games tracked point by point in this app.
  function compLeaders(c) {
    const totals = new Map();
    const take = (t, points) => {
      const tot = Report.totals(points);
      tot.forEach((v, pid) => {
        const p = t.players.find((x) => x.id === pid); if (!p) return;
        const key = p.personId || `${t.id}:${pid}`, cur = totals.get(key) || { name: p.name, team: t.team, played: 0, plus: 0, touch: 0, comp: 0, rec: 0, goal: 0, assist: 0, block: 0 };
        const s = Report.playerSummary(points, pid);
        ['played', 'touch', 'comp', 'rec', 'goal', 'assist', 'block'].forEach((k) => { cur[k] += v[k] || 0; });
        cur.plus += s.plus - s.minus;
        totals.set(key, cur);
      });
    };
    Root.teams.forEach((t) => {
      t.history.filter((h) => h.competitionId === c.id && (h.points || []).length).forEach((h) => take(t, h.points));
      if (t.game && t.game.competitionId === c.id) take(t, t.game.points);
    });
    const COLS = [['played', 'Points played'], ['plus', '+/–'], ['touch', 'Touches'], ['comp', 'Completions'], ['rec', 'Catches'], ['goal', 'Goals'], ['assist', 'Assists'], ['block', "D's"]];
    const top = [...totals.values()].sort((x, y) => y[rankBy] - x[rankBy] || y.plus - x.plus || x.name.localeCompare(y.name)).slice(0, 10);
    if (!totals.size) return '<p class="muted">No player stats yet. Leaders come from games in this competition that were tracked point by point in the app.</p>';
    return `<div class="field"><span class="label">Top 10 by</span>${seg('rank-by', rankBy, COLS.map(([k, l]) => [k, l]))}</div>
      <div class="tbl-wrap"><table class="bx bx-box" data-sort-id="lead-${c.id}-${rankBy}"><thead><tr><th class="bx-no">#</th><th class="bx-name">Player</th>${COLS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
        ${top.map((x, i) => `<tr><td class="bx-no">${i + 1}</td><td class="bx-name">${esc(x.name)} <span class="small muted">${esc(x.team)}</span></td>${COLS.map(([k]) => `<td>${k === 'plus' && x[k] > 0 ? '+' : ''}${x[k]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="small muted">Only games tracked point by point in this app count, including other coaches' games once they're shared with you.</p>`;
  }
  function compRulesSummary(c) {
    const r = { ...S.rules, ...(c.rules || {}) };
    return `<div class="figures">${[['Players', r.size], ['Game to', r.gameTo], ['Half at', r.halfAt], ['Division', r.division === 'mixed' ? 'Mixed' : 'Single'], ['Timeouts', `${r.timeoutsPerHalf}/half${r.floaters ? ` + ${r.floaters}` : ''}`], ['Soft cap', r.softCap ? `${r.softCap} min` : 'Off'], ['Hard cap', r.hardCap ? `${r.hardCap} min` : 'Off']].map(([l, v]) => `<div class="figure"><span class="label">${l}</span><b>${esc(String(v))}</b></div>`).join('')}</div>`;
  }
  function compOverview(c, admin) {
    const cloud = CloudLink && CloudLink.user;
    return `${admin ? `<div class="form-row"><label class="field grow"><span class="label">Name</span><input type="text" data-c="comp-name" value="${esc(c.name)}"></label><div class="field"><span class="label">Kind</span>${seg('comp-kind', c.kind, [['league', 'League season'], ['tournament', 'Tournament']])}</div>
      <div class="field"><span class="label">Game slot length</span>${stepper('comp-slot', c.slotMin || 90, 30, 180, '', `${c.slotMin || 90} min`)}</div></div>` : ''}
      <h3>Admins</h3>
      ${cloud ? `${(c.admins || []).map((e) => `<div class="sub-row"><span>${esc(e)}${e === myEmail() ? ' <span class="small muted">You</span>' : ''}</span>${admin && e !== myEmail() ? twoTap('rmadm-' + e, 'comp-rm-admin', 'Remove', 'Tap again', 'danger', `data-v="${esc(e)}"`) : ''}</div>`).join('')}
        ${admin ? '<form class="form-row" data-form="comp-admin"><label class="field grow"><span class="label">Add an admin by Google email</span><input id="comp-admin" type="email" autocomplete="off" required></label><button class="btn" type="submit">Add</button></form>' : ''}`
        : '<p class="small muted">Sign in to share this competition with other admins and with the teams in it.</p>'}
      ${admin ? `<div class="chips" style="margin-top:12px">${twoTap('delcomp-' + c.id, 'del-comp', 'Delete competition', 'Tap again to delete', 'danger', `data-id="${c.id}"`)}</div>` : ''}`;
  }
  function compDivisions(c, admin, word) {
    const names = [...new Set([...Root.teams.filter((t) => !t.isExample).map((t) => t.team), ...dirNames()])];
    return `${(c.groups || []).map((g, gi) => `<div class="line-edit"><div class="panel-head"><strong>${esc(g.name)}</strong><span class="small muted">${(g.teams || []).length} teams</span>${admin ? twoTap('delgrp-' + gi, 'comp-del-group', 'Remove', 'Tap again', 'danger', `data-i="${gi}"`) : ''}</div>
        <div class="taglist">${(g.teams || []).map((t, ti) => `<span class="chip">${esc(t.name)}${t.id.startsWith('name:') ? ' <span class="small muted">(not on the app)</span>' : ''}${admin ? `<button type="button" data-a="comp-rm-team" data-i="${gi}" data-v="${ti}" aria-label="Remove ${esc(t.name)}">✕</button>` : ''}</span>`).join('') || '<span class="small muted">No teams yet.</span>'}</div>
        ${admin ? `<form class="form-row" data-form="comp-team" data-i="${gi}"><label class="field grow"><span class="label">Add a team</span><input id="comp-team-${gi}" type="text" list="team-list" placeholder="Team name" autocomplete="off"></label><button class="btn" type="submit">Add</button></form>` : ''}</div>`).join('') || `<p class="muted">No ${word.toLowerCase()}s yet.</p>`}
      ${admin ? `<form class="form-row" data-form="comp-group"><label class="field grow"><span class="label">New ${word.toLowerCase()}</span><input id="comp-group" type="text" placeholder="${word === 'Pool' ? 'Pool A' : 'North'}" autocomplete="off"></label><button class="btn primary" type="submit">Add ${word.toLowerCase()}</button></form>` : ''}
      <datalist id="team-list">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <p class="small muted">Teams on the app show up as you type. A team that isn't on the app can be added by name.</p>`;
  }
  function compFields(c, admin) {
    const hoursRow = (s, w, wi) => `<span class="chip">${w.days.map((d) => DAYS[d]).join(', ')} ${ampm(w.start)}–${ampm(w.end)}${w.from ? ` · ${esc(longDate(w.from))}–${esc(longDate(w.to))}` : ''}${admin ? `<button type="button" data-a="hours-rm" data-s="${s.id}" data-i="${wi}" aria-label="Remove these hours">✕</button>` : ''}</span>`;
    const hoursForm = (s) => `<form class="hours-form" data-form="hours" data-s="${s.id}"><div class="days">${DAYS.map((d, i) => `<label><input type="checkbox" name="d${i}" ${i === 6 ? 'checked' : ''}> ${d}</label>`).join('')}</div>
      <div class="form-row"><label class="field"><span class="label">From</span><input type="time" name="start" value="09:00" required></label><label class="field"><span class="label">To</span><input type="time" name="end" value="17:00" required></label><label class="field"><span class="label">First date</span><input type="date" name="from" required></label><label class="field"><span class="label">Last date</span><input type="date" name="to" required></label><button class="btn" type="submit">Add hours</button></div></form>`;
    return `${(c.sites || []).map((s) => `<div class="site ${siteShut.has(s.id) ? 'shut' : ''}"><div class="panel-head site-head"><button type="button" class="site-toggle" data-a="site-toggle" data-s="${s.id}" aria-expanded="${!siteShut.has(s.id)}"><span class="caret">${siteShut.has(s.id) ? '▸' : '▾'}</span><h3>${esc(s.name)}</h3><span class="small muted">${(s.fields || []).length} ${(s.fields || []).length === 1 ? 'field' : 'fields'} · ${siteHours(s).length ? `${siteHours(s).length} sets of hours` : 'no hours yet'}</span></button>${admin ? `<span class="right">${twoTap('delsite-' + s.id, 'site-del', 'Remove site', 'Tap again', 'danger', `data-s="${s.id}"`)}</span>` : ''}</div>
        ${siteShut.has(s.id) ? '' : `<div class="site-body">
        <div class="taglist">${(s.fields || []).map((f) => `<span class="chip">${esc(f.name)}${admin ? twoTapX(f.id, s.id) : ''}</span>`).join('') || '<span class="small muted">No fields yet.</span>'}</div>
        ${admin ? `<form class="form-row" data-form="field" data-s="${s.id}"><label class="field grow"><span class="label">Add fields at ${esc(s.name)} (separate with commas)</span><input name="name" type="text" placeholder="East, West, Stadium" autocomplete="off" required></label><button class="btn" type="submit">Add</button></form>` : ''}
        <div class="label">Schedulable hours (all fields at this site)</div>
        <div class="taglist">${siteHours(s).map((w, wi) => hoursRow(s, w, wi)).join('') || '<span class="small muted">No hours yet.</span>'}</div>
        ${admin ? hoursForm(s) : ''}</div>`}</div>`).join('') || '<p class="muted">No sites yet.</p>'}
      ${admin ? '</section><section class="panel"><h2>New site or complex</h2><form class="form-row" data-form="site"><label class="field grow"><span class="label">Name</span><input name="name" type="text" placeholder="Franklin High School" autocomplete="off" required></label><button class="btn primary" type="submit">Add site</button></form><p class="small muted">Add the fields at it and its hours after.</p>' : ''}`;
  }
  const twoTapX = (fid, sid) => `<button type="button" data-a="confirm" data-key="delfld-${fid}" data-then="field-del" data-s="${sid}" data-f="${fid}" aria-label="Remove field">${confirmKey === 'delfld-' + fid ? 'Tap again' : '✕'}</button>`;
  // Hours are set per site; older data kept them per field.
  function siteHours(s) {
    if (s.hours && s.hours.length) return s.hours;
    const seen = new Set();
    return (s.fields || []).flatMap((f) => f.hours || []).filter((w) => { const k = JSON.stringify(w); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function mapEditor(f) {
    return `<div class="map-box"><div class="map-search"><input id="map-search" type="search" placeholder="Search for a place or address" autocomplete="off"><div id="map-results"></div></div>
      <div id="map" class="map" aria-label="Map: tap to drop a pin"></div>
      <div class="form-row"><label class="field grow"><span class="label">Address or note</span><input id="map-address" type="text" value="${esc(f.address || '')}" autocomplete="off"></label><label class="field"><span class="label">Latitude, longitude</span><input id="map-ll" type="text" value="${f.lat != null ? `${f.lat}, ${f.lng}` : ''}" placeholder="47.6062, -122.3321" autocomplete="off"></label></div>
      <p class="small muted" id="map-note">Search, or tap the map to drop the pin where the field is.</p>
      <div class="chips"><button type="button" class="btn primary" data-a="field-map-save">Save location</button><button type="button" class="btn" data-a="field-map-close">Cancel</button></div></div>`;
  }
  function compMatchups(c, admin, word) {
    const where = (m) => { if (!m.slot) return m.linked ? `<span class="small">${esc(longDate(m.date))} · linked game</span>` : '<span class="small muted">Not scheduled</span>'; const f = fieldById(c, m.slot.fieldId); return `<span class="small">${esc(longDate(m.slot.date))} · ${ampm(m.slot.start)}${f ? ' · ' + esc(f.label) : ''}</span>`; };
    const row = (m) => `<div class="sub-row"><span>${m.label ? `<span class="tag-comp">${esc(m.label)}</span> ` : ''}<strong>${esc(m.a.name)}</strong> vs <strong>${esc(m.b.name)}</strong>${m.result ? ` <b>${m.result.a}–${m.result.b}</b>` : ''} ${where(m)}${!admin && m.playoff ? ' <span class="tag-comp">Playoff</span>' : ''}</span>${admin ? `<span class="chips"><label class="check small"><input type="checkbox" data-c="mu-playoff" data-id="${m.id}" ${m.playoff ? 'checked' : ''} ${m.bracketId ? 'disabled' : ''}> Playoff</label>${twoTap('mudel-' + m.id, 'mu-del', 'Remove', 'Tap again', 'danger', `data-id="${m.id}"`)}</span>` : ''}</div>`;
    return `${(c.groups || []).map((g, gi) => {
      const list = (c.matchups || []).filter((m) => m.group === g.name), teams = g.teams || [], key = `${c.id}:${g.name}`, shut = muShut.has(key);
      return `<div class="line-edit"><div class="panel-head site-head"><button type="button" class="site-toggle" data-a="mu-toggle" data-v="${esc(key)}" aria-expanded="${!shut}"><span class="caret">${shut ? '▸' : '▾'}</span><strong>${esc(g.name)}</strong><span class="small muted">${list.length} matchups${list.some((m) => m.playoff) ? ` · ${list.filter((m) => m.playoff).length} playoff` : ''}</span></button>${admin && teams.length > 1 && !shut ? `<span class="right"><button type="button" class="btn small-btn" data-a="round-robin" data-i="${gi}">Round robin</button></span>` : ''}</div>
        ${shut ? '' : `${list.map(row).join('') || '<p class="small muted">No matchups yet.</p>'}
        ${admin && teams.length > 1 ? `<form class="form-row" data-form="matchup" data-i="${gi}"><label class="field"><span class="label">Team</span><select name="a">${teams.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select></label><label class="field"><span class="label">vs</span><select name="b">${teams.map((t, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label><label class="check"><input type="checkbox" name="playoff"> Playoff</label><button class="btn" type="submit">Add matchup</button></form>` : ''}`}</div>`;
    }).join('') || `<p class="muted">Add ${word.toLowerCase()}s and teams first.</p>`}
      <p class="small muted">Playoff games don't count in the standings. Bracket games are set up on the Playoffs tab.</p>`;
  }

  /* ---------- Playoffs: brackets whose games fill in as results come in ---------- */
  const gameLabel = (c, id) => { const m = (c.matchups || []).find((x) => x.id === id); return m ? m.label || 'a game' : 'a game'; };
  const tbd = (id, name) => ({ id: `tbd:${id}`, name });
  const isTbd = (t) => !t || String(t.id).startsWith('tbd:');
  function srcText(c, s) {
    if (!s) return 'TBD';
    if (s.seed) { const br = (c.brackets || []).find((b) => b.id === s.bracket); return `${br && (c.brackets || []).length > 1 ? br.name + ' ' : ''}Seed #${s.seed}`; }
    if (s.winner) return `Winner of ${gameLabel(c, s.winner)}`;
    if (s.loser) return `Loser of ${gameLabel(c, s.loser)}`;
    return s.team ? s.team.name : 'TBD';
  }
  // Who a source points to right now: a seeded team, a known winner or loser, or a name for the empty spot.
  function resolveSrc(c, s) {
    if (!s) return tbd('x', 'TBD');
    if (s.team) return { ...s.team };
    if (s.seed) { const br = (c.brackets || []).find((b) => b.id === s.bracket), t = br && br.seeds[s.seed - 1]; return t ? { ...t } : tbd(`${s.bracket}:s${s.seed}`, srcText(c, s)); }
    const g = (c.matchups || []).find((m) => m.id === (s.winner || s.loser));
    if (g && g.result && Number(g.result.a) !== Number(g.result.b) && !isTbd(g.a) && !isTbd(g.b)) {
      const aWon = Number(g.result.a) > Number(g.result.b), pick = s.winner ? (aWon ? g.a : g.b) : (aWon ? g.b : g.a);
      return { ...pick };
    }
    return tbd(`${s.winner ? 'w' : 'l'}:${g ? g.id : 'x'}`, srcText(c, s));
  }
  function resolvePlayoffs(c) {
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      (c.matchups || []).filter((m) => m.src).forEach((m) => {
        const a = resolveSrc(c, m.src.a), b = resolveSrc(c, m.src.b);
        if (a.id === m.a.id && a.name === m.a.name && b.id === m.b.id && b.name === m.b.name) return;
        if (m.result && (a.id !== m.a.id || b.id !== m.b.id)) delete m.result;
        m.a = a; m.b = b; moved = true;
        if (m.slot) publishMatchup(c, m);
      });
      if (!moved) break;
    }
  }
  function addPlayoffGame(c, br, round, a, b) {
    c.playoffSeq = (c.playoffSeq || 0) + 1;
    const m = { id: uid(), playoff: true, bracketId: br ? br.id : null, round, label: `G${c.playoffSeq}`, src: { a, b }, group: br ? br.group || '' : '', a: tbd('x', 'TBD'), b: tbd('x', 'TBD'), slot: null };
    c.matchups = c.matchups || []; c.matchups.push(m);
    return m;
  }
  // Standard seeding: 1 plays the lowest seed, and the top seeds get the byes.
  function seedOrder(p) { let o = [1]; while (o.length < p) { const n = o.length * 2; o = o.flatMap((s) => [s, n + 1 - s]); } return o; }
  function makeBracket(c, name, group, n, entrants) {
    const br = { id: uid(), name, group: group || '', size: n, seeds: Array(n).fill(null) };
    c.brackets = c.brackets || []; c.brackets.push(br);
    const src = (k) => (entrants ? entrants[k - 1] : { bracket: br.id, seed: k });
    let p = 1; while (p < n) p *= 2;
    const order = seedOrder(p);
    let next = [], round = 1;
    for (let i = 0; i < order.length; i += 2) {
      const x = order[i] <= n ? src(order[i]) : null, y = order[i + 1] <= n ? src(order[i + 1]) : null;
      if (x && y) next.push({ winner: addPlayoffGame(c, br, round, x, y).id }); else next.push(x || y);
    }
    while (next.length > 1) {
      round += 1;
      const now = next; next = [];
      for (let i = 0; i < now.length; i += 2) next.push({ winner: addPlayoffGame(c, br, round, now[i], now[i + 1]).id });
    }
    br.rounds = round;
    resolvePlayoffs(c);
    return br;
  }
  const roundName = (br, r) => { if (r % 1) return '3rd place'; const left = br.rounds - r; return left === 0 ? 'Final' : left === 1 ? 'Semifinals' : left === 2 ? 'Quarterfinals' : `Round ${r}`; };
  function compPlayoffs(c, admin) {
    const groups = c.groups || [], word = c.kind === 'tournament' ? 'pool' : 'division';
    if (playDiv !== 'all' && !groups.some((g) => g.name === playDiv)) playDiv = 'all';
    const brackets = (c.brackets || []).filter((b) => playDiv === 'all' || b.group === playDiv);
    const teamsFor = (br) => (br.group ? (groups.find((g) => g.name === br.group) || { teams: [] }).teams : groups.flatMap((g) => g.teams || []));
    const gameCard = (m) => {
      const f = m.slot && fieldById(c, m.slot.fieldId), ready = !isTbd(m.a) && !isTbd(m.b);
      const aWon = m.result && Number(m.result.a) > Number(m.result.b);
      return `<div class="bk-game" id="bk-${m.id}"><div class="bk-head">${admin && bkRename === m.id ? `<input type="text" class="bk-label" data-c="bk-label" data-id="${m.id}" value="${esc(m.label)}" aria-label="Game name" autocomplete="off">` : admin ? `<button type="button" class="linkish bk-name" data-a="bk-rename" data-id="${m.id}" title="Rename this game"><b>${esc(m.label)}</b></button>` : `<b>${esc(m.label)}</b>`}<span class="small muted">${m.slot ? `${esc(longDate(m.slot.date))} · ${ampm(m.slot.start)}${f ? ' · ' + esc(f.label) : ''}` : 'Not scheduled'}</span></div>
        <div class="bk-side ${m.result && aWon ? 'won' : ''}"><span>${m.src && m.src.a && m.src.a.seed ? `<span class="seed">${m.src.a.seed}</span>` : ''}${esc(m.a.name)}</span>${m.result ? `<b>${m.result.a}</b>` : ''}</div>
        <div class="bk-side ${m.result && !aWon ? 'won' : ''}"><span>${m.src && m.src.b && m.src.b.seed ? `<span class="seed">${m.src.b.seed}</span>` : ''}${esc(m.b.name)}</span>${m.result ? `<b>${m.result.b}</b>` : ''}</div>
        ${admin ? `<div class="chips">${ready ? `<button type="button" class="btn small-btn ${m.result ? '' : 'primary'}" data-a="score-open" data-comp="${c.id}" data-id="${m.id}">${m.result ? 'Edit score' : 'Enter score'}</button>` : ''}${m.src ? `<button type="button" class="btn small-btn" data-a="bk-edit" data-id="${m.id}">${bkEdit === m.id ? 'Done' : 'Change teams'}</button>` : ''}${twoTap('mudel-' + m.id, 'mu-del', 'Remove', 'Tap again', 'danger', `data-id="${m.id}"`)}</div>
        ${bkEdit === m.id && m.src ? `<div class="form-row">${['a', 'b'].map((k) => `<label class="field grow"><span class="label">${k === 'a' ? 'Top' : 'Bottom'}</span><select data-c="po-src" data-id="${m.id}" data-k="${k}">${sources(srcKey(m.src[k]), m.id)}</select></label>`).join('')}</div>` : ''}` : ''}</div>`;
    };
    const seedsEditor = (br) => {
      const teams = teamsFor(br), entrantsFixed = !(c.matchups || []).some((m) => m.bracketId === br.id && m.src && [m.src.a, m.src.b].some((s) => s && s.seed && s.bracket === br.id));
      if (entrantsFixed) return '<p class="small muted">Entrants come from other games.</p>';
      return `<div class="seeds">${br.seeds.map((t, i) => `<label class="seed-pick"><span class="seed">${i + 1}</span><select data-c="seed" data-b="${br.id}" data-i="${i}" ${admin ? '' : 'disabled'}><option value="">Seed #${i + 1}</option>${teams.map((x) => `<option value="${esc(x.id)}" ${t && t.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`).join('')}</div>
        ${admin ? `<div class="chips"><button type="button" class="btn small-btn" data-a="seed-standings" data-b="${br.id}">Seed from standings</button></div>` : ''}`;
    };
    const bracketView = (br) => {
      const games = (c.matchups || []).filter((m) => m.bracketId === br.id), rounds = [...new Set(games.map((m) => m.round))].sort((x, y) => (x % 1 ? x + 1 : x) - (y % 1 ? y + 1 : y));
      return `<div class="bracket"><div class="panel-head"><h3>${esc(br.name)}</h3><span class="small muted">${br.size} teams${br.group ? ' · ' + esc(br.group) : ''}</span>${admin ? `<span class="right">${br.rounds > 1 && !games.some((m) => m.round % 1) ? `<button type="button" class="btn small-btn" data-a="bk-third" data-b="${br.id}">Add 3rd-place game</button>` : ''}${games.filter((m) => m.round === 1).length > 1 ? `<button type="button" class="btn small-btn" data-a="bk-consol" data-b="${br.id}">Add consolation bracket</button>` : ''}${twoTap('delbk-' + br.id, 'bk-del', 'Delete bracket', 'Tap again: deletes its games', 'danger', `data-b="${br.id}"`)}</span>` : ''}</div>
        ${seedsEditor(br)}
        <div class="bk-rounds">${rounds.map((r) => `<div class="bk-round"><div class="label">${roundName(br, r)}</div>${games.filter((m) => m.round === r).map(gameCard).join('')}</div>`).join('')}</div></div>`;
    };
    const extra = (c.matchups || []).filter((m) => m.src && !m.bracketId && (playDiv === 'all' || m.group === playDiv));
    const sources = (sel, skip) => {
      const opts = [];
      (c.brackets || []).forEach((b) => b.seeds.forEach((_, i) => opts.push([`seed:${b.id}:${i + 1}`, `${b.name} seed #${i + 1}`])));
      (c.matchups || []).filter((m) => m.playoff && m.label && m.id !== skip).forEach((m) => { opts.push([`w:${m.id}`, `Winner of ${m.label}`]); opts.push([`l:${m.id}`, `Loser of ${m.label}`]); });
      groups.flatMap((g) => g.teams || []).forEach((t) => opts.push([`t:${t.id}`, t.name]));
      return (sel === undefined ? '' : `<option value="" ${sel ? '' : 'selected'}>TBD</option>`) + opts.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
    };
    return `<div class="form-row">${groups.length > 1 ? `<label class="field"><span class="label">${word === 'pool' ? 'Pool' : 'Division'}</span><select data-c="play-div"><option value="all">All</option>${groups.map((g) => `<option value="${esc(g.name)}" ${playDiv === g.name ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : ''}</div>
      ${brackets.map(bracketView).join('') || '<p class="muted">No brackets yet.</p>'}
      ${extra.length ? `<h3>Other playoff games</h3><div class="bk-round">${extra.map(gameCard).join('')}</div>` : ''}
      ${admin ? `</section><section class="panel"><h2>New bracket</h2><form class="form-row" data-form="bracket"><label class="field grow"><span class="label">Name</span><input name="name" type="text" value="${esc(playDiv !== 'all' ? playDiv + ' playoffs' : 'Playoffs')}" autocomplete="off"></label>
        ${groups.length ? `<label class="field"><span class="label">${word === 'pool' ? 'Pool' : 'Division'}</span><select name="group"><option value="">Whole competition</option>${groups.map((g) => `<option value="${esc(g.name)}" ${playDiv === g.name ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span class="label">Teams</span><input name="n" type="number" min="3" max="12" value="8" required></label><button class="btn primary" type="submit">Create bracket</button></form>
        <p class="small muted">3 to 12 teams. Top seeds get the byes. Seed teams once it's made, then schedule its games on the Schedule tab.</p>
        <h3>Add a single game</h3><form class="form-row" data-form="po-game"><label class="field grow"><span class="label">Team or spot</span><select name="a">${sources()}</select></label><label class="field grow"><span class="label">vs</span><select name="b">${sources()}</select></label><button class="btn" type="submit">Add game</button></form>
        <p class="small muted">For odd byes, crossovers or anything custom: point each side at a seed, the winner or loser of another game, or a team.</p>` : ''}`;
  }
  const srcKey = (s) => (!s ? '' : s.seed ? `seed:${s.bracket}:${s.seed}` : s.winner ? `w:${s.winner}` : s.loser ? `l:${s.loser}` : s.team ? `t:${s.team.id}` : '');
  const parseSrc = (v) => { if (!v) return null; const [k, x, y] = v.split(':'); if (k === 'seed') return { bracket: x, seed: Number(y) }; if (k === 'w') return { winner: x }; if (k === 'l') return { loser: x }; const t = allTeams().find((q) => q.id === v.slice(2)); return t ? { team: { id: t.id, name: t.name } } : null; };

  // Point an older game of ours at a league game: competition, division and opponent.
  function leagueLinkRow(g) {
    const list = comps().filter(isCompAdmin), sel = (linkDraft.comp && compOf(linkDraft.comp)) || list[0];
    if (!sel) return '<p class="small muted">You need to run a competition to link games to it.</p>';
    const opp = (g.opp || '').toLowerCase();
    const teams = (sel.groups || []).flatMap((gr) => (gr.teams || []).map((t) => ({ ...t, group: gr.name }))).filter((t) => t.id !== g.t.id);
    const guess = teams.find((t) => t.name.toLowerCase() === opp) || teams.find((t) => opp && (t.name.toLowerCase().includes(opp) || opp.includes(t.name.toLowerCase())));
    const mine = groupOf(sel, g.t.id);
    return `<form class="game-edit league-link" data-form="league-link"><strong>Link to a league game</strong>
      <div class="form-row"><label class="field"><span class="label">Competition</span><select data-c="link-comp">${list.map((c) => `<option value="${c.id}" ${c === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${(sel.groups || []).length ? `<label class="field"><span class="label">${sel.kind === 'tournament' ? 'Pool' : 'Division'}</span><select name="group">${sel.groups.map((gr) => `<option value="${esc(gr.name)}" ${(g.grp || (guess ? guess.group : mine && mine.name)) === gr.name ? 'selected' : ''}>${esc(gr.name)}</option>`).join('')}</select></label>` : ''}
      <label class="field grow"><span class="label">Opponent</span><select name="opp">${teams.map((t) => `<option value="${esc(t.id)}" ${guess && guess.id === t.id ? 'selected' : ''}>${esc(t.name)} · ${esc(t.group)}</option>`).join('')}<option value="__new" ${guess ? '' : 'selected'}>Add "${esc(g.opp || 'Opponent')}" as a new team</option></select></label>
      <label class="check"><input type="checkbox" name="playoff"> Playoff game</label></div>
      <div class="chips"><button class="btn primary" type="submit">Link</button><button class="btn" type="button" data-a="link-close">Cancel</button></div>
      <p class="small muted">The game and its score count for ${esc(sel.name)}${mine ? '' : `, and ${esc(g.t.team)} joins the ${sel.kind === 'tournament' ? 'pool' : 'division'} you pick`}.</p></form>`;
  }
  // Replace one team record with another everywhere it's referenced.
  function mergeTeamRefs(fromId, to) {
    const ref = { id: to.id, name: to.name };
    comps().forEach((c) => {
      let hit = false;
      (c.groups || []).forEach((g) => {
        const from = (g.teams || []).find((t) => t.id === fromId);
        if (!from) return;
        hit = true;
        if (g.teams.some((t) => t.id === to.id)) g.teams = g.teams.filter((t) => t !== from);
        else Object.assign(from, ref);
      });
      (c.brackets || []).forEach((b) => b.seeds.forEach((s, i) => { if (s && s.id === fromId) { b.seeds[i] = { ...ref }; hit = true; } }));
      (c.matchups || []).forEach((m) => {
        let mh = false;
        [m.a, m.b].forEach((x) => { if (x.id === fromId) { Object.assign(x, ref); mh = true; } });
        if (m.src) [m.src.a, m.src.b].forEach((s) => { if (s && s.team && s.team.id === fromId) { s.team = { ...ref }; mh = true; } });
        if (mh) { hit = true; if (m.slot) publishMatchup(c, m); }
      });
      if (hit) { resolvePlayoffs(c); touchComp(c); }
    });
    Root.teams.forEach((t) => {
      (t.schedule || []).forEach((x) => { if (x.oppTeamId === fromId) { x.oppTeamId = to.id; x.opponent = to.name; } });
      if ((t.links || []).some((l) => l.id === fromId)) t.links = t.links.filter((l) => l.id !== fromId && l.id !== to.id).concat(ref);
    });
  }


  function compSchedule(c, admin) {
    const dates = slotDates(c);
    if (!(c.sites || []).some((s) => siteHours(s).length && (s.fields || []).length)) return '<p class="muted">Add sites, fields and schedulable hours first (Fields tab).</p>';
    if (!dates.includes(schedDate)) schedDate = dates.find((d) => d >= localDay()) || dates[0];
    const step = 15, sites = (c.sites || []).filter((s) => (s.fields || []).length), groups = c.groups || [];
    if (schedSite !== 'all' && !sites.some((s) => s.id === schedSite)) schedSite = 'all';
    if (schedDiv !== 'all' && !groups.some((g) => g.name === schedDiv)) schedDiv = 'all';
    const cols = windowsOn(c, schedDate).filter((f) => schedSite === 'all' || f.siteId === schedSite);
    const lo = Math.min(...cols.flatMap((f) => f.wins.map((w) => w[0]))), hi = Math.max(...cols.flatMap((f) => f.wins.map((w) => w[1])));
    const mine = (m) => schedDiv === 'all' || m.group === schedDiv;
    const games = (c.matchups || []).filter((m) => m.slot && m.slot.date === schedDate), open = (c.matchups || []).filter((m) => !m.slot && !m.linked && mine(m));
    const chip = (m, placed) => {
      const why = placed ? '' : siteConflict(c, m), other = placed && !mine(m), drag = admin && !other;
      return `<span class="mu ${muSel === m.id ? 'sel' : ''} ${why ? 'bad' : ''} ${other ? 'other' : ''}" ${drag ? `data-a="mu-pick" data-id="${m.id}" data-drag="mu:${m.id}"` : ''} title="${esc(why || m.group || '')}">${placed && drag ? `<i class="grip top" data-drag="grip:top:${m.id}" title="Drag to start earlier or later"></i>` : ''}<span class="mu-txt">${placed ? `<span class="small">${ampm(m.slot.start)}–${ampm(hm(HM(m.slot.start) + lenOf(c, m)))}${other ? ' · ' + esc(m.group) : ''}</span>` : ''}<b>${esc(m.a.name)}</b> v <b>${esc(m.b.name)}</b></span>${placed && drag ? `<button type="button" data-a="mu-unslot" data-id="${m.id}" aria-label="Unschedule">✕</button><i class="grip bottom" data-drag="grip:bottom:${m.id}" title="Drag to make the game longer or shorter"></i>` : ''}</span>`;
    };
    const rows = [];
    if (cols.length) for (let t = lo; t < hi; t += step) {
      rows.push(`<tr data-t="${hm(t)}" class="${t % 60 === 0 ? 'hour' : ''}"><th>${t % 60 === 0 ? ampm(hm(t)) : ''}</th>${cols.map((f) => {
        const g = games.find((m) => m.slot.fieldId === f.fieldId && HM(m.slot.start) === t);
        if (g) return `<td class="slot full ${mine(g) ? '' : 'other'}" rowspan="${Math.ceil(lenOf(c, g) / step)}" data-f="${f.fieldId}" data-t="${hm(t)}">${chip(g, true)}</td>`;
        if (games.some((m) => m.slot.fieldId === f.fieldId && HM(m.slot.start) < t && HM(m.slot.start) + lenOf(c, m) > t)) return '';
        const inside = f.wins.some(([s, e]) => t >= s && t < e);
        if (!inside) return '<td class="noslot"></td>';
        return `<td class="slot" data-f="${f.fieldId}" data-t="${hm(t)}" ${admin ? `data-a="slot-pick" data-drop="slot:${f.fieldId}|${hm(t)}"` : ''}></td>`;
      }).join('')}</tr>`);
    }
    return `<div class="form-row"><label class="field"><span class="label">Day</span><select data-c="sched-date">${dates.map((d) => `<option value="${d}" ${d === schedDate ? 'selected' : ''}>${esc(longDate(d))}${(c.matchups || []).some((m) => m.slot && m.slot.date === d) ? ' •' : ''}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Site</span><select data-c="sched-site"><option value="all">All sites</option>${sites.map((s) => `<option value="${s.id}" ${schedSite === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      ${groups.length > 1 ? `<label class="field"><span class="label">${c.kind === 'tournament' ? 'Pool' : 'Division'}</span><select data-c="sched-div"><option value="all">All</option>${groups.map((g) => `<option value="${esc(g.name)}" ${schedDiv === g.name ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : ''}
      <span class="right"><button type="button" class="btn small-btn" data-a="comp-export">Copy schedule as text</button><button type="button" class="btn small-btn" data-a="reconcile">Fix out-of-date games</button></span></div>
      ${admin ? `<p class="small muted">${open.length} matchups to schedule. Drag one onto a field at any quarter hour (or tap it, then the time). Drag a placed game to move it, or its top or bottom edge to change its length. Red ones can't be played at this site today.</p><div class="mu-tray" data-drop="mu-tray">${open.map((m) => chip(m)).join('') || '<span class="small muted">Everything is scheduled.</span>'}</div>` : ''}
      ${cols.length ? `<div class="tbl-wrap"><table class="sched" data-len="${c.slotMin || 90}"><thead><tr><th></th>${cols.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<p class="muted">No open hours on this day.</p>'}
      <p class="small muted">Striped cells are outside the site's hours. ${schedDiv !== 'all' ? 'Darker games are from other divisions.' : ''}</p>`;
  }
  // Maps: Google when the project has it turned on, otherwise OpenStreetMap.
  let mapsLib = null, mapState = null;
  function loadScript(src) { return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }); }
  function loadMaps() {
    if (mapsLib) return mapsLib;
    const key = window.MAPS_KEY || (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
    const leaflet = () => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l); return loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').then(() => 'osm'); };
    const google = () => new Promise((ok, bad) => {
      if (!key) { bad(new Error('no key')); return; }
      const t = setTimeout(() => bad(new Error('slow')), 7000);
      window.gm_authFailure = () => { clearTimeout(t); bad(new Error('denied')); };
      window.__gmReady = () => { clearTimeout(t); setTimeout(() => ok('google'), 600); };
      loadScript(`https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&callback=__gmReady`).catch(bad);
    });
    mapsLib = google().catch(leaflet).catch(() => null);
    return mapsLib;
  }
  function setPin(lat, lng, address) {
    mapState.lat = Math.round(lat * 1e6) / 1e6; mapState.lng = Math.round(lng * 1e6) / 1e6;
    const ll = document.getElementById('map-ll'); if (ll) ll.value = `${mapState.lat}, ${mapState.lng}`;
    if (address) { const a = document.getElementById('map-address'); if (a) a.value = address; }
    if (mapState.kind === 'google') { mapState.marker.setPosition({ lat: mapState.lat, lng: mapState.lng }); mapState.map.panTo({ lat: mapState.lat, lng: mapState.lng }); }
    if (mapState.kind === 'osm') { mapState.marker.setLatLng([mapState.lat, mapState.lng]); mapState.map.panTo([mapState.lat, mapState.lng]); }
  }
  async function mountMap() {
    const el = document.getElementById('map');
    if (!el || el.dataset.ready) return;
    el.dataset.ready = '1';
    const f = fieldEdit && fieldById(compOf(compView), fieldEdit.f), field = f && f.field;
    const start = field && field.lat != null ? { lat: field.lat, lng: field.lng } : { lat: 47.6062, lng: -122.3321 };
    mapState = { lat: field ? field.lat : null, lng: field ? field.lng : null };
    const kind = await loadMaps();
    const note = document.getElementById('map-note');
    if (!document.body.contains(el)) return;
    if (kind === 'google') {
      const g = window.google.maps;
      const map = new g.Map(el, { center: start, zoom: field && field.lat != null ? 17 : 12, mapTypeId: 'hybrid', streetViewControl: false, fullscreenControl: false });
      const marker = new g.Marker({ map, position: start, draggable: true });
      Object.assign(mapState, { kind, map, marker });
      map.addListener('click', (e) => setPin(e.latLng.lat(), e.latLng.lng()));
      marker.addListener('dragend', (e) => setPin(e.latLng.lat(), e.latLng.lng()));
      try {
        const { PlaceAutocompleteElement } = await g.importLibrary('places');
        const ac = new PlaceAutocompleteElement({});
        const box = document.getElementById('map-search'); box.replaceWith(ac); ac.id = 'map-search';
        ac.addEventListener('gmp-select', async ({ placePrediction }) => { const p = placePrediction.toPlace(); await p.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] }); setPin(p.location.lat(), p.location.lng(), `${p.displayName || ''}${p.formattedAddress ? ', ' + p.formattedAddress : ''}`); map.setZoom(17); });
      } catch (e) {
        const box = document.getElementById('map-search');
        if (g.places && g.places.Autocomplete && box) { const ac = new g.places.Autocomplete(box, { fields: ['geometry', 'formatted_address', 'name'] }); ac.addListener('place_changed', () => { const p = ac.getPlace(); if (p.geometry) { setPin(p.geometry.location.lat(), p.geometry.location.lng(), `${p.name}, ${p.formatted_address}`); map.setZoom(17); } }); }
      }
      if (note) note.textContent = 'Search, tap the map, or drag the pin.';
    } else if (kind === 'osm' && window.L) {
      const L = window.L, map = L.map(el).setView([start.lat, start.lng], field && field.lat != null ? 17 : 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);
      Object.assign(mapState, { kind, map, marker });
      map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
      marker.on('dragend', () => { const p = marker.getLatLng(); setPin(p.lat, p.lng); });
      const box = document.getElementById('map-search'), results = document.getElementById('map-results');
      let tmr = null;
      box.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(async () => {
        const q = box.value.trim(); if (q.length < 3) { results.innerHTML = ''; return; }
        try { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`).then((x) => x.json()); results.innerHTML = r.map((x, i) => `<button type="button" data-i="${i}">${esc(x.display_name)}</button>`).join(''); results.querySelectorAll('button').forEach((b) => { b.onclick = () => { const x = r[Number(b.dataset.i)]; setPin(Number(x.lat), Number(x.lon), x.display_name); map.setZoom(17); results.innerHTML = ''; }; }); } catch (e) { results.innerHTML = ''; }
      }, 450); });
      if (note) note.textContent = 'Search, tap the map, or drag the pin. Map data from OpenStreetMap.';
    } else {
      el.classList.add('map-off');
      if (note) note.textContent = "The map couldn't load here. Type the latitude and longitude instead (from Google Maps: press and hold the spot).";
    }
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
      ...(g ? [{ key: 'current', label: `${(() => { const x = g.scheduleId && S.schedule.find((y) => y.id === g.scheduleId); return x && x.date ? shortDay(x.date) : dated(g.startedAt); })()} vs ${g.opponent || 'Opponent'}`, note: 'In progress', us: count(g.points, 'us'), them: count(g.points, 'them'), t: Report.totals(g.points).get(p.id) || zero, points: g.points }] : []),
      ...S.history.slice().reverse().map((h) => ({ key: h.id, label: `${shortDay(gameDay(h))} vs ${h.opponent || 'Opponent'}`, note: '', us: h.us, them: h.them, t: { ...zero, ...(h.perPlayer[p.id] || {}) }, points: h.points || [] })),
    ].filter((x) => x.t.played > 0);
    const all = games.flatMap((x) => x.points);
    const sum = { ...zero };
    games.forEach((x) => Object.keys(zero).forEach((k) => { sum[k] += x.t[k] || 0; }));
    const rec = Report.playerSummary(all, p.id);
    const net = rec.plus - rec.minus;
    const pracs = S.schedule.filter((x) => x.kind === 'practice' && x.attend), pracHere = pracs.filter((x) => x.attend[p.id]).length;
    const figures = [...(pracs.length ? [['Practices', `${pracHere} of ${pracs.length}`]] : []), ['Games', games.length], ['Points', `${sum.played} (${sum.O}/${sum.D})`], ['+/–', `${net > 0 ? '+' : ''}${net}`], ['Touches', sum.touch], ['Goals', sum.goal], ['Assists', sum.assist], ['Turns', sum.turn], ['Blocks', sum.block], ['O points scored', rec.O ? `${rec.Owon}/${rec.O}` : '–'], ['Breaks on D', rec.D ? `${rec.Dwon}/${rec.D}` : '–']];
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
      return `<details ${gi < 3 ? 'open' : ''}><summary>${esc(x.label)} · ${x.t.played} points</summary>${rows}</details>`;
    }).join('');
    return `<section class="panel">
      <div class="panel-head"><button type="button" class="btn small-btn back" data-a="player-back" aria-label="Back">←</button><h2>${nameTag(p)}${p.nick ? ` <span class="muted nick">“${esc(p.nick)}”</span>` : ''}${p.youth ? ' <span class="tag-comp">Youth</span>' : ''}</h2><span class="right">${insightBtn('player', p.id)}<button type="button" class="btn small-btn" data-a="edit" data-id="${p.id}">Edit player</button></span></div>
      <p class="small muted">${allSkills().map(([k, l]) => `${esc(l)} ${E.rate(p, k)}`).join(' · ')}${p.tags.length ? ' · ' + esc(p.tags.join(', ')) : ''} · ${TARGET_LABEL[p.target]} playtime · Minimum ${E.minPointsOf(p)}</p>
      <div class="figures">${figures.map(([l, v]) => `<div class="figure"><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
      <h3>Games</h3>
      ${games.length ? `<div class="tbl-wrap"><table class="bx bx-box" data-sort-id="player-games"><thead><tr><th class="bx-name">Game</th><th>Final</th><th>Points</th><th>Touches</th><th>Goals</th><th>Assists</th><th>Turns</th><th>Blocks</th></tr></thead><tbody>${gameRows}</tbody></table></div>` : '<p class="muted">No games yet.</p>'}
      <div class="partners"><div><h3>Throws most to</h3><div class="sug-chips">${partner(rec.throwsTo)}</div></div><div><h3>Catches most from</h3><div class="sug-chips">${partner(rec.catchesFrom)}</div></div></div>
      <h3>Points played</h3>${pointBlocks || '<p class="muted">No point details saved.</p>'}
    </section>`;
  }

  /* ---------- Rules ---------- */
  function positionsPanel() {
    const r = rules();
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
  function gameRulesBody(compMode) {
    const r = rules();
    const mins = (k) => stepper('rule', rv(k, 0), 0, 240, `data-k="${k}" data-step="5"`, rv(k, 0) ? `${rv(k, 0)} min` : 'Off');
    return `
        <div class="rl"><span>Players on the field</span>${stepper('rule', r.size, 4, 7, 'data-k="size"')}</div>
        <div class="rl"><span>Halftime at</span>${stepper('rule', r.halfAt, 1, 25, 'data-k="halfAt"')}</div>
        <div class="rl"><span>Game to</span>${stepper('rule', r.gameTo, 1, 25, 'data-k="gameTo"')}</div>
        <div class="rl"><span>Division</span>${seg('division', r.division, [['open', 'Single'], ['mixed', 'Mixed']])}</div>
        ${r.division === 'mixed' ? `<div class="rl"><span>Gender ratio</span>${seg('ratio-mode', r.ratioMode, [['abba', 'ABBA'], ['gendzone', 'Gendzone'], ['call', 'Offense Calls']])}</div>
        ${r.ratioMode === 'abba' ? `<div class="rl"><span>First point has more</span>${seg('ratio-start', r.ratioStart, [['W', GW('W', true)], ['M', GW('M', true)]])}</div>` : ''}
        ${r.ratioMode === 'abba' ? '' : `<p class="small muted">Tap the ratio on the Current Game screen to set each point's call.${r.ratioMode === 'gendzone' ? ' Who starts in the gendzone is set when you start a game.' : ''}</p>`}` : ''}
        <h3>Timeouts</h3>
        <div class="rl"><span>Timeouts per half</span>${stepper('rule', rv('timeoutsPerHalf', 2), 0, 5, 'data-k="timeoutsPerHalf"')}</div>
        <div class="rl"><span>Floaters (use in either half)</span>${stepper('rule', rv('floaters', 0), 0, 3, 'data-k="floaters"')}</div>
        <h3>Caps</h3>
        <p class="small muted">Minutes from the start of the game.</p>
        <div class="rl"><span>Soft cap</span>${mins('softCap')}</div>
        ${rv('softCap', 0) ? `<div class="rl"><span>At soft cap, play to the high score plus</span>${stepper('rule', rv('softCapAdd', 1), 1, 5, 'data-k="softCapAdd"', `${rv('softCapAdd', 1)} ${rv('softCapAdd', 1) === 1 ? 'point' : 'points'}`)}</div>` : ''}
        <div class="rl"><span>Hard cap</span>${mins('hardCap')}</div>
        <div class="rl"><span>Time cap</span>${mins('timeCap')}</div>
        ${compMode ? '' : `<div class="rl"><span>Alarm sound (and 5-minute warning)</span>${seg('cap-alarms', rv('capAlarms', false) ? 'on' : 'off', [['off', 'Off'], ['on', 'On']])}</div>
        <p class="small muted">Cap alerts wait until the point being played is over.</p>`}
        ${compMode ? '' : `<h3>Playing time</h3>
        <div class="rl"><span>Points anyone can fall behind target</span>${stepper('rule', r.tolerance, 1, 6, 'data-k="tolerance"')}</div>
        <div class="rl"><span>Points in a row before a rest</span>${stepper('rule', r.maxStreak, 1, 6, 'data-k="maxStreak"')}</div>`}
`;
  }
  function rulesScreen() {
    const r = rules();
    return `<div class="rules">
      <section class="panel"><h2>Game</h2>${gameRulesBody()}</section>
      <section class="panel"><h2>Tag rules</h2>
        ${r.tagRules.map((t, i) => `<div class="tr"><div class="tr-top"><strong>${esc(t.tag)}</strong><button type="button" class="chip" data-a="tagrule-when" data-i="${i}">${t.when === 'all' ? 'Every point' : t.when === 'D' ? 'Defense points' : 'Offense points'} ⇄</button></div><div class="tr-steps"><span class="tr-step"><span class="small muted">At least</span>${stepper('tagrule', t.min || 0, 0, r.size, `data-i="${i}" data-k="min"`)}</span><span class="tr-step"><span class="small muted">At most</span>${stepper('tagrule', t.max === null ? r.size : t.max, 0, r.size, `data-i="${i}" data-k="max"`, t.max === null ? 'Any' : t.max)}</span></div></div>`).join('')}
        <form class="form-row" data-form="tag"><label class="field grow"><span class="label">New tag</span><input id="new-tag" type="text" placeholder="Zone thrower" autocomplete="off"></label><button class="btn" type="submit">Add tag</button></form>
        <div class="taglist">${r.tags.map((t) => `<span class="chip">${esc(t)}<button type="button" data-a="del-tag" data-v="${esc(t)}" aria-label="Remove ${esc(t)}">✕</button></span>`).join('')}</div>
      </section>
      ${positionsPanel()}
      <section class="panel"><h2>Backup</h2><p class="small muted">Copy this to your notes before you switch devices or reinstall.</p>
        <div class="chips"><button type="button" class="btn small-btn" data-a="backup">Copy backup</button><button type="button" class="btn small-btn" data-a="restore">Restore from text below</button><button type="button" class="btn small-btn" data-a="backup-file">Save backup file</button><label class="btn small-btn file-btn">Restore from file<input type="file" accept=".json,application/json,text/plain" data-c="restore-file" hidden></label></div>
        <textarea id="backup" aria-label="Backup text" data-c="backup-text" placeholder="Paste a backup here to restore it">${esc(backupText)}</textarea>
        ${notice ? `<p class="small" role="status">${esc(notice)}</p>` : ''}
      </section></div>`;
  }

  /* ---------- Any table with data-sort-id sorts when its headers are tapped ---------- */
  function cellValue(td) {
    if (!td) return '';
    if (td.dataset.v !== undefined) return Number(td.dataset.v);
    const s = td.textContent.trim().replace(/^[+]/, '').replace(/^[−–]/, '-');
    let m = s.match(/^(\d+)h (\d+)m/); if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
    m = s.match(/^(-?\d+)m\b/); if (m) return Number(m[1]) * 60;
    m = s.match(/^(-?\d+):(\d\d)/); if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = s.match(/^(-?\d+(?:\.\d+)?)/); if (m) return Number(m[1]);
    return s === '–' || s === '' ? -Infinity : s.toLowerCase();
  }
  function applyTableSorts() {
    document.querySelectorAll('table[data-sort-id]').forEach((tbl) => {
      const id = tbl.dataset.sortId, st = tableSorts[id], heads = tbl.tHead ? tbl.tHead.rows[tbl.tHead.rows.length - 1].cells : [];
      [...heads].forEach((th, i) => {
        if (th.querySelector('.sorth') || !th.textContent.trim()) return;
        const on = st && st.col === i;
        if (on) th.setAttribute('aria-sort', st.dir < 0 ? 'descending' : 'ascending');
        th.innerHTML = `<button type="button" class="sorth" data-a="tsort" data-t="${id}" data-col="${i}">${th.innerHTML}${on ? (st.dir < 0 ? ' ▾' : ' ▴') : ''}</button>`;
      });
      if (!st || !tbl.tBodies[0]) return;
      const body = tbl.tBodies[0], rows = [...body.rows];
      rows.sort((a, b) => { const x = cellValue(a.cells[st.col]), y = cellValue(b.cells[st.col]); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return st.dir * c; });
      rows.forEach((r) => body.appendChild(r));
    });
  }

  /* ---------- Timeouts and caps ---------- */
  // Competitions can set their own game rules; a game in one plays by them.
  const GAME_KEYS = ['size', 'gameTo', 'halfAt', 'division', 'ratioMode', 'ratioStart', 'timeoutsPerHalf', 'floaters', 'softCap', 'softCapAdd', 'hardCap', 'timeCap'];
  const compOf = (id) => (Root.competitions || []).find((c) => c.id === id);
  // Which rules are being read or edited right now: a competition's defaults, this game's, the game being set up, or the team's.
  function ruleLayer() {
    if (tab === 'comps' && compView && compSub === 'rules' && isCompAdmin(compOf(compView))) { const c = compOf(compView); c.rules = c.rules || {}; return c.rules; }
    if (S.game) return S.game.ruleOverride;
    if (tab === 'game' && S.setup && S.setup.rules) return S.setup.rules;
    return null;
  }
  function rules() { const o = ruleLayer(); return o ? { ...S.rules, ...o } : S.rules; }
  function setRule(k, v) { const o = ruleLayer(); if (o && GAME_KEYS.includes(k)) { o[k] = v; if (tab === 'comps' && compView) touchComp(compOf(compView)); } else S.rules[k] = v; }
  const rv = (k, d) => (rules()[k] === undefined ? d : rules()[k]);
  const halfOf = (g) => (g.points.reduce((h, p, i) => { const sc = E.score({ points: g.points.slice(0, i + 1) }); return Math.max(sc.us, sc.them) >= rules().halfAt ? 2 : h; }, 1));
  function timeoutsLeft(g, who) {
    const per = rv('timeoutsPerHalf', 2), fl = rv('floaters', 0), used = { 1: 0, 2: 0 };
    let floated = 0;
    (g.timeouts || []).filter((t) => t.who === who).forEach((t) => { used[t.half] += 1; if (used[t.half] > per) floated += 1; });
    return Math.max(0, per - used[halfOf(g)]) + Math.max(0, fl - floated);
  }
  function timeoutRow(g) {
    if (!rv('timeoutsPerHalf', 2) && !rv('floaters', 0)) return '';
    const us = timeoutsLeft(g, 'us'), them = timeoutsLeft(g, 'them'), last = (g.timeouts || []).slice(-1)[0];
    return `<div class="to-row"><button type="button" class="btn small-btn" data-a="timeout" data-v="us" ${us ? '' : 'disabled'}>Our timeout · ${us} left</button><button type="button" class="btn small-btn" data-a="timeout" data-v="them" ${them ? '' : 'disabled'}>Their timeout · ${them} left</button>${last ? `<button type="button" class="btn small-btn" data-a="undo-timeout">Undo ${last.who === 'us' ? 'our' : 'their'} timeout</button>` : ''}</div>`;
  }
  const CAPS = [['softCap', 'Soft cap'], ['hardCap', 'Hard cap'], ['timeCap', 'Time cap']];
  // Caps count from the scheduled start, when the game was started near that time; otherwise from when it was started here.
  function capStart(g, t) {
    const x = g.scheduleId && ((t || S).schedule || []).find((y) => y.id === g.scheduleId);
    if (!x || !x.date || !x.time) return g.startedAt;
    const k = whenKey(x), at = new Date(`${k.slice(0, 10)}T${k.slice(11)}:00`).getTime();
    return Number.isFinite(at) && Math.abs(g.startedAt - at) < 3 * 3600000 ? at : g.startedAt;
  }
  function capClock(g) {
    const el = Date.now() - capStart(g), next = CAPS.map(([k, l]) => [l, rv(k, 0) * 60000]).filter(([, ms]) => ms > el).sort((a, b) => a[1] - b[1])[0];
    return `Game ${clock(el)}${next ? ` · ${next[0]} in ${clock(next[1] - el)}` : ''}`;
  }
  // A short, soft confirmation: a low, warm chord through a gentle filter, with a faint bright edge on the attack.
  function tick() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime + 0.01;
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.14); lp.Q.value = 0.7;
      const out = audioCtx.createGain();
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.055, t + 0.006); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      lp.connect(out); out.connect(audioCtx.destination);
      // A2, E3, A3, C#4: a low major chord, with phone speakers in mind.
      [[110, 'sine', 0.7], [165, 'triangle', 0.55], [220, 'triangle', 0.5], [277.2, 'sine', 0.3]].forEach(([f, type, g]) => { const o = audioCtx.createOscillator(), v = audioCtx.createGain(); o.type = type; o.frequency.value = f; v.gain.value = g; o.connect(v); v.connect(lp); o.start(t); o.stop(t + 0.18); });
      // The edge: a quiet sawtooth that fades in a few hundredths of a second.
      const e = audioCtx.createOscillator(), eg = audioCtx.createGain(); e.type = 'sawtooth'; e.frequency.value = 440; eg.gain.setValueAtTime(0.18, t); eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); e.connect(eg); eg.connect(lp); e.start(t); e.stop(t + 0.05);
    } catch (e) { /* silent devices are fine */ }
  }
  function beep(pattern) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      let t = audioCtx.currentTime + 0.05;
      pattern.forEach(([f, d]) => { const o = audioCtx.createOscillator(), v = audioCtx.createGain(); o.type = 'square'; o.frequency.value = f; v.gain.value = 0.2; o.connect(v); v.connect(audioCtx.destination); o.start(t); o.stop(t + d); t += d + 0.12; });
    } catch (e) { /* no sound on this device */ }
    try { if (navigator.vibrate) navigator.vibrate(pattern.map(([, d]) => d * 1000)); } catch (e) { /* optional */ }
  }
  // Cap alerts wait until no point is being played.
  function capCheck() {
    const g = S && S.game;
    if (!g || (g.live && !g.live.review)) return;
    const el = Date.now() - capStart(g), sc = E.score(g), hi = Math.max(sc.us, sc.them);
    for (const [k, label] of CAPS) {
      const ms = rv(k, 0) * 60000;
      if (!ms) continue;
      g.alerts = g.alerts || {};
      if (el >= ms && !g.alerts[k]) {
        g.alerts[k] = true; g.alerts[k + '5'] = true;
        const to = k === 'softCap' ? Math.min(rules().gameTo, hi + rv('softCapAdd', 1)) : k === 'hardCap' ? (sc.us === sc.them ? hi + 1 : hi) : hi;
        g.capTo = Math.min(g.capTo || rules().gameTo, to);
        capNotice = k === 'softCap' ? `Soft cap: the game is now to ${g.capTo}.` : k === 'hardCap' ? (sc.us === sc.them ? `Hard cap: tied, so play one more point. Game to ${g.capTo}.` : 'Hard cap: the game is over.') : 'Time cap: the game is over.';
        if (rv('capAlarms', false)) beep([[880, 0.5], [880, 0.5], [880, 0.8]]);
        commit(() => {});
        return;
      }
      if (el >= ms - 5 * 60000 && el < ms && !g.alerts[k + '5']) {
        g.alerts[k + '5'] = true;
        capNotice = `5 minutes to the ${label.toLowerCase()}.`;
        if (rv('capAlarms', false)) beep([[660, 0.25], [660, 0.25]]);
        commit(() => {});
        return;
      }
    }
  }
  // Pulls: the gender with more players this point, or in youth gendzone games, alternating.
  function pullGender() {
    if (!mixed()) return null;
    const g = G();
    if (S.youth && rules().ratioMode === 'gendzone') { const last = g.points.slice().reverse().find((p) => p.puller && P(p.puller)); return last ? (P(last.puller).match === 'W' ? 'M' : 'W') : null; }
    return g.live ? g.live.ratio : ctx().ratio;
  }
  const canPull = (p) => { const w = pullGender(); return !w || (w === 'W') === (p.match === 'W'); };

  /* ---------- Render ---------- */
  const pullWarn = () => (menu && P(menu.id) && !canPull(P(menu.id)) ? `<div class="menu-warn" role="note">${S.youth && rules().ratioMode === 'gendzone' ? `Pulls alternate: a ${GL(pullGender())} player pulls this point` : `A ${GL(pullGender())} player should pull this point`}</div>` : '');
  // Signed in: the Google profile picture, or initials if there isn't one. Opens Settings.
  function avatar(u) {
    const name = u.displayName || u.email || '', initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    const photo = /^https:\/\//.test(u.photoURL || '') ? u.photoURL : '';
    return `<button type="button" class="avatar" data-a="settings-open" aria-label="Account and settings for ${esc(name)}" title="${esc(name)}">${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span>${esc(initials || '?')}</span></button>`;
  }
  function menuView() {
    if (!menu) return '';
    const special = /^(goal|arr):(\d+)$/.exec(menu.id);
    if (special) {
      const i = Number(special[2]), ev = (activePt() || {}).events && activePt().events[i];
      if (!ev) return '';
      const items = special[1] === 'goal'
        ? `<button type="button" data-a="callahan" data-i="${i}" role="menuitem">${ev.sub === 'callahan' ? 'Not a Callahan' : 'Callahan'}</button>`
        : [['f', 'Forehand'], ['b', 'Backhand'], ['o', 'Other']].map(([v, l]) => `<button type="button" data-a="throw-type" data-i="${i}" data-v="${v}" role="menuitem" ${ev.throwType === v ? 'aria-pressed="true"' : ''}>${l}${ev.throwType === v ? ' ✓' : ''}</button>`).join('') + (ev.throwType ? `<button type="button" data-a="throw-type" data-i="${i}" data-v="" role="menuitem">Clear</button>` : '');
      return `<div class="menu-scrim" data-a="menu-close" data-self="1"><div class="menu" id="stat-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu"><div class="label">${special[1] === 'goal' ? `Goal: ${whoName(ev.id)}` : `Throw to ${whoName(ev.id)}`}</div>${items}</div></div>`;
    }
    if (!P(menu.id)) return '';
    const g = G();
    if (g && !g.live && editIdx === null) return `<div class="menu-scrim" data-a="menu-close" data-self="1"><div class="menu" id="stat-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu" aria-label="${esc(P(menu.id).name)}"><div class="label">${esc(P(menu.id).name)}</div>${pullWarn()}<button type="button" data-a="puller" role="menuitem">Puller (starts the point)</button></div></div>`;
    return `<div class="menu-scrim" data-a="menu-close" data-self="1"><div class="menu" id="stat-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu" aria-label="${esc(P(menu.id).name)}"><div class="label">${esc(P(menu.id).name)}</div>
      ${editIdx === null && pullOpen() ? `${pullWarn()}<button type="button" data-a="puller" role="menuitem">Puller</button>` : ''}${STAT_MENU.map(([t, sub, l]) => `<button type="button" data-a="stat" data-v="${t}" data-sub="${sub}" role="menuitem">${l}</button>`).join('')}
      ${editIdx === null ? '<button type="button" data-a="menu-sub" role="menuitem">Sub out</button>' : ''}</div></div>`;
  }
  function settingsSheet() {
    const cur = Root.theme || 'system';
    return `<div class="scrim" data-a="settings-close" data-self="1"><div class="sheet" role="dialog" aria-label="Settings">
      <div class="panel-head"><h2>Settings</h2><button type="button" class="btn small-btn primary" data-a="settings-close">Done</button></div>
      <div class="label">Color scheme</div>
      <div class="schemes">${SCHEMES.map(([k, l, d]) => `<button type="button" class="scheme" data-a="set-scheme" data-v="${k}" aria-pressed="${cur === k}" data-preview="${k}">${k === 'team' ? (() => { const v = teamVars(Root.teamDark); return `<span class="swatch" style="background:${v['--bg']}"><i style="background:${v['--accent']}"></i><i style="background:${v['--cone']}"></i><i style="background:${v['--ink']}"></i></span>`; })() : '<span class="swatch"><i></i><i></i><i></i></span>'}<strong>${l}</strong><span class="small muted">${d}</span></button>`).join('')}</div>
      ${cur === 'team' ? `<div class="rl"><span>Team colors, light or dark</span>${seg('team-dark', Root.teamDark ? 'dark' : 'light', [['light', 'Light'], ['dark', 'Dark']])}</div>` : ''}
      ${CloudLink ? `<div class="label">Account</div>
      ${CloudLink.user ? `<div class="sub-row"><span><strong>${esc(CloudLink.user.email || 'Signed in')}</strong><br><span class="small muted">${esc(CloudLink.status || 'Connecting…')}</span></span><button type="button" class="btn small-btn" data-a="cloud-out">Sign out</button></div>` : `<div><button type="button" class="btn small-btn primary" data-a="cloud-in">Sign in with Google</button></div><p class="small muted">Sign in to keep your teams in your account and use them on every device. Your work stays on this device until you do.</p>`}
      ${CloudLink.problem ? `<p class="small bad-text" role="status">${esc(CloudLink.problem)}</p>` : ''}
      ${CloudLink.user ? (() => { const r = myRoles(); return `<div class="label">Your roles</div>${r.length ? `<div class="taglist">${r.map(([k, v]) => `<span class="chip"><b>${esc(k)}</b>&nbsp;${esc(v)}</span>`).join('')}</div>` : '<p class="small muted">None yet. Roles come from teams, rosters and competitions that list this email.</p>'}`; })() : ''}` : ''}
      ${CloudLink && CloudLink.user ? '<div><button type="button" class="btn small-btn" data-a="resync">Re-sync with the cloud</button> <span class="small muted">Re-sends everything and fixes games that no longer match their league schedule.</span></div>' : ''}
      ${CloudLink && CloudLink.god ? '<p class="small"><b>Superuser:</b> you can see and edit every team and competition.</p>' : ''}
      <div class="label">On this device I'm</div>
      <div>${seg('game-role', role(), [['both', 'Doing both'], ['lines', 'Calling lines'], ['events', 'Logging events']])}</div>
      <p class="small muted">When two coaches share a game, each device can focus on one job.</p>
      <div class="label">How I enter plays</div>
      <div>${seg('entry-mode', Root.entryMode === 'field' ? 'field' : 'list', [['list', 'Tap players'], ['field', 'Field, then player']])}</div>
      <div class="label">Sound when a play is added</div>
      <div>${seg('entry-sound', Root.entrySound === false ? 'off' : 'on', [['on', 'On'], ['off', 'Off']])}</div>
      <div class="label">Voice listens for</div>
      <div>${seg('voice-mode', Root.voiceMode || 'focused', [['focused', 'My roster'], ['any', 'Any words']])}</div>
      <p class="small muted">My roster is more accurate because it only listens for your players and ultimate words. If a name isn't being heard, it may be spelled in a way the recognizer doesn't know. Add a common spelling under that player's "Sounds like", or try Any words.</p>
    </div></div>`;
  }
  // The most common distinct colors in a logo, most prominent first. Plain white and gray count for little.
  function paletteOf(px) {
    const bins = new Map();
    for (let i = 0; i < px.length; i += 8) {
      if (px[i + 3] < 200) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0;
      if (min > 235) continue;
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4), cur = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      // Black, white and grays count for little next to real colors.
      const w = max < 45 || sat < 0.15 ? 0.08 : 0.3 + sat * 4; cur.n += w; cur.r += r * w; cur.g += g * w; cur.b += b * w; bins.set(k, cur);
    }
    const out = [];
    [...bins.values()].sort((x, y) => y.n - x.n).forEach((c) => {
      if (out.length >= 3) return;
      const col = [c.r / c.n, c.g / c.n, c.b / c.n].map(Math.round);
      if (out.every((o) => Math.hypot(o[0] - col[0], o[1] - col[1], o[2] - col[2]) > 80)) out.push(col);
    });
    return out.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
  }
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hexOf = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, w) => { const x = rgbOf(a), y = rgbOf(b); return hexOf(x.map((v, i) => v * (1 - w) + y[i] * w)); };
  const lum = (h) => { const l = rgbOf(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const lightUntil = (c, bg, ratio) => { let x = c; for (let i = 0; i < 20 && contrast(x, bg) < ratio; i++) x = mixHex(x, '#ffffff', 0.12); return x; };
  const darkUntil = (c, bg, ratio) => { let x = c; for (let i = 0; i < 20 && contrast(x, bg) < ratio; i++) x = mixHex(x, '#000000', 0.12); return x; };
  // A light scheme built from the team's colors, with text kept readable.
  function teamVars(dark) {
    const pal = S.palette && S.palette.length ? S.palette : [Report.safeColor(S.color)];
    const p = pal[0], s2 = pal[1] || mixHex(p, '#000000', 0.3);
    if (dark) {
      const bg = mixHex(p, '#05070f', 0.86), panel = mixHex(p, '#05070f', 0.78), accent = lightUntil(p, panel, 4.6), cone = lightUntil(s2, panel, 4.6), ink = mixHex(p, '#ffffff', 0.92);
      const [r, g, b] = rgbOf(accent);
      return { '--bg': bg, '--panel': panel, '--panel-2': mixHex(p, '#05070f', 0.66), '--line': mixHex(p, '#05070f', 0.5), '--ink': ink, '--muted': lightUntil(mixHex(p, '#9aa0b4', 0.6), panel, 4.6), '--accent': accent, '--on-accent': bg, '--cone': cone, '--on-cone': bg, '--meter': accent, '--tick': ink, '--tile': ink, '--on-tile': bg, '--us-tint': `rgba(${r}, ${g}, ${b}, .2)` };
    }
    const panel = mixHex(p, '#ffffff', 0.97), accent = darkUntil(p, '#ffffff', 4.6), cone = darkUntil(s2, '#ffffff', 4.6), ink = mixHex(darkUntil(p, '#ffffff', 12), '#000000', 0.2);
    const [r, g, b] = rgbOf(accent);
    return { '--bg': mixHex(p, '#ffffff', 0.9), '--panel': panel, '--panel-2': mixHex(p, '#ffffff', 0.84), '--line': mixHex(p, '#ffffff', 0.7), '--ink': ink, '--muted': darkUntil(mixHex(p, '#6b7280', 0.6), panel, 4.6), '--accent': accent, '--on-accent': '#ffffff', '--cone': cone, '--on-cone': '#ffffff', '--meter': accent, '--tick': ink, '--tile': ink, '--on-tile': '#ffffff', '--us-tint': `rgba(${r}, ${g}, ${b}, .13)` };
  }
  let teamVarsSet = [];
  function applyScheme() {
    const t = Root.theme || 'system', root = document.documentElement;
    teamVarsSet.forEach((k) => root.style.removeProperty(k)); teamVarsSet = [];
    if (t === 'system') delete root.dataset.scheme;
    else if (t === 'team') { root.dataset.scheme = Root.teamDark ? 'dark' : 'light'; Object.entries(teamVars(Root.teamDark)).forEach(([k, v]) => { root.style.setProperty(k, v); teamVarsSet.push(k); }); }
    else root.dataset.scheme = t;
  }
  // A focused field losing focus mid-render can fire a change that asks for another render; finish this one first.
  let rendering = false, renderAgain = false;
  function render() {
    if (rendering) { renderAgain = true; return; }
    rendering = true;
    try { renderNow(); } finally { rendering = false; }
    if (fieldEdit && tab === 'comps') setTimeout(mountMap, 0);
    if (renderAgain) { renderAgain = false; setTimeout(render, 0); }
  }
  function renderNow() {
    applyScheme();
    const active = document.activeElement && document.activeElement.id;
    const caret = active && document.activeElement.selectionStart;
    const g = S.game;
    let view;
    if (tab === 'game' && boxOpen) view = statsScreen('<button type="button" class="btn small-btn" data-a="box-close">← Back to the game</button>');
    else if (tab === 'game' && sheetOpen) view = scoresheetScreen('<button type="button" class="btn small-btn" data-a="sheet-close">← Back to the game</button>');
    else if (tab === 'game') view = !g ? setupScreen() : editIdx !== null && g.points[editIdx] ? pointEditor() : g.live ? liveScreen() : draftScreen();
    else if (tab === 'games') view = gamesScreen();
    else if (tab === 'comps') view = competitionsScreen();
    else if (tab === 'roster') view = teamOpen === S.id ? rosterScreen() : teamOpen ? teamInfo(teamOpen) : teamsList();
    else if (tab === 'players') view = playerOpen && P(playerOpen) ? playerProfile(P(playerOpen)) : playersScreen();
    else if (tab === 'time') view = (g || S.history.length) ? playtimeScreen() : '<section class="panel"><h2>Playtime</h2><p class="muted">Start a game and each player\'s points and minutes show up here.</p></section>';
    else view = rulesScreen();
    const tabs = [['game', 'Current Game'], ['games', 'Games'], ['comps', 'Competitions'], ['roster', 'Teams'], ['players', 'Players'], ['time', 'Stats'], ['rules', 'Rules']];
    root.innerHTML = `<div class="wrap">
      <header class="bar"><h1 class="brand">Line Caller</h1><button type="button" class="team-now" data-a="tab" data-v="roster">${S.logo ? `<img class="team-logo" src="${S.logo}" alt="">` : ''}${esc(S.team)}</button><nav class="tabs">${tabs.map(([k, l]) => `<button type="button" class="tab" data-a="tab" data-v="${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}${CloudLink && !CloudLink.user ? '<button type="button" class="tab" data-a="cloud-in">Sign in</button>' : ''}${CloudLink && CloudLink.user ? avatar(CloudLink.user) : ''}<button type="button" class="tab" data-a="settings-open">Settings</button></nav></header>
      ${S.isExample ? `<div class="banner"><span>You're looking at an example team. The players and ratings are made up.</span>${twoTap('clear', 'clear-example', 'Clear it and add my team', 'Tap again to clear')}</div>` : ''}
      ${view}</div>${editing ? editSheet() : ''}${sendFor ? sendSheet() : ''}${settingsOpen ? settingsSheet() : ''}${insight ? insightSheet() : ''}${pointSheet ? pointSheetView() : ''}${halftimeOpen && S.game ? halftimeView() : ''}${scoreEntry ? scoreSheetView() : ''}${menuView()}`;
    applyTableSorts();
    document.documentElement.style.setProperty('--team', Report.safeColor(S.color));
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
  setInterval(() => {
    const el = document.getElementById('timer'); if (el && S.game && S.game.live && !S.game.live.untimed) el.textContent = clock(liveElapsed());
    const gc = document.getElementById('gclock'); if (gc && S.game) gc.textContent = capClock(S.game);
    capCheck();
  }, 500);
  // Browsers only play sound after a tap, so wake the audio on the first one.
  document.addEventListener('pointerdown', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }, { passive: true });

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
  const ENDZONE = 20 / 120;
  function addStats(list) {
    if (list.length && Root.entrySound !== false) tick();
    const at = Date.now(), pt = activePt();
    // Field view: we attack the top. A catch in that endzone is a goal; an interception there is a Callahan.
    let scored = false, callahan = false;
    if (pendingSpot && pendingSpot.y <= ENDZONE && list.length === 1 && list[0].id && (list[0].t === 'touch' || (list[0].t === 'block' && list[0].sub === 'int'))) {
      callahan = list[0].t === 'block'; scored = true;
      list = callahan ? [list[0], { t: 'goal', id: list[0].id }] : [{ t: 'goal', id: list[0].id }];
    }
    pt.events = pt.events || [];
    const before = pt.events.length;
    list.forEach((ev) => E.addEvent(pt.events, ev, at));
    // Visual entry: the spot tapped on the field goes with what was just added.
    if (pendingSpot) { pt.events.slice(before).filter((e) => !e.implicit && !e.auto && e.t !== 'assist').forEach((e) => { e.x = pendingSpot.x; e.y = pendingSpot.y; }); pendingSpot = null; }
    if (callahan) { const gi = pt.events.map((e) => e.t).lastIndexOf('goal'); pt.events = E.setCallahan(pt.events, gi, true); }
    if (scored && editIdx === null && G().live && !G().live.review) { setTimeout(() => { if (G() && G().live && !G().live.review) A.result({ v: 'us' }); flash(callahan ? 'Callahan!' : 'Caught in the endzone: goal.'); }, 0); }
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
      const r = E.parseLine(text, voicePlayers(), rules().positions, { pos: voice && voice.linePos });
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
  const speechWords = () => (Root.voiceMode === 'any' ? undefined : E.speechVocabulary(S.players, rules().positions));
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
  function resume(l) { if (!l.pausedAt) return; const d = Date.now() - l.pausedAt; l.startedAt += d; (l.subs || []).forEach((s) => { s.at += d; }); (l.events || []).forEach((e) => { if (e.at) e.at += d; }); delete l.pausedAt; }
  const A = {
    tab(d) { stopVoice(); uiChange(() => { editingComp = null; sheetOpen = false; boxOpen = false; tab = d.v; sel = null; voice = null; menu = null; editIdx = null; fixLine = false; }); },
    confirm(d, el) {
      if (confirmKey === d.key) { clearTimeout(confirmTimer); confirmKey = null; A[d.then](d, el); return; }
      confirmKey = d.key; render(); clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { confirmKey = null; render(); }, 3000);
    },
    'clear-example'() { commit(() => { const fresh = blank(); Root.teams[Root.teams.indexOf(S)] = fresh; Root.active = fresh.id; S = fresh; tab = 'roster'; editing = null; sel = null; }); },
    'team-open'(d) {
      const mine = Root.teams.find((t) => t.id === d.id);
      if (mine) { stopVoice(); editIdx = null; playerOpen = null; commit(() => { Root.active = d.id; S = activeTeam(); sel = null; voice = null; editing = null; pointsSource = 'current'; teamOpen = d.id; teamView = 'roster'; }); }
      else uiChange(() => { teamOpen = d.id; });
      window.scrollTo(0, 0);
    },
    'team-close'() { uiChange(() => { teamOpen = null; }); },
    'team-filter'(d) { uiChange(() => { teamFilter = d.v; }); },
    'team-adopt'(d) { commit(() => { const t = adoptTeam(d.id); if (t) { Root.active = t.id; S = t; teamOpen = t.id; teamView = 'roster'; } }); },
    'ph-unlink'(d) { commit(() => { const t = allTeams().find((x) => x.id === d.id); phUpdate(d.id, { links: ((t && t.links) || []).filter((l) => l.id !== d.v) }); const o = Root.teams.find((x) => x.id === d.v); if (o) o.links = (o.links || []).filter((l) => l.id !== d.id); }); },
    'bk-edit'(d) { uiChange(() => { bkEdit = bkEdit === d.id ? null : d.id; }); },
    'bk-rename'(d) { uiChange(() => { bkRename = d.id; }); setTimeout(() => { const el = document.querySelector('input.bk-label'); if (el) { el.focus(); el.select(); } }, 0); },
    'mu-toggle'(d) { uiChange(() => { if (muShut.has(d.v)) muShut.delete(d.v); else muShut.add(d.v); }); },
    'games-toggle'(d) { uiChange(() => { if (gamesShut.has(d.v)) gamesShut.delete(d.v); else gamesShut.add(d.v); }); },
    'link-open'(d) { uiChange(() => { linkDraft = { team: d.team, id: d.id, comp: d.comp || (linkDraft && linkDraft.comp) || '' }; }); },
    'link-close'() { uiChange(() => { linkDraft = null; }); },
    'seed-standings'(d) {
      commit(() => {
        const c = compOf(compView), br = (c.brackets || []).find((b) => b.id === d.b); if (!br) return;
        const groups = br.group ? c.groups.filter((g) => g.name === br.group) : c.groups || [], teams = groups.flatMap((g) => g.teams || []), ids = teams.map((t) => t.id);
        const rows = Report.standings(ids, compResults(c).filter((r) => !r.playoff && ids.includes(r.a) && ids.includes(r.b)));
        br.seeds = br.seeds.map((_, i) => { const t = rows[i] && teams.find((x) => x.id === rows[i].id); return t ? { id: t.id, name: t.name } : null; });
        resolvePlayoffs(c); touchComp(c);
      });
    },
    'bk-third'(d) {
      const c = compOf(compView), br = (c.brackets || []).find((b) => b.id === d.b); if (!br) return;
      const semis = c.matchups.filter((m) => m.bracketId === br.id && m.round === br.rounds - 1);
      if (semis.length !== 2) { flash('A 3rd-place game needs two semifinals.'); return; }
      if (c.matchups.some((m) => m.bracketId === br.id && m.round % 1)) { flash('This bracket already has a 3rd-place game.'); return; }
      commit(() => { addPlayoffGame(c, br, br.rounds - 0.5, { loser: semis[0].id }, { loser: semis[1].id }); resolvePlayoffs(c); touchComp(c); });
    },
    'bk-consol'(d) {
      const c = compOf(compView), br = (c.brackets || []).find((b) => b.id === d.b); if (!br) return;
      const r1 = c.matchups.filter((m) => m.bracketId === br.id && m.round === 1);
      if (r1.length < 2) { flash('A consolation bracket needs at least two first-round games.'); return; }
      commit(() => {
        // First-round neighbours meet first, like the main bracket's halves.
        let ent = r1.map((m) => ({ loser: m.id }));
        if (!(r1.length & (r1.length - 1))) { const order = seedOrder(r1.length), e = []; order.forEach((seed, i) => { e[seed - 1] = ent[i]; }); ent = e; }
        makeBracket(c, `${br.name} consolation`, br.group, r1.length, ent); touchComp(c);
      });
    },
    'bk-del'(d) {
      commit(() => {
        const c = compOf(compView), br = (c.brackets || []).find((b) => b.id === d.b); if (!br) return;
        c.matchups.filter((m) => m.bracketId === br.id && m.slot).forEach((m) => publishMatchup(c, { ...m, slot: null }));
        c.matchups = c.matchups.filter((m) => m.bracketId !== br.id); c.brackets = c.brackets.filter((b) => b !== br);
        resolvePlayoffs(c); touchComp(c);
      });
    },
    'switch-team'(d) { stopVoice(); editIdx = null; playerOpen = null; commit(() => { Root.active = d.v; S = activeTeam(); sel = null; voice = null; editing = null; pointsSource = 'current'; if (tab === 'roster') teamOpen = d.v; }); },
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
    'flip-on'() { commit(() => { const d = G().draft; d.on = ctx().on === 'O' ? 'D' : 'O'; d.alt = 0; d.plan = null; }); },
    'flip-ratio'() { commit(() => { const d = G().draft; d.ratio = ctx().ratio === 'W' ? 'M' : 'W'; d.alt = 0; d.plan = null; }); },
    'start-point'(d) {
      const c = ctx(), g = G(), line = { ...g.draft.line };
      stopVoice();
      commit(() => { g.live = { lineup: Object.keys(line), roles: line, on: c.on, ratio: c.ratio, startedAt: Date.now(), ...(d && d.untimed ? { untimed: true, pausedAt: Date.now() } : {}), puller: (d && d.puller) || null, avail: S.players.filter((p) => !g.out[p.id]).map((p) => p.id), subs: [], events: [] }; sel = null; voice = null; });
      if (openMic) startOpenMic();
    },
    puller() {
      const id = menu.id, g = G();
      menu = null;
      if (g.live) return commit(() => { g.live.puller = id; });
      const missing = targetSize() - placedIds().length;
      if (missing > 0) { render(); return flash(`Pick ${missing} more before the pull.`); }
      A['start-point']({ puller: id });
    },
    'cancel-point'() { pendingSpot = null; stopVoice(); commit(() => { G().live = null; sel = null; voice = null; }); },
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
        // An untimed point counts as a typical point of this game, so playtime and rest still add up.
        let end = pausedAt;
        if (finished.untimed) { const d = g.points.filter((p) => !p.untimed).map((p) => p.endedAt - p.startedAt).sort((a, b) => a - b); end = finished.startedAt + (d.length ? d[Math.floor(d.length / 2)] : 3 * E.MIN); }
        g.points.push({ ...finished, endedAt: end, result: review.result });
        g.live = null; sel = null; voice = null; fixLine = false;
        g.draft = newDraft(pv.line ? { ids: pv.line.ids, on: pv.ctx.on } : null);
        const before = E.score({ points: g.points.slice(0, -1) }), after = E.score(g);
        if (Math.max(before.us, before.them) < rules().halfAt && Math.max(after.us, after.them) >= rules().halfAt) { halftimeOpen = true; g.halftimeAt = g.points.length; }
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
    callahan(d) { const pt = activePt(), i = Number(d.i), on = pt.events[i].sub !== 'callahan'; menu = null; (editIdx !== null ? commit : commitLight)(() => { pt.events = E.setCallahan(pt.events, i, on); }); },
    'throw-type'(d) { const e = activePt().events[Number(d.i)]; menu = null; (editIdx !== null ? commit : commitLight)(() => { if (d.v) e.throwType = d.v; else delete e.throwType; }); },
    tsort(d) { uiChange(() => { const st = tableSorts[d.t], col = Number(d.col); tableSorts[d.t] = st && st.col === col ? { col, dir: -st.dir } : { col, dir: col === 0 ? 1 : -1 }; }); },
    'pt-sort'(d) { uiChange(() => { ptSort = ptSort && ptSort.key === d.v ? { key: d.v, dir: -ptSort.dir } : { key: d.v, dir: d.v === 'name' ? 1 : -1 }; }); },
    timeout(d) {
      const g = G(), l = g.live;
      commit(() => { g.timeouts = g.timeouts || []; g.timeouts.push({ who: d.v, at: Date.now(), point: g.points.length + 1, half: halfOf(g) }); if (l && !l.pausedAt && !l.review) l.pausedAt = Date.now(); });
      if (rv('capAlarms', false)) audioCtx = audioCtx || (window.AudioContext ? new AudioContext() : null);
      if (l && !l.review) flash('Timeout. The point clock is paused; tap Resume when play restarts.');
    },
    'undo-timeout'() { commit(() => { G().timeouts.pop(); }); },
    'game-edit'(d) { uiChange(() => { editingGame = d.id || null; }); },
    'cast-make'() { commit(() => { S.castKey = rsvpKey(); }); },
    'cast-reset'() { commit(() => { S.castKey = rsvpKey(); delete S.castHash; }); },
    'cast-copy'() { const u = castUrl(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(() => flash('Gamecast link copied.'), () => flash('Copying was blocked. Select the link and copy it.')); },
    async 'cast-share'() { try { await window.Capacitor.registerPlugin('Share').share({ title: `${S.team} Gamecast`, text: `Follow ${S.team} live:`, url: castUrl() }); } catch (e) { /* closed */ } },
    'rsvp-make'() { commit(() => { S.rsvpKey = rsvpKey(); }); },
    'rsvp-reset'() { commit(() => { S.rsvpKey = rsvpKey(); S.rsvpAnswers = {}; delete S.rsvpHash; }); },
    'rsvp-copy'() { const u = rsvpUrl(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(() => flash('RSVP link copied.'), () => flash('Copying was blocked. Select the link and copy it.')); },
    async 'rsvp-share'() { try { await window.Capacitor.registerPlugin('Share').share({ title: `${S.team} RSVP`, text: `Let us know who's coming to ${S.team} games:`, url: rsvpUrl() }); } catch (e) { /* closed */ } },
    'entry-sound'(d) { commit(() => { Root.entrySound = d.v === 'on'; }); if (d.v === 'on') tick(); },
    'flow-point'(d) { const key = pointSheet ? pointSheet.key : pickSource(gameSources()).key; uiChange(() => { pointSheet = { key, i: Number(d.v) }; }); },
    'point-close'() { uiChange(() => { pointSheet = null; }); },
    'report-open'(d) { uiChange(() => { const no = rsvpOut(d.id); reporting = { id: d.id, attend: Object.fromEntries(S.players.filter((p) => !no[p.id]).map((p) => [p.id, true])) }; editingGame = null; }); },
    'report-attend'(d) { uiChange(() => { if (reporting.attend[d.id]) delete reporting.attend[d.id]; else reporting.attend[d.id] = true; }); },
    'report-close'() { uiChange(() => { reporting = null; }); },
    'attend-open'(d) { uiChange(() => { attendingPrac = d.id || null; }); },
    'attend-toggle'(d) { commit(() => { const x = S.schedule.find((y) => y.id === d.id); x.attend = x.attend || {}; if (x.attend[d.p]) delete x.attend[d.p]; else x.attend[d.p] = true; }); },
    'line-toggle'(d) { commit(() => { const l = S.lines.find((x) => x.id === d.id); l.ids = l.ids.includes(d.p) ? l.ids.filter((x) => x !== d.p) : l.ids.concat(d.p); }); },
    'del-line'(d) { commit(() => { S.lines = S.lines.filter((x) => x.id !== d.id); if (benchFilter === 'l:' + d.id) benchFilter = 'all'; }); },
    'use-line'(d) {
      const l = (S.lines || []).find((x) => x.id === d.id), g = G();
      if (!l) return;
      commit(() => { l.ids.filter((id) => P(id) && !g.out[id] && !g.draft.line[id]).forEach((id) => { if (placedIds().length < targetSize()) place(id, bestPosIn(id)); }); });
    },
    'comp-open'(d) { uiChange(() => { if (d.go) tab = 'comps'; compView = d.id; compSub = 'overview'; fieldEdit = null; muSel = null; }); window.scrollTo(0, 0); },
    'comp-close'() { uiChange(() => { compView = null; fieldEdit = null; muSel = null; }); },
    'comp-sub'(d) { uiChange(() => { compSub = d.v; fieldEdit = null; muSel = null; }); },
    'comp-kind'(d) { commit(() => { const c = compOf(compView); c.kind = d.v; touchComp(c); }); },
    'comp-slot'(d) { commit(() => { const c = compOf(compView); c.slotMin = Math.max(30, Math.min(180, (c.slotMin || 90) + Number(d.d) * 15)); touchComp(c); }); },
    'comp-rm-admin'(d) { commit(() => { const c = compOf(compView); c.admins = (c.admins || []).filter((e) => e !== d.v); touchComp(c); }); },
    'comp-del-group'(d) { commit(() => { const c = compOf(compView), g = c.groups[Number(d.i)]; c.groups.splice(Number(d.i), 1); c.matchups = (c.matchups || []).filter((m) => m.group !== g.name || (m.slot && (publishMatchup(c, { ...m, slot: null }), false))); touchComp(c); }); },
    'comp-rm-team'(d) { commit(() => { const c = compOf(compView); c.groups[Number(d.i)].teams.splice(Number(d.v), 1); touchComp(c); }); },
    'del-comp'(d) { commit(() => { const c = compOf(d.id); (c.matchups || []).filter((m) => m.slot).forEach((m) => publishMatchup(c, { ...m, slot: null })); Root.competitions = comps().filter((x) => x.id !== d.id); Root.teams.forEach((t) => t.schedule.forEach((x) => { if (x.competitionId === d.id && !x.fixtureId) { delete x.competitionId; delete x.group; } })); if (CloudLink && CloudLink.user) CloudLink.deleteComp(d.id); compView = null; }); },
    'site-del'(d) { commit(() => { const c = compOf(compView); c.sites = c.sites.filter((s) => s.id !== d.s); touchComp(c); }); },
    'field-del'(d) { commit(() => { const c = compOf(compView), s = c.sites.find((x) => x.id === d.s); s.fields = s.fields.filter((f) => f.id !== d.f); touchComp(c); }); },
    'hours-rm'(d) { commit(() => { const c = compOf(compView), s = c.sites.find((x) => x.id === d.s); s.hours = siteHours(s).slice(); s.hours.splice(Number(d.i), 1); (s.fields || []).forEach((f) => { delete f.hours; }); touchComp(c); }); },
    'field-map'(d) { uiChange(() => { fieldEdit = { s: d.s, f: d.f }; }); },
    'field-map-close'() { uiChange(() => { fieldEdit = null; }); },
    'field-map-save'() {
      const c = compOf(compView), f = fieldById(c, fieldEdit.f), ll = (document.getElementById('map-ll').value || '').split(',').map((x) => Number(x.trim()));
      const address = (document.getElementById('map-address').value || '').trim();
      if (ll.length !== 2 || !ll.every(Number.isFinite) || Math.abs(ll[0]) > 90 || Math.abs(ll[1]) > 180) { flash('Set the pin, or type the latitude and longitude.'); return; }
      commit(() => { Object.assign(f.field, { lat: ll[0], lng: ll[1], address }); touchComp(c); (c.matchups || []).filter((m) => m.slot && m.slot.fieldId === f.field.id).forEach((m) => publishMatchup(c, m)); fieldEdit = null; });
    },
    'round-robin'(d) {
      commit(() => {
        const c = compOf(compView), g = c.groups[Number(d.i)], t = g.teams; c.matchups = c.matchups || [];
        for (let x = 0; x < t.length; x++) for (let y = x + 1; y < t.length; y++) {
          if (c.matchups.some((m) => m.group === g.name && [m.a.id, m.b.id].sort().join() === [t[x].id, t[y].id].sort().join())) continue;
          c.matchups.push({ id: uid(), group: g.name, a: { ...t[x] }, b: { ...t[y] }, slot: null });
        }
        touchComp(c);
      });
    },
    'mu-del'(d) { commit(() => { const c = compOf(compView), m = c.matchups.find((x) => x.id === d.id); if (m.slot) publishMatchup(c, { ...m, slot: null }); c.matchups = c.matchups.filter((x) => x.id !== d.id); c.matchups.forEach((x) => { if (x.src) ['a', 'b'].forEach((k) => { const r = x.src[k]; if (r && (r.winner === d.id || r.loser === d.id)) x.src[k] = null; }); }); if (bkEdit === d.id) bkEdit = null; resolvePlayoffs(c); touchComp(c); }); },
    'mu-pick'(d) { uiChange(() => { muSel = muSel === d.id ? null : d.id; }); },
    'mu-unslot'(d) { commit(() => { const c = compOf(compView), m = c.matchups.find((x) => x.id === d.id); m.slot = null; publishMatchup(c, m); touchComp(c); muSel = null; }); },
    'slot-pick'(d) { if (!muSel) { flash('Tap a matchup first, then the time.'); return; } placeMatchup(muSel, d.f, d.t); },
    'comp-export'() {
      const c = compOf(compView), list = (c.matchups || []).filter((m) => m.slot).sort((x, y) => (x.slot.date + x.slot.start).localeCompare(y.slot.date + y.slot.start));
      const txt = `${c.name}\n` + list.map((m) => { const f = fieldById(c, m.slot.fieldId); return `${longDate(m.slot.date)} ${ampm(m.slot.start)} — ${m.a.name} vs ${m.b.name}${f ? ' — ' + f.label : ''}${m.group ? ` (${m.group})` : ''}`; }).join('\n');
      copyText(txt, `${list.length} games copied.`);
    },
    'sched-export'() {
      const list = S.schedule.slice().sort((x, y) => whenKey(x).localeCompare(whenKey(y)));
      const txt = `${S.team}\n` + list.map((x) => `${longDate(x.date)}${x.time ? ' ' + x.time : ''} — ${x.kind === 'practice' ? 'Practice' : `vs ${x.opponent || 'Opponent'}`}${x.location ? ' — ' + x.location : ''}${x.competitionId && compOf(x.competitionId) ? ` (${compOf(x.competitionId).name}${x.group ? ' · ' + x.group : ''})` : ''}${x.gameId ? ` · Final ${x.us}–${x.them}` : ''}`).join('\n');
      copyText(txt, `${list.length} lines copied.`);
    },
    'sched-import'() { uiChange(() => { importing = importing ? null : { text: '', rows: null }; }); },
    'import-read'() { const el = document.getElementById('import-text'); uiChange(() => { importing.text = el.value; importing.rows = Report.parseSchedule(el.value).map((x) => ({ ...x, on: true })); }); },
    async 'import-ai'() {
      const el = document.getElementById('import-text'); importing.text = el.value; importing.busy = true; render();
      try {
        const reply = await askAI(`Turn this sports schedule into JSON. Today is ${localDay()}. Reply with only a JSON array of objects with keys: kind ("game" or "practice"), date (YYYY-MM-DD), time (like "9:00 AM", or ""), opponent (or ""), location (or ""). Skip lines that aren't events.\n\n${el.value}`);
        const rows = JSON.parse(reply.slice(reply.indexOf('['), reply.lastIndexOf(']') + 1));
        importing.rows = rows.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date || '')).map((x) => ({ kind: x.kind === 'practice' ? 'practice' : 'game', date: x.date, time: x.time || '', opponent: x.opponent || '', location: x.location || '', on: true }));
      } catch (e) { flash("AI couldn't read that. Try Read schedule instead."); }
      importing.busy = false; render();
    },
    'import-toggle'(d) { uiChange(() => { const x = importing.rows[Number(d.i)]; x.on = !x.on; }); },
    'import-add'() {
      commit(() => { importing.rows.filter((x) => x.on).forEach((x) => { const e = { id: uid(), kind: x.kind, opponent: x.kind === 'practice' ? '' : x.opponent, date: x.date, time: x.time, location: x.location }; linkOpponent(e); S.schedule.push(e); }); importing = null; });
    },
    reconcile() { let r; commit(() => { r = reconcile(); }); flash(`Done. ${r.removed} out-of-date ${r.removed === 1 ? 'game' : 'games'} removed from team schedules; ${r.fixed} matchups re-sent.`); },
    resync() { if (CloudLink && CloudLink.user) { CloudLink.resync(); flash('Re-syncing everything with the cloud…'); } let r; commit(() => { r = reconcile(); }); },
    'site-toggle'(d) { uiChange(() => { if (siteShut.has(d.s)) siteShut.delete(d.s); else siteShut.add(d.s); }); },
    'ph-logo-rm'(d) { commit(() => { phUpdate(d.id, { logo: '' }); }); },
    'rank-by'(d) { uiChange(() => { rankBy = d.v; }); },
    'sched-new'(d) { uiChange(() => { schedOpen = !(schedOpen && schedKind === d.v); schedKind = d.v; }); },
    'halftime-close'() { uiChange(() => { halftimeOpen = false; }); },
    'halftime-open'() { uiChange(() => { halftimeOpen = true; }); },
    'entry-mode'(d) { commit(() => { Root.entryMode = d.v; pendingSpot = null; }); },
    'spot-clear'() { uiChange(() => { pendingSpot = null; }); },
    'team-dark'(d) { commit(() => { Root.teamDark = d.v === 'dark'; }); },
    'unlink-team'(d) { commit(() => { S.links = (S.links || []).filter((x) => x.id !== d.v); const other = Root.teams.find((t) => t.id === d.v); if (other) other.links = (other.links || []).filter((x) => x.id !== S.id); }); },
    'staff-role'(d) { commit(() => { const st = (S.staff || []).find((x) => x.id === d.id); if (!st) return; let r = rolesOf(st).slice(); r = r.includes(d.v) ? r.filter((x) => x !== d.v) : r.concat(d.v); if (d.v === 'head') r = r.filter((x) => x !== 'assistant'); if (d.v === 'assistant') r = r.filter((x) => x !== 'head'); st.roles = r; delete st.role; }); },
    'staff-remove'(d) { commit(() => { const st = (S.staff || []).find((x) => x.id === d.id); S.staff = S.staff.filter((x) => x.id !== d.id); if (st && st.email && CloudLink && CloudLink.user && S.access && S.access.admin !== st.email) CloudLink.removeCoach(S.id, st.email); }); },
    'add-person'(d) {
      if (d.id.startsWith('rp:')) {
        const [, tid, pid] = d.id.split(':'), t = Root.teams.find((x) => x.id === tid), src = t && t.players.find((x) => x.id === pid);
        if (!src) return;
        commit(() => { const per = personFor(src); per.teamId = per.teamId || tid; const { id, contacts, ...rest } = src; S.players.push(newPlayer(src.name, { ...rest, personId: per.id, contacts: (contacts || []).map((c) => ({ ...c, id: uid() })) })); searchHits = []; });
        return;
      }
      const per = people()[d.id] || searchHits.find((x) => x.id === d.id); if (!per) return; commit(() => { people()[per.id] = people()[per.id] || per; S.players.push(newPlayer(per.name, { personId: per.id, nick: per.nickname || '', youth: !!per.youth })); searchHits = []; }); },
    'edit-youth'() { commit(() => { const p = P(editing); p.youth = !p.youth; syncPerson(p); }); },
    'logo-remove'() { commit(() => { delete S.logo; delete S.palette; }); },
    'cap-ok'() { uiChange(() => { capNotice = null; }); },
    'cap-alarms'(d) { commit(() => { setRule('capAlarms', d.v === 'on'); }); if (d.v === 'on') beep([[660, 0.2]]); },
    'box-sort'(d) { uiChange(() => { boxSort = boxSort && boxSort.key === d.v ? { key: d.v, dir: -boxSort.dir } : { key: d.v, dir: d.v === 'name' || d.v === 'no' ? 1 : -1 }; }); },
    'bench-filter'(d) { uiChange(() => { benchFilter = benchFilter === d.v ? 'all' : d.v; }); },
    insight(d) { runInsight(d.k, d.v); },
    'insight-again'() { runInsight(insight.kind, insight.key, true); },
    'insight-close'() { uiChange(() => { insight = null; }); },
    'print-sheet'() { printSheet(); },
    'menu-close'() { uiChange(() => { menu = null; }); },
    stat(d) { const id = menu.id; menu = null; if (d.v === 'goal' && editIdx === null && !G().live.review) { addStats([{ t: 'goal', id }]); A.result({ v: 'us' }); return; } (editIdx !== null ? commit : commitLight)(() => addStats([{ t: d.v, id, ...(d.sub ? { sub: d.sub } : {}) }])); },
    'opp-pass'() { (editIdx !== null ? commit : commitLight)(() => addStats([{ t: 'opppass' }])); },
    'our-turn'() {
      const touches = E.chainOf(activePt().events).filter((e) => e.t === 'touch'), who = touches.length ? touches[touches.length - 1].id : null;
      if (!who) { flash('Tap who had the disc first, or hold their name for Turnover.'); return; }
      (editIdx !== null ? commit : commitLight)(() => addStats([{ t: 'turn', id: who }]));
    },
    'opp-turn'() { (editIdx !== null ? commit : commitLight)(() => addStats([{ t: 'oppturn' }])); },
    'open-box'(d) { uiChange(() => { boxOpen = true; sheetOpen = false; tab = 'game'; pointsSource = d.v || 'current'; }); window.scrollTo(0, 0); },
    'sheet-line'(d) {
      const g = G(); if (!g || g.live) return;
      const line = g.draft.line;
      if (line[d.id]) { commit(() => { delete line[d.id]; }); return; }
      if (placedIds().length >= targetSize()) { flash('The line is full. Take someone off first.'); return; }
      commit(() => { place(d.id, bestPos(d.id)); });
    },
    'box-close'() { uiChange(() => { boxOpen = false; }); },
    'open-sheet'(d) { uiChange(() => { sheetOpen = true; boxOpen = false; tab = 'game'; pointsSource = d.v || 'current'; }); window.scrollTo(0, 0); },
    'sheet-close'() { uiChange(() => { sheetOpen = false; }); },
    'reset-clock'() { const l = G().live; commitLight(() => { const now = Date.now(); l.startedAt = now; l.pausedAt = now; }); },
    pause() { const l = G().live; commitLight(() => { if (l.pausedAt) resume(l); else l.pausedAt = Date.now(); }); },
    'edit-prev'() { stopVoice(); uiChange(() => { editIdx = G().points.length - 1; sel = null; voice = null; }); },
    'edit-point'(d) { uiChange(() => { pointSheet = null; editIdx = Number(d.v); tab = 'game'; sel = null; voice = null; }); },
    'pt-set'(d) { commit(() => { const p = activePt(); p[d.k] = d.v; }); },
    'pt-insert'(d) {
      stopVoice();
      commit(() => {
        const g = G(), i = editIdx, at = d.v === 'before' ? i : i + 1, prev = g.points[at - 1], next = g.points[at], near = prev || next;
        const start = prev ? prev.endedAt : next.startedAt - 60000;
        const pt = { lineup: near.lineup.slice(), roles: { ...(near.roles || {}) }, ratio: near.ratio, on: prev ? (prev.result === 'us' ? 'D' : 'O') : near.on, startedAt: start, endedAt: start + 60000, result: 'us', puller: null, avail: (near.avail || []).slice(), subs: [], events: [], inserted: true };
        g.points.splice(at, 0, pt);
        editIdx = at; sel = null; voice = null; fixLine = true;
      });
      flash('Point added. Set who was on, who scored, and its plays.');
    },
    'pt-delete'() { commit(() => { const g = G(); g.points.splice(editIdx, 1); if (!g.points.length) editIdx = null; else editIdx = Math.min(editIdx, g.points.length - 1); fixLine = false; }); },
    'edit-step'(d) { stopVoice(); uiChange(() => { editIdx += Number(d.d); voice = null; fixLine = false; sel = null; }); },
    'edit-done'() { stopVoice(); uiChange(() => { editIdx = null; voice = null; fixLine = false; sel = null; }); },
    'pt-view-all'() { stopVoice(); uiChange(() => { editIdx = null; voice = null; tab = 'time'; ptView = 'points'; pointsSource = 'current'; }); },
    'pt-time'(d) { commit(() => { const p = activePt(); p.endedAt = Math.max(p.startedAt + 1000, p.endedAt + Number(d.d) * 1000); }); },
    'cloud-in'() { CloudLink.signIn(); },
    'cloud-out'() { CloudLink.signOut(); },
    'settings-open'() { uiChange(() => { settingsOpen = true; }); },
    'settings-close'() { uiChange(() => { settingsOpen = false; }); },
    'set-scheme'(d) { commit(() => { Root.theme = d.v; }); },
    'voice-mode'(d) { commit(() => { Root.voiceMode = d.v; }); },
    'run-match'() { const g = G(), season = seasonView || !g; const games = season ? S.history.filter((h) => h.points).concat(g ? [g] : []) : [g]; const count = games.reduce((n, x) => n + x.points.length, 0); const r = E.profileMatch(games, S.players, rules()); uiChange(() => { matchResult = { key: `${S.id}:${season}:${count}`, list: r.list }; }); },
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
      const r = E.parseLine(voice.text, voicePlayers(), rules().positions);
      stopVoice();
      commit(() => { applyLine(r); voice = null; sel = null; });
    },
    'end-game'() {
      stopVoice();
      editIdx = null;
      commit(() => {
        const g = G(), sc = E.score(g), st = E.replay(g, S.players, rules()), perPlayer = {};
        st.forEach((s, id) => { if (s.played) perPlayer[id] = { drop: s.drop, played: s.played, O: s.O, D: s.D, ms: s.ms, touch: s.touch, goal: s.goal, assist: s.assist, turn: s.turn, block: s.block }; });
        S.history.push({ id: g.id, ...(g.competitionId ? { competitionId: g.competitionId, group: g.group } : {}), ...(g.ruleOverride ? { ruleOverride: g.ruleOverride } : {}), videoStart: g.videoStart, video: g.video || '', opponent: g.opponent, date: g.startedAt, us: sc.us, them: sc.them, perPlayer, points: g.points, startOn: g.startOn, mode: g.mode, out: g.out });
        S.history.sort((x, y) => x.date - y.date);
        S.lastFinal = g.id;
        S.history.slice(0, -20).forEach((h) => { delete h.points; });
        let entry = S.schedule.find((x) => x.id === g.scheduleId);
        if (!entry) { const d = new Date(g.startedAt); entry = { id: uid(), date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, time: '', opponent: g.opponent, location: '' }; S.schedule.push(entry); }
        entry.gameId = g.id; entry.us = sc.us; entry.them = sc.them;
        if (entry.fixtureId) comps().forEach((c) => { const m = (c.matchups || []).find((x) => x.id === entry.fixtureId); if (m && !m.result) { m.result = m.a.id === S.id ? { a: sc.us, b: sc.them } : { a: sc.them, b: sc.us }; resolvePlayoffs(c); touchComp(c); } });
        S.game = null; S.setup = null; sel = null; voice = null;
        if (subscribers().length) { sendFor = true; reportNote = ''; }
      });
    },
    'setup-on'(d) { commit(() => { S.setup.startOn = d.v; }); },
    'setup-out'(d) { commit(() => { if (S.setup.out[d.id]) delete S.setup.out[d.id]; else S.setup.out[d.id] = true; }); },
    'start-game'() { commit(() => { const s = S.setup, comp = s.competitionId && compOf(s.competitionId), over = { ...((comp && comp.rules) || {}), ...(s.rules || {}) }; S.game = { id: uid(), ...(comp ? { competitionId: comp.id, group: s.group || null } : {}), ...(Object.keys(over).length ? { ruleOverride: over } : {}), scheduleId: s.scheduleId || null, opponent: s.opponent, startOn: s.startOn, gendzoneUs: s.gendzoneUs !== false, mode: 'balanced', out: { ...s.out }, startedAt: Date.now(), points: [], live: null, draft: newDraft() }; }); },
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
        S.game = { id: h.id, ...(h.competitionId ? { competitionId: h.competitionId, group: h.group } : {}), ...(h.ruleOverride ? { ruleOverride: h.ruleOverride } : {}), videoStart: h.videoStart, video: h.video || '', scheduleId: entry ? entry.id : null, opponent: h.opponent, startOn: h.startOn || (h.points[0] ? h.points[0].on : 'O'), mode: h.mode || 'balanced', out: h.out || {}, startedAt: h.date, points: h.points, live: null, draft: newDraft() };
        S.setup = null; tab = 'game'; sendFor = null; sel = null; voice = null; pointsSource = 'current';
        editIdx = h.points.length ? h.points.length - 1 : null;
      });
    },
    'go-player'(d) { stopVoice(); uiChange(() => { navBack = { tab, ptView, pointsSource, playerOpen, y: window.scrollY }; tab = 'players'; playerOpen = d.id; menu = null; editIdx = null; }); window.scrollTo(0, 0); },
    'open-player'(d) { uiChange(() => { navBack = { tab: 'players', ptView, pointsSource, playerOpen: null, y: window.scrollY }; playerOpen = d.id; }); window.scrollTo(0, 0); },
    'player-back'() { const b = navBack || { tab: 'players', ptView, pointsSource, playerOpen: null, y: 0 }; navBack = null; uiChange(() => { tab = b.tab; ptView = b.ptView; pointsSource = b.pointsSource; playerOpen = b.playerOpen; }); window.scrollTo(0, b.y || 0); },
    'close-player'() { uiChange(() => { playerOpen = null; }); },
    'open-game-stats'(d) { uiChange(() => { tab = 'game'; boxOpen = true; sheetOpen = false; pointsSource = d.v; }); window.scrollTo(0, 0); },
    'open-mic'() {
      if (voice && voice.open) { openMic = false; voice.open = false; stopVoice(); voice.listening = false; voice.status = ''; render(); return; }
      openMic = true;
      startOpenMic();
    },
    'team-view'(d) { uiChange(() => { teamView = d.v; coachNote = ''; editingComp = null; }); },
    'open-any'(d) { stopVoice(); commit(() => { Root.active = d.team; S = activeTeam(); sel = null; editIdx = null; voice = null; boxOpen = false; sheetOpen = false; if (d.v === 'current') tab = 'game'; else { tab = 'game'; boxOpen = true; pointsSource = d.v; } }); window.scrollTo(0, 0); },
    'any-start'(d) { commit(() => { Root.active = d.team; S = activeTeam(); const x = S.schedule.find((y) => y.id === d.id); S.setup = { opponent: x.opponent, startOn: 'O', out: rsvpOut(x.id), scheduleId: x.id, competitionId: x.competitionId || null, group: x.group || null, rules: { ...((x.competitionId && compOf(x.competitionId) || {}).rules || {}) } }; tab = 'game'; }); },
    'remove-coach'(d) { CloudLink.removeCoach(S.id, d.v); },
    'game-role'(d) { commit(() => { Root.gameRole = d.v; }); },
    'pt-view'(d) { uiChange(() => { ptView = d.v; }); },
    'combo-size'(d) { uiChange(() => { comboSize = d.v; }); },
    'score-open'(d) {
      uiChange(() => {
        if (d.comp) { const c = compOf(d.comp), m = c.matchups.find((x) => x.id === d.id); scoreEntry = { comp: d.comp, id: d.id, names: [m.a.name, m.b.name], a: m.result ? m.result.a : null, b: m.result ? m.result.b : null, when: m.slot ? `${longDate(m.slot.date)} · ${ampm(m.slot.start)}` : m.label || '' }; return; }
        const t = Root.teams.find((x) => x.id === d.team), x = t.schedule.find((y) => y.id === d.id);
        scoreEntry = { team: d.team, id: d.id, names: [t.team, x.opponent || 'Opponent'], when: `${longDate(x.date)}${x.time ? ' · ' + x.time : ''}` };
      });
    },
    'score-close'() { uiChange(() => { scoreEntry = null; }); },
    'any-del'(d) {
      const t = Root.teams.find((x) => x.id === d.team);
      if (!t) return;
      commit(() => {
        if (d.kind === 'upcoming') { const x = t.schedule.find((y) => y.id === d.id); t.schedule = t.schedule.filter((y) => y.id !== d.id); if (x && x.fixtureId && CloudLink && CloudLink.user) CloudLink.unfixture(t, x); }
        if (d.kind === 'done') { t.history = t.history.filter((h) => h.id !== d.id); t.schedule = t.schedule.filter((y) => y.gameId !== d.id); if (t.lastFinal === d.id) delete t.lastFinal; if (pointsSource === d.id) pointsSource = 'current'; }
        if (d.kind === 'live' && t.game && t.game.id === d.id) { t.schedule.forEach((y) => { if (y.id === t.game.scheduleId) delete y.gameId; }); t.game = null; if (t === S) { editIdx = null; sel = null; } }
      });
    },
    'del-schedule'(d) {
      commit(() => {
        const x = S.schedule.find((y) => y.id === d.id);
        S.schedule = S.schedule.filter((y) => y.id !== d.id);
        if (x && x.gameId) { S.history = S.history.filter((h) => h.id !== x.gameId); if (S.lastFinal === x.gameId) delete S.lastFinal; }
        if (x && x.fixtureId && CloudLink && CloudLink.user) CloudLink.unfixture(S, x);
        if (S.game && S.game.scheduleId === d.id) { S.game = null; editIdx = null; }
        if (pointsSource !== 'current' && pointsSource !== 'season' && !S.history.some((h) => h.id === pointsSource)) pointsSource = 'current';
      });
    },
    'pick-scheduled'(d) { commit(() => { const x = S.schedule.find((y) => y.id === d.id), c = x.competitionId && compOf(x.competitionId); Object.assign(S.setup, { scheduleId: d.id, opponent: x.opponent, out: rsvpOut(d.id), competitionId: x.competitionId || null, group: x.group || null, rules: { ...(c ? c.rules : {}) } }); }); },
    'start-scheduled'(d) { commit(() => { const x = S.schedule.find((y) => y.id === d.id); S.setup = { opponent: x.opponent, startOn: 'O', out: rsvpOut(x.id), scheduleId: x.id, competitionId: x.competitionId || null, group: x.group || null, rules: { ...((x.competitionId && compOf(x.competitionId) || {}).rules || {}) } }; tab = 'game'; }); },
    'create-game'() { uiChange(() => { tab = 'roster'; teamOpen = S.id; teamView = 'roster'; schedOpen = true; schedKind = 'game'; }); },
    'toggle-sub'(d) { commit(() => { const c = P(d.id).contacts.find((x) => x.id === d.v); c.subscribed = !c.subscribed; }); },
    'del-contact'(d) { commit(() => { const p = P(editing); p.contacts = p.contacts.filter((x) => x.id !== d.v); syncPerson(p); }); },
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
      if (!downloads) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([Report.html(S)], { type: 'text/html' }));
        link.download = `${S.team.replace(/[^A-Za-z0-9]+/g, '-')}-stats.html`;
        link.click();
        uiChange(() => { reportNote = 'Report saved. Attach it to an email to your subscribers.'; });
        return;
      }
      try { await downloads.save({ filename: `${S.team.replace(/[^A-Za-z0-9]+/g, '-')}-stats.html`, data: Report.html(S) }); uiChange(() => { reportNote = 'Report saved. Attach it to an email to your subscribers.'; }); } catch (e) { uiChange(() => { reportNote = 'The report was not saved. Try again if you still need it.'; }); }
    },
    'send-copy'() {
      const list = [...new Set(subscribers())].join(', ');
      const done = (m) => uiChange(() => { reportNote = m; });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(list).then(() => done('Addresses copied. Paste them into BCC.'), () => done('Copying was blocked. Select the addresses in the box below.'));
      else done('Select the addresses in the box below.');
    },
    rule(d) { commit(() => { setRule(d.k, Math.max(0, (rules()[d.k] || 0) + Number(d.d) * (Number(d.step) || 1))); redraft(); }); },
    'pos-limit'(d) {
      commit(() => {
        rules().positions[d.i][d.on].min += Number(d.d);
        redraft();
      });
    },
    'pos-floor'(d) { commit(() => { rules().positions[d.i].floor += Number(d.d); redraft(); }); },
    'del-pos'(d) { commit(() => { rules().positions.splice(Number(d.i), 1); redraft(); }); },
    division(d) { commit(() => { setRule('division', d.v); redraft(); }); },
    'ratio-mode'(d) { commit(() => { setRule('ratioMode', d.v); redraft(); }); },
    'gendzone-first'(d) { commit(() => { if (S.game) { S.game.gendzoneUs = d.v === 'us'; redraft(); } else S.setup.gendzoneUs = d.v === 'us'; }); },
    'ratio-start'(d) { commit(() => { setRule('ratioStart', d.v); redraft(); }); },
    tagrule(d) { commit(() => { const t = rules().tagRules[d.i]; if (d.k === 'min') t.min = (t.min || 0) + Number(d.d); else { const cur = t.max === null ? rules().size : t.max; const nx = cur + Number(d.d); t.max = nx >= rules().size ? null : nx; } redraft(); }); },
    'tagrule-when'(d) { commit(() => { const t = rules().tagRules[d.i]; t.when = t.when === 'all' ? 'O' : t.when === 'O' ? 'D' : 'all'; redraft(); }); },
    'del-tag'(d) { commit(() => { const r = S.rules; r.tags = r.tags.filter((t) => t !== d.v); r.tagRules = r.tagRules.filter((t) => t.tag !== d.v); S.players.forEach((p) => { p.tags = p.tags.filter((t) => t !== d.v); }); redraft(); }); },
    backup() {
      backupText = JSON.stringify(Root); notice = '';
      const done = (msg) => { notice = msg; render(); const t = document.getElementById('backup'); if (t) t.select(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(backupText).then(() => done('Backup copied.'), () => done('Copying was blocked. The backup is selected below, so copy it from there.'));
      else done('The backup is selected below. Copy it from there.');
    },
    async 'backup-file'() {
      const data = JSON.stringify(Root), filename = `line-caller-backup-${new Date().toISOString().slice(0, 10)}.json`;
      try {
        if (downloads) { await downloads.save({ filename, data }); notice = 'Backup saved.'; render(); return; }
        const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        if (native) { const f = await window.Capacitor.registerPlugin('Filesystem').writeFile({ path: filename, data, directory: 'CACHE', encoding: 'utf8' }); await window.Capacitor.registerPlugin('Share').share({ title: 'Line Caller backup', url: f.uri }); return; }
        const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); link.download = filename; link.click();
      } catch (e) { if (!e || e.code !== 'declined') { notice = "The backup file wasn't saved. Copy the backup instead."; render(); } }
    },
    restore() {
      try {
        const next = JSON.parse(backupText);
        if (!(next.teams && next.teams.length) && !(next.players && next.rules)) throw new Error('shape');
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
    // The goal always ends the point.
    const last = items.filter((it) => it.role === 'goal' || it.t === 'goal' || it.t === 'oppgoal');
    if (last.length) { const rest = items.filter((it) => !last.includes(it)); items.length = 0; items.push(...rest, ...last); }
    const flat = items.flatMap((it) => it.idxs.map((i) => pt.events[i]));
    commit(() => { pt.events = E.reflow(flat); });
  }
  function beginDrag(id, x, y, el) {
    if (id.startsWith('grip:')) {
      const [, edge, mid] = id.split(':'), c = compOf(compView), m = c && (c.matchups || []).find((q) => q.id === mid);
      if (!m) return;
      const ghost = document.createElement('div'); ghost.className = 'ghost'; document.body.appendChild(ghost);
      dragging = { id, grip: { edge, m, c }, ghost, el, zone: null }; hideTip(); moveDrag(x, y); return;
    }
    if (id.startsWith('mu:')) {
      el.classList.add('dragged');
      const ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.textContent = el.textContent.replace('✕', '').trim();
      document.body.appendChild(ghost);
      dragging = { id, ghost, el, zone: null }; hideTip(); moveDrag(x, y); return;
    }
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
    if (dragging.sx !== undefined && Math.hypot(x - dragging.sx, y - dragging.sy) > 10) dragging.moved = true;
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
    // Schedule board: light up every quarter hour the game would take.
    document.querySelectorAll('.sched .span-on, .sched .span-bad').forEach((e) => e.classList.remove('span-on', 'span-bad'));
    if (dragging.grip) {
      const { edge, m, c } = dragging.grip, row = under && under.closest('tr[data-t]');
      if (row) {
        const t = HM(row.dataset.t), s = HM(m.slot.start), e = s + lenOf(c, m);
        const ns = edge === 'top' ? Math.min(t, e - 30) : s, ne = edge === 'bottom' ? Math.max(t + 15, s + 30) : e;
        dragging.grip.start = hm(ns); dragging.grip.len = ne - ns;
        dragging.ghost.textContent = `${ampm(hm(ns))}–${ampm(hm(ne))} (${ne - ns} min)`;
        // The game grows or shrinks on the board as you drag.
        const box = dragging.el.closest('.mu'), td = box && box.closest('td'), rowAt = (t) => document.querySelector(`.sched tr[data-t="${hm(t)}"]`);
        if (box && td) {
          const base = td.getBoundingClientRect().top, top = rowAt(ns), last = rowAt(ne - 15);
          if (top && last) { const lr = last.getBoundingClientRect(); box.style.top = `${top.getBoundingClientRect().top - base}px`; box.style.height = `${lr.bottom - top.getBoundingClientRect().top}px`; }
          box.classList.toggle('bad', !!slotProblem(c, m, { ...m.slot, start: hm(ns) }, ne - ns)); box.classList.add('resizing');
          const tx = box.querySelector('.mu-txt .small'); if (tx) tx.textContent = `${ampm(hm(ns))}–${ampm(hm(ne))}`;
        }
      }
      dragging.under = under; return;
    }
    if (dragging.id && dragging.id.startsWith('mu:')) {
      const cell = under && under.closest('td.slot[data-drop]'), c = compOf(compView), m = c && (c.matchups || []).find((q) => q.id === dragging.id.slice(3));
      if (cell && m) {
        const len = lenOf(c, m), t0 = HM(cell.dataset.t), why = slotProblem(c, m, { fieldId: cell.dataset.f, date: schedDate, start: cell.dataset.t });
        document.querySelectorAll(`.sched td[data-f="${cell.dataset.f}"]`).forEach((td) => { const t = HM(td.dataset.t); if (t >= t0 && t < t0 + len) td.classList.add(why ? 'span-bad' : 'span-on'); });
      }
    }
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
      if (apply && d.press && !d.moved && Date.now() - d.at >= 450) { openMenu(d.press, d.sx, d.sy); return; }
      if (apply && d.to !== undefined && d.to !== d.ev) moveNarrative(d.ev, d.to, d.side);
      return;
    }
    if (d.zone) d.zone.classList.remove('drop-on');
    document.querySelectorAll('.sched .span-on, .sched .span-bad').forEach((e) => e.classList.remove('span-on', 'span-bad'));
    suppress();
    if (d.grip) { if (apply && d.grip.len) placeMatchup(d.grip.m.id, d.grip.m.slot.fieldId, d.grip.start, d.grip.len); return; }
    if (apply && d.press && !d.moved && Date.now() - d.at >= 450) { openMenu(d.press, d.sx, d.sy); return; }
    if (!apply || !d.zone) return;
    if (d.id.startsWith('mu:')) { const z = d.zone.dataset.drop; if (z.startsWith('slot:')) { const [fid, t] = z.slice(5).split('|'); placeMatchup(d.id.slice(3), fid, t); } return; }
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
    g0 = { el, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse', press: el.dataset.press, drag: el.dataset.drag, timer: null, at: Date.now() };
    const start = g0;
    if (start.press && (start.mouse || !start.drag)) start.timer = setTimeout(() => { g0 = null; suppress(); openMenu(start.press, start.x, start.y); }, 450);
    else if (!start.mouse) start.timer = setTimeout(() => { g0 = null; beginDrag(start.drag, start.x, start.y, start.el); if (dragging) Object.assign(dragging, { press: start.press, at: start.at, sx: start.x, sy: start.y }); if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { /* optional */ } }, 220);
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
    const fieldEl = ev.target.closest('svg.field-svg.tappable');
    if (fieldEl) {
      const r = fieldEl.getBoundingClientRect(), vb = fieldEl.viewBox.baseVal, k = Math.min(r.width / vb.width, r.height / vb.height);
      const ox = r.left + (r.width - vb.width * k) / 2, oy = r.top + (r.height - vb.height * k) / 2;
      const x = (ev.clientX - ox) / (vb.width * k), y = (ev.clientY - oy) / (vb.height * k);
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) uiChange(() => { pendingSpot = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }; });
      return;
    }
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
    if (key === 'edit-name' && v.trim()) commit(() => { P(editing).name = v.trim(); syncPerson(P(editing)); });
    if (key === 'edit-no') commit(() => { P(editing).no = v.trim(); });
    if (key === 'edit-alias') commit(() => { P(editing).aliases = v; });
    if (key === 'pt-time') {
      const m = v.trim().match(/^(\d+)(?::(\d{1,2}))?$/);
      if (m) commit(() => { const p = activePt(), ms = (Number(m[1]) * 60 + Number(m[2] || 0)) * 1000; p.endedAt = p.startedAt + Math.max(1000, ms); });
      else render();
    }
    if (key === 'video') {
      const rec = gameRec(ev.target.dataset.k), s = v.trim();
      if (rec && (rec.video || '') === (s ? Report.videoUrl(s) : '')) { /* unchanged */ } else if (rec && (!s || Report.videoUrl(s))) commit(() => { rec.video = s ? Report.videoUrl(s) : ''; });
      else if (rec) flash("That doesn't look like a YouTube link.");
    }
    if (key === 'video-start') { const rec = gameRec(ev.target.dataset.k), m = /^(?:(\d+):)?(\d+):(\d{1,2})$|^(\d+)$/.exec(v.trim()); if (rec && m) commit(() => { rec.videoStart = m[4] !== undefined ? Number(m[4]) : (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])); }); }
    if (key === 'points-src') uiChange(() => { pointsSource = v; });
    if (key === 'team' && v.trim()) commit(() => { S.team = v.trim(); });
    if (key === 'youth') commit(() => { S.youth = ev.target.checked; });
    if (key === 'sch-kind') uiChange(() => { schedKind = v; });
    if (key === 'line-name' && v.trim()) commit(() => { const l = (S.lines || []).find((x) => x.id === ev.target.dataset.id); if (l) l.name = v.trim(); });
    if (key === 'comp-name' && v.trim()) commit(() => { const c = compOf(compView); c.name = v.trim(); touchComp(c); });
    if (key === 'sched-date') uiChange(() => { schedDate = v; muSel = null; });
    if (key === 'sched-site') uiChange(() => { schedSite = v; });
    if (key === 'sched-div') uiChange(() => { schedDiv = v; });
    if (key === 'play-div') uiChange(() => { playDiv = v; });
    if (key === 'po-src') commit(() => { const c = compOf(compView), m = c && c.matchups.find((x) => x.id === ev.target.dataset.id); if (!m || !m.src) return; m.src[ev.target.dataset.k] = parseSrc(v); resolvePlayoffs(c); touchComp(c); });
    if (key === 'team-comp') uiChange(() => { teamComp = v; });
    if (key === 'bk-label') commit(() => { const c = compOf(compView), m = c && c.matchups.find((x) => x.id === ev.target.dataset.id); if (m && v.trim()) { m.label = v.trim().slice(0, 40); resolvePlayoffs(c); touchComp(c); } bkRename = null; });
    if (key === 'link-comp') uiChange(() => { if (linkDraft) linkDraft.comp = v; });
    if (key === 'mu-playoff') commit(() => { const c = compOf(compView), m = c && c.matchups.find((x) => x.id === ev.target.dataset.id); if (m) { m.playoff = ev.target.checked; touchComp(c); } });
    if (key === 'seed') commit(() => {
      const c = compOf(compView), br = (c.brackets || []).find((b) => b.id === ev.target.dataset.b), i = Number(ev.target.dataset.i); if (!br) return;
      const t = v ? (c.groups || []).flatMap((g) => g.teams || []).find((x) => x.id === v) : null;
      br.seeds = br.seeds.map((x, j) => (j === i ? (t ? { id: t.id, name: t.name } : null) : x && t && x.id === t.id ? null : x));
      resolvePlayoffs(c); touchComp(c);
    });
    if (key === 'ph-link' && v.trim()) { const id = ev.target.dataset.id, ref = teamRef(v); if (ref.id !== id) commit(() => { const t = allTeams().find((x) => x.id === id); phUpdate(id, { links: ((t && t.links) || []).filter((l) => l.id !== ref.id).concat(ref) }); const o = Root.teams.find((x) => x.id === ref.id); if (o && t) o.links = (o.links || []).filter((l) => l.id !== id).concat({ id, name: t.name }); }); }
    if (key === 'restore-file' && ev.target.files && ev.target.files[0]) { ev.target.files[0].text().then((txt) => { backupText = txt; A.restore(); }); }
    if (key === 'team-color' && /^#[0-9a-f]{6}$/i.test(v)) commit(() => { S.color = v; if (S.palette && S.palette.length) S.palette[0] = v; });
    if (key === 'pal' && /^#[0-9a-f]{6}$/i.test(v)) commit(() => { const i = Number(ev.target.dataset.i); S.palette = (S.palette && S.palette.length ? S.palette : [Report.safeColor(S.color)]).slice(); while (S.palette.length < i) S.palette.push('#888888'); S.palette[i] = v; if (i === 0) S.color = v; });
    if (key === 'team-nick') commit(() => { S.nickname = v.trim(); });
    if (key === 'ph-name' && v.trim()) commit(() => { phUpdate(ev.target.dataset.id, { name: v.trim() }); });
    if (key === 'ph-nick') commit(() => { phUpdate(ev.target.dataset.id, { nick: v.trim() }); });
    if (key === 'ph-pal' && /^#[0-9a-f]{6}$/i.test(v)) commit(() => { const id = ev.target.dataset.id, i = Number(ev.target.dataset.i), t = allTeams().find((x) => x.id === id), pal = (t.palette && t.palette.length ? t.palette : [Report.safeColor(t.color)]).slice(); while (pal.length < i) pal.push('#888888'); pal[i] = v; phUpdate(id, { palette: pal, color: pal[0] }); });
    if (key === 'ph-logo' && ev.target.files && ev.target.files[0]) {
      const id = ev.target.dataset.id, img = new Image(), url = URL.createObjectURL(ev.target.files[0]);
      img.onload = () => { const size = 160, k = Math.min(size / img.width, size / img.height, 1), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); const pal = paletteOf(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data); commit(() => { phUpdate(id, { logo: cv.toDataURL('image/png'), ...(pal.length ? { palette: pal, color: pal[0] } : {}) }); }); };
      img.src = url;
    }
    if (key === 'edit-nick') commit(() => { P(editing).nick = v.trim(); syncPerson(P(editing)); });
    if (key === 'edit-email') commit(() => { const p = P(editing), per = personFor(p); per.email = v.trim().toLowerCase(); per.at = Date.now(); });
    if (key === 'add-link') { const ref = teamRef(v); if (v.trim() && ref.id !== S.id) commit(() => { S.links = (S.links || []).filter((x) => x.id !== ref.id).concat(ref); const other = Root.teams.find((t) => t.id === ref.id); if (other) other.links = (other.links || []).filter((x) => x.id !== S.id).concat({ id: S.id, name: S.team }); }); }
    if (key === 'team-logo' && ev.target.files && ev.target.files[0]) {
      const img = new Image(), url = URL.createObjectURL(ev.target.files[0]);
      img.onload = () => {
        const size = 160, k = Math.min(size / img.width, size / img.height, 1), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        const pal = paletteOf(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
        commit(() => { S.logo = cv.toDataURL('image/png'); if (pal.length) { S.palette = pal; S.color = pal[0]; } });
      };
      img.onerror = () => flash("That image couldn't be read.");
      img.src = url;
    }
    if (key === 'pos-name' && v.trim()) commit(() => { const p = rules().positions[i]; p.name = v.trim(); p.abbr = makeAbbr(p.name, p.id); });
    if (key === 'pos-skill') commit(() => { const p = rules().positions[i]; p.skill = v === 'own' ? 'x_' + p.id : v; });
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.target.id === 'voice-text' && voice && voice.open && ev.key === 'Enter') { ev.preventDefault(); heard(ev.target.value); }
  });
  // As a name is typed, offer people who already have a player account.
  let searchTimer = null;
  function showHits(q) {
    const box = document.getElementById('person-hits'); if (!box) return;
    const low = q.toLowerCase(), onRoster = new Set(S.players.map((p) => p.personId));
    const local = Object.values(people()).filter((x) => !x.role && x.name && x.name.toLowerCase().startsWith(low) && !onRoster.has(x.id) && (S.youth || !x.youth));
    // Players already on another of this account's teams: youth teams see youth players, adult teams see adults.
    Root.teams.filter((t) => t.id !== S.id).forEach((t) => t.players.forEach((p) => { if (p.name.toLowerCase().startsWith(low) && !(p.personId && onRoster.has(p.personId)) && !!(p.youth || t.youth) === !!S.youth && !local.some((x) => x.id === p.personId)) local.push({ id: `rp:${t.id}:${p.id}`, name: p.name, team: t.team }); }));
    const all = [...new Map([...local, ...searchHits.filter((x) => x.name.toLowerCase().startsWith(low) && !onRoster.has(x.id))].map((x) => [x.id, x])).values()].slice(0, 6);
    box.innerHTML = q.length < 2 || !all.length ? '' : `<span class="small muted">Existing accounts:</span> ${all.map((x) => `<button type="button" class="btn small-btn" data-a="add-person" data-id="${x.id}">${esc(x.name)}${x.team ? ` <span class="small muted">${esc(x.team)}</span>` : x.email ? '' : ' <span class="small muted">(placeholder)</span>'}</button>`).join('')}`;
  }
  root.addEventListener('input', (ev) => {
    if (ev.target.dataset.input === 'team-q') { teamQuery = ev.target.value; render(); return; }
    if (ev.target.dataset.input === 'person-search') {
      const q = ev.target.value.split(',').pop().trim();
      showHits(q);
      clearTimeout(searchTimer);
      if (q.length >= 2 && CloudLink && CloudLink.user && !S.youth) searchTimer = setTimeout(async () => { searchHits = await CloudLink.searchPeople(q); showHits(q); }, 350);
    }
    if (ev.target.dataset.c === 'backup-text') backupText = ev.target.value;
    if (reporting && (ev.target.dataset.c === 'rs-us' || ev.target.dataset.c === 'rs-them')) reporting[ev.target.dataset.c.slice(3)] = ev.target.value;
    if (ev.target.dataset.c === 'voice' && voice) { voice.text = ev.target.value; refreshVoice(); }
  });
  function makeAbbr(name, selfId) {
    const clean = name.replace(/[^A-Za-z0-9]/g, '') || 'P';
    const taken = rules().positions.filter((p) => p.id !== selfId).map((p) => p.abbr);
    for (let n = 1; n <= Math.min(clean.length, 4); n++) { const a = clean[0].toUpperCase() + clean.slice(1, n); if (!taken.includes(a)) return a; }
    return clean.slice(0, 3) + (taken.length + 1);
  }
  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target.dataset.form;
    if (form === 'add') {
      const names = document.getElementById('add-name').value.split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length) commit(() => { names.forEach((n) => { const p = newPlayer(n, { youth: !!S.youth }); S.players.push(p); syncPerson(p); }); searchHits = []; });
    }
    if (form === 'staff') {
      const name = document.getElementById('staff-name').value.trim(), email = document.getElementById('staff-email').value.trim().toLowerCase(), role = document.getElementById('staff-role').value;
      if (!name && !email.includes('@')) return;
      commit(() => {
        const per = (email && personByEmail(email)) || newPerson({ role: 'staff', name: name || email, email: email.includes('@') ? email : '' });
        S.staff = (S.staff || []).filter((x) => !(email && x.email === email)).concat({ id: uid(), personId: per.id, name: name || per.name, email: email.includes('@') ? email : '', roles: [role] });
        if (email.includes('@') && CloudLink && CloudLink.user && S.access && !S.access.coaches.includes(email)) CloudLink.addCoach(S.id, email);
        coachNote = email.includes('@') ? `${name || email} can sign in with ${email} to open this team.` : '';
      });
    }
    if (form === 'coach') {
      const email = document.getElementById('coach-email').value.trim().toLowerCase();
      if (email.includes('@')) { coachNote = `${email} can now open this team by signing in with that Google account. Send them ${window.location.protocol === 'https:' && !window.location.hostname.includes('localhost') ? window.location.href.split('#')[0] : 'the app link'}.`; CloudLink.addCoach(S.id, email); render(); }
    }
    if (form === 'final-score') {
      const sa = Number(document.getElementById('fs-a').value), sb = Number(document.getElementById('fs-b').value), s = scoreEntry;
      if (!Number.isFinite(sa) || !Number.isFinite(sb)) return;
      commit(() => {
        if (s.comp) {
          const c = compOf(s.comp), m = c.matchups.find((x) => x.id === s.id);
          m.result = { a: sa, b: sb }; touchComp(c);
          // Our own teams in the matchup get the final on their schedules.
          [[m.a, sa, sb], [m.b, sb, sa]].forEach(([tm, us, them]) => { const t = Root.teams.find((x) => x.id === tm.id), x = t && t.schedule.find((y) => y.fixtureId === m.id); if (x && !x.gameId) reportFinal(t, x, us, them); });
          if (m.slot && CloudLink && CloudLink.user) CloudLink.leagueFixture(m.id, { ...fixtureOf(c, m), final: { [m.a.id]: sa, [m.b.id]: sb } });
          resolvePlayoffs(c);
        } else {
          const t = Root.teams.find((x) => x.id === s.team), x = t.schedule.find((y) => y.id === s.id);
          if (x && !x.gameId) reportFinal(t, x, sa, sb);
        }
        scoreEntry = null;
      });
    }
    if (form === 'report-score') {
      const x = S.schedule.find((y) => y.id === ev.target.dataset.id), us = Number(document.getElementById('rs-us').value), them = Number(document.getElementById('rs-them').value);
      if (x && Number.isFinite(us) && Number.isFinite(them)) commit(() => {
        const id = uid(), perPlayer = {};
        Object.keys(reporting.attend).forEach((pid) => { if (P(pid)) perPlayer[pid] = { played: 0, attended: true }; });
        S.history.push({ id, opponent: x.opponent, date: new Date(`${x.date}T12:00:00`).getTime(), us, them, perPlayer, points: [], reported: true, ...(x.competitionId ? { competitionId: x.competitionId, group: x.group } : {}) });
        S.history.sort((p, q) => p.date - q.date);
        Object.assign(x, { gameId: id, us, them }); reporting = null;
      });
    }
    if (form === 'line') { const name = document.getElementById('new-line').value.trim(); if (name) commit(() => { S.lines = S.lines || []; S.lines.push({ id: uid(), name, ids: [] }); }); }
    if (form === 'comp') { const name = document.getElementById('new-comp').value.trim(); if (name) commit(() => { const c = { id: uid(), name, kind: document.getElementById('new-comp-kind').value, admins: myEmail() ? [myEmail()] : [], groups: [], rules: {}, sites: [], matchups: [], slotMin: 90, at: Date.now() }; comps().push(c); compView = c.id; compSub = 'overview'; }); }
    if (form === 'comp-admin') { const e = document.getElementById('comp-admin').value.trim().toLowerCase(); if (e.includes('@')) commit(() => { const c = compOf(compView); c.admins = [...new Set([...(c.admins || []), e])]; touchComp(c); }); }
    if (form === 'comp-group') { const name = document.getElementById('comp-group').value.trim(); if (name) commit(() => { const c = compOf(compView); if (!c.groups.some((g) => g.name === name)) c.groups.push({ name, teams: [] }); touchComp(c); }); }
    if (form === 'comp-team') { const gi = Number(ev.target.dataset.i), name = document.getElementById(`comp-team-${gi}`).value.trim(); if (name) commit(() => { const c = compOf(compView), ref = teamRef(name); if (c.groups.some((g) => g.teams.some((t) => t.id === ref.id))) { flash(`${ref.name} is already in this competition.`); return; } c.groups[gi].teams.push(ref); touchComp(c); }); }
    if (form === 'site') { const name = ev.target.elements.name.value.trim(); if (name) commit(() => { const c = compOf(compView); c.sites = c.sites || []; c.sites.push({ id: uid(), name, fields: [] }); touchComp(c); }); }
    if (form === 'field') { const names = ev.target.elements.name.value.split(',').map((x) => x.trim()).filter(Boolean); if (names.length) commit(() => { const c = compOf(compView), s = c.sites.find((x) => x.id === ev.target.dataset.s); names.forEach((name) => { if (!s.fields.some((f) => f.name.toLowerCase() === name.toLowerCase())) s.fields.push({ id: uid(), name, lat: null, lng: null, address: '' }); }); touchComp(c); }); }
    if (form === 'hours') {
      const el = ev.target.elements, days = [0, 1, 2, 3, 4, 5, 6].filter((i) => el['d' + i].checked);
      if (!days.length) { flash('Pick at least one day.'); return; }
      if (el.start.value >= el.end.value || !el.from.value || !el.to.value || el.from.value > el.to.value) { flash('Check the times and dates.'); return; }
      commit(() => { const c = compOf(compView), s = c.sites.find((x) => x.id === ev.target.dataset.s); s.hours = siteHours(s).slice(); s.hours.push({ days, start: el.start.value, end: el.end.value, from: el.from.value, to: el.to.value }); (s.fields || []).forEach((f) => { delete f.hours; }); touchComp(c); });
    }
    if (form === 'bracket') {
      const el = ev.target.elements, n = Number(el.n.value);
      if (!(n >= 3 && n <= 12)) { flash('A bracket takes 3 to 12 teams.'); return; }
      commit(() => { const c = compOf(compView); makeBracket(c, el.name.value.trim() || 'Playoffs', el.group ? el.group.value : '', n); touchComp(c); });
    }
    if (form === 'po-game') {
      const el = ev.target.elements, a = parseSrc(el.a.value), b = parseSrc(el.b.value);
      if (!a || !b || el.a.value === el.b.value) { flash('Pick two different sides.'); return; }
      commit(() => { const c = compOf(compView), m = addPlayoffGame(c, null, 0, a, b); m.group = playDiv !== 'all' ? playDiv : ''; resolvePlayoffs(c); touchComp(c); });
    }
    if (form === 'league-link') {
      const el = ev.target.elements, d = linkDraft, t = d && Root.teams.find((x) => x.id === d.team), h = t && t.history.find((x) => x.id === d.id);
      const c = d && ((d.comp && compOf(d.comp)) || comps().filter(isCompAdmin)[0]);
      if (!t || !h || !c) return;
      commit(() => {
        if (!(c.groups || []).length) c.groups = [{ name: c.kind === 'tournament' ? 'Pool A' : 'Division 1', teams: [] }];
        const grp = c.groups.find((g) => el.group && g.name === el.group.value) || c.groups[0];
        if (!teamInComp(c, t.id)) grp.teams.push({ id: t.id, name: t.team });
        let opp;
        if (el.opp.value === '__new') { opp = teamRef(h.opponent || 'Opponent'); if (opp.id === t.id) opp = teamRef(`${h.opponent || 'Opponent'} (opponent)`); if (!teamInComp(c, opp.id)) grp.teams.push({ ...opp }); }
        else { const o = c.groups.flatMap((g) => g.teams || []).find((x) => x.id === el.opp.value); opp = { id: o.id, name: o.name }; }
        const m = { id: uid(), group: grp.name, a: { id: t.id, name: t.team }, b: { ...opp }, slot: null, linked: true, date: localDay(new Date(h.date)), result: { a: h.us, b: h.them }, ...(el.playoff.checked ? { playoff: true } : {}) };
        c.matchups = c.matchups || []; c.matchups.push(m);
        Object.assign(h, { competitionId: c.id, group: grp.name, matchupId: m.id, opponent: opp.name });
        const x = t.schedule.find((y) => y.gameId === h.id);
        if (x) Object.assign(x, { fixtureId: m.id, competitionId: c.id, group: grp.name, oppTeamId: opp.id, opponent: opp.name });
        touchComp(c); linkDraft = null;
      });
    }
    if (form === 'team-admin') {
      const email = ev.target.elements.email.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { flash('Enter their email address.'); return; }
      commit(() => {
        const t = adoptTeam(ev.target.dataset.id); if (!t) return;
        const per = personByEmail(email) || newPerson({ role: 'staff', name: email, email, teamId: t.id });
        t.staff = [{ id: uid(), personId: per.id, name: per.name || email, email, roles: ['admin'] }];
        Root.active = t.id; S = t; teamOpen = t.id; teamView = 'coaches';
        coachNote = `${email} is now team admin. They sign in with that Google account to run ${t.team}.`;
      });
    }
    if (form === 'team-merge') {
      const from = ev.target.dataset.id, to = allTeams().find((x) => x.id === ev.target.elements.to.value);
      if (!to || to.id === from) return;
      commit(() => { mergeTeamRefs(from, to); teamOpen = to.id; });
    }
    if (form === 'matchup') {
      const gi = Number(ev.target.dataset.i), el = ev.target.elements;
      commit(() => { const c = compOf(compView), g = c.groups[gi], x = g.teams[Number(el.a.value)], y = g.teams[Number(el.b.value)]; if (!x || !y || x.id === y.id) { flash('Pick two different teams.'); return; } c.matchups = c.matchups || []; c.matchups.push({ id: uid(), group: g.name, a: { ...x }, b: { ...y }, slot: null, ...(el.playoff.checked ? { playoff: true } : {}) }); touchComp(c); });
    }
    if (form === 'schedule-edit') {
      const x = S.schedule.find((y) => y.id === ev.target.dataset.id);
      const vv = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      if (x && vv('se-date') && (x.kind === 'practice' || vv('se-opp'))) commit(() => {
        Object.assign(x, { opponent: x.kind === 'practice' ? '' : vv('se-opp'), date: vv('se-date'), time: vv('se-time'), location: vv('se-loc') });
        const cs = document.getElementById('se-comp');
        if (cs) { const [cid, grp] = cs.value.split('|'); if (cid) { x.competitionId = cid; if (grp) x.group = grp; else delete x.group; } else { delete x.competitionId; delete x.group; } }
        linkOpponent(x); editingGame = null;
      });
    }
    if (form === 'schedule') {
      const oppEl = document.getElementById('sch-opp'), opponent = oppEl ? oppEl.value.trim() : '', date = document.getElementById('sch-date').value;
      const kind = document.getElementById('sch-kind').value, compSel = document.getElementById('sch-comp'), [compId, group] = compSel ? compSel.value.split('|') : ['', ''];
      if (date && (opponent || kind === 'practice')) commit(() => { const x = { id: uid(), kind, opponent: kind === 'practice' ? '' : opponent, date, time: document.getElementById('sch-time').value.trim(), location: document.getElementById('sch-loc').value.trim() }; if (compId) { x.competitionId = compId; if (group) x.group = group; } linkOpponent(x); S.schedule.push(x); schedOpen = false; });
    }
    if (form === 'contact') {
      const email = document.getElementById('c-email').value.trim();
      if (email.includes('@')) commit(() => { const p = P(editing); p.contacts = p.contacts || []; p.contacts.push({ id: uid(), name: document.getElementById('c-name').value.trim(), email, relation: document.getElementById('c-rel').value, subscribed: true }); syncPerson(p); });
    }
    if (form === 'team') {
      const name = document.getElementById('new-team').value.trim();
      if (name) commit(() => { const t = blank(JSON.parse(JSON.stringify(S.rules)), name); Root.teams.push(t); Root.active = t.id; S = t; sel = null; teamOpen = t.id; teamView = 'roster'; });
    }
    if (form === 'tag') {
      const t = document.getElementById('new-tag').value.trim();
      if (t && !rules().tags.includes(t)) commit(() => { rules().tags.push(t); rules().tagRules.push({ tag: t, min: 0, max: null, when: 'all' }); });
    }
    if (form === 'pos') {
      const name = document.getElementById('new-pos').value.trim();
      if (name && !rules().positions.some((p) => p.name.toLowerCase() === name.toLowerCase())) commit(() => { const id = 'p' + uid(); rules().positions.push({ id, name, abbr: makeAbbr(name, id), skill: 'x_' + id, floor: 1, O: { min: 0 }, D: { min: 0 } }); redraft(); });
    }
  });

  /* ---------- Accounts and sync (hosted site and Android app only) ---------- */
  const CloudLink = (() => {
    if (!window.firebase || !window.FIREBASE_CONFIG || typeof Cloud === 'undefined') return null;
    firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth(), fs = firebase.firestore();
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => { /* another tab holds it; sync still works */ });
    const known = new Set(), listeners = new Map(), rsvpListeners = new Map(), fixtureListeners = new Map();
    let stopComps = null, god = false;
    let castTimer = null;
    let user = null, stopTeams = null, ready = false, timer = null, status = '', problem = '', plug = null;
    const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const nativeAuth = () => { if (!plug) plug = window.Capacitor.registerPlugin('FirebaseAuthentication'); return plug; };
    const persist = () => { try { localStorage.setItem(KEY_STORE, JSON.stringify(Root)); } catch (e) { /* keep going */ } };
    const email = () => (user.email || '').toLowerCase();
    const teams = () => fs.collection('teams');
    const docs = (id) => teams().doc(id).collection('docs');
    const fail = (e) => { problem = `Sync failed: ${e.message}`; if (settingsOpen && !dragging) render(); };
    function settle() {
      const real = Root.teams.filter((t) => !t.isExample);
      if (real.length) Root.teams = real;
      if (!Root.teams.length) Root.teams = [example()];
      if (!Root.teams.some((t) => t.id === Root.active)) Root.active = Root.teams[0].id;
      persist();
      if (!dragging) { S = activeTeam(); touch(); render(); }
    }
    function stopTeam(id) {
      if (listeners.has(id)) { listeners.get(id)(); listeners.delete(id); }
      [...known].filter((k) => k.split('_')[1] === id).forEach((k) => known.delete(k));
    }
    const makeTeam = (id) => { const t = blank(); t.id = id; return t; };
    function listenTeam(id) {
      if (listeners.has(id)) return;
      listeners.set(id, docs(id).onSnapshot({ includeMetadataChanges: true }, (snap) => {
        let changed = false;
        Cloud.inOrder(snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.doc.data() }))).forEach((c) => { if (Cloud.incoming(Root, c, known, makeTeam)) changed = true; });
        status = snap.metadata.hasPendingWrites ? 'Changes will upload when you are online.' : snap.metadata.fromCache ? 'Offline. Your work is saved on this device.' : 'Up to date.';
        if (changed) settle(); else if (settingsOpen && !dragging) render();
      }, fail));
    }
    function flush() {
      if (!user || !ready) return;
      Root.teams.filter((t) => !t.isExample && !t.access).forEach((t) => {
        t.access = { admin: email(), coaches: [...new Set([email(), ...(t.staff || []).map((st) => st.email).filter(Boolean)])], name: t.team };
        teams().doc(t.id).set(t.access).catch(fail);
        listenTeam(t.id);
      });
      Root.teams.filter((t) => t.access && t.access.admin === email() && t.access.name !== t.team).forEach((t) => { t.access.name = t.team; teams().doc(t.id).update({ name: t.team }).catch(fail); });
      syncRsvp();
      syncDirectory();
      syncComps();
      syncPeople();
      syncCast();
      const { writes, deletes } = Cloud.outgoing(Root, known, Date.now());
      if (!writes.length && !deletes.length) { persist(); return; }
      persist();
      const ops = [...writes.map((w) => (b) => b.set(docs(w.data.teamId).doc(w.id), w.data)), ...deletes.map((id) => (b) => b.delete(docs(id.split('_')[1]).doc(id)))];
      for (let i = 0; i < ops.length; i += 100) {
        const batch = fs.batch();
        ops.slice(i, i + 100).forEach((op) => op(batch));
        batch.commit().catch(fail);
      }
      deletes.filter((id) => id.startsWith('t_')).forEach((id) => { const tid = id.slice(2); stopTeam(tid); teams().doc(tid).delete().catch(fail); });
    }
    // People: placeholders until the person signs in with that email, then theirs.
    const peopleHash = {};
    function syncPeople() {
      Root.teams.forEach((t) => t.players.forEach((p) => { if (p.personId && people()[p.personId] && !people()[p.personId].teamId) people()[p.personId].teamId = t.id; }));
      Object.values(people()).forEach((per) => {
        if (!per.createdBy) per.createdBy = email();
        const rec = { role: per.role || '', name: per.name || '', nameLower: (per.name || '').toLowerCase(), nickname: per.nickname || '', email: per.email || '', youth: !!per.youth, guardians: per.guardians || [], uid: per.uid || '', teamId: per.teamId || 'none', createdBy: per.createdBy, at: per.at || 0 };
        const h = Cloud.hash(JSON.stringify(rec));
        if (peopleHash[per.id] === h || per.syncedHash === h) return;
        peopleHash[per.id] = h; per.syncedHash = h;
        fs.collection('people').doc(per.id).set(rec, { merge: true }).catch(() => { peopleHash[per.id] = null; per.syncedHash = null; });
        // Only adult players are searchable by name; youth players never appear in the index.
        const idx = fs.collection('playerIndex').doc(per.id);
        if (!rec.youth && !rec.role && rec.name) idx.set({ name: rec.name, nameLower: rec.nameLower, createdBy: rec.createdBy }).catch(() => {}); else idx.delete().catch(() => {});
      });
    }
    function takePerson(d) { const v = d.data(), cur = people()[d.id]; if (cur && (cur.at || 0) >= (v.at || 0)) return false; people()[d.id] = { id: d.id, ...v, syncedHash: null }; return true; }
    function listenPeople() {
      const me = email();
      [['createdBy', '=='], ['email', '=='], ['guardians', 'array-contains']].forEach(([f, op]) => fs.collection('people').where(f, op, me).onSnapshot((snap) => {
        let changed = false;
        snap.docs.forEach((d) => { if (takePerson(d)) changed = true; if (f === 'email' && !d.data().uid) { fs.collection('people').doc(d.id).update({ uid: user.uid, at: Date.now() }).catch(() => {}); } });
        if (changed) { persist(); if (!dragging) render(); }
      }, () => { /* rules not published yet */ }));
    }
    // Competitions live in their own records, edited by their admins.
    const compJson = (c) => { const { syncHash, readOnly, ...rest } = c; return JSON.stringify(rest); };
    function syncComps() {
      comps().filter((c) => !c.readOnly).forEach((c) => {
        if (!(c.admins || []).length) c.admins = [email()];
        if (!c.admins.includes(email())) return;
        const json = compJson(c), h = Cloud.hash(json);
        if (c.syncHash === h) return;
        c.syncHash = h;
        fs.collection('competitions').doc(c.id).set({ admins: c.admins, json, at: c.at || Date.now() }).catch(fail);
      });
    }
    function listenComps() {
      if (stopComps) stopComps();
      stopComps = (god ? fs.collection('competitions') : fs.collection('competitions').where('admins', 'array-contains', email())).onSnapshot((snap) => {
        let changed = false;
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'removed') { Root.competitions = comps().filter((c) => c.id !== ch.doc.id); changed = true; return; }
          const d = ch.doc.data(), local = compOf(ch.doc.id);
          if (local && (local.at || 0) >= (d.at || 0)) return;
          try { const c = JSON.parse(d.json); c.syncHash = Cloud.hash(d.json); Root.competitions = comps().filter((x) => x.id !== ch.doc.id).concat(c); changed = true; } catch (e) { /* skip a bad record */ }
        });
        if (changed) settle();
      }, () => { /* rules not published yet */ });
    }
    // Competitions our teams play in but don't run: read-only copies, for their rules and fields.
    function fetchComp(id) {
      if (compOf(id) || fetchComp.asked[id]) return;
      fetchComp.asked[id] = true;
      fs.collection('competitions').doc(id).get().then((d) => { if (!d.exists || compOf(id)) return; try { const c = JSON.parse(d.data().json); c.readOnly = true; comps().push(c); settle(); } catch (e) { /* skip */ } }).catch(() => {});
    }
    fetchComp.asked = {};
    // Teams are listed so other coaches can pick them as opponents.
    function syncDirectory() {
      Root.teams.filter((t) => t.access && !t.isExample && t.access.admin === email()).forEach((t) => {
        const rec = { name: t.team, nameLower: t.team.toLowerCase(), color: t.color || '', at: Date.now() }, h = Cloud.hash(`${rec.name}|${rec.color}`);
        if (t.dirHash === h) return;
        t.dirHash = h;
        fs.collection('directory').doc(t.id).set(rec).catch(fail);
      });
      Root.teams.filter((t) => t.access).forEach(listenFixtures);
    }
    async function loadDirectory() {
      try { const snap = await fs.collection('directory').orderBy('nameLower').limit(500).get(); dirCache = snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color || '' })); } catch (e) { dirCache = []; }
    }
    // Games other coaches scheduled against one of our teams appear in our schedule too.
    function listenFixtures(t) {
      if (fixtureListeners.has(t.id)) return;
      fixtureListeners.set(t.id, fs.collection('fixtures').where('teams', 'array-contains', t.id).onSnapshot((snap) => {
        let changed = false;
        snap.forEach((d) => {
          const f = d.data(), other = f.teams.find((id) => id !== t.id), x = t.schedule.find((y) => y.fixtureId === d.id);
          const want = { date: f.date, time: f.time || '', location: f.location || '', opponent: (f.names || {})[other] || 'Opponent', ...(f.competitionId ? { competitionId: f.competitionId, group: f.group || '' } : {}), lat: f.lat == null ? null : f.lat, lng: f.lng == null ? null : f.lng };
          if (f.competitionId) fetchComp(f.competitionId);
          if (f.cancelled) { if (x && !x.gameId) { t.schedule = t.schedule.filter((y) => y !== x); changed = true; } return; }
          if (!x) { if (f.removed && f.removed[t.id]) return; t.schedule.push({ id: uid(), fixtureId: d.id, oppTeamId: other, kind: 'game', fixtureAt: f.at, ...want }); changed = true; return; }
          if (!x.gameId && (f.at || 0) > (x.fixtureAt || 0)) { Object.assign(x, want); x.fixtureAt = f.at; changed = true; }
          if (!x.gameId && f.final && f.final[t.id] != null) { reportFinal(t, x, f.final[t.id], f.final[other]); changed = true; }
        });
        if (changed) settle();
      }, () => { /* rules not published yet */ }));
    }
    function makeFixture(t, x) {
      const names = { [t.id]: t.team, [x.oppTeamId]: x.opponent }, rec = { teams: [t.id, x.oppTeamId], names, date: x.date, time: x.time || '', location: x.location || '', at: Date.now() };
      if (x.fixtureId) { x.fixtureAt = rec.at; fs.collection('fixtures').doc(x.fixtureId).set(rec, { merge: true }).catch(fail); return; }
      const ref = fs.collection('fixtures').doc(); x.fixtureId = ref.id; x.fixtureAt = rec.at; ref.set(rec).catch(fail);
    }
    // Gamecast: a public record of the game in progress, refreshed a moment after each change.
    function syncCast() {
      Root.teams.filter((t) => t.access && t.castKey).forEach((t) => {
        const g = t.game, last = t.history[t.history.length - 1];
        const P2 = (id) => t.players.find((p) => p.id === id);
        const who = (id) => { const p = P2(id); return p ? { id, no: p.no || '', name: p.name } : null; };
        let state;
        if (g) {
          const sc = E.score(g), pt = g.live, entry = t.schedule.find((x) => x.id === g.scheduleId);
          const r = g.ruleOverride ? { ...t.rules, ...g.ruleOverride } : t.rules;
          state = { live: true, team: t.team, color: Report.safeColor(t.color), opponent: g.opponent || 'Opponent', fixtureId: entry && entry.fixtureId || null, us: sc.us, them: sc.them, gameStartedAt: capStart(g, t), caps: { soft: r.softCap || 0, hard: r.hardCap || 0, time: r.timeCap || 0 }, gameTo: g.capTo || r.gameTo,
            point: pt ? { n: g.points.length + 1, on: pt.on, startedAt: pt.startedAt, pausedAt: pt.pausedAt || null, review: pt.review ? pt.review.result : null, puller: pt.puller || null, onField: [...new Set(pt.lineup.concat((pt.subs || []).map((s) => s.in)))].filter((id) => !(pt.subs || []).some((s) => s.out === id && !pt.lineup.includes(id))).map(who).filter(Boolean), events: (pt.events || []).filter((e) => !e.auto).map((e) => ({ t: e.t, id: e.id || null, sub: e.sub || null, x: e.x === undefined ? null : e.x, y: e.y === undefined ? null : e.y })) } : null,
            players: Object.fromEntries(t.players.map((p) => [p.id, { no: p.no || '', name: p.name }])),
            recent: g.points.slice(-6).map((p, i, arr) => { const goal = (p.events || []).find((e) => e.t === 'goal'), ast = (p.events || []).find((e) => e.t === 'assist'); return { n: g.points.length - arr.length + i + 1, result: p.result, on: p.on, scorer: goal ? who(goal.id) : null, assist: ast ? who(ast.id) : null, ms: p.endedAt - p.startedAt }; }) };
          if (entry && entry.fixtureId && entry.castLinked !== t.castKey) { entry.castLinked = t.castKey; fs.collection('fixtures').doc(entry.fixtureId).set({ cast: { [t.id]: t.castKey } }, { merge: true }).catch(() => {}); }
        } else state = { live: false, team: t.team, color: Report.safeColor(t.color), final: last ? { opponent: last.opponent || 'Opponent', us: last.us, them: last.them, date: last.date } : null };
        const json = JSON.stringify(state), h = `${t.castKey}:${Cloud.hash(json)}`;
        if (t.castHash === h) return;
        t.castHash = h;
        fs.collection('cast').doc(t.castKey).set({ teamId: t.id, json, at: Date.now() }).catch(fail);
      });
    }
    // The RSVP page reads a small public record: upcoming games and roster names, nothing else.
    function syncRsvp() {
      Root.teams.filter((t) => t.access && t.rsvpKey).forEach((t) => {
        const json = JSON.stringify({ team: t.team, games: (t.schedule || []).filter((x) => !x.gameId).map((x) => ({ id: x.id, kind: x.kind || 'game', date: x.date, time: x.time || '', opponent: x.opponent || '', location: x.location || '' })), players: t.players.map((p) => ({ id: p.id, name: p.name, no: p.no || '' })) });
        const h = `${t.rsvpKey}:${Cloud.hash(json)}`;
        if (t.rsvpHash !== h) { t.rsvpHash = h; fs.collection('rsvp').doc(t.rsvpKey).set({ teamId: t.id, json, at: Date.now() }).catch(fail); }
        const cur = rsvpListeners.get(t.id);
        if (cur && cur.key === t.rsvpKey) return;
        if (cur) cur.stop();
        const stop = fs.collection('rsvp').doc(t.rsvpKey).collection('answers').onSnapshot((snap) => {
          const ans = {};
          snap.forEach((d) => { const v = d.data(); if (v && v.game && v.player) ans[d.id] = { game: v.game, player: v.player, status: v.status, note: v.note || '', at: v.at || 0 }; });
          if (JSON.stringify(ans) !== JSON.stringify(t.rsvpAnswers || {})) { t.rsvpAnswers = ans; persist(); if (!dragging) render(); }
        }, () => { /* rules not published yet */ });
        rsvpListeners.set(t.id, { key: t.rsvpKey, stop });
      });
    }
    // Moves teams saved by the earlier single-account version into shared teams, once per device.
    async function migrate() {
      if (Root.cloudShared) return;
      try {
        const old = await fs.collection('users').doc(user.uid).collection('docs').get();
        const scratch = new Set();
        Cloud.inOrder(old.docs.map((d) => ({ type: 'added', id: d.id, data: d.data() }))).forEach((c) => Cloud.incoming(Root, c, scratch, makeTeam));
      } catch (e) { /* nothing older to bring over */ }
      Root.teams.forEach((t) => { delete t.syncHash; });
      Root.cloudShared = true;
    }
    function listen() {
      ready = false;
      stopTeams = (god ? teams() : teams().where('coaches', 'array-contains', email())).onSnapshot({ includeMetadataChanges: true }, async (snap) => {
        const ids = new Set();
        let changed = false;
        snap.forEach((d) => {
          ids.add(d.id);
          let t = Root.teams.find((x) => x.id === d.id);
          if (!t) { t = makeTeam(d.id); t.team = d.data().name || 'Team'; Root.teams.push(t); changed = true; }
          const access = d.data();
          if (JSON.stringify(t.access) !== JSON.stringify(access)) { t.access = access; changed = true; }
          listenTeam(d.id);
        });
        if (!snap.metadata.fromCache) {
          Root.teams.filter((t) => t.access && !ids.has(t.id) && !snap.metadata.hasPendingWrites).forEach((t) => { stopTeam(t.id); Root.teams = Root.teams.filter((x) => x !== t); changed = true; });
        }
        if (!ready) { await migrate(); ready = true; flush(); loadDirectory(); listenComps(); listenPeople(); changed = true; }
        problem = '';
        if (changed) settle();
      }, (e) => { problem = `Sync stopped: ${e.message}`; if (!dragging) render(); });
    }
    if (!native()) auth.getRedirectResult().catch((e) => { if (e && e.code && e.code !== 'auth/no-auth-event') { problem = e.code === 'auth/unauthorized-domain' ? `Sign-in isn't turned on for ${location.hostname} yet. Add it under Authentication, Settings, Authorized domains in the Firebase console.` : `Sign-in didn't finish. (${e.code})`; settingsOpen = true; render(); } });
    auth.onAuthStateChanged((u) => {
      if (stopTeams) { stopTeams(); stopTeams = null; }
      [...listeners.keys()].forEach(stopTeam);
      rsvpListeners.forEach((x) => x.stop()); rsvpListeners.clear();
      fixtureListeners.forEach((stop) => stop()); fixtureListeners.clear();
      if (stopComps) { stopComps(); stopComps = null; }
      known.clear(); ready = false; user = u; status = ''; god = false;
      // Superuser access exists only if the project owner made a record for this email in the gods collection.
      if (u) fs.collection('gods').doc((u.email || '').toLowerCase()).get().then((d) => { god = d.exists; }).catch(() => { god = false; }).finally(listen);
      if (S) render();
    });
    return {
      get user() { return user; },
      get god() { return god; },
      resync() {
        Root.teams.forEach((t) => { delete t.syncHash; delete t.syncAt; delete t.rsvpHash; delete t.castHash; delete t.dirHash; });
        comps().forEach((c) => { delete c.syncHash; });
        Object.values(people()).forEach((p) => { delete p.syncedHash; });
        Object.keys(peopleHash).forEach((k) => { delete peopleHash[k]; });
        known.clear(); flush(); listenComps();
      },
      reconcileFixtures(compId, keep) {
        fs.collection('fixtures').where('competitionId', '==', compId).get().then((snap) => snap.forEach((d) => { if (!keep.includes(d.id) && !d.data().cancelled) d.ref.set({ cancelled: true, at: Date.now() }, { merge: true }).catch(() => {}); })).catch(() => {});
      },
      get status() { return status; },
      get problem() { return problem; },
      schedule() { clearTimeout(timer); timer = setTimeout(flush, 1500); },
      castSoon() { clearTimeout(castTimer); castTimer = setTimeout(() => { if (user && ready) syncCast(); }, 900); },
      fixture(t, x) { makeFixture(t, x); },
      async searchPeople(q) {
        const low = q.toLowerCase();
        try { const snap = await fs.collection('playerIndex').where('nameLower', '>=', low).where('nameLower', '<=', low + '\uf8ff').limit(8).get(); return snap.docs.map((d) => ({ id: d.id, name: d.data().name, createdBy: d.data().createdBy, email: '', youth: false, guardians: [] })); } catch (e) { return []; }
      },
      leagueFixture(id, fx) { fs.collection('fixtures').doc(id).set(fx).catch(fail); },
      deleteComp(id) { fs.collection('competitions').doc(id).delete().catch(fail); },
      unfixture(t, x) { fs.collection('fixtures').doc(x.fixtureId).set({ removed: { [t.id]: true } }, { merge: true }).catch(() => {}); },
      refreshDirectory() { return loadDirectory(); },
      addCoach(id, who) { teams().doc(id).update({ coaches: firebase.firestore.FieldValue.arrayUnion(who) }).catch(fail); },
      removeCoach(id, who) { teams().doc(id).update({ coaches: firebase.firestore.FieldValue.arrayRemove(who) }).catch(fail); },
      async signIn() {
        problem = '';
        try {
          if (native()) {
            const r = await nativeAuth().signInWithGoogle();
            await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(r.credential.idToken));
          } else {
            const provider = new firebase.auth.GoogleAuthProvider();
            try { await auth.signInWithPopup(provider); } catch (e) {
              // Browsers that block or can't open the popup sign in by leaving the page and coming back instead.
              if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) { await auth.signInWithRedirect(provider); return; }
              throw e;
            }
          }
        } catch (e) {
          if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(e.code)) return;
          problem = e.code === 'auth/unauthorized-domain'
            ? `Sign-in isn't turned on for ${location.hostname} yet. In the Firebase console, open Authentication, then Settings, then Authorized domains, and add ${location.hostname}.`
            : native() ? `Google sign-in didn't finish. (${e.code || e.message || e})` : `Sign-in didn't finish. (${e.code || e.message || e})`;
          settingsOpen = true;
          render();
        }
      },
      async signOut() { if (native()) await nativeAuth().signOut().catch(() => {}); await auth.signOut(); },
    };
  })();

  const sharedCss = document.createElement('style');
  sharedCss.textContent = Report.CSS + Report.FIELD_CSS;
  document.head.appendChild(sharedCss);
  Root = load();
  S = activeTeam();
  render();
  setTimeout(connect, 0);
})();
