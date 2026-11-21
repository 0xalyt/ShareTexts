const MAGIC = new TextEncoder().encode('STFRAG01');
const HEADER = 36;
const SLICE = 60 * 1024;
const MAX_PACKET = 132 * 1024;
export const RELAY_PACKET_LIMIT = 126 * 1024;

export function waitForRelayCapability(waiters: Set<() => void>): Promise<void> {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
    const timer = setTimeout(done, 2000);
    waiters.add(done);
  });
}

export function relayBinaryFrames(packet: ArrayBuffer): ArrayBuffer[] {
  if (packet.byteLength <= RELAY_PACKET_LIMIT) return [packet];
  if (packet.byteLength > MAX_PACKET) throw new RangeError('Relay packet too large');
  const bytes = new Uint8Array(packet);
  const frames: ArrayBuffer[] = [];
  for (let offset = 20; offset < bytes.length; offset += SLICE) {
    const payload = bytes.subarray(offset, offset + SLICE);
    const frame = new Uint8Array(HEADER + payload.length);
    frame.set(MAGIC);
    frame.set(bytes.subarray(0, 20), 8);
    const view = new DataView(frame.buffer);
    view.setUint32(28, bytes.length, true);
    view.setUint32(32, offset - 20, true);
    frame.set(payload, HEADER);
    frames.push(frame.buffer);
  }
  return frames;
}

export class RelayBinaryAssembler {
  private pending = new Map<string, { packet: Uint8Array; offsets: Set<number>; received: number; updatedAt: number }>();

  clear(): void { this.pending.clear(); }

  push(frame: ArrayBuffer): ArrayBuffer | null {
    const bytes = new Uint8Array(frame);
    if (bytes.length < MAGIC.length || !MAGIC.every((value, index) => bytes[index] === value)) return frame;
    if (bytes.length < HEADER) return null;
    const view = new DataView(frame);
    const total = view.getUint32(28, true);
    const offset = view.getUint32(32, true);
    const length = bytes.length - HEADER;
    if (total <= RELAY_PACKET_LIMIT || total > MAX_PACKET || offset % SLICE !== 0 ||
        offset >= total - 20 || length !== Math.min(SLICE, total - 20 - offset)) return null;
    const now = Date.now();
    for (const [id, entry] of this.pending) if (now - entry.updatedAt > 30000) this.pending.delete(id);
    const id = Array.from(bytes.subarray(8, 28)).join(',');
    let entry = this.pending.get(id);
    if (entry && entry.packet.length !== total) return null;
    if (!entry) {
      if (this.pending.size >= 64) this.pending.delete(this.pending.keys().next().value!);
      const packet = new Uint8Array(total);
      packet.set(bytes.subarray(8, 28));
      entry = { packet, offsets: new Set(), received: 0, updatedAt: now };
      this.pending.set(id, entry);
    }
    if (entry.offsets.has(offset)) return null;
    entry.packet.set(bytes.subarray(HEADER), 20 + offset);
    entry.offsets.add(offset);
    entry.received += length;
    entry.updatedAt = now;
    if (entry.received !== total - 20) return null;
    this.pending.delete(id);
    return entry.packet.buffer as ArrayBuffer;
  }
}
