import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { installDiagGlobal, diag } from './lib/diag';
import { prewarmSignaling, signalingHttpBaseForTelemetry } from './lib/socket';
import { productEvent } from './lib/telemetry';
import { initInstallCapture } from './lib/pwaInstall';
import { applyGlassPreference, applyPlatformType } from './lib/device';
import './index.css';
import './styles/apple-dna.css';

// Product telemetry: one anonymous page_view per load (see lib/telemetry.ts
// for the privacy contract — event names only, no payloads, whitelist both ends).
(window as unknown as { __stSignalingHttpBase?: () => string | null }).__stSignalingHttpBase = signalingHttpBaseForTelemetry;
productEvent('product.page_view');

// Lifecycle diagnostics for the signaling/transfer journey — read them via
// window.__sharetextDiag.snapshot() when a connect or transfer fails.
installDiagGlobal();

// The glass material has a floor: a low-memory or low-core phone (or the
// user's own switch) gets solid fills instead of a backdrop blur, before the
// first paint so nothing flashes from glass to solid.
applyGlassPreference();
// SF first on Apple, Inter everywhere else (§2e) — decided before first paint.
applyPlatformType();

// ── Stale-chunk recovery (B31) ────────────────────────────────────────────
// Every deploy replaces the hashed chunks. A tab that was opened before the
// deploy still holds the old HTML, so its first lazy import (Scan QR, the
// Room, Settings) asks for a file the server no longer has and the dynamic
// import rejects — the screen dies with a console error and no way back.
// One reload fixes it, because the reload fetches the new HTML and its asset
// map. The sessionStorage stamp keeps a genuinely broken build from looping:
// at most one automatic reload per 10 s.
const CHUNK_RELOAD_KEY = 'sharetext.chunkReloadAt';
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Unable to preload|Failed to fetch/i;

function reloadForFreshChunks(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Number.isFinite(last) && Date.now() - last < 10_000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // Private mode or storage disabled: reload anyway. The worst case is a
    // loop only if the new build is broken too, which a person can see.
  }
  window.location.reload();
  return true;
}

// Vite's own event: fires exactly when a preloaded/imported chunk 404s.
window.addEventListener('vite:preloadError', (e) => {
  (e as Event & { preventDefault(): void }).preventDefault();
  diag('ui.stale_chunk', false, 'reloading for a fresh asset map');
  reloadForFreshChunks();
});

// Toughness net: unhandled promise rejections and window errors are logged
// into the same diag ring the diagnostics panel reads. The app keeps working
// (React boundaries cover render crashes); this makes the failure visible
// and debuggable instead of silently swallowed — zero-error means SEEING
// every error, not pretending none happen.
// A rejected dynamic import that Vite did not wrap (some browsers, some
// import shapes) takes the same recovery path as vite:preloadError.
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason as { message?: string } | string | undefined;
  const message = typeof reason === 'string' ? reason : reason?.message ?? '';
  if (CHUNK_ERROR.test(message)) {
    diag('ui.stale_chunk', false, message.slice(0, 200));
    if (reloadForFreshChunks()) {
      e.preventDefault();
      return;
    }
  }
  diag('ui.unhandled_rejection', false, String(e.reason).slice(0, 300));
});
window.addEventListener('error', (e) => {
  diag('ui.window_error', false, `${e.message?.slice(0, 200) ?? 'error'} @ ${e.filename?.split('/').pop() ?? '?'}:${e.lineno ?? '?'}`);
});

// Prewarm the signaling transport in the background so creating a room (or
// joining with a code) skips the cold TLS/upgrade handshake when the user
// finally commits. The connection is reused as-is by both flows.
prewarmSignaling();

// Listen for the browser's install offer from the very first tick: Chromium
// can fire beforeinstallprompt well before React mounts the nudge, and an
// offer that arrives unattended is an offer we can never show again.
initInstallCapture();

// Remove the branded loading shell now that React is painting
const shell = document.getElementById("loading-shell");
if (shell) {
  shell.classList.add("fade-out");
  setTimeout(() => shell.remove(), 260);
}

// Dev-only primitive gallery (DESIGN.md §18, step 2g): /__kit renders every
// control in light and dark so a change can be looked at in one place. The
// import is inside `import.meta.env.DEV`, so a production build contains no
// branch and no chunk for it.
const kitRoot = document.getElementById('root')!;
if (import.meta.env.DEV && window.location.pathname === '/__kit/art') {
  void import('./dev/ArtPage').then(({ ArtPage }) => {
    createRoot(kitRoot).render(<StrictMode><ArtPage /></StrictMode>);
  });
} else if (import.meta.env.DEV && window.location.pathname === '/__kit') {
  void import('./dev/KitPage').then(({ KitPage }) => {
    createRoot(kitRoot).render(<StrictMode><KitPage /></StrictMode>);
  });
} else
createRoot(kitRoot).render(
  <StrictMode>
    {/* Respect prefers-reduced-motion: JS-driven animations (hero demo,
        message cards, code digits) are disabled when the user asks for it. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// PWA: register the service worker in production builds only. Skipped in dev
// so HMR and the local signaling server are never cached away.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell is progressive enhancement — ignore failures */
    });
  });
}
