/**
 * The part of Hop the entry chunk may read: a few bytes of localStorage that
 * say whether this browser has linked devices and what they are called.
 * Everything with crypto or IndexedDB in it stays in `hop.ts`, behind a lazy
 * import, so a visitor who never links a device downloads none of it.
 */
export const HOP_CACHE_KEY = 'sharetext.hop.v1';
export const HOP_EVENT = 'sharetext:hop';

export interface HopDevice {
  deviceId: string;
  /** What to show: the device's own name, numbered when another device shares it. */
  label: string;
  /** The name the device gave itself, kept so the numbering can be redone offline. */
  raw?: string;
}

export interface HopCache {
  circleId: string;
  /** The other devices in the circle; this one is never listed. */
  devices: HopDevice[];
  unread: number;
}

export function readHopCache(): HopCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOP_CACHE_KEY) || 'null') as HopCache | null;
    return parsed && typeof parsed.circleId === 'string' && Array.isArray(parsed.devices) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeHopCache(cache: HopCache | null): void {
  try {
    if (cache) localStorage.setItem(HOP_CACHE_KEY, JSON.stringify(cache));
    else localStorage.removeItem(HOP_CACHE_KEY);
  } catch {
    // Private mode: the row falls back to its unlinked wording.
  }
  window.dispatchEvent(new Event(HOP_EVENT));
}

export interface HopLink {
  circleId: string;
  joinSecret: string;
  /** The inviting device's ECDH public point, base64url. */
  point: string;
}

const LINK_RE = /#hop=([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{80,130})$/i;

/** Accepts a full URL (a scanned QR) or a bare fragment. */
export function parseHopLink(text: string): HopLink | null {
  const m = text.trim().match(LINK_RE);
  return m ? { circleId: m[1].toLowerCase(), joinSecret: m[2], point: m[3] } : null;
}

/** Text handed over by the OS share sheet (manifest `share_target`). */
export function readSharedText(search: string): string | null {
  const q = new URLSearchParams(search);
  const parts = [...new Set([q.get('share_title'), q.get('share_text'), q.get('share_url')]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p)))];
  // Android apps routinely repeat the URL inside the text.
  const unique = parts.filter((p, i) => !parts.some((other, j) => j !== i && other.includes(p) && other !== p));
  return unique.length ? unique.join('\n') : null;
}
