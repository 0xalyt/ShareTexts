// Tiny static server for reviewing audit screenshots in the browser preview.
// Serves the repo root so /docs/audits/** is reachable at http://127.0.0.1:3663.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const p = path.join(root, rel);
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(3663, '127.0.0.1', () => console.log('shots server on http://127.0.0.1:3663'));
