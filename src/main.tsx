import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { installDiagGlobal, diag } from './lib/diag';
import { prewarmSignaling, signalingHttpBaseForTelemetry } from './lib/socket';
import { productEvent } from './lib/telemetry';
import { initInstallCapture } from './lib/pwaInstall';
import { applyGlassPreference } from './lib/device';
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

// Toughness net: unhandled promise rejections and window errors are logged
// into the same diag ring the diagnostics panel reads. The app keeps working
// (React boundaries cover render crashes); this makes the failure visible
// and debuggable instead of silently swallowed — zero-error means SEEING
// every error, not pretending none happen.
window.addEventListener('unhandledrejection', (e) => {
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
if (import.meta.env.DEV && window.location.pathname === '/__kit') {
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
