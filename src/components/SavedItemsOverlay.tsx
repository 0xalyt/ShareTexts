/**
 * SavedItemsOverlay — THE library. Both entry points (landing header button,
 * room settings row) open this one component; it reads the one collection via
 * savedStore. Nothing else in the app holds saved state.
 *
 * Sheet grammar matches SettingsOverlay/ConfirmSheet: bottom sheet on
 * mobile, centered card on ≥sm, focus-trapped, Escape/backdrop/✕ to close,
 * portal to <body> so room stacking contexts can't trap it.
 *
 * Contents: header (title + count), search (only once the list earns it),
 * kind-appropriate rows with their real actions, empty / loading / error
 * states, and Clear all behind a ConfirmSheet that spells out the blast
 * radius. Saved content is UNTRUSTED: text renders as text nodes only, links
 * are re-validated to http(s) on read before any anchor is rendered, and
 * blobs get object URLs that are revoked when their view unmounts.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Trash2, Copy, Check, Download, ExternalLink,
  FileText, Link as Link2, ChevronDown, ChevronUp, AlertCircle, Bookmark,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { I18nApi } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useScrollFade } from '../lib/useScrollFade';
import { DUR } from '../lib/motion/tokens';
import { cn, formatBytes } from '../lib/utils';
import { FileTypeIcon } from './FileTypeIcon';
import { ConfirmSheet } from './ConfirmSheet';
import { FitWidth, Expandable } from './Expandable';
import { useSavedSnapshot } from '../lib/savedItems';
import {
  removeItem, clearSavedItems, reloadSavedItems,
  type SavedItem, type SavedErrorCode,
} from '../lib/savedStore';

const errKey = (code: SavedErrorCode | undefined) =>
  code === 'quota' ? 'saved.errQuota' as const
    : code === 'unavailable' ? 'saved.errUnavailable' as const
      : 'saved.errGeneric' as const;

/** http(s) gate re-applied on READ — a stored URL never becomes an anchor
 *  unless it re-parses as a plain web URL, even if the record is ancient or
 *  was written by a future/buggy version. */
function safeWebUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

/** Object URL for a stored Blob — created per view, revoked on unmount, so
 *  previews never leak URLs or hold bytes alive after the row is gone. */
function useBlobUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => { URL.revokeObjectURL(u); };
  }, [blob]);
  return url;
}

function triggerDownload(item: SavedItem): void {
  if (!item.blob) return;
  const u = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = item.filename || 'saved-file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the browser has had time to start the download — revoking
  // synchronously can cancel it in some engines.
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}

/* ----------------------------- image viewer ------------------------------ */

function SavedImageViewer({ item, onClose }: { item: SavedItem; onClose: () => void }) {
  const { t } = useI18n();
  const url = useBlobUrl(item.blob);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  // Same contract as the chat's ImageViewer: while a photo owns the screen,
  // the app's Escape handler must not fire its own layer (disconnect confirm).
  useEffect(() => {
    const w = window as Window & { __stImageViewerOpen?: boolean };
    w.__stImageViewerOpen = true;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => {
      w.__stImageViewerOpen = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUR.short / 1000 }} /* motion takes SECONDS; DUR is ms */
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={item.filename || t('saved.typeImage')}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {url && (
        <img
          src={url}
          alt={item.filename || item.text || ''}
          className="max-h-[78vh] max-w-full rounded-[12px] object-contain shadow-[0_24px_70px_-12px_rgba(0,0,0,0.6)]"
        />
      )}
      <div className="mt-3 flex items-center gap-3 max-w-full">
        <span className="text-[13px] text-white/70 truncate">{item.filename || ''}</span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="shrink-0 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

/* --------------------------------- row ----------------------------------- */

function KindThumb({ item }: { item: SavedItem }) {
  const url = useBlobUrl(item.kind === 'image' ? item.blob : undefined);
  if (item.kind === 'image') {
    return url ? (
      <span className="shrink-0 w-12 h-12 rounded-[10px] overflow-hidden bg-black/[0.05] dark:bg-white/[0.06]">
        <img src={url} alt="" className="w-full h-full object-cover st-img-edge" />
      </span>
    ) : (
      <span className="shrink-0 w-12 h-12 rounded-[10px] bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center text-apple-ink-muted" aria-hidden>
        <FileText className="w-5 h-5" />
      </span>
    );
  }
  if (item.kind === 'link') {
    return (
      <span className="shrink-0 w-12 h-12 rounded-[10px] bg-apple-blue/10 dark:bg-azure-400/10 text-apple-blue dark:text-azure-400 flex items-center justify-center" aria-hidden>
        <Link2 className="w-5 h-5" />
      </span>
    );
  }
  if (item.kind === 'text') {
    return (
      <span className="shrink-0 w-12 h-12 rounded-[10px] bg-status-warning/10 text-status-warning-ink dark:bg-white/[0.06] dark:text-white/60 flex items-center justify-center" aria-hidden>
        <FileText className="w-5 h-5" />
      </span>
    );
  }
  return (
    // FileTypeIcon draws its own tile at size×1.9, so 25 → a ~48px tile that
    // matches every other kind's w-12 h-12 thumb. (48 here rendered a 91px
    // tile that overflowed the slot and sat under the action buttons.)
    <span className="shrink-0 w-12 h-12" aria-hidden>
      <FileTypeIcon name={item.filename || 'file'} mimeType={item.mimeType} size={25} />
    </span>
  );
}

/** Small quiet pill — same family as the chat's action buttons, quieter
 *  because these sit in a list, not a bubble. 40px touch target. */
function RowAction({
  icon, label, onClick, href, danger, testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  testId?: string;
}) {
  const cls = cn(
    'st-tap inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-[12px] font-semibold transition-colors',
    danger
      ? 'text-apple-ink-muted dark:text-white/55 hover:text-status-danger dark:hover:text-status-danger hover:bg-status-danger/10'
      : 'bg-black/[0.045] text-apple-ink hover:bg-black/[0.08] dark:bg-white/[0.07] dark:text-white dark:hover:bg-white/[0.12]'
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} data-testid={testId} title={label} aria-label={label}>
        {icon}
        <FitWidth><span>{label}</span></FitWidth>
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} data-testid={testId} title={label} aria-label={label}>
      {icon}
      {/* Label swaps in place (Copy → Copied). FitWidth springs the button to
          the new label's width so the action row beside it reflows *with* the
          animation instead of one frame after it — the container never snaps. */}
      <FitWidth><span>{label}</span></FitWidth>
    </button>
  );
}

function SavedRow({
  item,
  onRemove,
  onView,
  setError,
}: {
  // NOTE: `key` is declared only so `<SavedRow key={…}>` typechecks — the
  // same convention as Bar in SkeletonScreen (this repo's React 19 types). 
  key?: React.Key;
  item: SavedItem;
  onRemove: (item: SavedItem) => Promise<void>;
  onView: (item: SavedItem) => void;
  setError: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const kindLabel = t(
    item.kind === 'text' ? 'saved.typeText'
      : item.kind === 'link' ? 'saved.typeLink'
        : item.kind === 'image' ? 'saved.typeImage' : 'saved.typeFile'
  );
  const date = new Date(item.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const meta = [
    kindLabel,
    typeof item.size === 'number' && item.kind !== 'text' && item.kind !== 'link' ? formatBytes(item.size) : null,
    t('saved.savedOn', { date }),
  ].filter(Boolean).join(' · ');

  const safeUrl = item.kind === 'link' ? safeWebUrl(item.url) : null;
  let host = item.host || '';
  if (item.kind === 'link' && safeUrl && !host) {
    try { host = new URL(safeUrl).hostname; } catch { /* unreachable */ }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(t('saved.errGeneric'));
    }
  };

  const doRemove = async () => {
    if (busy) return;
    setBusy(true);
    try { await onRemove(item); }
    finally { setBusy(false); }
  };

  const longText = item.kind === 'text' && (item.text?.length ?? 0) > 240;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: 'easeOut' } }}
      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
      className="st-card rounded-[16px] p-3 flex gap-3"
      data-testid="saved-row"
      data-kind={item.kind}
    >
      <KindThumb item={item} />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* Primary line — text as TEXT (never markup), link host as the
            anchor, filename clamped. break-words keeps long Unicode and
            unbroken strings inside the card. */}
        {item.kind === 'link' ? (
          <div className="min-w-0">
            {safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[14px] font-semibold text-apple-blue dark:text-azure-400 hover:underline truncate"
              >
                {host || safeUrl}
              </a>
            ) : (
              <span className="block text-[14px] font-semibold text-apple-ink dark:text-white truncate">{host || ''}</span>
            )}
            <span className="block text-[12px] text-apple-ink-muted dark:text-white/45 break-all line-clamp-2">{item.url}</span>
          </div>
        ) : item.kind === 'text' ? (
          <div className="min-w-0">
            {/* line-clamp releasing is a content resize with NO unmount — the
                node stays put, its height changes. Expandable tracks that
                height and springs, so the text grows instead of snapping; the
                button below rides down with it. */}
            <Expandable>
              <p className={cn(
                'text-[14px] leading-snug text-apple-ink dark:text-white whitespace-pre-wrap break-words',
                !expanded && 'line-clamp-3'
              )}>
                {item.text}
              </p>
            </Expandable>
            {longText && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-apple-blue active:opacity-70"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? t('msg.collapse') : t('msg.showFull')}
              </button>
            )}
          </div>
        ) : (
          <span className="block text-[14px] font-semibold text-apple-ink dark:text-white break-words line-clamp-2">
            {item.kind === 'image' && (item.text || item.filename) ? (item.text || item.filename) : item.filename || kindLabel}
          </span>
        )}

        <span className="text-[11px] text-apple-ink-muted dark:text-white/40 tnum">{meta}</span>

        {/* Actions — only what can actually work for this kind. */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {item.kind === 'text' && (
            <RowAction
              icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              label={copied ? t('action.copied') : t('action.copy')}
              onClick={() => { if (item.text) void copy(item.text); }}
              testId="saved-copy"
            />
          )}
          {item.kind === 'link' && safeUrl && (
            <>
              <RowAction
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                label={t('saved.openLink')}
                href={safeUrl}
                testId="saved-open"
              />
              <RowAction
                icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                label={copied ? t('action.copied') : t('saved.copyUrl')}
                onClick={() => { void copy(safeUrl); }}
                testId="saved-copy"
              />
            </>
          )}
          {item.kind === 'image' && (
            <>
              <RowAction
                icon={<Search className="w-3.5 h-3.5" />}
                label={t('saved.view')}
                onClick={() => onView(item)}
                testId="saved-view"
              />
              <RowAction
                icon={<Download className="w-3.5 h-3.5" />}
                label={t('saved.download')}
                onClick={() => triggerDownload(item)}
                testId="saved-download"
              />
            </>
          )}
          {item.kind === 'file' && (
            <RowAction
              icon={<Download className="w-3.5 h-3.5" />}
              label={t('saved.download')}
              onClick={() => triggerDownload(item)}
              testId="saved-download"
            />
          )}
          <span className="ml-auto" aria-hidden />
          <RowAction
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label={t('saved.remove')}
            onClick={() => { void doRemove(); }}
            danger
            testId="saved-remove"
          />
        </div>
      </div>
    </motion.li>
  );
}

/* ------------------------------- overlay --------------------------------- */

export function SavedItemsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t }: I18nApi = useI18n();
  const snapshot = useSavedSnapshot();
  const trapRef = useFocusTrap(open, onClose);

  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(60);
  // Edge-aware fade on the list viewport — arms only while the list can
  // actually scroll, so a short list keeps its last row fully visible.
  const listRef = useScrollFade<HTMLDivElement>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [viewing, setViewing] = useState<SavedItem | null>(null);

  const items = snapshot.items;

  // Search only earns its place once the list is long enough to need it.
  const showSearch = items.length > 8;
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((i) =>
      [i.text, i.url, i.host, i.filename].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [items, q]);
  const shown = filtered.slice(0, limit);

  // Reset the window whenever the query changes; keep it while rows append.
  useEffect(() => { setLimit(60); }, [query]);

  const errText = (code: SavedErrorCode | undefined) => t(errKey(code));

  const handleRemove = async (item: SavedItem) => {
    try {
      await removeItem(item.id);
      setActionError(null);
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? (e as { code: SavedErrorCode }).code : 'failed';
      setActionError(errText(code));
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearSavedItems();
      setActionError(null);
      setConfirmClear(false);
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? (e as { code: SavedErrorCode }).code : 'failed';
      setActionError(errText(code));
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  };

  const countLabel = items.length === 1 ? t('saved.countOne') : t('saved.countMany', { n: items.length });

  const body = (() => {
    if (snapshot.status === 'loading') {
      return (
        <div className="py-10 text-center text-[13px] text-apple-ink-muted dark:text-white/45" data-testid="saved-loading">
          {t('common.loading')}
        </div>
      );
    }
    if (snapshot.status === 'error') {
      return (
        <div className="py-8 px-4 flex flex-col items-center gap-3 text-center" data-testid="saved-error">
          <AlertCircle className="w-6 h-6 text-status-danger" aria-hidden />
          <p className="text-[14px] text-apple-ink dark:text-white">{errText(snapshot.errorCode)}</p>
          <button
            type="button"
            onClick={() => { void reloadSavedItems(); }}
            className="px-4 min-h-[40px] rounded-full bg-apple-parchment dark:bg-apple-tile-2 text-[13px] font-semibold text-apple-ink dark:text-white"
          >
            {t('common.tryAgain')}
          </button>
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="py-8 px-5 flex flex-col items-center text-center" data-testid="saved-empty">
          <span className="w-12 h-12 rounded-full bg-ember/10 text-ember flex items-center justify-center" aria-hidden>
            <Bookmark className="w-5 h-5" />
          </span>
          <p className="mt-3 text-[15px] font-semibold text-apple-ink dark:text-white">{t('saved.emptyTitle')}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-apple-ink-muted dark:text-white/55 max-w-[300px]">
            {t('saved.emptyBody')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 px-5 min-h-[40px] rounded-full bg-ember hover:bg-brand-strong text-white text-[13px] font-semibold transition-colors"
            data-testid="saved-empty-cta"
          >
            {t('saved.emptyCta')}
          </button>
        </div>
      );
    }
    return (
      <>
        {showSearch && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-ink-muted dark:text-white/40" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('saved.search')}
                placeholder={t('saved.search')}
                data-testid="saved-search"
                className="w-full h-10 pl-9 pr-3 rounded-[12px] bg-black/[0.045] dark:bg-white/[0.07] text-[14px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
          </div>
        )}
        {actionError && (
          <p role="alert" className="mx-4 mb-2 rounded-[12px] bg-status-danger/10 text-status-danger text-[13px] font-medium px-3 py-2" data-testid="saved-action-error">
            {actionError}
          </p>
        )}
        <ul className="px-4 flex flex-col gap-2.5 list-none">
          {/* popLayout: a filtered-out row is pulled from flow the instant it
              starts leaving, so the rows beneath glide up *with* its exit
              instead of jumping the moment it unmounts. propagate: closing the
              whole sheet also animates the rows out with their sheet, rather
              than the sheet sliding down over rows that vanish pre-frame. */}
          <AnimatePresence mode="popLayout" propagate>
            {shown.map((item) => (
              <SavedRow key={item.id} item={item} onRemove={handleRemove} onView={setViewing} setError={setActionError} />
            ))}
          </AnimatePresence>
        </ul>
        {filtered.length > limit && (
          <div className="flex justify-center pt-3 pb-1">
            <button
              type="button"
              onClick={() => setLimit((n) => n + 60)}
              className="px-4 min-h-[40px] rounded-full bg-black/[0.045] dark:bg-white/[0.07] text-[13px] font-semibold text-apple-ink dark:text-white"
              data-testid="saved-show-more"
            >
              {t('saved.showMore')}
            </button>
          </div>
        )}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-[13px] text-apple-ink-muted dark:text-white/45">
            {t('saved.search')}: “{query.trim()}”
          </p>
        )}
      </>
    );
  })();

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.short / 1000 }} /* motion takes SECONDS; DUR is ms */
            className="fixed inset-0 z-[90] bg-black/35 dark:bg-black/60 flex items-end sm:items-center justify-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={t('saved.title')}
            onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          >
            <motion.div
              ref={trapRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="w-full sm:max-w-[460px]"
              data-testid="saved-overlay"
            >
              <div className="relative sm:rounded-[20px] sm:overflow-hidden rounded-t-[24px] bg-white/95 dark:bg-surface-dark/95 backdrop-blur-2xl sm:shadow-[0_24px_70px_-12px_rgba(0,0,0,0.4)] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.3)] flex flex-col max-h-[85dvh] pb-[max(env(safe-area-inset-bottom),14px)] sm:pb-0">
                <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden>
                  <span className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
                </div>

                <div className="px-6 pt-4 sm:pt-6 pb-1 flex items-start justify-between gap-3 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">
                      {t('saved.title')}
                    </h3>
                    {snapshot.status === 'ready' && items.length > 0 && (
                      <p className="text-[12px] text-apple-ink-muted dark:text-white/45 tnum">{countLabel}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close')}
                    data-testid="saved-close"
                    className="shrink-0 -mt-1 -mr-1 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-apple-ink-muted/70 dark:text-white/40 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-90 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div ref={listRef} className="st-scroll-fade-y flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 pt-2">
                  {body}
                </div>

                {items.length > 0 && snapshot.status === 'ready' && (
                  <div className="shrink-0 px-4 sm:px-5 pt-3 pb-2 mt-1 border-t border-apple-divider dark:border-white/[0.06] flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-snug text-apple-ink-muted dark:text-white/40 max-w-[62%]">
                      {t('saved.localNote')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      disabled={clearing}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-[13px] font-semibold text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-60"
                      data-testid="saved-clear"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      {t('saved.clear')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Destructive confirmation — own sheet, own focus trap, paints above. */}
      <ConfirmSheet
        open={open && confirmClear}
        title={t('saved.clearTitle')}
        body={t('saved.clearBody')}
        confirmLabel={t('saved.clear')}
        cancelLabel={t('action.cancel')}
        onConfirm={() => { void handleClear(); }}
        onCancel={() => setConfirmClear(false)}
      />

      {/* Full-screen photo view, only while one is open. */}
      <AnimatePresence>
        {open && viewing && <SavedImageViewer item={viewing} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </>,
    typeof document !== 'undefined' ? document.body : null
  );
}
