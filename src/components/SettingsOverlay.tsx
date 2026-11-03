import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronRight, X } from 'lucide-react';
import { RateCard } from './spaceui/rating';
import { useI18n, LANGS, type Lang } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useSession } from '../lib/SessionContext';
import { useFocusTrap } from '../lib/useFocusTrap';
import { readNoGlassPreference, setNoGlass } from '../lib/device';
import { HAPTICS_IOS, HAPTICS_STORE, haptic } from '../lib/haptics';
import { isPresenceHidden, setPresenceHidden } from '../lib/nearby';
import { isAutoConnectEnabled, setAutoConnectEnabled } from './NearbyDevices';
import { cn } from '../lib/utils';

/**
 * SettingsOverlay — one grouped sheet (§18, P3).
 *
 * Six groups, in the order a person actually asks: which device am I, how does
 * it look, what language is it in, do I want feedback, who can find me, and
 * what version is this. Every row is a 52px ListRow with an inset hairline —
 * the same grammar the Home doors use, so Settings reads as the same product
 * rather than a control panel bolted on.
 *
 * Real controls only: switches are `role="switch"` buttons with names, the
 * theme is the shared segmented control (Light | Auto | Dark), Language opens
 * a second sheet listing "Automatic (device language)" first and then every
 * language IN ITS OWN NAME, and the version comes from the build marker the
 * deploy stamps into the page.
 */

const APP_VERSION = (() => {
  if (typeof document === 'undefined') return 'dev';
  const meta = document.querySelector('meta[name="sharetexts-build"]');
  const value = meta?.getAttribute('content') || '';
  return value || 'dev';
})();

/** 52px row with an inset hairline above it (never under the last row). */
function Row({
  children,
  onClick,
  as = 'button',
  first = false,
  className,
  testId,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  as?: 'button' | 'div' | 'a';
  first?: boolean;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  href?: string;
}) {
  const Tag = as as 'button';
  const cls = cn(
    'relative flex w-full min-h-[52px] items-center gap-3 px-4 text-left',
    'text-[15px] text-apple-ink dark:text-white transition-colors',
    onClick || as === 'a' ? 'active:bg-black/[0.04] dark:active:bg-white/[0.06]' : '',
    className,
  );
  return (
    <div className={cn('relative', !first && 'before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-black/[0.07] dark:before:bg-white/10')}>
      <Tag type={as === 'button' ? 'button' : undefined} onClick={onClick} className={cls} data-testid={testId} aria-label={ariaLabel}>
        {children}
      </Tag>
    </div>
  );
}

function Switch({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => {
        onChange(!checked);
        haptic('select');
      }}
      className={cn(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-status-success' : 'bg-black/[0.12] dark:bg-white/[0.18]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200',
          checked ? 'translate-x-[20px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

function Group({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="mt-5 first:mt-2" data-testid={testId}>
      <h4 className="px-4 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-apple-ink-muted dark:text-white/55">
        {title}
      </h4>
      <div className="overflow-hidden rounded-[16px] bg-white/80 dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/10">
        {children}
      </div>
    </section>
  );
}

export function SettingsOverlay({
  open,
  onClose,
  onOpenSaved,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSaved?: () => void;
}) {
  const { t, lang, auto, setLang, useDeviceLanguage } = useI18n();
  const { choice, setChoice } = useTheme();
  const { session, setDeviceName } = useSession();
  const trapRef = useFocusTrap(open, onClose);

  const [languageOpen, setLanguageOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(session.deviceName || '');
  const [noGlass, setNoGlassState] = useState(() => readNoGlassPreference());
  const [hapticsOn, setHapticsOn] = useState(() => {
    try {
      return localStorage.getItem(HAPTICS_STORE) !== '0';
    } catch {
      return true;
    }
  });
  const [visible, setVisible] = useState(() => !isPresenceHidden());
  const [autoConnect, setAutoConnect] = useState(() => isAutoConnectEnabled());

  // Drag-to-dismiss (INTERACTION-MOTION §D). The grabber owns the gesture and
  // moves the panel 1:1 with the pointer; on release a decisive drag or a flick
  // dismisses from where the sheet already is, and anything less springs back.
  // The enter/exit animation lives on the outer element, so dragging and
  // dismissing never fight over the same transform.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<{ y: number; t: number; vy: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setLanguageOpen(false);
      setEditingName(false);
      setDragY(0);
      setDragging(false);
    }
  }, [open]);

  // Swapping the column unmounts whatever had focus, which would drop focus to
  // <body> — outside the trap, so the next Tab would restart at the top of the
  // document. Move focus with the change and give it back on the way out
  // (APPLE-DNA §6.4: a back path restores focus, not just state).
  const wasLanguageOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasLanguageOpen.current = false;
      return;
    }
    if (languageOpen) {
      wasLanguageOpen.current = true;
      const raf = requestAnimationFrame(() => {
        trapRef.current?.querySelector<HTMLElement>('[data-testid="settings-language-back"]')?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!wasLanguageOpen.current) return;
    wasLanguageOpen.current = false;
    const raf = requestAnimationFrame(() => {
      trapRef.current?.querySelector<HTMLElement>('[data-testid="settings-language-row"]')?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [languageOpen, open]);

  const commitName = useCallback(() => {
    const next = draftName.trim().slice(0, 40);
    if (next && next !== session.deviceName) setDeviceName(next);
    setEditingName(false);
  }, [draftName, session.deviceName, setDeviceName]);

  const languageLabel = auto ? t('settings.languageAutomatic') : LANGS.find((l) => l.code === lang)?.native ?? 'English';

  const onGrabStart = (e: React.PointerEvent<HTMLDivElement>) => {
    dragFrom.current = { y: e.clientY, t: performance.now(), vy: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onGrabMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;
    const next = Math.max(0, e.clientY - from.y);
    const now = performance.now();
    const dt = now - from.t;
    if (dt > 0) {
      // Smoothed so one jittery sample cannot fake a flick.
      const vy = (e.clientY - from.y - dragY) / dt * 1000;
      from.vy = from.vy * 0.7 + vy * 0.3;
      from.t = now;
    }
    setDragY(next);
  };

  const onGrabEnd = () => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragging(false);
    // 88px is a third of the grabber's travel; 500px/s is a flick.
    if (from && (dragY > 88 || from.vy > 500)) onClose();
    else setDragY(0);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] bg-black/35 dark:bg-black/60 flex items-end sm:items-center justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t('settings.title')}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={trapRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            exit={{ y: '100%', transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}
            className="w-full sm:max-w-[440px]"
            data-testid="settings-overlay"
          >
            <div
              className="relative sm:rounded-[24px] rounded-t-[24px] bg-apple-canvas dark:bg-surface-dark border border-apple-divider/60 dark:border-white/[0.08] shadow-sheet pb-[max(env(safe-area-inset-bottom),14px)] sm:pb-2 max-h-[88dvh] flex flex-col"
              style={{
                transform: dragY ? `translate3d(0, ${dragY}px, 0)` : undefined,
                transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              <div
                className="sm:hidden flex shrink-0 justify-center pt-2.5 pb-1 cursor-grab touch-none"
                aria-hidden
                onPointerDown={onGrabStart}
                onPointerMove={onGrabMove}
                onPointerUp={onGrabEnd}
                onPointerCancel={onGrabEnd}
              >
                <span className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
              </div>

              <div className="flex items-center justify-between px-4 pt-2 pb-1">
                <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-apple-ink dark:text-white">{t('settings.title')}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.close')}
                  className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-apple-ink-muted dark:text-white/70 active:scale-90 transition-transform"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Language is a second COLUMN, not a dialog on top of a dialog:
                  the sheet slides and the list is replaced, so Back (or this
                  chevron) is one gesture, in the same surface. */}
              {languageOpen ? (
                <div className="min-h-0 overflow-y-auto px-3 pb-4" data-testid="settings-language-list">
                  <button
                    type="button"
                    onClick={() => setLanguageOpen(false)}
                    data-testid="settings-language-back"
                    className="flex min-h-[44px] items-center gap-1 px-1 text-[15px] font-semibold text-[#9a3a08] dark:text-[#ffb340]"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" aria-hidden /> {t('settings.title')}
                  </button>
                  <div className="mb-3 rounded-[16px] bg-white/70 dark:bg-white/[0.06] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                  <div role="radiogroup" aria-label={t('settings.language')} data-testid="settings-language-group">
                  <LanguageRow
                    label={t('settings.languageAutomatic')}
                    selected={auto}
                    onClick={() => {
                      useDeviceLanguage();
                      setLanguageOpen(false);
                    }}
                    testId="language-automatic"
                  />
                  {LANGS.map((l) => (
                    <React.Fragment key={l.code}>
                      <LanguageRow
                        label={l.native}
                        selected={!auto && lang === l.code}
                        onClick={() => {
                          setLang(l.code as Lang);
                          setLanguageOpen(false);
                        }}
                        testId={`language-${l.code}`}
                      />
                    </React.Fragment>
                  ))}
                  </div>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 overflow-y-auto px-3 pb-4 room-scroll">
                  {/* ── Device ─────────────────────────────────────── */}
                  <Group title={t('settings.device')} testId="settings-device">
                    <Row first as="div" className="justify-between">
                      <span className="text-apple-ink-muted dark:text-white/70">{t('settings.deviceName')}</span>
                      {editingName ? (
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={commitName}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitName();
                            if (e.key === 'Escape') setEditingName(false);
                          }}
                          maxLength={40}
                          aria-label={t('settings.deviceName')}
                          className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-semibold text-apple-ink dark:text-white outline-none"
                          data-testid="settings-device-input"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftName(session.deviceName || '');
                            setEditingName(true);
                          }}
                          className="min-w-0 flex-1 truncate text-right min-h-[44px] text-[15px] font-semibold text-apple-ink dark:text-white"
                          data-testid="settings-device-name"
                        >
                          {session.deviceName || t('common.connected')}
                        </button>
                      )}
                    </Row>
                  </Group>

                  {/* ── Appearance ─────────────────────────────────── */}
                  <Group title={t('settings.theme')} testId="settings-appearance">
                    <Row first as="div" className="justify-between pr-3">
                      <span className="text-apple-ink-muted dark:text-white/70">{t('settings.themeMode')}</span>
                      <div className="flex rounded-full bg-black/[0.05] dark:bg-white/[0.09] p-[3px]" role="tablist" aria-label={t('settings.theme')}>
                        {(
                          [
                            ['light', t('settings.light')],
                            ['system', t('settings.auto')],
                            ['dark', t('settings.dark')],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            role="tab"
                            type="button"
                            aria-selected={choice === value}
                            onClick={() => setChoice(value)}
                            data-testid={`theme-${value}`}
                            className={cn(
                              'min-h-[44px] rounded-full px-3 text-[13px] font-semibold transition-colors',
                              choice === value
                                ? 'bg-white text-apple-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:bg-white/[0.9] dark:text-[#1d1d1f]'
                                : 'text-apple-ink-muted dark:text-white/70',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </Row>
                    <Row as="div" className="justify-between">
                      <span className="text-apple-ink-muted dark:text-white/70">{t('settings.reduceTransparency')}</span>
                      <Switch
                        checked={noGlass === '1'}
                        label={t('settings.reduceTransparency')}
                        testId="settings-no-glass"
                        onChange={(v) => {
                          setNoGlass(v ? true : null);
                          setNoGlassState(v ? '1' : null);
                        }}
                      />
                    </Row>
                  </Group>

                  {/* ── Language ───────────────────────────────────── */}
                  <Group title={t('settings.language')} testId="settings-language">
                    <Row first onClick={() => setLanguageOpen(true)} testId="settings-language-row">
                      <span className="flex-1">{t('settings.language')}</span>
                      <span className="truncate text-[14px] text-apple-ink-muted dark:text-white/70">{languageLabel}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-apple-ink-muted dark:text-white/50" aria-hidden />
                    </Row>
                  </Group>

                  {/* ── Feedback ───────────────────────────────────── */}
                  <Group title={t('settings.feedback')} testId="settings-feedback">
                    <Row first as="div" className="justify-between">
                      <span className="flex flex-col">
                        <span>{t('settings.haptics')}</span>
                        <span className="mt-0.5 text-[12px] text-apple-ink-muted dark:text-white/60">
                          {HAPTICS_IOS ? t('settings.hapticsHintIos') : t('settings.hapticsHint')}
                        </span>
                      </span>
                      <Switch
                        checked={hapticsOn}
                        label={t('settings.haptics')}
                        testId="settings-haptics"
                        onChange={(v) => {
                          setHapticsOn(v);
                          try {
                            localStorage.setItem(HAPTICS_STORE, v ? '1' : '0');
                          } catch {
                            /* private mode */
                          }
                        }}
                      />
                    </Row>
                    <Row as="div" className="block py-1">
                      <RateCard />
                    </Row>
                  </Group>

                  {/* ── Nearby ─────────────────────────────────────── */}
                  <Group title={t('settings.nearby')} testId="settings-nearby">
                    <Row first as="div" className="justify-between">
                      <span>{t('nearby.visibleTitle')}</span>
                      <Switch
                        checked={visible}
                        label={t('nearby.visibleTitle')}
                        testId="settings-nearby-visible"
                        onChange={(v) => {
                          setVisible(v);
                          setPresenceHidden(!v);
                        }}
                      />
                    </Row>
                    <Row as="div" className="justify-between">
                      <span className="flex flex-col">
                        <span>{t('nearby.autoTitle')}</span>
                        <span className="mt-0.5 text-[12px] text-apple-ink-muted dark:text-white/60">{t('nearby.autoHint')}</span>
                      </span>
                      <Switch
                        checked={autoConnect}
                        label={t('nearby.autoTitle')}
                        testId="settings-auto-connect"
                        onChange={(v) => {
                          setAutoConnect(v);
                          setAutoConnectEnabled(v);
                        }}
                      />
                    </Row>
                  </Group>

                  {/* ── About ──────────────────────────────────────── */}
                  <Group title={t('settings.about')} testId="settings-about">
                    {[
                      [t('nav.docs'), '/docs'],
                      [t('nav.guides'), '/guides'],
                      [t('nav.privacy'), '/privacy'],
                      [t('nav.terms'), '/terms'],
                    ].map(([label, href], i) => (
                      <a
                        key={href}
                        href={href}
                        className={cn(
                          'relative flex min-h-[52px] w-full items-center gap-3 px-4 text-[15px] text-apple-ink dark:text-white active:bg-black/[0.04] dark:active:bg-white/[0.06]',
                          i > 0 && 'before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-black/[0.07] dark:before:bg-white/10',
                        )}
                      >
                        <span className="flex-1">{label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-apple-ink-muted dark:text-white/50" aria-hidden />
                      </a>
                    ))}
                    <Row as="div" className="justify-between">
                      <span>{t('settings.version')}</span>
                      <span className="text-[14px] tabular-nums text-apple-ink-muted dark:text-white/70" data-testid="settings-version">
                        {APP_VERSION}
                      </span>
                    </Row>
                  </Group>

                  {onOpenSaved && (
                    <Group title={t('saved.title')} testId="settings-saved">
                      <Row first onClick={onOpenSaved} testId="settings-open-saved">
                        <span className="flex-1">{t('saved.title')}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-apple-ink-muted dark:text-white/50" aria-hidden />
                      </Row>
                    </Group>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    typeof document !== 'undefined' ? document.body : null,
  );
}

function LanguageRow({ label, selected, onClick, testId }: { label: string; selected: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      className={cn(
        'flex min-h-[52px] w-full items-center gap-3 rounded-[12px] px-3 text-left text-[15px] transition-colors',
        selected ? 'font-semibold text-apple-ink dark:text-white' : 'text-apple-ink dark:text-white/85',
        'active:bg-black/[0.04] dark:active:bg-white/[0.06]',
      )}
    >
      <span className="flex-1">{label}</span>
      {selected && <Check className="h-4 w-4 text-[#f06413]" aria-hidden />}
    </button>
  );
}

export default SettingsOverlay;
