/** A 128-bit invitation can be rendered before the signaling round trip. */
export function makeInvitation() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0, value = 0, secret = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      secret += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) secret += alphabet[(value << (5 - bits)) & 31];
  return { roomId: crypto.randomUUID(), secret, createdAt: Date.now(), pid: crypto.randomUUID() };
}
