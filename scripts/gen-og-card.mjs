// OG card generator — the 1200×630 link preview every social surface reads
// (X/Twitter, WhatsApp, LinkedIn, Slack, iMessage, Discord).
//
// Why this exists: the previous artwork was an icon floating on a white
// card — at card size it read as an EMPTY white rectangle, so shared links
// looked broken. This renders a real, designed card from the shipped brand
// tokens (no image generators): the lockup, the product's own headline, one
// line of proof, the URL, and a sketch of the room UI.
//
// Deterministic: same input, same pixels. Run:
//   node scripts/gen-og-card.mjs
// The file name carries a version (sharetext-og-v11.png) so X and friends
// refetch it instead of serving a cached copy of the old artwork; bump the
// name and the meta tags together.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

const CANVAS = '#fbfbfd';
const INK = '#1d1d1f';
const MUTED = '#6e6e73';
const EMBER = '#f06413';
const HONEY = '#feab30';
const GREEN = '#34c759';

const glyph = `
<svg width="52" height="52" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="24" y1="20" x2="216" y2="236" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${HONEY}"/>
      <stop offset="0.55" stop-color="#f97b3d"/>
      <stop offset="1" stop-color="${EMBER}"/>
    </linearGradient>
  </defs>
  <circle cx="128" cy="128" r="104" stroke="url(#g)" stroke-width="20" opacity="0.28"/>
  <circle cx="128" cy="128" r="66" stroke="url(#g)" stroke-width="20" opacity="0.55"/>
  <circle cx="128" cy="128" r="30" fill="url(#g)"/>
  <path d="M128 158v46" stroke="url(#g)" stroke-width="20" stroke-linecap="round"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    position: relative; overflow: hidden;
    background: ${CANVAS};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: ${INK};
    -webkit-font-smoothing: antialiased;
  }
  /* Warm light from the top-left, the same direction as the landing hero. */
  .glow-a { position: absolute; top: -260px; left: -200px; width: 620px; height: 620px;
    border-radius: 50%; background: rgba(254,171,48,0.15); filter: blur(130px); }
  .glow-b { position: absolute; bottom: -300px; right: -180px; width: 620px; height: 620px;
    border-radius: 50%; background: rgba(240,100,19,0.10); filter: blur(130px); }
  .dots { position: absolute; inset: 0;
    background-image: radial-gradient(rgba(29,29,31,0.055) 1px, transparent 1px);
    background-size: 28px 28px; }
  .rule { position: absolute; inset: 0; box-shadow: inset 0 0 0 1px rgba(29,29,31,0.06); }

  .content { position: relative; height: 100%; padding: 64px 72px;
    display: flex; flex-direction: column; justify-content: space-between; }

  .brand { display: flex; align-items: center; gap: 14px; }
  .brand svg { display: block; }
  .brand-name { font-size: 30px; font-weight: 650; letter-spacing: -0.038em; }

  .hero { max-width: 660px; }
  h1 { font-size: 78px; line-height: 0.98; letter-spacing: -0.042em; font-weight: 700; }
  h1 .dim { color: ${MUTED}; }
  .sub { margin-top: 22px; font-size: 25px; line-height: 1.35; font-weight: 500;
    color: #3d3d3d; max-width: 560px; letter-spacing: -0.01em; }
  .pills { margin-top: 30px; display: flex; align-items: center; gap: 12px; }
  .pill { display: inline-flex; align-items: center; gap: 9px; height: 52px; padding: 0 22px;
    border-radius: 999px; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  .pill.primary { background: ${INK}; color: #fff; }
  .pill.ghost { background: #fff; color: ${INK}; box-shadow: inset 0 0 0 1px rgba(29,29,31,0.12); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${GREEN}; }

  .foot { display: flex; align-items: center; gap: 14px; font-size: 19px; font-weight: 600;
    color: ${MUTED}; letter-spacing: -0.01em; }
  .foot .sep { width: 4px; height: 4px; border-radius: 50%; background: rgba(29,29,31,0.22); }

  /* The product, as it actually looks: a room with a live pairing code. */
  .scene { position: absolute; right: 64px; top: 128px; width: 500px; height: 384px; }
  .room { position: absolute; left: 0; top: 0; width: 340px; height: 356px; background: #fff; border-radius: 26px;
    box-shadow: 0 26px 60px -26px rgba(29,29,31,0.36), inset 0 0 0 1px rgba(29,29,31,0.07);
    padding: 20px 20px; display: flex; flex-direction: column; }
  .room-head { display: flex; align-items: center; justify-content: space-between; }
  .room-title { font-size: 19px; font-weight: 650; letter-spacing: -0.02em; }
  .live { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600;
    color: #1d7a35; }
  .code-label { margin-top: 22px; font-size: 12px; font-weight: 650; letter-spacing: 0.1em;
    text-transform: uppercase; color: ${MUTED}; }
  .code { margin-top: 10px; display: flex; gap: 5px; }
  .digit { width: 40px; height: 54px; border-radius: 13px; background: #fbfbfd;
    box-shadow: inset 0 0 0 1px rgba(29,29,31,0.09);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .msg { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .bubble { align-self: flex-start; max-width: 236px; padding: 11px 14px; border-radius: 16px;
    background: #f4f4f6; font-size: 15px; line-height: 1.35; font-weight: 500; color: #2a2a2c; }
  .bubble.mine { align-self: flex-start; background: ${INK}; color: #fff; }
  .phone { position: absolute; right: 0; bottom: 0; width: 150px; height: 272px;
    border-radius: 28px; background: ${INK}; padding: 6px;
    box-shadow: 0 24px 50px -20px rgba(29,29,31,0.45); }
  .phone-screen { width: 100%; height: 100%; border-radius: 22px; background: #fff;
    padding: 16px 10px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .notch { width: 54px; height: 5px; border-radius: 999px; background: rgba(29,29,31,0.16); }
  .phone-title { font-size: 13px; font-weight: 650; letter-spacing: -0.02em; }
  .phone-line { font-size: 11px; font-weight: 500; color: ${MUTED}; }
  .phone-btn { margin-top: auto; width: 100%; height: 34px; border-radius: 10px; background: ${GREEN};
    color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
</style></head><body>
  <div class="glow-a"></div>
  <div class="glow-b"></div>
  <div class="dots"></div>

  <div class="scene" aria-hidden="true">
    <div class="room">
      <div class="room-head">
        <span class="room-title">Room</span>
        <span class="live"><span class="dot"></span>2 devices</span>
      </div>
      <div class="code-label">Room code</div>
      <div class="code">
        ${'418302'.split('').map(d => `<span class="digit">${d}</span>`).join('')}
      </div>
      <div class="msg">
        <div class="bubble">Here's the plan for Friday 📎</div>
        <div class="bubble mine">Got it — opening now.</div>
      </div>
    </div>
    <div class="phone">
      <div class="phone-screen">
        <div class="notch"></div>
        <div class="phone-title">ShareTexts</div>
        <div class="phone-line">Connected</div>
        <div class="phone-btn">Open room</div>
      </div>
    </div>
  </div>

  <div class="content">
    <div class="brand">${glyph}<span class="brand-name">ShareTexts</span></div>

    <div class="hero">
      <h1>AirDrop for<br/><span class="dim">everyone.</span></h1>
      <p class="sub">Send text, photos, and files between any two devices. No app. No account. No wires.</p>
      <div class="pills">
        <span class="pill primary">Send</span>
        <span class="pill ghost">Receive</span>
      </div>
    </div>

    <div class="foot">
      <span>sharetexts.online</span>
      <span class="sep"></span>
      <span>Free, in the browser</span>
    </div>
  </div>
  <div class="rule"></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
fs.mkdirSync(path.join(pub, 'og'), { recursive: true });
const out = path.join(pub, 'og', 'sharetext-og-v11.png');
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();

const b = fs.readFileSync(out);
const w = b.readUInt32BE(16);
const h = b.readUInt32BE(20);
console.log(`wrote ${path.relative(root, out)} — ${w}x${h}, ${Math.round(b.length / 1024)}KB`);
if (w !== 1200 || h !== 630) { console.error('OG card must be exactly 1200x630'); process.exit(1); }
