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
