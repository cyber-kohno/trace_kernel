import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const programDir = 'src/app/contents/detail/program/';
const txDir = programDir + 'ui/tx/util/';
const tauriIOPath = 'src/app/infra/tauri/transaction-io.ts';

// Load production modules with only the external boundary replaced.
const load = (relative, mocks = {}) => {
  const cache = new Map();
  const loadFile = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (name) => {
      if (Object.hasOwn(mocks, name)) {
        return { __esModule: true, ...mocks[name] };
      }
      return name.startsWith('.')
        ? loadFile(path.resolve(path.dirname(file), name + '.ts'))
        : require(name);
    };
    new Function('require', 'exports', 'module', output)(
      localRequire,
      module.exports,
      module,
    );
    return module.exports;
  };
  return loadFile(path.join(appDir, relative)).default;
};

const root = 'C:\\fixture';
const filePath = root + '\\source.txt';
const destination = root + '\\renamed.txt';
const fileStat = {
  isFile: true,
  isDir: false,
  readonly: false,
  modifiedAt: 10,
  size: 8,
};
const directoryStat = { ...fileStat, isFile: false, isDir: true };

const createBoundary = (entries = new Map(), options = {}) => {
  const calls = [];
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (options.failCommand === command)
      throw new Error('Injected I/O failure');
    switch (command) {
      case 'exists_path':
        return entries.has(args.path);
      case 'stat': {
        const entry = entries.get(args.path);
        if (!entry) throw new Error('File not found');
        return entry.stat;
      }
      case 'read_dir':
        return entries.get(args.dir)?.children ?? [];
      case 'read_binary':
        return Array.from(
          new TextEncoder().encode(
            entries.get(args.filePath)?.content ?? 'original',
          ),
        );
      case 'save_binary':
      case 'delete_file':
      case 'delete_dir':
      case 'rename':
      case 'copy_file':
      case 'make_dir':
        return;
      default:
        throw new Error('Unknown command: ' + command);
    }
  };
  return { calls, mocks: { '@tauri-apps/api/core': { invoke } } };
};

const coreDir = programDir + 'runtime/transaction/';
const sharedDir = '../../packages/runtime-core/src/';

const loadVerifier = (mocks) =>
  load(coreDir + 'transaction-verify.ts').create(load(tauriIOPath, mocks));

// Keep row projection in this test adapter, not in the service.
const projectSession = (session, props) =>
  session.run((snapshot) => {
    if (snapshot.state === 'verifying' && !props.started) {
      props.started = true;
      props.setPhase('verify');
    }
    if (snapshot.state === 'committing' && !props.committing) {
      props.committing = true;
      props.setPhase('commit');
    }
    while (props.ticks < snapshot.completedCount) {
      props.ticks++;
      props.progressTick();
    }
    snapshot.operations.forEach(({ status }, index) => {
      props.rows[index].status = { ...status };
    });
  });

const loadExecutor = (mocks) => {
  const service = load(coreDir + 'transaction-service.ts');
  const io = load(tauriIOPath, mocks);
  const sessions = new WeakMap();
  return {
    run: (props) => {
      if (!sessions.has(props.rows)) {
        sessions.set(
          props.rows,
          service.create(
            props.rows.map((r) => r.order),
            io,
          ),
        );
      }
      return projectSession(sessions.get(props.rows), { ...props, ticks: 0 });
    },
  };
};

const createExecutor = (options = {}) => {
  const committed = [];
  const verified = [];
  const check = async (...args) => {
    verified.push(args);
    if (options.throwVerify) throw new Error('Verification unavailable');
    return options.verifyResult ?? { kind: 'checked' };
  };
  const apply = async (...args) => {
    committed.push(args);
    if (options.throwCommit) throw new Error('Commit unavailable');
    if (options.failAt === committed.length)
      throw new Error('Injected commit failure');
  };
  const io = {
    makeDir: apply,
    deleteDir: apply,
    copyFile: apply,
    saveText: apply,
    deleteFile: apply,
    renameFile: apply,
  };
  const service = load(coreDir + 'transaction-service.ts', {
    './transaction-verify': {
      default: {
        create: () => ({
          checkCreateDir: check,
          checkDeleteDir: check,
          checkCopyFile: check,
          checkSaveFile: check,
          checkExistsFile: check,
          checkModifyFile: check,
          checkRenameFile: check,
        }),
      },
    },
  });
  const phases = [];
  let ticks = 0;
  const sessions = new WeakMap();
  const run = (rows) => {
    if (!sessions.has(rows)) {
      sessions.set(
        rows,
        service.create(
          rows.map((r) => r.order),
          io,
        ),
      );
    }
    return projectSession(sessions.get(rows), {
      rows,
      ticks: 0,
      setPhase: (phase) => phases.push(phase),
      progressTick: () => ticks++,
    });
  };
  return { committed, verified, phases, run, getTicks: () => ticks };
};

const createRow = (name) => ({
  order: {
    type: 'create_file',
    path: root + '\\' + name,
    content: name,
    encoding: 'utf8',
    existVirtualDir: false,
  },
  status: {},
});

test('directory deletion survives VFS normalization', () => {
  const runtime = load(programDir + 'runtime/runtime-util.ts');
  const normalize = load(txDir + 'tx-plan-normalize.ts');
  const vfs = runtime.getInitialVfsState();
  vfs.dirTable.set(root, { path: root, intent: 'delete' });
  vfs.dirTable.set(root + '\\new', { path: root + '\\new', intent: 'create' });
  assert.deepEqual(normalize.convertVfsToOrder(vfs), [
    { type: 'delete_dir', path: root },
    { type: 'create_dir', path: root + '\\new' },
  ]);
});

test('file deletion calls the registered delete_file command', async () => {
  const boundary = createBoundary();
  const runner = load(tauriIOPath, boundary.mocks);
  assert.equal(await runner.deleteFile(filePath), undefined);
  assert.deepEqual(boundary.calls, [
    { command: 'delete_file', args: { path: filePath } },
  ]);
});

test('directory deletion uses the non-recursive delete_dir command', async () => {
  const boundary = createBoundary();
  const runner = load(tauriIOPath, boundary.mocks);
  assert.equal(await runner.deleteDir(root), undefined);
  assert.deepEqual(boundary.calls, [
    { command: 'delete_dir', args: { path: root } },
  ]);
});

test('rename verifies the same destination passed to commit', async () => {
  const boundary = createBoundary(
    new Map([
      [filePath, { stat: fileStat }],
      [destination, { stat: fileStat }],
    ]),
  );
  const verify = loadVerifier(boundary.mocks);
  const result = await verify.checkRenameFile(filePath, destination);
  assert.equal(result.kind, 'error');
  assert.ok(
    boundary.calls.some(
      (call) =>
        call.command === 'exists_path' && call.args.path === destination,
    ),
  );
});

test('rename accepts an unused destination and rejects the same path', async () => {
  const boundary = createBoundary(new Map([[filePath, { stat: fileStat }]]));
  const verify = loadVerifier(boundary.mocks);
  assert.deepEqual(await verify.checkRenameFile(filePath, destination), {
    kind: 'checked',
  });
  assert.equal(
    (await verify.checkRenameFile(filePath, filePath.toUpperCase())).kind,
    'error',
  );
});

test('only an existing empty directory passes deletion verification', async () => {
  for (const [entry, expected] of [
    [{ stat: directoryStat, children: [] }, 'checked'],
    [
      { stat: directoryStat, children: [{ name: 'keep.txt', isDir: false }] },
      'error',
    ],
    [{ stat: fileStat }, 'error'],
    [undefined, 'warn'],
  ]) {
    const boundary = createBoundary(new Map(entry ? [[root, entry]] : []));
    const verify = loadVerifier(boundary.mocks);
    assert.equal((await verify.checkDeleteDir(root)).kind, expected);
  }
});

test('directory deletion rejects root paths before calling I/O', async () => {
  const boundary = createBoundary();
  const verify = loadVerifier(boundary.mocks);
  assert.equal((await verify.checkDeleteDir('C:\\')).kind, 'error');
  assert.equal(boundary.calls.length, 0);
});

test('commit failure stops later writes and reports the partial outcome', async () => {
  const harness = createExecutor({ failAt: 2 });
  const rows = ['a.txt', 'b.txt', 'c.txt'].map(createRow);
  const result = await harness.run(rows);
  assert.equal(harness.committed.length, 2);
  assert.equal(result.kind, 'commit-failed');
  assert.equal(result.committedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(rows[0].status.commit.kind, 'success');
  assert.equal(rows[1].status.commit.kind, 'error');
  assert.equal(rows[2].status.commit.kind, 'skipped');
  assert.equal(harness.getTicks(), 2);
});

test('a rejected commit stops later writes too', async () => {
  const harness = createExecutor({ throwCommit: true });
  const rows = ['a.txt', 'b.txt'].map(createRow);
  const result = await harness.run(rows);
  assert.equal(result.kind, 'commit-failed');
  assert.equal(result.committedCount, 0);
  assert.equal(harness.committed.length, 1);
  assert.match(rows[0].status.commit.detail, /Commit unavailable/);
  assert.equal(rows[1].status.commit.kind, 'skipped');
});

for (const kind of ['error', 'warn']) {
  test(`verification ${kind} prevents all updates`, async () => {
    const harness = createExecutor({
      verifyResult: { kind, message: 'Blocked' },
    });
    const rows = ['a.txt', 'b.txt'].map(createRow);
    const result = await harness.run(rows);
    assert.equal(result.kind, 'verification-failed');
    assert.equal(harness.committed.length, 0);
    assert.deepEqual(harness.phases, ['verify']);
    assert.ok(rows.every((row) => row.status.commit === undefined));
  });
}

test('I/O rejection during verification produces a result without committing', async () => {
  const harness = createExecutor({ throwVerify: true });
  const rows = [createRow('a.txt')];
  const result = await harness.run(rows);
  assert.equal(result.kind, 'verification-failed');
  assert.equal(harness.committed.length, 0);
  assert.match(rows[0].status.verify.message, /Verification unavailable/);
});

test('successful execution verifies everything before the first update', async () => {
  const boundary = createBoundary(new Map([[root, { stat: directoryStat }]]));
  const executor = loadExecutor(boundary.mocks);
  const rows = ['a.txt', 'b.txt'].map(createRow);
  const result = await executor.run({
    rows,
    setPhase: () => {},
    progressTick: () => {},
  });
  assert.deepEqual(result, { kind: 'success', committedCount: 2 });
  const firstWrite = boundary.calls.findIndex(
    (call) => call.command === 'save_binary',
  );
  assert.ok(firstWrite > 0);
  assert.ok(
    boundary.calls
      .slice(firstWrite)
      .every((call) => call.command === 'save_binary'),
  );
  assert.ok(rows.every((row) => row.status.commit.kind === 'success'));
});

test('directory deletion reaches its own commit operation', async () => {
  const boundary = createBoundary(
    new Map([[root, { stat: directoryStat, children: [] }]]),
  );
  const executor = loadExecutor(boundary.mocks);
  const rows = [{ order: { type: 'delete_dir', path: root }, status: {} }];
  assert.equal(
    (await executor.run({ rows, setPhase: () => {}, progressTick: () => {} }))
      .kind,
    'success',
  );
  assert.ok(boundary.calls.some((call) => call.command === 'delete_dir'));
  assert.ok(!boundary.calls.some((call) => call.command === 'make_dir'));
});

test('a deleted directory cannot also receive staged file updates', async () => {
  const harness = createExecutor();
  const rows = [
    { order: { type: 'delete_dir', path: root }, status: {} },
    createRow('a.txt'),
  ];
  assert.equal((await harness.run(rows)).kind, 'verification-failed');
  assert.equal(harness.committed.length, 0);
});

test('skipped updates are distinct from successful verification in the UI status', () => {
  const plan = load(txDir + 'tx-plan-util.ts');
  assert.equal(
    plan.getStatus({
      verify: { kind: 'checked' },
      commit: { kind: 'skipped', detail: 'Stopped' },
    }),
    'commit-skipped',
  );
});

const modifyOrder = () => ({
  type: 'modify_file',
  path: filePath,
  snapshot: { mtimeMs: 10, size: 8 },
  original: 'original',
  current: 'changed',
  encoding: 'utf8',
});

test('modification requires unchanged metadata and original content', async () => {
  for (const [entry, expected] of [
    [{ stat: fileStat, content: 'original' }, 'checked'],
    [{ stat: { ...fileStat, modifiedAt: 11 }, content: 'original' }, 'error'],
    [{ stat: { ...fileStat, size: 9 }, content: 'original' }, 'error'],
    [{ stat: fileStat, content: 'external' }, 'error'],
  ]) {
    const boundary = createBoundary(new Map([[filePath, entry]]));
    const verify = loadVerifier(boundary.mocks);
    assert.equal((await verify.checkModifyFile(modifyOrder())).kind, expected);
  }
});

test('a conflicting modification prevents all updates during verification', async () => {
  const boundary = createBoundary(
    new Map([
      [root, { stat: directoryStat }],
      [
        filePath,
        { stat: { ...fileStat, modifiedAt: 11 }, content: 'external' },
      ],
    ]),
  );
  const executor = loadExecutor(boundary.mocks);
  const rows = [createRow('a.txt'), { order: modifyOrder(), status: {} }];
  const result = await executor.run({
    rows,
    setPhase: () => {},
    progressTick: () => {},
  });
  assert.equal(result.kind, 'verification-failed');
  assert.ok(!boundary.calls.some((call) => call.command === 'save_binary'));
});

test('modification is checked again immediately before saving', async () => {
  const entries = new Map([
    [root, { stat: directoryStat }],
    [filePath, { stat: fileStat, content: 'original' }],
  ]);
  const boundary = createBoundary(entries);
  const invoke = boundary.mocks['@tauri-apps/api/core'].invoke;
  const executor = loadExecutor({
    '@tauri-apps/api/core': {
      invoke: async (command, args) => {
        const result = await invoke(command, args);
        if (command === 'save_binary') {
          entries.set(filePath, {
            stat: { ...fileStat, modifiedAt: 11 },
            content: 'external',
          });
        }
        return result;
      },
    },
  });
  const rows = [createRow('a.txt'), { order: modifyOrder(), status: {} }];
  const result = await executor.run({
    rows,
    setPhase: () => {},
    progressTick: () => {},
  });
  assert.equal(result.kind, 'commit-failed');
  assert.equal(result.committedCount, 1);
  assert.deepEqual(
    boundary.calls
      .filter((call) => call.command === 'save_binary')
      .map((call) => call.args.path),
    [root + '\\a.txt'],
  );
});

test('applied transactions cannot be replayed with the same status rows', async () => {
  const harness = createExecutor();
  const rows = [createRow('a.txt')];
  await harness.run(rows);
  await assert.rejects(harness.run(rows), /cannot be retried/);
  assert.equal(harness.committed.length, 1);
});

test('verification can be retried after fixing its input without stale errors', async () => {
  const entries = new Map();
  const boundary = createBoundary(entries);
  const executor = loadExecutor(boundary.mocks);
  const rows = [createRow('a.txt')];
  const run = () =>
    executor.run({ rows, setPhase: () => {}, progressTick: () => {} });
  assert.equal((await run()).kind, 'verification-failed');
  entries.set(root, { stat: directoryStat });
  assert.equal((await run()).kind, 'success');
});

test('public staged operations normalize, verify, and reach the correct I/O commands', async () => {
  const emptyDirectory = 'C:\\empty';
  const newDirectory = root + '\\new';
  const copySource = root + '\\copy.txt';
  const deleteTarget = root + '\\delete.txt';
  const renameSource = root + '\\old.txt';
  const boundary = createBoundary(
    new Map([
      [root, { stat: directoryStat }],
      [emptyDirectory, { stat: directoryStat, children: [] }],
      [filePath, { stat: fileStat, content: 'original' }],
      [copySource, { stat: fileStat }],
      [deleteTarget, { stat: fileStat }],
      [renameSource, { stat: fileStat }],
    ]),
  );
  const runtime = load(programDir + 'runtime/runtime-util.ts');
  const vfs = runtime.getInitialVfsState();
  const transaction = load(programDir + 'util/fs/tx/dcl-fs-transaction.ts', {
    '../worker-invoke': {
      default: { call: boundary.mocks['@tauri-apps/api/core'].invoke },
    },
  }).getObject(vfs);
  transaction.makeDir(newDirectory);
  transaction.saveText(newDirectory + '\\created.txt', 'created');
  const opened = await transaction.openText(filePath);
  transaction.updateText(opened.token, 'changed');
  transaction.copyFile(copySource, root + '\\copied.txt');
  transaction.deleteFile(deleteTarget);
  transaction.renameFile(renameSource, 'renamed.txt');
  transaction.deleteDir(emptyDirectory);

  const normalize = load(txDir + 'tx-plan-normalize.ts');
  const rows = normalize
    .convertVfsToOrder(vfs)
    .map((order) => ({ order, status: {} }));
  const executor = loadExecutor(boundary.mocks);
  const result = await executor.run({
    rows,
    setPhase: () => {},
    progressTick: () => {},
  });
  assert.deepEqual(result, { kind: 'success', committedCount: 7 });
  const mutations = new Set([
    'make_dir',
    'copy_file',
    'delete_file',
    'save_binary',
    'rename',
    'delete_dir',
  ]);
  assert.deepEqual(
    boundary.calls
      .filter((call) => mutations.has(call.command))
      .map((call) => call.command),
    [
      'make_dir',
      'copy_file',
      'delete_file',
      'save_binary',
      'save_binary',
      'rename',
      'delete_dir',
    ],
  );
  assert.ok(rows.every((row) => row.status.commit.kind === 'success'));
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createMemoryIO = () => {
  const calls = [];
  const entries = new Map([[root, { stat: directoryStat }]]);
  const io = {
    existsPath: async (path) => entries.has(path),
    stat: async (path) => {
      if (!entries.has(path)) throw new Error('Missing path');
      return { ...entries.get(path).stat };
    },
    readDirectory: async (path) => entries.get(path).children ?? [],
    readText: async (path) => entries.get(path).content,
    saveText: async (path, content, encoding) => {
      calls.push({ path, content, encoding });
      entries.set(path, { stat: { ...fileStat }, content });
    },
    makeDir: async (path) => entries.set(path, { stat: directoryStat }),
    deleteFile: async (path) => entries.delete(path),
    deleteDir: async (path) => entries.delete(path),
    renameFile: async (from, to) => {
      entries.set(to, entries.get(from));
      entries.delete(from);
    },
    copyFile: async (from, to) => entries.set(to, { ...entries.get(from) }),
  };
  return { io, calls, entries };
};

const createHeadless = (orders, io) =>
  load(coreDir + 'transaction-service.ts').create(orders, io);

test('the service runs without UI rows, observers, or a Tauri host', async () => {
  const memory = createMemoryIO();
  const session = createHeadless([createRow('headless.txt').order], memory.io);
  assert.equal(session.getSnapshot().state, 'idle');
  assert.deepEqual(await session.run(), { kind: 'success', committedCount: 1 });
  assert.equal(session.getSnapshot().state, 'succeeded');
  assert.equal(
    memory.entries.get(root + '\\headless.txt').content,
    'headless.txt',
  );
  await assert.rejects(session.run(), /cannot be retried/);
  assert.equal(memory.calls.length, 1);
});

test('a session rejects concurrent execution while verification is awaiting I/O', async () => {
  const memory = createMemoryIO();
  const gate = deferred();
  const existsPath = memory.io.existsPath;
  memory.io.existsPath = async (path) => {
    await gate.promise;
    return existsPath(path);
  };
  const session = createHeadless([createRow('once.txt').order], memory.io);
  const running = session.run();
  assert.equal(session.getSnapshot().state, 'verifying');
  await assert.rejects(session.run(), /running/);
  gate.resolve();
  assert.equal((await running).kind, 'success');
  assert.equal(memory.calls.length, 1);
});

test('a session also rejects concurrent execution while applying a mutation', async () => {
  const memory = createMemoryIO();
  const entered = deferred();
  const gate = deferred();
  const saveText = memory.io.saveText;
  memory.io.saveText = async (...args) => {
    entered.resolve();
    await gate.promise;
    await saveText(...args);
  };
  const session = createHeadless([createRow('once.txt').order], memory.io);
  const running = session.run();
  await entered.promise;
  assert.equal(session.getSnapshot().state, 'committing');
  await assert.rejects(session.run(), /running/);
  gate.resolve();
  await running;
  assert.equal(memory.calls.length, 1);
});

test('a session owns a frozen copy of the plan and modification snapshot', async () => {
  const memory = createMemoryIO();
  memory.entries.set(filePath, { stat: fileStat, content: 'original' });
  const order = modifyOrder();
  const input = [order];
  const session = createHeadless(input, memory.io);
  order.path = destination;
  order.current = 'unexpected';
  order.snapshot.mtimeMs = 999;
  input.push(createRow('unexpected.txt').order);
  const initial = session.getSnapshot();
  assert.equal(initial.operations.length, 1);
  assert.throws(() => {
    initial.operations[0].order.path = destination;
  }, TypeError);
  assert.throws(() => {
    initial.operations[0].order.snapshot.size = 100;
  }, TypeError);
  assert.equal((await session.run()).kind, 'success');
  assert.equal(memory.entries.get(filePath).content, 'changed');
  assert.ok(!memory.entries.has(destination));
});

test('observer failures do not interrupt writes or alter the recorded result', async () => {
  const memory = createMemoryIO();
  const session = createHeadless(
    ['one.txt', 'two.txt'].map((name) => createRow(name).order),
    memory.io,
  );
  let notifications = 0;
  const result = await session.run(() => {
    notifications++;
    throw new Error('Display unavailable');
  });
  assert.deepEqual(result, { kind: 'success', committedCount: 2 });
  assert.equal(session.getSnapshot().result, result);
  assert.equal(memory.calls.length, 2);
  assert.ok(notifications > 2);
});

test('snapshots cannot be used to forge results or mutate earlier notifications', async () => {
  const memory = createMemoryIO();
  const session = createHeadless([createRow('one.txt').order], memory.io);
  const snapshots = [];
  const result = await session.run((snapshot) => snapshots.push(snapshot));
  const duringVerify = snapshots.find((s) => s.state === 'verifying');
  assert.equal(duringVerify.operations[0].status.commit, undefined);
  const final = session.getSnapshot();
  assert.throws(() => {
    final.operations[0].status.commit.kind = 'error';
  }, TypeError);
  assert.throws(() => {
    final.operations[0].status = {};
  }, TypeError);
  assert.throws(() => {
    result.kind = 'commit-failed';
  }, TypeError);
  assert.equal(
    session.getSnapshot().operations[0].status.commit.kind,
    'success',
  );
});

test('partial failure is terminal even when no mutation succeeded', async () => {
  const memory = createMemoryIO();
  memory.io.saveText = async () => {
    throw new Error('Storage unavailable');
  };
  const session = createHeadless(
    ['one.txt', 'two.txt'].map((name) => createRow(name).order),
    memory.io,
  );
  const result = await session.run();
  assert.equal(result.kind, 'commit-failed');
  assert.equal(result.committedCount, 0);
  assert.equal(session.getSnapshot().state, 'commit-failed');
  assert.equal(
    session.getSnapshot().operations[1].status.commit.kind,
    'skipped',
  );
  await assert.rejects(session.run(), /cannot be retried/);
});

test('the service retries verification failures without importing UI state', async () => {
  const memory = createMemoryIO();
  memory.entries.clear();
  const session = createHeadless([createRow('one.txt').order], memory.io);
  const first = await session.run();
  assert.equal(first.kind, 'verification-failed');
  assert.equal(session.getSnapshot().state, 'verification-failed');
  assert.equal(memory.calls.length, 0);
  memory.entries.set(root, { stat: directoryStat });
  assert.equal((await session.run()).kind, 'success');
  assert.equal(first.kind, 'verification-failed');
  assert.equal(
    session.getSnapshot().operations[0].status.verify.kind,
    'checked',
  );
});

test('operation results retain input order while mutations use execution priority', async () => {
  const memory = createMemoryIO();
  const directory = root + '\\new';
  const file = { ...createRow('one.txt').order, path: directory + '\\one.txt' };
  const session = createHeadless(
    [file, { type: 'create_dir', path: directory }],
    memory.io,
  );
  assert.equal((await session.run()).kind, 'success');
  assert.equal(session.getSnapshot().operations[0].order.type, 'create_file');
  assert.equal(session.getSnapshot().operations[1].order.type, 'create_dir');
  assert.ok(memory.entries.has(file.path));
});

test('an empty transaction succeeds without I/O', async () => {
  const session = createHeadless(
    [],
    new Proxy(
      {},
      {
        get: () => () => {
          throw new Error('Unexpected I/O');
        },
      },
    ),
  );
  assert.deepEqual(await session.run(), { kind: 'success', committedCount: 0 });
  assert.equal(session.getSnapshot().completedCount, 0);
});

test('Desktop creates the same service with its Tauri I/O adapter', async () => {
  const boundary = createBoundary(new Map([[root, { stat: directoryStat }]]));
  const desktop = load(txDir + 'tx-executor.ts', boundary.mocks);
  const session = desktop.createSession([createRow('desktop.txt').order]);
  assert.deepEqual(await session.run(), { kind: 'success', committedCount: 1 });
  assert.equal(session.getSnapshot().state, 'succeeded');
  assert.equal(
    boundary.calls.filter((call) => call.command === 'save_binary').length,
    1,
  );
});

test('starting a retry from a terminal notification cannot replace the previous report', async () => {
  const memory = createMemoryIO();
  memory.entries.clear();
  const session = createHeadless([createRow('retry.txt').order], memory.io);
  let retry;
  const first = await session.run((snapshot) => {
    if (snapshot.state !== 'verification-failed') return;
    memory.entries.set(root, { stat: directoryStat });
    retry = session.run();
  });
  assert.equal(first.kind, 'verification-failed');
  assert.equal((await retry).kind, 'success');
  assert.equal(memory.calls.length, 1);
});

for (const encoding of ['utf8', 'sjis']) {
  test(
    'Tauri text I/O retains ' + encoding + ' encoding at the port boundary',
    async () => {
      const bytes = encoding === 'utf8' ? [0xe3, 0x81, 0x82] : [0x82, 0xa0];
      const calls = [];
      const io = load(tauriIOPath, {
        '@tauri-apps/api/core': {
          invoke: async (command, args) => {
            calls.push({ command, args });
            if (command === 'read_binary') return bytes;
          },
        },
      });
      const text = await io.readText(filePath, encoding);
      assert.equal(text, String.fromCodePoint(0x3042));
      await io.saveText(destination, text, encoding);
      assert.deepEqual(calls, [
        { command: 'read_binary', args: { filePath } },
        {
          command: 'save_binary',
          args: { path: destination, bytes: new Uint8Array(bytes) },
        },
      ]);
    },
  );
}

test('shared filesystem instances keep native transport and VFS histories separate', async () => {
  const filesystem = load(sharedDir + 'api/fs/dcl-file-system.ts');
  const runtime = load(sharedDir + 'execution/runtime-cache.ts');
  const normalize = load(sharedDir + 'transaction/tx-plan-normalize.ts');
  const makeInstance = (content, modifiedAt) => {
    const calls = [];
    const cache = {
      vfs: null,
      createVFS() {
        this.vfs = runtime.getInitialVfsState();
        return this.vfs;
      },
    };
    const api = filesystem.getObject(cache, {
      call: async (command, args) => {
        calls.push({ command, args });
        if (command === 'stat') return { ...fileStat, modifiedAt };
        if (command === 'read_binary')
          return [...new TextEncoder().encode(content)];
        throw new Error('Unexpected native command: ' + command);
      },
    });
    return { api, cache, calls };
  };
  const first = makeInstance('first', 11);
  const second = makeInstance('second', 22);
  const firstTx = first.api.useTransaction();
  const secondTx = second.api.useTransaction();
  const [a, b] = await Promise.all([
    firstTx.openText(filePath),
    secondTx.openText(filePath),
  ]);
  assert.equal(a.content, 'first');
  assert.equal(b.content, 'second');
  firstTx.updateText(a.token, 'changed');
  assert.throws(
    () => secondTx.updateText(a.token, 'wrong'),
    /invalid file token/,
  );
  assert.deepEqual(normalize.convertVfsToOrder(second.cache.vfs), []);
  const orders = normalize.convertVfsToOrder(first.cache.vfs);
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0], {
    type: 'modify_file',
    path: filePath,
    original: 'first',
    current: 'changed',
    encoding: 'utf8',
    snapshot: { mtimeMs: 11, size: 8 },
  });
  assert.throws(() => first.api.useTransaction(), /only be called once/);
  for (const instance of [first, second]) {
    assert.deepEqual(
      instance.calls.map((c) => c.command),
      ['stat', 'read_binary'],
    );
  }
});

test('shared direct and staged text reads reject oversized files before reading bytes', async () => {
  const filesystem = load(sharedDir + 'api/fs/dcl-file-system.ts');
  const runtime = load(sharedDir + 'execution/runtime-cache.ts');
  const calls = [];
  const cache = {
    vfs: null,
    createVFS() {
      this.vfs = runtime.getInitialVfsState();
      return this.vfs;
    },
  };
  const api = filesystem.getObject(cache, {
    call: async (command) => {
      calls.push(command);
      assert.equal(command, 'stat');
      return { ...fileStat, size: 50 * 1024 * 1024 + 1 };
    },
  });
  await assert.rejects(
    api.readText(filePath),
    /readText\(\).*larger than 50.0 MB/,
  );
  await assert.rejects(
    api.useTransaction().openText(filePath),
    /openText\(\).*larger than 50.0 MB/,
  );
  assert.deepEqual(calls, ['stat', 'stat']);
  assert.equal(cache.vfs.pathIndex.size, 0);
  assert.equal(cache.vfs.fileTable.size, 0);
});

test('a rejected native staged read leaves no token or transaction order', async () => {
  const transaction = load(sharedDir + 'api/fs/tx/dcl-fs-transaction.ts');
  const real = load(sharedDir + 'api/fs/real-fs-writer.ts');
  const runtime = load(sharedDir + 'execution/runtime-cache.ts');
  const normalize = load(sharedDir + 'transaction/tx-plan-normalize.ts');
  const vfs = runtime.getInitialVfsState();
  const calls = [];
  const tx = transaction.getObject(
    vfs,
    real.create({
      call: async (command) => {
        calls.push(command);
        if (command === 'stat') return fileStat;
        throw new Error('Read unavailable');
      },
    }),
  );
  await assert.rejects(tx.openText(filePath), /Read unavailable/);
  assert.deepEqual(calls, ['stat', 'read_binary']);
  assert.equal(vfs.pathIndex.size, 0);
  assert.equal(vfs.fileTable.size, 0);
  assert.deepEqual(normalize.convertVfsToOrder(vfs), []);
});

test('core dependency graph contains no UI, Tauri, store, or external imports', () => {
  const visited = new Set();
  const visit = (relative) => {
    if (visited.has(relative)) return;
    visited.add(relative);
    const source = readFileSync(path.join(appDir, relative), 'utf8');
    const parsed = ts.createSourceFile(
      relative,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of parsed.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        continue;
      if (!statement.moduleSpecifier) continue;
      const name = statement.moduleSpecifier.text;
      assert.ok(name.startsWith('.'), 'External dependency: ' + name);
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(relative), name + '.ts'),
      );
      assert.ok(
        dependency.startsWith(sharedDir),
        'Unexpected dependency: ' + dependency,
      );
      visit(dependency);
    }
  };
  visit(coreDir + 'transaction-service.ts');
  assert.ok(visited.has(sharedDir + 'transaction/transaction-io.ts'));
  assert.ok(visited.has(sharedDir + 'transaction/transaction-model.ts'));
});
