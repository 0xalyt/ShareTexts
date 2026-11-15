import type { SignalingSocket } from './socket';
import { devLog } from './devlog';
import { diag } from './diag';

/**
 * Nearby device presence — the client half of landing-page discovery.
 *
 * A device that is merely OPEN on ShareTexts (not seated in a room) can
 * announce itself so other nearby devices can offer a one-tap connect.
 * Everything here is EPHEMERAL and PRIVACY-MINIMAL:
 *
 *   · the device id is a random UUID persisted in localStorage ONLY so the
 *     server can dedupe refreshes — it never leaves the device except inside
 *     the announce, and the server replies with a rotating opaque token that
 *     is what other devices actually see;
 *   · no polling, no extra sockets: one keepalive announce per 45s on the
 *     EXISTING signaling socket, immediate re-announce on reconnect;
 *   · discovery ≠ connection — this module never opens a room or WebRTC;
 *     selecting a device sends a server-relayed invitation which the other
 *     user must accept, and only then do the EXISTING create/join flows run.
 *
 * Only the socket.io transport implements presence. On the Cloudflare
 * transport unknown events fail cleanly — `attach` detects that once and the
 * app simply shows the hero hint line without a device list.
 */

/** Random, opaque, stable device id. Reused across visits ONLY as a presence
 *  dedupe key on the server; it is not a tracking identifier (no server-side
 *  persistence, rotating tokens on the wire, cleared with site data). */
const DEVICE_ID_KEY = 'sharetext.deviceId.v1';

/**
 * Nearby visibility — AirDrop's "Everyone for 10 minutes", with the honest
 * default of OFF for strangers.
 *
 * The window is stored as an ABSOLUTE DEADLINE in sessionStorage, never as a
 * countdown: phone browsers freeze timers when the tab is backgrounded, so a
 * window kept in an interval would say "4 minutes left" hours later. The
 * deadline also survives a reload of that tab, which is what "for 10 minutes"
 * has to mean to be true.
 *
 * While Off this device never announces — it can still SEE others and invite
 * them, it just cannot be found.
 */
const VISIBLE_UNTIL_KEY = 'sharetext.presenceVisibleUntil.v1';

/** The visibility window. Ten minutes is the owner decision (OD-7). */
export const NEARBY_VISIBLE_MS = 10 * 60_000;

function readDeadline(): number {
  try {
    const raw = sessionStorage.getItem(VISIBLE_UNTIL_KEY);
    const until = raw ? Number(raw) : 0;
    return Number.isFinite(until) && until > 0 ? until : 0;
  } catch { return 0; }
}

/** Epoch ms when visibility ends, or 0 when this device is Off. */
export function visibleUntil(): number {
  const until = readDeadline();
  if (until && until <= Date.now()) {
    // Expired while the tab was asleep: clean up so the UI cannot show a
    // negative countdown after a reload.
    try { sessionStorage.removeItem(VISIBLE_UNTIL_KEY); } catch { /* private mode */ }
    return 0;
  }
  return until;
}

export function isPresenceVisible(): boolean {
  return visibleUntil() > 0;
}

/** Turn visibility on for `ms` (default 10 minutes) and return the deadline. */
export function startVisibleFor(ms: number = NEARBY_VISIBLE_MS): number {
  const until = Date.now() + ms;
  try { sessionStorage.setItem(VISIBLE_UNTIL_KEY, String(until)); } catch { /* private mode */ }
  return until;
}

export function stopVisible(): void {
  try {
    sessionStorage.removeItem(VISIBLE_UNTIL_KEY);
    // A new visibility session is a new presence participant: dropping the
    // device id here is what rotates the token other devices see.
    sessionStorage.removeItem(DEVICE_ID_KEY);
  } catch { /* private mode */ }
}

/** Kept for the card's existing call sites; "hidden" is simply "not visible". */
export function isPresenceHidden(): boolean {
  return !isPresenceVisible();
}

export function setPresenceHidden(hidden: boolean): void {
  if (hidden) stopVisible();
  else startVisibleFor();
}

export function getOrCreateDeviceId(): string {
  // sessionStorage, not localStorage: a device id identifies ONE presence
  // participant, and two tabs of the same browser are two participants. With
  // a localStorage id they both announced the same token, the server kept a
  // single lobby entry, and each tab filtered itself out — so "one device
  // detected" either never appeared or pointed at the tab you were looking
  // at. sessionStorage keeps the id stable across a reload of that tab while
  // giving every tab its own identity.
  try {
    const existing = sessionStorage.getItem(DEVICE_ID_KEY) || localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
      return existing;
    }
    const fresh = crypto.randomUUID();
    try { sessionStorage.setItem(DEVICE_ID_KEY, fresh); } catch { /* private mode */ }
    return fresh;
  } catch {
    return crypto.randomUUID(); // private mode: a per-load id still works
  }
}

/** What the UI is allowed to know about a nearby device. `id` is the server's
 *  rotating token — opaque, untraceable, per-process. `kind` and `browser`
 *  come from the announce payload; they are DISPLAY hints only (never used
 *  for pairing identity) and are validated on both server hops. */
export interface NearbyDevice {
  id: string;
  name: string;
  /** Coarse device kind: drives the tile glyph. */
  kind: 'phone' | 'tablet' | 'desktop';
  /** Short browser label for the overlay ("Chrome", "Safari", "Firefox"…). */
  browser: string;
  /** Exact model when the platform exposes one (Android builds); otherwise
   *  empty — the UI renders platform art and never invents a model. */
  model?: string;
}

const TOKEN_RE = /^[0-9a-f]{32}$/;
const NAME_MAX = 32;
const BROWSER_MAX = 20;
const MODEL_MAX = 40;
const MAX_DEVICES = 24;

const KINDS = new Set(['phone', 'tablet', 'desktop']);

/** Coarse device kind from the user agent — display hint only. */
export function detectDeviceKind(ua: string): 'phone' | 'tablet' | 'desktop' {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Android.*Mobile|iPhone|iPod|Windows Phone/i.test(ua)) return 'phone';
  if (/Android/i.test(ua)) return 'tablet';
  return 'desktop';
}

/** Short browser label from the user agent — display hint only. */
export function detectBrowser(ua: string): string {
  // First match wins; each branch already produces the display label.
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/CriOS\//.test(ua)) return 'Chrome';
  if (/FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return '';
}

/**
 * Exact device MODEL where the web platform exposes one — display hint only.
 * Android build UAs carry the real model ("SM-S918B", "Pixel 7", "CPH2451");
 * iOS ships none (Apple strips it), and desktop UAs never had one. Honest
 * rule: empty string means "the web cannot know" — the UI falls back to
 * platform art instead of pretending.
 */
export function detectDeviceModel(ua: string): string {
  if (!/Android/i.test(ua)) return '';
  // "…; Android 13; SM-S918B Build/TP1A…" → "SM-S918B" (newer UAs append Build)
  // "…; Android 13; SM-S918B)" → "SM-S918B" (older form ends the UA)
  const m = ua.match(/Android[^;)]*;\s*([^;)]+?)\s+Build\//i)
    || ua.match(/Android[^;)]*;\s*([^;)]+?)\)(?:\s|$)/);
  let model = (m?.[1] ?? '').trim();
  // WebView markers and generic placeholders are not models ("wv", "K").
  if (!model || /^(wv|k)$/i.test(model)) return '';
  model = model.replace(/[\x00-\x1F\x7F<>]/g, '').slice(0, 40);
  return model.length >= 2 ? model : '';
}

/** Server → UI validation. Strips control characters, caps lengths, drops
 *  malformed entries. Device names render as React text (never HTML), so this
 *  is defense-in-depth against XSS-by-name, not the only line. */
export function parsePresenceList(payload: unknown): NearbyDevice[] {
  const raw = (payload as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: NearbyDevice[] = [];
  for (const item of raw.slice(0, MAX_DEVICES)) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    const name = (item as { name?: unknown }).name;
    if (typeof id !== 'string' || !TOKEN_RE.test(id) || seen.has(id)) continue;
    if (typeof name !== 'string') continue;
    const clean = name.replace(/[\x00-\x1F\x7F]/g, '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
    if (!clean) continue;
    const kindRaw = (item as { kind?: unknown }).kind;
    const browserRaw = (item as { browser?: unknown }).browser;
    const kind = typeof kindRaw === 'string' && KINDS.has(kindRaw) ? (kindRaw as NearbyDevice['kind']) : 'desktop';
    const browser = typeof browserRaw === 'string'
      ? browserRaw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, BROWSER_MAX)
      : '';
    const modelRaw = (item as { model?: unknown }).model;
    const model = typeof modelRaw === 'string'
      ? modelRaw.replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, MODEL_MAX)
      : '';
    seen.add(id);
    out.push({ id, name: clean, kind, browser, model: model || undefined });
  }
  return out;
}

const ANNOUNCE_INTERVAL_MS = 45_000; // comfortably inside the server's 90s TTL
const ACK_TIMEOUT_MS = 8000;

type ChangeListener = (devices: NearbyDevice[], selfToken: string | null) => void;
export interface IncomingInvitation { from: string; name: string; kind: NearbyDevice['kind']; browser: string; model?: string }
export interface InviteResult { accepted: boolean; roomId?: string; secret?: string }
type InvitationListener = (inv: IncomingInvitation) => void;
type InviteResultListener = (r: InviteResult) => void;

export class NearbyPresence {
  private socket: SignalingSocket | null = null;
  private name = '';
  private selfToken: string | null = null;
  /** List broadcast that arrived before our announce ack (server broadcasts
   *  the newcomer immediately — before the ack can set selfToken). Held here
   *  and re-filtered the moment the token lands, so our own row can never
   *  render. */
  private pendingList: NearbyDevice[] | null = null;
  private devices: NearbyDevice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<ChangeListener>();
  private invitationListeners = new Set<InvitationListener>();
  private resultListeners = new Set<InviteResultListener>();
  private unsupported = false; // transport rejected presence events (Cloudflare)
  private announcedOnce = false;

  /** True while this device is in the presence pool (landing, announcing). */
  isActive(): boolean {
    return this.socket !== null && !this.unsupported;
  }

  /** Register on the shared signaling socket. Only the LANDING state should
   *  call this — a seated device withdraws instead (see `stop`). */
  attach(socket: SignalingSocket, name: string): void {
    if (this.socket === socket && this.name === name) return;
    this.detach();
    this.socket = socket;
    this.name = name;
    socket.on('presence_list', this.onList);
    socket.on('presence_invitation', this.handleIncoming);
    socket.on('presence_invite_result', this.handleResult);
    socket.on('disconnect', this.onDown);
    socket.on('connect', this.onUp);
    if (socket.connected) void this.announce();
    // Foreground re-announce: mobile OSes silently kill background sockets,
    // so a tab returned to the foreground may have a DEAD lobby socket while
    // this.device sits on the landing page looking "present" only to itself.
    // Without this, the device isn't discoverable/invitable until the next
    // 45s keepalive — the "auto-connect doesn't work when I come back" bug.
    if (typeof document !== 'undefined' && !this.visHandler) {
      this.visHandler = () => {
        if (document.visibilityState !== 'visible') return;
        if (!this.socket || this.unsupported) return;
        void this.announce();
      };
      document.addEventListener('visibilitychange', this.visHandler);
    }
  }

  /** Leave the pool (state moved into a room / component unmounted). */
  stop(socket: SignalingSocket): void {
    this.clearTimer();
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    try { socket.emit('presence_withdraw'); } catch { /* best effort */ }
    this.detach();
    this.devices = [];
    this.selfToken = null;
    this.emit();
  }

  subscribe(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    fn(this.devices, this.selfToken);
    return () => this.listeners.delete(fn);
  }

  /** Incoming invitation from another nearby device (validated). */
  onInvitation(fn: InvitationListener): () => void {
    this.invitationListeners.add(fn);
    return () => this.invitationListeners.delete(fn);
  }

  /** Delivery receipt for OUR invitation: accepted (with room credentials)
   *  or declined/gone. */
  onInviteResult(fn: InviteResultListener): () => void {
    this.resultListeners.add(fn);
    return () => this.resultListeners.delete(fn);
  }

  /** Server-relayed invitation to the selected device. */
  invite(deviceToken: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = this.socket;
      if (!socket || this.unsupported) return resolve(false);
      const timer = setTimeout(() => resolve(false), ACK_TIMEOUT_MS);
      try {
        socket.emit('presence_invite', { deviceId: deviceToken }, (res: { success?: boolean }) => {
          clearTimeout(timer);
          resolve(res?.success === true);
        });
      } catch {
        clearTimeout(timer);
        resolve(false);
      }
    });
  }

  /** The invitee's answer; on accept the invitee's client passes the fresh
   *  roomId+secret it just created, which the server relays to the inviter. */
  answerInvite(to: string, accepted: boolean, room?: { roomId: string; secret: string }): void {
    const socket = this.socket;
    if (!socket) return;
    try {
      socket.emit('presence_invite_result', { to, accepted, ...(accepted && room ? room : {}) });
    } catch { /* best effort */ }
  }

  private detach(): void {
    const socket = this.socket;
    this.clearTimer();
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    if (this.visHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visHandler);
      this.visHandler = null;
    }
    if (!socket) return;
    socket.off('presence_list', this.onList);
    socket.off('presence_invitation', this.handleIncoming);
    socket.off('presence_invite_result', this.handleResult);
    socket.off('disconnect', this.onDown);
    socket.off('connect', this.onUp);
    this.socket = null;
    this.announcedOnce = false;
    this.pendingList = null;
  }

  private handleIncoming = (payload: unknown): void => {
    const p = payload as { from?: unknown; name?: unknown; kind?: unknown; browser?: unknown; model?: unknown } | null;
    if (!p || typeof p.from !== 'string' || !TOKEN_RE.test(p.from) || typeof p.name !== 'string') return;
    const name = p.name.replace(/[\x00-\x1F\x7F]/g, '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
    if (!name) return;
    const kind = typeof p.kind === 'string' && KINDS.has(p.kind) ? (p.kind as NearbyDevice['kind']) : 'desktop';
    const browser = typeof p.browser === 'string' ? p.browser.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, BROWSER_MAX) : '';
    const model = typeof p.model === 'string' ? p.model.replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, MODEL_MAX) : '';
    for (const fn of this.invitationListeners) fn({ from: p.from, name, kind, browser, model: model || undefined });
  };

  private handleResult = (payload: unknown): void => {
    const p = payload as { accepted?: unknown; roomId?: unknown; secret?: unknown } | null;
    if (!p || typeof p.accepted !== 'boolean') return;
    const r: InviteResult = { accepted: p.accepted };
    if (p.accepted) {
      if (typeof p.roomId !== 'string' || typeof p.secret !== 'string') return;
      r.roomId = p.roomId;
      r.secret = p.secret;
    }
    for (const fn of this.resultListeners) fn(r);
  };

  private onList = (payload: unknown): void => {
    const devices = parsePresenceList(payload);
    // Prune our own token out of the visible list — a device never pairs with
    // itself, and the hint line stays honest while we're in the pool.
    if (!this.selfToken) {
      // Pre-ack broadcast: stash instead of showing (we can't yet tell which
      // row is us). announce() re-runs this the instant the token arrives.
      this.pendingList = devices;
      return;
    }
    this.pendingList = null;
    this.devices = devices.filter(d => d.id !== this.selfToken);
    this.emit();
  };

  private onDown = (): void => {
    // The server withdraws us on disconnect; local list goes stale-fast.
    this.clearTimer();
    this.selfToken = null;
    this.pendingList = null;
    this.devices = [];
    this.emit();
  };

  private onUp = (): void => {
    if (!this.unsupported) void this.announce();
  };

  private clearTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private announceRetries = 0;
  private visHandler: (() => void) | null = null;

  /** Withdraw exactly when the visibility window ends, rather than at the next
   *  45s keepalive (which would keep us findable for up to 45s too long). */
  private scheduleExpiry(): void {
    if (this.expiryTimer) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    const until = visibleUntil();
    if (!until) return;
    const wait = Math.max(0, until - Date.now()) + 250;
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      const socket = this.socket;
      this.selfToken = null;
      this.clearTimer();
      if (socket) { try { socket.emit('presence_withdraw'); } catch { /* best effort */ } }
      this.emit();
    }, wait);
  }
  /** Quick bounded retry after a failed announce (transport couldn't dial
   *  the lobby). 3s→6s→12s→15s cap; resets on success. This is what turns a
   *  stale-worker boot into a self-heal in seconds instead of waiting for
   *  the 45s keepalive. */
  private scheduleAnnounceRetry(): void {
    if (this.retryTimer) return;
    const delay = Math.min(3000 * 2 ** this.announceRetries, 15000);
    this.announceRetries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.socket && !isPresenceHidden()) void this.announce();
    }, delay);
  }

  private scheduleKeepalive(): void {
    this.clearTimer();
    this.timer = setInterval(() => { if (!this.unsupported) void this.announce(); }, ANNOUNCE_INTERVAL_MS);
  }

  private async announce(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    // Visibility is OFF (the default) or the 10 minutes ran out: never
    // announce. If a keepalive fires after the window closed, withdraw so the
    // server's TTL drops us fast instead of leaving us listed.
    if (!isPresenceVisible()) {
      this.selfToken = null;
      this.clearTimer();
      try { socket.emit('presence_withdraw'); } catch { /* best effort */ }
      return;
    }
    this.scheduleExpiry();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ACK_TIMEOUT_MS);
      try {
        socket.emit('presence_announce', {
          deviceId: getOrCreateDeviceId(),
          name: this.name,
          // Display hints for the detection overlay — servers validate+strip.
          kind: detectDeviceKind(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
          browser: detectBrowser(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
          model: detectDeviceModel(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        }, (res: { success?: boolean; ok?: boolean; token?: string; error?: string; code?: string }) => {
          clearTimeout(timer);
          if (res?.success && res.token) {
            if (!this.announcedOnce) {
              this.announcedOnce = true;
              diag('presence.announce', true);
              devLog('presence announced');
            }
            this.announceRetries = 0;
            this.selfToken = res.token;
            // A list broadcast may have raced ahead of this ack — filter it now.
            if (this.pendingList) {
              const pending = this.pendingList;
              this.pendingList = null;
              this.onList(pending);
            }
            this.scheduleKeepalive();
          } else if (!res?.success) {
            // Server answered: "In a room" etc. — drop out of the pool
            // quietly. UNREACHABLE is different: the LOBBY DIAL itself failed
            // (stale/down worker). Retry quickly with backoff — two dial
            // failures also trip the transport's health callback, which
            // re-probes the endpoints and retargets to a live worker.
            this.selfToken = null;
            if ((res as { code?: string })?.code === 'UNREACHABLE') this.scheduleAnnounceRetry();
            else this.clearTimer();
          }
          resolve();
        });
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  /** Kept for API compatibility; presence now retries on every keepalive
   *  instead of latching off after one failure. */
  markUnsupported(): void {
    this.unsupported = true;
    this.clearTimer();
    this.selfToken = null;
    this.devices = [];
    this.emit();
  }

  isSupported(): boolean {
    return !this.unsupported;
  }

  /** This device's presence token (null before the announce ack, or when
   *  hidden/withdrawn). The auto-connect tiebreak compares tokens to pick
   *  exactly one inviter out of a mutual-invite race. */
  getSelfToken(): string | null {
    return this.selfToken;
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.devices, this.selfToken);
  }
}

/** App-wide singleton: one presence lifecycle for the whole tab. */
export const nearbyPresence = new NearbyPresence();
