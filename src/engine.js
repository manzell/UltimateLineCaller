/* Line Caller engine: pure functions, no DOM. Everything is derived by replaying the point log. */
const Engine = (() => {
  const MIN = 60000;
  const TARGETS = ['least', 'less', 'average', 'more', 'most'];
  const TARGET_WEIGHT = { least: 0.5, less: 0.75, average: 1, more: 1.25, most: 1.5 };
  const FLOOR_PENALTY = 40; // Must outweigh any playtime debt: a minimum only breaks when nobody qualifies.
  const TAG_PENALTY = 30;
  const MAX_POSITIONS = 6;

  // Win: the best seven, tiredness barely counts, playtime ignored.
  // Balanced: rotate everyone and keep skill high. Develop: freshest players and rookies first.
  const MODES = {
    develop: { play: 1, fresh: 6, skill: 0.15, behind: 0.6, rookie: 16 },
    balanced: { play: 2.4, fresh: 1, skill: 2, behind: 1, rookie: 0 },
    win: { play: 0, fresh: 0.4, skill: 10, behind: 0, rookie: 0, best: true, quiet: true },
    // Competitive: the top seven, resting a few each point so they still have legs at the end.
    competitive: { play: 1.2, fresh: 1.5, skill: 2, behind: 0, rookie: 0, comp: true, quiet: true },
  };
  const END_ENERGY = 45; // Competitive plans for the top seven to finish at least this fresh.
  const GAP_MIN = 1.5; // Typical minutes between points.
  const MAX_RESTING = 3;

  // Only minimums: any spots left over go to whoever fits best.
  const defaultPositions = () => [
    { id: 'H', name: 'Handler', abbr: 'H', skill: 'h', floor: 3, O: { min: 3 }, D: { min: 2 } },
    { id: 'C', name: 'Cutter', abbr: 'C', skill: 'c', floor: 2, O: { min: 0 }, D: { min: 0 } },
    { id: 'D', name: 'Defender', abbr: 'D', skill: 'd', floor: 2, O: { min: 0 }, D: { min: 0 } },
  ];

  const defaultRules = () => ({
    size: 7,
    division: 'open',
    ratioMode: 'abba',
    ratioStart: 'W',
    halfAt: 8,
    gameTo: 15,
    positions: defaultPositions(),
    tolerance: 2,
    maxStreak: 2,
    tags: ['Deep', 'Lockdown', 'Puller', 'Leader', 'Rookie'],
    tagRules: [
      { tag: 'Puller', min: 1, max: null, when: 'D' },
      { tag: 'Leader', min: 1, max: null, when: 'all' },
      { tag: 'Rookie', min: 0, max: 2, when: 'all' },
    ],
  });

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rate = (p, key) => (p[key] === undefined || p[key] === null ? 3 : p[key]);
  const weightOf = (p) => TARGET_WEIGHT[p.target] || 1;
  const minPointsOf = (p) => (p.minPts === undefined || p.minPts === null ? 2 : p.minPts);
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Each available player's expected points this point, summing to the line size. Nobody exceeds 1.
  function shares(players, size) {
    const out = new Map();
    let pool = players.slice();
    let left = Math.min(size, players.length);
    for (let guard = 0; guard < 10 && pool.length && left > 1e-9; guard++) {
      const sum = pool.reduce((a, p) => a + weightOf(p), 0);
      const capped = pool.filter((p) => (weightOf(p) / sum) * left >= 1);
      if (!capped.length) {
        pool.forEach((p) => out.set(p.id, (weightOf(p) / sum) * left));
        return out;
      }
      capped.forEach((p) => out.set(p.id, 1));
      left -= capped.length;
      pool = pool.filter((p) => !capped.includes(p));
    }
    return out;
  }

  function onFieldMs(point, id) {
    const start = point.startedAt;
    const end = point.endedAt;
    let ms = point.lineup.includes(id) ? end - start : 0;
    for (const s of point.subs || []) {
      if (s.out === id) ms -= end - s.at;
      if (s.in === id) ms += end - s.at;
    }
    return Math.max(0, ms);
  }

  const emptyStats = (id) => ({ id, played: 0, O: 0, D: 0, ms: 0, target: 0, energy: 100, streak: 0, touch: 0, goal: 0, assist: 0, turn: 0, drop: 0, block: 0 });

  // Replays the log into per-player totals: points, minutes, target, energy, streak, touches.
  function replay(game, players, rules, extraPoints) {
    const stats = new Map();
    for (const p of players) stats.set(p.id, emptyStats(p.id));
    const byId = new Map(players.map((p) => [p.id, p]));
    const points = extraPoints ? game.points.concat(extraPoints) : game.points;
    let prevEnd = null;
    for (const pt of points) {
      const availPlayers = pt.avail.map((id) => byId.get(id)).filter(Boolean);
      shares(availPlayers, rules.size).forEach((v, id) => { stats.get(id).target += v; });
      const gapMin = prevEnd === null ? 0 : clamp((pt.startedAt - prevEnd) / MIN, 0, 20);
      const durMin = clamp((pt.endedAt - pt.startedAt) / MIN, 0, 12);
      for (const p of players) {
        const s = stats.get(p.id);
        const stamina = rate(p, 's');
        const cost = 1.3 - (stamina - 1) * 0.15;
        const rec = 0.8 + (stamina - 1) * 0.1;
        s.energy = Math.min(100, s.energy + gapMin * 6 * rec);
        const ms = onFieldMs(pt, p.id);
        const everOn = pt.lineup.includes(p.id) || (pt.subs || []).some((x) => x.in === p.id);
        if (everOn) {
          const onMin = clamp(ms / MIN, 0, 12);
          s.played += 1;
          s[pt.on] += 1;
          s.ms += ms;
          s.streak += 1;
          s.energy -= (14 + 8 * onMin) * cost;
          s.energy += Math.max(0, durMin - onMin) * 10 * rec;
        } else {
          s.streak = 0;
          s.energy += durMin * 10 * rec;
        }
        s.energy = clamp(s.energy, 5, 100);
      }
      for (const ev of pt.events || []) { const s = stats.get(ev.id); if (s && s[ev.t] !== undefined) s[ev.t] += 1; if (s && ev.t === 'turn' && ev.sub === 'drop') s.drop += 1; }
      prevEnd = pt.endedAt;
    }
    return stats;
  }

  function score(game) {
    let us = 0, them = 0;
    for (const p of game.points) p.result === 'us' ? us++ : them++;
    return { us, them };
  }

  // What the next point is: O or D, which group gets the extra player, and how soon the game could end.
  function context(game, rules) {
    const points = game.points;
    const n = points.length;
    let on = game.startOn;
    let halftime = false;
    let us = 0, them = 0;
    points.forEach((p, i) => {
      const before = Math.max(us, them);
      p.result === 'us' ? us++ : them++;
      if (i === n - 1 && before < rules.halfAt && Math.max(us, them) >= rules.halfAt) halftime = true;
    });
    if (n) {
      on = points[n - 1].result === 'us' ? 'D' : 'O';
      if (halftime) on = game.startOn === 'O' ? 'D' : 'O';
    }
    let ratio = null;
    if (rules.division === 'mixed') {
      const a = rules.ratioStart;
      const b = a === 'W' ? 'M' : 'W';
      ratio = rules.ratioMode === 'abba' && ((n + 1) >> 1) % 2 === 1 ? b : a;
    }
    // Gendzone: the team starting in that endzone picks the ratio, and teams change ends every point.
    let caller = null;
    if (rules.division === 'mixed' && rules.ratioMode === 'gendzone') caller = (rules.gendzoneUs !== false) === (n % 2 === 0) ? 'us' : 'them';
    if (rules.division === 'mixed' && rules.ratioMode === 'call') caller = on === 'O' ? 'us' : 'them';
    return { on, ratio, caller, halftime, pointNo: n + 1, minLeft: Math.max(1, rules.gameTo - Math.max(us, them)) };
  }

  // Position minimums for a line of n players. Minimums that cannot all fit are reduced.
  function limitsFor(rules, on, n, fixedCounts) {
    const out = rules.positions.map((p) => ({
      id: p.id, floor: p.floor, skill: p.skill, name: p.name, max: n,
      min: Math.min(p[on].min, n), f: (fixedCounts && fixedCounts[p.id]) || 0,
    }));
    const needed = () => out.reduce((a, l) => a + Math.max(l.min, l.f), 0);
    while (needed() > n) {
      const big = out.filter((l) => l.min > l.f).sort((a, b) => b.min - a.min)[0];
      if (!big) break;
      big.min--;
    }
    return out;
  }

  // Finds the best way to give a set of players positions. Works through reachable position counts only.
  function makeAssigner(limits, n) {
    const k = limits.length;
    const mult = [], radix = [];
    let R = 1;
    for (let i = 0; i < k - 1; i++) { mult.push(R); radix.push(limits[i].max + 1); R *= limits[i].max + 1; }
    const sum = new Int16Array(R);
    for (let s = 0; s < R; s++) { let t = 0; for (let i = 0; i < k - 1; i++) t += Math.floor(s / mult[i]) % radix[i]; sum[s] = t; }
    const size = (n + 1) * R;
    const best = new Float64Array(size), stamp = new Int32Array(size), from = new Int8Array(size);
    let epoch = 0;
    return function run(line, rows, fixedIdx, withRoles) {
      epoch++;
      best[0] = 0; stamp[0] = epoch;
      let frontier = [0];
      for (let layer = 0; layer < line.length; layer++) {
        const next = [];
        const row = rows.get(line[layer].id);
        const fx = fixedIdx ? fixedIdx.get(line[layer].id) : undefined;
        for (let f = 0; f < frontier.length; f++) {
          const s = frontier[f];
          const v = best[layer * R + s];
          const last = layer - sum[s];
          for (let i = 0; i < k; i++) {
            if (fx !== undefined && fx !== i) continue;
            let ns = s;
            if (i < k - 1) {
              if (Math.floor(s / mult[i]) % radix[i] >= limits[i].max) continue;
              ns = s + mult[i];
            } else if (last >= limits[k - 1].max) continue;
            const idx = (layer + 1) * R + ns;
            const val = v + row[i];
            if (stamp[idx] !== epoch) { stamp[idx] = epoch; next.push(ns); best[idx] = val; from[idx] = i; } else if (val > best[idx]) { best[idx] = val; from[idx] = i; }
          }
        }
        frontier = next;
      }
      let top = -Infinity, end = -1;
      for (const s of frontier) {
        let ok = true;
        for (let i = 0; i < k - 1 && ok; i++) if (Math.floor(s / mult[i]) % radix[i] < limits[i].min) ok = false;
        if (ok && line.length - sum[s] < limits[k - 1].min) ok = false;
        if (!ok) continue;
        const v = best[line.length * R + s];
        if (v > top) { top = v; end = s; }
      }
      if (!withRoles) return top;
      const roles = {};
      if (end < 0) { line.forEach((p) => { roles[p.id] = fixedIdx && fixedIdx.has(p.id) ? limits[fixedIdx.get(p.id)].id : limits[0].id; }); return { total: top, roles }; }
      let s = end;
      for (let layer = line.length; layer > 0; layer--) {
        const i = from[layer * R + s];
        roles[line[layer - 1].id] = limits[i].id;
        if (i < k - 1) s -= mult[i];
      }
      return { total: top, roles };
    };
  }

  // Rough points left in the game, from the score so far and how the game has been going.
  function pointsLeft(game, rules, ctx) {
    const { us, them } = score(game);
    if (ctx.minLeft <= 1) return us === them ? 1 : 2; // Universe point is the last; game point may not be.
    const rate = (us + 4) / (us + them + 8); // Starts near even, so one early point barely moves it.
    return Math.max(1, Math.ceil(0.9 * Math.min((rules.gameTo - us) / rate, (rules.gameTo - them) / (1 - rate))));
  }
  function averagePointMinutes(game) {
    const done = game.points.filter((p) => p.endedAt > p.startedAt).map((p) => (p.endedAt - p.startedAt) / MIN);
    return done.length ? clamp(done.reduce((a, b) => a + b, 0) / done.length, 1.5, 6) : 3;
  }
  // The share of remaining points this player can play and still finish with energy left.
  function sustainableShare(p, s, left, minutes) {
    const stamina = rate(p, 's');
    const cost = 1.3 - (stamina - 1) * 0.15, rec = 0.8 + (stamina - 1) * 0.1;
    const spend = (14 + 8 * minutes) * cost, rest = minutes * 10 * rec, gap = GAP_MIN * 6 * rec;
    return clamp((s.energy + left * (gap + rest) - END_ENERGY) / (spend + rest) / left, 0, 1);
  }
  // Picks the top seven, then which of them should rest this point.
  function rotationPlan(game, players, rules, ctx, stats) {
    const neutral = new Map(players.map((p) => [p.id, emptyStats(p.id)]));
    const topModel = buildModel({ ...game, mode: 'win' }, players, rules, { ...ctx, on: 'O', neutral: true }, neutral);
    if (!topModel.avail.length) return null;
    const top = search(topModel, 1, 777)[0].line;
    const left = pointsLeft(game, rules, ctx), minutes = averagePointMinutes(game);
    const ranked = top.map((p) => ({ p, s: stats.get(p.id), share: sustainableShare(p, stats.get(p.id), left, minutes) }));
    // Taper so the last point is the full top seven.
    // A need of 2.4 rests means 2 most points and 3 some points, so it averages out exactly.
    const need = ranked.reduce((a, x) => a + (1 - x.share), 0);
    const paced = Math.floor(need * ctx.pointNo + 1e-9) - Math.floor(need * (ctx.pointNo - 1) + 1e-9);
    // In the last stretch, round up so legs are saved for the finish.
    const count = Math.min(clamp(left <= 8 ? Math.ceil(need) : paced, 0, MAX_RESTING), left - 1);
    ranked.sort((a, b) => a.s.energy - b.s.energy || b.s.streak - a.s.streak || (a.p.id < b.p.id ? -1 : 1));
    const benchExists = players.filter((p) => isPresent(game, p)).length > top.length;
    const sit = benchExists ? ranked.filter((x) => x.share < 1).slice(0, count).map((x) => x.p) : [];
    const sitIds = new Set(sit.map((p) => p.id));
    return { left, sit, sitIds, stay: new Set(top.filter((p) => !sitIds.has(p.id)).map((p) => p.id)) };
  }

  const isPresent = (game, p) => !(game.out && game.out[p.id]);

  function buildModel(game, players, rules, ctx, stats, fixed) {
    const m = MODES[game.mode] || MODES.balanced;
    const avail = players.filter((p) => isPresent(game, p));
    const size = Math.min(rules.size, avail.length);
    const fixedCounts = {};
    Object.values(fixed || {}).forEach((pos) => { fixedCounts[pos] = (fixedCounts[pos] || 0) + 1; });
    const limits = limitsFor(rules, ctx.on, size, fixedCounts);
    const sh = shares(avail, rules.size);
    const value = new Map(), rows = new Map();
    const plan = m.comp ? rotationPlan(game, players, rules, ctx, stats) : null;
    for (const p of avail) {
      const s = stats.get(p.id);
      const gap = s.target + (sh.get(p.id) || 0) * 0.5 - s.played;
      let v = 2 * m.play * clamp(gap, -4, 6);
      const owed = s.target - s.played;
      if (owed > rules.tolerance) v += (owed - rules.tolerance) * 6 * m.behind;
      if (owed < -rules.tolerance) v += (owed + rules.tolerance) * 3 * m.behind;
      v -= m.fresh * 6 * Math.pow(1 - s.energy / 100, 2);
      if (!m.best) {
        if (s.energy < 40) v -= 4;
        if (s.streak >= rules.maxStreak) v -= (s.streak - rules.maxStreak + 1) * 6;
        const need = minPointsOf(p) - s.played;
        if (need > 0) { v += 8 * Math.min(1, need / ctx.minLeft); if (need >= ctx.minLeft) v += 30; }
      }
      if (m.rookie && p.tags.some((t) => /rookie/i.test(t))) v += m.rookie;
      if (plan && plan.stay.has(p.id)) v = 25; else if (plan && plan.sitIds.has(p.id)) v = -25;
      value.set(p.id, v);
      rows.set(p.id, limits.map((l) => {
        const r = rate(p, l.skill);
        // Defense counts for more when we start the point on defense.
        const weight = l.skill === 'd' && !ctx.neutral ? (ctx.on === 'D' ? 1.2 : 0.7) : 1;
        return m.skill * weight * (r - 3) + 0.02 * r - (r < l.floor ? (l.floor - r) * FLOOR_PENALTY : 0);
      }));
    }
    const fixedIdx = new Map();
    Object.entries(fixed || {}).forEach(([id, pos]) => { const i = limits.findIndex((l) => l.id === pos); if (i >= 0) fixedIdx.set(id, i); });
    const tagRules = rules.tagRules.filter((t) => t.when === 'all' || t.when === ctx.on);
    return { m, plan, avail, size, limits, assign: makeAssigner(limits, size), value, rows, tagRules, rules, ctx, stats, fixedIdx, fixed: fixed || {} };
  }

  function lineScore(model, line) {
    let sum = model.assign(line, model.rows, model.fixedIdx, false);
    for (const p of line) sum += model.value.get(p.id);
    for (const t of model.tagRules) {
      const count = line.filter((p) => p.tags.includes(t.tag)).length;
      if (t.min && count < t.min) sum -= (t.min - count) * TAG_PENALTY;
      if (t.max !== null && t.max !== undefined && count > t.max) sum -= (count - t.max) * TAG_PENALTY;
    }
    return sum;
  }

  function groupNeeds(model, locksIn) {
    const { avail, size, ctx, rules } = model;
    if (!ctx.ratio) return { useGroups: false };
    const countW = avail.filter((p) => p.match === 'W').length;
    const countM = avail.length - countW;
    const major = Math.ceil(rules.size / 2), minor = Math.floor(rules.size / 2);
    let needW = ctx.ratio === 'W' ? major : minor;
    const lockedW = locksIn.filter((p) => p.match === 'W').length;
    const lockedM = locksIn.length - lockedW;
    needW = Math.max(needW, lockedW);
    needW = Math.min(needW, size - lockedM);
    needW = Math.min(needW, countW);
    if (size - needW > countM) needW = size - countM;
    return { useGroups: true, needW, needM: size - needW };
  }

  function search(model, count, seed) {
    const { avail, size, fixed } = model;
    const locksIn = avail.filter((p) => fixed[p.id]).slice(0, size);
    const pool = avail.filter((p) => !fixed[p.id]);
    const needs = groupNeeds(model, locksIn);
    const found = new Map();
    const random = rng(seed);
    const shuffled = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const lockedSet = new Set(locksIn.map((p) => p.id));
    const restarts = model.ctx.fast ? 6 : model.limits.length > 4 ? 12 : 24;
    for (let restart = 0; restart < restarts; restart++) {
      const line = locksIn.slice();
      const rest = shuffled(pool);
      const take = (pred, n) => {
        for (let i = 0; i < rest.length && n > 0;) {
          if (pred(rest[i])) { line.push(rest[i]); rest.splice(i, 1); n--; } else i++;
        }
      };
      if (needs.useGroups) {
        const haveW = locksIn.filter((p) => p.match === 'W').length;
        take((p) => p.match === 'W', needs.needW - haveW);
        take((p) => p.match !== 'W', needs.needM - (locksIn.length - haveW));
      }
      take(() => true, size - line.length);
      let cur = lineScore(model, line);
      for (let step = 0; step < 30; step++) {
        let bestDelta = 1e-9, bi = -1, bj = -1;
        for (let i = 0; i < line.length; i++) {
          if (lockedSet.has(line[i].id)) continue;
          for (let j = 0; j < rest.length; j++) {
            if (needs.useGroups && (rest[j].match === 'W') !== (line[i].match === 'W')) continue;
            const old = line[i];
            line[i] = rest[j];
            const delta = lineScore(model, line) - cur;
            line[i] = old;
            if (delta > bestDelta) { bestDelta = delta; bi = i; bj = j; }
          }
        }
        if (bi < 0) break;
        const t = line[bi]; line[bi] = rest[bj]; rest[bj] = t;
        cur += bestDelta;
        found.set(line.map((p) => p.id).sort().join('|'), { line: line.slice(), score: cur });
      }
      found.set(line.map((p) => p.id).sort().join('|'), { line: line.slice(), score: lineScore(model, line) });
    }
    return [...found.values()].sort((a, b) => b.score - a.score).slice(0, count);
  }

  const skillLabel = (rules, key) => {
    const base = { h: 'Handling', c: 'Cutting', d: 'Defense', s: 'Stamina' };
    if (base[key]) return base[key];
    const p = rules.positions.find((x) => x.skill === key);
    return p ? p.name : key;
  };

  function describe(model, line, score, partial) {
    const { rules, ctx, stats, avail, limits } = model;
    const useAssign = line.length === model.size ? model.assign : makeAssigner(limits, line.length);
    const useLimits = line.length === model.size ? limits : limitsFor(rules, ctx.on, line.length, Object.fromEntries(limits.map((l) => [l.id, l.f])));
    const assign = useLimits === limits ? useAssign : makeAssigner(useLimits, line.length);
    const fixedIdx = new Map();
    model.fixedIdx.forEach((i, id) => { const pos = limits[i].id; fixedIdx.set(id, useLimits.findIndex((l) => l.id === pos)); });
    const { roles } = assign(line, model.rows, fixedIdx, true);
    const warnings = [];
    for (const l of limits) {
      const inRole = line.filter((p) => roles[p.id] === l.id);
      const weak = inRole.filter((p) => rate(p, l.skill) < l.floor);
      if (weak.length) warnings.push(`${weak.map((p) => p.name).join(', ')} ${weak.length > 1 ? 'are' : 'is'} under your ${l.name.toLowerCase()} minimum of ${l.floor}.`);
      if (!partial) {
        const pos = rules.positions.find((p) => p.id === l.id)[ctx.on];
        if (inRole.length < pos.min && line.length === rules.size) warnings.push(`${inRole.length} at ${l.name.toLowerCase()}. You asked for at least ${pos.min}.`);
      }
    }
    if (!partial) {
      for (const t of model.tagRules) {
        const count = line.filter((p) => p.tags.includes(t.tag)).length;
        if (t.min && count < t.min && avail.some((p) => p.tags.includes(t.tag))) warnings.push(`No ${t.tag.toLowerCase()} on this line. Your rule asks for ${t.min}.`);
        if (t.max !== null && t.max !== undefined && count > t.max) warnings.push(`${count} ${t.tag.toLowerCase()}s on this line. Your rule allows ${t.max}.`);
      }
      if (ctx.ratio) {
        const w = line.filter((p) => p.match === 'W').length;
        const major = Math.ceil(rules.size / 2), minor = Math.floor(rules.size / 2);
        const wantW = ctx.ratio === 'W' ? major : minor;
        if (w !== wantW) warnings.push(`Ratio is off: ${w} women-matching and ${line.length - w} men-matching. This point calls for ${wantW} and ${rules.size - wantW}.`);
      }
      if (line.length < rules.size) warnings.push(`Only ${line.length} players available for ${rules.size} spots.`);
    }
    const onIds = new Set(line.map((p) => p.id));
    if (!model.m.quiet) for (const p of line) {
      const s = stats.get(p.id);
      if (s.streak >= rules.maxStreak) warnings.push(`${p.name} would play ${s.streak + 1} points in a row.`);
    }
    if (!partial) {
      for (const p of avail) {
        const s = stats.get(p.id);
        if (onIds.has(p.id)) continue;
        if (!model.m.quiet && s.target - s.played > rules.tolerance) warnings.push(`${p.name} is sitting and ${(s.target - s.played).toFixed(1)} points behind target.`);
        const need = minPointsOf(p) - s.played;
        if (need > 0 && need >= ctx.minLeft) warnings.push(`${p.name} still needs ${need} of a ${minPointsOf(p)}-point minimum, and the game could end in ${ctx.minLeft}.`);
      }
    }
    const mean = (arr, k) => arr.reduce((a, p) => a + rate(p, k), 0) / Math.max(1, arr.length);
    const strength = [];
    const seen = new Set();
    for (const l of limits) {
      if (seen.has(l.skill)) continue;
      seen.add(l.skill);
      strength.push({ key: l.skill, label: skillLabel(rules, l.skill), line: mean(line, l.skill), team: mean(avail, l.skill) });
    }
    const plan = model.plan ? { left: model.plan.left, rest: model.plan.sit.filter((p) => !onIds.has(p.id)).map((p) => p.name) } : null;
    return { ids: line.map((p) => p.id), roles, score, warnings, strength, plan };
  }

  function suggest(game, players, rules, opts) {
    const ctx = opts.ctx || context(game, rules);
    const stats = opts.stats || replay(game, players, rules);
    const model = buildModel(game, players, rules, ctx, stats, opts.fixed);
    if (!model.avail.length) return [];
    const res = search(model, opts.count || 6, 1000 + ctx.pointNo * 7);
    return res.map((r) => describe(model, r.line, r.score));
  }

  // Rates a line the coach built by hand. Pass fixed to keep the positions the coach chose.
  function evaluate(game, players, rules, ids, opts) {
    const ctx = opts.ctx || context(game, rules);
    const stats = opts.stats || replay(game, players, rules);
    const model = buildModel(game, players, rules, ctx, stats, opts.fixed);
    const byId = new Map(players.map((p) => [p.id, p]));
    const line = ids.map((id) => byId.get(id)).filter(Boolean);
    if (line.some((p) => !model.value.has(p.id))) return null;
    if (line.length === model.size) return describe(model, line, lineScore(model, line), opts.partial);
    return describe(model, line, 0, opts.partial);
  }

  // The line we would call next if the live point ended now with this result.
  function preview(game, players, rules, result, durMs) {
    const live = game.live;
    const finished = { ...live, endedAt: live.startedAt + durMs, result, subs: live.subs || [] };
    const sim = { ...game, points: game.points.concat([finished]), live: null };
    const best = suggest(sim, players, rules, { count: 1 })[0];
    return { ctx: context(sim, rules), line: best || null };
  }

  // For every point played, compares the line you called with what each priority would have called.
  function profileMatch(games, players, rules) {
    const modes = ['develop', 'balanced', 'competitive', 'win'];
    const sum = Object.fromEntries(modes.map((m) => [m, 0]));
    let n = 0;
    for (const g of games) {
      g.points.forEach((pt, i) => {
        const avail = new Set(pt.avail || players.map((p) => p.id));
        const out = Object.fromEntries(players.filter((p) => !avail.has(p.id)).map((p) => [p.id, true]));
        const called = pt.lineup.filter((id) => players.some((p) => p.id === id));
        if (!called.length) return;
        const base = { startOn: g.startOn || 'O', points: g.points.slice(0, i), out };
        const stats = replay(base, players, rules);
        const ctx = { ...context(base, rules), on: pt.on, ratio: pt.ratio === undefined ? null : pt.ratio, fast: true };
        for (const mode of modes) {
          const best = suggest({ ...base, mode }, players, rules, { ctx, stats, count: 1 })[0];
          if (best) sum[mode] += best.ids.filter((id) => called.includes(id)).length / called.length;
        }
        n++;
      });
    }
    return { n, list: modes.map((mode) => ({ mode, avg: n ? sum[mode] / n : 0 })).sort((a, b) => b.avg - a.avg) };
  }

  const fresh = (energy) => (energy >= 70 ? 'Fresh' : energy >= 40 ? 'OK' : 'Tired');

  /* ---------- Touch log ---------- */
  const BREAKS = new Set(['turn', 'block', 'goal', 'oppturn', 'oppgoal']);
  const NEEDS_DISC = new Set(['touch', 'assist', 'goal']);
  function chainOf(events) {
    const out = [];
    for (let i = events.length - 1; i >= 0; i--) {
      if (BREAKS.has(events[i].t)) break;
      out.unshift(events[i]);
    }
    return out;
  }
  // Adds one stat. A goal credits the scorer with a touch and the previous thrower with the assist.
  function addEvent(events, ev, at) {
    const before = events[events.length - 1];
    // We turned it over and now we have it again, so the other team must have given it back.
    if (before && before.t === 'turn' && NEEDS_DISC.has(ev.t)) events.push({ t: 'oppturn', at, implicit: true });
    const chain = chainOf(events);
    const touches = chain.filter((e) => e.t === 'touch');
    const lastTouch = touches[touches.length - 1];
    if (ev.t === 'touch') {
      if (lastTouch && lastTouch.id === ev.id) return;
      events.push({ t: 'touch', id: ev.id, at });
      return;
    }
    if (ev.t === 'assist') {
      if (!lastTouch || lastTouch.id !== ev.id) events.push({ t: 'touch', id: ev.id, at });
      events.push({ t: 'assist', id: ev.id, at });
      return;
    }
    if (ev.t === 'goal') {
      const hasAssist = chain.some((e) => e.t === 'assist');
      const prior = touches.filter((e) => e.id !== ev.id).pop();
      if (!lastTouch || lastTouch.id !== ev.id) events.push({ t: 'touch', id: ev.id, at });
      if (!hasAssist && prior) {
        const thrower = lastTouch && lastTouch.id !== ev.id ? lastTouch.id : prior.id;
        events.push({ t: 'assist', id: thrower, at, auto: true });
      }
      events.push({ t: 'goal', id: ev.id, at });
      return;
    }
    events.push({ t: ev.t, id: ev.id, at, ...(ev.sub ? { sub: ev.sub } : {}) });
    // An interception puts the disc straight in the defender's hands.
    if (ev.t === 'block' && ev.sub === 'int') events.push({ t: 'touch', id: ev.id, at });
  }

  // Rebuilds what the app filled in by itself after the coach reorders a point.
  function reflow(events) {
    const out = [];
    for (const ev of events) {
      if (ev.implicit || ev.auto) continue;
      const last = out[out.length - 1];
      if (last && last.t === 'turn' && NEEDS_DISC.has(ev.t)) out.push({ t: 'oppturn', at: ev.at, implicit: true });
      if (ev.t === 'goal') {
        const chain = chainOf(out);
        if (!chain.some((x) => x.t === 'assist')) {
          const prior = chain.filter((x) => x.t === 'touch' && x.id !== ev.id).pop();
          if (prior) out.push({ t: 'assist', id: prior.id, at: ev.at, auto: true });
        }
      }
      out.push(ev);
    }
    return out;
  }

  /* ---------- Understanding speech ---------- */
  function lev(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  const ratio = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);
  const soundKey = (s) => s.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/dg/g, 'j').replace(/gh/g, '').replace(/wr/g, 'r').replace(/kn/g, 'n').replace(/h(?![aeiouy])/g, '').replace(/[aeiouy]+/g, 'a').replace(/(.)\1+/g, '$1');
  const similar = (a, b) => (a === b ? 1 : Math.max(ratio(a, b), ratio(soundKey(a), soundKey(b)) * 0.92));
  const clean = (s) => s.toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const STOP = new Set('to too two throws throw threw throwing pass passes passed passing hits hit finds found swing swings swung dump dumps dumped huck hucks hucked catches catch caught then and over it the a an by up back from for with his her their he she they we our in on at is was were great nice ok okay number gets got has had um uh so now next of out one this that there get goes put puts line at as be are will who which just really good big huge awesome beautiful grab grabs snag snags reset resets dish dishes flick flicks backhand forehand hammer hammers around through into long short left right side end zone endzone field down disc frisbee me you i oh yeah like after getting off onto across again still another first'.split(' '));
  const TO_WORDS = new Set('to too two hits hit finds found over'.split(' '));
  const KW = new Map();
  for (const w of 'goal goals score scores scored scoring touchdown'.split(' ')) KW.set(w, 'goal');
  for (const w of 'throwaway throwaways turf turfed overthrow overthrew overthrown incomplete'.split(' ')) KW.set(w, 'throwaway');
  for (const w of 'turnover turnovers turn stall stalled fumble fumbled'.split(' ')) KW.set(w, 'turn');
  KW.set('oppturn', 'oppturn');
  for (const w of 'drop drops dropped bobbled missed'.split(' ')) KW.set(w, 'drop');
  for (const w of 'block blocks blocked d dee ds takeaway swat swats swatted'.split(' ')) KW.set(w, 'block');
  for (const w of 'interception interceptions intercept intercepted intercepts'.split(' ')) KW.set(w, 'int');
  for (const w of 'assist assists assisted'.split(' ')) KW.set(w, 'assist');

  // Common short forms. A shared start ("Jim" and "Jimmy") is handled separately.
  const NICKNAMES = ['jim jimmy james jamie', 'mike mikey mick mickey michael', 'bob bobby rob robby robbie robert', 'bill billy will willy william liam', 'rick ricky rich richie richard', 'jack johnny jon john', 'liz lizzie beth betsy eliza elizabeth', 'kate katie kat katherine catherine kathryn', 'tony anthony', 'ted teddy theo theodore', 'chuck charlie charles', 'matt matty matthew', 'dan danny daniel', 'dave davey david', 'tom tommy thomas', 'joe joey joseph', 'nick nicky nicholas nico', 'alex alexander alexandra lex', 'sam sammy samuel samantha', 'ben benny benjamin', 'ella ellie eleanor', 'maddie maddy madison madeline', 'abby abigail', 'zach zack zac zachary zak'].map((s) => s.split(' '));
  function nicknameScore(token, name) {
    if (token === name) return 1;
    if (NICKNAMES.some((g) => g.includes(token) && g.includes(name))) return 0.9;
    if (token.length >= 3 && name.length >= 3 && (name.startsWith(token) || token.startsWith(name))) return 0.86;
    return 0;
  }
  function variantsOf(p) {
    const list = [];
    const full = clean(p.name);
    const words = full.split(' ');
    list.push(full);
    if (words.length > 1) list.push(words[0]);
    if (p.aliases) p.aliases.split(',').map(clean).filter(Boolean).forEach((a) => list.push(a));
    return list.filter(Boolean);
  }
  function mentionAt(tokens, i, players, blocked) {
    let best = null, second = 0;
    for (let w = 2; w >= 1; w--) {
      if (i + w > tokens.length) continue;
      const slice = tokens.slice(i, i + w);
      const phrase = slice.join(' ');
      const joined = slice.join('');
      const anyBlocked = slice.some((t) => blocked.has(t));
      for (const p of players) {
        let top = 0;
        for (const v of variantsOf(p)) {
          const vw = v.split(' ').length;
          if (phrase === v) { top = 1; break; }
          if (anyBlocked || joined.length < 3) continue;
          if (vw === 1 && w === 1) top = Math.max(top, nicknameScore(phrase, v));
          if (vw === w) top = Math.max(top, similar(phrase, v));
          else if (w === 2 && vw === 1) top = Math.max(top, similar(joined, v));
        }
        if (top < 0.72) continue;
        if (!best || top > best.score + 1e-9 || (w > best.w && top >= best.score - 1e-9)) { if (best && best.p.id !== p.id) second = Math.max(second, best.score); best = { p, score: top, w }; } else if (best.p.id !== p.id) second = Math.max(second, top);
      }
      if (best && best.score === 1) break;
    }
    if (!best) return null;
    return { id: best.p.id, w: best.w, score: best.score, unsure: best.score < 0.8 || second >= best.score - 0.03 };
  }

  // "number twelve", "number twenty one" or "number 21".
  const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function jerseyAt(tokens, i, players) {
    const a = tokens[i], b = tokens[i + 1];
    if (a === undefined) return null;
    const find = (n) => players.find((x) => x.no !== '' && String(x.no) === String(n));
    if (/^\d+$/.test(a)) { const p = find(a); return p ? { p, w: 1 } : null; }
    const tens = TENS.indexOf(a);
    if (tens >= 2) {
      const unit = ONES.indexOf(b);
      if (unit >= 1 && unit <= 9) { const p = find(tens * 10 + unit); if (p) return { p, w: 2 }; }
      const p = find(tens * 10); return p ? { p, w: 1 } : null;
    }
    const one = ONES.indexOf(a);
    if (one >= 0) { const p = find(one); return p ? { p, w: 1 } : null; }
    return null;
  }

  // The words the recognizer listens for in roster mode: this team's names plus how coaches call plays.
  function speechVocabulary(players, positions) {
    const words = new Set(['[unk]', 'they', 'scored', 'score', 'threw', 'throw', 'throws', 'away', 'out', 'of', 'bounds', 'turned', 'turns', 'it', 'over', 'other', 'team', 'opponent', 'opponents', 'their', 'for', 'the', 'point', 'knocked', 'use', 'suggestion', 'suggested', 'clear', 'start', 'take', 'swap', 'switch', 'replace', 'sub', 'substitute', 'remove', 'bench', 'sit', 'in', 'number']);
    for (const w of KW.keys()) if (w !== 'oppturn') words.add(w);
    for (const w of STOP) words.add(w);
    ONES.concat(TENS).filter(Boolean).forEach((w) => words.add(w));
    for (const pos of positions) { const n = clean(pos.name); n.split(' ').forEach((w) => { words.add(w); words.add(w + 's'); }); }
    for (const p of players) {
      for (const v of variantsOf(p)) {
        v.split(' ').filter((w) => w.length > 1).forEach((w) => {
          words.add(w);
          NICKNAMES.filter((g) => g.includes(w)).forEach((g) => g.forEach((x) => words.add(x)));
        });
      }
    }
    return [...words];
  }

  function preparePlay(text) {
    return ` ${clean(text)} `
      .replace(/ (they|opponents?|other team|their( \w+)?)( \w+)? (turned it over|turn it over|turnover|dropped it|dropped|drop it|threw it away|throw it away|turfed it|turfed)( it)? /g, ' oppturn ')
      .replace(/ (opponent|other team) turnover /g, ' oppturn ')
      .replace(/ (turned|turns|turn) it over /g, ' turn ')
      .replace(/ for the point /g, ' goal ')
      .replace(/ knocked (it )?down /g, ' block ')
      .replace(/ picked (it )?off /g, ' intercepted ')
      .replace(/ (throw|threw|throws|thrown)( it)? away /g, ' throwaway ')
      .replace(/ (throw|threw|throws)( it)? out /g, ' throwaway ')
      .replace(/ out of bounds /g, ' throwaway ')
      .replace(/ they (scored|score|scores) /g, ' theyscored ')
      .replace(/ (they|other team) (got|get) (the )?(goal|point) /g, ' theyscored ')
      .replace(/ we (scored|score) /g, ' goal ')
      .trim().split(' ').filter(Boolean);
  }

  // "Ari throws to Lucie, Lucie to Kyle, Kyle to Mavis, goal" becomes a list of touches and stats.
  function parsePlay(text, players, opts) {
    const tokens = preparePlay(text);
    const seq = [], unknown = [];
    const blocked = new Set([...STOP, ...KW.keys(), 'theyscored']);
    let viaTo = false, viaBy = false, viaFrom = false;
    for (let i = 0; i < tokens.length;) {
      const t = tokens[i];
      if (t === 'number') {
        const j = jerseyAt(tokens, i + 1, players.concat((opts && opts.bench) || []));
        if (j) { seq.push({ k: 'p', id: j.p.id, via: viaTo, by: viaBy, unsure: false }); viaTo = viaBy = false; i += 1 + j.w; continue; }
      }
      // Prefer someone on the field. Only a clearly better match pulls a bench player in.
      let m = mentionAt(tokens, i, players, blocked);
      if (opts && opts.bench) {
        const off = mentionAt(tokens, i, opts.bench, blocked);
        if (off && (!m || off.score > m.score + 0.05)) m = off;
      }
      if (m && !(KW.has(t) && m.w === 1 && !players.some((p) => variantsOf(p).includes(t)))) {
        seq.push({ k: 'p', id: m.id, via: viaTo, by: viaBy, from: viaFrom, unsure: m.unsure });
        viaTo = viaBy = viaFrom = false; i += m.w; continue;
      }
      if (t === 'theyscored') seq.push({ k: 'they' });
      else if (KW.has(t)) seq.push({ k: KW.get(t) });
      else if (TO_WORDS.has(t)) viaTo = true;
      else if (t === 'by') viaBy = true;
      else if (t === 'from') viaFrom = true;
      else if (!STOP.has(t) && t.length >= 3) unknown.push(t);
      i++;
    }
    const events = opts && opts.holder ? [{ t: 'touch', id: opts.holder, seed: true }] : [];
    let theyScored = false, nameless = false;
    const lastTouchIdx = () => { for (let i = events.length - 1; i >= 0; i--) if (events[i].t === 'touch') return i; return -1; };
    const touch = (it) => { const l = events[events.length - 1]; if (l && l.t === 'touch' && l.id === it.id) return; events.push({ t: 'touch', id: it.id, unsure: it.unsure, via: it.via }); };
    for (let i = 0; i < seq.length; i++) {
      const it = seq[i], nx = seq[i + 1];
      if (it.k === 'p') {
        if (nx && (nx.k === 'block' || nx.k === 'int') && !(seq[i + 2] && seq[i + 2].k === 'p' && seq[i + 2].by)) { events.push({ t: 'block', id: it.id, unsure: it.unsure, ...(nx.k === 'int' ? { sub: 'int' } : {}) }); i++; continue; }
        if (nx && nx.k === 'assist') { events.push({ t: 'assist', id: it.id, unsure: it.unsure }); i++; continue; }
        touch(it);
      } else if (it.k === 'goal') {
        let credited = null;
        while (seq[i + 1] && seq[i + 1].k === 'p') {
          const next = seq[i + 1], then = seq[i + 2];
          const assistBelongsHere = then && then.k === 'assist' && !(seq[i + 3] && seq[i + 3].k === 'p');
          if (next.from || assistBelongsHere) { credited = next; i += assistBelongsHere ? 2 : 1; continue; }
          i++; touch(next);
        }
        if (!credited && seq[i + 1] && seq[i + 1].k === 'assist' && seq[i + 2] && seq[i + 2].k === 'p') { credited = seq[i + 2]; i += 2; }
        const li = lastTouchIdx();
        if (li >= 0) {
          const scorer = events[li];
          if (credited) events.splice(li, 0, { t: 'assist', id: credited.id, unsure: credited.unsure });
          events.push({ t: 'goal', id: scorer.id, unsure: scorer.unsure });
        } else nameless = true;
      } else if (it.k === 'throwaway' || it.k === 'turn' || it.k === 'drop') {
        if (nx && nx.k === 'p' && nx.by) { events.push({ t: 'turn', id: nx.id, unsure: nx.unsure }); i++; continue; }
        const li = lastTouchIdx();
        if (li < 0) continue;
        const holder = events[li];
        if (it.k === 'drop') { events.splice(li, 1); events.push({ t: 'turn', sub: 'drop', id: holder.id, unsure: holder.unsure }); } else if (it.k === 'throwaway' && holder.via && li > 0 && events[li - 1].t === 'touch') { events.splice(li, 1); events.push({ t: 'turn', sub: 'throw', id: events[li - 1].id, unsure: events[li - 1].unsure }); } else events.push({ t: 'turn', id: holder.id, unsure: holder.unsure, ...(it.k === 'throwaway' ? { sub: 'throw' } : {}) });
      } else if (it.k === 'block' || it.k === 'int') {
        if (nx && nx.k === 'p') { events.push({ t: 'block', id: nx.id, unsure: nx.unsure, ...(it.k === 'int' ? { sub: 'int' } : {}) }); i++; }
      } else if (it.k === 'assist') {
        if (nx && nx.k === 'p') { events.push({ t: 'assist', id: nx.id, unsure: nx.unsure }); i++; }
      } else if (it.k === 'oppturn') events.push({ t: 'oppturn' });
      else if (it.k === 'they') theyScored = true;
    }
    return { events, unknown, theyScored, nameless, hasGoal: events.some((e) => e.t === 'goal') || nameless };
  }

  function prepareLine(text) {
    return ` ${clean(text)} `
      .replace(/ use (the )?(suggestion|suggested( line)?) /g, ' usesuggestion ')
      .replace(/ (clear( the)?( line)?|start over) /g, ' clearline ')
      .replace(/ take out /g, ' remove ')
      .trim().split(' ').filter(Boolean);
  }

  // "Handlers Ari, Bea, Cal. Cutters Dee, Fen." or "Swap Bea for Cal" or just seven names.
  function parseLine(text, players, positions, opts) {
    const tokens = prepareLine(text);
    const posWords = new Map();
    positions.forEach((p) => { const n = clean(p.name); posWords.set(n, p.id); posWords.set(n + 's', p.id); });
    const CMD = new Map([['swap', 'swap'], ['switch', 'swap'], ['replace', 'swap'], ['sub', 'sub'], ['substitute', 'sub'], ['remove', 'remove'], ['bench', 'remove'], ['sit', 'remove'], ['out', 'out'], ['in', 'in']]);
    const blocked = new Set([...STOP, ...CMD.keys(), ...posWords.keys(), 'usesuggestion', 'clearline']);
    const seq = [], unknown = [];
    const out = { assign: [], remove: [], swaps: [], clear: false, useSuggestion: false, unknown };
    for (let i = 0; i < tokens.length;) {
      const t = tokens[i];
      if (t === 'usesuggestion') { out.useSuggestion = true; i++; continue; }
      if (t === 'clearline') { out.clear = true; i++; continue; }
      if (t === 'number') {
        const j = jerseyAt(tokens, i + 1, players);
        if (j) { seq.push({ k: 'p', id: j.p.id, unsure: false }); i += 1 + j.w; continue; }
      }
      const m = mentionAt(tokens, i, players, blocked);
      if (m) { seq.push({ k: 'p', id: m.id, unsure: m.unsure }); i += m.w; continue; }
      if (CMD.has(t)) { seq.push({ k: CMD.get(t) }); i++; continue; }
      let pos = posWords.get(t);
      if (!pos && t.length >= 4) for (const [w, id] of posWords) if (similar(t, w) >= 0.82) { pos = id; break; }
      if (pos) { seq.push({ k: 'pos', id: pos }); out.lastPos = pos; i++; continue; }
      if (!STOP.has(t) && t.length >= 3) unknown.push(t);
      i++;
    }
    const rest = [];
    for (let i = 0; i < seq.length; i++) {
      const it = seq[i], a = seq[i + 1], b = seq[i + 2];
      if (it.k === 'swap' && a && a.k === 'p' && b && b.k === 'p') { out.swaps.push({ out: a.id, in: b.id }); i += 2; continue; }
      if (it.k === 'sub' && a && a.k === 'p' && b && b.k === 'in' && seq[i + 3] && seq[i + 3].k === 'p') { out.swaps.push({ out: seq[i + 3].id, in: a.id }); i += 3; continue; }
      if (it.k === 'sub' && a && a.k === 'p' && b && b.k === 'p') { out.swaps.push({ out: b.id, in: a.id }); i += 2; continue; }
      if (it.k === 'remove') { while (seq[i + 1] && seq[i + 1].k === 'p') { i++; out.remove.push(seq[i].id); } continue; }
      if (it.k === 'p' && a && a.k === 'in' && b && b.k === 'p') { out.swaps.push({ out: b.id, in: it.id }); i += 2; continue; }
      if (it.k === 'p' && a && a.k === 'out') { out.remove.push(it.id); i++; continue; }
      if (it.k === 'p' || it.k === 'pos') rest.push(it);
    }
    const firstP = rest.findIndex((x) => x.k === 'p'), firstPos = rest.findIndex((x) => x.k === 'pos');
    const headingFirst = firstPos >= 0 && (firstP < 0 || firstPos < firstP);
    const push = (it, pos) => { if (!out.assign.some((a) => a.id === it.id)) out.assign.push({ id: it.id, pos, unsure: it.unsure }); };
    if (firstPos < 0) rest.forEach((it) => push(it, (opts && opts.pos) || null));
    else if (headingFirst) { let cur = null; rest.forEach((it) => { if (it.k === 'pos') cur = it.id; else push(it, cur); }); } else {
      let pending = [];
      rest.forEach((it) => { if (it.k === 'p') pending.push(it); else { pending.forEach((x) => push(x, it.id)); pending = []; } });
      pending.forEach((x) => push(x, null));
    }
    return out;
  }

  return { MIN, MAX_POSITIONS, TARGETS, defaultRules, defaultPositions, rate, replay, score, context, suggest, evaluate, preview, fresh, shares, limitsFor, skillLabel, addEvent, reflow, chainOf, profileMatch, speechVocabulary, parsePlay, parseLine, minPointsOf };
})();
if (typeof module !== 'undefined') module.exports = Engine;
