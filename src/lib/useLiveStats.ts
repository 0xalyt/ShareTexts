import { useCallback, useEffect, useRef, useState } from 'react';
import { signalingHttpBase, endpointSelectionSettled } from './socket';

/**
 * Room-connected hook — a module-level registry so ANY component can react
 * to the moment a real two-device connection opens (the WebRTC data channel
 * opening is the one true "two devices connected" event). Used by
 * useLiveStats to fire the optimistic tracker bump from the connection, not
 * from room creation — the tracker counts connected pairs, not rooms.
 */
type ConnectedListener = () => void;
const connectedListeners = new Set<ConnectedListener>();
export function emitRoomConnected() {
  for (const l of connectedListeners) l();
}
export function onRoomConnected(listener: ConnectedListener): () => void {
  connectedListeners.add(listener);
  return () => { connectedListeners.delete(listener); };
}

/** Reset the once-per-connection bump latch — call when the session is
 *  abandoned/left so a NEW pairing on this page bumps the tracker again. */
export function resetRoomsBumpLatch() {
  bumpLatchReset?.();
}
let bumpLatchReset: (() => void) | null = null;

/**
 * Live landing-page stats from the ACTIVE signaling backend's aggregate
 * /stats endpoint. Polls every 10s; a hidden failure keeps the last known
 * values — a dead network must never show wrong numbers.
 *
 * Exposed numbers (both aggregate, never rooms/codes/IPs):
 *   devices     — devices seated in a room right now
 *   roomsCreated — total rooms ever created since server start
 *
 * The tracker on the landing page renders only when `devices` is non-null
 * (i.e. the service has answered at least once) so it never shows a fake 0.
 *
 * The optimistic increment fires from a REAL two-device connection: the
 * hook subscribes to onRoomConnected (fired by SessionContext when the
 * data channel opens) — once per connected session, reset when the session
 * is abandoned. Server truth wins on the next /stats poll.
 */
export function useLiveStats(pollMs = 10_000): { devices: number | null; roomsCreated: number | null } {
  const [devices, setDevices] = useState<number | null>(null);
  const [roomsCreated, setRoomsCreated] = useState<number | null>(null);
  // Server-truth and the local optimistic bump travel separately: display =
  // max(server, local) so a slow fetch never drags the number backwards.
  const [localBump, setLocalBump] = useState(0);
  const serverRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const base = signalingHttpBase();
    if (!base) return;
    // A hung connection (dead Wi-Fi, radio handoff) must not leave the poll
    // dangling — every fetch is bounded, so the loop always moves on and the
    // UI keeps the last known good numbers.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(base + '/stats', { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.users === 'number') setDevices(data.users);
      if (typeof data?.roomsCreated === 'number') {
        serverRef.current = data.roomsCreated;
        setRoomsCreated(data.roomsCreated);
      }
    } catch { /* offline — keep last known values quietly */ }
    finally { clearTimeout(timer); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The FIRST poll must read the worker the transport actually landed on.
    // On the Cloudflare transport the boot probe may redirect the base (a
    // build can bake a stale worker); polling before it settles reads the
    // stale /stats, which lacks roomsCreated — the tracker then sits at the
    // floor until the next 10s tick. Await the probe, then poll.
    const boot = endpointSelectionSettled();
    const tick = async () => { if (!cancelled) await load(); };
    void boot.then(tick);
    const timer = setInterval(tick, pollMs);
    // Returning to the tab (e.g. after finishing a room) refreshes at once,
    // so the tracker shows the room just created without waiting a full
    // polling interval.
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [pollMs, load]);

  // The optimistic bump now fires on a REAL two-device connection (the data
  // channel opening), not on room creation — matching the server-side honest
  // increment. One bump per connected session: the latch resets when the
  // session is abandoned (resetRoomsBumpLatch, called by SessionContext), so
  // a fresh pairing later on this page can bump again. Server truth still
  // wins on the next poll either way.
  const bumpedForThisConnectionRef = useRef(false);
  // Register the latch-resetter so SessionContext can clear it on abandon.
  useEffect(() => {
    bumpLatchReset = () => { bumpedForThisConnectionRef.current = false; };
    return () => { bumpLatchReset = null; };
  }, []);
  useEffect(() => onRoomConnected(() => {
    if (bumpedForThisConnectionRef.current) return;
    bumpedForThisConnectionRef.current = true;
    setLocalBump(b => b + 1);
    // Nudge the server poll right away too — if it answers fast, the very
    // next render already carries the authoritative total.
    void load();
  }), [load]);

  // Display = the best REAL truth we have. No fabricated floor: the number
  // is the server's honest lifetime total (rooms made across every device
  // since it came up) plus this device's own optimistic bump, which is a
  // real connection that just opened. A fresh server showing a small count
  // is honest; inventing longevity to look busier is not. Until the server
  // answers we return null so the tracker stays hidden rather than showing
  // a made-up figure.
  const displayRooms = roomsCreated == null
    ? (localBump > 0 ? localBump : null)
    : Math.max(roomsCreated, roomsCreated + localBump);

  return { devices, roomsCreated: displayRooms };
}
