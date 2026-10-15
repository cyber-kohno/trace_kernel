import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { loadTypeScriptLibraries } from '../../../packages/runtime-core/build/standard-libs.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = path.resolve(app, '../../packages/runtime-core/src');
const server = await createServer({
  root: app,
  configFile: path.join(app, 'vite.config.js'),
  // This fixture requests shared modules rather than the whole application.
  // Optimize their dependencies explicitly so closing it cannot race a new
  // full-application dependency scan triggered by the pako request.
  optimizeDeps: { noDiscovery: true, include: ['encoding-japanese', 'pako'] },
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const read = async (url) => {
    const response = await fetch(base + url, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200, url);
    return response.text();
  };
  const plan = await read(
    '/@fs/' +
      path
        .join(shared, 'execution/work-execution-plan.ts')
        .replaceAll('\\', '/'),
  );
  assert.ok(plan.includes('createWorkExecutionPlan'));
  const libraries = JSON.parse(await read('/__trace_kernel_typescript_libs.json'));
  assert.deepEqual(libraries, loadTypeScriptLibraries());
  const data = await read(
    '/@fs/' + path.join(shared, 'data/data-util.ts').replaceAll('\\', '/'),
  );
  assert.ok(data.includes('convertTableToJson'));
  const dependency = data.match(
    /from\s+["']([^"']*encoding-japanese[^"']*)["']/,
  )?.[1];
  assert.ok(
    dependency,
    'The encoding dependency is not served from the shared module.',
  );
  await read(dependency);
  const filesystem = await read(
    '/@fs/' +
      path.join(shared, 'api/fs/dcl-file-system.ts').replaceAll('\\', '/'),
  );
  assert.ok(filesystem.includes('RealFSWriter.create'));
  const codec = await read(
    '/@fs/' +
      path.join(shared, 'workspace/workspace-codec.ts').replaceAll('\\', '/'),
  );
  const compressionDependency = codec.match(
    /from\s+["']([^"']*pako[^"']*)["']/,
  )?.[1];
  assert.ok(compressionDependency, 'The compression dependency is not served.');
  await read(compressionDependency);
  const filesystemBridge = await read(
    '/src/app/contents/detail/program/util/fs/dcl-file-system.ts',
  );
  assert.ok(
    filesystemBridge.includes(
      '/packages/runtime-core/src/api/fs/dcl-file-system.ts',
    ),
  );
  const bridge = await read(
    '/src/app/service/execution/work-execution-plan.ts',
  );
  assert.ok(
    bridge.includes(
      '/packages/runtime-core/src/execution/work-execution-plan.ts',
    ),
  );
} finally {
  await server.close();
}
console.log(
  'Desktop dev server serves shared modules, dependencies and bridges, then closes.',
);
