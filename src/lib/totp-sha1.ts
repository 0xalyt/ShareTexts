/**
 * A synchronous TOTP, in ~70 lines, because the room code has to render in the
 * same frame as the ring around it.
 *
 * `otpauth` did this before: 30 KB of the entry chunk for one HMAC-SHA1 that
 * WebCrypto already implements. WebCrypto is async, and turning `generateTOTP`
 * async would ripple through every caller and the pairing screen. So: SHA-1 by
 * hand (it is 40 rounds of the same block), base32 from `worker/src/totp.ts`,
 * and the RFC 6238 truncation. `scripts/verify-totp-parity.mjs` proves this
 * agrees with the Worker's WebCrypto implementation for every counter.
 *
 * Settings are not configurable on purpose — the Worker validates with exactly
 * these, and a client that could drift from them would show codes that never
 * pair.
 */
const PERIOD = 90; // seconds per window; must equal worker/src/totp.ts TOTP_PERIOD
const DIGITS = 6;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** SHA-1 of a byte array (FIPS 180-4). Returns 20 bytes. */
export function sha1(message: Uint8Array): Uint8Array {
  const ml = message.length;
  const withPad = new Uint8Array((((ml + 8) >> 6) + 1) * 64);
  withPad.set(message);
  withPad[ml] = 0x80;
  const bitLen = ml * 8;
  // 64-bit big-endian length; JS numbers hold the low 53 bits, which is every
  // message this ever sees.
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 8, hi);
  dv.setUint32(withPad.length - 4, lo);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < withPad.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i += 1) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((x << 1) | (x >>> 31)) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0);
  odv.setUint32(4, h1);
  odv.setUint32(8, h2);
  odv.setUint32(12, h3);
  odv.setUint32(16, h4);
  return out;
}

/** HMAC-SHA1 (RFC 2104). */
export function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = 64;
  const k = key.length > block ? sha1(key) : key;
  const padded = new Uint8Array(block);
  padded.set(k);
  const inner = new Uint8Array(block + message.length);
  const outer = new Uint8Array(block + 20);
  for (let i = 0; i < block; i += 1) {
    inner[i] = padded[i] ^ 0x36;
    outer[i] = padded[i] ^ 0x5c;
  }
  inner.set(message, block);
  outer.set(sha1(inner), block);
  return sha1(outer);
}

/** RFC 6238 code for a 64-bit counter. */
export function totpAt(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i -= 1) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const h = hmacSha1(key, msg);
  const offset = h[h.length - 1] & 0x0f;
  const bin =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const TOTP_PERIOD_SECONDS = PERIOD;
