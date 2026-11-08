import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Share2, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { hasUsedApp } from '../lib/rating';
import { ShareTextsLogo } from './ShareTextsLogo';
import {
  hasInstallPrompt,
  initInstallCapture,
  isManualInstallPlatform,
  noteVisit,
  promptInstall,
  shouldOfferInstall,
  silenceInstall,
} from '../lib/pwaInstall';

/** True while the transfer room owns the screen (ChatView's root marker). */
const roomActive = () =>
  typeof document !== 'undefined' && !!document.querySelector('[data-app-state="connected"]');

/**
 * Is this an empty-handed moment? Everything the offer must never interrupt:
 * an open sheet, a room, a keyboard, a half-watched tab. The install card is
 * a convenience; a convenience that covers the thing someone is doing is a
 * nuisance, and one nuisance is enough to make them dismiss it forever.
 */
function calm(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  if (roomActive()) return false;
  // A held sheet (Nearby) keeps its dialog in the DOM while closed, so ask
  // for one that is not sitting inside a hidden branch — presence alone is
  // not openness.
  for (const dialog of Array.from(document.querySelectorAll('[role="dialog"]'))) {
    if (!dialog.closest('[aria-hidden="true"]')) return false;
  }
  const active = document.activeElement as HTMLElement | null;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return false;
  return true;
}

/** How long the card stands on its own before it quietly leaves. */
const SELF_RETIRE_MS = 26_000;

/**
 * InstallNudge — "keep it handy?", asked once, at a calm moment.
 *
 * What keeps it from being one of those banners people learn to hate:
 *
 *   · IT WAITS FOR A MOMENT, NOT A TIMER. Nothing is offered on load. The
 *     offer is armed by something that actually happened — a device joined
 *     (sharetext:recents), a room being left, a return to the tab on a second
 *     visit — and only shown once ALL of those are true: no room, no sheet,
 *     no focused input, tab visible. If none of that arrives in three
 *     minutes, nothing is shown at all.
 *   · IT IS SMALL AND IN THE CORNER. A card, not a modal, not an overlay, no
 *     backdrop, nothing to dismiss before using the app.
 *   · IT RETIRES ITSELF. Twenty-six seconds of being ignored and it fades
 *     out without recording a refusal, so it can ask again another day.
 *   · IT CANNOT LIE. On Chromium the button triggers the browser's own
 *     install prompt. On iOS the card says "Share → Add to Home Screen" in
 *     words, because that is the only thing that works there.
 *   · IT STOPS. "Not now" is remembered for two weeks; "don't ask" is one
 *     tap away; installed apps never see it again.
 */
export function InstallNudge() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const shownRef = useRef(false);
  const retireRef = useRef<number>(0);
  /** Re-arm handle so a card that has to step aside hands the offer to a
   *  later calm moment instead of dropping it for good. */
  const armRef = useRef<(delay: number) => void>(() => {});

  useEffect(() => {
    initInstallCapture();
    noteVisit();
    const forced = typeof window !== 'undefined' && /[?&]install=1/.test(window.location.search);
    let timer = 0;
    let retired = false;

    const show = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      setManual(isManualInstallPlatform() && !hasInstallPrompt());
      setVisible(true);
      retireRef.current = window.setTimeout(() => {
        // Ignored, not refused: close it without writing a snooze.
        retired = true;
        setVisible(false);
      }, SELF_RETIRE_MS);
    };

    /** Wait for calm, polling at 1s, giving up after `budgetMs`. */
    const arm = (delay: number, budgetMs = 180_000) => {
      window.clearTimeout(timer);
      const deadline = performance.now() + budgetMs;
      const tick = () => {
        if (retired) return;
        if (performance.now() > deadline) return;
        if (forced || shouldOfferInstall(hasUsedApp())) {
          if (calm()) { show(); return; }
        } else {
          return;
        }
        timer = window.setTimeout(tick, 1000);
      };
      timer = window.setTimeout(tick, delay);
    };

    armRef.current = arm;

    if (forced) {
      arm(400);
    } else if (shouldOfferInstall(hasUsedApp())) {
      // A second visit can be offered after the page has settled; a first
      // visit needs an actual use first, which arrives as an event below.
      arm(readVisitBaseline() >= 2 ? 14_000 : 180_000, 240_000);
    }

    // A device joined the room — the strongest "this app did something for
    // me" signal there is. Offer shortly after the room empties.
    const onRecent = () => arm(4000);
    window.addEventListener('sharetext:recents', onRecent);

    // Coming back to the tab is a fresh moment; going into it is not.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && shownRef.current) return;
      if (document.visibilityState === 'visible') arm(6000);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(retireRef.current);
      window.removeEventListener('sharetext:recents', onRecent);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // A card that is already on screen when a room opens (or a sheet, or the
  // keyboard) gets out of the way on the next tick: on a phone this card's
  // bottom placement lands exactly on the composer, and a convenience that
  // covers the send button has failed at its job. It withdraws silently and
  // re-arms for a later calm moment — withdrawn, not refused.
  useEffect(() => {
    if (!visible) return;
    const iv = window.setInterval(() => {
      if (calm()) return;
      setVisible(false);
      window.clearTimeout(retireRef.current);
      armRef.current(12_000);
    }, 1500);
    return () => window.clearInterval(iv);
  }, [visible]);

  const close = (forever: boolean) => {
    silenceInstall(forever);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          data-testid="install-nudge"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'fixed z-[80] flex items-start gap-3 rounded-[16px] border border-black/[0.08] bg-white p-3.5 pr-2.5',
            'shadow-[0_16px_44px_-16px_rgba(20,16,10,0.35)]',
            'dark:border-white/[0.1] dark:bg-apple-tile-2',
            'left-4 right-4 bottom-[max(env(safe-area-inset-bottom),16px)]',
            'sm:left-auto sm:right-5 sm:bottom-5 sm:w-[330px]',
          )}
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-apple-parchment dark:bg-white/[0.06]">
            <ShareTextsLogo size={20} />
            {!manual && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ember text-white">
                <Download className="h-2.5 w-2.5" aria-hidden />
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-snug text-apple-ink dark:text-white">
              {t('install.title')}
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-apple-ink-muted dark:text-white/55">
              {manual ? t('install.iosBody') : t('install.body')}
            </span>

            <span className="mt-2.5 flex items-center gap-2">
              {/* iOS has no install API to call, so there is no button here —
                  the instruction in the body IS the action. A fake button
                  would be worse than none. */}
              {manual ? (
                <span className="inline-flex min-h-[36px] items-center gap-1.5 text-[12px] font-semibold text-ember dark:text-azure-400">
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  Share › Add to Home Screen
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="install-cta"
                  onClick={async () => {
                    const shown = await promptInstall();
                    if (!shown) silenceInstall(true);
                    setVisible(false);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-ember px-3.5 text-[12px] font-semibold text-white transition-transform active:scale-[0.97]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {t('install.cta')}
                </button>
              )}
              <button
                type="button"
                data-testid="install-snooze"
                onClick={() => close(false)}
                className="inline-flex min-h-[36px] items-center px-2 text-[12px] font-medium text-apple-ink-muted transition-colors hover:text-apple-ink dark:text-white/45 dark:hover:text-white"
              >
                {t('install.later')}
              </button>
              <button
                type="button"
                data-testid="install-never"
                onClick={() => close(true)}
                className="inline-flex min-h-[36px] items-center px-1.5 text-[12px] font-medium text-apple-ink-muted/70 transition-colors hover:text-apple-ink dark:text-white/30 dark:hover:text-white/70"
              >
                {t('install.never')}
              </button>
            </span>
          </span>

          <button
            type="button"
            aria-label={t('install.later')}
            onClick={() => close(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-apple-ink-muted transition-colors hover:bg-black/[0.05] hover:text-apple-ink dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function readVisitBaseline(): number {
  try {
    return Number(localStorage.getItem('sharetext.visits.v1')) || 0;
  } catch {
    return 0;
  }
}

export default InstallNudge;
