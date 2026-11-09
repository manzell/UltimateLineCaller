// node test/cloud.test.js — simulates a desktop and a phone syncing through one shared store.
const Cloud = require('../src/cloud.js');
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const team = (id, name) => ({ id, team: name, players: [{ id: 'a', name: 'Ari', contacts: [] }], rules: { size: 7 }, game: null, history: [], schedule: [] });
const blank = (id) => ({ id, team: '', players: [], rules: {}, game: null, history: [], schedule: [] });

let clock = 1000;
const store = new Map();
function device(root) {
  const known = new Set();
  return {
    root, known,
    push() {
      const { writes, deletes } = Cloud.outgoing(root, known, ++clock);
      writes.forEach((w) => store.set(w.id, clone(w.data)));
      deletes.forEach((id) => store.delete(id));
      return writes.length + deletes.length;
    },
    pull() {
      let changed = false;
      store.forEach((data, id) => { if (Cloud.incoming(root, { type: 'modified', id, data: clone(data) }, known, blank)) changed = true; });
      [...known].filter((id) => !store.has(id)).forEach((id) => { if (Cloud.incoming(root, { type: 'removed', id }, known, blank)) changed = true; });
      return changed;
    },
  };
}

const desk = device({ teams: [team('t1', 'Flyers'), { ...team('ex', 'Example'), isExample: true }] });
const phone = device({ teams: [] });

check(desk.push() === 2, 'first upload is team and game records');
check(![...store.keys()].some((k) => k.includes('ex')), 'example team is never uploaded');
check(desk.push() === 0, 'nothing to upload when nothing changed');

check(phone.pull(), 'phone receives the team');
check(phone.root.teams[0].team === 'Flyers' && phone.root.teams[0].players.length === 1, 'team contents arrived');
check(phone.push() === 0, 'receiving does not cause a re-upload');

// Different key order must not look like a change.
phone.root.teams[0] = Object.fromEntries(Object.entries(phone.root.teams[0]).reverse());
check(phone.push() === 0, 'key order does not trigger an upload');

// Desktop edits the roster while the phone records a game; neither should lose work.
phone.root.teams[0].game = { id: 'g1', points: [{ result: 'us' }] };
desk.root.teams[0].players.push({ id: 'b', name: 'Bea', contacts: [] });
desk.push(); phone.push();
desk.pull(); phone.pull();
check(desk.root.teams[0].game && desk.root.teams[0].game.id === 'g1', 'desktop sees the phone game');
check(phone.root.teams[0].players.length === 2, 'phone sees the desktop roster');
check(phone.root.teams[0].game.points.length === 1, 'roster edit did not clobber the game');
check(desk.push() === 0 && phone.push() === 0, 'settled after exchange');

// Newest wins on the same record.
desk.root.teams[0].team = 'Older name'; desk.push();
phone.root.teams[0].team = 'Newer name'; phone.push();
desk.pull(); phone.pull();
check(desk.root.teams[0].team === 'Newer name' && phone.root.teams[0].team === 'Newer name', 'newest edit wins');

// Finished game moves to history; reopening removes it everywhere.
const t = phone.root.teams[0];
t.history.push({ id: 'g1', date: 5, us: 15, them: 3, perPlayer: {} }); t.game = null;
phone.push(); desk.pull();
check(desk.root.teams[0].history.length === 1 && !desk.root.teams[0].game, 'finished game synced');
t.history = []; t.game = { id: 'g1', points: [] };
phone.push(); desk.pull();
check(desk.root.teams[0].history.length === 0 && desk.root.teams[0].game.id === 'g1', 'reopened game synced');

// Offline edits made before the first sync on a new device survive.
const tablet = device({ teams: [team('t2', 'Second team')] });
tablet.pull(); tablet.push(); desk.pull();
check(desk.root.teams.some((x) => x.id === 't2'), 'new team from another device arrives');
check(tablet.root.teams.some((x) => x.id === 't1'), 'tablet receives existing team');

// Deleting a team removes it from other devices and stays deleted.
desk.root.teams = desk.root.teams.filter((x) => x.id !== 't2');
desk.push(); phone.pull(); tablet.pull();
check(!tablet.root.teams.some((x) => x.id === 't2'), 'deleted team removed elsewhere');
check(tablet.push() === 0, 'deleted team is not re-uploaded');
check(![...store.keys()].some((k) => k.endsWith('t2')), 'deleted team gone from the cloud');

// A record arriving twice is harmless.
const rec = store.get('t_t1');
check(!Cloud.incoming(phone.root, { type: 'modified', id: 't_t1', data: clone(rec) }, phone.known, blank), 'repeat delivery ignored');

console.log(failures ? failures + ' FAILURES' : 'Cloud checks passed');
process.exit(failures ? 1 : 0);
