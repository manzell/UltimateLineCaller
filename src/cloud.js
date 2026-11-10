/* Line Caller sync logic: what to upload and how to apply what arrives. No Firebase calls here, so it can be tested.
   Each team is split into its setup, its game in progress, and one record per finished game.
   Editing the roster on a desktop therefore can't overwrite a game being recorded on a phone. */
const Cloud = (() => {
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return h >>> 0; };
  const LOCAL_ONLY = ['game', 'history', 'setup', 'syncAt', 'syncHash', 'isExample', 'lastFinal', 'access', 'rsvpAnswers', 'rsvpHash'];
  function infoOf(team) {
    const out = {};
    Object.keys(team).filter((k) => !LOCAL_ONLY.includes(k)).sort().forEach((k) => { out[k] = team[k]; });
    return out;
  }
  const BLANK_DRAFT = () => ({ alt: 0, on: null, ratio: null, line: {}, plan: null });
  // The running point and the next line are separate records, so one coach can log while another calls lines.
  function gameOf(team) {
    if (!team.game) return null;
    const out = {};
    Object.keys(team.game).filter((k) => k !== 'live' && k !== 'draft').sort().forEach((k) => { out[k] = team.game[k]; });
    return out;
  }
  const canonical = (team, kind, key) => JSON.stringify(
    kind === 'team' ? infoOf(team) : kind === 'game' ? gameOf(team)
      : kind === 'live' ? (team.game ? team.game.live || null : null)
        : kind === 'draft' ? (team.game ? team.game.draft || null : null)
          : team.history.find((h) => h.id === key));
  function partsOf(team) {
    return [
      { id: `t_${team.id}`, kind: 'team', teamId: team.id, key: null },
      { id: `g_${team.id}`, kind: 'game', teamId: team.id, key: null },
      { id: `l_${team.id}`, kind: 'live', teamId: team.id, key: null },
      { id: `d_${team.id}`, kind: 'draft', teamId: team.id, key: null },
      ...team.history.map((h) => ({ id: `h_${team.id}_${h.id}`, kind: 'hist', teamId: team.id, key: h.id })),
    ];
  }
  const ready = (team) => { team.syncAt = team.syncAt || {}; team.syncHash = team.syncHash || {}; return team; };

  // Everything that changed since the last upload.
  function outgoing(root, known, now) {
    const writes = [], current = new Set();
    for (const team of root.teams) {
      if (team.isExample) continue;
      ready(team);
      for (const part of partsOf(team)) {
        current.add(part.id);
        const json = canonical(team, part.kind, part.key), h = hash(json);
        if (team.syncHash[part.id] === h) continue;
        if (team.syncHash[part.id] === undefined && json === 'null') continue;
        team.syncHash[part.id] = h;
        team.syncAt[part.id] = now;
        writes.push({ id: part.id, data: { kind: part.kind, teamId: part.teamId, key: part.key, json, at: now } });
      }
    }
    const deletes = [...known].filter((id) => !current.has(id));
    deletes.forEach((id) => known.delete(id));
    writes.forEach((w) => known.add(w.id));
    return { writes, deletes };
  }

  // Applies one record from the cloud. Returns true if anything on this device changed.
  function incoming(root, change, known, makeTeam) {
    const { type, id, data } = change;
    if (type === 'removed') {
      known.delete(id);
      if (id.startsWith('t_')) {
        const before = root.teams.length;
        root.teams = root.teams.filter((t) => t.id !== id.slice(2));
        return root.teams.length !== before;
      }
      if (id.startsWith('h_')) {
        const [, teamId, key] = id.split('_');
        const team = root.teams.find((t) => t.id === teamId);
        if (!team || !team.history.some((h) => h.id === key)) return false;
        team.history = team.history.filter((h) => h.id !== key);
        return true;
      }
      return false;
    }
    known.add(id);
    let team = root.teams.find((t) => t.id === data.teamId);
    if (!team) { team = makeTeam(data.teamId); root.teams.push(team); }
    ready(team);
    if ((team.syncAt[id] || 0) >= data.at) return false;
    const value = JSON.parse(data.json);
    if (data.kind === 'team') Object.assign(team, value);
    else if (data.kind === 'game') {
      const old = team.game && value && team.game.id === value.id ? team.game : null;
      team.game = value ? { ...value, live: old ? old.live : value.live || null, draft: (old && old.draft) || value.draft || BLANK_DRAFT() } : null;
      // A locally filled-in blank line is not an edit, so it shouldn't be uploaded.
      if (team.game) team.syncHash[`d_${team.id}`] = team.syncHash[`d_${team.id}`] || hash(canonical(team, 'draft', null));
    } else if (data.kind === 'live') { if (team.game) team.game.live = value; } else if (data.kind === 'draft') { if (team.game && value) team.game.draft = value; }
    else if (data.kind === 'hist') {
      team.history = team.history.filter((h) => h.id !== data.key).concat(value).sort((a, b) => a.date - b.date);
    }
    team.isExample = false;
    team.syncAt[id] = data.at;
    team.syncHash[id] = hash(canonical(team, data.kind, data.key));
    return true;
  }

  // A game must exist before its point and line can land on it.
  const RANK = { team: 0, game: 1, hist: 2, live: 3, draft: 4 };
  const inOrder = (changes) => changes.slice().sort((a, b) => ((a.data && RANK[a.data.kind]) || 0) - ((b.data && RANK[b.data.kind]) || 0));
  return { outgoing, incoming, hash, inOrder };
})();
if (typeof module !== 'undefined') module.exports = Cloud;
