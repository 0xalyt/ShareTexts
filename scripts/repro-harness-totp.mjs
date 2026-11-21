import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { tsImport } from 'tsx/esm/api';

const { generateTOTP } = await tsImport('../src/lib/totp.ts', import.meta.url);
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const now = Date.now;
try {
  for (const anchor of [undefined, 1700000000000]) {
    for (const elapsed of [0, 89999, 90000, 180001]) {
      Date.now = () => (anchor ?? 0) + elapsed;
      const counter = Buffer.alloc(8);
      // src/lib/totp.ts: SHA-1, six digits, 90-second room-anchored windows.
      counter.writeBigUInt64BE(BigInt(Math.floor(elapsed / 90000)));
      const digest = createHmac('sha1', '12345678901234567890').update(counter).digest();
      const offset = digest.at(-1) & 15;
      const expected = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
      assert.equal(generateTOTP(secret, anchor), expected);
    }
  }
} finally {
  Date.now = now;
}
console.log('PASS: Node harness imports client TOTP without a build; SHA-1, digits, period and room anchor agree');
