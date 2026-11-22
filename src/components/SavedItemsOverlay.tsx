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
import { AnimatePresence } from 'motion/react';
import { MotionSurface } from './ui/MotionSurface';
import {
  X, Search, Trash2, Copy, Check, Download, ExternalLink,
  Bookmark, FileText, Link as Link2, ChevronDown, ChevronUp,
} from 'lucide-react';
import './ui/task-surfaces.css';
import { useI18n } from '../lib/i18n';
import { fmtDateTime } from '../lib/format';
import type { I18nApi } from '../lib/i18n';
import { useScrollFade } from '../lib/useScrollFade';
import { useFocusTrap } from '../lib/useFocusTrap';
import { DUR } from '../lib/motion/tokens';
import { Sheet } from './ui/Sheet';
import { StatePanel, StateSkeletonRow } from './ui/StatePanel';
import { SceneSaved } from './art/Scenes';
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

function SavedImageViewer({ item, onClose, focusRef }: {
  item: SavedItem;
  onClose: () => void;
  focusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const url = useBlobUrl(item.blob);

  // Same contract as the chat's ImageViewer: while a photo owns the screen,
  // the app's Escape handler must not fire its own layer (disconnect confirm).
  useEffect(() => {
    const w = window as Window & { __stImageViewerOpen?: boolean };
    w.__stImageViewerOpen = true;
    return () => {
      w.__stImageViewerOpen = false;
    };
  }, []);

  return (
    <MotionSurface
      ref={focusRef}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUR.short / 1000 }} /* motion takes SECONDS; DUR is ms */
      className="fixed inset-0 z-[100] bg-black/88 flex flex-col items-center justify-center p-4 sm:p-8"
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
          // A blob URL outlives nothing: the browser can drop it between the
          // list painting and the tap (storage pressure, a reload), and the
          // default broken-image glyph on a black lightbox looks like a crash.
          // Fall back to the same file glyph the thumbnail uses.
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="mt-3 flex items-center gap-3 max-w-full">
        <span className="text-[13px] text-white/70 truncate">{item.filename || ''}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="shrink-0 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-[0.97] transition-[color,background-color,border-color,box-shadow,transform,opacity]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </MotionSurface>
  );
}

/* --------------------------------- row ----------------------------------- */

function KindThumb({ item }: { item: SavedItem }) {
  const url = useBlobUrl(item.kind === 'image' ? item.blob : undefined);
  if (item.kind === 'image') {
    return url ? (
      <span className="shrink-0 w-12 h-12 rounded-[12px] overflow-hidden bg-black/[0.05] dark:bg-white/[0.06]">
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover st-img-edge"
          onError={(e) => {
            const box = e.currentTarget.parentElement as HTMLElement | null;
            if (!box) return;
            box.innerHTML = '';
            box.className = 'shrink-0 w-12 h-12 rounded-[12px] bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center text-apple-ink-muted';
          }}
        />
      </span>
    ) : (
      <span className="shrink-0 w-12 h-12 rounded-[12px] bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center text-apple-ink-muted" aria-hidden>
        <FileText className="w-5 h-5" />
      </span>
    );
  }
  if (item.kind === 'link') {
    return (
      <span className="shrink-0 w-12 h-12 rounded-[12px] bg-apple-blue/10 dark:bg-azure-400/10 text-apple-blue dark:text-azure-400 flex items-center justify-center" aria-hidden>
        <Link2 className="w-5 h-5" />
      </span>
    );
  }
  if (item.kind === 'text') {
    return (
      <span className="shrink-0 w-12 h-12 rounded-[12px] bg-status-warning/10 text-status-warning-ink dark:bg-white/[0.06] dark:text-white/60 flex items-center justify-center" aria-hidden>
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
 *  because these sit in a list, not a bubble. 44px touch target. */
function RowAction({
  icon, label, onClick, href, danger, compact, testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  compact?: boolean;
  testId?: string;
}) {
  const cls = cn(
    'st-tap inline-flex shrink-0 items-center justify-center gap-1.5 min-h-[44px] rounded-full text-[12px] font-medium transition-colors',
    compact ? 'w-11' : 'px-3',
    danger
      ? 'text-apple-ink-muted dark:text-white/65 hover:text-status-danger dark:hover:text-status-danger hover:bg-status-danger/10'
      : 'bg-black/[0.045] text-apple-ink hover:bg-black/[0.08] dark:bg-white/[0.07] dark:text-white dark:hover:bg-white/[0.12]'
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} data-testid={testId} title={label} aria-label={label}>
        {icon}
        {!compact && <FitWidth><span>{label}</span></FitWidth>}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} data-testid={testId} title={label} aria-label={label}>
      {icon}
      {/* Frequent action labels update immediately without a width tween. */}
      {!compact && <FitWidth><span>{label}</span></FitWidth>}
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
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const kindLabel = t(
    item.kind === 'text' ? 'saved.typeText'
      : item.kind === 'link' ? 'saved.typeLink'
        : item.kind === 'image' ? 'saved.typeImage' : 'saved.typeFile'
  );
  const date = fmtDateTime(lang, item.savedAt);
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
    <li
      className="st-card rounded-[16px] p-3 grid grid-cols-[48px_minmax(0,1fr)] gap-3"
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
                className="block text-[16px] font-medium text-apple-blue dark:text-azure-400 hover:underline truncate"
              >
                {host || safeUrl}
              </a>
            ) : (
              <span className="block text-[16px] font-medium text-apple-ink dark:text-white truncate">{host || ''}</span>
            )}
            <span className="block text-[12px] text-apple-ink-muted dark:text-white/65 break-all line-clamp-2">{item.url}</span>
          </div>
        ) : item.kind === 'text' ? (
          <div className="min-w-0">
            {/* line-clamp releasing is a content resize with NO unmount — the
                node stays put, its height changes. Expandable tracks that
                height and springs, so the text grows instead of snapping; the
                button below rides down with it. */}
            <Expandable>
              <p className={cn(
                'text-[16px] leading-snug text-apple-ink dark:text-white whitespace-pre-wrap break-words',
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
                className="mt-1 flex min-h-[44px] min-w-[44px] items-center gap-1 text-[14px] font-medium text-apple-blue active:opacity-70"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? t('msg.collapse') : t('msg.showFull')}
              </button>
            )}
          </div>
        ) : (
          <span className="block text-[16px] font-medium text-apple-ink dark:text-white break-words line-clamp-2">
            {item.kind === 'image' && (item.text || item.filename) ? (item.text || item.filename) : item.filename || kindLabel}
          </span>
        )}

        <span className="text-[13px] text-apple-ink-muted dark:text-white/65 tnum">{meta}</span>
      </div>

        {/* Actions — only what can actually work for this kind. */}
        <div className="col-span-2 flex items-center gap-2 flex-wrap">
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
                compact
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
                compact
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
            compact
            testId="saved-remove"
          />
        </div>
    </li>
  );
}

/* ------------------------------- overlay --------------------------------- */

export function SavedItemsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t }: I18nApi = useI18n();
  const snapshot = useSavedSnapshot();

  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(60);
  // Edge-aware fade on the list viewport — arms only while the list can
  // actually scroll, so a short list keeps its last row fully visible.
  const listRef = useScrollFade<HTMLDivElement>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [viewing, setViewing] = useState<SavedItem | null>(null);
  // Keep the trap in this mounted owner so closing the animated viewer
  // releases Escape immediately and restores View even with zero-duration exit.
  const viewerTrap = useFocusTrap(open && viewing !== null, () => setViewing(null));

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
      // Same frame, same anatomy, same floor as the other two states — and the
      // skeleton keeps the real row's geometry so the list fills in place.
      return (
        <StatePanel
          kind="loading"
          testId="saved-loading"
          title={t('saved.loadingTitle')}
          body={t('saved.loadingBody')}
        >
          <div className="mt-5 flex w-full flex-col gap-2.5">
            <StateSkeletonRow index={0} />
          </div>
        </StatePanel>
      );
    }
    if (snapshot.status === 'error') {
      // Name the problem in the title, name the fix in the body, offer the one
      // action that can resolve it. No apology, no "something went wrong".
      const code = snapshot.errorCode;
      return (
        <StatePanel
          kind="error"
          testId="saved-error"
          title={t(
            code === 'quota' ? 'saved.errQuotaTitle'
              : code === 'unavailable' ? 'saved.errUnavailableTitle'
                : 'saved.errLoadTitle'
          )}
          body={t(errKey(code))}
          action={{ label: t('common.tryAgain'), onClick: () => { void reloadSavedItems(); } }}
        />
      );
    }
    if (items.length === 0) {
      // Explain the real save action; closing this sheet doesn't start a room.
      return (
        <StatePanel
          kind="empty"
          testId="saved-empty"
          illustration={<SceneSaved size={112} />}
          title={t('saved.emptyTitle')}
          body={t('saved.emptyBody')}
          secondary={{ label: t('saved.emptyCta'), onClick: onClose, testId: 'saved-empty-cta' }}
        />
      );
    }
    return (
      <>
        {showSearch && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-ink-muted dark:text-white/65" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('saved.search')}
                placeholder={t('saved.search')}
                data-testid="saved-search"
                className="w-full h-11 pl-9 pr-3 rounded-[12px] bg-black/[0.045] dark:bg-white/[0.07] text-[16px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted dark:placeholder:text-white/40 outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
          </div>
        )}
        {actionError && (
          <p role="alert" className="mx-4 mb-2 rounded-[12px] bg-status-danger/10 text-status-danger text-[13px] font-normal px-3 py-2" data-testid="saved-action-error">
            {actionError}
          </p>
        )}
        <ul className="px-4 flex flex-col gap-2.5 list-none">
          {/* Reading and search results update in place, not as an entrance. */}
            {shown.map((item) => (
              <SavedRow key={item.id} item={item} onRemove={handleRemove} onView={setViewing} setError={setActionError} />
            ))}
        </ul>
        {filtered.length > limit && (
          <div className="flex justify-center pt-3 pb-1">
            <button
              type="button"
              onClick={() => setLimit((n) => n + 60)}
              className="px-4 min-h-[44px] min-w-[44px] rounded-full bg-black/[0.045] dark:bg-white/[0.07] text-[13px] font-medium text-apple-ink dark:text-white"
              data-testid="saved-show-more"
            >
              {t('saved.showMore')}
            </button>
          </div>
        )}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-[13px] text-apple-ink-muted dark:text-white/65">
            {t('saved.search')}: “{query.trim()}”
          </p>
        )}
      </>
    );
  })();

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        labelledBy="saved-title"
        maxWidth={460}
        z={90}
        closeButton={false}
        scroll="none"
        testId="saved-overlay"
        panelClassName="st-task-sheet sm:max-w-[460px]"
      >
        <div className="px-6 pt-1 sm:pt-5 pb-1 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="st-task-sheet-heading">
              <span className="st-task-sheet-mark" aria-hidden><Bookmark className="h-5 w-5" /></span>
              <h3 id="saved-title" className="st-task-sheet-title text-apple-ink dark:text-white">
                {t('saved.title')}
              </h3>
            </div>
            <p className="st-task-local-note">{t('saved.localNote')}</p>
            {snapshot.status === 'ready' && items.length > 0 && (
              <p className="text-[12px] text-apple-ink-muted dark:text-white/65 tnum">{countLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            data-testid="saved-close"
            className="shrink-0 -mt-1 -mr-1 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-apple-ink-muted dark:text-white/65 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-[0.97] transition-[color,background-color,border-color,box-shadow,transform,opacity]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* data-sheet-scroll tells the drag gesture which element scrolls:
            the sheet only takes a downward drag when this list is at its top. */}
        <div
          ref={listRef}
          data-sheet-scroll
          className="st-scroll-fade-y flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 pt-2"
        >
          {body}
        </div>

        {items.length > 0 && snapshot.status === 'ready' && (
          <div className="shrink-0 px-4 sm:px-5 pt-2 pb-2 mt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={clearing}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[44px] min-w-[44px] rounded-full text-[13px] font-medium text-apple-ink-muted dark:text-white/65 hover:text-status-danger dark:hover:text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-60"
              data-testid="saved-clear"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              {t('saved.clear')}
            </button>
          </div>
        )}
      </Sheet>

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
        {open && viewing && <SavedImageViewer item={viewing} focusRef={viewerTrap} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </>
  );
}
