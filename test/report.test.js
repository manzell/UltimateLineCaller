// node test/report.test.js — checks the stat math and that the family report never carries private data.
const Report = require('../src/report.js');
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
const touch = (id) => ({ t: 'touch', id });
const pt = (lineup, on, result, events = [], subs = []) => ({ lineup, on, result, events, subs, roles: {}, startedAt: 0, endedAt: 180000 });

const points = [
  pt(['a', 'b', 'c', 'd'], 'O', 'us', [touch('a'), touch('b'), touch('c'), { t: 'assist', id: 'b' }, { t: 'goal', id: 'c' }]),
  pt(['a', 'b', 'c', 'e'], 'D', 'them', [touch('a'), touch('b'), { t: 'turn', id: 'b' }, touch('c'), touch('a')]),
  pt(['a', 'b', 'f', 'g'], 'D', 'us', [touch('b'), touch('a')], [{ out: 'g', in: 'h', at: 1 }]),
];

const t = Report.totals(points);
check(t.get('a').played === 3 && t.get('a').O === 1 && t.get('a').D === 2, 'points by O and D');
check(t.get('h').played === 1, 'a sub counts as playing the point');
check(t.get('c').goal === 1 && t.get('b').assist === 1 && t.get('b').turn === 1, 'stats counted');

const p = Report.passes(points);
check(p.get('a').get('b') === 2, 'a to b twice: ' + p.get('a').get('b'));
check(p.get('b').get('a') === 1, 'b to a once');
check(p.get('b').get('c') === 1, 'b to c once');
check(!p.has('c') || !p.get('c').has('a') || p.get('c').get('a') === 1, 'c to a once after a turnover');
check(!(p.get('b') && p.get('b').get('b')), 'nobody throws to themselves');

const pairs = Report.combos(points, [2]);
const ab = pairs.find((c) => c.ids.join() === 'a,b');
check(ab.pts === 3 && ab.scored === 2 && ab.allowed === 1 && ab.net === 1, 'pair record');
check(ab.O === 1 && ab.Owon === 1 && ab.D === 2 && ab.Dwon === 1, 'pair O and D record');
check(pairs.every((c) => c.pts > 1), 'only groups with more than one point');
check(!pairs.some((c) => c.ids.includes('d')), 'one-point players excluded');
const three = Report.combos(points, [3]);
check(three.length === 1 && three[0].ids.join() === 'a,b,c', 'three-player group');

const line = Report.lineScore(points, 'Us', 'Them');
check((line.match(/class="scored /g) || []).length === 3, 'one scored box per point');
check((line.match(/ off /g) || []).length === 3, 'one offense box per point');
check((line.match(/ break"/g) || []).length === 1, 'one break, on point 3');

// Box score formats points as total (offense/defense).
const box = Report.boxTable(points, ['a','b','c','d','e','f','g','h'].map((id) => ({ id, no: '1', name: id.toUpperCase() })));
check(box.includes('3 (1/2)'), 'points shown as total (O/D)');

// Throw targets against who was on the field.
{
  const pl = [['a','M'],['b','M'],['c','W'],['d','W'],['e','W']].map(([id, match]) => ({ id, match }));
  const ev = [];
  for (let i = 0; i < 5; i++) ev.push(touch('a'), touch('b'));
  const bias = Report.targetBias([pt(['a','b','c','d','e'], 'O', 'us', ev)], pl);
  const a = bias.find((x) => x.id === 'a');
  check(a.throws === 5 && a.share === 0 && Math.abs(a.expected - 0.75) < 1e-9 && a.gap < -0.7, 'target bias ' + JSON.stringify(a));
}
// Opponent turnovers end a possession and belong to nobody.
{
  const p2 = Report.passes([pt(['a','b'], 'O', 'us', [touch('a'), { t: 'oppturn' }, touch('b')])]);
  check(!p2.has('a'), 'no throw across an opponent turnover');
  check(![...Report.totals([pt(['a'], 'O', 'us', [{ t: 'oppturn' }])]).keys()].includes(undefined), 'opponent turnover not credited');
}

// Assists and goals are shown on their touches.
{
  const n = Report.narrative([touch('a'), touch('b'), touch('c'), { t: 'assist', id: 'b' }, { t: 'goal', id: 'c' }]);
  check(n.map((x) => x.id + (x.role ? ':' + x.role : '')).join() === 'a,b:assist,c:goal', 'narrative merge');
  check(n[2].idxs.join() === '2,4', 'merged item keeps its events');
  const opp = Report.narrative([touch('a'), { t: 'oppgoal' }]);
  check(opp.length === 2 && opp[1].t === 'oppgoal', 'opponent goal is its own item');
}

// Disc possession through a point.
{
  const base = { startedAt: 0, endedAt: 1000, lineup: ['a'], on: 'D', result: 'us' };
  const p = Report.possession({ ...base, events: [{ t: 'block', id: 'a', at: 200 }, { t: 'touch', id: 'a', at: 250 }, { t: 'touch', id: 'b', at: 300 }, { t: 'turn', sub: 'throw', id: 'b', at: 500 }, { t: 'oppturn', at: 800 }, { t: 'touch', id: 'c', at: 900 }] });
  check(p.segments.map((s) => s.side).join() === 'them,us,them,us', 'possession sides: ' + p.segments.map((s) => s.side));
  check(p.segments[1].from === 0.2 && p.segments[1].to === 0.5, 'times come from entry');
  check(p.marks.map((m) => m.label).join() === 'B,T,T', 'marks');
  check(p.catches === 1, 'catches');
  const late = Report.possession({ ...base, on: 'O', events: [{ t: 'turn', id: 'a', at: 5000 }, { t: 'block', id: 'a', at: 5000 }] });
  check(late.marks[0].pos < late.marks[1].pos && late.marks[1].pos < 1 && late.marks[0].pos > 0, 'entries without a usable time are spaced out');
  const int = Report.narrative([{ t: 'block', sub: 'int', id: 'a' }, touch('a'), touch('b')]);
  check(int.length === 2 && Report.label(int[0]) === 'Interception', 'interception shown once');
  const t2 = Report.totals([pt(['a'], 'O', 'us', [{ t: 'turn', sub: 'drop', id: 'a' }, { t: 'turn', sub: 'throw', id: 'a' }])]).get('a');
  check(t2.turn === 2 && t2.drop === 1, 'drop and throwaway counted');
}

// Opponent passes, who has the disc, and the printable scoresheet.
{
  const ev = [{ t: 'opppass' }, { t: 'opppass' }, { t: 'block', id: 'a' }, touch('a')];
  const n = Report.narrative(ev);
  check(n[0].t === 'opppass' && n[0].n === 2 && n.length === 3, 'opponent passes grouped');
  check(Report.holder({ on: 'D', events: [] }) === 'them' && Report.holder({ on: 'D', events: ev }) === 'us', 'disc holder');
  check(Report.holder({ on: 'O', events: [touch('a'), { t: 'turn', id: 'a' }] }) === 'them', 'turnover gives them the disc');
  const rows = 'abcdefghijklmnopqrstuvwxyz'.split('').map((id, i) => ({ id, name: 'Player ' + id + 'é(x)', no: String(i), match: i % 2 ? 'W' : 'M' }));
  const pts = Array.from({ length: 30 }, (_, i) => pt(['a', 'b', 'c'], i % 2 ? 'O' : 'D', i % 3 ? 'us' : 'them', [touch('a'), { t: 'assist', id: 'a' }, { t: 'goal', id: 'b' }]));
  const pdf = Report.scoresheetPdf({ title: 'Flyers vs Tigers', subtitle: 'Final', points: pts, rows, mixed: true });
  const s = String.fromCharCode(...pdf);
  check(s.startsWith('%PDF-1.4') && s.trim().endsWith('%%EOF') && (s.match(/\/Type \/Page /g) || []).length === 1, 'one-page PDF');
  check(s.includes('/MediaBox [0 0 792 612]'), 'landscape letter');
  check(s.includes('(#25)') && ![...s].some((ch) => ch.charCodeAt(0) > 255), 'jersey numbers with #, single-byte text');
  const xref = Number(s.match(/startxref\n(\d+)/)[1]);
  check(s.slice(xref, xref + 4) === 'xref', 'xref offset is right');
  const c = Report.combos([{ ...pts[1], startedAt: 0, endedAt: 60000 }, { ...pts[2], startedAt: 0, endedAt: 30000 }], [2]);
  check(c[0].ms === 90000, 'combo playtime together');
}

// Team stats, completions and playtime.
{
  const a = { lineup: ['a', 'b'], subs: [], roles: {}, startedAt: 0, endedAt: 100000 };
  const pts = [
    { ...a, on: 'O', result: 'us', events: [touch('a'), touch('b'), { t: 'assist', id: 'a' }, { t: 'goal', id: 'b' }] },
    { ...a, on: 'D', result: 'us', events: [{ t: 'opppass', at: 10000 }, { t: 'block', id: 'a', at: 50000 }, touch('a'), touch('b'), { t: 'assist', id: 'a' }, { t: 'goal', id: 'b' }] },
    { ...a, on: 'O', result: 'them', events: [touch('a'), { t: 'turn', sub: 'drop', id: 'b', at: 20000 }] },
    { ...a, on: 'D', result: 'them', events: [] },
  ];
  const s = Report.teamStats(pts);
  check(s.us.goals === 2 && s.us.holds === 1 && s.us.breaks === 1, 'our holds and breaks');
  check(s.them.goals === 2 && s.them.holds === 1 && s.them.breaks === 1, 'their holds and breaks');
  check(s.us.comp === 2 && s.them.comp === 1, 'completions: ' + s.us.comp + '/' + s.them.comp);
  check(s.us.oGoals === 1 && s.us.oPoss === 2 && s.us.dGoals === 1 && s.us.dPoss === 1, 'offense and defense possessions');
  check(s.us.clean === 1 && s.them.clean === 1, 'clean holds');
  check(s.us.turns === 1 && s.us.drops === 1 && s.them.turns === 1, 'turnovers');
  check(Math.round(s.us.ms + s.them.ms) === 400000, 'possession time adds up');
  const t = Report.totals(pts);
  check(t.get('a').comp === 2 && t.get('b').rec === 2 && t.get('a').ms === 400000, 'completions, receptions and playtime');
  const sub = Report.totals([{ ...a, on: 'O', result: 'us', subs: [{ out: 'b', in: 'c', at: 30000 }], events: [] }]);
  check(sub.get('b').ms === 30000 && sub.get('c').ms === 70000, 'sub playtime split');
  const html = Report.boxTable(pts, [{ id: 'a', name: 'A', no: '1' }, { id: 'b', name: 'B', no: '2' }], { sortable: true, sort: { key: 'rec', dir: -1 }, time: true });
  check(html.indexOf('>B<') < html.indexOf('>A<') && html.includes('data-a="box-sort"') && html.includes('6:40'), 'sortable box score with playtime');
}

// Team color on the possession bar, and arrows only for passes.
{
  const bar = Report.possessionBar({ startedAt: 0, endedAt: 10, on: 'O', events: [] }, '#ffcc00');
  check(bar.includes('background:#ffcc00') && bar.includes('color:#11183a'), 'team color with readable text');
  check(Report.possessionBar({ startedAt: 0, endedAt: 10, on: 'O', events: [] }, 'red;x').includes('#1f7a9c'), 'bad colors fall back');
  const tm = { team: 'T', color: '#123456', rules: { positions: [] }, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], schedule: [], history: [{ id: 'g', date: 1, us: 1, them: 0, perPlayer: { a: { played: 1 } }, points: [pt(['a', 'b'], 'D', 'us', [{ t: 'block', id: 'a' }, touch('a'), touch('b'), { t: 'goal', id: 'b' }])] }] };
  const page = Report.html(tm);
  check(page.includes('Block: A</b> · A → <b class="e-goal">Goal: B'), 'no arrow after a block: ' + (page.match(/rp-chain">[^\n]*/) || [''])[0].slice(0, 160));
}

// Possessions and turnovers line up, even with gaps in the log.
{
  const base = { lineup: ['a'], subs: [], roles: {}, startedAt: 0, endedAt: 60000 };
  const pts = [
    { ...base, on: 'O', result: 'them', events: [touch('a'), { t: 'turn', id: 'a' }, { t: 'turn', id: 'a' }] },
    { ...base, on: 'D', result: 'us', events: [{ t: 'block', id: 'a' }, { t: 'block', id: 'a' }, touch('a'), { t: 'goal', id: 'a' }] },
  ];
  const s = Report.teamStats(pts);
  check(s.them.oPoss + s.them.dPoss - s.them.goals === s.them.turns && s.us.oPoss + s.us.dPoss - s.us.goals === s.us.turns, 'turnovers match possessions');
  check(s.us.turns === 3 && s.them.turns === 3, 'turnovers: ' + s.us.turns + '/' + s.them.turns);
  const ls = Report.lineScore([{ ...base, endedAt: 30000, on: 'O', result: 'us' }, { ...base, endedAt: 120000, on: 'D', result: 'them' }, { ...base, on: 'O', result: 'us' }], 'Us', 'Them', { link: true });
  check(/width:56px/.test(ls) && /width:20px/.test(ls) && ls.includes('data-a="flow-point" data-v="1"'), 'point flow widths and links');
}

// A player's own record.
{
  const s = Report.playerSummary(points, 'a');
  check(s.plus === 2 && s.minus === 1 && s.O === 1 && s.Owon === 1 && s.D === 2 && s.Dwon === 1, 'player record');
  check(s.throwsTo[0][0] === 'b' && s.throwsTo[0][1] === 2, 'player throws to');
  check(s.catchesFrom.some(([id, n]) => id === 'b' && n === 1), 'player catches from');
}

// The report must be built from whitelisted fields only.
const team = {
  team: 'Flyers',
  rules: { positions: [{ id: 'H', name: 'SECRETPOSNAME', abbr: 'H', skill: 'h', floor: 77, O: { min: 3 }, D: { min: 2 } }], tagRules: [{ tag: 'SECRETTAGRULE' }] },
  players: [{ id: 'a', name: 'Ari', no: '7', h: 91, c: 92, d: 93, s: 94, tags: ['SECRETTAG'], target: 'SECRETTARGET', minPts: 88, aliases: 'SECRETALIAS', match: 'W', contacts: [{ name: 'SECRETPARENT', email: 'secret@parent.example' }] }],
  history: [{ id: 'g1', opponent: 'Riverside', date: 1e12, us: 15, them: 12, perPlayer: { a: { played: 9, O: 5, D: 4, ms: 87654321, touch: 3, goal: 1, assist: 0, turn: 0, block: 1, target: 'SECRETTARGET2', energy: 44 } }, points: [{ ...pt(['a'], 'O', 'us', [touch('a')]), avail: ['SECRETAVAIL'], secret: 'SECRETFIELD' }] }],
  schedule: [{ id: 's', date: '2026-12-01', time: '10:00', opponent: 'Tigers', location: 'Magnuson', notes: 'SECRETNOTE' }],
  game: { secret: 'SECRETGAME' },
};
const page = Report.html(team);
for (const leak of ['SECRET', 'secret@', '87654321', '>91<', '>92<', '>93<', '>94<', '>88<', '>77<', 'Fresh', 'target']) check(!page.includes(leak), 'report leaks ' + leak);
for (const want of ['Ari', 'Riverside', 'Season stats', 'Box score', 'Point flow', 'Tigers', '#game-g1', 'id="game-g1"']) check(page.includes(want), 'report missing ' + want);
check(!/<script/i.test(page), 'report has no scripts, so mail apps can open it');

console.log(failures ? failures + ' FAILURES' : 'Report checks passed');
process.exit(failures ? 1 : 0);
