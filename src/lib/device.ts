/**
 * device.ts — the low-end switch (DESIGN.md §18).
 *
 * Glass is a luxury: a backdrop blur re-samples the region behind every
 * floating layer on every frame. On a cheap Android phone that is the
 * difference between a scroll that tracks the finger and one that lags it.
 *
 * So the material has a floor: 4 GB of memory or fewer, 4 threads or fewer,
 * or the user turning it off themselves. Any of those sets `no-glass` on
 * <html>, and `.glass` falls back to a solid fill (styles/apple-dna.css).
 * Nothing else changes — same controls, same sizes, same contrast.
 *
 * Both signals are opt-in browser APIs (`deviceMemory` is Chromium-only), so
 * an unknown device keeps the material: we fall back on taste, not on fear.
 */

export const NO_GLASS_KEY = 'sharetext.noGlass';

/** Read the stored preference. `'1'` = off, `'0'` = forced on, null = auto. */
export function readNoGlassPreference(): '1' | '0' | null {
  try {
    const v = localStorage.getItem(NO_GLASS_KEY);
    return v === '1' || v === '0' ? v : null;
  } catch {
    return null;
  }
}

/** True when this device should not pay for the blur. */
export function prefersNoGlass(): boolean {
  const pref = readNoGlassPreference();
  if (pref === '1') return true;
  if (pref === '0') return false;
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === 'number' && mem > 0 && mem <= 4) return true;
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= 4) return true;
  return false;
}

/**
 * True on a real Apple platform (macOS, iOS, iPadOS). iPadOS reports
 * `MacIntel` as its platform, so the UA check backs it up.
 *
 * This exists because `-apple-system` is NOT a safe way to ask for SF: Blink
 * resolves it on Windows too, and a stack that begins with it renders Arial
 * there and never reaches the self-hosted Inter. The font tokens therefore put
 * Inter first and this class puts SF back in front, on Apple only.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /macintosh|iphone|ipad|ipod/i.test(ua);
}

/** Apply (or clear) the Apple type class. Safe to call on every boot. */
export function applyPlatformType(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isApplePlatform()) root.classList.add('apple-type');
  else root.classList.remove('apple-type');
}

/** Apply (or clear) the class. Safe to call on every boot. */
export function applyGlassPreference(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (prefersNoGlass()) root.classList.add('no-glass');
  else root.classList.remove('no-glass');
}

/** Persist a choice and apply it immediately (the Settings switch in P3). */
export function setNoGlass(enabled: boolean | null): void {
  try {
    if (enabled === null) localStorage.removeItem(NO_GLASS_KEY);
    else localStorage.setItem(NO_GLASS_KEY, enabled ? '1' : '0');
  } catch { /* private mode — the class still applies for this session */ }
  applyGlassPreference();
}
