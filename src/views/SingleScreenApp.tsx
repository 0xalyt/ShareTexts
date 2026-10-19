/**
 * SingleScreenApp — the app is one continuous screen: pair, then transfer.
 *
 * Desktop (≥1024px): two-pane composition. Balanced 50/50 at 1024–1279 px,
 * asymmetric ≈44/56 at ≥1280 px so the active room gets the wider half.
 *   Left  = brand · action · context · footer (content centered per block)
 *   Right = the transfer room (flex-1, fills the other half)
 *
 * Mobile (<1024px): a single column with ONE section at a time.
 *   Idle / pairing → header · hero (Send / Receive / code entry) · footer
 *   Connected      → the transfer room TAKES OVER the whole screen (full-bleed
 *                    ChatView with its own slim device bar). No stacked
 *                    summary above the chat — the chat IS the screen.
 *
 * The experience: DEVICE → CONNECT → TRANSFER → RECEIVED
 */
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { updateRoomBadge, setRoomBadgeActive } from '../lib/roomBadge';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { BrandLockup } from '../components/BrandLockup';
import { IconButton3D } from '../components/IconButton3D';
import { ThemeToggle } from '../components/ThemeToggle';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { SendCircleIcon, ReceiveCircleIcon, DisconnectGlyph } from '../components/TransferIcons';
import { TactileButton } from '../components/TactileButton';
import { SlideToConfirm } from '../components/SlideToConfirm';
import { ShareMenu } from '../components/ShareMenu';
import { SystemAlert } from '../components/SystemAlert';
import { PresenceDock, type PresenceEntry } from '../components/PresenceDock';
import { InlineConfirm } from '../components/InlineConfirm';
import { BookOpen } from 'lucide-react';
import { ConnectHandshake } from '../components/ConnectHandshake';
import { CommandBar, CommandBarChip } from '../components/CommandBar';
import { signalingConfigIssue, prewarmSignaling } from '../lib/socket';
import { loadStoredSession } from '../lib/session/persistence';
import { ConnectError, describeConnectFailure, errCodeToKey } from '../lib/errors';
import { HeroTransferScene } from '../components/HeroTransferScene';
import { HeroDeviceDemo } from '../components/HeroDeviceDemo';
import { RateCard } from '../components/spaceui/rating';
import { useLiveStats } from '../lib/useLiveStats';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { SettingsOverlay } from '../components/SettingsOverlay';
import { StayConnectedToggle, StayBadge } from '../components/StayConnectedToggle';
import { NearbyDevices } from '../components/NearbyDevices';
import { SkeletonScreen } from '../components/SkeletonScreen';
import { productEvent } from '../lib/telemetry';
import { useI18n } from '../lib/i18n';
import { LanguageMenu } from '../components/LanguageMenu';
import { cn, shortCodeOf, sanitizeDeviceName, formatBytes } from '../lib/utils';
// Icons: Gravity UI's set, aliased onto the local names this file already
// uses — one import line changes, no JSX churn. The three it has no
// equivalent for (a slashed wifi, a slashed server, an infinity glyph) stay
// on lucide, which is exactly the rule the house style asks for.
import {
  ArrowRightFromSquare as LogOut, QrCode, Link as Link2, Copy, Check,
  Smartphone, Display as Monitor, Xmark as X, ArrowRightArrowLeft as ArrowRightLeft,
  ArrowLeft, CircleInfo as Info, Pencil, FileArrowUp as Upload,
  ArrowRotateRight as RotateCcw, Gear as SettingsIcon, Clock as Clock3,
  Plus, ChevronRight, File as FileIcon,
} from '@gravity-ui/icons';
import { Wifi, WifiOff, ServerOff, Infinity as InfinityIcon, Image as ImageIcon } from 'lucide-react';
import { SpaceCreateSheet, SpaceJoinSheet } from './SpaceView';
import { recentSpaces } from '../lib/space/api';
import { Bar } from '../components/SkeletonScreen';
import { remainingShort as remainingShortOf } from '../lib/space/time';
import { generateTOTP } from '../lib/totp';
import { useFocusTrap } from '../lib/useFocusTrap';
const QRScanner = lazy(() => import('../components/QRScanner').then(m => ({ default: m.QRScanner })));
const ChatView = lazy(() => import('./ChatView').then(m => ({ default: m.ChatView })));
type PanelMode = 'idle' | 'sending' | 'receiving' | 'connecting' | 'connected';
const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Tiny hooks                                                        */
/* ------------------------------------------------------------------ */
function useIsMobileDevice() {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.innerWidth < 1024 && 'ontouchstart' in window);
  });
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

/**
 * True when the two-pane desktop layout is active. Desktop and mobile layout
 * branches both reference the same leftPanel/roomPanel elements; only mounting
 * the branch that matches the current viewport keeps a SINGLE copy of every
 * component in the DOM (one ChatView, one composer, one pairing input)
 * instead of two — one visible and one hidden.
 */
function useIsDesktopLayout() {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024;
  });
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}


/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export function SingleScreenApp({ initialSpaceSheet, initialSpaceCode }: { initialSpaceSheet?: 'create' | 'join'; initialSpaceCode?: string } = {}) {
  const { t } = useI18n();
  const { session, createSession, abandonSession, joinWithCode, joinWithShortCode, setDeviceName, rejoinStayRoom, requestReconnect, refreshCode } = useSession();
  const isDesktopLayout = useIsDesktopLayout();
  // "Is the link actually usable right now?" — during a stall the room
  // settles into 'connecting' while partnerConnected stays true; every green
  // "Connected" treatment must key off this, not the flag alone.
  const partnerLinkHealthy = session.partnerConnected && session.connectionType !== 'disconnected' && session.connectionType !== 'connecting';
  // Live activity tracker — real aggregate numbers from the signaling
  // service: devices seated right now + rooms ever created.
  const { roomsCreated } = useLiveStats();
  const [panelMode, setPanelMode] = useState<PanelMode>(() => {
    // REFRESH HONESTY: the stored session is the truth about where this
    // device was. Deriving the first panel from it (instead of always
    // starting on 'idle' and letting the sync effect cascade
    // idle → sending/connecting → connected a beat later) removes the
    // multi-screen flash a refresh used to paint. The creator resumes
    // onto their pairing screen (code intact from storage); the joiner
    // resumes onto the connecting screen, which the sync effect holds
    // until the channel reopens — no state argues with the initial one.
    const stored = loadStoredSession();
    if (!stored?.roomId) return 'idle';
    return stored.isCreator ? 'sending' : 'connecting';
  });
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // Settings — one overlay for theme / language / stay connected / reconnect.
  const [showSettings, setShowSettings] = useState(false);
  // /space/create and /space/join land here with the right sheet already
  // open — the code entry point IS the app, not a dead end.
  const [spaceSheet, setSpaceSheet] = useState<null | 'create' | 'join'>(initialSpaceSheet ?? null);
  const [recent, setRecent] = useState(() => { try { return recentSpaces(); } catch { return []; } });
  // Rows tick with a shared clock so the countdowns stay truthful while the
  // landing stays open, and a row whose space has expired prunes itself (§9-B):
  // recentSpaces() only prunes at mount, so without this a stale row offers
  // "Open" on a space the server has already closed.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15_000); // ms resolution not needed at row level
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const alive = recent.filter(r => nowTick < r.expiresAt);
    if (alive.length !== recent.length) setRecent(alive);
  }, [nowTick, recent]);
  const [createError, setCreateError] = useState<{ text: string; icon: 'offline' | 'server' | 'time' | 'info' } | null>(null);
  const [showQROverlay, setShowQROverlay] = useState(false);
  const reduceMotion = useReducedMotion();
  const [showQRScan, setShowQRScan] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  // ACCEPTED BEAT: the server said yes — hold the code capsule green for a
  // moment before the connecting panel takes over. The delay is the
  // Metalforge reference's payoff ("a right one turns green"); under
  // reduced motion the flip is instant. The capsule stays DISABLED through
  // the beat (isJoining stays true), so no second join can start in it.
  const [codeAccepted, setCodeAccepted] = useState(false);
  const acceptBeatRef = useRef<number | null>(null);
  const clearAcceptBeat = useCallback(() => {
    if (acceptBeatRef.current !== null) {
      window.clearTimeout(acceptBeatRef.current);
      acceptBeatRef.current = null;
    }
    setCodeAccepted(false);
  }, []);
  useEffect(() => clearAcceptBeat, [clearAcceptBeat]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // Stay Connected re-entry: remembers failure so the button can honestly
  // say the room is gone (after a close or expiry) instead of blinking.
  const [stayGone, setStayGone] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);
  // Nearby discovery status, lifted into the existing activity tracker line.
  const [nearbyStatus, setNearbyStatus] = useState<string | null>(null);
  // Desktop drop-to-send: files released anywhere over the idle home screen
  // stage instantly and create the room in one motion — the fastest path
  // from "I have this file" to "it's moving". No state? No dialog first.
  const [homeDrop, setHomeDrop] = useState(false);
  const homeDropDepth = useRef(0);
  // If NearbyDevices unmounts (room created, route change) while a transient
  // status is showing, the counter line must come back — the child's own
  // effect can't run after it's gone, so the parent clears on unmount.
  const nearbyStatusRef = useRef(setNearbyStatus);
  useEffect(() => () => nearbyStatusRef.current(null), []);
  // Device-name editing in the connected pair visual (tap your name to
  // rename — the other device sees the change immediately).
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [dismissedNameNotice, setDismissedNameNotice] = useState(false);
  // ⌘K command bar — shared open state between the global hotkey (inside
  // CommandBar) and the header chip (here).
  const [cmdOpen, setCmdOpen] = useState(false);
  // The QR overlay closes itself once this room links — one dismissal per
  // room id, so a transient reconnect blip never re-opens it.
  const qrDismissedForRoomRef = useRef<string | null>(null);
  // The completed-handshake beat: when the channel first opens for the
  // CREATOR, the finished two-device scene (searching → connecting →
  // linked) holds for a moment BEFORE the room takes over — the payoff of
  // the pairing story is actually seen, not swapped away mid-breath. The
  // joiner already watched the handshake complete on their connecting
  // screen, so only the creator gets the beat.
  const [celebrateConnected, setCelebrateConnected] = useState(false);
  const celebratedRoomRef = useRef<string | null>(null);
  // Perceived speed: prewarm the lazily-loaded surfaces while the landing
  // page is idle, so tapping Receive (scanner), Show QR (renderer), or
  // completing a pairing (room) never waits on a network round-trip for
  // the chunk. Fire once, after first paint, completely off the hot path.
  useEffect(() => {
    const idle = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 3000 });
      else setTimeout(cb, 1200);
    };
    idle(() => {
      void import('./ChatView');
      void import('../components/QRScanner');
      void import('qrcode.react');
    });
  }, []);
  // /s/<code> share links: opening one should JOIN the room, not show the
  // landing page. The old multi-screen app handled this in JoinSession; the
  // single-screen consolidation dropped it. Restored: on mount, a /s/<code>
  // path auto-joins once the signaling socket is up. One attempt per code —
  // the effect re-runs only when the path changes, and a failed join shows
  // the normal idle screen where the user can enter a code manually.
  const joinedShortCodeRef = useRef<string | null>(null);
  // Prewarm the signaling socket the moment the landing mounts: by the time
  // a user taps Send, the WebSocket is already open — the code appears
  // instantly instead of waiting for a handshake.
  // A fresh Stay Connected promise (or a new credential) clears the
  // "room gone" state so the landing button comes back.
  useEffect(() => { if (session.lastStayRoom) setStayGone(false); }, [session.lastStayRoom]);
  useEffect(() => { prewarmSignaling(); }, []);
  useEffect(() => {
    const m = window.location.pathname.match(/^\/s\/([0-9a-f]{8})$/i);
    if (!m) return;
    const code = m[1].toLowerCase();
    if (joinedShortCodeRef.current === code) return;
    joinedShortCodeRef.current = code;
    setPanelMode('connecting');
    void joinWithShortCode(code).then((res) => {
      if (!res.success) {
        // Dead link — back to the landing screen; the user can pair manually.
        if (session.roomId === null) setPanelMode('idle');
      }
    }).catch(() => { if (session.roomId === null) setPanelMode('idle'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.location.pathname]);
  // Set when the creator deliberately backs out of the connecting screen.
  // While set (until the link opens or the room changes) the auto-sync must
  // not bounce them straight back to 'connecting' — that would make the
  // escape hatch a lie. The sending panel still shows the live handshake in
  // place of the code, so nothing is hidden; it just stops taking over.
  const creatorLeftConnectingRef = useRef(false);

  /* --- device name editing --- */
  const startEditName = () => {
    setDraftName(session.deviceName);
    setEditingName(true);
  };
  const saveName = () => {
    const clean = sanitizeDeviceName(draftName);
    if (clean) setDeviceName(clean);
    setEditingName(false);
  };

  // "The channel has opened for this room." Once true, a later
  // partnerConnecting (peer_recovered after a drop) is a RECONNECT, not a
  // first connect: the room stays up — ChatView's reconnect banner is the
  // right surface — instead of bouncing back to the connecting screen.
  const everConnectedRoomRef = useRef<string | null>(null);
  const everConnectedRef = useRef(false);
  /* --- stuck-handshake honesty ------------------------------------------- */
  // A connecting screen that spins forever teaches users the app is broken.
  // Two thresholds, one message each: 15s "still trying, hang on" (with a
  // creator-side retry), 40s "the other device may have left" (the truth).
  const [stuckConnecting, setStuckConnecting] = useState(false);
  const [longStuckConnecting, setLongStuckConnecting] = useState(false);
  // Creator-side retry: re-seat the session and re-offer. The joiner side has
  // no such button — its only honest exit is cancel + fresh code, because
  // the joiner cannot re-offer (only the initiator can).
  const handleStuckRetry = useCallback(() => { void requestReconnect(); }, [requestReconnect]);
  useEffect(() => {
    if (panelMode !== 'connecting') {
      setStuckConnecting(false);
      setLongStuckConnecting(false);
      return;
    }
    const t1 = setTimeout(() => setStuckConnecting(true), 15_000);
    const t2 = setTimeout(() => setLongStuckConnecting(true), 40_000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [panelMode, session.roomId, session.partnerConnecting]);
  /* --- panel mode sync --- */
  useEffect(() => {
    if (session.roomId !== everConnectedRoomRef.current) {
      everConnectedRoomRef.current = session.roomId;
      everConnectedRef.current = false;
      creatorLeftConnectingRef.current = false;
    }
    if (session.partnerConnected) {
      everConnectedRef.current = true;
      creatorLeftConnectingRef.current = false;
    }
    if (session.partnerConnected) setPanelMode('connected');
    // Multi-device room (3+ members): this device is SEATED — the room is
    // real even before a personal WebRTC link opens (link-on-demand means a
    // member may hold NO link). Hiding behind "connecting" would strand
    // senders on a handshake screen inside their own room.
    else if ((session.peers?.length ?? 0) > 2 && session.roomId) setPanelMode('connected');
    // Once the channel has opened for this room, a later partnerConnecting is
    // a reconnect (handled above), never a first connect.
    else if (session.roomId && everConnectedRef.current) setPanelMode('connected');
    // A peer joined (either side) and the channel isn't open yet — the
    // connecting screen takes over until it is. The creator can opt out of
    // this takeover by backing out (creatorLeftConnectingRef); the handshake
    // still renders inline on their pairing screen.
    else if (session.partnerConnecting && session.roomId && !creatorLeftConnectingRef.current) setPanelMode('connecting');
    // Transient drop (peer lost the link, tab reloaded, network blip): stay
    // in the room so the reconnect banner + retry live where the transfer
    // was, instead of bouncing the creator back to the pairing screen and
    // hiding the in-flight messages.
    else if (session.roomId && session.connectionType === 'disconnected') setPanelMode('connected');
    else if (session.roomId && session.isCreator) setPanelMode('sending');
    else if (session.roomId && !session.isCreator) setPanelMode(p => (p === 'connecting' ? 'connecting' : 'receiving'));
    else if (!session.roomId) setPanelMode('idle');
  }, [session.roomId, session.isCreator, session.partnerConnected, session.partnerConnecting, session.connectionType]);

  /* --- tab status light (pill favicon + live title, room UI only) ---
     `connected` panel = the room UI is on screen. Landing, pairing and
     connecting screens keep the pristine tab identity. */
  const roomViewMounted = panelMode === 'connected';
  useEffect(() => {
    setRoomBadgeActive(roomViewMounted);
    return () => setRoomBadgeActive(false); // unmount → exact landing restore
  }, [roomViewMounted]);
  useEffect(() => {
    updateRoomBadge({
      inRoomView: roomViewMounted,
      connected: partnerLinkHealthy,
      // Amber covers both first handshake and stall/recovery — neither is
      // the user's fault, and neither is a red "problem".
      connecting: session.connectionType === 'connecting' || session.connectionType === 'establishing' || (session.roomId !== null && !partnerLinkHealthy && session.connectionType !== 'disconnected'),
      partnerName: session.partnerName,
      unread: 0, // future: unread count when the tab is hidden
    });
  }, [roomViewMounted, partnerLinkHealthy, session.connectionType, session.partnerName, session.roomId]);

  // The QR overlay is a pairing tool — the moment the partner is actually
  // connected it has done its job. Close it automatically so the user never
  // has to dismiss it themselves while the room is already taking over.
  useEffect(() => {
    if (session.partnerConnected && !qrDismissedForRoomRef.current) {
      qrDismissedForRoomRef.current = session.roomId;
      setShowQROverlay(false);
    }
  }, [session.partnerConnected, session.roomId]);
  // One celebration per room, at the true channel-open moment. Once it has
  // played, reconnects and drops never replay it — the room's own banner
  // owns those stories.
  useEffect(() => {
    if (!session.partnerConnected || !session.roomId) return;
    if (celebratedRoomRef.current === session.roomId) return;
    celebratedRoomRef.current = session.roomId;
    if (!session.isCreator) return;
    setCelebrateConnected(true);
    const timer = setTimeout(() => setCelebrateConnected(false), 1600);
    return () => clearTimeout(timer);
  }, [session.partnerConnected, session.roomId, session.isCreator]);

  // Keep panelMode honest when session flags move without a panel action:
  //  · creator: peer starts joining → handshake replaces the code screen
  //  · creator: peer gave up before the link opened → back to the code screen
  //  · joiner:  code accepted / link re-establishing (incl. post-refresh
  //             restore) → handshake until the channel actually opens
  // A settled 'connected' panel is never bounced by this effect — transient
  // drops keep the room visible with its reconnect banner.
  useEffect(() => {
    if (!session.roomId) return;
    if (session.isCreator) {
      if (session.partnerConnecting && !creatorLeftConnectingRef.current) setPanelMode(p => (p === 'connected' ? p : 'connecting'));
      else if (!session.partnerConnected) setPanelMode(p => (p === 'connecting' ? 'sending' : p));
    } else {
      const linking = session.partnerConnecting || session.connectionType === 'establishing' || session.connectionType === 'connecting';
      if (linking) setPanelMode(p => (p === 'connected' ? p : 'connecting'));
    }
  }, [session.roomId, session.isCreator, session.partnerConnected, session.partnerConnecting, session.connectionType]);

  // Focus traps for QR overlays
  const qrScanTrapRef = useFocusTrap(showQRScan, () => setShowQRScan(false));
  const qrDisplayTrapRef = useFocusTrap(showQROverlay, () => setShowQROverlay(false));

  /* --- handlers --- */
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;
  const createAbortRef = useRef(0);

  /**
   * Map a thrown connect failure to { translated copy, icon key }.
   * Replaces the old substring matching on raw English strings, which never
   * matched the actual copy and surfaced untranslated errors. Each branch
   * names the real cause: the device's network, our service, or timing.
   */
  const friendlyConnectError = useCallback((e: unknown): { text: string; icon: 'offline' | 'server' | 'time' | 'info' } => {
    const code = describeConnectFailure(e);
    if (code === 'OFFLINE') return { text: t('err.offline'), icon: 'offline' };
    if (code === 'UNREACHABLE') return { text: t('err.unreachable'), icon: 'server' };
    if (code === 'CONFIG') return { text: (e instanceof Error && e.message) || t('err.config'), icon: 'server' };
    if (code === 'RATE_LIMITED') return { text: t('err.ratelimited'), icon: 'time' };
    if (code === 'TIMEOUT') return { text: t('err.timeout2'), icon: 'time' };
    // REJECTED: the server named the real cause — translate it here by code
    // so every locale gets native copy (never raw English from the backend).
    if (e instanceof ConnectError && e.code === 'REJECTED') {
      const msgKey = errCodeToKey(e.serverCode);
      if (msgKey) return { text: t(msgKey), icon: 'info' };
    }
    if (e instanceof Error && e.message && !/^CONNECT|^[A-Z_]+$/.test(e.message) && signalingConfigIssue()) {
      return { text: e.message, icon: 'info' };
    }
    return { text: t('err.generic'), icon: 'info' };
  }, [t]);

  // Synchronous re-entry guard: isCreating is state and only lands a render
  // later, so two taps in the same tick (double-click Send, or hero +
  // fallback chip) could start TWO room creations. The loser still resolves
  // server-side and resurrects a phantom pairing screen over whichever panel
  // the user chose next — the F25 cancel→receive→join probe showed it eat a
  // valid join outright. A ref closes the same-tick window.
  const creatingRef = useRef(false);
  const handleSend = useCallback(async () => {
    if (creatingRef.current || isCreating) return;
    creatingRef.current = true;
    productEvent('product.first_interaction');
    productEvent('product.method_code'); // Send = create room → the code/QR/link path
    setPanelMode('sending');
    setIsCreating(true);
    setCreateError(null);
    // Latch for the fallback chips' short poll ("open the QR once the room
    // exists"): false while attempting, true only on success.
    (window as Window & { __stRoomReady?: boolean }).__stRoomReady = false;
    const thisAttempt = ++createAbortRef.current;
    try {
      await createSession();
      if (thisAttempt === createAbortRef.current) {
        setRetryCount(0);
        (window as Window & { __stRoomReady?: boolean }).__stRoomReady = true;
        // The tracker no longer bumps at room creation — it counts real
        // two-device connections (the data channel opening), matching the
        // honest server-side increment.
      } else {
        // Cancelled/superseded while this room was still being created: the
        // server now has a room nobody wants. Close it instead of letting the
        // resurrected creator session stomp the panel the user chose (the
        // phantom "Code active" screen that swallowed the next join).
        abandonSession();
      }
    } catch (e: unknown) {
      if (thisAttempt !== createAbortRef.current) return;
      setCreateError(friendlyConnectError(e));
      setPanelMode('idle');
    } finally {
      creatingRef.current = false;
      if (thisAttempt === createAbortRef.current) setIsCreating(false);
    }
  }, [isCreating, createSession, t, friendlyConnectError, abandonSession]);

  // Fresh attempt hygiene: tapping Receive always lands on an UNLOCKED,
  // empty capsule — a previous attempt's in-flight or accepted state must
  // never carry over into the new one.
  const handleReceive = useCallback(() => {
    productEvent('product.first_interaction');
    clearAcceptBeat();
    setIsJoining(false);
    setPanelMode('receiving');
    setCreateError(null);
    setJoinError(null);
  }, [clearAcceptBeat]);

  // Fallback-chip actions: "Show QR" / "Share link" create the room first
  // (if none exists), then surface the exact QR/link modal the normal send
  // flow uses. Reuses handleSend's error handling verbatim — one honest
  // failure path, not two.
  const waitForRoom = (onReady: () => void) => {
    const started = Date.now();
    const iv = setInterval(() => {
      if ((window as Window & { __stRoomReady?: boolean }).__stRoomReady) {
        clearInterval(iv);
        onReady();
      } else if (Date.now() - started > 8000) clearInterval(iv);
    }, 120);
  };
  const handleSendThenQr = useCallback(async () => {
    if (session.roomId) { setShowQROverlay(true); return; }
    await handleSend();
    // createSession may still be in flight; open the overlay once the room
    // exists. Short poll instead of wiring a new state channel.
    waitForRoom(() => setShowQROverlay(true));
  }, [session.roomId, handleSend]);
  const handleSendThenLink = useCallback(async () => {
    if (session.roomId) { void copyLink(); return; }
    await handleSend();
    waitForRoom(() => { void copyLink(); });
    // copyLink/shareUrl are declared later in the component — routing the
    // call through a ref keeps this callback dependency-clean.
  }, [session.roomId, handleSend]);

  // Drop-to-send handlers live after handleSend so the dep array can reference
  // it. The drop parks the FileList on window, then creates the room; the
  // parked bytes are picked up on mount by ChatView (see __stHomeDropFiles).
  const homeDropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHomeDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    homeDropDepth.current += 1;
    setHomeDrop(true);
  }, []);
  const onHomeDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onHomeDragLeave = useCallback(() => {
    homeDropDepth.current = Math.max(0, homeDropDepth.current - 1);
    if (homeDropDepth.current === 0) setHomeDrop(false);
  }, []);
  const onHomeDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    homeDropDepth.current = 0;
    setHomeDrop(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    // Park the FileList: createSession() must finish before ChatView mounts,
    // and a synthetic event's FileList dies with it.
    const parked: File[] = Array.from(files);
    if (homeDropTimer.current) clearTimeout(homeDropTimer.current);
    homeDropTimer.current = setTimeout(() => {
      (window as Window & { __stHomeDropFiles?: File[] }).__stHomeDropFiles = parked;
      void handleSend();
    }, 0);
  }, [handleSend]);
  // The nearby section's fallback ("Can't see your device? → Use another
  // way") reaches straight into the hero's Receive flow — one window-level
  // hook, set here where the state lives, so the discovery area never needs
  // its own copy of the pairing UI.
  useEffect(() => {
    (window as Window & { __stOpenReceive?: () => void }).__stOpenReceive = handleReceive;
    return () => { delete (window as Window & { __stOpenReceive?: () => void }).__stOpenReceive; };
  }, [handleReceive]);
  // Fallback chips: "Show QR" / "Share link" — create the room when none is
  // live, then surface the QR overlay / copy the link. Idle-only by design:
  // once connected, the chat header and details sheet carry these actions.
  useEffect(() => {
    if (panelMode !== 'idle') return;
    const w = window as Window & { __stOpenSendQr?: () => void; __stOpenSendLink?: () => void };
    w.__stOpenSendQr = () => { productEvent('product.qr_opened'); void handleSendThenQr(); };
    w.__stOpenSendLink = () => { void handleSendThenLink(); };
    return () => { delete w.__stOpenSendQr; delete w.__stOpenSendLink; };
  }, [panelMode, handleSendThenQr, handleSendThenLink]);

  // Command bar wiring — REAL callbacks, not DOM scraping: the palette's
  // Send/Receive entries invoke the same handlers as the hero buttons, on
  // the same panel-mode state machine.
  useEffect(() => {
    const w = window as Window & { __stCommandSend?: () => void; __stCommandReceive?: () => void };
    w.__stCommandSend = () => { void handleSend(); };
    w.__stCommandReceive = () => handleReceive();
    return () => { delete w.__stCommandSend; delete w.__stCommandReceive; };
  }, [handleSend, handleReceive]);

  // One-tap re-entry into the last Stay Connected room. False = the room
  // is really gone (close/expiry) — say so instead of blinking the button.
  const handleStayRejoin = useCallback(async () => {
    if (isRejoining) return;
    setIsRejoining(true);
    const ok = await rejoinStayRoom();
    setIsRejoining(false);
    if (!ok) setStayGone(true);
  }, [isRejoining, rejoinStayRoom]);

  /* --- Esc on desktop opens the disconnect confirmation -------------------
     Only when a room is live and nothing else is open — otherwise Esc
     does its own job (closing menus, sheets, the image viewer). Mobile
     back is handled in ChatView (history guard) — this is the desktop half. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as Window & { __stImageViewerOpen?: boolean };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (panelMode !== 'connected') return; // rooms only
      if (w.__stImageViewerOpen) return;     // photo owns this Escape
      // Menus/sheets/overlays close themselves first (their own handlers);
      // the guard only ADDS the disconnect confirmation when nothing else
      // is open — any dialog mounting its own Esc handling must win.
      if (confirmDisconnect || showSettings) return;
      // Any open layer owns this Escape — including non-dialog popovers
      // (role=menu/listbox). Missing them here opened the destructive
      // disconnect sheet while a user was merely dismissing a menu.
      if (document.querySelector('[role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]')) return;
      setConfirmDisconnect(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelMode, confirmDisconnect, showSettings]);

  // Synchronous double-submit guard: the 6th-digit auto-submit and a user
  // pressing Enter can both fire before the isJoining state re-render lands.
  // Two joins = the server sees a churn of leave/join events (the "connection
  // flickers" real-world symptom), so the ref closes that same-tick window.
  const joiningRef = useRef(false);
  // Same resurrection guard for joins: a code accepted server-side AFTER the
  // user backed out must not re-assert the room over the landing.
  const joinAbortRef = useRef(0);
  const handleCodeComplete = useCallback(async (code: string) => {
    if (joiningRef.current) return;
    if (isJoining) return;
    joiningRef.current = true;
    const thisJoin = ++joinAbortRef.current;
    setIsJoining(true);
    setJoinError(null);
    try {
      const res = await joinWithCode(code);
      if (thisJoin !== joinAbortRef.current) return; // user backed out mid-join; the newer flow owns the UI
      if (!res.success) {
        // REJECTED: the capsule takes over the telling — OtpInput shakes,
        // wipes every digit and refocuses slot 0; these words say why.
        setIsJoining(false);
        setJoinError(res.error || t('err.codeInactive'));
      } else {
        // ACCEPTED: green beat, then the existing success transition — the
        // connecting panel with the handshake — takes over. isJoining stays
        // true through the beat so the capsule cannot fire a second join.
        setCodeAccepted(true);
        const beat = reduceMotion ? 0 : 480;
        acceptBeatRef.current = window.setTimeout(() => {
          acceptBeatRef.current = null;
          setCodeAccepted(false);
          // The beat is over: unlock the entry UI. The receiving panel is
          // unmounting for the connecting panel, but if that transition is
          // ever interrupted (Esc, route change) the capsule must not be
          // left permanently disabled.
          setIsJoining(false);
          // The channel can open FASTER than the beat (same-machine links
          // do). The panel-sync effect has already moved us to 'connected'
          // by then, and stomping it back to 'connecting' would strand the
          // joiner on the handshake screen forever — so only take over if
          // the room hasn't already arrived.
          setPanelMode(p => (p === 'connected' ? p : 'connecting'));
        }, beat);
      }
    } catch (e: unknown) {
      if (thisJoin !== joinAbortRef.current) return;
      setIsJoining(false);
      // Same honest classification as the Send path: no more generic
      // "check your internet" for what might be a dead service.
      setJoinError(friendlyConnectError(e).text);
    } finally {
      joiningRef.current = false;
    }
  }, [isJoining, joinWithCode, t, friendlyConnectError, reduceMotion, clearAcceptBeat]);

  const handleDisconnect = useCallback(() => { createAbortRef.current++; joinAbortRef.current++; setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null); clearAcceptBeat(); setIsJoining(false); }, [abandonSession, clearAcceptBeat]);
  const handleCancel = useCallback(() => {
    createAbortRef.current++;
    joinAbortRef.current++;
    clearAcceptBeat();
    setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null); setIsJoining(false);
  }, [abandonSession, clearAcceptBeat]);
  // Dismiss the connecting overlay. The creator goes back to their pairing
  // screen (the room stays open — the peer can still connect); the joiner
  // abandons and can enter a fresh code.
  const dismissConnecting = useCallback(() => {
    if (session.isCreator) { creatorLeftConnectingRef.current = true; setPanelMode('sending'); return; }
    createAbortRef.current++;
    joinAbortRef.current++;
    clearAcceptBeat();
    setIsJoining(false);
    setPanelMode('idle'); abandonSession(); setJoinError(null);
  }, [session.isCreator, abandonSession, clearAcceptBeat]);

  /* --- derived --- */
  const shareUrl = session.roomId ? `${window.location.origin}/s/${shortCodeOf(session.roomId)}` : '';
  const qrCode = session.secret ? generateTOTP(session.secret, session.createdAt) : '';
  const qrValue = qrCode ? `${shareUrl}?c=${qrCode}` : '';
  // shareUrl changes when the room is created; copyLink may be invoked from
  // a callback that captured an earlier render (fallback chip after
  // createSession). The ref keeps every caller honest.
  const shareUrlRef = useRef('');
  shareUrlRef.current = shareUrl;
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareUrlRef.current); } catch {} setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); };
  // "Share link" fallback chip: reuse the live room if one exists, otherwise
  // create it, then copy — the link chip must never silently do nothing.

  const copyCode = async () => { const c = session.secret ? generateTOTP(session.secret, session.createdAt) : ''; try { await navigator.clipboard.writeText(c); } catch {} setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); };
  const handleQRScan = useCallback((text: string) => {
    try {
      const url = new URL(text);
      const code = url.searchParams.get('c');
      if (code) { setShowQRScan(false); handleCodeComplete(code); }
      else if (/^\d{6}$/.test(text.trim())) { setShowQRScan(false); handleCodeComplete(text.trim()); }
    } catch {
      if (/^\d{6}$/.test(text.trim())) { setShowQRScan(false); handleCodeComplete(text.trim()); }
    }
  }, [handleCodeComplete]);
  const shareLink = async () => { if (navigator.share) { try { await navigator.share({ title: 'ShareTexts', url: shareUrl }); return; } catch {} } await copyLink(); };

  /* ---------------------------------------------------------------- */
  /*  LEFT / TOP PANEL                                                */
  /* ---------------------------------------------------------------- */
  const isMobileDevice = useIsMobileDevice();
  // Which device am I? The connected state shows two physical devices, so the
  // "this device" tile must match reality — a phone on phones, a screen on
  // desktops — instead of always drawing a phone.
  const ThisDeviceIcon = isMobileDevice ? Smartphone : Monitor;
  const PartnerDeviceIcon = isMobileDevice ? Monitor : Smartphone;
  // Presence dock data (rail): this device first — it is always here while
  // the room is — then every other device with its OWN link state, so a
  // multi-device room reads as a row of tiles instead of a sentence. The
  // classic two-device room has no roster rows, so the connected partner
  // becomes the single peer tile.
  const peerRows = (session.peers ?? []).filter(p => !p.isSelf);
  const otherTiles: PresenceEntry[] = peerRows.length > 0
    ? peerRows.map(p => ({
        id: p.id,
        label: p.name,
        icon: /mobile|phone|ios|android/i.test(p.platform || '') ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />,
        state: p.link === 'connected' ? 'connected' : (p.link === 'connecting' || p.link === 'reconnecting') ? 'connecting' : 'offline',
      }))
    : (session.partnerName || session.partnerConnected)
      ? [{
          id: 'partner',
          label: session.partnerName ?? t('connect.otherDevice'),
          icon: <PartnerDeviceIcon className="w-4 h-4" />,
          state: session.partnerConnected ? 'connected' as const : 'connecting' as const,
        }]
      : [];
  const presenceEntries: PresenceEntry[] = [
    { id: 'self', label: session.deviceName, icon: <ThisDeviceIcon className="w-4 h-4" />, state: 'connected', isSelf: true },
    ...otherTiles,
  ];
  const roomRosterCount = presenceEntries.length;
  // No ambient blobs: colored blur washes were template decor. The paper
  // canvas and the tile composition carry the screen now — quiet is the
  // luxury.
  const ambientGlow = null;
  const headerNode = (
    <header className="shrink-0 sticky top-0 z-30 h-14 flex items-center justify-between px-6 lg:px-10 bg-apple-canvas/90 dark:bg-night-900/90 backdrop-blur-xl border-b border-black/[0.05] dark:border-white/[0.06] relative">
        {/* Brand lockup — the shared BrandLockup: mark + wordmark as ONE
            equal-height object, display-face wordmark, minimal gap. */}
        <BrandLockup />
        {/* One rhythm for every header control — desktop AND mobile. Each
            item is a 40px-tall slot on a tight gap grid; icons are uniform
            18px. Docs and language sit closest (one shared cluster), the
            theme toggle breathes a little after them. */}
        <div className="flex items-center gap-1">
          <CommandBarChip onClick={() => { productEvent('product.diagnostics_opened'); setCmdOpen(true); }} />
          <LanguageMenu />
          {/* Docs sits BETWEEN the language and theme toggles (user request) —
              same 40px slot, same quiet icon style as its neighbors; the
              footer link stays too. */}
          <IconButton3D label={t('nav.docs')} href="/docs">
            <BookOpen className="w-[18px] h-[18px]" strokeWidth={1.5} aria-hidden />
          </IconButton3D>
          {/* In the ROOM the header carries no theme switch: the room already
              has a settings sheet whose first row IS the theme control, and a
              second switch beside it — looking exactly like the Stay
              Connected pill below — made "which toggle is which" a puzzle on
              a screen the user is supposed to be sharing files from. */}
          {panelMode !== 'connected' && <ThemeToggle />}
        </div>
        {/* Spotlight bar: a hairline of brand light where the sticky header
            meets the page, so the seam reads as intentional depth rather
            than a border. */}
        <span aria-hidden className="st-spotlight absolute -bottom-px left-1/2 -translate-x-1/2 h-px w-[min(560px,72%)] opacity-70" />
    </header>
  );

  const idleHeroNode = (
            // Deterministic first paint: the hero renders visible immediately;
            // only the swap-out fades. Never gate first paint on animation.
            <motion.div key="idle" exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="w-full max-w-[470px] mx-auto flex flex-col">
              {/* Flex + order: H1 → subtitle → live tracker → actions. The
                  tracker is passive status, so it lives ABOVE the action
                  cluster — status never interrupts the Send/Receive flow
                  (usability audit #6). */}
              <h1 className="st-display order-1 text-[34px] sm:text-[40px] lg:text-[48px] xl:text-[52px] text-apple-ink dark:text-white text-center sm:text-left text-balance">
                {(() => { const [a, b] = t('home.title').split('\n'); return (<>{a}{b ? <><br />{b}</> : null}</>); })()}
              </h1>
              {/* whitespace-pre-line honors the subtitle's deliberate line
                  break ("No app. No account. No cable." / "Just open …"). */}
              <p className="st-h-sub order-2 mt-3.5 text-[16.5px] sm:text-[18px] lg:text-[19px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed max-w-[40ch] text-center sm:text-left whitespace-pre-line">
                {t('home.subtitle')}
              </p>
              {/* Live activity tracker — bare (NO pill): a breathing dot, the
                  lifetime count, and the label. Honest, local — no fabricated
                  floor: until the service answers with a real total (and no
                  nearby device is speaking over it) the line stays hidden
                  rather than inventing longevity. QUIET by rank: it is
                  metadata, so it whispers — the Send/Receive pair owns this
                  screen. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="st-chip order-2 mt-4 gap-2 w-fit mx-auto lg:mx-0 px-3"
              >
                {/* Halo dot: two slow radar rings drift outward from a solid
                    glowing core — layered, staggered, so it reads as breath,
                    not alarm. Halts under prefers-reduced-motion. */}
                <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0" aria-hidden>
                  <span className="st-halo-ring absolute inset-0 rounded-full bg-status-success/40" />
                  <span className="st-halo-ring st-halo-lag absolute inset-0 rounded-full bg-status-success/25" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-status-success shadow-[0_0_6px_rgba(52,199,89,0.7)]" />
                </span>
                {nearbyStatus ? (
                  <span className="text-[13.5px] font-medium text-apple-ink-muted dark:text-white/55 leading-none">{nearbyStatus}</span>
                ) : roomsCreated != null ? (
                  <>
                    <span className="text-[16px] font-bold text-apple-ink/90 dark:text-white/90 tnum leading-none">{roomsCreated.toLocaleString()}</span>
                    <span className="text-[13.5px] font-medium text-apple-ink-muted/85 dark:text-white/50 leading-none">{t('home.roomsMade')}</span>
                  </>
                ) : null}
              </motion.div>
              {/* Equal-width grid: the two primary actions share ONE geometry
                  (audit #12 — Receive rendered wider than Send), and each
                  hint sits directly beneath its own button so the
                  label↔action mapping is unambiguous (audit #11). */}
              <div className="order-3 mt-6 grid grid-cols-2 gap-x-3 gap-y-1 max-w-[400px] mx-auto sm:mx-0">
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <TactileButton onClick={handleSend} variant="primary" size="lg" data-testid="home-send" className="w-full lg:text-[16px] lg:min-h-[56px]" icon={<SendCircleIcon size={18} />} disabled={isCreating}>{t('home.send')}</TactileButton>
                  <span className="text-[12.5px] font-medium text-apple-ink-muted/70 dark:text-white/45">{t('home.sendHint')}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  {/* One filled primary and one quiet surface keep the two
                      equally valid actions distinct at a glance. */}
                  <TactileButton onClick={handleReceive} variant="secondary" size="lg" data-testid="home-receive" className="w-full lg:text-[16px] lg:min-h-[56px]" icon={<ReceiveCircleIcon size={18} className="text-ember dark:text-azure-400" />}>{t('home.receive')}</TactileButton>
                  <span className="text-[12.5px] font-medium text-apple-ink-muted/70 dark:text-white/45">{t('home.receiveHint')}</span>
                </div>
              </div>
              {/* Stay Connected re-entry: the room this device promised to
                  keep alive is one tap away — history included. Only shown
                  when idle AND not currently seated elsewhere. */}
              <AnimatePresence>
                {(() => {
                  const stay = session.lastStayRoom;
                  if (!stay || stayGone) return null;
                  // The card earns trust by showing real, local facts: who
                  // this room was with, how much history it holds, and when
                  // it was last used. Nothing here is fabricated.
                  const facts: string[] = [];
                  if (stay.partnerName) facts.push(stay.partnerName);
                  if (typeof stay.messageCount === 'number' && stay.messageCount > 0) {
                    facts.push(t('stay.rejoinMsgs', { n: stay.messageCount.toLocaleString() }));
                  }
                  if (typeof stay.lastActiveAt === 'number') {
                    const d = new Date(stay.lastActiveAt);
                    const today = new Date();
                    const isToday = d.toDateString() === today.toDateString();
                    const isYesterday = new Date(today.getTime() - 86_400_000).toDateString() === d.toDateString();
                    facts.push(isToday ? t('time.today')
                      : isYesterday ? t('time.yesterday')
                      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
                  }
                  return (
                    <motion.div
                      key="stay-rejoin"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
                      className="order-6 mt-5 w-full"
                    >
                      <button
                        type="button"
                        data-testid="stay-rejoin"
                        onClick={handleStayRejoin}
                        disabled={isRejoining}
                        className="group w-full flex items-center gap-3.5 pl-3.5 pr-3 py-3 rounded-[16px] st-card hover:border-ember/45 dark:hover:border-azure-400/50 active:scale-[0.985] transition-all duration-200 text-left disabled:opacity-60"
                      >
                        <span className="relative shrink-0 w-9 h-9 rounded-full bg-ember/10 dark:bg-azure-400/15 flex items-center justify-center text-ember dark:text-azure-400" aria-hidden>
                          {/* Live pulse: this room is still breathing upstream. */}
                          <span className="absolute inset-0 rounded-full bg-ember/20 dark:bg-azure-400/20 st-halo-ring motion-reduce:animate-none" />
                          <InfinityIcon className="relative w-4 h-4" strokeWidth={2} />
                        </span>
                        <span className="flex-1 flex flex-col min-w-0 gap-0.5 leading-tight">
                          <span className="text-[13px] font-semibold text-apple-ink dark:text-white">
                            {isRejoining ? t('stay.rejoining') : t('stay.rejoinTitle')}
                          </span>
                          {facts.length > 0 ? (
                            <span className="flex items-center gap-1.5 text-[13px] font-medium text-apple-ink-muted dark:text-white/45 min-w-0">
                              {facts.map((f, i) => (
                                <span key={i} className="flex items-center gap-1.5 min-w-0">
                                  {i > 0 && <span className="opacity-50" aria-hidden>·</span>}
                                  <span className="truncate">{f}</span>
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/45 truncate">
                              {t('stay.rejoinHint')}
                            </span>
                          )}
                        </span>
                        {/* The whole card is already the target, so the
                            trailing glyph is an ARROW, not a second circle.
                            Two circles in one row (ember glyph left, grey
                            button right) made the card read as a pair of
                            buttons rather than one thing you tap. */}
                        <ArrowRightLeft className="shrink-0 w-4 h-4 text-apple-ink-muted/70 dark:text-white/40 group-hover:text-ember dark:group-hover:text-azure-400 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                      </button>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
              {/* Temporary Space — a SECTION now, not two stray links. The
                  label row carries the promise ("up to 7 days"), the buttons
                  carry the two verbs, and a space that is nearly over says so
                  on its own row. One heading level below the hero: quiet
                  caps + a hairline, so the eye can skip it entirely when it
                  only came here to send a file. */}
              <div className="order-6 mt-6 w-full flex flex-col gap-2.5" data-testid="space-entry">
                {/* One sentence, not a section divider. The old treatment —
                    an ALL-CAPS label, a hairline running to the right edge,
                    and a trailing hint — is the single most templated thing
                    on this page: it announces a section instead of saying
                    something. Same words, same order, no rule, sentence case,
                    so the line reads as a thought rather than a heading. */}
                <p className="flex items-center gap-1.5 text-[12.5px] text-apple-ink-muted/70 dark:text-white/40">
                  <Clock3 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  <span className="font-medium text-apple-ink-muted dark:text-white/55">{t('space.entryTitle')}</span>
                  <span aria-hidden className="opacity-40">·</span>
                  <span>{t('space.entryHint')}</span>
                </p>
                {recent.map(r => {
                  const msLeft = r.expiresAt - nowTick;
                  // Under an hour left, the row says so in ember — the one
                  // moment a temporary shelf deserves your attention.
                  const urgent = msLeft < 3_600_000;
                  return (
                    <button
                      key={r.spaceId}
                      type="button"
                      onClick={() => { window.location.href = `/space/${r.spaceId}`; }}
                      className="group w-full flex items-center gap-3 pl-3 pr-3 py-2.5 min-h-[52px] rounded-[16px] st-card hover:border-ember/45 dark:hover:border-azure-400/50 active:scale-[0.99] transition-all text-left"
                    >
                      <span className={cn(
                        'shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center',
                        urgent
                          ? 'bg-ember/12 dark:bg-ember/18 text-ember dark:text-azure-400'
                          : 'bg-black/[0.045] dark:bg-white/[0.07] text-apple-ink-muted dark:text-white/50'
                      )} aria-hidden>
                        <Clock3 className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-[13.5px] font-semibold text-apple-ink dark:text-white/85 truncate">{r.name}</span>
                        <span className={cn(
                          'text-[11.5px] font-medium tabular-nums',
                          urgent ? 'text-ember dark:text-azure-400 font-semibold' : 'text-apple-ink-muted/80 dark:text-white/40'
                        )}>
                          {t('space.closesIn', { time: remainingShortOf(msLeft) })}
                        </span>
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-azure-600 dark:text-azure-400">
                        {t('space.reopen')}
                        <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                      </span>
                    </button>
                  );
                })}
                {/* One pill, two verbs — each half keeps a real 40px floor so
                    the segmented control honours the same touch contract as
                    every other control (it shipped at 36px; audit caught it). */}
                <div className="flex w-full sm:w-fit items-stretch rounded-full st-card p-1">
                  <button
                    type="button"
                    onClick={() => setSpaceSheet('create')}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-full text-[13px] font-semibold text-apple-ink/75 dark:text-white/65 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-[0.97] transition-all"
                    data-testid="space-create-entry"
                  >
                    <Plus className="w-4 h-4 text-ember dark:text-azure-400" aria-hidden />
                    {t('space.createCta')}
                  </button>
                  <span className="w-px my-1.5 bg-apple-divider dark:bg-white/10" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setSpaceSheet('join')}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-full text-[13px] font-semibold text-apple-ink/75 dark:text-white/65 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-[0.97] transition-all"
                    data-testid="space-join-entry"
                  >
                    <Link2 className="w-4 h-4 text-apple-ink-muted dark:text-white/45" aria-hidden />
                    {t('space.joinTitle')}
                  </button>                </div>
              </div>
              {/* The rating, and only for people who have actually used the
                  app (a room that ended): a quiet one-line row where their
                  eye already is when they come back. Inline, one tap to
                  snooze, one tap to never ask again — no modal, no badge, no
                  interruption of anything else on this screen. */}
              <RateCard autoShow className="order-7 mt-5 w-full" />
              {/* The product, as it actually looks — laptop + phone running
                  the real connected UI. F24: the demo moves UP the stack on
                  mobile (right under the actions) so the first screen carries
                  the whole story — what it does, what you can do, what it
                  looks like — with discovery and the quiet tail one scroll
                  below. Mobile runs the SAME full scene as desktop — laptop +
                  phone + the channel between them (design owner: the transfer
                  story needs both ends; a phone-only crop hid the other half).
                  order-4 lg:hidden keeps it out of the desktop DOM — display:
                  none hides it from the eye, not from the tree. */}
              <div className="st-hide-landscape order-4 lg:hidden mt-5 sm:mt-7 mb-6 flex justify-center">
                <div className="w-full max-w-[420px] sm:max-w-[520px] px-1">
                  {/* Only mounted when the layout is actually the phone one.
                      `lg:hidden` alone would leave a second, invisible copy
                      of the whole demo in the desktop DOM. */}
                  {!isDesktopLayout && <HeroDeviceDemo />}
                </div>
              </div>
              {/* Nearby device discovery — the PRIMARY path (§1), and now
                  the first thing under the actions on BOTH layouts: it IS
                  "how devices connect". The old standalone hint line is
                  gone: the nearby block's own searching row says "Looking
                  for nearby devices…" in the same words, right where the
                  action is. One instruction on screen, never two. */}
              <div className="order-5 mt-6 w-full flex flex-col items-center lg:items-start">
                <div className="w-full max-w-md lg:max-w-none">
                  <NearbyDevices onStatus={setNearbyStatus} />
                </div>
              </div>
              {createError && (
                <SystemAlert
                  className="mt-4"
                  tone="danger"
                  icon={createError.icon}
                  action={{ label: t('home.retry'), onClick: handleSend, testId: 'create-retry' }}
                >
                  {createError.text}
                </SystemAlert>
              )}
            </motion.div>
  );

  const heroContent = (
    <AnimatePresence mode="sync">
          {/* ── IDLE ──────────────────────────────────────────────── */}
          {panelMode === 'idle' && idleHeroNode}

          {/* ── SENDING: pair the other device ────────────────────── */}
          {panelMode === 'sending' && (
            <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md w-full mx-auto overflow-hidden">
              {/* Back arrow leads the title — iOS navigation pattern. */}
              <div className="flex items-center gap-1 mb-4">
                <button onClick={handleCancel} aria-label={t('cancel')} className="flex items-center justify-center min-w-[40px] min-h-[40px] -ml-2 rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{t('create.title')}</h2>
              </div>
              {isCreating && !session.secret ? (
                <div className="flex flex-col items-center py-8">
                  <ShareTextsLogo size={20} motion="connecting" />
                  <p className="text-[14px] font-medium text-apple-ink-muted dark:text-white/50">{t('create.creating')}</p>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">{t('create.hint')}</p>
                  {/* The pairing screen keeps ONE two-device scene for its
                      whole life: the same tiles the user will see in the
                      room. Before a peer arrives it quietly searches; the
                      moment the peer joins it starts the handshake — no
                      component swap, no context switch — and when the
                      channel opens it draws the link and check. The code
                      stays below as the tool, never the story. */}
                  <AnimatePresence mode="wait" initial={false}>
                    {session.partnerConnecting && !session.partnerConnected ? (
                      <motion.div key="handshake" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: EASE }} className="py-3">
                        <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} partnerName={session.partnerName} />
                      </motion.div>
                    ) : (
                      <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {/* Searching state — the pair visual holds the screen
                            (spatial continuity with the room that follows);
                            the copy says the one true thing. */}
                        {!session.partnerConnecting && (
                          <div className="mb-4">
                            <ConnectHandshake phase="searching" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
                          </div>
                        )}
                        {session.secret && <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} onRefresh={refreshCode} />}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence initial={false}>
                    {!session.partnerConnecting && (
                      <motion.div key="pairing-actions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-5 space-y-2">
                    {/* One action hierarchy across home and pairing: QR is
                        primary; copy actions stay on the quiet surface. */}
                    <TactileButton onClick={() => setShowQROverlay(true)} variant="primary" size="md" className="w-full" icon={<QrCode className="w-4 h-4" />} data-testid="show-qr">
                      {t('create.showQr')}
                    </TactileButton>
                    <TactileButton onClick={shareLink} variant="secondary" size="md" className="w-full" icon={copiedLink ? <AnimatedIcon animate="check" active><Check className="w-4 h-4 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="link"><Link2 className="w-4 h-4 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}>
                      {copiedLink ? t('create.copied') : t('create.shareLink')}
                    </TactileButton>
                    <TactileButton onClick={copyCode} variant="secondary" size="md" className="w-full" icon={copiedCode ? <AnimatedIcon animate="check" active><Check className="w-3.5 h-3.5 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="copy"><Copy className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}>
                      {copiedCode ? t('create.codeCopied') : t('create.copyCode')}
                    </TactileButton>
                      </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          )}

          {/* ── RECEIVING: enter code ────────────────────────────── */}
          {panelMode === 'receiving' && (
            <motion.div key="receiving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto">
              <div className="flex items-center gap-1 mb-4">
                <button onClick={handleCancel} aria-label={t('cancel')} className="flex items-center justify-center min-w-[40px] min-h-[40px] -ml-2 rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{t('receive.title')}</h2>
              </div>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">{t('receive.hint')}</p>
              {/* The capsule stays mounted through the whole attempt — that
                  is what makes the interaction beats visible: verifying
                  locks it, a rejection shakes+wipes+refocuses it IN PLACE,
                  and an acceptance turns it green before the connecting
                  panel (the handshake scene both devices share) takes over. */}
              <motion.div key="code-entry" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <div className="p-6 bg-white dark:bg-surface-dark border border-apple-divider dark:border-white/10 rounded-[20px] shadow-card">
                  <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={joinError} accepted={codeAccepted} />
                </div>
                <p className="mt-4 text-[12px] text-apple-ink-muted/60 dark:text-white/35 text-center">{t('receive.note')}</p>
                {/* Scan QR — the alternative path, parked at the BOTTOM
                    of the code screen: type first, scan as fallback. */}
                <button onClick={() => setShowQRScan(true)} className="mt-5 w-full flex items-center justify-center gap-2 px-5 py-3 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] rounded-full text-[14px] font-semibold text-apple-ink dark:text-white min-h-[48px] transition-colors active:scale-[0.97]">
                  <QrCode className="w-4 h-4 text-apple-ink-muted dark:text-white/60" /> {t('receive.scan')}
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ── CONNECTING: code accepted, channel opening ────────── */}
          {panelMode === 'connecting' && (
            <motion.div key="connecting" data-testid="connecting-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto text-center">
              <div className="flex flex-col items-center py-6">
                {/* The handshake IS the connecting screen — and the first
                    beat of it is watched here on the joiner side, including
                    the moment the tiles settle into the room's own pair
                    visual (same tiles, same gap, same story). */}
                <ConnectHandshake
                  phase={session.partnerConnected ? 'connected' : 'connecting'}
                  localIcon={isMobileDevice ? 'phone' : 'monitor'}
                  partnerName={session.partnerName}
                />
                {/* Honest escalation, never an infinite spinner: at 15s the
                    link is slow (say so + offer retry); at 40s the other
                    device most likely left (say THAT, and hand back cleanly).
                    Psychology: uncertainty is the pain — naming the likely
                    cause with an action beats a spinner that outlives hope. */}
                {stuckConnecting ? (
                  <div className="mt-5 flex flex-col items-center gap-3">
                    <p className="text-[13.5px] font-medium text-apple-ink-muted dark:text-white/55 max-w-[280px] leading-relaxed">
                      {longStuckConnecting ? t('connect.stuckLong') : t('connect.stuck')}
                    </p>
                    {!longStuckConnecting && session.isCreator && (
                      <button
                        onClick={handleStuckRetry}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 rounded-full text-[13px] font-semibold text-apple-ink dark:text-white min-h-[40px] active:scale-[0.97] transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
                      </button>
                    )}
                  </div>
                ) : null}
                {/* Escape hatch: the creator returns to their pairing screen
                    (the room stays open); the joiner abandons and can enter a
                    fresh code. Never a trap. */}
                <button onClick={dismissConnecting} className="mt-6 flex items-center gap-1 text-[13px] font-semibold text-status-danger hover:bg-status-danger/10 px-3 py-2 min-h-[40px] rounded-full active:scale-95 transition-colors">
                  <X className="w-3.5 h-3.5" /> {t('cancel')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── CONNECTED: device pair + ready to transfer ───────── */}
          {panelMode === 'connected' && !celebrateConnected && (
            <motion.div key="connected" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }} className="max-w-md 2xl:max-w-lg mx-auto my-auto">
              {/* Desktop connected rail — decluttered. The room header already
                  carries identity (this ⇄ partner + live status) and the room
                  itself is the product; this rail keeps only what the header
                  can't say: your device's NAME (editable), the live session
                  stats, and the room controls. Everything else — the big tile
                  trio, the "ready to transfer" pitch, the lifetime strip, the
                  status pill — repeated the header or the stats card and
                  competed for attention. One column, one voice, room to
                  breathe. */}
              {/* Your device: name row (tap to rename) — the only identity
                  element here; the pair visual lives in the room header. */}
              <div className="flex items-center gap-2.5 mb-5">
                <span className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-ember/10 dark:bg-azure-400/10 border border-ember/15 dark:border-azure-400/15 shrink-0" aria-hidden>
                  <ThisDeviceIcon className="w-4.5 h-4.5 text-ember dark:text-azure-400" />
                </span>
                {editingName ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveName();
                      else if (e.key === 'Escape') { setDraftName(session.deviceName); setEditingName(false); }
                    }}
                    aria-label={t('pair.renameField')}
                    maxLength={32}
                    className="min-w-0 flex-1 text-[14px] font-semibold text-apple-ink dark:text-white bg-transparent border-b border-ember/50 dark:border-azure-400/50 outline-none px-0.5 py-1"
                  />
                ) : (
                  <button
                    onClick={startEditName}
                    title={t('pair.renameTitle')}
                    aria-label={t('pair.renameAria', { name: session.deviceName })}
                    className="group min-w-0 flex-1 min-h-[44px] flex items-center gap-1.5 text-left text-[14px] font-semibold text-apple-ink dark:text-white hover:text-apple-ink dark:hover:text-white transition-colors"
                  >
                    <span className="truncate">{session.deviceName}</span>
                    <Pencil className="w-3 h-3 shrink-0 text-apple-ink-muted/50 dark:text-white/35 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>

              {/* One-time notice when the auto-disambiguation renamed us. */}
                {session.nameAutoAdjusted && !dismissedNameNotice && (
                  <div role="status" className="st-band w-full sm:max-w-[340px] flex items-start gap-2 text-[12.5px] leading-snug">
                    <Info className="w-3.5 h-3.5 text-ember dark:text-azure-400 shrink-0 mt-px" />
                    <span className="flex-1">
                      {(() => { const parts = t('pair.autoRename', { name: '\u0000' }).split('\u0000'); return (<>{parts[0]}<span className="font-semibold text-apple-ink dark:text-white">{session.deviceName}</span>{parts[1]}</>); })()}
                    </span>
                    <button onClick={() => setDismissedNameNotice(true)} aria-label={t('pair.dismiss')} className="shrink-0 min-w-[40px] min-h-[40px] -m-[12px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

              {/* Live session stats — the left pane earns its place by
                  reporting the room it's hosting: real counts, not copy.
                  De-boxed: figures + hairlines, no border chrome — the
                  numbers are the object, not their container. */}
              {(() => {
                const msgs = session.messages;
                const fileCount = msgs.filter(m => m.attachment && m.attachment.status === 'complete').length;
                const bytes = msgs.reduce((n, m) => n + (m.attachment?.status === 'complete' ? (m.attachment.size ?? 0) : 0), 0);
                const stat = (label: string, value: string) => (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1 py-1">
                    <span className="text-[16px] font-bold text-apple-ink dark:text-white tnum leading-none">{value}</span>
                    <span className="st-eyebrow">{label}</span>
                  </div>
                );
                return (
                  <div className="st-tile mb-4 px-2 py-2.5 flex items-stretch">
                    {stat(msgs.length === 1 ? t('conn.stats.message') : t('conn.stats.messages'), String(msgs.length))}
                    <span className="w-px bg-apple-divider/70 dark:bg-white/[0.09]" aria-hidden />
                    {stat(fileCount === 1 ? t('conn.stats.file') : t('conn.stats.files'), String(fileCount))}
                    <span className="w-px bg-apple-divider/70 dark:bg-white/[0.09]" aria-hidden />
                    {stat(t('conn.stats.data'), bytes > 0 ? formatBytes(bytes) : '0')}
                  </div>
                );
              })()}

              {/* Who is here — the rail answers "who else is in this room"
                  before it offers any action: tiles for each seated device,
                  each with its own link state. */}
              <PresenceDock
                className="mb-4 px-1"
                title={roomRosterCount === 1 ? t('room.oneDevice') : t('room.deviceCount', { count: roomRosterCount })}
                subtitle={session.partnerConnected || roomRosterCount > 1 ? t('room.readyCount', { count: roomRosterCount }) : t('room.waiting')}
                entries={presenceEntries}
              />

              {/* Room controls — one grouped card, the rail's only action
                  surface. Stay Connected and Copy join link are equal-weight
                  room settings; Disconnect is the single destructive action,
                  separated at the bottom so it can't be tapped by accident.
                  The connection-type pill died in this pass: the room header
                  already shows live link state, and the rail doesn't need a
                  second voice saying it. */}
              <div className="st-card overflow-hidden">
                <StayConnectedToggle className="rounded-none" />
                <div className="h-px bg-apple-divider/50 dark:bg-white/[0.07]" aria-hidden />
                <button
                  type="button"
                  onClick={copyLink}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left"
                >
                  <span className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold text-apple-ink dark:text-white">{copiedLink ? t('conn.inviteCopied') : t('conn.invite')}</span>
                    <span className="text-[11.5px] text-apple-ink-muted dark:text-white/45 truncate">{t('conn.inviteHint')}</span>
                  </span>
                  <Link2 className="w-4 h-4 shrink-0 text-apple-ink-muted dark:text-white/50" />
                </button>
                <div className="h-px bg-apple-divider/50 dark:bg-white/[0.07]" aria-hidden />
              </div>
              {/* Disconnect is the one irreversible thing on this rail, so it
                  is no longer a tap: the knob must be carried past the arming
                  line. Accidental taps can't end a live session. */}
              <SlideToConfirm
                className="mt-3"
                tone="danger"
                label={t('common.disconnect')}
                armedLabel={t('end.release')}
                onConfirm={() => handleDisconnect()}
                icon={<DisconnectGlyph size={16} />}
                testId="end-session"
              />
            </motion.div>
          )}
          {/* ── CONNECTED: the payoff beat — the handshake the user just
              watched completes, visibly, before the room takes over. Same
              scene, same tiles: the relationship finishes, THEN the
              workspace arrives. Reduced-motion users skip the wait (the
              beat is a reveal, not information). */}
          {panelMode === 'connected' && celebrateConnected && (
            <motion.div
              key="connected-celebrate"
              data-testid="connected-celebration"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-w-md mx-auto text-center"
            >
              <div className="flex flex-col items-center py-6">
                <ConnectHandshake
                  phase="connected"
                  localIcon={isMobileDevice ? 'phone' : 'monitor'}
                  partnerName={session.partnerName}
                />
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.3, ease: EASE }}
                  className="mt-3 text-[13px] font-medium text-apple-ink-muted dark:text-white/50"
                >
                  {t('conn.ready')}
                </motion.p>
              </div>
            </motion.div>
          )}
    </AnimatePresence>
  );  const footerNode = (
    <footer className="shrink-0 px-6 lg:px-10 pt-8 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-9 border-t border-apple-divider/60 dark:border-white/[0.06]">
        {/* A product footer for the LANDING only. It sits at the END of the
            hero's scroll — below the fold, revealed by scrolling, never
            pinned over the hero (the footer must not be always visible).
            Two ranks: the brand states the deal once and signs it; three
            groups answer "what next?" — use it, read it (guides included),
            the legal words — and the project link closes the row. Groups
            are INLINE on desktop and stack on mobile; every link keeps its
            40px tap floor via -my-2. */}
        <div className="max-w-6xl mx-auto grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(0,1fr))_auto] md:items-start md:gap-x-8">
          <div className="col-span-2 flex min-w-0 flex-col gap-2 md:col-span-1">
            {/* The brand lockup — the footer's sign-off: ember mark +
                themed wordmark, same voice as the header. self-start keeps
                it off the column's stretch axis. */}
            <BrandLockup className="self-start" />
            {/* Both fine-print lines floor at WCAG AA (4.5:1) in BOTH themes.
                Light: muted/75 measured 3.38:1 and muted/55 2.32:1 — bumped
                to opaque (5.79:1) and /90 (~4.6:1). Dark: white/40 was
                3.83:1 and white/30 2.69:1 — now /55 (6.18:1) and /50
                (5.31:1). Hierarchy survives: the copyright stays one step
                quieter than the promise line, by alpha AND size. */}
            <span className="text-[12px] font-medium leading-none text-apple-ink-muted dark:text-white/55">
              {t('footer.noApp')} · {t('footer.noAccount')} · {t('footer.temporary')}
            </span>
            <span className="text-[11.5px] font-medium leading-none text-apple-ink-muted/90 dark:text-white/50">
              © {new Date().getFullYear()} ShareTexts
            </span>
          </div>
          {/* Three tiny groups, one band tall: the label carries the
              meaning, the links stay honest (each goes somewhere real or
              does something real — the space entry opens the same sheet the
              hero pill opens; no invented sitemap on a nine-page product). */}
          {[
            {
              title: t('footer.useIt'),
              items: [
                { label: t('space.title'), onClick: () => setSpaceSheet('create') },
                { label: t('nav.docs'), href: '/docs' },
              ],
            },
            {
              title: t('footer.read'),
              items: [
                { label: t('nav.guides'), href: '/guides' },
                { label: t('nav.about'), href: '/about' },
                { label: t('footer.devs'), href: '/llms.txt' },
              ],
            },
            {
              title: t('footer.terms'),
              items: [
                { label: t('nav.privacy'), href: '/privacy' },
                { label: t('nav.terms'), href: '/terms' },
              ],
            },
          ].map((group) => (
            <div key={group.title} className="min-w-0 flex flex-col gap-1">
              <h2 className="st-eyebrow">
                {group.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3">
                {group.items.map((item) =>
                  item.onClick ? (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.onClick}
                      className="inline-flex items-center min-h-[40px] min-w-[40px] justify-center -my-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/55 hover:text-apple-ink dark:hover:text-white transition-colors"
                    >
                      {item.label}
                    </button>
                  ) : (
                    <a
                      key={item.label}
                      href={item.href}
                      className="inline-flex items-center min-h-[40px] min-w-[40px] justify-center -my-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/55 hover:text-apple-ink dark:hover:text-white transition-colors"
                    >
                      {item.label}
                    </a>
                  )
                )}
              </div>
            </div>
          ))}
          {/* X (Twitter) — glyph + handle on ≥sm so an isolated ✕ at the
              pane's corner can't be misread as a dismiss control; the
              anchor chip framing (pill border) says "external link". */}
          <a
            href="https://x.com/0xalyt"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('footer.followAria')}
            title="x.com/0xalyt"
            className="col-span-2 inline-flex min-h-[40px] min-w-[40px] -my-2 w-fit items-center justify-center gap-1.5 px-2.5 justify-self-start rounded-full border border-apple-divider/60 dark:border-white/[0.08] text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/25 transition-colors md:col-span-1 md:my-0 md:justify-self-end"
          >
            <svg className="w-[15px] h-[15px] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            <span className="hidden sm:inline text-[12.5px] font-semibold">x.com/0xalyt</span>
          </a>
        </div>
    </footer>
  );

  /* The compact footer for APP surfaces (desktop room left panel, pairing,
      mobile single-screen): one quiet line — brand · links · X. The grouped
      landing footer below would eat a third of the room rail and read as
      marketing inside a tool; app surfaces keep the one-band footer. */
  const compactFooterNode = (
    <footer className="shrink-0 px-6 lg:px-10 pt-2.5 pb-[max(env(safe-area-inset-bottom),8px)] sm:pb-2.5 border-t border-apple-divider/60 dark:border-white/[0.06]">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-x-5 gap-y-2 flex-wrap">
        <BrandLockup compact className="select-none" />
        <nav className="flex items-center gap-5 sm:gap-7 text-[13px] font-medium text-apple-ink-muted dark:text-white/55">
          <a href="/docs" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.docs')}</a>
          <a href="/about" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.about')}</a>
          <a href="/privacy" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.privacy')}</a>
          <a href="/terms" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.terms')}</a>
          <a href="/guides" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.guides')}</a>
        </nav>
        <a
          href="https://x.com/0xalyt"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('footer.followAria')}
          title="x.com/0xalyt"
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] -my-2.5 px-2.5 rounded-full border border-apple-divider/60 dark:border-white/[0.08] text-apple-ink-muted dark:text-white/55 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/25 transition-colors"
        >
          <svg className="w-[15px] h-[15px] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          <span className="hidden sm:inline text-[12.5px] font-semibold">x.com/0xalyt</span>
        </a>
      </div>
    </footer>
  );

  /* Drop-to-send veil — shared by the two-pane left pane and the single-
      screen landing; the pane answers the drag immediately, so the user
      knows releasing HERE is the action. pointer-events-none keeps
      dragleave/drop flowing to the surface beneath. */
  const homeDropVeil = (
    <AnimatePresence>
      {homeDrop && panelMode === 'idle' && (
        <motion.div
          key="home-drop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          aria-hidden
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-[2px]"
        >
          <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-[24px] border-2 border-dashed border-ember/50 dark:border-azure-400/50">
            <Upload className="w-8 h-8 text-ember dark:text-azure-400" />
            <p className="text-[17px] font-semibold text-apple-ink dark:text-white">{t('drop.send')}</p>
            <p className="text-[13px] font-medium text-apple-ink-muted dark:text-white/50">{t('drop.hint')}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const leftPanel = (
    <div
      // Drop-to-send lives on the whole idle home pane: release anywhere.
      onDragEnter={panelMode === 'idle' ? onHomeDragEnter : undefined}
      onDragOver={panelMode === 'idle' ? onHomeDragOver : undefined}
      onDragLeave={panelMode === 'idle' ? onHomeDragLeave : undefined}
      onDrop={panelMode === 'idle' ? onHomeDrop : undefined}
      className="relative isolate flex flex-col h-full overflow-hidden bg-apple-canvas dark:bg-night-900"
    >
      {ambientGlow}
      {/* Soft top ambience — a wide, low-alpha ember/violet breath that keeps
          the canvas from reading as flat, in both themes. Decorative. */}
      <div aria-hidden className="st-ambient" />
      {/* Drop-to-send veil — the pane answers the drag immediately, so the
          user knows releasing HERE is the action. pointer-events-none keeps
          dragleave/drop flowing to the pane beneath. */}
      {homeDropVeil}
      {headerNode}
      {/* Hero area — the H1 lives INSIDE the hero column (restored): one
          source of truth for the headline on desktop and mobile, sitting in
          the same max-w-md column as the subtitle and actions. */}
      <div className="flex-1 flex flex-col px-6 lg:px-10 pt-3 sm:pt-6 lg:pt-12 pb-6 min-h-0 overflow-y-auto overscroll-contain room-scroll">
        {/* Vertically center the connected rail in the pane's real height —
            the column is shorter than the viewport on desktop, and top-
            anchoring it left a dead zone below. Idle/pairing content is
            tall enough to top-anchor; only the room rail benefits. */}
        <div className={panelMode === 'connected' ? "my-auto w-full" : "w-full"}>
          {heroContent}
        </div>
      </div>
      {compactFooterNode}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  RIGHT PANEL — the room (desktop only; mobile mounts ChatView)    */
  /* ---------------------------------------------------------------- */
  const roomPanel = (
    <div
      className={cn(
        "relative flex flex-col h-full min-h-0 overflow-hidden bg-apple-canvas dark:bg-night-950",
        /* The animated dot field lives ONLY here: the desktop landing's
           right panel, before a connection exists. Not mobile, not in-room,
           not the pairing/connected states — one quiet stage for the hero. */
        panelMode === 'idle' && "st-dotfield"
      )}
      data-testid="room-panel"
    >
      {panelMode === 'idle' && <div aria-hidden className="st-ambient" />}
      {/* Room header — the pair IS the identity, so the header leads with
          the two real devices (this ⇄ partner + live-status dot) instead of
          a generic wordmark, and the brand stays present at the right
          weight. Disconnect gets a calm two-press confirm, never a modal. */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-apple-canvas/80 dark:bg-night-950/80 backdrop-blur-xl z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {panelMode === 'connected' ? (
            <>
              <span className="flex items-center justify-center w-7 h-7 rounded-[8px] bg-ember/10 border border-ember/20 text-ember shrink-0" aria-hidden>
                <ThisDeviceIcon className="w-4 h-4" />
              </span>
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white truncate max-w-[110px]">{session.deviceName}</span>
              <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 text-apple-ink-muted/50 dark:text-white/30" />
              <span className={cn(
                "relative flex items-center justify-center w-7 h-7 rounded-[8px] shrink-0 transition-colors",
                session.connectionType === 'disconnected'
                  ? "bg-black/[0.05] dark:bg-white/[0.06] border border-apple-divider/40 dark:border-white/[0.08] text-apple-ink-muted/50 dark:text-white/30"
                  : session.connectionType === 'connecting'
                    ? "bg-status-warning/10 border border-status-warning/25 text-status-warning"
                    : "bg-status-success/10 border border-status-success/20 text-status-success"
              )}>
                {session.connectionType === 'connecting' && <span aria-hidden className="absolute inset-0 rounded-[8px] bg-status-warning/20 st-halo-ring" />}
                {session.connectionType !== 'disconnected' && session.connectionType !== 'connecting' && <span aria-hidden className="absolute inset-0 rounded-[8px] bg-status-success/20 st-halo-ring" />}
                <PartnerDeviceIcon className="relative w-4 h-4" />
              </span>
              <span className="hidden md:flex flex-col leading-tight min-w-0">
                {/* Room-aware header (F13): a 3+ device room leads with the
                    device COUNT — never "Connected to Windows PC" for a whole
                    room. The two-device room keeps the partner's name. */}
                <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white truncate max-w-[130px]">
                  {(session.peers?.filter(p => !p.isSelf).length ?? 0) > 1
                    ? t('room.deviceCount', { count: String((session.peers?.length ?? 0)) })
                    : (session.partnerName || t('chat.pairedDevice'))}
                </span>
                {(session.peers?.filter(p => !p.isSelf).length ?? 0) > 1 ? (
                  <span data-testid="room-device-count" className="text-[10.5px] font-medium text-apple-ink-muted dark:text-white/45">
                    {(() => {
                      const list = session.peers?.filter(p => !p.isSelf) ?? [];
                      const parts: string[] = [];
                      const ready = list.filter(p => p.link === 'connected').length;
                      const connecting = list.filter(p => p.link === 'connecting' || p.link === 'reconnecting').length;
                      const offline = list.filter(p => p.link === 'offline').length;
                      if (ready) parts.push(t('room.readyCount', { count: String(ready) }));
                      if (connecting) parts.push(t('room.connectingCount', { count: String(connecting) }));
                      if (offline) parts.push(t('room.offlineCount', { count: String(offline) }));
                      // Members with no link yet are still IN the room — the
                      // honest baseline is the roster, never an empty string.
                      const idle = list.length - ready - connecting - offline;
                      if (idle > 0 && parts.length === 0) parts.push(t('room.deviceCount', { count: String(list.length) }));
                      return parts.join(' · ');
                    })()}
                  </span>
                ) : (
                <span className={cn("text-[10.5px] font-medium", session.connectionType === 'disconnected' ? "text-status-warning" : session.connectionType === 'connecting' ? "text-status-warning" : "text-status-success")}>
                  {session.connectionType === 'disconnected'
                    ? t('chat.offline')
                    : session.connectionType === 'connecting'
                      ? t('chat.reconnecting')
                      : session.connectionType === 'direct' || session.connectionType === 'local'
                        ? t('chat.directBadge')
                        : session.connectionType === 'relay'
                          ? t('conn.relay')
                          : t('common.connected')}
                </span>
                )}
              </span>
              <span className="md:hidden w-1.5 h-1.5 rounded-full shrink-0 ml-0.5" aria-hidden>
                <span className={cn("block w-1.5 h-1.5 rounded-full", session.connectionType === 'disconnected' || session.connectionType === 'connecting' ? "bg-status-warning" : "bg-status-success animate-pulse")} />
              </span>
              <StayBadge />
            </>
          ) : (
            <>
              <ShareTextsLogo size={16} />
              {/* Label follows the pane's actual job: the three-step guide
                  while idle, "Room" once a session exists (pairing, connect,
                  live). One header, no mixed messages. */}
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white">{panelMode === 'idle' ? t('room.idleTitle') : t('room.title')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Leave control only exists when there is a session to leave —
              a permanently-disabled hang-up on the idle pane is noise. */}
          {panelMode === 'connected' && (
            <>
              {/* Settings — same overlay as the mobile room header. The brand
                  glyph that used to sit here repeated the left header's
                  lockup one pane over; the disconnect that sat next to it
                  ALSO existed in the left rail. One screen, one authoritative
                  place for each: brand lives left, disconnect lives in the
                  rail's grouped card (with its confirm), settings here. */}
              <button
                type="button"
                data-testid="open-settings"
                onClick={() => setShowSettings(true)}
                aria-label={t('settings.title')}
                title={t('settings.title')}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full transition-all duration-150 active:scale-95 text-apple-ink-muted/70 dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
              >
                <SettingsIcon className="w-[18px] h-[18px]" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Room content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {panelMode === 'connected' ? (
          <Suspense fallback={<SkeletonScreen variant="room" />}>
            {/* Definite-height flex wrapper: keeps ChatView's h-full resolved on
                the desktop two-pane layout (Suspense itself is not a flex item). */}
            <div className="flex-1 min-h-0 flex flex-col">
              <motion.div
                key="room-connected"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="h-full flex flex-col min-h-0"
              >
                <ChatView panelMode="embedded" />
              </motion.div>
            </div>
          </Suspense>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={panelMode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="h-full flex flex-col items-center justify-center text-center px-8 flex-1"
            >
              {/* Connecting shows the same handshake scene as the left half —
                  one story on both panes. */}
              {panelMode === 'connecting' ? (
                <div className="mb-4">
                  <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
                </div>
              ) : panelMode === 'idle' ? (
                /* Desktop idle: the three steps AND the product scene form
                   ONE centered group — center the combined block, never the
                   steps alone, so nothing ever clips at the fold. On short
                   viewports the scene steps aside and the steps keep center. */
                <div className="w-full max-w-[640px] mx-auto flex flex-col items-center justify-center gap-7 py-6">
                  {/* The three steps — numbered, quiet. Left-aligned text so
                      the rows read like a list, not a poem. */}
                  <div className="w-full max-w-[420px] space-y-3.5">
                    {[t('room.step.1'), t('room.step.2'), t('room.step.3')].map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="shrink-0 w-7 h-7 rounded-full bg-ember/[0.1] dark:bg-ember/[0.16] text-ember dark:text-azure-400 text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="text-[14px] font-medium text-apple-ink/85 dark:text-white/65 leading-snug">{step}</span>
                      </div>
                    ))}
                  </div>
                  {/* The product itself, beneath the steps in the same
                      centered group. Hidden on short viewports so the group
                      never overflows. */}
                  <div className="w-full max-w-[520px] hidden [@media(min-height:700px)]:block">
                    <HeroTransferScene />
                  </div>
                </div>
              ) : (
                /* sending / receiving: the DESIGNED waiting state. Not a bare
                   sentence floating in a void — the same handshake scene the
                   connect moment uses (one visual story), a truthful status
                   line, and a preview of what lands here the moment the peer
                   arrives (anticipate the next need; empty states carry an
                   action, never dead space). */
                <div className="w-full max-w-[420px] flex flex-col items-center">
                  {/* The pair glyphs live on the SENDING side's pairing panel
                      (code + instructions) — repeating the same illustration
                      here, 600px away, padded the pane and diluted both. The
                      joiner has no pairing panel, so THEIR waiting state keeps
                      the searching handshake. One illustration per state,
                      never two. */}
                  {panelMode === 'receiving' && (
                    <div className="mb-5">
                      <ConnectHandshake
                        phase="searching"
                        localIcon={isMobileDevice ? 'phone' : 'monitor'}
                        quiet
                      />
                    </div>
                  )}
                  <p className="text-[15px] font-semibold text-apple-ink dark:text-white mb-1.5">
                    {panelMode === 'sending' && (isCreating && !session.secret ? t('create.creating') : t('room.created'))}
                    {panelMode === 'receiving' && t('room.waiting')}
                  </p>
                  <p className="text-[13.5px] text-apple-ink-muted dark:text-white/50 max-w-[300px] leading-relaxed mb-7">
                    {panelMode === 'sending' && (isCreating && !session.secret ? t('room.setup') : t('room.sendHint'))}
                    {panelMode === 'receiving' && t('room.receiveHint')}
                  </p>
                  {/* The three steps, spelled out while the other device
                      is still being found — the guidance a first-timer needs
                      is exactly the thing the waiting screen has time to
                      say. Numbered, quiet, one line each. */}
                  <ol className="w-full max-w-[340px] mb-6 flex flex-col gap-3 text-left">
                    {[t('room.step.1'), t('room.step.2'), t('room.step.3')].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-ember/[0.12] dark:bg-azure-400/[0.16] text-ember dark:text-azure-400 text-[12px] font-bold flex items-center justify-center mt-px">{i + 1}</span>
                        <span className="text-[13.5px] font-medium text-apple-ink/85 dark:text-white/70 leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>
                  {/* The waiting stage. The old version was a DASHED box
                      full of grey bars — a wireframe left in the product,
                      floating in an empty pane. This is a real surface of
                      the app's own grammar: a recessed shelf that names the
                      three things that land here, and says what this pane is
                      for. */}
                  <div className="st-tile w-full p-4 sm:p-5">
                    <span className="st-eyebrow">{t('room.previewTitle')}</span>
                    <div className="mt-3.5 grid grid-cols-3 gap-2.5" aria-hidden>
                      <span className="st-glyph st-glyph-ember aspect-[4/3] flex-col gap-1.5">
                        <ImageIcon className="w-4.5 h-4.5" />
                        <span className="text-[11px] font-semibold leading-none">{t('attach.photos')}</span>
                      </span>
                      <span className="st-glyph aspect-[4/3] flex-col gap-1.5">
                        <FileIcon className="w-4.5 h-4.5" />
                        <span className="text-[11px] font-semibold leading-none">{t('attach.files')}</span>
                      </span>
                      <span className="st-glyph aspect-[4/3] flex-col gap-1.5">
                        <Link2 className="w-4.5 h-4.5" />
                        <span className="text-[11px] font-semibold leading-none">{t('composer.teach.paste')}</span>
                      </span>
                    </div>
                    <p className="mt-3.5 text-[12.5px] leading-relaxed text-apple-ink-muted dark:text-white/50">
                      {t('composer.teach')}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  LANDING — ONE screen (desktop idle only): words left, product right.
      The old split-pane landing (brand half + how-it-works half) read as
      two app screens side by side; a landing is one object — header, hero
      row, footer — that happens to be interactive. */
  /* ---------------------------------------------------------------- */
  const landingNode = (
    <div
      onDragEnter={onHomeDragEnter}
      onDragOver={onHomeDragOver}
      onDragLeave={onHomeDragLeave}
      onDrop={onHomeDrop}
      className="relative isolate flex flex-col h-full overflow-hidden bg-apple-canvas dark:bg-night-900 st-landing"
    >
      <div aria-hidden className="st-ambient" />
      {/* Sunrise horizon: warm light rising from the floor of the hero band.
          Pointer-transparent and behind the content — it gives the paper
          canvas a direction to the light instead of an even wash. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] st-horizon opacity-60" />
      {homeDropVeil}
      {headerNode}
      <main
        id="main-content"
        className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain room-scroll flex flex-col"
      >
        {/* min-h-full (not h-full): the hero fills the first screen and the
            footer lives at the END of this scroll — below the fold, revealed
            by scrolling, never pinned over the hero (design owner: the footer
            must not be always visible). shrink-0 is LOAD-BEARING: without it
            this container flex-shrinks toward min-h-full when the hero copy
            is taller than the viewport, and the squeezed hero rows overflow
            ONTO the footer band — the footer then intercepts their clicks
            (caught by verify-autoconnect-trusted at 1100×800). */}
        <div className="mx-auto w-full max-w-[1200px] min-h-full shrink-0 px-8 2xl:px-12 flex flex-col">
          {/* Short laptops (≤820px inner height) hang BOTH columns from a
              shared top line instead of centering: centering a tall row on a
              short window pushes the demo's bottom past the fold (caught by
              verify-landing-onescreen at 1152×700). Top-aligned, the first
              screen is exactly the composed pair — headline left, product
              right — and the quiet tail waits one scroll below. */}
          <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center lg:[@media(max-height:820px)]:items-start gap-10 xl:gap-14 py-5">
            {/* Left: the words and the actions (headline → subline → live
                tracker → Send/Receive → nearby discovery → the quiet tail). */}
            <div className="w-full min-w-0">{idleHeroNode}</div>
            {/* Right: the product, running — and the LARGER half of the
                composition (F24). The demo carries the hero's visual weight:
                a wider pane, a taller canvas, and screens that scale with
                their frames. Not a screenshot and not a still: it plays the
                whole story — open, pair, send, arrive, close — on two live
                device screens, with a caption on the same clock. On a very
                short window the landing simply scrolls to it. */}
            <div className="w-full max-w-[620px] mx-auto">
              <HeroDeviceDemo />
            </div>
          </div>
        </div>
        {footerNode}
      </main>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <div className="h-dvh lg:h-dvh overflow-hidden bg-apple-canvas dark:bg-night-900 dot-bg">
      <CommandBar open={cmdOpen} onOpenChange={setCmdOpen} onSpace={(which) => setSpaceSheet(which)} />
      {/* Only the ACTIVE layout is mounted — the other branch stays unmounted
          so components (ChatView, composer, pairing input) exist exactly once
          in the DOM instead of twice with one hidden copy. */}
      {isDesktopLayout ? (
        panelMode === 'idle' ? (
          /* Idle: ONE landing screen (see landingNode). */
          landingNode
        ) : (
          /* Active: two panes. Balanced 50/50 at 1024–1279; from 1280 the
              room gets the wider share (≈44/56) so the active pane never feels
              like an afterthought next to an airy brand half. */
          <div className="flex h-full">
            <div className="w-1/2 xl:w-[44%] h-full overflow-y-auto border-r border-black/[0.06] dark:border-white/[0.06]">{leftPanel}</div>
            <div className="flex-1 h-full min-w-0">{roomPanel}</div>
          </div>
        )
      ) : (
        /* Mobile: exactly ONE section on screen at a time.
            · Idle / pairing: header + hero (centered) + footer.
            · Connected: the transfer room takes over the entire screen — a
              full-bleed ChatView with its own device bar and composer. No
              stacked summary card above the chat, no second scroll surface. */
        panelMode === 'connected' ? (
          <Suspense fallback={<SkeletonScreen variant="room" />}>
            <motion.div
              key="room-fullscreen"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="h-full"
            >
              <ChatView panelMode="standalone" />
            </motion.div>
          </Suspense>
        ) : (
          <div className="h-full overflow-y-auto overscroll-contain">
            <div className="flex flex-col min-h-full">
              <div className="relative isolate flex flex-1 flex-col bg-apple-canvas dark:bg-night-900 st-landing">
                {ambientGlow}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] st-horizon opacity-55" />
                {headerNode}
                {/* TOP-ANCHORED like the desktop pane: justify-center with
                    overflowing content pushes the heading into dead space
                    above (and clips it) — start-anchoring keeps the title
                    right under the header on every phone height. */}
                <div id="main-content" className="flex-1 flex flex-col justify-start px-6 lg:px-10 pt-3 sm:pt-6 pb-6 min-h-0">
                  {heroContent}
                </div>
              </div>
              {compactFooterNode}
            </div>
          </div>
        )
      )}
      {/* QR scan overlay (for receiving) */}
      <AnimatePresence>
        {showQRScan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={() => setShowQRScan(false)}>
            <motion.div ref={qrScanTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[360px] bg-white dark:bg-surface-dark rounded-[24px] p-6 shadow-2xl relative" role="dialog" aria-modal="true" aria-label={t('receive.scan')}>
              <button onClick={() => setShowQRScan(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors z-10" aria-label={t('common.close')}><X className="w-4 h-4" /></button>
              <kbd aria-hidden="true" className="hidden sm:inline absolute top-5 right-16 px-1.5 py-0.5 rounded-[4px] border border-apple-divider dark:border-white/10 bg-white/60 dark:bg-white/5 text-[10px] font-medium text-apple-ink-muted/80 dark:text-white/40">Esc</kbd>
              <h3 className="text-[16px] font-semibold text-apple-ink dark:text-white mb-2">{t('qr.scan.title')}</h3>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 mb-4">{t('qr.scan.body')}</p>
              {/* Skeleton, not a text spinner: the lazy camera chunk loads in
                  under a circle-slash frame on warm caches, but on cold ones
                  the shell holds the scanner's exact place — same height, same
                  radius, one quiet shimmer — instead of a sentence where the
                  viewfinder is about to appear. */}
              <Suspense
                fallback={
                  <div className="w-full h-[280px] rounded-[16px] bg-apple-parchment dark:bg-white/5 overflow-hidden relative" aria-hidden>
                    <Bar className="absolute inset-0 rounded-none bg-apple-ink/[0.05] dark:bg-white/[0.05]" />
                  </div>
                }
              >
                <QRScanner onScan={handleQRScan} onErrorFallback={() => { setShowQRScan(false); }} />
              </Suspense>
              <button
                onClick={() => setShowQRScan(false)}
                className="mt-4 text-[13px] font-semibold text-apple-ink-muted hover:text-apple-ink dark:hover:text-white underline-offset-2 hover:underline transition-colors"
              >
                {t('qr.scan.typeCode')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* QR display overlay (for sending) */}
      <AnimatePresence>
        {showQROverlay && session.roomId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 dark:bg-black/70 flex items-center justify-center p-6" onClick={() => setShowQROverlay(false)}>
            <motion.div ref={qrDisplayTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[340px] bg-apple-canvas dark:bg-surface-dark rounded-[24px] p-6 pt-14 shadow-2xl text-center relative border border-apple-divider/50 dark:border-white/[0.08]" role="dialog" aria-modal="true" aria-label={t('qr.display.title')}>
              {/* pt-14 reserves the top strip for the absolutely-positioned
                  close/Esc controls — instruction text can never run under
                  them again. */}
              <button onClick={() => setShowQROverlay(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors" aria-label={t('common.close')}><X className="w-4 h-4" /></button>
              <kbd aria-hidden="true" className="hidden sm:inline absolute top-5 right-16 px-1.5 py-0.5 rounded-[4px] border border-apple-divider dark:border-white/10 bg-white/60 dark:bg-white/5 text-[10px] font-medium text-apple-ink-muted/80 dark:text-white/40">Esc</kbd>
              <p className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2">{t('qr.display.title')}</p>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/60 mb-4 leading-relaxed">
                {(() => { const parts = t('qr.display.body', { receive: '\u0000' }).split('\u0000'); return (<>{parts[0]}<strong className="text-apple-ink dark:text-white">{t('qr.display.receive')}</strong>{parts[1]}</>); })()}
              </p>
              <div className="bg-white p-4 rounded-[16px] inline-flex items-center justify-center mb-4 shadow-sm border border-apple-divider/30 relative">
                <QROverlayInner value={qrValue} />
                {/* Scanner-frame corners in ember — the recognized visual
                    grammar for "aim your camera here", quieter than a
                    moving line and it never covers the code. */}
                {['top-1.5 left-1.5 border-t-2 border-l-2 rounded-tl-[8px]', 'top-1.5 right-1.5 border-t-2 border-r-2 rounded-tr-[8px]', 'bottom-1.5 left-1.5 border-b-2 border-l-2 rounded-bl-[8px]', 'bottom-1.5 right-1.5 border-b-2 border-r-2 rounded-br-[8px]'].map(pos => (
                  <span key={pos} aria-hidden className={`absolute w-5 h-5 border-ember ${pos}`} />
                ))}
              </div>
              {/* Copy + Share, side by side: the two things anyone actually
                  does with a displayed code. Copy is deliberately the quiet
                  one (it stays on this device); Share is the branded one
                  because it leaves. Close keeps the low-emphasis slot below,
                  so the row never becomes a three-way decision. */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { void copyLink(); }}
                  data-testid="qr-copy"
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-full bg-apple-parchment dark:bg-white/[0.07] text-[13.5px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98]"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4 text-apple-ink-muted dark:text-white/60" />}
                  {copiedLink ? t('action.copied') : t('action.copy')}
                </button>
                <ShareMenu
                  className="flex-1"
                  url={shareUrlRef.current}
                  code={qrCode || null}
                  variant="pill"
                  pillTone="brand"
                  triggerLabel={t('action.share')}
                  testId="qr-share"
                />
              </div>
              <button onClick={() => setShowQROverlay(false)} className="w-full mt-2 py-2.5 min-h-[44px] rounded-full text-[13px] font-semibold text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors">{t('qr.close')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Settings — theme, language, stay connected, reconnection. */}
      <SettingsOverlay open={showSettings} onClose={() => setShowSettings(false)} />
      <SpaceCreateSheet open={spaceSheet === 'create'} onClose={() => setSpaceSheet(null)} />
      <SpaceJoinSheet open={spaceSheet === 'join'} onClose={() => setSpaceSheet(null)} initialCode={initialSpaceCode} />
      {/* Apple-style bottom-sheet confirmation before really ending the session. */}
      <ConfirmSheet
        open={confirmDisconnect}
        title={t('common.disconnect')}
        body={t('end.body')}
        confirmLabel={t('common.disconnect')}
        cancelLabel={t('cancel')}
        onConfirm={() => { setConfirmDisconnect(false); handleDisconnect(); }}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */
function QROverlayInner({ value }: { value: string }) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => { import('qrcode.react').then(m => setComp(() => m.QRCodeSVG)); }, []);
  // Skeleton, not a sentence: the lazy chunk fills the QR's exact 220px
  // stage (one shimmer) — the same loading language as the scan overlay's
  // viewfinder shell, so both QR surfaces speak identically.
  if (!Comp) return (
    <div className="w-[220px] h-[220px] rounded-[10px] relative overflow-hidden" aria-hidden>
      <Bar className="absolute inset-0 rounded-none bg-apple-ink/[0.05]" />
    </div>
  );
  return <Comp value={value} size={220} level="M" />;
}
