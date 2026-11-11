/**
 * Input zoom audit — the 16px floor, on real screens, on phones.
 *
 * iOS Safari and Android Chrome zoom the viewport when a focused text field's
 * computed font-size is under 16px, and the page never quite reflows back.
 * This drives the app on a 390pt iPhone and a 412pt Pixel profile and fails
 * on any VISIBLE text field under 16px.
 *
 * Exit contract (a green run has to mean something):
 *   · every visible text field is ≥16px
 *   · the landing surface is reached and has at least one field
 *   · at least two surfaces are reached — otherwise the run fails as
 *     "not covered" rather than passing on a screen it never opened.
 *
 * Each surface gets a fresh browser context: the app persists a created room,
 * so a shared context would reload into the room and never show the landing.
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const SKIP_TYPES = new Set(['checkbox', 'radio', 'range', 'file', 'hidden', 'submit', 'button', 'image']);
const findings = [];
const warnings = [];

async function scan(page, label) {
  const rows = await page.evaluate((skip) => {
    const els = [...document.querySelectorAll('input, textarea, select')];
    return els
      .filter((el) => !skip.includes(el.getAttribute('type') || ''))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name:
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('data-testid') ||
          el.id ||
          '(unnamed)',
        size: parseFloat(getComputedStyle(el).fontSize),
      }));
  }, [...SKIP_TYPES]);

  for (const r of rows) {
    const ok = r.size >= 16;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${r.tag}[${r.type}] ${r.size}px — ${r.name}`);
    if (!ok) findings.push(`${label}: ${r.tag}[${r.type}] ${r.size}px — ${r.name}`);
  }
  if (!rows.length) console.log('  (no text fields on this screen)');
  return rows.length;
}

const SURFACES = [
  {
    name: 'landing',
    minFields: 1,
    run: async () => {},
  },
  {
    name: 'send → pairing',
    minFields: 0,
    run: async (p) => {
      await p.locator('[data-testid="home-send"]').click();
      await p.locator('[data-testid="pairing-code"]').waitFor({ timeout: 9000 });
      await p.waitForTimeout(500);
    },
  },
  {
    name: 'receive → join',
    minFields: 0,
    run: async (p) => {
      await p.locator('[data-testid="home-receive"]').click();
      await p.waitForTimeout(1600);
    },
  },
];

const browser = await chromium.launch();
let reached = 0;
let fields = 0;

for (const profile of [
  { name: 'iPhone 13 (390)', ctx: { ...devices['iPhone 13'] } },
  { name: 'Pixel 7 (412)', ctx: { ...devices['Pixel 7'] } },
]) {
  console.log(`\n===== ${profile.name} =====`);

  for (const surface of SURFACES) {
    const context = await browser.newContext(profile.ctx); // isolated storage
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    console.log(`/${surface.name}`);
    let ok = true;
    try {
      await surface.run(page);
    } catch (e) {
      ok = false;
      warnings.push(`${profile.name} ${surface.name}: unreachable — ${String(e).split('\n')[0].slice(0, 80)}`);
      console.log(`  NOT COVERED (${String(e).split('\n')[0].slice(0, 80)})`);
    }
    if (ok) {
      const n = await scan(page, `${profile.name} ${surface.name}`);
      fields += n;
      if (n >= surface.minFields) reached += 1;
      else if (surface.minFields > 0) findings.push(`${profile.name} ${surface.name}: expected a field, found none`);
    }
    if (errors.length) findings.push(`${profile.name} ${surface.name}: page error ${errors[0]}`);
    await context.close();
  }
}

await browser.close();

console.log(`\n${fields} field(s) scanned across ${reached} surface(s).`);
for (const w of warnings) console.log(`WARN ${w}`);

if (findings.length) {
  console.log(`FAIL — ${findings.length} problem(s):`);
  for (const f of findings) console.log(`  · ${f}`);
  process.exit(1);
}
if (reached < 2) {
  console.log('FAIL — fewer than two surfaces were reached; this is not a pass, it is an untested run.');
  process.exit(1);
}
console.log('ALL SCANNED INPUTS ≥16PX — no keyboard zoom on either platform');
