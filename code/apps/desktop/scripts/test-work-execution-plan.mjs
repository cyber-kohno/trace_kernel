import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(
  app,
  '../../packages/runtime-core/src/execution/work-execution-plan.ts',
);
const js = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('require', 'exports', 'module', js)(
  (name) => {
    throw new Error(`Execution plan imported a runtime dependency: ${name}`);
  },
  module.exports,
  module,
);
const {
  createWorkExecutionPlan,
  compileWorkExecution,
  selectContextData,
  selectReservedApis,
} = module.exports;

const workspace = {
  envs: [{ varName: 'GOOD' }, { varName: 'BAD' }],
  resources: [{ varName: 'resource' }],
  datasets: [{ varName: 'dataset' }],
  processes: [{ funcName: 'process' }],
  logics: [{ name: 'logic' }],
};
const disables = [{ cat: 'env', index: 1 }];

test('execution selection excludes invalid entries and professional-only capabilities', () => {
  assert.deepEqual(selectContextData(workspace, disables, false), {
    envs: [workspace.envs[0]],
    resources: workspace.resources,
    datasets: workspace.datasets,
    processes: [],
    logics: [],
  });
  assert.deepEqual(selectReservedApis('plain', false), [
    'print',
    'println',
    'runtime',
    'state',
    'parser',
  ]);
  assert.deepEqual(selectReservedApis('channel', true), [
    'channel',
    'runtime',
    'state',
    'parser',
    'fs',
    'net',
  ]);
});

test('plan compilation uses one permission decision for Worker input', () => {
  const plan = createWorkExecutionPlan({
    workspace,
    work: { name: 'sample', method: 'channel', source: 'return 1;' },
    disables: [...disables, { cat: 'logic', index: 0 }],
    professional: true,
  });
  assert.deepEqual(plan.contextData.logics, []);
  assert.deepEqual(plan.contextData.processes, workspace.processes);
  let compiledSource = '';
  const prepared = compileWorkExecution(plan, (source) => {
    compiledSource = source;
    return { outputText: 'return 1;', sourceMapText: '{}' };
  });
  assert.equal(compiledSource, 'return 1;');
  assert.deepEqual(prepared, {
    outputText: 'return 1;',
    sourceMapText: '{}',
    contextData: plan.contextData,
    usableUtils: plan.usableUtils,
    outputMethod: 'channel',
  });
  assert.throws(
    () => compileWorkExecution(plan, () => ({ outputText: '' })),
    /source map/,
  );
});
