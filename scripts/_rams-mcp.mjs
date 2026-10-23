// Temp Rams MCP client — handshake + quick_review over Streamable HTTP.
// The token comes from the RAMS_TOKEN env var, never from this file.
//   RAMS_TOKEN=... node scripts/_rams-mcp.mjs list
//   RAMS_TOKEN=... node scripts/_rams-mcp.mjs review <path-to-file>
const TOKEN = process.env.RAMS_TOKEN;
if (!TOKEN) { console.error('RAMS_TOKEN missing'); process.exit(2); }
const ENDPOINT = 'https://worker.rams.ai/mcp';

let sessionId = null;
let nextId = 1;

async function rpc(method, params, isNotification = false) {
  const body = isNotification
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: nextId++, method, params };
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${TOKEN}`,
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${method}: ${text.slice(0, 400)}`);
  if (isNotification) return null;

  // Streamable HTTP may answer plain JSON or an SSE stream.
  if (text.startsWith('event:') || text.startsWith('data:')) {
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    if (!line) throw new Error(`SSE reply had no data line for ${method}`);
    return JSON.parse(line.slice(5).trim());
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'freebuff-buffy', version: '1.0.0' },
  });
  await rpc('notifications/initialized', {}, true);
  console.log(`[mcp] initialized · session=${sessionId ? 'yes' : 'no'} · server=${init?.result?.serverInfo?.name ?? '?'}`);

  const cmd = process.argv[2] || 'list';

  if (cmd === 'list') {
    const { result } = await rpc('tools/list', {});
    for (const t of result?.tools ?? []) {
      console.log(`- ${t.name}${t.description ? ' — ' + t.description.split('\n')[0] : ''}`);
    }
    const qr = (result?.tools ?? []).find((t) => t.name === 'quick_review');
    if (qr) console.log('\nquick_review input schema:\n' + JSON.stringify(qr.inputSchema, null, 2));
    return;
  }

  if (cmd === 'usage') {
    const { result, error } = await rpc('tools/call', { name: 'usage', arguments: {} });
    if (error) { console.log('RPC error: ' + JSON.stringify(error)); process.exit(1); }
    for (const item of result?.content ?? []) if (item.type === 'text') console.log(item.text);
    return;
  }

  if (cmd === 'review') {
    const file = process.argv[3];
    if (!file) { console.error('review needs a file path'); process.exit(2); }
    const fs = await import('node:fs');
    const path = await import('node:path');
    const abs = path.resolve(file);
    const content = fs.readFileSync(abs, 'utf8');
    console.log(`[mcp] quick_review ${abs} (${content.length} bytes), via=rules`);
    // quick_review schema: { files: [{ path, content }], context?, via? }
    const { result, error } = await rpc('tools/call', {
      name: 'quick_review',
      arguments: {
        files: [{ path: abs.split('\\').join('/').replace(/^.*\/ShareTexts\//, ''), content }],
        via: 'rules',
      },
    });
    if (error) { console.log('RPC error:\n' + JSON.stringify(error, null, 2)); process.exit(1); }
    for (const item of result?.content ?? []) {
      if (item.type === 'text') console.log(item.text);
      else console.log(JSON.stringify(item));
    }
    if (result?.isError) process.exit(1);
    return;
  }

  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
