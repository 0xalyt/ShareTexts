#!/usr/bin/env node
/**
 * verify-circle-crypto — the Circle's seal, measured against its own promises.
 *
 * This runs the PRODUCTION module (`src/lib/circle/seal.ts`) under Node's
 * WebCrypto, not a copy of it. A test that re-implements the code it checks
 * proves only that the author is consistent.
 *
 * The vectors are pinned: the known-answer vector fixes the exact ciphertext
 * for a fixed key and IV, so any change to the algorithm, the AAD order or the
 * encoding fails here instead of silently shipping.
 *
 *   node scripts/verify-circle-crypto.mjs
 */
const S = await import('../src/lib/circle/seal.ts');

const enc = new TextEncoder();
let failures = 0;
const pass = (name, detail) => console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => { failures++; console.log(`  ✗ ${name} — ${detail}`); };

const expectThrow = async (name, fn, why) => {
  try {
    await fn();
    fail(name, `did not throw (${why})`);
  } catch {
    pass(name, why);
  }
};

const b64u = (s) => S.b64u(enc.encode(s));

/* ── 1. known-answer vector ─────────────────────────────────────────────── */
{
  const key = await S.deriveAesKey(new Uint8Array(32).fill(7), enc.encode('salt'), 'st/item/v1', true);
  const aad = S.buildAad({
    circleId: 'c1', itemId: 'i1', fromDeviceId: 'd1', epoch: 1, ts: 1700000000, chunkIndex: 0, chunkCount: 1,
  });
  const sealed = await S.sealChunk(key, enc.encode('hello circle'), aad, new Uint8Array(12).fill(3));
  const expected = '2mHdjXgXKq-jcc4RyD_vRSWp0kFiUEXKlcDbfw';
  const actual = S.b64u(sealed.ct);
  if (actual === expected) pass('known-answer vector', actual);
  else fail('known-answer vector', `expected ${expected}, got ${actual} — the algorithm, AAD order or encoding changed`);

  const opened = await S.openChunk(key, sealed, aad);
  if (new TextDecoder().decode(opened) === 'hello circle') pass('round trip');
  else fail('round trip', 'plaintext did not survive');
}

/* ── 2. tampering ───────────────────────────────────────────────────────── */
{
  const key = await S.deriveAesKey(new Uint8Array(32).fill(9), enc.encode('s'), 'st/item/v1', true);
  const aad = S.buildAad({ circleId: 'c', itemId: 'i', fromDeviceId: 'd', epoch: 2, ts: 5, chunkIndex: 0, chunkCount: 2 });
  const sealed = await S.sealChunk(key, enc.encode('secret'), aad, new Uint8Array(12).fill(1));

  const flipped = { ...sealed, ct: new Uint8Array(sealed.ct) };
  flipped.ct[0] ^= 0x01;
  await expectThrow('a flipped ciphertext bit is rejected', () => S.openChunk(key, flipped, aad), 'GCM tag covers every byte');

  const aadFlipped = new Uint8Array(aad);
  aadFlipped[0] ^= 0x01;
  await expectThrow('a flipped AAD bit is rejected', () => S.openChunk(key, sealed, aadFlipped), 'AAD is authenticated');

  const fields = ['circleId', 'itemId', 'fromDeviceId', 'epoch', 'ts', 'chunkIndex', 'chunkCount'];
  for (const field of fields) {
    const swapped = S.buildAad({
      circleId: field === 'circleId' ? 'c2' : 'c',
      itemId: field === 'itemId' ? 'i2' : 'i',
      fromDeviceId: field === 'fromDeviceId' ? 'd2' : 'd',
      epoch: field === 'epoch' ? 3 : 2,
      ts: field === 'ts' ? 6 : 5,
      chunkIndex: field === 'chunkIndex' ? 1 : 0,
      chunkCount: field === 'chunkCount' ? 3 : 2,
    });
    await expectThrow(`a chunk moved to another ${field} is rejected`, () => S.openChunk(key, sealed, swapped), 'AAD binds position and identity');
  }
}

/* ── 3. wrapping K for one device ───────────────────────────────────────── */
{
  const circleKeyRaw = S.randomBytes(32);
  const circleId = 'circle-abc';
  const alice = await S.generateDeviceKeys();
  const bob = await S.generateDeviceKeys();
  const eve = await S.generateDeviceKeys();

  const bobDhPub = await S.exportPublicSpki(bob.dh.publicKey);
  const aliceDhPub = await S.exportPublicSpki(alice.dh.publicKey);
  const wrapped = await S.wrapCircleKey(alice.dh.privateKey, bobDhPub, circleKeyRaw, circleId);

  const bobKey = await S.unwrapCircleKey(bob.dh.privateKey, aliceDhPub, wrapped, circleId);
  const itemKey = await S.deriveItemKey(bobKey, 'item-1');
  const aad = S.buildAad({ circleId, itemId: 'item-1', fromDeviceId: 'a', epoch: 1, ts: 1, chunkIndex: 0, chunkCount: 1 });
  const sealed = await S.sealChunk(itemKey, enc.encode('for bob'), aad);
  const back = await S.openChunk(itemKey, sealed, aad);
  if (new TextDecoder().decode(back) === 'for bob') pass('wrap → unwrap → read an item');
  else fail('wrap → unwrap → read an item', 'plaintext differed');

  // The unwrapped key must not be exportable: it can be used, never read out.
  try {
    await crypto.subtle.exportKey('raw', bobKey);
    fail('unwrapped circle key is non-extractable', 'exportKey succeeded');
  } catch {
    pass('unwrapped circle key is non-extractable');
  }

  const eveDhPriv = eve.dh.privateKey;
  await expectThrow(
    'a third device cannot unwrap the circle key',
    () => S.unwrapCircleKey(eveDhPriv, aliceDhPub, wrapped, circleId),
    'wrap key comes from the pair, not the circle id alone',
  );

  // Wrapped for one circle id must not open under another.
  await expectThrow(
    'a wrap from another circle is rejected',
    () => S.unwrapCircleKey(bob.dh.privateKey, aliceDhPub, wrapped, 'circle-other'),
    'circleId is the HKDF salt',
  );
}

/* ── 4. short authentication string ─────────────────────────────────────── */
{
  const inviter = await S.generateDeviceKeys();
  const joiner = await S.generateDeviceKeys();
  const joinSecret = S.b64u(S.randomBytes(16));
  const transcript = S.b64u(new Uint8Array(32).fill(4));

  const inviterDhPub = await S.exportPublicSpki(inviter.dh.publicKey);
  const joinerDhPub = await S.exportPublicSpki(joiner.dh.publicKey);

  const onInviter = await S.shortAuthString(inviter.dh.privateKey, joinerDhPub, joinSecret, transcript);
  const onJoiner = await S.shortAuthString(joiner.dh.privateKey, inviterDhPub, joinSecret, transcript);
  if (onInviter.length === 4 && onInviter.join() === onJoiner.join()) pass('SAS matches on both devices', onInviter.join(' '));
  else fail('SAS matches on both devices', `${onInviter.join(' ')} vs ${onJoiner.join(' ')}`);

  // A server that swaps the joiner's key for its own: the inviter now derives
  // against the attacker's key while the joiner derived against the inviter's.
  const attacker = await S.generateDeviceKeys();
  const attackerDhPub = await S.exportPublicSpki(attacker.dh.publicKey);
  const inviterUnderMitm = await S.shortAuthString(inviter.dh.privateKey, attackerDhPub, joinSecret, transcript);
  if (inviterUnderMitm.join() !== onJoiner.join()) pass('SAS differs under a man in the middle', inviterUnderMitm.join(' '));
  else fail('SAS differs under a man in the middle', 'both sides produced the same emoji');

  // A different join secret must also change the emoji.
  const otherSecret = S.b64u(S.randomBytes(16));
  const withOtherSecret = await S.shortAuthString(joiner.dh.privateKey, inviterDhPub, otherSecret, transcript);
  if (withOtherSecret.join() !== onJoiner.join()) pass('SAS is bound to the join secret');
  else fail('SAS is bound to the join secret', 'same emoji for a different secret');
}

/* ── 5. membership log ──────────────────────────────────────────────────── */
{
  const owner = await S.generateDeviceKeys();
  const ownerPub = await S.exportPublicSpki(owner.sign.publicKey);

  const e0 = await S.signEntry(owner.sign.privateKey, {
    seq: 0, kind: 'add_device', body: 'owner', signer: await S.deviceIdFromSignPub(ownerPub), ts: 1, prev: '',
  });
  const e1 = await S.signEntry(owner.sign.privateKey, {
    seq: 1, kind: 'add_device', body: 'second', signer: await S.deviceIdFromSignPub(ownerPub), ts: 2, prev: e0.hash,
  });

  const resolver = () => ownerPub;
  const clean = await S.verifyChain([e0, e1], resolver);
  if (clean.length === 0) pass('an honest chain verifies');
  else fail('an honest chain verifies', JSON.stringify(clean));

  const forged = [{ ...e0 }, { ...e1, body: 'attacker-device' }];
  const forgedProblems = await S.verifyChain(forged, resolver);
  if (forgedProblems.length > 0) pass('a forged entry is rejected', forgedProblems[0].reason);
  else fail('a forged entry is rejected', 'chain verified with a rewritten body');

  const spliced = [e0, { ...e1, prev: 'deadbeef' }];
  const splicedProblems = await S.verifyChain(spliced, resolver);
  if (splicedProblems.some((p) => p.reason === 'broken_link')) pass('a missing link is rejected', 'broken_link');
  else fail('a missing link is rejected', JSON.stringify(splicedProblems));

  const stranger = await S.generateDeviceKeys();
  const strangerSigned = await S.signEntry(stranger.sign.privateKey, {
    seq: 0, kind: 'add_device', body: 'owner', signer: 'someone-else', ts: 1, prev: '',
  });
  const strangerProblems = await S.verifyChain([strangerSigned], resolver);
  if (strangerProblems.some((p) => p.reason === 'bad_signature')) pass('a non-member cannot sign the chain', 'bad_signature');
  else fail('a non-member cannot sign the chain', JSON.stringify(strangerProblems));
}

/* ── 6. laziness: the crypto must not reach the entry chunk ─────────────── */
{
  const fs = await import('node:fs');
  const importer = fs.readFileSync('src/lib/circle/seal.ts', 'utf8');
  // Nothing may import it statically yet — STEP 3 wires it behind dynamic
  // import. If this file ever gains a static consumer, the entry chunk pays.
  const files = fs.readdirSync('src', { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(f));
  const staticImporters = [];
  for (const rel of files) {
    const p = `src/${String(rel).replace(/\\/g, '/')}`;
    if (p.endsWith('circle/seal.ts')) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (/^\s*import[^;]*['"][^'"]*circle\/seal['"]/m.test(text)) staticImporters.push(p);
  }
  if (staticImporters.length === 0) pass('no static importer (entry chunk pays 0 bytes)');
  else fail('no static importer (entry chunk pays 0 bytes)', staticImporters.join(', '));
}

void b64u;

if (failures) {
  console.error(`\n[verify-circle-crypto] ${failures} failure(s)`);
  process.exit(1);
}
console.log('\n[verify-circle-crypto] GREEN');
