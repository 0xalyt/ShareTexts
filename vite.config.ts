import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'path';
import {defineConfig, type Connect, type ViteDevServer} from 'vite';

/** Serve the static guides hub at its canonical extensionless URL in dev.
 *  Production does the same (server.ts app.get('/guides'), vercel.json
 *  rewrite). Without this, Vite's SPA fallback returns the app shell for
 *  /guides and the client renders its 404 view on a 200 status. */
const guidesHub = () => ({
  name: 'guides-hub',
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      const url = (req.url || '').split('?')[0];
      if (url === '/guides' || url === '/guides/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fs.readFileSync(path.resolve(__dirname, 'public/guides/index.html')));
        return;
      }
      next();
    });
  },
});

/** Emit the lazy-chunk list for the service worker (P4 STEP 1a).
 *  `dist/precache.json` lists every dynamic-entry file the build produced; the
 *  worker precaches them at install so a tab that was opened under the previous
 *  build can still import its own chunk after a deploy. Without this the chunk
 *  is a 404 and the page can only recover by reloading. */
const precacheManifest = () => ({
  name: 'precache-manifest',
  apply: 'build' as const,
  closeBundle() {
    const manifestPath = path.resolve(__dirname, 'dist/.vite/manifest.json');
    if (!fs.existsSync(manifestPath)) return;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, {
      file: string;
      css?: string[];
      isDynamicEntry?: boolean;
    }>;
    const lazy = new Set<string>();
    for (const entry of Object.values(manifest)) {
      if (!entry.isDynamicEntry) continue;
      lazy.add('/' + entry.file);
      for (const css of entry.css ?? []) lazy.add('/' + css);
    }
    fs.writeFileSync(path.resolve(__dirname, 'dist/precache.json'), JSON.stringify([...lazy], null, 2));
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), guidesHub(), precacheManifest()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // .vite/manifest.json is the input for dist/precache.json (below).
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['motion/react'],
            'vendor-icons': ['lucide-react'],
            // The signaling client only matters once a room opens, but it is
            // a static import of src/lib/socket.ts — so at least keep it in
            // its own long-lived chunk: an app release must not re-download
            // it (hashed + immutable cache), and it parses in parallel.
            'vendor-socket': ['socket.io-client'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        // The signaling server writes runtime state into the project root
        // (.rooms-total.json — the lifetime rooms counter). Without this,
        // every room creation force-reloads every open page mid-session.
        ignored: ['**/.rooms-total.json'],
      },
    },
  };
});