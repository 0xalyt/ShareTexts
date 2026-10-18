/**
 * F26 — complete Temporary Space journey against a LOCAL worker (wrangler dev).
 * Disposable: creates one space, uploads one tiny file, closes it at the end.
 *
 *   create → code availability (free/taken/invalid) → join by code (2nd device)
 *   → member perms (no close without manageKey) → text item + file upload/download
 *   → manage close → code retired (no-oracle 404) → cleanup done via close.
 *
 * Run: node scripts/probe-space-journey-f26.mjs   (BASE=http://localhost:8787)
 */
import crypto from 'node:crypto';
import http from 'node:http';

// wrangler dev's loopback proxy on Windows breaks when undici reuses
// keep-alive connections ("Can't read from request stream after response has
// been sent" → 500 "Network connection lost", and it can crash the dev
// server). Use node:http with Connection: close — one fresh socket per
// request, exactly like curl, which drives the same routes reliably.
const noKeepAlive = new http.Agent({ keepAlive: false });
async function jf(url, { method = 'GET', headers = {}, body } = {}) {
  const u = new URL(url);
  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      method, headers: { ...headers, ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) },
      agent: noKeepAlive,
    }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
  return {
    status: res.status,
    headers: { get: (n) => res.headers[n.toLowerCase()] ?? null },
    json: async () => JSON.parse(res.body || 'null'),
    text: async () => res.body,
  };
}

const BASE = process.env.BASE || 'http://localhost:8787';
const ALPHA = 'ACDEFGHJKMNPQRTUVWXYZ234679';
const freshCode = () => Array.from(crypto.randomBytes(8)).map(b => ALPHA[b % ALPHA.length]).join('');
const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const dev = 'f26-' + crypto.randomBytes(4).toString('hex');
const devB = dev + '-b';
const h = (token, extra = {}) => ({
  'content-type': 'application/json',
  'x-device-key': dev,
  'x-device-name': 'F26 Probe',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...extra,
});

const CODE = freshCode();
const spaceId = uuid();
let manageKey = null, tokenA = null, tokenB = null;

try {
  /* 1. create with a custom code */
  const created = await jf(`${BASE}/space/${spaceId}/create`, {
    method: 'POST', headers: h(null),
    body: JSON.stringify({ name: 'F26 probe', durationMs: 6 * 60 * 60 * 1000, code: CODE }), // 6h = shortest allowed duration
  });
  const cj = await created.json().catch(() => ({}));
  check('create → 200 with spaceId+token+manageKey', created.status === 200 && typeof cj.spaceId === 'string' && typeof cj.token === 'string' && typeof cj.manageKey === 'string', `status=${created.status}`);
  tokenA = cj.token; manageKey = cj.manageKey;

  /* 2. availability checks */
  const free = await (await jf(`${BASE}/space-code/check?code=${freshCode()}`)).json();
  check('check: fresh code → available:true', free.available === true, JSON.stringify(free).slice(0, 80));
  const taken = await (await jf(`${BASE}/space-code/check?code=${CODE}`)).json();
  check('check: used code → available:false + suggestion', taken.available === false && typeof taken.suggestion === 'string', JSON.stringify(taken).slice(0, 80));
  const bad = await (await jf(`${BASE}/space-code/check?code=!!!!`)).json();
  check('check: invalid shape → available:false reason:invalid', bad.available === false && bad.reason === 'invalid', JSON.stringify(bad).slice(0, 80));

  /* 3. second device joins by code */
  const joined = await jf(`${BASE}/space/join-code`, {
    method: 'POST', headers: { ...h(null, { 'x-device-key': devB, 'x-device-name': 'F26 Probe B' }), },
    body: JSON.stringify({ code: CODE.toLowerCase() }),
  });
  const jj = await joined.json().catch(() => ({}));
  check('join-by-code (messy input) → 200 snapshot + token', joined.status === 200 && typeof jj.spaceId === 'string', `status=${joined.status}`);
  tokenB = joined.headers.get('x-space-token') || jj.token || null;
  check('joiner received an access token', typeof tokenB === 'string' && tokenB.length > 8);

  /* 4. unknown code → no-oracle 404 */
  const unknown = await jf(`${BASE}/space/join-code`, {
    method: 'POST', headers: h(null), body: JSON.stringify({ code: freshCode() }),
  });
  check('unknown code → 404 (no oracle)', unknown.status === 404, `status=${unknown.status}`);

  /* 5. member cannot close (no manage key); wrong key cannot close */
  const noAuth = await jf(`${BASE}/space/${spaceId}/close`, {
    method: 'POST', headers: h(tokenB), body: '{}',
  });
  check('member without manageKey → close refused', noAuth.status === 403 || noAuth.status === 401, `status=${noAuth.status}`);
  const wrongKey = await jf(`${BASE}/space/${spaceId}/close`, {
    method: 'POST', headers: h('not-the-manage-key'), body: '{}',
  });
  check('wrong manage key → close refused', wrongKey.status === 401 || wrongKey.status === 403, `status=${wrongKey.status}`);

  /* 6. text item by the joiner + list for both */
  const text = await jf(`${BASE}/space/${spaceId}/items/text`, {
    method: 'POST', headers: h(tokenB), body: JSON.stringify({ text: 'hello from F26', kind: 'text' }),
  });
  const tj = await text.json().catch(() => ({}));
  check('joiner adds a text item', text.status === 200 && !!tj.item?.id, `status=${text.status}`);
  const listed = await (await jf(`${BASE}/space/${spaceId}/items?since=0`, { headers: h(tokenA) })).json();
  check('creator lists the joiner\'s item', Array.isArray(listed.items) && listed.items.some(i => i.text === 'hello from F26'), `items=${listed.items?.length}`);

  /* 7. file upload → download roundtrip (real worker routes:
        init → PUT /items/file/direct?itemId= → status → download) */
  const payload = 'F26 file bytes ' + crypto.randomBytes(8).toString('hex');
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const init = await jf(`${BASE}/space/${spaceId}/items/file/init`, {
    method: 'POST', headers: h(tokenA),
    body: JSON.stringify({ name: 'f26.txt', mime: 'text/plain', size: Buffer.byteLength(payload), sha256: sha }),
  });
  const ij = await init.json().catch(() => ({}));
  check('file init → itemId + direct mode', init.status === 200 && typeof ij.itemId === 'string' && ij.mode === 'direct', `status=${init.status} ${JSON.stringify(ij).slice(0, 90)}`);
  if (ij.itemId) {
    const put = await jf(`${BASE}/space/${spaceId}/items/file/direct?itemId=${encodeURIComponent(ij.itemId)}`, {
      method: 'PUT', headers: { ...h(tokenA, { 'content-type': 'application/octet-stream' }) }, body: payload,
    });
    if (put.status === 503) {
      // Honest degradation when the R2 binding is absent (wrangler.toml ships
      // it commented out): text spaces work, files answer "not configured".
      const err = await put.json().catch(() => ({}));
      check('file upload without R2 binding → honest 503 (documented degradation)', /not configured/i.test(err.error || ''), JSON.stringify(err));
    } else {
      check('file upload → accepted', put.status === 200 || put.status === 204, `status=${put.status}`);
      let itemId = null;
      for (let i = 0; i < 10; i++) {
        const st = await (await jf(`${BASE}/space/${spaceId}/items/file/status?itemId=${encodeURIComponent(ij.itemId)}`, { headers: h(tokenA) })).json().catch(() => ({}));
        if (st.status === 'READY' || st.item?.status === 'READY') { itemId = ij.itemId; break; }
        await sleep(400);
      }
      check('upload reaches READY', !!itemId, `itemId=${itemId}`);
      if (itemId) {
        const dl = await jf(`${BASE}/space/${spaceId}/items/${itemId}/download`, { headers: h(tokenB) });
        const bytes = await dl.text();
        check('joiner downloads identical bytes', dl.status === 200 && bytes === payload, `status=${dl.status}`);
      }
    }
  }

  /* 8. close by the creator → code retired, members locked out.
     wrangler dev's loopback proxy on Windows can drop the connection on this
     route (client sees 500/000 while the worker logged 200) — close is safe
     to retry, and a valid cred on an already-closed space answers 410 Gone
     {closed:true}, which also proves the close took. */
  let closedStatus = 0;
  for (let attempt = 0; attempt < 2 && ![200, 204, 410].includes(closedStatus); attempt++) {
    closedStatus = await jf(`${BASE}/space/${spaceId}/close`, {
      method: 'POST', headers: h(manageKey), body: '{}',
    }).then(r => r.status).catch(() => 0);
    if (![200, 204, 410].includes(closedStatus)) await sleep(600);
  }
  check('creator closes the space (200/204, or 410 = already closed)', [200, 204, 410].includes(closedStatus), `status=${closedStatus}`);
  const rejoin = await jf(`${BASE}/space/join-code`, {
    method: 'POST', headers: h(null), body: JSON.stringify({ code: CODE }),
  });
  check('code retired after close → 404', rejoin.status === 404, `status=${rejoin.status}`);
  const postClose = await (await jf(`${BASE}/space-code/check?code=${CODE}`)).json();
  check('availability restored after close', postClose.available === true, JSON.stringify(postClose).slice(0, 80));

  /* 9. stale-worker signature must NOT appear locally: the fallback shape */
  const idx = await (await jf(`${BASE}/space-code/check?code=${CODE}`)).json();
  check('local check response has boolean available (never fallback shape)', typeof idx.available === 'boolean' && idx.name !== 'sharetext-signaling');
} catch (e) {
  failed++;
  console.error('JOURNEY ERROR:', e);
} finally {
  // cleanup: best-effort close if we still hold the manage key
  if (manageKey && spaceId) {
    await jf(`${BASE}/space/${spaceId}/close`, { method: 'POST', headers: h(manageKey), body: '{}' }).catch(() => {});
  }
}
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
