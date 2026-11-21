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
        font-family: 'Allo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-optical-sizing: auto; font-variation-settings: 'ROND' 0; }
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

function shellBody({ overline, h1, subtitle, main, footerNote }) {
  return `<div id="root">
      <div class="st-seo">
        <header class="st-seo-header"><a href="/" aria-label="ShareTexts home" style="display:flex;align-items:center;gap:8px;color:inherit">${LOGO_SVG}<span>ShareTexts</span></a></header>
        <main class="st-seo-main">
          <p class="overline">${overline}</p>
          <h1>${h1}</h1>
          <p class="subtitle">${subtitle}</p>
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

// ---------------------------------------------------------------------------
// /docs — the strongest AEO surface. The FAQ below is copied VERBATIM from
// src/views/Docs.tsx (FAQSection); the JSON-LD mirrors exactly this text.
// ---------------------------------------------------------------------------
const DOCS_FAQS = [
  ['What is ShareTexts?', 'ShareTexts is a temporary bridge between two devices. Move text, links, photos, videos, and files directly from one screen to another. No app, no account. Live rooms for handoffs; Temporary Spaces store content for later. Saved items stay in your browser.'],
  ['How do devices discover each other?', 'There are four ways to connect: Nearby, the 6-digit code, the QR code, and the share link. For Nearby, turn it on on the device you want to send to, for 10 minutes — it then appears on devices on the same network. Tap it, the other device accepts, and the connection starts. The code, QR, and link work over any connection.'],
  ['Is nearby discovery private?', 'Yes. Your device appears only when you turn Nearby on, for 10 minutes at a time, and only to devices on the same network. It disappears when the 10 minutes end or when you turn it off. Those devices see only a coarse label like "iPhone · Safari" — never your IP, accounts, or any permanent identifier. Devices already connected to a room are not listed, and this is never a global list of ShareTexts users.'],
  ['Is it free?', 'Yes. ShareTexts is completely free to use.'],
  ['Is it private?', 'Live rooms encrypt transfers in transit, using a direct connection when available or an encrypted relay. The service issues room secrets; this is not a zero-knowledge system. Temporary Spaces store content until their chosen expiry.'],
  ['What if my internet drops mid-transfer?', 'If the connection is interrupted, ShareTexts will tell you whether the transfer can be retried. For large files, we recommend a stable connection.'],
  ['How long does the pairing code last?', 'The code refreshes every 90 seconds. If it expires, a new one appears automatically.'],
  ['Can an AI agent send text into my room?', 'Yes. The connect screen offers a temporary send permission for trusted tools. It expires automatically and can be revoked anytime.'],
  ['What file types are supported?', 'Any file type. ShareTexts transfers the original bytes without conversion. Images, videos, audio, documents, archives, code, and more.'],
  ['Is there a file size limit?', 'ShareTexts has been tested with large files. Actual limits depend on your browser, device memory, and network stability. For very large files, a stable connection is recommended.'],
  ['Does it work on mobile?', 'Yes. ShareTexts works in any modern mobile browser. No app download required.'],
  ['Can I transfer between iPhone and Android?', 'Yes. ShareTexts works across all platforms and devices with a modern browser.'],
  ['What is a Temporary Space?', 'A Temporary Space is a shared shelf that lives for a set time — 6 hours up to 7 days. You create it, get an 8-character space code, and share that code instead of files. Anyone with the code can add text and links, and everyone in the space sees them. When the time is up, the space closes and the content is deleted.'],
  ['How do I join a Temporary Space with a code?', 'Open sharetexts.online/space/join, enter the 8-character code the creator gave you, and tap Join space. You can also paste a full space link — it carries the same access. Both the code and the link stop working when the space closes.'],
];

const docsFaqHtml = DOCS_FAQS.map(([q, a]) => `<h3>${q}</h3>\n            <p>${a}</p>`).join('\n            ');
const docsFaqLd = DOCS_FAQS.map(([q, a]) => `        {
          "@type": "Question",
          "name": ${JSON.stringify(q)},
          "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(a)} }
        }`).join(',\n');

const docsMain = `
          <h2>What ShareTexts is</h2>
          <p>ShareTexts is a free web app for moving text, links, photos, videos, and files between devices — phone to laptop, iPhone to Windows, Android to Mac — in the browser. No app, no account, no cable. Live rooms encrypt transfers in transit over WebRTC, with an encrypted relay fallback when a direct connection is unavailable.</p>
          <h2>How to connect two devices</h2>
          <ol>
            <li><strong>Open</strong> sharetexts.online on both devices.</li>
            <li><strong>Find your other device.</strong> On the device you want to send to, turn on Nearby for 10 minutes — it then appears on devices on the same network. Or connect with a six-digit code, a QR code, or a share link.</li>
            <li><strong>Connect with one tap.</strong> The room is encrypted in transit between your devices.</li>
            <li><strong>Send text and files</strong> — keep both devices open until the transfer finishes.</li>
            <li><strong>Receive</strong> it on the other device, save what you need, then close the room.</li>
          </ol>
          <h2>What you can send</h2>
          <p>Text, links (they render as tappable preview cards), photos, videos, audio, documents — any file type, transferred as the original bytes without conversion.</p>
          <h2>Temporary Spaces: share over days, not just this minute</h2>
          <p>For sharing beyond two live devices, create a <strong>Temporary Space</strong> — a shared shelf that lives 6 hours up to 7 days. You choose an 8-character space code (or generate one); whoever should join enters it at sharetexts.online/space/join. Everyone in the space adds text and links, and everyone sees them. The code only finds the space — it carries no keys — and when the space expires it is retired and the content is deleted.</p>
          <h2>Frequently asked questions</h2>
          ${docsFaqHtml}
          <h2>More reading</h2>
          <ul>
            <li><a href="/guides/temporary-spaces.html">Temporary Spaces</a> — the shared shelf with an 8-character join code.</li>
            <li><a href="/guides/how-it-works.html">How ShareTexts works</a> — the signaling and WebRTC architecture.</li>
            <li><a href="/guides/security.html">Security</a> — encryption and transport details.</li>
            <li><a href="/about">About ShareTexts</a> — what it is, what it transfers, supported devices.</li>
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

const privacyMain = `
          <h2>The short version</h2>
          <p>ShareTexts moves text, photos, and files between <strong>your</strong> devices. Live rooms encrypt transfers in transit and use a direct peer-to-peer connection when available, with an encrypted relay fallback. The service issues the room secret, so this is not a zero-knowledge system. Do not use it for secrets you cannot entrust to the service.</p>
          <p>Temporary Spaces store content server-side for later, until closed early or their chosen expiry (6 hours to 7 days). Anyone holding the space's access token can access its content while it is open.</p>
          <h2>What you do not need to provide</h2>
          <ul>
            <li>Your name, email, phone number, or any account</li>
            <li>Contacts, location, or advertising identifiers</li>
          </ul>
          <p>Room transfers use a key derived from the room secret. Because the service issues that secret, it could derive the same key.</p>
          <h2>What the connection server sees</h2>
          <p>The signaling service sees IP addresses, room identifiers and secrets, pairing codes, WebRTC handshake data, transfer sizes, and times. Relay transfers also pass encrypted content through the service. Room state expires automatically, except rooms you choose to keep with Stay Connected. Aggregate activity counters measure service use.</p>
          <h2>What stays on your device</h2>
          <p>Your browser stores room credentials, recent messages, preferences, and unsent drafts. Room entries are removed when you close the room. Saved Items you explicitly save stay in this browser's IndexedDB storage until you remove them or clear site data. Anyone with access to this browser profile can see them; ShareTexts adds no separate storage encryption. Saved Items are not synced.</p>
          <h2>Cookies and trackers</h2>
          <p>ShareTexts sets no tracking cookies and loads no third-party analytics scripts. The service counts aggregate product events without attaching message contents. Network requests include signaling, relay or peer-to-peer traffic, and Temporary Space storage.</p>
          <h2>Changes to this policy</h2>
          <p>If the policy changes, the updated version will be published on this page. This page explains how live rooms, Temporary Spaces, and local Saved Items handle your content.</p>`;

emit('privacy.html', {
  head: swapMeta(base, {
    title: 'Privacy Policy — ShareTexts',
    description: 'How ShareTexts handles your content: encrypted live transfers, server-backed Temporary Spaces, local Saved Items, and connection metadata. No account required.',
    canonicalPath: '/privacy',
  }),
  body: shellBody({
    overline: 'Legal',
    h1: 'Privacy Policy',
    subtitle: "ShareTexts's entire product promise is privacy. This policy is written in plain language and structured around what we don't collect.",
    main: privacyMain,
    footerNote: 'Last updated: September 2026',
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

const termsMain = `
          <h2>Using ShareTexts</h2>
          <p>ShareTexts is a free browser utility for moving content between devices you control. You don't need an account, and you don't need to give us anything to use it.</p>
          <h2>Your content is yours</h2>
          <p>Everything you send belongs to you. ShareTexts claims no rights over your text, photos, videos, or files. Encryption in transit does not make the service unable to access content. You are responsible for what you send and to whom.</p>
          <h2>Acceptable use</h2>
          <ul>
            <li>Don't send content that is illegal where you live</li>
            <li>Don't harass, threaten, or spam other people</li>
            <li>Don't attempt to break the pairing mechanism, rate limits, or the service itself</li>
          </ul>
          <h2>Rooms are temporary</h2>
          <p>Live rooms expire automatically unless you enable Stay Connected. Closing a room does not remove files already saved on a device. Temporary Spaces hold content server-side for the chosen lifetime (6 hours to 7 days), or until closed early. Saved Items remain in your browser until removed or site data is cleared. Keep a separate backup.</p>
          <h2>No warranty</h2>
          <p>ShareTexts is provided <strong>as is</strong>, without warranties of any kind. We work hard to keep transfers reliable and byte-perfect, but networks fail and browsers differ. For anything irreplaceable, keep a backup.</p>
          <h2>Contact</h2>
          <p>Questions about these terms? Reach us on X <a href="https://x.com/0xalyt" rel="noopener">@0xalyt</a>.</p>`;

emit('terms.html', {
  head: swapMeta(base, {
    title: 'Terms of Use — ShareTexts',
    description: 'The terms of using ShareTexts: a free browser utility for moving content between your own devices. Your content stays yours; rooms are temporary.',
    canonicalPath: '/terms',
  }),
  body: shellBody({
    overline: 'Legal',
    h1: 'Terms of Use',
    subtitle: "The short rules for using ShareTexts — what the service is, what belongs to you, and what it doesn't promise.",
    main: termsMain,
    footerNote: 'Last updated: September 2026',
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
