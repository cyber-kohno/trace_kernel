import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(app, 'src/app');
const cache = new Map();
const load = (file) => {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const require = (name) => {
    assert.ok(name.startsWith('.'), `Unexpected dependency: ${name}`);
    return load(path.resolve(path.dirname(file), name + '.ts'));
  };
  new Function('require', 'exports', 'module', js)(
    require,
    module.exports,
    module,
  );
  return module.exports;
};

const prepareWorkspaceLoad = load(
  path.join(root, 'service/workspace/prepare-workspace-load.ts'),
).default;
const { default: validateWorkspace, validateWorkspaceCategory } = load(
  path.join(root, 'service/workspace/validate-workspace.ts'),
);
const currentGen = { workspace: '2', api: '3' };
const source = (gen) => JSON.stringify({ gen, works: [{ name: 'sample' }] });
const workspace = () => ({
  gen: currentGen,
  envs: [{ varName: 'ENV', value: 'value' }],
  resources: [{ varName: 'RESOURCE', source: 'text' }],
  datasets: [
    {
      varName: 'DATASET',
      rootPath: 'C:/data',
      scanOption: { dirConds: [], fileConds: [] },
      targets: ['file.txt'],
    },
  ],
  processes: [
    {
      funcName: 'process',
      prgPath: 'C:/program',
      scriptArgs: [{ name: 'arg' }],
      cmdArgs: ['value'],
    },
  ],
  logics: [{ name: 'logic' }],
  declare: { source: '' },
  works: [{ name: 'work' }],
});

test('workspace loading returns the parsed data and compatibility decision', () => {
  const ready = prepareWorkspaceLoad(source(currentGen), currentGen);
  assert.equal(ready.status, 'ok');
  assert.deepEqual(ready.workspace.works, [{ name: 'sample' }]);

  const migration = prepareWorkspaceLoad(
    source({ workspace: '1', api: '3' }),
    currentGen,
  );
  assert.equal(migration.status, 'needs-workspace-migration');
  assert.deepEqual(migration.workspaceDiff, { from: '1', to: '2' });

  const apiWarning = prepareWorkspaceLoad(
    source({ workspace: '2', api: '1' }),
    currentGen,
  );
  assert.equal(apiWarning.status, 'warn-api');
  assert.deepEqual(apiWarning.apiDiff, { from: '1', to: '3' });
});

test('workspace loading rejects incompatible generations before opening', () => {
  assert.equal(
    prepareWorkspaceLoad(source(undefined), currentGen).status,
    'reject-missing-gen',
  );
  assert.equal(
    prepareWorkspaceLoad(source({ workspace: '4', api: '3' }), currentGen)
      .status,
    'reject-workspace-ahead',
  );
  assert.equal(
    prepareWorkspaceLoad(source({ workspace: '2', api: '4' }), currentGen)
      .status,
    'reject-api-ahead',
  );
  assert.throws(() => prepareWorkspaceLoad('{broken', currentGen), SyntaxError);
});

test('workspace validation identifies duplicates in both entries', () => {
  const loaded = workspace();
  assert.deepEqual(validateWorkspace(loaded), []);
  loaded.envs.push({ ...loaded.envs[0] });
  loaded.works.push({ ...loaded.works[0] });
  assert.deepEqual(validateWorkspace(loaded), [
    { cat: 'env', index: 0 },
    { cat: 'env', index: 1 },
    { cat: 'work', index: 0 },
    { cat: 'work', index: 1 },
  ]);
  assert.deepEqual(validateWorkspaceCategory(loaded, 'work'), [
    { cat: 'work', index: 0 },
    { cat: 'work', index: 1 },
  ]);
});

test('workspace validation applies the existing field rules without UI state', () => {
  const loaded = workspace();
  loaded.envs[0].varName = 'lower';
  loaded.resources[0].parse = { kind: 'json' };
  loaded.datasets[0].targets = [];
  loaded.processes[0].scriptArgs.push({ name: 'arg' });
  loaded.logics[0].name = '';
  loaded.works[0].name = '';
  assert.deepEqual(validateWorkspace(loaded), [
    { cat: 'env', index: 0 },
    { cat: 'resource', index: 0 },
    { cat: 'dataset', index: 0 },
    { cat: 'process', index: 0 },
    { cat: 'logic', index: 0 },
    { cat: 'work', index: 0 },
  ]);
});

test('GUI validation adapter replaces stale entries and refreshes a category', () => {
  const workspaceStore = { value: { workspace: workspace() } };
  const validationStore = {
    value: { disables: [{ cat: 'env', index: 42 }] },
    set(value) {
      this.value = value;
    },
    update(update) {
      this.value = update(this.value);
    },
  };
  const file = path.join(root, 'service/validation-service.ts');
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const require = (name) => {
    if (name === 'svelte/store') return { get: (store) => store.value };
    if (name === '../state/store') return { validationStore, workspaceStore };
    if (name === './workspace/validate-workspace') {
      return load(path.join(root, 'service/workspace/validate-workspace.ts'));
    }
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'exports', 'module', js)(
    require,
    module.exports,
    module,
  );
  const service = module.exports.default;

  service.validateAll();
  assert.deepEqual(validationStore.value.disables, []);
  workspaceStore.value.workspace.envs.push({ varName: 'ENV', value: 'other' });
  service.validate({ cat: 'env', index: 0 });
  assert.deepEqual(validationStore.value.disables, [
    { cat: 'env', index: 0 },
    { cat: 'env', index: 1 },
  ]);
  workspaceStore.value.workspace.envs[1].varName = 'OTHER';
  service.validate({ cat: 'env', index: 1 });
  assert.deepEqual(validationStore.value.disables, []);
});
