/**
 * HopSheet — My devices.
 *
 * One surface for the whole of Hop: link two devices (a code on one screen,
 * a camera on the other, four emoji on both), then send to them whenever.
 * What is sent waits in the mailbox until the other device opens ShareTexts.
 *
 * Every state is a complete still picture: the status of an item is a word
 * under it, never a colour or a motion alone.
 */
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, FileText, RotateCcw, Undo2 } from 'lucide-react';
import { motion } from 'motion/react';
import { AlloSymbol } from '../AlloSymbol';
import { MessageComposer } from '../MessageComposer';
import { ConfirmSheet } from '../ConfirmSheet';
import { Sheet } from '../ui/Sheet';
import { TactileButton } from '../TactileButton';
import { SystemAlert } from '../SystemAlert';
import { QrArt } from '../qr/QrArt';
import { useI18n } from '../../lib/i18n';
import { fmtTime } from '../../lib/format';
import { cn, formatBytes } from '../../lib/utils';
import { hapticSuccess, hapticTap } from '../../lib/haptics';
import { useMotionPreference } from '../../lib/useMotionPreference';
import { DUR, EASE } from '../../lib/motion/tokens';
import './HopSheet.css';
import { HOP_EVENT, parseHopLink, readHopCache, type HopDevice, type HopLink } from '../../lib/hop/flag';
import {
  HOP_MAX_BYTES, HopError, approve, autoCopiedId, autoCopy, beginInvite, fileOf, findJoiner, joinLink, markAllSeen,
  retry, sendFile, sendText, setAutoCopy, startHop, subscribe, syncNow, timeline, unlink, withdraw,
  type HopEntry, type HopInvite, type HopJoin, type HopJoiner, type HopProblem,
} from '../../lib/hop/hop';

const QRScanner = lazy(() => import('../QRScanner').then((m) => ({ default: m.QRScanner })));

type View = 'intro' | 'invite' | 'confirm' | 'joining' | 'scan' | 'home';
type DictKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

const PROBLEM_KEY: Record<HopProblem, DictKey> = {
  UNSUPPORTED: 'hop.err.unsupported',
  OFFLINE: 'hop.err.offline',
  EXPIRED: 'hop.err.expired',
  USED: 'hop.err.used',
  MISMATCH: 'hop.err.mismatch',
  ALREADY_LINKED: 'hop.err.already',
  FULL: 'hop.err.full',
  TOO_BIG: 'hop.err.tooBig',
  STORAGE: 'hop.err.storage',
  UNKNOWN: 'hop.err.unknown',
};

const STATE_KEY: Record<NonNullable<HopEntry['state']>, DictKey> = {
  queued: 'hop.state.queued',
  sending: 'hop.state.sending',
  sent: 'hop.state.sent',
  delivered: 'hop.state.delivered',
  seen: 'hop.state.delivered',
  failed: 'hop.state.failed',
  paused: 'hop.state.failed',
  expired: 'hop.state.failed',
};

const problemOf = (err: unknown): HopProblem => (err instanceof HopError ? err.problem : 'UNKNOWN');
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function HopSheet({
  open,
  onClose,
  incomingLink,
  sharedText,
  onConsumed,
}: {
  open: boolean;
  onClose(): void;
  /** A `#hop=` link this page was opened with: join straight away. */
  incomingLink?: HopLink | null;
  /** Text handed over by the OS share sheet: waits in the composer. */
  sharedText?: string | null;
  /** Called once the link or shared text has been taken, so it is not replayed. */
  onConsumed?(): void;
}) {
  const { t, lang } = useI18n();
  const reduced = useMotionPreference();
  const quiet = reduced || document.documentElement.dataset.motionIntent !== 'pointer';
  const [view, setView] = useState<View>(() => (readHopCache()?.devices.length ? 'home' : 'intro'));
  const [problem, setProblem] = useState<HopProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<HopDevice[]>(() => readHopCache()?.devices ?? []);
  const [invite, setInvite] = useState<HopInvite | null>(null);
  const [joiner, setJoiner] = useState<HopJoiner | null>(null);
  const [join, setJoin] = useState<HopJoin | null>(null);
  const [justLinked, setJustLinked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [entries, setEntries] = useState<HopEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [askAutoCopy, setAskAutoCopy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const joinRef = useRef<HopJoin | null>(null);
  const joinAttempt = useRef(0);
  const activeAt = useRef(Date.now());
  const takenLink = useRef<HopLink | null>(null);

  const fail = useCallback((err: unknown) => setProblem(problemOf(err)), []);

  /* The landing row and this sheet read the same cache, so they cannot disagree. */
  useEffect(() => {
    const sync = () => setDevices(readHopCache()?.devices ?? []);
    window.addEventListener(HOP_EVENT, sync);
    return () => window.removeEventListener(HOP_EVENT, sync);
  }, []);

  /* ── joining: this device opened or scanned a code ───────────────────── */
  const beginJoin = useCallback((link: HopLink) => {
    // A closed sheet or a second attempt makes this one stale; its late
    // answer must not move the screen.
    const attempt = ++joinAttempt.current;
    const current = () => attempt === joinAttempt.current;
    setProblem(null);
    setJoin(null);
    setView('joining');
    joinLink(link)
      .then((j) => {
        if (!current()) { j.cancel(); return null; }
        joinRef.current = j;
        setJoin(j);
        return j.done;
      })
      .then((list) => {
        if (!list || !current()) return;
        joinRef.current = null;
        setDevices(list);
        setJustLinked(true);
        hapticSuccess();
        setView('home');
      })
      .catch((err) => {
        if (!current()) return;
        joinRef.current = null;
        fail(err);
        setView(readHopCache()?.devices.length ? 'home' : 'intro');
      });
  }, [fail]);

  useEffect(() => {
    // One link, one join: an effect that runs twice must not ask twice.
    if (!open || !incomingLink || takenLink.current === incomingLink) return;
    takenLink.current = incomingLink;
    onConsumed?.();
    beginJoin(incomingLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, incomingLink]);

  useEffect(() => {
    if (!open || !sharedText) return;
    setDraft((d) => d || sharedText);
    onConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sharedText]);

  /* Closing the sheet abandons a half-made link; a finished one is kept. */
  useEffect(() => {
    if (open) return;
    joinAttempt.current += 1;
    joinRef.current?.cancel();
    joinRef.current = null;
    setInvite(null);
    setJoiner(null);
    setProblem(null);
    setConfirmUnlink(false);
    setView(readHopCache()?.devices.length ? 'home' : 'intro');
  }, [open]);

  /* ── inviting: this device shows the code ────────────────────────────── */
  const showCode = useCallback(() => {
    setProblem(null);
    setBusy(true);
    setJoiner(null);
    beginInvite()
      .then((inv) => { setInvite(inv); setNow(Date.now()); setView('invite'); })
      .catch(fail)
      .finally(() => setBusy(false));
  }, [fail]);

  const expired = invite ? now >= invite.expiresAt : false;
  useEffect(() => {
    if (!open || view !== 'invite' || !invite || expired) return;
    let stopped = false;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      findJoiner(invite)
        .then((found) => {
          if (stopped || !found) return;
          setJoiner(found);
          hapticTap();
          setView('confirm');
        })
        .catch(() => { /* offline for a moment: the next look tries again */ });
    }, 2000);
    return () => { stopped = true; window.clearInterval(tick); window.clearInterval(poll); };
  }, [open, view, invite, expired]);

  const confirmMatch = useCallback(() => {
    if (!invite || !joiner) return;
    setBusy(true);
    approve(invite, joiner)
      .then((list) => {
        setDevices(list);
        setJustLinked(true);
        hapticSuccess();
        setInvite(null);
        setJoiner(null);
        setView('home');
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }, [invite, joiner, fail]);

  const rejectMatch = useCallback(() => {
    setInvite(null);
    setJoiner(null);
    setProblem('MISMATCH');
    setView(readHopCache()?.devices.length ? 'home' : 'intro');
  }, []);

  /* ── home: the timeline ──────────────────────────────────────────────── */
  const reload = useCallback(() => {
    void timeline().then((list) => {
      setEntries(list);
      if (list.some((e) => e.dir === 'in' && !e.seen)) void markAllSeen();
    });
  }, []);

  const onHome = open && view === 'home';
  useEffect(() => {
    if (!onHome) return;
    startHop();
    reload();
    const off = subscribe(reload);
    void syncNow();
    activeAt.current = Date.now();
    // The mailbox is asked, not pushed to, so the question is how often.
    // Quickly while something is happening, then less and less: a sheet left
    // open on a desk should cost almost nothing.
    let timer = 0;
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void syncNow();
      const idle = Date.now() - activeAt.current;
      timer = window.setTimeout(tick, idle < 60_000 ? 2500 : idle < 300_000 ? 8000 : 20_000);
    };
    timer = window.setTimeout(tick, 2500);
    return () => { off(); window.clearTimeout(timer); };
  }, [onHome, reload]);

  /* Keep the newest item in view, the way a conversation does. */
  const lastId = entries[entries.length - 1]?.id;
  useEffect(() => {
    activeAt.current = Date.now();
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, onHome]);

  useEffect(() => {
    const el = listRef.current;
    if (onHome && problem && el) el.scrollTop = el.scrollHeight;
  }, [onHome, problem]);

  // A pasted paragraph stays readable; the send and attachment controls stay
  // on the last line rather than moving to the middle of the growing field.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }, [draft, onHome]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setProblem(null);
    setJustLinked(false);
    setDraft('');
    hapticTap();
    sendText(text).catch((err) => { setDraft(text); fail(err); });
  }, [draft, fail]);

  const pickFiles = useCallback((files: FileList | null) => {
    setProblem(null);
    for (const file of Array.from(files ?? [])) void sendFile(file).catch(fail);
    if (fileRef.current) fileRef.current.value = '';
  }, [fail]);

  const copy = useCallback(async (entry: HopEntry) => {
    if (!entry.text) return;
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopiedId(entry.id);
      hapticTap();
      window.setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 2000);
      // The one moment a person has shown they wanted this copied.
      if (entry.dir === 'in' && autoCopy() === 'unasked') setAskAutoCopy(true);
    } catch {
      setProblem('UNKNOWN');
    }
  }, []);

  const save = useCallback(async (entry: HopEntry) => {
    const blob = entry.key ? await fileOf(entry.key) : null;
    if (!blob) { setProblem('UNKNOWN'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (entry.name || 'file').replace(/[\\/:*?"<>|]+/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, []);

  const copyLink = useCallback(async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setProblem('UNKNOWN');
    }
  }, [invite]);

  const doUnlink = useCallback(() => {
    void unlink().then(() => {
      setEntries([]);
      setDevices([]);
      setConfirmUnlink(false);
      setView('intro');
    });
  }, []);

  const alert = problem ? (
    <SystemAlert tone={problem === 'OFFLINE' ? 'warning' : 'danger'} icon={problem === 'OFFLINE' ? 'offline' : 'warning'} className="mt-4" compact>
      <span data-testid="hop-problem">{t(PROBLEM_KEY[problem], { size: formatBytes(HOP_MAX_BYTES, 0) })}</span>
    </SystemAlert>
  ) : null;

  const heading = (text: string) => (
    <h2 id="hop-title" className="hop-heading pr-10 text-[24px] font-medium leading-tight tracking-[-0.025em] text-apple-ink dark:text-white">{text}</h2>
  );
  const body = (text: string) => (
    <p className="hop-body mt-3 text-[15px] leading-relaxed text-apple-ink-muted dark:text-white/60">{text}</p>
  );
  const fourEmoji = (list: string[]) => (
    <div className="hop-emoji my-8 flex items-center justify-center gap-3" data-testid="hop-emoji" role="img" aria-label={list.join(' ')}>
      {list.map((e, i) => (
        <span key={i} style={{ animationDelay: `${i * 40}ms` }} className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-apple-parchment text-[34px] leading-none dark:bg-white/[0.06]">{e}</span>
      ))}
    </div>
  );

  const matchCheck = (
    <motion.span layoutId="hop-match-check" layout="position" transition={{ duration: quiet ? 0 : DUR.short / 1000, ease: EASE.out }} className="inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
      <AlloSymbol name="check" size={18} />
    </motion.span>
  );

  return (
    <>
    <Sheet open={open} onClose={onClose} labelledBy="hop-title" maxWidth={480} testId="hop-sheet" scroll="none">
      <div className="hop-surface flex min-h-0 flex-1 flex-col" data-hop-view={view} data-hop-quiet={quiet}>
        {view === 'intro' && (
          <div className="overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6" data-sheet-scroll>
            {heading(t('hop.intro.title'))}
            {body(t('hop.intro.body'))}
            {alert}
            <div className="mt-8 flex flex-col gap-2">
              <TactileButton variant="primary" size="lg" className="w-full" onClick={showCode} loading={busy} data-testid="hop-show-code">{t('hop.intro.show')}</TactileButton>
              <TactileButton variant="ghost" size="lg" className="w-full" onClick={() => { setProblem(null); setView('scan'); }} data-testid="hop-scan">{t('hop.intro.scan')}</TactileButton>
            </div>
            <details className="hop-privacy mt-6 border-t border-apple-divider/70 pt-2 text-[13px] text-apple-ink-muted dark:border-white/10 dark:text-white/60">
              <summary tabIndex={0} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">{t('nav.privacy')}<AlloSymbol name="plus" size={16} /></summary>
              <p className="pb-2 leading-relaxed">{t('hop.intro.note')}</p>
            </details>
          </div>
        )}

        {view === 'invite' && invite && (
          <div className="overflow-y-auto overscroll-contain px-5 pb-5 text-center sm:px-6 sm:pb-6" data-sheet-scroll>
            <div className="text-start">
              {heading(t('hop.invite.title'))}
              {body(t('hop.invite.body'))}
            </div>
            <div className={cn('mx-auto mt-8 w-fit rounded-[24px] border border-apple-divider/70 bg-white p-4', expired && 'opacity-30')} data-testid="hop-qr" data-hop-link={invite.link}>
              <QrArt value={invite.link} size={232} label={t('hop.invite.title')} />
            </div>
            <p className="mt-4 text-[14px] font-medium text-apple-ink dark:text-white" role="status">
              {expired ? t('hop.invite.expired') : t('hop.invite.waiting')}
            </p>
            {!expired && (
              <p className="mt-1 text-[13px] tabular-nums text-apple-ink-muted dark:text-white/50">{t('hop.invite.left', { time: clock(invite.expiresAt - now) })}</p>
            )}
            {alert}
            <div className="mt-5 flex flex-col gap-3">
              {expired ? (
                <TactileButton variant="primary" size="lg" className="w-full" onClick={showCode} loading={busy}>{t('hop.invite.again')}</TactileButton>
              ) : (
                <TactileButton variant="secondary" size="lg" className="w-full" onClick={copyLink} data-testid="hop-copy-link">
                  {linkCopied ? t('action.copied') : t('hop.invite.copy')}
                </TactileButton>
              )}
            </div>
          </div>
        )}

        {view === 'confirm' && joiner && (
          <div className="overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6" data-sheet-scroll>
            {heading(t('hop.confirm.title'))}
            {body(t('hop.confirm.body'))}
            {fourEmoji(joiner.emoji)}
            {alert}
            <div className="flex flex-col gap-3">
              <TactileButton variant="primary" size="lg" className="w-full" icon={matchCheck} onClick={confirmMatch} loading={busy} data-testid="hop-match">{t('hop.confirm.yes')}</TactileButton>
              <TactileButton variant="secondary" size="lg" className="w-full" onClick={rejectMatch} disabled={busy} data-testid="hop-no-match">{t('hop.confirm.no')}</TactileButton>
            </div>
          </div>
        )}

        {view === 'joining' && (
          <div className="overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6" data-sheet-scroll>
            {heading(join ? t('hop.join.title') : t('hop.join.starting'))}
            {join ? (
              <>
                {body(t('hop.join.body'))}
                {fourEmoji(join.emoji)}
                <p className="text-center text-[14px] font-medium text-apple-ink-muted dark:text-white/60" role="status">{t('hop.invite.waiting')}</p>
              </>
            ) : (
              <div className="my-6 flex items-center justify-center gap-3" aria-hidden>
                {[0, 1, 2, 3].map((i) => <span key={i} className="h-16 w-16 rounded-[16px] bg-apple-parchment dark:bg-white/[0.06]" />)}
              </div>
            )}
          </div>
        )}

        {view === 'scan' && (
          <div className="overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6" data-sheet-scroll>
            {heading(t('hop.scan.title'))}
            {body(t('hop.scan.body'))}
            <div className="mt-5 overflow-hidden rounded-[16px] bg-apple-parchment dark:bg-white/[0.06]">
              <Suspense fallback={<div className="aspect-square w-full" aria-hidden />}>
                <QRScanner
                  unavailableMessage={t('hop.scan.noCamera')}
                  onScan={(text) => {
                    const link = parseHopLink(text);
                    if (link) beginJoin(link);
                    else { setProblem('UNKNOWN'); setView('intro'); }
                  }}
                  onErrorFallback={() => setView('intro')}
                />
              </Suspense>
            </div>
            <TactileButton variant="secondary" size="lg" className="mt-4 w-full" onClick={showCode} loading={busy}>{t('hop.intro.show')}</TactileButton>
            <TactileButton variant="ghost" size="lg" className="mt-2 w-full" onClick={() => setView(devices.length ? 'home' : 'intro')}>{t('action.cancel')}</TactileButton>
          </div>
        )}

        {view === 'home' && (
          <>
            <div className="shrink-0 px-5 sm:px-6">
              {heading(t('hop.title'))}
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] leading-relaxed text-apple-ink-muted dark:text-white/60" data-testid="hop-devices">
                {devices.map((d) => (
                  <li key={d.deviceId} className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {d.label || t('hop.devices.unnamed')}
                  </li>
                ))}
              </ul>
              <div className="-mx-2 mt-1 flex flex-wrap items-center justify-between gap-x-4">
                <button
                  type="button"
                  onClick={showCode}
                  disabled={busy}
                  data-testid="hop-add"
                  className="hop-action inline-flex min-h-[44px] items-center gap-2 rounded-[12px] px-2 text-[13px] font-medium text-ember-ink hover:bg-black/[0.04] dark:text-ember dark:hover:bg-white/[0.06]"
                >
                  <AlloSymbol name="plus" size={16} />
                  {t('hop.devices.add')}
                </button>
                <button type="button" onClick={() => setConfirmUnlink(true)} aria-haspopup="dialog" aria-expanded={confirmUnlink} data-testid="hop-unlink" className="hop-action min-h-[44px] rounded-[12px] px-2 text-[13px] text-apple-ink-muted hover:bg-black/[0.04] dark:text-white/60 dark:hover:bg-white/[0.06]">
                  {t('hop.unlink')}
                </button>
              </div>
              {justLinked && (
                <p className="mt-2 inline-flex items-center gap-2 text-[14px] text-status-success" role="status" data-testid="hop-linked">{matchCheck}{t('hop.linked')}</p>
              )}
            </div>

            <div ref={listRef} className="hop-timeline min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-apple-divider/70 px-5 py-6 dark:border-white/10 sm:px-6" data-sheet-scroll data-testid="hop-timeline" role="region" aria-label={t('hop.title')}>
              {entries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-6 text-center">
                  {!justLinked && <p className="text-[15px] text-apple-ink-muted dark:text-white/60">{t('hop.empty.title')}</p>}
                </div>
              ) : (
                <ul className="flex flex-col gap-5">
                  {entries.map((e) => {
                    const mine = e.dir === 'out';
                    const failed = e.state === 'failed' || e.state === 'paused' || e.state === 'expired';
                    const isText = e.text !== undefined;
                    return (
                      <li key={`${e.dir}:${e.id}`} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')} data-testid={mine ? 'hop-out' : 'hop-in'} data-state={e.state}>
                        <div className={cn(
                          'hop-message min-w-0 max-w-[88%] rounded-[16px] px-4 py-3 text-[15px] leading-relaxed text-apple-ink dark:text-white',
                          mine ? 'bg-ember/12 dark:bg-ember/20' : 'border border-apple-divider/70 bg-white dark:border-white/10 dark:bg-white/[0.06]',
                        )}>
                          {isText ? (
                            e.kind === 'link'
                              ? <a href={e.text} target="_blank" rel="noopener noreferrer" className="break-all underline decoration-ember/50 underline-offset-2">{e.text}</a>
                              : <p className="whitespace-pre-wrap break-words" dir="auto">{e.text}</p>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-black/[0.05] dark:bg-white/10"><FileText className="h-4 w-4" aria-hidden /></span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium" dir="auto">{e.name || t('hop.composer.attach')}</span>
                                <span className="block text-[12px] text-apple-ink-muted dark:text-white/50">{formatBytes(e.size)}</span>
                              </span>
                            </div>
                          )}
                        </div>
                        <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-apple-ink-muted dark:text-white/50', mine && 'justify-end')}>
                          <span className={cn(failed && 'font-semibold text-status-danger')}>
                            {mine
                              ? t(STATE_KEY[e.state ?? 'queued'])
                              : e.id === autoCopiedId() ? t('hop.autocopy.done') : e.from ? t('hop.from', { device: e.from }) : t('hop.devices.unnamed')}
                            {' · '}{fmtTime(lang, e.at)}
                          </span>
                          {!mine && isText && (
                            <button type="button" onClick={() => void copy(e)} data-testid="hop-copy" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 font-semibold text-ember-ink hover:bg-black/[0.04] dark:text-ember dark:hover:bg-white/[0.06]">
                              {copiedId === e.id ? <AlloSymbol name="check" size={14} /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                              {copiedId === e.id ? t('action.copied') : t('action.copy')}
                            </button>
                          )}
                          {!mine && !isText && (
                            <button type="button" onClick={() => void save(e)} data-testid="hop-save" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 font-semibold text-ember-ink hover:bg-black/[0.04] dark:text-ember dark:hover:bg-white/[0.06]">
                              <Download className="h-3.5 w-3.5" aria-hidden />{t('action.save')}
                            </button>
                          )}
                          {mine && failed && (
                            <button type="button" onClick={() => void retry(e.id)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 font-semibold text-ember-ink hover:bg-black/[0.04] dark:text-ember dark:hover:bg-white/[0.06]">
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('action.retry')}
                            </button>
                          )}
                          {mine && e.state !== 'delivered' && e.state !== 'seen' && (
                            <button type="button" onClick={() => void withdraw(e.id)} data-testid="hop-withdraw" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                              <Undo2 className="h-3.5 w-3.5" aria-hidden />{t('hop.withdraw')}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {askAutoCopy && (
                <div className="mt-4 rounded-[16px] bg-apple-parchment p-3.5 dark:bg-white/[0.06]" data-testid="hop-autocopy-ask">
                  <p className="text-[14px] font-medium text-apple-ink dark:text-white">{t('hop.autocopy.ask')}</p>
                  <div className="mt-2.5 flex gap-2">
                    <TactileButton variant="primary" size="sm" onClick={() => { setAutoCopy(true); setAskAutoCopy(false); }} data-testid="hop-autocopy-yes">{t('hop.autocopy.yes')}</TactileButton>
                    <TactileButton variant="ghost" size="sm" onClick={() => { setAutoCopy(false); setAskAutoCopy(false); }}>{t('hop.autocopy.no')}</TactileButton>
                  </div>
                </div>
              )}
              {alert}
            </div>

            <form
              className="hop-composer flex shrink-0 items-end gap-2 border-t border-apple-divider/70 px-5 pt-4 dark:border-white/10 sm:px-6 sm:pb-6"
              onSubmit={(ev) => { ev.preventDefault(); submit(); }}
              data-sheet-no-drag
            >
              <input ref={fileRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(ev) => pickFiles(ev.target.files)} data-testid="hop-file" />
              <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('hop.composer.attach')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-apple-divider/70 bg-white text-apple-ink shadow-sm hover:bg-apple-parchment dark:border-white/[0.08] dark:bg-apple-tile-2 dark:text-white dark:hover:bg-apple-tile-3">
                <AlloSymbol name="plus" size={20} />
              </button>
              <div className="relative min-w-0 flex-1 rounded-[24px] st-lens st-lens-quiet focus-within:ring-2 focus-within:ring-ember/25">
                <MessageComposer
                  inputRef={inputRef}
                  input={{
                    value: draft,
                    onChange: (ev) => setDraft(ev.target.value),
                    onKeyDown: (ev) => {
                      if (ev.key === 'Enter' && !ev.shiftKey && !window.matchMedia('(pointer: coarse)').matches && !ev.nativeEvent.isComposing && ev.nativeEvent.keyCode !== 229) { ev.preventDefault(); submit(); }
                    },
                    placeholder: t('hop.composer.placeholder'),
                    'aria-label': t('hop.composer.placeholder'),
                    'data-testid': 'hop-input',
                  }}
                  onSend={submit}
                  sendDisabled={!draft.trim()}
                  sendLabel={t('hop.send')}
                  sendTestId="hop-send"
                />
              </div>
            </form>
          </>
        )}
      </div>
    </Sheet>
    <ConfirmSheet
      open={open && confirmUnlink}
      title={t('hop.unlink')}
      body={t('hop.unlink.hint')}
      confirmLabel={t('hop.unlink')}
      cancelLabel={t('action.cancel')}
      onConfirm={doUnlink}
      onCancel={() => setConfirmUnlink(false)}
    />
    </>
  );
}

export default HopSheet;
