/**
 * One-off: patch src/views/SingleScreenApp.tsx (CRLF) to mount the Saved
 * Items library: imports, state, derived header label, landing header
 * bookmark entry, and the overlay + settings wiring at the root.
 * Normalizes to LF, exact-match asserts, restores CRLF.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/views/SingleScreenApp.tsx';
let raw = readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
if (crlf && raw.replace(/\r\n/g, '').includes('\n')) {
  throw new Error('mixed line endings in SingleScreenApp.tsx — aborting');
}
let src = raw.replace(/\r\n/g, '\n');

function rep(oldS, newS, name) {
  const i = src.indexOf(oldS);
  if (i < 0) throw new Error(`anchor not found: ${name}`);
  if (src.indexOf(oldS, i + 1) >= 0) throw new Error(`anchor ambiguous: ${name}`);
  src = src.slice(0, i) + newS + src.slice(i + oldS.length);
}

// 1 ── lucide: Bookmark
rep(
  `  Plus, ChevronRight, File as FileIcon,\n} from 'lucide-react';`,
  `  Plus, ChevronRight, File as FileIcon, Bookmark,\n} from 'lucide-react';`,
  'lucide import'
);

// 2 ── component + hook imports
rep(
  `import { SettingsOverlay } from '../components/SettingsOverlay';`,
  `import { SettingsOverlay } from '../components/SettingsOverlay';
import { SavedItemsOverlay } from '../components/SavedItemsOverlay';`,
  'overlay import'
);
rep(
  `import { useLiveStats } from '../lib/useLiveStats';`,
  `import { useLiveStats } from '../lib/useLiveStats';
import { useSavedCount } from '../lib/savedItems';`,
  'hook import'
);

// 3 ── state: one library overlay instance for both entry points
rep(
  `  // Settings — one overlay for theme / language / stay connected / reconnect.
  const [showSettings, setShowSettings] = useState(false);`,
  `  // Settings — one overlay for theme / language / stay connected / reconnect.
  const [showSettings, setShowSettings] = useState(false);
  // Saved Items — ONE library overlay mounted at the root; the landing
  // header button and the room settings row open this same view (spec:
  // one collection, never two).
  const [showSaved, setShowSaved] = useState(false);`,
  'showSaved state'
);

// 4 ── derived header label (restrained count, no badge)
rep(
  `  const ambientGlow = null;
  const headerNode = (`,
  `  const ambientGlow = null;
  // Saved — a quiet header entry in the same 40px control rhythm as its
  // neighbors: bookmark glyph, optional count numeral, aria-label carrying
  // both. Send/Receive stay the primary landing story.
  const savedCount = useSavedCount();
  const savedNavLabel = savedCount === 0
    ? t('nav.saved')
    : \`\${t('nav.saved')} · \${savedCount === 1 ? t('saved.countOne') : t('saved.countMany', { n: savedCount })}\`;
  const headerNode = (`,
  'savedNavLabel'
);

// 5 ── header button between language and Docs (landing/pairing only)
rep(
  `          <LanguageMenu />`,
  `          <LanguageMenu />
          {/* Saved — the local library, reachable without a room. Bookmark
              glyph in the shared 40px slot; the count is a quiet numeral,
              never a colored badge. */}
          {panelMode !== 'connected' && (
            <IconButton3D
              label={savedNavLabel}
              onClick={() => setShowSaved(true)}
              testId="open-saved"
              className="relative"
            >
              <Bookmark className="w-[18px] h-[18px]" strokeWidth={1.5} aria-hidden />
              {savedCount > 0 && (
                <span aria-hidden className="absolute bottom-1 right-1 text-[9px] font-bold leading-none tnum text-apple-ink-muted dark:text-white/50">
                  {savedCount > 99 ? '99+' : savedCount}
                </span>
              )}
            </IconButton3D>
          )}`,
  'header button'
);

// 6 ── root: settings row wiring + the one overlay instance
rep(
  `      {/* Settings — theme, language, stay connected, reconnection. */}
      <SettingsOverlay open={showSettings} onClose={() => setShowSettings(false)} />`,
  `      {/* Settings — theme, language, saved items, stay connected, reconnection. */}
      <SettingsOverlay
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenSaved={() => { setShowSettings(false); setShowSaved(true); }}
      />
      {/* The ONE Saved Items library — landing header and settings both open it. */}
      <SavedItemsOverlay open={showSaved} onClose={() => setShowSaved(false)} />`,
  'root wiring'
);

src = crlf ? src.replace(/\n/g, '\r\n') : src;
writeFileSync(P, src);
console.log('SingleScreenApp patched OK', crlf ? '(crlf restored)' : '(lf)');
