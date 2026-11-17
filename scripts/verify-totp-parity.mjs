#!/usr/bin/env node
/**
 * verify-totp-parity — the client's hand-written TOTP must be the same TOTP.
 *
 * `src/lib/totp.ts` used to call otpauth, which cost the entry chunk ~30 KB raw
 * for one HMAC-SHA1. It now uses `src/lib/totp-sha1.ts`, written by hand so the
 * code can render synchronously. Hand-written crypto is only acceptable if it
 * is proven byte-for-byte against something else, so this gate compares:
 *
 *   1. sha1() against node:crypto for every message length 0..200 and 1 MiB,
 *   2. hmacSha1() against node:crypto for random keys and messages,
 *   3. totpAt() against worker/src/totp.ts (WebCrypto) for 400 random pairs,
 *   4. totpAt() against otpauth for 100 random pairs — the library that used to
 *      produce the codes the Worker is validating.
 *
 *   node scripts/verify-totp-parity.mjs
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { totpAt as workerTotpAt, base32Encode } from '../worker/src/totp.ts';
import { sha1, hmacSha1, totpAt, base32Decode } from '../src/lib/totp-sha1.ts';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

// 1. SHA-1 against node:crypto.
let shaBad = 0;
for (let len = 0; len <= 200; len += 1) {
  const buf = randomBytes(len);
  const mine = Buffer.from(sha1(new Uint8Array(buf))).toString('hex');
  const theirs = createHash('sha1').update(buf).digest('hex');
  if (mine !== theirs) shaBad += 1;
}
const big = Buffer.alloc(1024 * 1024, 0x61);
shaBad += Buffer.from(sha1(new Uint8Array(big))).toString('hex') === createHash('sha1').update(big).digest('hex') ? 0 : 1;
ok('sha1 matches node:crypto for 0..200 bytes and 1 MiB', shaBad === 0, `${201 - shaBad}/201`);

// 2. HMAC-SHA1 against node:crypto (including keys longer than the block).
let hmacBad = 0;
for (let i = 0; i < 200; i += 1) {
  const key = randomBytes(i % 120);
  const msg = randomBytes(i * 3);
  const mine = Buffer.from(hmacSha1(new Uint8Array(key), new Uint8Array(msg))).toString('hex');
  const theirs = createHmac('sha1', key).update(msg).digest('hex');
  if (mine !== theirs) hmacBad += 1;
}
ok('hmacSha1 matches node:crypto for 200 key/message pairs', hmacBad === 0, `${200 - hmacBad}/200`);

// 3. TOTP against the Worker's WebCrypto implementation.
let workerBad = 0;
for (let i = 0; i < 400; i += 1) {
  const secret = base32Encode(new Uint8Array(randomBytes(16)));
  const counter = Math.floor(Math.random() * 2 ** 40);
  const mine = totpAt(secret, counter);
  const theirs = await workerTotpAt(secret, counter);
  if (mine !== theirs) workerBad += 1;
}
ok('totpAt matches the Worker for 400 secrets and counters', workerBad === 0, `${400 - workerBad}/400`);

// 4. TOTP against otpauth — the library whose codes the Worker validated until now.
const { TOTP } = await import('otpauth');
let otpBad = 0;
for (let i = 0; i < 100; i += 1) {
  const secret = base32Encode(new Uint8Array(randomBytes(16)));
  const counter = Math.floor(Math.random() * 2 ** 40);
  const ours = totpAt(secret, counter);
  const theirs = new TOTP({ algorithm: 'SHA1', digits: 6, period: 90, secret }).generate({
    timestamp: counter * 90 * 1000,
  });
  if (ours !== theirs) otpBad += 1;
}
ok('totpAt matches otpauth for 100 secrets and counters', otpBad === 0, `${100 - otpBad}/100`);

// 5. A 16-byte base32 secret round-trips through the decoder.
const round = base32Decode(base32Encode(new Uint8Array([0, 1, 2, 253, 254, 255])));
ok('base32Decode reads what the Worker writes', Buffer.from(round).toString('hex') === '000102fdfeff',
  Buffer.from(round).toString('hex'));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
