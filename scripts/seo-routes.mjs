/**
 * SEO route shells — build-time prerendering for the public SPA routes.
 *
 * WHY: sharetexts.online is a Vite SPA. The homepage now ships real crawlable
 * content in its shell (see index.html), but /docs, /privacy and /terms were
 * JS-only: a crawler saw an empty document with the homepage's meta. This
 * script runs AFTER `vite build` and derives one static HTML file per public
 * route from dist/index.html:
 *
 *   - the <head> is kept intact (font preloads, icons, theme bootstrap,
 *     hashed asset tags, the site-wide Organization/WebApplication/WebSite
 *     graph) with per-route title/description/canonical/OG/Twitter swapped in;
 *   - the boot skeleton inside #root is replaced by real, readable route
 *     content (the same facts the React views render). React then mounts over
 *     it — JS users see the interactive page, crawlers and no-JS visitors see
 *     the same substance as plain HTML;
 *   - /docs additionally carries FAQPage JSON-LD whose Q&As are copied
 *     VERBATIM from the visible FAQ below (which itself mirrors
 *     src/views/Docs.tsx) — markup only ever describes visible content;
 *   - 404.html is noindex and gives humans real ways forward.
 *
 * Wiring:
 *   package.json  build: "vite build && esbuild … && node scripts/seo-routes.mjs"
 *   server.ts     prod SPA fallback serves these files for the known routes
 *                 (and 404.html with a real 404 status for everything else)
 *   vercel.json   rewrites /docs /privacy /terms → /seo/<route>.html
 *
 * Content rules (F20): every claim here is copied from the product's own
 * copy — Docs.tsx, Legal.tsx, llms.txt. No invented facts, no contact data,
 * no ratings, no profiles beyond the one verified one (X @0xalyt). The
 * repository link came out of the product in P7 at the owner's request —
 * nothing a user can see points at GitHub any more.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { productHashes, writeVercel } from './pin-csp.mjs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
const seoDir = path.join(dist, 'seo');
mkdirSync(seoDir, { recursive: true });

// ---------------------------------------------------------------------------
// Build marker (P0 STEP 8c). DESIGN.md §0d: after each push, wait until the
// live page shows this marker, then run `node scripts/smoke-live.mjs --expect
// <marker>`. The marker is the 12-char commit hash of the build — one value
// per push, predictable before deploy, so "is the new build live yet?"
// becomes a one-line curl. Vercel sets VERCEL_GIT_COMMIT_SHA at build time;
// local builds fall back to git HEAD.
// ---------------------------------------------------------------------------
const shortSha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12)
  || (() => {
    try {
      return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return 'unknown';
    }
  })();
const BUILD_MARKER = `<meta name="sharetexts-build" content="${shortSha}" />`;

let base = readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!base.includes('name="sharetexts-build"')) {
  base = base.replace('</head>', `  ${BUILD_MARKER}\n  </head>`);
  writeFileSync(path.join(dist, 'index.html'), base);
  console.log(`seo-routes: stamped build marker ${shortSha} into dist/index.html (+ every derived page)`);
}

// ---------------------------------------------------------------------------
// Shared shell chrome — quiet, on-brand, dark-mode aware via the existing
// pre-paint theme bootstrap (html.dark). Scoped to .st-seo so it can never
// collide with the app's CSS.
// ---------------------------------------------------------------------------
const SHELL_CSS = `
    <style>
      .st-seo { min-height: 100dvh; display: flex; flex-direction: column;
        background: #ffffff; color: #1d1d1f;
        font-family: var(--st-font-sans);
        font-optical-sizing: auto; }
      html.dark .st-seo { background: #181818; color: #e4e4e4; }
      .st-seo a { color: #d9560e; text-decoration: none; font-weight: 500; }
      html.dark .st-seo a { color: #ff8a3d; }
      .st-seo a:hover { text-decoration: underline; }
      .st-seo-header { display: flex; align-items: center; gap: 8px;
        padding: 18px 24px; font-weight: 700; letter-spacing: -0.02em; }
      .st-seo-header svg { display: block; }
      .st-seo-main { width: 100%; max-width: 720px; margin: 0 auto;
        padding: 8px 24px 48px; flex: 1; }
      .st-seo .overline { font-size: 12px; font-weight: 600; letter-spacing: 0.09em;
        text-transform: uppercase; color: rgba(99,95,87,0.85); margin: 0 0 10px; }
      html.dark .st-seo .overline { color: rgba(176,171,162,0.8); }
      .st-seo h1 { font-size: clamp(28px, 4.5vw, 40px); line-height: 1.12;
        letter-spacing: -0.03em; font-weight: 700; margin: 0 0 10px; }
      .st-seo .subtitle { font-size: 16.5px; line-height: 1.6;
        color: #6e6e73; margin: 0 0 26px; max-width: 58ch; }
      html.dark .st-seo .subtitle { color: rgba(255,255,255,0.62); }
      .st-seo h2 { font-size: 19px; letter-spacing: -0.02em; font-weight: 650;
        margin: 30px 0 10px; }
      .st-seo h3 { font-size: 15.5px; font-weight: 600; margin: 20px 0 4px; }
      .st-seo p, .st-seo li { font-size: 14.5px; line-height: 1.7; color: #3d3a34; }
      html.dark .st-seo p, html.dark .st-seo li { color: rgba(245,244,240,0.75); }
      .st-seo ul, .st-seo ol { padding-left: 20px; margin: 8px 0; }
      /* Footer: the same three-column idea as the app's long-form footer,
         expressed in static HTML. The old version was one wrapped row of
         seven links — a sitemap with no hierarchy, at the exact point a reader
         has finished the page and is deciding whether to trust the site. */
      .st-seo-footer { border-top: 1px solid rgba(30,28,24,0.08);
        margin-top: 8px; padding: 34px 24px 28px; }
      html.dark .st-seo-footer { border-top-color: rgba(255,255,255,0.08); }
      .st-seo-footer .sf-brand { max-width: 30ch; }
      .st-seo-footer .sf-name { display: flex; align-items: center; gap: 8px;
        font-size: 14px; font-weight: 650; color: #1d1d1f; }
      html.dark .st-seo-footer .sf-name { color: #f5f5f7; }
      .st-seo-footer .sf-promise { margin-top: 10px; font-size: 13px;
        line-height: 1.55; color: #6e6e73; }
      html.dark .st-seo-footer .sf-promise { color: rgba(255,255,255,0.6); }
      .st-seo-footer .sf-status { margin-top: 12px; display: flex;
        align-items: center; gap: 7px; font-size: 12px; font-weight: 500;
        color: #6e6e73; }
      .st-seo-footer .sf-status i { width: 6px; height: 6px; border-radius: 50%;
        background: #34c759; display: block; }
      html.dark .st-seo-footer .sf-status { color: rgba(255,255,255,0.55); }
      .st-seo-footer .sf-grid { display: grid; gap: 26px 42px; margin-top: 26px;
        grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (min-width: 760px) {
        .st-seo-footer { display: grid; align-content: start;
          grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr);
          gap: 0 42px; }
        .st-seo-footer .sf-grid { display: contents; }
        .st-seo-footer .sf-col { grid-row: 2; }
        .st-seo-footer .sf-brand { grid-row: 1; }
        .st-seo-footer .sf-legal { grid-column: 1 / -1; }
      }
      .st-seo-footer .sf-col h2 { font-size: 12px; font-weight: 600;
        letter-spacing: 0.02em; color: #6e6e73; margin: 0 0 4px; }
      html.dark .st-seo-footer .sf-col h2 { color: rgba(255,255,255,0.5); }
      .st-seo-footer .sf-col a { display: flex; align-items: center;
        min-height: 40px; font-size: 13px; font-weight: 500; color: #1d1d1f;
        text-decoration: none; }
      .st-seo-footer .sf-col a:hover { color: #f06413; }
      html.dark .st-seo-footer .sf-col a { color: rgba(255,255,255,0.75); }
      html.dark .st-seo-footer .sf-col a:hover { color: #ff8a3d; }
      .st-seo-footer .sf-legal { margin-top: 26px; padding-top: 18px;
        border-top: 1px solid rgba(30,28,24,0.07); display: flex;
        flex-wrap: wrap; gap: 6px 18px; align-items: center;
        font-size: 12px; color: #6e6e73; }
      html.dark .st-seo-footer .sf-legal { border-top-color: rgba(255,255,255,0.07);
        color: rgba(255,255,255,0.55); }
      .st-seo .muted { color: #6e6e73; font-size: 13px; }
      html.dark .st-seo .muted { color: rgba(255,255,255,0.5); }
    </style>`;

const LOGO_SVG = `<img src="/brand/logo-glyph-orange.webp" alt="" width="26" height="26" style="display:block;flex-shrink:0" aria-hidden="true">`;

function shellBody({ overline, h1, subtitle, main, footerNote, intro = true }) {
  return `<div id="root">
      <div class="st-seo">
        <header class="st-seo-header"><a href="/" aria-label="ShareTexts home" style="display:flex;align-items:center;gap:8px;color:inherit">${LOGO_SVG}<span>ShareTexts</span></a></header>
        <main class="st-seo-main">
          ${intro ? `<p class="overline">${overline}</p>
          <h1>${h1}</h1>
          <p class="subtitle">${subtitle}</p>` : ''}
          ${main}
        </main>
        <footer class="st-seo-footer">
          <div class="sf-brand">
            <span class="sf-name">${LOGO_SVG} ShareTexts</span>
            <p class="sf-promise">Send text, links and files between your own devices. No app to install, no account. Live rooms for handoffs; Temporary Spaces store content for later. Saved items stay in your browser.</p>
            <p class="sf-status"><i aria-hidden="true"></i>iPhone · Android · Windows · macOS · Linux</p>
          </div>
          <div class="sf-grid">
            <nav class="sf-col" aria-label="Use it">
              <h2>Use it</h2>
              <a href="/">Open ShareTexts</a>
              <a href="/#main-content">Join with a code</a>
            </nav>
            <nav class="sf-col" aria-label="Read">
              <h2>Read</h2>
              <a href="/docs">Docs</a>
              <a href="/guides">Guides</a>
              <a href="/about">About</a>
            </nav>
          </div>
          <div class="sf-legal">
            <span>© ${new Date().getFullYear()} ShareTexts · No app · No account · Encrypted in transit</span>
            <a href="/privacy" style="color:inherit">Privacy</a>
            <a href="/terms" style="color:inherit">Terms</a>
            <a href="https://x.com/0xalyt" rel="noopener" style="color:inherit">x.com/0xalyt</a>
            ${footerNote ? `<span class="muted">${footerNote}</span>` : ''}
          </div>
        </footer>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Head surgery: swap the route-specific meta into the shared <head>.
// ---------------------------------------------------------------------------
function swapMeta(html, { title, description, canonicalPath, robots = 'index, follow', ogType = 'website' }) {
  const abs = `https://sharetexts.online${canonicalPath}`;
  let out = html;
  const setTag = (pattern, replacement) => {
    if (!pattern.test(out)) throw new Error(`meta tag not found: ${pattern}`);
    out = out.replace(pattern, replacement);
  };
  setTag(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  setTag(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`);
  setTag(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${robots}" />`);
  setTag(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${abs}" />`);
  setTag(/<link rel="alternate" hreflang="x-default" href="[^"]*" \/>/,
    canonicalPath === '/' ? '<link rel="alternate" hreflang="x-default" href="https://sharetexts.online/" />' : '');
  setTag(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${ogType}" />`);
  setTag(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`);
  setTag(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`);
  setTag(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${abs}" />`);
  setTag(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`);
  setTag(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`);
  return out;
}

/** Replace everything inside #root (the boot skeleton) with the route body.
 *  Vite hoists the module script into <head>, so #root runs to the very end
 *  of the body — slice from the root div to the closing </body> tag. */
function swapBody(html, body) {
  const start = html.indexOf('<div id="root">');
  const end = html.lastIndexOf('</body>');
  if (start < 0 || end < start) throw new Error('dist/index.html does not match the expected shape');
  return html.slice(0, start) + body + '\n  ' + html.slice(end);
}

function emit(route, { head, body, jsonLd = '' }) {
  const html = swapBody(head.replace('</head>', `${SHELL_CSS}${jsonLd}</head>`), body);
  writeFileSync(path.join(seoDir, route), html);
  console.log(`seo-routes: wrote dist/seo/${route} (${(html.length / 1024).toFixed(1)} kB)`);
  // 404.html ALSO goes to the dist root: Vercel serves a root-level 404.html
  // with a real 404 status for paths that match no static file and no
  // rewrite — the node server path does the same via server.ts.
  if (route === '404.html') {
    writeFileSync(path.join(dist, '404.html'), html);
    console.log('seo-routes: wrote dist/404.html (Vercel auto-404 page)');
  }
}

emit('changelog.html', {
  head: swapMeta(base, { title: 'What’s new — ShareTexts', description: 'Small improvements to sharing between your devices. Read the latest ShareTexts release notes.', canonicalPath: '/changelog' }),
  body: shellBody({ intro: false, main: readFileSync('src/views/changelog-content.html', 'utf8') }),
});

// ---------------------------------------------------------------------------
// /docs — the strongest AEO surface. The FAQ below is copied VERBATIM from
// src/views/Docs.tsx (FAQSection); the JSON-LD mirrors exactly this text.
// ---------------------------------------------------------------------------
const DOCS_FAQS = JSON.parse(readFileSync('src/views/docs-faq.json', 'utf8')).map(({ question, answer }) => [question, answer]);

const docsFaqHtml = DOCS_FAQS.map(([q, a]) => `<h3>${q}</h3>\n            <p>${a}</p>`).join('\n            ');
const docsFaqLd = DOCS_FAQS.map(([q, a]) => `        {
          "@type": "Question",
          "name": ${JSON.stringify(q)},
          "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(a)} }
        }`).join(',\n');

const docsMain = `
          <h2>Send something in a live room</h2>
          <p>Use a live room when both devices are available now. They do not need the same operating system or Wi-Fi network.</p>
          <ol>
            <li>Open ShareTexts on both devices. Choose Send on one, then Receive on the other.</li>
            <li>Enter the current six-digit code, scan the QR code, or open the room's share link.</li>
            <li>Type, paste, or attach a file. Keep both tabs open and devices awake until the transfer finishes.</li>
            <li>Download the file on the receiving device. Check the copy before deleting the original.</li>
          </ol>
          <h2>Leave content for later</h2>
          <p><a href="/guides/temporary-spaces.html">Temporary Spaces</a> store text and links on the server for 6 hours to 7 days, or until the creator closes them. Anyone with a working eight-character code or link can join at <a href="/space/join">the space join page</a>. Copy what you need before closure.</p>
          <h2>Share with linked devices</h2>
          <p>Hop links your own devices. Compare the four emoji on both screens before approving a link. The browser encrypts items before upload; encrypted copies wait in a server mailbox with a 30-day item lifetime. This is not permanent storage.</p>
          <h2>When a connection fails</h2>
          <p>For Nearby, turn visibility on on the receiving device for 10 minutes. If it does not appear, use a live-room code or link. Copy unsent text before refreshing, keep the original file, and follow <a href="/guides/troubleshooting.html">the troubleshooting guide</a>.</p>
          <h2>Know where content stays</h2>
          <p>Live-room transfers are encrypted in transit, with an encrypted relay when a direct connection is unavailable. The service issues the room secret and could derive its encryption key. Temporary Spaces store content on the server; Saved Items stay in the browser where you explicitly save them. Read the <a href="/privacy">Privacy Policy</a> before sharing sensitive content.</p>
          <h2>Frequently asked questions</h2>
          ${docsFaqHtml}
          <h2>More reading</h2>
          <ul>
            <li><a href="/guides">Guides by task</a></li>
            <li><a href="/guides/how-it-works.html">How sharing works</a></li>
            <li><a href="/guides/security.html">Security and storage</a></li>
            <li><a href="/guides/supported-devices.html">Browsers and devices</a></li>
          </ul>`;


// ---------------------------------------------------------------------------
// Breadcrumbs. The 24 static guides already carry BreadcrumbList; the four
// prerendered SPA routes did not, so a crawler reading /docs or /privacy saw a
// page with no position in the site — the one signal that turns a set of URLs
// into a hierarchy, and the one Google renders in a result instead of a raw
// URL. Trails are the real navigation the site has: Home -> Docs, and
// Home -> Legal -> Privacy. /404 is in no trail and gets none.
// ---------------------------------------------------------------------------
const SITE_ORIGIN = 'https://sharetexts.online';
function breadcrumbLd(trail) {
  const items = [{ name: 'ShareTexts', path: '/' }, ...trail];
  const last = items[items.length - 1];
  const rows = items.map((item, i) => [
    '            {',
    '              "@type": "ListItem",',
    '              "position": ' + (i + 1) + ',',
    '              "name": ' + JSON.stringify(item.name) + ',',
    '              "item": "' + SITE_ORIGIN + item.path + '"',
    '            }',
  ].join('\n')).join(',\n');
  return [
    '{',
    '          "@type": "BreadcrumbList",',
    '          "@id": "' + SITE_ORIGIN + last.path + '#breadcrumb",',
    '          "itemListElement": [',
    rows,
    '          ]',
    '        }',
  ].join('\n');
}


const docsJsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": "https://sharetexts.online/docs#webpage",
          "url": "https://sharetexts.online/docs",
          "name": "ShareTexts Docs — How Device Sharing Works",
          "isPartOf": { "@id": "https://sharetexts.online/#website" },
          "about": { "@id": "https://sharetexts.online/#application" },
          "inLanguage": "en"
        },
        ${breadcrumbLd([{ name: 'Docs', path: '/docs' }])},
        {
          "@type": "FAQPage",
          "@id": "https://sharetexts.online/docs#faq",
          "isPartOf": { "@id": "https://sharetexts.online/docs#webpage" },
          "mainEntity": [
${docsFaqLd}
          ]
        }
      ]
    }
    </script>`;

emit('docs.html', {
  head: swapMeta(base, {
    title: 'ShareTexts Docs — How Device Sharing Works',
    description: 'How ShareTexts works: connect two devices with Nearby, a 6-digit code, a QR code, or a link, and transfer text, photos, and files — encrypted, in the browser.',
    canonicalPath: '/docs',
  }),
  body: shellBody({
    overline: 'Docs',
    h1: 'ShareTexts Docs',
    subtitle: 'How to move text, links, photos, videos, and files between your devices — no app, no account, straight from the browser.',
    main: docsMain,
  }),
  jsonLd: docsJsonLd,
});

// ---------------------------------------------------------------------------
// /privacy and /terms — faithful plain-HTML renderings of src/views/Legal.tsx.
// ---------------------------------------------------------------------------
const privacyLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": "https://sharetexts.online/privacy#webpage",
          "url": "https://sharetexts.online/privacy",
          "name": "Privacy Policy — ShareTexts",
          "isPartOf": { "@id": "https://sharetexts.online/#website" },
          "inLanguage": "en"
        },
        ${breadcrumbLd([{ name: 'Legal', path: '/privacy' }, { name: 'Privacy Policy', path: '/privacy' }])}
      ]
    }
    </script>`;

const privacyMain = readFileSync('src/views/privacy-content.html', 'utf8');

emit('privacy.html', {
  head: swapMeta(base, {
    title: 'Privacy Policy — ShareTexts',
    description: 'How ShareTexts handles your content: encrypted live transfers, server-backed Temporary Spaces, Hop linked devices, local Saved Items, and connection metadata. No account required.',
    canonicalPath: '/privacy',
  }),
  body: shellBody({
    overline: 'Legal',
    h1: 'Privacy Policy',
    subtitle: 'What is shared, what is stored, and what you can control.',
    main: privacyMain,
    footerNote: 'Updated November 2026',
  }),
  jsonLd: privacyLd,
});

const termsLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": "https://sharetexts.online/terms#webpage",
          "url": "https://sharetexts.online/terms",
          "name": "Terms of Use — ShareTexts",
          "isPartOf": { "@id": "https://sharetexts.online/#website" },
          "inLanguage": "en"
        },
        ${breadcrumbLd([{ name: 'Legal', path: '/privacy' }, { name: 'Terms of Use', path: '/terms' }])}
      ]
    }
    </script>`;

const termsMain = readFileSync('src/views/terms-content.html', 'utf8');

emit('terms.html', {
  head: swapMeta(base, {
    title: 'Terms of Use — ShareTexts',
    description: 'The terms of using ShareTexts: a free browser utility for moving content between your own devices. Your content stays yours; rooms are temporary.',
    canonicalPath: '/terms',
  }),
  body: shellBody({
    overline: 'Legal',
    h1: 'Terms of Use',
    subtitle: 'Your content, your responsibilities, and the limits of the service.',
    main: termsMain,
    footerNote: 'Updated November 2026',
  }),
  jsonLd: termsLd,
});

// ---------------------------------------------------------------------------
// /404 — designed dead end, noindex, real ways forward.
// ---------------------------------------------------------------------------
emit('404.html', {
  head: swapMeta(base, {
    title: 'Page not found — ShareTexts',
    description: 'This page does not exist. Open ShareTexts to move text, photos, and files between your devices.',
    canonicalPath: '/404.html',
    robots: 'noindex, follow',
  }),
  // (also emitted to dist root for Vercel — see emit())
  body: shellBody({
    overline: '404',
    h1: 'Page not found',
    subtitle: "The page you are looking for doesn't exist — it may have moved, or the address may be wrong.",
    main: `<p>ShareTexts is a free browser app for moving text, links, photos, and files between your own devices — no app, no account. Start from <a href="/">the homepage</a>, or read <a href="/docs">the docs</a> to see how it works.</p>`,
  }),
});

emit('about.html', {
  head: swapMeta(base, {
    title: 'About ShareTexts — A small bridge between your devices',
    description: 'Move text, links, photos, and files between your devices in the browser. Why ShareTexts exists, how it works, and what happens to your content.',
    canonicalPath: '/about',
  }),
  body: shellBody({
    intro: false,
    main: readFileSync('src/views/about-content.html', 'utf8'),
  }),
  jsonLd: '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About ShareTexts', url: 'https://sharetexts.online/about' }) + '</script>',
});

console.log('seo-routes: done');

// ---------------------------------------------------------------------------
// Re-pin the CSP script hashes in vercel.json — the shared implementation
// lives in pin-csp.mjs (productHashes + writeVercel), which is also the
// build's --check gate. One implementation, two callers: this build-time
// write and `pin-csp --write` can never disagree with the check that
// verifies them. productHashes() covers EVERY product page in dist/, so a
// new page shipping its own inline script is pinned automatically.
// ---------------------------------------------------------------------------
try {
  const pins = productHashes();
  if (pins.size) {
    const { changed } = writeVercel();
    console.log(changed
      ? `seo-routes: re-pinned vercel.json CSP (${pins.size} hash(es))`
      : 'seo-routes: vercel.json CSP already current');
  } else {
    console.warn('seo-routes: CSP re-pin skipped — no inline scripts in dist');
  }
} catch (e) {
  console.warn('seo-routes: CSP re-pin skipped —', e?.message ?? e);
}
