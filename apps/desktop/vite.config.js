import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
// @ts-expect-error Node.js built-ins are available to the Vite config runtime
import { readFileSync } from 'node:fs';
// @ts-expect-error Node.js built-ins are available to the Vite config runtime
import path from 'node:path';
// @ts-expect-error Node.js built-ins are available to the Vite config runtime
import { fileURLToPath } from 'node:url';

const virtualTsLibsId = 'virtual:trace-kernel-ts-libs';
const resolvedVirtualTsLibsId = `\0${virtualTsLibsId}`;

const traceKernelTsLibs = () => {
  /** @type {Record<string, string>} */
  let libFiles = {};
  let command = 'serve';

  return {
    name: 'trace-kernel-typescript-libs',
    /** @param {import('vite').ResolvedConfig} config */
    configResolved(config) {
      command = config.command;
      const typescriptLibDir = path.dirname(
        fileURLToPath(import.meta.resolve('typescript')),
      );
      /** @param {string} name */
      const addLib = (name) => {
        const fileName = `lib.${name}.d.ts`;
        if (libFiles[fileName] != null) return;
        const source = readFileSync(
          path.join(typescriptLibDir, fileName),
          'utf8',
        );
        libFiles[fileName] = source;
        for (const [, referencedLib] of source.matchAll(
          /<reference\s+lib=["']([^"']+)["']\s*\/>/g,
        )) {
          addLib(referencedLib);
        }
      };
      addLib('es2020');
      addLib('webworker');
    },
    /** @param {string} id */
    resolveId(id) {
      return id === virtualTsLibsId ? resolvedVirtualTsLibsId : null;
    },
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use(
        '/__trace_kernel_typescript_libs.json',
        (_request, response) => {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(libFiles));
        },
      );
    },
    /** @param {string} id @returns {string | null} */
    load(id) {
      if (id !== resolvedVirtualTsLibsId) return null;
      if (command === 'serve') {
        return `export default '/__trace_kernel_typescript_libs.json';`;
      }
      // @ts-expect-error Rollup injects its plugin context as `this`.
      const assetId = this.emitFile({
        type: 'asset',
        name: 'trace-kernel-typescript-libs.json',
        source: JSON.stringify(libFiles),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${assetId};`;
    },
  };
};

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [traceKernelTsLibs(), sveltekit()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
