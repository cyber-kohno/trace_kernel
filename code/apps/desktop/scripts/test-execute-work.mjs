import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  path.join(app, '../../packages/runtime-core/src/execution/execute-work.ts'),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { executeCompiledWork, runWorkLifecycle } = module.exports;

test('compiled Work binds context and accepts explicit return or runtime exit', async () => {
  const values = [];
  const exit = new Error('runtime exit');
  const bindings = [
    { name: '$capture', value: (value) => values.push(value) },
    {
      name: '$runtime',
      value: {
        exit: () => {
          throw exit;
        },
      },
    },
  ];
  await executeCompiledWork(
    '$capture(1); return; $capture(2);',
    bindings,
    (error) => error === exit,
  );
  await executeCompiledWork(
    '$capture(3); $runtime.exit(); $capture(4);',
    bindings,
    (error) => error === exit,
  );
  assert.deepEqual(values, [1, 3]);
  await assert.rejects(
    executeCompiledWork('throw new Error("failure")', bindings, () => false),
    /failure/,
  );
});

test('execution failure still waits for registration and output cleanup', async () => {
  const calls = [];
  const first = new Error('execution failure');
  const outcome = await runWorkLifecycle({
    execute: () => {
      calls.push('execute');
      throw first;
    },
    waitForRegistrations: async () => {
      calls.push('registration');
      throw new Error('registration failure');
    },
    flushOutput: async () => {
      calls.push('flush');
    },
  });
  assert.deepEqual(calls, ['execute', 'registration', 'flush']);
  assert.deepEqual(outcome, { status: 'failed', error: first });
});

test('cleanup failures remain failures even when the thrown value is undefined', async () => {
  const outcome = await runWorkLifecycle({
    execute: async () => {},
    waitForRegistrations: () => {
      throw undefined;
    },
    flushOutput: async () => {},
  });
  assert.deepEqual(outcome, { status: 'failed', error: undefined });
  assert.deepEqual(
    await runWorkLifecycle({
      execute: async () => {},
      waitForRegistrations: async () => {},
      flushOutput: async () => {},
    }),
    { status: 'done' },
  );
});
