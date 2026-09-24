import { defineConfig, type IndexHtmlTransformContext, type IndexHtmlTransformResult, type ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'path'
import react from '@vitejs/plugin-react'
// @ts-expect-error no types for local mjs script
import { servePackageTgz } from './scripts/pkgutil.mjs'

const presetsPlugin = () => ({
  name: 'vite-plugin-presets',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/api/presets', (req: IncomingMessage, res: ServerResponse) => {
      const presetsDir = join(server.config.root, 'presets');
      const toFilename = (name: string) =>
        name.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '') + '.json';

      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'PUT') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const preset = JSON.parse(body);
            const filename = toFilename(preset.name);
            writeFileSync(join(presetsDir, filename), JSON.stringify(preset, null, 2));
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, filename }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid preset data' }));
          }
        });
      } else if (req.method === 'DELETE') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { name } = JSON.parse(body);
            const filename = toFilename(name);
            const filepath = join(presetsDir, filename);
            if (existsSync(filepath)) unlinkSync(filepath);
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid request' }));
          }
        });
      } else {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
    });
  },
});

const packageEndpointPlugin = () => ({
  name: 'vite-plugin-package-endpoint',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/package.tgz', (req: IncomingMessage, res: ServerResponse) => {
      void servePackageTgz(req, res, server.config.root)
    })
  },
})

const WATCHED_CONFIG_FILES = ['package.json', 'config/proxies.yml', 'config/policies.yml'];
const CONFIG_CHANGED_HMR_EVENT = 'cribl:config-changed';

const CONFIG_CHANGED_BRIDGE = `
import { createHotContext } from '/@vite/client';
const hot = createHotContext('cribl:config-watcher');
hot.on('${CONFIG_CHANGED_HMR_EVENT}', (data) => {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'CRIBL_APP_CONFIG_CHANGED', file: data && data.file }, '*');
  }
  window.location.reload();
});
`;

const injectScriptFromQueryPlugin = () => {
  let initScriptUrl: string | null = null;
  return {
    name: 'inject-script-from-query',
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      const watched = WATCHED_CONFIG_FILES.map((rel) => join(root, rel));
      server.watcher.add(watched);
      server.watcher.on('change', (file) => {
        const idx = watched.indexOf(file);
        if (idx === -1) return;
        server.ws.send(CONFIG_CHANGED_HMR_EVENT, { file: WATCHED_CONFIG_FILES[idx] });
      });
    },
    transformIndexHtml(html: string, ctx: IndexHtmlTransformContext): IndexHtmlTransformResult{
      const url = new URL(ctx.originalUrl ?? '/', 'https://localhost');
      initScriptUrl = initScriptUrl || url.searchParams.get('init');
      const root = process.cwd();
      let appName;
      try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { name?: string };
        appName = pkg.name;
      } catch {
        /* ignore missing or invalid package.json */
      }
      appName = appName || 'unknown';
      const tags: Array<{ tag: string; attrs?: Record<string, string>; children?: string; injectTo: 'head-prepend' }> = [];
      // Only inject the dev app-id marker under the dev server (live preview).
      // `ctx.server` is undefined during `vite build`, so production bundles
      // never carry the `__dev__` id, letting apps detect live preview reliably.
      if (ctx.server) {
        tags.push({
          tag: 'script',
          children: `window.CRIBL_APP_ID = '__dev__${appName}';`,
          injectTo: 'head-prepend' as const,
        });
        tags.push({
          tag: 'script',
          attrs: { type: 'module' },
          children: CONFIG_CHANGED_BRIDGE,
          injectTo: 'head-prepend' as const,
        });
      }
      if (initScriptUrl) {
        tags.push({
          tag: 'script',
          attrs: { src: initScriptUrl, type: 'text/javascript' },
          injectTo: 'head-prepend' as const,
        });
      }
      return { html, tags };
    },
  };
};

export default defineConfig({
  plugins: [react(), presetsPlugin(), packageEndpointPlugin(), injectScriptFromQueryPlugin()],
  base: './',
  server: {
    cors: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})

