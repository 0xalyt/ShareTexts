/**
 * One-off: patch src/components/MessageCard.tsx (CRLF file) to:
 *  1. use pureLinkUrl from lib/linkUrl (re-export for ChatView) and drop the
 *     local copy,
 *  2. add useBookmarkToggle + BookmarkButton (text footer) + BookmarkAction
 *     (attachment pill), wired into both surfaces,
 *  3. extend ActionButton with activeIcon/ariaLabel/pressed/disabled/viaClick.
 * Normalizes to LF, patches with exact-match asserts, restores CRLF.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/components/MessageCard.tsx';
let raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
// Assert uniform EOL before normalizing so we never scramble the file.
if (crlf && raw.replace(/\r\n/g, '').includes('\n')) {
  throw new Error('mixed line endings in MessageCard.tsx — aborting');
}
let src = raw.replace(/\r\n/g, '\n');

function rep(oldS, newS, name) {
  const i = src.indexOf(oldS);
  if (i < 0) throw new Error(`anchor not found: ${name}`);
  if (src.indexOf(oldS, i + 1) >= 0) throw new Error(`anchor ambiguous: ${name}`);
  src = src.slice(0, i) + newS + src.slice(i + oldS.length);
}

// 1 ── lucide import: add Bookmark
rep(
  `  Link as Link2,\n} from 'lucide-react';`,
  `  Link as Link2, Bookmark,\n} from 'lucide-react';`,
  'lucide import'
);

// 2 ── lib imports + re-export (ChatView imports pureLinkUrl from here)
rep(
  `import { fetchLinkPreview, type LinkPreviewData } from '../lib/linkPreview';`,
  `import { fetchLinkPreview, type LinkPreviewData } from '../lib/linkPreview';
import { pureLinkUrl } from '../lib/linkUrl';
export { pureLinkUrl };
import { useSavedItems } from '../lib/savedItems';
import { savedOriginKey, saveMessageItem, removeItem, SavedStoreError, type SavedErrorCode } from '../lib/savedStore';`,
  'lib imports'
);

// 3 ── drop sanitizeUrl (used only by the moved function)
rep(
  `import { cn, formatBytes, sanitizeFilename, sanitizeUrl } from '../lib/utils';`,
  `import { cn, formatBytes, sanitizeFilename } from '../lib/utils';`,
  'utils import'
);

// 4 ── remove the local pureLinkUrl implementation
rep(
  `/** Universal composer — LINK detection: a message (or caption) that is
 *  EXACTLY one URL — nothing else — renders as a tappable link card instead
 *  of naked text ("paste URL → LINK"). Text containing a link plus other
 *  words stays a normal text bubble. No global flag: .test() must stay
 *  stateless. www. hosts get an https:// prefix so they open, not 404. */
const PURE_URL_RE = /^(https?:\\/\\/\\S+|www\\.\\S+)$/i;
export function pureLinkUrl(text: string): string | null {
  const raw = text.trim();
  if (!PURE_URL_RE.test(raw)) return null;
  const candidate = /^www\\./i.test(raw) ? \`https://\${raw}\` : raw;
  return sanitizeUrl(candidate);
}`,
  '',
  'local pureLinkUrl'
);

// 5 ── text footer, success branch: bookmark BEFORE copy (copy keeps its
//      optical -mr alignment against the bubble's right edge)
rep(
  `                  {' • '}{timeOf(msg.timestamp)}
                </span>
                <button
                  onPointerDown={() => handleCopy(msg.text)}`,
  `                  {' • '}{timeOf(msg.timestamp)}
                </span>
                <BookmarkButton msg={msg} />
                <button
                  onPointerDown={() => handleCopy(msg.text)}`,
  'footer success'
);

// 6 ── text footer, failed branch: bookmark after Retry (content still worth
//      keeping even when the send failed)
rep(
  `                  <RefreshCw className="w-3 h-3" /> {t('action.retry')}
                </button>
              </>`,
  `                  <RefreshCw className="w-3 h-3" /> {t('action.retry')}
                </button>
                <BookmarkButton msg={msg} />
              </>`,
  'footer failed'
);

// 7 ── attachment action row: bookmark pill inside the `complete` branch
rep(
  `                  <ActionButton icon={<Share2 />} label={shared ? t('action.shared') : t('action.share')} active={shared} onClick={() => { void handleShare(); }} onBlue={isMe} testId="transfer-share" />`,
  `                  <ActionButton icon={<Share2 />} label={shared ? t('action.shared') : t('action.share')} active={shared} onClick={() => { void handleShare(); }} onBlue={isMe} testId="transfer-share" />
                  <BookmarkAction msg={msg} onBlue={isMe} />`,
  'attachment row'
);

// 8 ── definitions, inserted just above ActionButton (function declarations
//      hoist, so MessageCard above can use them)
rep(
  `function ActionButton({ icon, label, onClick, active, primary, onBlue, testId }:`,
  `/** Bookmark toggle shared by both save surfaces (text footer icon slot and
 *  attachment action pill): persisted state straight from the store, a ref
 *  guard so a double-tap can't race a second save before the first commits,
 *  and an announcement string the consumer renders into its role="status"
 *  region. Failures keep their reason — the control never claims "Saved"
 *  for a write that didn't happen. */
function useBookmarkToggle(msg: ChatMessage) {
  const { t } = useI18n();
  const items = useSavedItems();
  const originKey = savedOriginKey(msg);
  const existing = items.find((i) => i.originKey === originKey);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const clearTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (clearTimer.current) window.clearTimeout(clearTimer.current); }, []);

  const toggle = async () => {
    if (busyRef.current) return; // rapid taps: one in-flight op per message
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await removeItem(existing.id);
        setStatus(t('saved.announceRemoved'));
      } else {
        await saveMessageItem(msg);
        setStatus(t('saved.announceSaved'));
        hapticTick();
      }
    } catch (e) {
      const code: SavedErrorCode = e instanceof SavedStoreError ? e.code : 'failed';
      const key = code === 'quota' ? 'saved.errQuota' : code === 'unavailable' ? 'saved.errUnavailable' : 'saved.errGeneric';
      const msgText = t(key);
      setError(msgText);
      setStatus(msgText); // failures are announced too, not just successes
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => { setStatus(''); setError(null); }, 5000);
    }
  };

  return { saved: !!existing, busy, status, error, toggle };
}

/** Icon-only bookmark for the text bubble footer — the same 40px slot
 *  rhythm as the copy button beside it. Saved = FILLED bookmark (shape, not
 *  color alone) + aria-pressed + an accessible name that flips to the exact
 *  remove action; failure swaps the glyph to an alert so the error isn't
 *  color-only either. One click handler (not pointerdown) so keyboards work. */
function BookmarkButton({ msg }: { msg: ChatMessage }) {
  const { t } = useI18n();
  const bm = useBookmarkToggle(msg);
  const name = bm.error ?? (bm.saved ? t('saved.remove') : t('saved.save'));
  return (
    <>
      <button
        type="button"
        onClick={() => { void bm.toggle(); }}
        aria-label={name}
        title={name}
        aria-pressed={bm.saved}
        disabled={bm.busy}
        data-testid="save-item"
        className={cn(
          "flex items-center justify-center min-w-[40px] min-h-[40px] -my-[13px] rounded-full transition-motion active:scale-90",
          bm.error
            ? "text-status-danger"
            : bm.saved
              ? "text-ember"
              : "text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/60 dark:hover:bg-apple-tile-3",
          bm.busy && "opacity-50"
        )}
      >
        {bm.error
          ? <AlertCircle className="w-3.5 h-3.5" aria-hidden />
          : <Bookmark className="w-3.5 h-3.5" fill={bm.saved ? 'currentColor' : 'none'} aria-hidden />}
      </button>
      <span role="status" className="sr-only">{bm.status}</span>
    </>
  );
}

/** Pill form for the attachment action row — sits inside the \`complete\`
 *  branch next to Copy/Share/Save-file, so only byte-complete transfers are
 *  offered (there is nothing durable to copy otherwise). viaClick makes the
 *  control fire on click so keyboard Enter works, unlike the legacy
 *  pointerdown-only pills around it. */
function BookmarkAction({ msg, onBlue }: { msg: ChatMessage; onBlue: boolean }) {
  const { t } = useI18n();
  const bm = useBookmarkToggle(msg);
  const name = bm.error ?? (bm.saved ? t('saved.remove') : t('saved.save'));
  return (
    <>
      <ActionButton
        icon={bm.error ? <AlertCircle className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
        activeIcon={<Bookmark className="w-3.5 h-3.5" fill="currentColor" />}
        label={bm.saved && !bm.error ? t('action.saved') : t('action.save')}
        ariaLabel={name}
        pressed={bm.saved}
        active={bm.saved && !bm.error}
        disabled={bm.busy}
        viaClick
        onClick={() => { void bm.toggle(); }}
        onBlue={onBlue}
        testId="save-item-attachment"
      />
      <span role="status" className="sr-only">{bm.status}</span>
    </>
  );
}

function ActionButton({ icon, label, onClick, active, primary, onBlue, testId, activeIcon, ariaLabel, pressed, disabled, viaClick }:`,
  'ActionButton defs'
);

// 9 ── ActionButton signature type
rep(
  `{ icon: React.ReactNode, label: string, onClick: () => void, active?: boolean, primary?: boolean, onBlue?: boolean, testId?: string }) {`,
  `{ icon: React.ReactNode, label: string, onClick: () => void, active?: boolean, primary?: boolean, onBlue?: boolean, testId?: string, activeIcon?: React.ReactNode, ariaLabel?: string, pressed?: boolean, disabled?: boolean, viaClick?: boolean }) {`,
  'ActionButton types'
);

// 10 ── ActionButton element attrs (type/keyboard path/a11y/disable)
rep(
  `    <button
      onPointerDown={(e) => { e.preventDefault(); onClick(); }}
      data-testid={testId}`,
  `    <button
      type="button"
      onClick={viaClick ? onClick : undefined}
      onPointerDown={viaClick ? undefined : (e) => { e.preventDefault(); onClick(); }}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      data-testid={testId}`,
  'ActionButton attrs'
);

// 11 ── ActionButton active glyph honours activeIcon
rep(
  `        {active ? <Check /> : icon}`,
  `        {active ? (activeIcon ?? <Check />) : icon}`,
  'ActionButton glyph'
);

src = crlf ? src.replace(/\n/g, '\r\n') : src;
writeFileSync(P, src);
console.log('MessageCard patched OK', crlf ? '(crlf restored)' : '(lf)');
