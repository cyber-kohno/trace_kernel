// Loopback-only UI fixture. No Tauri, real session, token, Workspace or license.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { desktopMcpIdentityPlugin } from '../../../release/desktop-mcp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  plugins: [
    desktopMcpIdentityPlugin(),
    svelte({ configFile: false }),
    {
      name: 'mcp-diagnostics-preview',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split('?')[0] !== '/') return next();
          try {
            const html = await server.transformIndexHtml(
              '/',
              `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MCP diagnostics UI fixture</title></head>
<body style="margin:0;background:#484959;color:#eee;font:12px system-ui"><div id="fixture"></div>
<script type="module">import { mount } from 'svelte'; import Fixture from '/scripts/fixtures/McpDiagnosticsPreview.svelte'; mount(Fixture, {target: document.getElementById('fixture')});</script></body></html>`,
            );
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0, strictPort: true },
});
await server.listen();
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
