import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';

const { startNetStats, stopNetStats, getNetStats } = await tsImport('../src/lib/netStats.ts', import.meta.url);

try {
  startNetStats(null);
  assert.equal(getNetStats().available, false);
  console.log('PASS: relay without a peer connection starts without throwing');

  const pc = {
    connectionState: 'connected',
    getStats: async () => new Map([
      ['pair', { type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local', remoteCandidateId: 'remote', currentRoundTripTime: 0.012 }],
      ['local', { type: 'local-candidate', id: 'local', candidateType: 'host' }],
      ['remote', { type: 'remote-candidate', id: 'remote', candidateType: 'host' }],
      ['channel', { type: 'data-channel', bytesSent: 42, bytesReceived: 24 }],
    ]),
  };
  startNetStats(pc);
  await Promise.resolve();
  assert.equal(getNetStats().available, true);
  assert.equal(getNetStats().route, 'direct');
  assert.equal(getNetStats().rttMs, 12);
  assert.equal(getNetStats().bytesSent, 42);
  assert.equal(getNetStats().bytesReceived, 24);
  console.log('PASS: peer connection sampling still reports route, RTT and bytes');

  startNetStats(null);
  assert.equal(getNetStats().available, false);
  assert.equal(getNetStats().bytesSent, 0);
  assert.equal(getNetStats().route, 'unknown');
  console.log('PASS: switching to relay clears previous peer measurements');

  startNetStats({ connectionState: 'connected', getStats: async () => { throw new Error('getStats failed'); } });
  await Promise.resolve();
  assert.equal(getNetStats().available, false);
  console.log('PASS: failed getStats remains unavailable without throwing');
} finally {
  stopNetStats();
}
