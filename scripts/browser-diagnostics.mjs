import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const location = value => {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return value; }
};

export function browserDiagnostics(browser, name) {
  const contexts = new Map();
  let contextId = 0;
  let pageId = 0;
  return {
    async newContext(options) {
      const context = await browser.newContext(options);
      const record = { id: ++contextId, pages: new Map() };
      contexts.set(context, record);
      await context.tracing.start({ screenshots: true, snapshots: true });
      context.on('page', page => {
        const state = { id: ++pageId, consoleErrors: [], pageErrors: [], webSockets: [], pending: new Map() };
        record.pages.set(page, state);
        page.on('console', message => { if (message.type() === 'error') state.consoleErrors.push(message.text()); });
        page.on('pageerror', error => state.pageErrors.push(String(error)));
        page.on('request', request => state.pending.set(request, { url: location(request.url()), method: request.method(), type: request.resourceType(), started: Date.now() }));
        page.on('requestfinished', request => state.pending.delete(request));
        page.on('requestfailed', request => state.pending.delete(request));
        page.on('websocket', socket => {
          const info = { url: location(socket.url()), opened: Date.now(), sent: 0, received: 0, errors: [] };
          state.webSockets.push(info);
          socket.on('framesent', () => info.sent++);
          socket.on('framereceived', () => info.received++);
          socket.on('socketerror', error => info.errors.push(String(error)));
          socket.on('close', () => info.closed = Date.now());
        });
      });
      context.on('close', () => contexts.delete(context));
      return context;
    },
    async captureFailure(error) {
      const directory = path.join('audit', 'failures', `${name}-${process.env.BROWSER || 'chromium'}-${Date.now()}`);
      await mkdir(directory, { recursive: true });
      const evidence = { error: String(error?.stack || error), pages: [], traces: [] };
      for (const [context, record] of contexts) {
        for (const [page, state] of record.pages) {
          const entry = {
            id: state.id, url: location(page.url()), closed: page.isClosed(),
            consoleErrors: state.consoleErrors, pageErrors: state.pageErrors, webSockets: state.webSockets,
            pendingRequests: [...state.pending.values()].map(request => ({ ...request, pendingMs: Date.now() - request.started })),
          };
          if (!page.isClosed()) {
            try {
              await page.screenshot({ path: path.join(directory, `page-${state.id}.png`), timeout: 5000 });
            } catch (e) { entry.screenshotError = String(e); }
            try {
              let timer;
              try {
                entry.app = await Promise.race([
                  page.evaluate(() => ({ events: window.__sharetextDiag?.snapshot() ?? null, rooms: window.__sharetextDiag?.roomDiags() ?? null, readyState: document.readyState })),
                  new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Diagnostic evaluation timed out')), 5000); }),
                ]);
              } finally { clearTimeout(timer); }
            } catch (e) { entry.appError = String(e); }
          }
          evidence.pages.push(entry);
        }
        try {
          const trace = `context-${record.id}-trace.zip`;
          await context.tracing.stop({ path: path.join(directory, trace) });
          evidence.traces.push(trace);
        } catch (e) { evidence.traces.push({ error: String(e) }); }
      }
      await writeFile(path.join(directory, 'diagnostics.json'), JSON.stringify(evidence, null, 2));
      console.error(`[diagnostics] wrote ${directory}`);
      return directory;
    },
  };
}
