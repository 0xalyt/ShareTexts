// Which request 400s on the space-create page?
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('response', r => { if (r.status() >= 400) console.log(r.status(), r.request().method(), r.url()); });
await p.goto('http://localhost:3010/space/create', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
await b.close();
