/** Short-lived, same-origin handoff from the installed app's share target.
 * Bytes never go to the signaling server. The service worker writes this
 * dedicated cache; the composer consumes it once, before the user sends. */
import { composerIntentGeneration } from './composerIntent';
const CACHE = 'sharetexts-share-inbox-v1';
export interface SharedItems { text: string; files: File[] }
const reads = new Map<string, Promise<SharedItems>>();

/** Keep phone-only staging in this lazy module, off the landing's first load. */
export async function stageSharedItems(id: string, isCurrent: () => boolean): Promise<boolean> {
  const generation = composerIntentGeneration();
  const items = await takeSharedItems(id);
  if (!isCurrent() || generation !== composerIntentGeneration()) return false;
  const w = window as Window & { __stHomeDropFiles?: File[]; __stPendingIntentText?: string };
  w.__stHomeDropFiles = items.files;
  w.__stPendingIntentText = items.text;
  window.dispatchEvent(new Event('sharetext:composer-intent'));
  return true;
}

export function takeSharedItems(id: string): Promise<SharedItems> {
  const existing = reads.get(id);
  if (existing) return existing;
  const read = (async () => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid share');
    const cache = await caches.open(CACHE);
    const base = `${location.origin}/__share/${id}/`;
    try {
    const manifest = await cache.match(base + 'meta');
    if (!manifest) throw new Error('Share expired');
    const meta = await manifest.json() as { at: number; text: string; files: { name: string; type: string }[] };
    if (Date.now() - meta.at > 10 * 60_000) {
      throw new Error('Share expired');
    }
    const files = await Promise.all(meta.files.map(async (file, i) => {
      const response = await cache.match(base + i);
      if (!response) throw new Error('Missing shared file');
      return new File([await response.blob()], file.name, { type: file.type });
    }));
    return { text: meta.text, files };
    } finally {
      await Promise.all((await cache.keys()).filter(r => r.url.startsWith(base)).map(r => cache.delete(r)));
    }
  })().finally(() => { reads.delete(id); });
  reads.set(id, read);
  return read;
}
