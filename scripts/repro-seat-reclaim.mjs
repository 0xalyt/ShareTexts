import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const helpers = ['seatParticipant', 'cancelGrace'].map(name => {
  const match = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}`));
  assert.ok(match, `server helper ${name} exists`);
  return match[0];
}).join('\n');
const pendingGrace = new Map();
const socketParticipants = new Map();
const socketRooms = new Map();
const context = vm.createContext({
  pendingGrace, socketParticipants, socketRooms, clearTimeout,
  MAX_PARTICIPANTS: 64,
  liveParticipants: room => [...room.participants.values()],
});
vm.runInContext(ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const room = { id: 'room', participants: new Map(), activePeers: new Set(), rosterSeq: 0 };
const info = { id: 'participant', name: 'Device', platform: 'desktop' };
let current = 'socket-0';
socketParticipants.set(current, new Map([[room.id, info.id]]));
assert.equal(context.seatParticipant(room, current, info), 'seated');
assert.equal(context.seatParticipant(room, current, info), 'reclaimed');
assert.equal(socketParticipants.size, 1, 'same-socket refresh retains its current bookkeeping');
console.log('PASS: new seats and same-socket refresh retain live participant bookkeeping');
try {
  const rejoins = 12;
  for (let i = 1; i <= rejoins; i++) {
    const previous = current;
    pendingGrace.set(previous, setTimeout(() => socketParticipants.delete(previous), 60000));
    socketRooms.set(previous, new Set([room.id]));
    current = `socket-${i}`;
    socketParticipants.set(current, new Map([[room.id, info.id]]));
    assert.equal(context.seatParticipant(room, current, info), 'reclaimed');
    assert.equal(pendingGrace.has(previous), false, 'reclaim cancels old socket grace');
  }
  console.log(`RECLAIM_STATE: rejoins=${rejoins}, participantMaps=${socketParticipants.size}, recoveryMaps=${socketRooms.size}, timers=${pendingGrace.size}`);
  assert.equal(socketParticipants.size, 1, 'rejoins must not retain old socket participant maps');
  assert.equal(socketRooms.size, 0, 'rejoins must not retain old socket recovery maps');
  assert.equal(socketParticipants.get(current).get(room.id), info.id);
  assert.deepEqual([...room.activePeers], [current]);
  assert.equal(room.participants.size, 1);
  console.log('PASS: twelve fresh-socket reclaims retire old participant and recovery maps without growing the roster');
} finally {
  for (const timer of pendingGrace.values()) clearTimeout(timer);
}
