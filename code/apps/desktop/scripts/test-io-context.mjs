import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requirePackage = createRequire(import.meta.url);
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
    if (name === 'encoding-japanese') return requirePackage(name);
    assert.ok(name.startsWith('.'), `Unexpected host dependency: ${name}`);
    return load(path.resolve(path.dirname(file), name + '.ts'));
  };
  new Function('require', 'exports', 'module', js)(
    require,
    module.exports,
    module,
  );
  return module.exports;
};

const { createIoContext } = load(
  path.join(app, 'src/app/service/execution/create-io-context.ts'),
);
const { createWorkContext } = load(
  path.join(app, 'src/app/service/execution/create-work-context.ts'),
);
const { prepareDatasetTargets } = load(
  path.join(app, 'src/app/service/execution/prepare-dataset-targets.ts'),
);
const { runPreparedWork } = load(
  path.join(app, 'src/app/service/execution/run-work.ts'),
);
const { createReservedApi, createStateApi } = load(
  path.join(app, 'src/app/service/execution/create-reserved-api.ts'),
);
const { createWorkExecutionPlan, compileWorkExecution } = load(
  path.join(app, 'src/app/service/execution/work-execution-plan.ts'),
);
const empty = () => ({
  envs: [{ varName: 'ROOT', value: 'C:/data' }],
  resources: [],
  datasets: [],
  processes: [],
  logics: [],
});

test('dataset content uses the injected read port after target preparation', async () => {
  const data = empty();
  data.datasets.push({
    varName: 'DATASET',
    rootPath: '%ROOT%',
    encoding: 'utf8',
    targets: null,
  });
  const reads = [];
  const context = createIoContext(
    data,
    [{ key: 'DATASET', targets: ['\\sub\\one.txt'] }],
    {
      readTextFile: async (request) => {
        reads.push(request);
        return 'content';
      },
      runProcess: async () => {
        throw new Error('unexpected process call');
      },
    },
  );
  const file = context.datasets[0].value[0];
  assert.deepEqual(reads, []);
  assert.deepEqual(
    [file.fileName, file.absolutePath, file.relativePath],
    ['one.txt', 'C:/data\\sub\\one.txt', '\\sub\\one.txt'],
  );
  assert.equal(await file.content(), 'content');
  assert.deepEqual(reads, [
    { filePath: 'C:/data\\sub\\one.txt', encoding: 'utf8' },
  ]);
  assert.throws(() =>
    createIoContext(data, [], {
      readTextFile: async () => '',
      runProcess: async () => ({}),
    }),
  );
});

test('dataset preparation scans dynamic roots concurrently and retains dataset order', async () => {
  const requests = [];
  let finishFirst;
  const firstScan = new Promise((resolve) => {
    finishFirst = resolve;
  });
  const data = empty();
  data.envs = [{ varName: 'ROOT', value: 'C:/data' }];
  data.datasets = [
    {
      varName: 'first',
      rootPath: '%ROOT%/one',
      scanOption: { dirConds: [], fileConds: [], limitDepth: 2 },
      targets: null,
    },
    {
      varName: 'static',
      rootPath: '%ROOT%/static',
      scanOption: { dirConds: [], fileConds: [] },
      targets: ['\\fixed.txt'],
    },
    {
      varName: 'second',
      rootPath: '%ROOT%/two',
      scanOption: { dirConds: [], fileConds: [] },
      targets: null,
    },
  ];
  const prepared = prepareDatasetTargets(data, {
    scanDirectory: (request) => {
      requests.push(request);
      if (request.rootPath.endsWith('/one')) return firstScan;
      return Promise.resolve({ node: { name: 'root', children: [] } });
    },
  });
  assert.deepEqual(
    requests.map((request) => request.rootPath),
    ['C:/data/one', 'C:/data/two'],
  );
  assert.equal(requests[0].limitDepth, 2);
  finishFirst({
    node: {
      name: 'root',
      children: [
        { name: 'one.txt', children: null },
        { name: 'empty', children: [] },
      ],
    },
  });
  assert.deepEqual(await prepared, [
    { key: 'first', targets: ['\\one.txt'] },
    { key: 'second', targets: [] },
  ]);
});

test('process context validates arguments and uses the injected process port', async () => {
  const data = empty();
  data.processes.push({
    funcName: 'run',
    prgPath: '%ROOT%/program',
    scriptArgs: [{ name: 'count', type: 'number' }],
    cmdArgs: ['--count', '__count__'],
    cwd: '%ROOT%',
    stdin: '__count__',
    timeout: 25_000,
    encoding: { stdin: 'utf8', stdout: 'utf8', stderr: 'utf8' },
  });
  const calls = [];
  const context = createIoContext(data, [], {
    readTextFile: async () => {
      throw new Error('unexpected file read');
    },
    runProcess: async (request) => {
      calls.push(request);
      return { stdout: [111, 107], stderr: [101, 114, 114], exitCode: 7 };
    },
  });
  const run = context.processes[0].value;
  await assert.rejects(run('wrong'), /Argument types/);
  assert.deepEqual(calls, []);
  assert.deepEqual(await run(3), { stdout: 'ok', stderr: 'err', exitCode: 7 });
  assert.deepEqual(calls, [
    {
      program: 'C:/data/program',
      args: ['--count', '3'],
      cwd: 'C:/data',
      stdin: '3',
      timeoutMs: 25_000,
      stdinEncoding: 'utf8',
    },
  ]);
});

test('work context builds env, resource, and linked logic from host ports', () => {
  const data = empty();
  data.envs = [{ varName: 'BASE', value: '4' }];
  data.resources = [
    { varName: 'rows', source: 'amount\n2\n3', parse: 'csv' },
    { varName: 'raw', source: 'plain text' },
  ];
  data.logics = [
    {
      name: 'helper',
      source: 'export default function(n: number) { return n * 2; }',
    },
    {
      name: 'total',
      source:
        'export default function() { return $logic.helper($resource.rows[0].amount + $resource.rows[1].amount) + Number($env.BASE) + $parser.offset; }',
    },
  ];
  let parserCreations = 0;
  const compiled = [];
  const entries = createWorkContext(data, [], {
    readTextFile: async () => {
      throw new Error('unexpected file read');
    },
    runProcess: async () => {
      throw new Error('unexpected process call');
    },
    createParserObject: () => {
      parserCreations++;
      return { offset: 1 };
    },
    transpileLogic: (source) => {
      compiled.push(source);
      return ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText;
    },
  });
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['$env', '$resource', '$dataset', '$process', '$logic'],
  );
  const context = Object.fromEntries(
    entries.map((entry) => [entry.name, entry.value]),
  );
  assert.deepEqual(context.$env, { BASE: '4' });
  assert.deepEqual(context.$resource.rows, [{ amount: 2 }, { amount: 3 }]);
  assert.equal(context.$resource.raw, 'plain text');
  assert.equal(parserCreations, 1);
  assert.deepEqual(compiled, []);
  assert.equal(context.$logic.total(), 15);
  assert.equal(compiled.length, 2);
  assert.equal(context.$logic.helper(2), 4);
  assert.equal(compiled.length, 3);
});

test('work context reports a logic without a default function', () => {
  const data = empty();
  data.logics = [{ name: 'missing', source: 'export const value = 1;' }];
  const entries = createWorkContext(data, [], {
    readTextFile: async () => '',
    runProcess: async () => ({ stdout: [], stderr: [], exitCode: 0 }),
    createParserObject: () => ({}),
    transpileLogic: (source) =>
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
  });
  const logic = entries.find((entry) => entry.name === '$logic').value;
  assert.throws(() => logic.missing(), /did not export a function/);
});

test('a host runs the selected plan through preparation, context, APIs and output completion', async () => {
  const calls = [],
    output = [],
    states = [];
  const workspace = empty();
  workspace.resources = [{ varName: 'rows', source: 'n\n2', parse: 'csv' }];
  workspace.datasets = [
    {
      varName: 'DATA',
      rootPath: '%ROOT%',
      targets: null,
      encoding: 'utf8',
      scanOption: { dirConds: [], fileConds: [] },
    },
  ];
  workspace.logics = [
    {
      name: 'read',
      source:
        'export default async function() { return $env.ROOT + ":" + await $dataset.DATA[0].content() + ":" + $resource.rows[0].n; }',
    },
  ];
  const transpile = (source) =>
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        sourceMap: true,
        target: ts.ScriptTarget.ES2020,
      },
    });
  const plan = createWorkExecutionPlan({
    workspace,
    work: {
      method: 'plain',
      source: '$println(await $logic.read()); $state.useProgress(2).tick();',
    },
    disables: [],
    professional: true,
  });
  const ports = {
    readTextFile: async (request) => {
      calls.push('read');
      assert.equal(request.filePath, 'C:/data\\source.txt');
      return 'contents';
    },
    runProcess: async () => {
      throw new Error('unexpected process');
    },
    createParserObject: () => ({}),
    transpileLogic: (source) => transpile(source).outputText,
  };
  const apiPorts = {
    plainChannelId: '__plain__',
    appendLines: (id, lines) => output.push({ id, lines }),
    registerChannel: () => {
      throw new Error('unexpected channel');
    },
    createRuntime: () => ({}),
    createFileSystem: () => ({}),
    createNetwork: () => ({}),
    createParser: () => ({}),
    createState: () =>
      createStateApi({ current: 0 }, (event) => states.push(event)),
  };
  const outcome = await runPreparedWork(compileWorkExecution(plan, transpile), {
    initialize: () => {
      calls.push('initialize');
    },
    createReservedApi: (name) => createReservedApi(name, apiPorts),
    scanDirectory: async (request) => {
      calls.push('scan');
      assert.equal(request.rootPath, 'C:/data');
      return {
        node: {
          name: 'root',
          children: [{ name: 'source.txt', children: null }],
        },
      };
    },
    onPrepared: () => {
      calls.push('prepared');
    },
    prepareOutput: () => {
      calls.push('output');
    },
    createContext: (data, datasets) => createWorkContext(data, datasets, ports),
    isExitSignal: () => false,
    waitForRegistrations: () => {
      calls.push('registration');
    },
    flushOutput: () => {
      calls.push('flush');
    },
  });
  assert.deepEqual(outcome, { status: 'done' });
  assert.deepEqual(calls, [
    'initialize',
    'scan',
    'prepared',
    'output',
    'read',
    'registration',
    'flush',
  ]);
  assert.deepEqual(output, [
    { id: '__plain__', lines: ['C:/data:contents:2', ''] },
  ]);
  assert.deepEqual(states, [
    { type: 'state', method: 'progress_start', total: 2 },
    { type: 'state', method: 'progress_tick' },
  ]);
});

test('reserved channel API validates columns before registration and emits production batches', () => {
  const registered = [],
    output = [];
  const channel = createReservedApi('channel', {
    registerChannel: (definition) => registered.push(definition),
    appendLines: (id, lines) => output.push({ id, lines }),
  });
  assert.throws(
    () => channel.createTableStream('bad', [{ name: 'n' }, { name: 'n' }]),
    /Column names must be unique/,
  );
  assert.deepEqual(registered, []);
  const cols = [{ name: 'n', type: 'number' }];
  channel.createTableStream('table', cols).add({ n: 2 });
  channel.createTextStream('text').println('a\nb');
  assert.deepEqual(registered, [
    { id: 'table', view: 'table', detail: cols },
    { id: 'text', view: 'text', detail: {} },
  ]);
  assert.deepEqual(output, [
    { id: 'table', lines: ['{"n":2}', ''] },
    { id: 'text', lines: ['a', 'b', ''] },
  ]);
});
