// node test/engine.test.js  — simulates whole games and checks lineups and speech parsing against the rules.
const E = require('../src/engine.js');
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
const R = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function roster(n, r, mixed) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'p' + i, name: 'P' + i, no: String(i), match: mixed ? (i % 2 ? 'W' : 'M') : 'M',
    h: i % 3 === 0 ? 4 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3),
    c: 2 + Math.floor(r() * 4), d: 2 + Math.floor(r() * 4), s: 1 + Math.floor(r() * 5),
    tags: [i === 1 || i === 2 ? 'Puller' : null, i % 5 === 0 ? 'Leader' : null, i % 4 === 3 ? 'Rookie' : null].filter(Boolean),
    target: 'average', minPts: 0,
  }));
}
function step(game, players, rules, best, ctx, t, dur, result) {
  game.points.push({ lineup: best.ids, on: ctx.on, ratio: ctx.ratio, avail: players.filter((p) => !game.out[p.id]).map((p) => p.id), startedAt: t, endedAt: t + dur, result, subs: [], events: [] });
}
function play(players, rules, mode, pts, r) {
  const game = { startOn: 'O', mode, points: [], out: {} };
  let t = 1e12; const lines = [];
  let totalMs = 0;
  for (let i = 0; i < pts; i++) {
    const ctx = E.context(game, rules);
    const t0 = process.hrtime.bigint();
    const best = E.suggest(game, players, rules, { ctx, count: 6 })[0];
    totalMs += Number(process.hrtime.bigint() - t0) / 1e6;
    lines.push({ ctx, best });
    const dur = (2 + r() * 3) * E.MIN;
    step(game, players, rules, best, ctx, t, dur, r() < 0.5 ? 'us' : 'them');
    t += dur + 1.5 * E.MIN;
  }
  return { game, lines, avgMs: totalMs / pts };
}

for (const [n, mixed, mode] of [[12, false, 'balanced'], [14, false, 'develop'], [14, true, 'balanced'], [20, true, 'balanced'], [14, false, 'win'], [24, false, 'balanced'], [14, false, 'competitive'], [14, true, 'competitive'], [20, false, 'competitive']]) {
  const r = R(n * 17 + mode.length);
  const players = roster(n, r, mixed);
  const rules = E.defaultRules(); if (mixed) rules.division = 'mixed';
  const { game, lines, avgMs } = play(players, rules, mode, 26, r);
  const label = `${n}p ${mixed ? 'mixed' : 'open'} ${mode}`;
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const { ctx, best } of lines) {
    check(new Set(best.ids).size === 7, label + ' seven distinct');
    for (const pos of rules.positions) {
      const c = Object.values(best.roles).filter((x) => x === pos.id).length;
      check(c >= pos[ctx.on].min, `${label} ${pos.id} count ${c}`);
    }
    if (mixed) check(best.ids.filter((id) => byId.get(id).match === 'W').length === (ctx.ratio === 'W' ? 4 : 3), label + ' ratio');
    for (const id of best.ids) if (best.roles[id] === 'H') check(byId.get(id).h >= 3, label + ' handler floor ' + id);
  }
  const stats = E.replay(game, players, rules);
  const pl = [...stats.values()].map((s) => s.played);
  const worst = Math.max(...[...stats.values()].map((s) => Math.abs(s.target - s.played)));
  console.log(label.padEnd(24), 'played', Math.min(...pl), '-', Math.max(...pl), ' worst gap', worst.toFixed(1), ' avg', avgMs.toFixed(1) + 'ms');
  if (mode === 'balanced') check(worst <= 3.01, label + ' fairness gap ' + worst);
}

// Seven weak throwers, all badly owed time, must still not be the line.
{
  const players = Array.from({ length: 14 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, match: 'M', h: i < 7 ? 1 : 4, c: 3, d: 3, s: 3, tags: [], target: 'average', minPts: 0 }));
  const rules = E.defaultRules(); rules.tagRules = [];
  const game = { startOn: 'O', mode: 'develop', out: {}, points: [] };
  let t = 1e12;
  for (let i = 0; i < 4; i++) { game.points.push({ lineup: players.slice(7).map((p) => p.id), on: 'O', avail: players.map((p) => p.id), startedAt: t, endedAt: t + 3 * E.MIN, result: 'them', subs: [] }); t += 4.5 * E.MIN; }
  const best = E.suggest(game, players, rules, {})[0];
  check(best.ids.filter((id) => +id.slice(1) >= 7).length >= 3, 'keeps 3 real handlers when weak throwers are owed time');
}

// Search quality against brute force, including flexible limits and a custom position.
{
  const r = R(99);
  let matched = 0; const trials = 30;
  for (let t = 0; t < trials; t++) {
    const players = roster(12, r, false);
    players.forEach((p) => { p.x = 1 + Math.floor(r() * 5); });
    const rules = E.defaultRules();
    if (t % 2) {
      rules.positions[1].O = { min: 1 }; rules.positions[1].D = { min: 1 };
      rules.positions.push({ id: 'X', name: 'Deep', abbr: 'Dp', skill: 'x', floor: 2, O: { min: 1 }, D: { min: 0 } });
    }
    const game = { startOn: 'O', mode: ['develop', 'balanced', 'win'][t % 3], out: {}, points: [] };
    const top = E.suggest(game, players, rules, {})[0];
    let best = -Infinity;
    const ids = players.map((p) => p.id);
    const pick = (start, cur) => {
      if (cur.length === 7) { const e = E.evaluate(game, players, rules, cur, {}); if (e.score > best) best = e.score; return; }
      for (let i = start; i < ids.length; i++) pick(i + 1, cur.concat(ids[i]));
    };
    pick(0, []);
    if (top.score >= best - 1e-6) matched++;
  }
  console.log(`search matched brute force in ${matched}/${trials}`);
  check(matched >= 28, 'search quality');
}

// Six positions with wide limits stay fast and legal.
{
  const r = R(21);
  const players = roster(22, r, false);
  const rules = E.defaultRules();
  rules.positions = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((name, i) => ({ id: 'q' + i, name, abbr: name[0], skill: 'h', floor: 1, O: { min: 0 }, D: { min: 1 } }));
  const game = { startOn: 'D', mode: 'balanced', out: {}, points: [] };
  const t0 = Date.now();
  const best = E.suggest(game, players, rules, {})[0];
  const ms = Date.now() - t0;
  console.log('six wide positions', ms + 'ms');
  check(ms < 1500, 'six positions speed');
  for (const pos of rules.positions) { const c = Object.values(best.roles).filter((x) => x === pos.id).length; check(c >= 1, 'six positions limits ' + c); }
}

// Flow of a game.
{
  const rules = E.defaultRules();
  const g = { startOn: 'O', points: [] };
  check(E.context(g, rules).on === 'O', 'start O');
  g.points.push({ result: 'us' }); check(E.context(g, rules).on === 'D', 'after we score we pull');
  g.points.push({ result: 'them' }); check(E.context(g, rules).on === 'O', 'after they score we receive');
  const c = E.context({ startOn: 'O', points: Array.from({ length: 8 }, () => ({ result: 'them' })) }, rules);
  check(c.halftime && c.on === 'D', 'second half flips');
  rules.division = 'mixed';
  const seq = Array.from({ length: 7 }, (_, n) => E.context({ startOn: 'O', points: Array(n).fill({ result: 'us' }) }, { ...rules, halfAt: 99 }).ratio).join('');
  check(seq === 'WMMWWMM', 'ABBA sequence ' + seq);
}

// Placed players stay where the coach put them; absences respected; short bench warns.
{
  const r = R(3);
  const players = roster(14, r, false);
  const rules = E.defaultRules();
  const game = { startOn: 'D', mode: 'balanced', out: { p4: true }, points: [] };
  const best = E.suggest(game, players, rules, { fixed: { p9: 'D', p7: 'C' } })[0];
  check(best.roles.p9 === 'D' && best.roles.p7 === 'C', 'placed players keep positions');
  check(!best.ids.includes('p4'), 'absent player left out');
  const over = E.suggest(game, players, rules, { fixed: { p1: 'D', p2: 'D', p3: 'D', p5: 'D', p6: 'D' } })[0];
  check(Object.values(over.roles).filter((x) => x === 'D').length === 5, 'coach can overfill a position');
  const short = E.suggest({ startOn: 'O', mode: 'balanced', out: {}, points: [] }, players.slice(0, 5), rules, {})[0];
  check(short.ids.length === 5 && short.warnings.some((w) => w.includes('Only 5')), 'short bench warns');
}

// Playtime weights and per-player minimums.
{
  const r = R(8);
  const players = roster(14, r, false);
  players[1].target = 'most'; players[2].target = 'least';
  const sh = E.shares(players, 7);
  check(sh.get('p1') / sh.get('p2') === 3, 'most is three times least');
  check(Math.abs([...sh.values()].reduce((a, b) => a + b, 0) - 7) < 1e-9, 'shares sum to line size');

  players.forEach((p) => { p.h = 4; p.c = 4; p.d = 4; p.tags = []; p.minPts = 0; p.target = 'least'; });
  const benched = { ...players[5], id: 'low', name: 'Low', h: 1, c: 2, d: 2, target: 'least', minPts: 3 };
  const all = players.concat(benched);
  const run = (mode) => {
    const rules = E.defaultRules();
    const game = { startOn: 'O', mode, out: {}, points: [] };
    let t = 1e12, played = 0;
    for (let i = 0; i < 26; i++) {
      const ctx = E.context(game, rules);
      const best = E.suggest(game, all, rules, { ctx, count: 1 })[0];
      if (best.ids.includes('low')) played++;
      step(game, all, rules, best, ctx, t, 3 * E.MIN, 'us');
      t += 4.5 * E.MIN;
      if (E.score(game).us >= 15) break;
    }
    return played;
  };
  const bal = run('balanced'), win = run('win');
  console.log('3-point minimum on the weakest player: balanced', bal, ' win', win);
  check(bal >= 3, 'minimum honoured in Balanced');
  check(win === 0, 'Win ignores the minimum and plays the best seven');
}

// The three priorities must produce different kinds of lines.
{
  const r = R(44);
  const players = roster(16, r, false);
  players.forEach((p, i) => { p.tags = i % 4 === 3 ? ['Rookie'] : []; p.minPts = 2; });
  const rules = E.defaultRules(); rules.tagRules = [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const summary = {};
  for (const mode of ['win', 'balanced', 'develop']) {
    const rr = R(9);
    const { game, lines } = play(players, rules, mode, 26, rr);
    const stats = E.replay(game, players, rules);
    const pl = [...stats.values()].map((s) => s.played);
    const skill = lines.reduce((a, l) => a + l.best.ids.reduce((b, id) => b + Math.max(byId.get(id).h, byId.get(id).c, byId.get(id).d), 0) / 7, 0) / lines.length;
    const rookies = lines.reduce((a, l) => a + l.best.ids.filter((id) => byId.get(id).tags.includes('Rookie')).length, 0) / lines.length;
    summary[mode] = { skill, rookies, spread: Math.max(...pl) - Math.min(...pl), core: pl.slice().sort((a, b) => b - a).slice(0, 9).reduce((a, b) => a + b, 0) / pl.reduce((a, b) => a + b, 0), lines: new Set(lines.map((l) => l.best.ids.slice().sort().join())).size };
    console.log(mode.padEnd(9), 'avg best rating', skill.toFixed(2), ' rookies/line', rookies.toFixed(2), ' spread', summary[mode].spread, ' distinct lines', summary[mode].lines);
  }
  check(summary.win.skill > summary.balanced.skill, 'Win is more skilled than Balanced');
  check(summary.balanced.skill > summary.develop.skill, 'Balanced is more skilled than Develop');
  check(summary.develop.rookies > summary.balanced.rookies + 0.3, 'Develop plays more rookies');
  check(summary.balanced.spread < summary.win.spread, 'Balanced rotates more than Win');
  check(summary.win.core >= 0.9, 'Win keeps calling nearly the same players: ' + summary.win.core);
}

// Competitive: an A line that rotates about two out, and gets fuller as the game ends.
{
  const mk = (id, v, s) => ({ id, name: id, match: 'M', h: v, c: v, d: v, s, tags: [], target: 'average', minPts: 2 });
  const stars = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => mk(id, 5, 3 + (i % 3)));
  const subs = ['h', 'i', 'j', 'k', 'l', 'm', 'n'].map((id) => mk(id, 3, 4));
  const all = stars.concat(subs);
  const rules = E.defaultRules(); rules.tagRules = [];
  const run = (mode) => {
    const game = { startOn: 'O', mode, out: {}, points: [] };
    let t = 1e12; const counts = [], lefts = [];
    for (let i = 0; i < 40; i++) {
      const ctx = E.context(game, rules);
      const best = E.suggest(game, all, rules, { ctx, count: 1 })[0];
      counts.push(best.ids.filter((id) => 'abcdefg'.includes(id)).length);
      if (best.plan) lefts.push(best.plan.left);
      step(game, all, rules, best, ctx, t, 3 * E.MIN, i % 2 ? 'us' : 'them');
      t += 4.5 * E.MIN;
      const sc = E.score(game);
      if (sc.us >= 15 || sc.them >= 15) break;
    }
    // Energy going into the final point, which is what the rotation is saving them for.
    const st = E.replay({ ...game, points: game.points.slice(0, -1) }, all, rules);
    const end = stars.map((p) => st.get(p.id).energy);
    return { counts, lefts, endAvg: end.reduce((a, b) => a + b, 0) / 7, endMin: Math.min(...end), benchPts: subs.map((p) => st.get(p.id).played), points: game.points.length };
  };
  const comp = run('competitive'), win = run('win');
  const mid = comp.counts.slice(2, -4);
  const avgOn = mid.reduce((a, b) => a + b, 0) / mid.length;
  console.log('competitive A-players on line:', comp.counts.join(''), ' avg mid-game', avgOn.toFixed(2), ' predicted left', comp.lefts.slice(0, 3).join(), '...', comp.lefts.slice(-3).join());
  console.log('final A-line energy  avg/min: competitive', comp.endAvg.toFixed(0), comp.endMin.toFixed(0), ' win', win.endAvg.toFixed(0), win.endMin.toFixed(0), ' bench points', comp.benchPts.join());
  check(avgOn >= 4.5 && avgOn <= 5.6, 'about two of the A line rest each point: ' + avgOn);
  check(comp.counts[comp.counts.length - 1] >= 6, 'A line is nearly whole at the end');
  check(comp.endAvg > win.endAvg + 15, 'A line finishes fresher than in Win');
  check(comp.endAvg >= 40, 'A line goes into the final point with energy left: ' + comp.endAvg);
  check(comp.benchPts.every((x) => x >= 2), 'bench players get minimums');
  check(comp.lefts[0] > comp.lefts[comp.lefts.length - 1], 'predicted game length shrinks');
}

// Develop picks the fresh player over the tired one, Win does not care.
{
  const mk = (id, v, s) => ({ id, name: id, match: 'M', h: v, c: v, d: v, s, tags: [], target: 'average', minPts: 0 });
  const stars = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => mk(id, 5, 1));
  const subs = ['h', 'i', 'j', 'k', 'l', 'm', 'n'].map((id) => mk(id, 3, 5));
  const all = stars.concat(subs);
  const rules = E.defaultRules(); rules.tagRules = [];
  const mkGame = (mode) => { const g = { startOn: 'O', mode, out: {}, points: [] }; let t = 1e12; for (let i = 0; i < 2; i++) { g.points.push({ lineup: stars.map((p) => p.id), on: 'O', avail: all.map((p) => p.id), startedAt: t, endedAt: t + 4 * E.MIN, result: 'them', subs: [] }); t += 5 * E.MIN; } return g; };
  const count = (mode) => E.suggest(mkGame(mode), all, rules, {})[0].ids.filter((id) => 'abcdefg'.includes(id)).length;
  console.log('tired stars on the line: win', count('win'), ' balanced', count('balanced'), ' develop', count('develop'));
  check(count('win') === 7, 'Win keeps tired stars');
  check(count('develop') <= 2, 'Develop rests tired stars');
}

// Profile match: a game called by one priority should look most like that priority.
{
  const r = R(61);
  const players = roster(14, r, false);
  players.forEach((p, i) => { p.tags = i % 4 === 3 ? ['Rookie'] : []; });
  const rules = E.defaultRules(); rules.tagRules = [];
  for (const mode of ['win', 'competitive', 'balanced', 'develop']) {
    const rr = R(12);
    const { game } = play(players, rules, mode, 18, rr);
    const t0 = Date.now();
    const m = E.profileMatch([game], players, rules);
    console.log('called as', mode.padEnd(11), '->', m.list.map((x) => `${x.mode} ${(x.avg * 100).toFixed(0)}%`).join('  '), (Date.now() - t0) + 'ms');
    check(m.list[0].mode === mode, `profile match found ${m.list[0].mode} for a ${mode} game`);
  }
}

// Touch log.
{
  const ev = [];
  E.addEvent(ev, { t: 'touch', id: 'a' }, 1); E.addEvent(ev, { t: 'oppturn' }, 2); E.addEvent(ev, { t: 'touch', id: 'b' }, 3); E.addEvent(ev, { t: 'goal', id: 'b' }, 4);
  check(!ev.some((e) => e.t === 'assist'), 'no assist across an opponent turnover');
}
{
  const ev = [];
  ['a', 'b', 'b', 'c'].forEach((id) => E.addEvent(ev, { t: 'touch', id }, 1));
  check(ev.length === 3, 'repeat tap ignored');
  E.addEvent(ev, { t: 'goal', id: 'd' }, 2);
  const s = ev.map((e) => e.t + ':' + e.id).join(' ');
  check(s === 'touch:a touch:b touch:c touch:d assist:c goal:d', 'goal adds touch and assist: ' + s);
  const ev2 = [];
  E.addEvent(ev2, { t: 'touch', id: 'a' }, 1); E.addEvent(ev2, { t: 'touch', id: 'b' }, 1); E.addEvent(ev2, { t: 'goal', id: 'b' }, 2);
  check(ev2.map((e) => e.t + ':' + e.id).join(' ') === 'touch:a touch:b assist:a goal:b', 'goal on last toucher credits previous thrower');
}

// Speech: the names here are spelled the way a phone is likely to mishear them.
{
  const people = ['Ariyeh', 'Lucie', 'Kyle', 'Mavis', 'Bea T.', 'Cal R.', 'Jo'].map((name, i) => ({ id: 'x' + i, name, no: String(i + 10), aliases: name === 'Jo' ? 'joey' : '' }));
  const show = (r) => r.events.map((e) => (e.id ? `${e.t}:${people.find((p) => p.id === e.id).name.split(' ')[0]}` : e.t)).join(' ');
  const cases = [
    ['Ariyeh throws to Lucie, Lucie Throws to Kyle, Kyle to Mavis, Goal', 'touch:Ariyeh touch:Lucie touch:Kyle touch:Mavis goal:Mavis'],
    ['Aria throws to Lucy. Lucy to Kyle. Kyle to Mavis. Goal.', 'touch:Ariyeh touch:Lucie touch:Kyle touch:Mavis goal:Mavis'],
    ['Bea to Cal, Cal drops it', 'touch:Bea turn:Cal'],
    ['Bea to Cal, throw away', 'touch:Bea turn:Bea'],
    ['Joey turnover', 'touch:Jo turn:Jo'],
    ['Block by Kyle, Kyle to Bea, Bea to Mavis, Mavis scores', 'block:Kyle touch:Kyle touch:Bea touch:Mavis goal:Mavis'],
    ['Mavis got the block', 'block:Mavis'],
    ['number 12 to number 13', 'touch:Kyle touch:Mavis'],
    ['Lucie to Kyle goal Mavis', 'touch:Lucie touch:Kyle touch:Mavis goal:Mavis'],
  ];
  for (const [text, want] of cases) { const got = show(E.parsePlay(text, people)); check(got === want, `"${text}" -> ${got}`); }
  check(E.parsePlay('Bea to Cal, they scored', people).theyScored, 'they scored');
  check(E.parsePlay('Bea to Bob the wizard', people).unknown.includes('wizard'), 'unknown words reported');

  const pos = E.defaultPositions().concat({ id: 'X', name: 'Deep', abbr: 'Dp', skill: 'x', floor: 1, O: { min: 0 }, D: { min: 0 } });
  const a = E.parseLine('Handlers Ariyeh, Lucie, Kyle. Cutters Mavis, Bea, Deep Cal', people, pos);
  check(a.assign.map((x) => x.pos).join() === 'H,H,H,C,C,X', 'headings ' + a.assign.map((x) => x.pos).join());
  const b = E.parseLine('Lucie handler, Kyle cutter', people, pos);
  check(b.assign[0].pos === 'H' && b.assign[1].pos === 'C', 'trailing positions');
  const c = E.parseLine('Swap Lucie for Kyle', people, pos);
  check(c.swaps[0].out === 'x1' && c.swaps[0].in === 'x2', 'swap');
  const d = E.parseLine('Kyle in for Lucie and take out Mavis', people, pos);
  check(d.swaps[0].in === 'x2' && d.swaps[0].out === 'x1' && d.remove[0] === 'x3', 'in for and take out');
  check(E.parseLine('use the suggested line', people, pos).useSuggestion, 'use suggestion');
  check(E.parseLine('clear the line', people, pos).clear, 'clear');
  check(E.parseLine('Ariyeh Lucie Kyle', people, pos).assign.every((x) => x.pos === null), 'plain list');
}

// Natural speech with nicknames, on a roster like the coach's.
{
  const crew = ['Jimmy', 'Mickey', 'Robin', 'Lucie', 'Kyle', 'Mavis', 'Zac'].map((name, i) => ({ id: 'n' + i, name, no: String(i + 20), aliases: '' }));
  const say = (text, opts) => E.parsePlay(text, crew, opts);
  const str = (r) => r.events.filter((e) => !e.seed).map((e) => (e.id ? `${e.t}:${crew.find((p) => p.id === e.id).name}` : e.t)).join(' ');
  const coded = (text) => { const ev = []; say(text).events.forEach((x) => E.addEvent(ev, x, 1)); return ev.map((x) => `${x.t}:${crew.find((p) => p.id === x.id).name}`).join(' '); };
  const want = 'touch:Jimmy touch:Mickey touch:Robin assist:Mickey goal:Robin';
  check(coded('jimmy to mickey to robin, goal') === want, 'Coach sentence one: ' + coded('jimmy to mickey to robin, goal'));
  check(coded('Jim to Mickey to Robin, score') === want, 'Coach sentence two: ' + coded('Jim to Mickey to Robin, score'));
  const natural = [
    ['Jimmy throws it over to Mick, Mick finds Robin in the end zone for the score', want.replace(' assist:Mickey', '')],
    ['ok so Jim hits Mickey and then Mickey puts it up to Robin who scores', want.replace(' assist:Mickey', '')],
    ['Robin scores from Mickey', 'assist:Mickey touch:Robin goal:Robin'],
    ['goal Robin, assist Mickey', 'assist:Mickey touch:Robin goal:Robin'],
    ['Robin goal Mickey assist', 'assist:Mickey touch:Robin goal:Robin'],
    ['great layout D by Kyle', 'block:Kyle'],
    ['Lucie got a huge block', 'block:Lucie'],
    ['Zac threw it away', 'touch:Zac turn:Zac'],
    ['Mavis dropped it', 'turn:Mavis'],
    ['they dropped it', 'oppturn'],
    ['the other team turned it over', 'oppturn'],
    ['Lucie swings it to Kyle then a dump back to Lucie', 'touch:Lucie touch:Kyle touch:Lucie'],
  ];
  let ok = 0;
  for (const [text, expected] of natural) { const got = str(say(text)); if (got === expected) ok++; else console.log('  natural miss:', JSON.stringify(text), '->', got); }
  console.log(`natural phrasing: ${ok}/${natural.length}`);
  check(ok === natural.length, 'natural phrasing');
  // Open mic: a phrase can lean on who had the disc in the phrase before.
  const r1 = say('dropped it', { holder: 'n4' });
  check(str(r1) === 'turn:Kyle', 'drop continues from the last holder: ' + str(r1));
  const r2 = say('goal', { holder: 'n2' });
  check(str(r2) === 'goal:Robin', 'bare goal credits the last holder: ' + str(r2));
  check(say('nice throw there coach').events.length === 0, 'chatter adds nothing');
  check(say('they scored').theyScored, 'they scored');
  const numbered = crew.map((p) => ({ ...p }));
  numbered[0].no = '21'; numbered[1].no = '7'; numbered[2].no = '30';
  const heardNums = E.parsePlay('number twenty one to number seven to number thirty', numbered).events.map((e) => numbered.find((p) => p.id === e.id).name).join();
  check(heardNums === 'Jimmy,Mickey,Robin', 'spoken jersey numbers: ' + heardNums);
  const vocab = E.speechVocabulary(crew.concat({ id: 'x', name: 'Bea T.', no: '', aliases: 'bee, beatrice' }), E.defaultPositions());
  for (const w of ['[unk]', 'jimmy', 'jim', 'james', 'mickey', 'mick', 'robin', 'bea', 'bee', 'beatrice', 'goal', 'score', 'block', 'handlers', 'twenty']) check(vocab.includes(w), 'vocabulary has ' + w);
  check(!vocab.includes('t') && new Set(vocab).size === vocab.length && !vocab.includes('oppturn'), 'vocabulary is clean');
}

console.log(failures ? failures + ' FAILURES' : 'All checks passed');
process.exit(failures ? 1 : 0);
