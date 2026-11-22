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

/** A displayed invitation may beat registration. Retry only missing rooms,
 * never refusals such as room-full or a wrong credential, with a firm bound. */
export async function waitForInvitation<T>(lookup: () => Promise<T>, pending: (value: T) => boolean): Promise<T> {
  let value = await lookup();
  for (const delay of [500, 1000, 1500, 2000, 2500, 3000]) {
    if (!pending(value)) break;
    await new Promise(resolve => setTimeout(resolve, delay));
    // Recheck cancellation after the delay, before another network operation.
    if (!pending(value)) break;
    value = await lookup();
  }
  return value;
}
