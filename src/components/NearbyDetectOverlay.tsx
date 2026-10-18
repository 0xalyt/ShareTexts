import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Infinity as InfinityIcon } from 'lucide-react';
import { SpinLoader } from './SpinLoader';
import { useI18n } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';
import { cn } from '../lib/utils';
import { DeviceArt } from './DeviceArt';

/**
 * NearbyDetectOverlay — the one popup BOTH nearby devices see, staged as an
 * AirDrop-style discovery scene (the reference: Apple's radar screen —
 * concentric rings, a broadcast glyph at the core, each discovered device
 * bobbing on a ring above its name — and the dark glass accept card docked
 * at the bottom with Decline / Accept pills).
 *
 *   SCENE  · four hairline rings + two slow ping rings breathing outward
 *            (one staggered pair — a calm radar, never an alarm),
 *            the broadcast glyph glowing at the core,
 *            the target device popping onto a ring (spring, brand-tinted
 *            bubble) with its name label under it, and up to three OTHER
 *            nearby devices as quieter bubbles on the remaining slots.
 *   CARD   · frosted glass, docked bottom on mobile / centered on ≥sm.
 *            Left: the radar glyph tile + headline. Right: the device's
 *            authored art — the same tile the landing rows use, so the
 *            popup and the list read as one system. A meta row carries the
 *            honest chips: browser, exact model when the platform told us,
 *            and the ∞ Stay Connected badge when the promise travels.
 *   ACTIONS· two pills, AirDrop grammar: Decline (quiet) · Connect (ember).
 *            The connect is still a TWO-step confirm IN the primary pill:
 *            the first tap arms it ("Connect with this device?" → "Yes",
 *            with a small celebratory bounce — the Duolingo beat), the
 *            second commits. Incoming mode flips the card to "{name} wants
 *            to connect" with a single "Yes" — the sender already confirmed
 *            twice, so the receiver confirms once.
 *
 * Every prior contract is preserved: data-testid="nearby-detect-overlay",
 * the primary/more testids, the two-step label change, the exact "Yes"
 * accessible name on the incoming primary (verify-autoconnect.mjs), the
 * focus trap, Escape and backdrop cancel.
 *
 * DECLINE ≠ CANCEL (reference evidence — LocalSend's sender sees "The
 * recipient has rejected the request." immediately; Apple HIG treats
 * decline as an explicit labeled action, not a dismiss). Incoming mode's
 * Decline fires onDecline when supplied so the inviter's declined-card
 * path runs NOW instead of waiting out a timeout; detected mode's pill is
 * a plain Cancel.
 */

export interface DetectOverlayDevice {
  name: string;
  kind: 'phone' | 'tablet' | 'desktop';
  browser: string;
  /** Exact model when the web platform knows it (Android builds). */
  model?: string;
  /** GPU vendor hint (desktops): NVIDIA / AMD / Intel / Apple. */
  gpu?: string;
}

/**
 * Bubble slots on the radar — fixed polar positions (percentages of the
 * square radar box, relative to its center). Slot 0 is the TARGET (upper
 * right, the AirDrop "just found you" read); the rest scatter like the
 * reference's memojis. Deterministic: the same device always lands in the
 * same spot while the overlay is open.
 */
const BUBBLE_SLOTS = [
  { left: '58%', top: '13%' }, // target — upper right, on the middle ring
  { left: '11%', top: '27%' },
  { left: '85%', top: '37%' },
  { left: '27%', top: '46%' },
];

/** The AirDrop-glyph: a broadcast dot with three arcs opening upward. */
function BroadcastGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <circle cx="24" cy="31.5" r="3.4" fill="currentColor" />
      <path d="M17.6 25.6a9.2 9.2 0 0 1 12.8 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M12.8 20.4a16 16 0 0 1 22.4 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.72" />
      <path d="M8 15.2a22.8 22.8 0 0 1 32 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.42" />
    </svg>
  );
}

/** One device floating on a ring: bubble + name label, spring entrance,
 *  gentle bob. The target pops louder than the bystanders. */
function RadarBubble({ device, slot, index, target, stayBadge }: {
  key?: React.Key;
  device: DetectOverlayDevice;
  slot: { left: string; top: string };
  index: number;
  target: boolean;
  stayBadge?: boolean;
}) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.55, duration: 0.7, delay: 0.12 + index * 0.11 }}
      className="absolute flex flex-col items-center gap-1.5"
      style={{ left: slot.left, top: slot.top, transform: 'translate(-50%, -50%)' }}
    >
      {/* The bob — slow, tiny, staggered per bubble so the field breathes
          instead of pulsing in unison (MotionConfig flattens it for
          reduced-motion users). */}
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3.6 + index * 0.4, repeat: Infinity, ease: 'easeInOut', delay: index * 0.5 }}
        className={cn(
          'rounded-full flex items-center justify-center border backdrop-blur-md',
          target
            ? 'w-[68px] h-[68px] bg-white/85 dark:bg-white/[0.10] border-ember/35 dark:border-azure-400/35 shadow-[0_10px_28px_-8px_rgba(240,100,19,0.35)]'
            : 'w-[52px] h-[52px] bg-white/70 dark:bg-white/[0.07] border-black/[0.06] dark:border-white/10 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.25)]'
        )}
      >
        <DeviceArt kind={device.kind} model={device.model} gpu={device.gpu} size={target ? 56 : 42} mark={target} />
      </motion.div>
      <span className={cn(
        'max-w-[120px] truncate px-2 py-0.5 rounded-full backdrop-blur-md leading-tight',
        'bg-white/70 dark:bg-black/40 border border-black/[0.05] dark:border-white/10',
        target
          ? 'text-[12px] font-bold text-apple-ink dark:text-white'
          : 'text-[11px] font-semibold text-apple-ink/80 dark:text-white/70'
      )}>
        {device.name}
        {target && stayBadge && (
          <span role="status" title={t('stay.badge')} data-testid="nearby-detect-stay-badge" className="ml-1 inline-flex align-middle">
            <InfinityIcon className="w-3 h-3 inline text-ember dark:text-azure-400" strokeWidth={2.5} aria-hidden />
          </span>
        )}
      </span>
    </motion.div>
  );
}

export function NearbyDetectOverlay({
  mode,
  device,
  others = [],
  busy = false,
  stayBadge = false,
  onConnect,
  onCancel,
  onDecline,
  onFindMore,
}: {
  mode: 'detected' | 'incoming';
  device: DetectOverlayDevice | null;
  /** Other nearby devices — quiet bystander bubbles on the radar. */
  others?: DetectOverlayDevice[];
  busy?: boolean;
  stayBadge?: boolean;
  onConnect: () => void;
  onCancel: () => void;
  /** Incoming mode's Decline — answers "no" to the pending invitation
   *  immediately (falls back to onCancel when not supplied). */
  onDecline?: () => void;
  onFindMore?: () => void;
}) {
  const { t } = useI18n();
  const open = !!device;
  // Keep the last device through the exit animation so the card doesn't
  // snap to empty while fading out.
  const lastDeviceRef = useRef<DetectOverlayDevice | null>(null);
  if (device) lastDeviceRef.current = device;
  const shown = device ?? lastDeviceRef.current;

  const trapRef = useFocusTrap(open, onCancel);
  const [armed, setArmed] = useState(false);
  // A new target (or a switch to incoming) always starts unarmed — the
  // confirmation belongs to THIS device, not to the last one.
  useEffect(() => { setArmed(false); }, [device?.name, mode]);
  const connectRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // Land AFTER useFocusTrap's own 50ms first-focus (which would pick the
    // ✕, the first focusable in DOM order) so the PRIMARY key — the action
    // this dialog exists for — is what the keyboard starts on. The ember
    // ring must never greet the user on the dismiss button.
    const timer = setTimeout(() => connectRef.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(timer);
  }, [open, armed]);

  // Truth ladder for the card's sub-line: exact model when the device told
  // us one (Android), otherwise the browser label, otherwise the neutral
  // nearby state. Never an invented model.
  const subLine = shown ? (shown.model || shown.browser || t('nearby.nearby')) : '';
  // The chips carry what the sub-line does NOT already say — no repeated
  // "Chrome · Chrome" (the probe caught exactly that).
  const metaChips: string[] = shown
    ? [shown.browser, shown.model && shown.model !== shown.browser ? shown.model : '']
        .filter((v): v is string => !!v && v !== subLine)
    : [];

  return createPortal(
    <AnimatePresence>
      {open && shown && (
        <motion.div
          key="nearby-detect"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[90] cursor-default"
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'incoming' ? t('nearby.inviteTitle', { name: shown.name }) : t('nearby.overlay.title')}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          {/* ── THE SKY — the page dissolves into a themed radar sky.
              Warm cream lit from the core in light, deep graphite at
              night; the ember ambience at center ties it to the brand. */}
          <div className="absolute inset-0 bg-[radial-gradient(125%_95%_at_50%_16%,#fffaf3_0%,#fdeee0_48%,#f6e2ce_100%)] dark:bg-[radial-gradient(125%_95%_at_50%_16%,#201f26_0%,#16151a_55%,#0f0f13_100%)]" />
          <div className="absolute inset-0 st-ambient pointer-events-none" />

          {/* ── THE RADAR — decorative, so aria-hidden. Sized as one square
              box, centered on the UPPER portion of the viewport so the
              docked card overlaps only its lower rings (the AirDrop
              composition: the sheet floats over the bottom of the field). */}
          <div aria-hidden className="absolute inset-0 pointer-events-none">
            <div className="absolute left-1/2 top-[32%] sm:top-[34%] -translate-x-1/2 -translate-y-1/2 w-[min(84vw,420px)] aspect-square">
              {/* Static hairline rings (34 / 62 / 92% of the box). */}
              <span className="absolute inset-[9%] rounded-full border border-ember/20 dark:border-azure-400/20" />
              <span className="absolute inset-[19%] rounded-full border border-ember/[0.14] dark:border-azure-400/[0.14]" />
              <span className="absolute inset-[33%] rounded-full border border-ember/[0.09] dark:border-azure-400/[0.09]" />
              {/* Two ping rings, one staggered pair on a 3s cycle: exactly
                  one wave is always mid-flight — the calm radar read. */}
              <span className="absolute inset-[9%] rounded-full border border-ember/40 dark:border-azure-400/40 st-radar-ping" />
              <span className="absolute inset-[9%] rounded-full border border-ember/40 dark:border-azure-400/40 st-radar-ping [animation-delay:1.5s]" />
              {/* Core glow + the broadcast glyph. */}
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-ember/10 dark:bg-azure-400/10 blur-xl" />
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              >
                <BroadcastGlyph className="w-12 h-12 text-ember dark:text-azure-400 drop-shadow-[0_2px_10px_rgba(240,100,19,0.35)]" />
              </motion.span>
              {/* The discovered device(s). The target takes slot 0. */}
              <RadarBubble device={shown} slot={BUBBLE_SLOTS[0]} index={0} target stayBadge={stayBadge} />
              {others.slice(0, 3).map((d, i) => (
                <RadarBubble key={`${d.name}-${i}`} device={d} slot={BUBBLE_SLOTS[i + 1]} index={i + 1} target={false} />
              ))}
            </div>
          </div>

          {/* ── THE CARD — frosted glass, docked at the bottom on mobile
              (thumb reach), centered on ≥sm. */}
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6">
            <motion.div
              ref={trapRef}
              initial={{ y: 60, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="w-full sm:max-w-[400px]"
              data-testid="nearby-detect-overlay"
            >
              <div className="relative sm:rounded-[24px] rounded-t-[26px] bg-white/85 dark:bg-[#1b1b20]/88 backdrop-blur-2xl border border-white/70 dark:border-white/[0.08] sm:shadow-[0_30px_80px_-16px_rgba(60,40,20,0.35)] shadow-[0_-10px_44px_-10px_rgba(60,40,20,0.30)] pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-5">
                {/* Grabber (mobile) + top cancel ✕ — the sheet grammar. */}
                <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden>
                  <span className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label={t('nearby.overlay.cancel')}
                  className="absolute top-3 right-3 z-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-apple-ink-muted/70 dark:text-white/40 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-offset-[#1b1b20]"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="px-5 pt-3 sm:pt-5">
                  {/* HEADER — glyph tile + headline + sub-line, the AirDrop
                      card's left column. pr-9 reserves the top-right corner
                      so the absolute ✕ never lands on the device art. */}
                  <div className="flex items-center gap-3.5 pr-9">
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0, rotate: -12 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      transition={{ type: 'spring', bounce: 0.5, duration: 0.6, delay: 0.05 }}
                      className="shrink-0 w-12 h-12 rounded-[16px] flex items-center justify-center bg-ember/10 dark:bg-azure-400/12 border border-ember/20 dark:border-azure-400/20"
                      aria-hidden
                    >
                      <BroadcastGlyph className="w-7 h-7 text-ember dark:text-azure-400" />
                    </motion.span>
                    <div className="flex-1 min-w-0">
                      {/* The brand line, mirroring the AirDrop card's
                          "AirDrop" title — the scene already says what's
                          happening; the card says who and what. */}
                      <motion.p
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.06, duration: 0.25 }}
                        className="text-[11px] font-bold uppercase tracking-[0.08em] text-ember dark:text-azure-400"
                      >
                        ShareTexts
                      </motion.p>
                      <motion.p
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.28 }}
                        className="mt-0.5 text-[17px] font-bold text-apple-ink dark:text-white leading-tight text-balance"
                      >
                        {mode === 'incoming' ? t('nearby.inviteTitle', { name: shown.name }) : shown.name}
                      </motion.p>
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.15, duration: 0.28 }}
                        className="mt-0.5 text-[13px] font-medium text-apple-ink-muted dark:text-white/50 leading-snug"
                      >
                        {mode === 'incoming' ? t('nearby.inviteBody') : subLine}
                      </motion.p>
                    </div>
                    {/* The device itself — authored platform art, the same
                        tile the landing rows use (the card's "preview"
                        slot). */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.4, duration: 0.55, delay: 0.12 }}
                      className="shrink-0"
                    >
                      <DeviceArt
                        kind={shown.kind}
                        model={shown.model}
                        gpu={shown.gpu}
                        size={56}
                        pulse={mode === 'detected' && !busy}
                      />
                    </motion.div>
                  </div>

                  {/* META ROW — the honest chips: browser · model · ∞.
                      (The stay badge also rides the radar bubble; here it
                      reads as a promise chip next to the specs.) */}
                  {(metaChips.length > 0 || stayBadge) && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.18, duration: 0.25 }}
                      className="mt-3 flex flex-wrap items-center gap-1.5"
                    >
                      {metaChips.map((chip) => (
                        <span key={chip} className="st-chip min-h-[26px] px-2.5 text-[12px]">{chip}</span>
                      ))}
                      {stayBadge && (
                        <span role="status" title={t('stay.badge')} className="st-chip st-chip-ember min-h-[26px] px-2.5 text-[12px] gap-1">
                          <InfinityIcon className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
                          {t('stay.badge')}
                        </span>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* ACTIONS — two pills, AirDrop grammar: Decline · Connect.
                    The primary keeps the two-step confirm: arm → commit. */}
                <div className="px-5 mt-4 flex items-center gap-2.5">
                  <button
                    type="button"
                    data-testid="nearby-detect-decline"
                    disabled={busy}
                    onClick={() => {
                      if (mode === 'incoming' && onDecline) { onDecline(); return; }
                      onCancel();
                    }}
                    className="flex-1 min-h-[50px] rounded-full bg-black/[0.05] dark:bg-white/[0.09] hover:bg-black/[0.09] dark:hover:bg-white/[0.14] text-[15px] font-semibold text-apple-ink dark:text-white transition-all active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-offset-[#1b1b20]"
                  >
                    {mode === 'incoming' ? t('nearby.decline') : t('nearby.overlay.cancel')}
                  </button>
                  <motion.button
                    ref={connectRef}
                    type="button"
                    data-testid="nearby-detect-primary"
                    disabled={busy}
                    onClick={() => {
                      if (busy) return;
                      if (mode === 'incoming' || armed) { onConnect(); return; }
                      setArmed(true);
                    }}
                    /* The arming beat: a small bounce — the Duolingo
                       "something just happened" confirmation — so the
                       two-step never feels like a dead first tap. */
                    animate={armed && !busy ? { scale: [1, 1.045, 1] } : { scale: 1 }}
                    transition={{ duration: 0.32, ease: 'easeOut' }}
                    className={cn(
                      'flex-[1.5] min-h-[50px] rounded-full text-[15px] font-bold text-white',
                      'bg-ember hover:bg-brand-strong disabled:opacity-80 disabled:pointer-events-none',
                      'transition-colors active:scale-[0.97]',
                      'flex items-center justify-center gap-2 whitespace-nowrap',
                      'shadow-[0_2px_10px_rgba(240,100,19,0.35),inset_0_1px_1px_rgba(255,255,255,0.28)]',
                      armed && !busy && 'ring-4 ring-ember/25 dark:ring-azure-400/25',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-offset-[#1b1b20]'
                    )}
                  >
                    {busy ? (
                      <>
                        <SpinLoader size={16} aria-hidden />
                        {t('nearby.overlay.connecting')}
                      </>
                    ) : mode === 'incoming' || armed ? (
                      t('nearby.overlay.yes')
                    ) : (
                      t('nearby.overlay.connect')
                    )}
                  </motion.button>
                </div>
                {/* SECONDARY — stay on the landing page and browse the
                    discovery list instead of committing to this one device. */}
                {mode === 'detected' && onFindMore && (
                  <div className="px-5 mt-2 flex justify-center">
                    <button
                      type="button"
                      data-testid="nearby-detect-more"
                      disabled={busy}
                      onClick={onFindMore}
                      className="min-h-[40px] px-4 rounded-full text-[13.5px] font-semibold text-apple-ink-muted dark:text-white/55 hover:text-ember dark:hover:text-azure-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors active:scale-[0.97] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-offset-[#1b1b20]"
                    >
                      <Search className="w-3.5 h-3.5" aria-hidden />
                      {t('nearby.overlay.more')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    typeof document !== 'undefined' ? document.body : null
  );
}
