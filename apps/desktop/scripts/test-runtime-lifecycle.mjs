import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const program = path.join(app, 'src/app/contents/detail/program');
const load = (relative, mocks = {}, globals = {}) => {
  const cache = new Map();
  const read = (file) => {
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
      if (Object.hasOwn(mocks, name))
        return { __esModule: true, default: mocks[name], ...mocks[name] };
      assert.ok(name.startsWith('.'), `Unexpected dependency: ${name}`);
      return read(path.resolve(path.dirname(file), name + '.ts'));
    };
    new Function(
      'require',
      'exports',
      'module',
      ...Object.keys(globals),
      js.replaceAll(
        'import.meta.url',
        JSON.stringify(pathToFileURL(file).href),
      ),
    )(require, module.exports, module, ...Object.values(globals));
    return module.exports;
  };
  return read(path.join(program, relative));
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const schedulerFixture = (append = async () => {}) => {
  const queues = new Map();
  const saved = [];
  const notified = [];
  const { createFlushScheduler } = load('runtime/stream-flush.ts');
  const scheduler = createFlushScheduler({
    getBatches: (id) => queues.get(id)?.splice(0) ?? [],
    appendToRuntime: async (id, batches) => {
      await append(id, batches);
      saved.push([id, batches]);
    },
    notifyUI: (id) => notified.push(id),
    hasAnyPending: () => [...queues.values()].some((q) => q.length),
    getActiveChannelIds: () => [...queues.keys()],
  });
  const push = (id, value) => {
    if (!queues.has(id)) queues.set(id, []);
    queues.get(id).push([value]);
    scheduler.schedule(id);
  };
  return { scheduler, queues, saved, notified, push };
};

test('finish waits for an in-flight append and later batches on multiple channels', async () => {
  const gate = deferred();
  let calls = 0;
  const f = schedulerFixture(async () => {
    if (++calls === 1) await gate.promise;
  });
  f.push('a', 'first');
  await turn();
  f.push('a', 'second');
  f.push('b', 'third');
  let finished = false;
  const finish = f.scheduler.finish().then(() => {
    finished = true;
  });
  await turn();
  assert.equal(finished, false);
  gate.resolve();
  await finish;
  assert.deepEqual(f.saved, [
    ['a', [['first']]],
    ['a', [['second']]],
    ['b', [['third']]],
  ]);
  assert.deepEqual(f.notified, ['a', 'a', 'b']);
  assert.throws(() => f.scheduler.schedule('a'), /closed/);
  await f.scheduler.finish();
});

test('background append failure is sticky and never silently retried', async () => {
  let calls = 0;
  const f = schedulerFixture(async () => {
    calls++;
    throw new Error('disk failed');
  });
  f.push('a', 'line');
  await turn();
  await assert.rejects(f.scheduler.finish(), /disk failed/);
  await assert.rejects(f.scheduler.finish(), /disk failed/);
  assert.equal(calls, 1);
  assert.deepEqual(f.notified, []);
});

test('dispose during append suppresses notification and remaining channels', async () => {
  const gate = deferred();
  const f = schedulerFixture(() => gate.promise);
  f.push('a', 'first');
  f.push('b', 'second');
  await turn();
  f.scheduler.dispose();
  f.scheduler.dispose();
  gate.resolve();
  await assert.rejects(f.scheduler.finish(), /disposed/);
  assert.deepEqual(f.notified, []);
  assert.equal(f.saved.length, 1);
});

test('empty output finishes without native calls', async () => {
  const f = schedulerFixture();
  await f.scheduler.finish();
  assert.deepEqual(f.saved, []);
});

const shutdownFixture = (options = {}) => {
  const calls = [],
    states = [];
  const { default: Shutdown } = load(
    '../../../service/lifecycle/application-shutdown.ts',
  );
  const participant = (name) => () => {
    calls.push(name);
    return options[name]?.() ?? Promise.resolve();
  };
  const shutdown = Shutdown.create({
    needsConfirmation: () => options.dirty ?? false,
    confirmClose: async () => {
      calls.push('confirm');
      return options.confirm ? options.confirm() : true;
    },
    shutdownNative: participant('native'),
    stopWorkers: participant('workers'),
    stopMcp: participant('mcp'),
    closeWindow: async () => {
      calls.push('close');
      assert.equal(shutdown.canCloseWindow(), true);
      await options.close?.();
    },
    onState: (phase, error) => {
      states.push([phase, error]);
      options.onState?.(phase, error);
    },
  });
  return { shutdown, calls, states };
};

test('normal application close starts every participant and waits for the last release', async () => {
  const native = deferred(),
    workers = deferred(),
    mcp = deferred();
  const f = shutdownFixture({
    native: () => native.promise,
    workers: () => workers.promise,
    mcp: () => mcp.promise,
  });
  const closing = f.shutdown.requestClose();
  assert.deepEqual(f.calls, ['native', 'workers', 'mcp']);
  assert.equal(f.shutdown.isStopping(), true);
  assert.equal(f.shutdown.canCloseWindow(), false);
  native.resolve();
  workers.resolve();
  await turn();
  assert.equal(f.shutdown.getPhase(), 'stopping');
  mcp.resolve();
  await closing;
  assert.deepEqual(f.calls, ['native', 'workers', 'mcp', 'close']);
  assert.deepEqual(
    f.states.map(([phase]) => phase),
    ['stopping', 'closing', 'closed'],
  );
  await f.shutdown.requestClose();
  assert.equal(f.calls.length, 4);
});

test('declined unsaved confirmation leaves admission open and permits a later approved close', async () => {
  let approved = false;
  const f = shutdownFixture({ dirty: true, confirm: () => approved });
  await f.shutdown.requestClose();
  assert.deepEqual(f.calls, ['confirm']);
  assert.equal(f.shutdown.isStopping(), false);
  assert.equal(f.shutdown.getPhase(), 'idle');
  approved = true;
  await f.shutdown.requestClose();
  assert.deepEqual(f.calls, [
    'confirm',
    'confirm',
    'native',
    'workers',
    'mcp',
    'close',
  ]);
});

test('duplicate close cannot bypass pending confirmation or pending native cleanup', async () => {
  const confirmation = deferred(),
    native = deferred();
  const f = shutdownFixture({
    dirty: true,
    confirm: () => confirmation.promise,
    native: () => native.promise,
  });
  const closing = f.shutdown.requestClose();
  assert.equal(closing, f.shutdown.requestClose());
  assert.deepEqual(f.calls, ['confirm']);
  confirmation.resolve(true);
  await turn();
  assert.equal(closing, f.shutdown.requestClose());
  assert.equal(f.shutdown.canCloseWindow(), false);
  assert.deepEqual(f.calls, ['confirm', 'native', 'workers', 'mcp']);
  native.resolve();
  await closing;
  assert.equal(f.calls.filter((name) => name === 'close').length, 1);
});

for (const failed of ['native', 'workers', 'mcp']) {
  test(`${failed} shutdown failure still waits for other participants and keeps the window open`, async () => {
    const gates = { native: deferred(), workers: deferred(), mcp: deferred() };
    const f = shutdownFixture(
      Object.fromEntries(
        Object.entries(gates).map(([name, gate]) => [name, () => gate.promise]),
      ),
    );
    const closing = f.shutdown.requestClose();
    gates[failed].reject(new Error(`${failed} failed`));
    await turn();
    assert.equal(f.shutdown.getPhase(), 'stopping');
    for (const [name, gate] of Object.entries(gates))
      if (name !== failed) gate.resolve();
    await closing;
    assert.equal(f.shutdown.getPhase(), 'failed');
    assert.equal(f.shutdown.isStopping(), true);
    assert.equal(f.shutdown.canCloseWindow(), false);
    assert.match(f.states.at(-1)[1], new RegExp(`${failed} failed`));
    assert.equal(f.calls.includes('close'), false);
  });
}

test('synchronous shutdown failure does not skip Workers or MCP', async () => {
  const f = shutdownFixture({
    native: () => {
      throw new Error('synchronous failure');
    },
  });
  await f.shutdown.requestClose();
  assert.deepEqual(f.calls, ['native', 'workers', 'mcp']);
  assert.equal(f.shutdown.getPhase(), 'failed');
  assert.match(f.states.at(-1)[1], /Native I\/O:.*synchronous failure/);
});

test('window close failure revokes permission and retries without reconfirming or reopening admission', async () => {
  let attempts = 0;
  const f = shutdownFixture({
    dirty: true,
    close: () => {
      if (++attempts === 1) throw new Error('close failed');
    },
  });
  await f.shutdown.requestClose();
  assert.equal(f.shutdown.getPhase(), 'failed');
  assert.equal(f.shutdown.canCloseWindow(), false);
  assert.equal(f.shutdown.isStopping(), true);
  await f.shutdown.requestClose();
  assert.equal(f.shutdown.getPhase(), 'closed');
  assert.equal(f.calls.filter((name) => name === 'confirm').length, 1);
  assert.equal(attempts, 2);
});

test('confirmation failure does not start shutdown', async () => {
  const f = shutdownFixture({
    dirty: true,
    confirm: () => {
      throw new Error('dialog failed');
    },
  });
  await f.shutdown.requestClose();
  assert.deepEqual(f.calls, ['confirm']);
  assert.equal(f.shutdown.getPhase(), 'failed');
  assert.equal(f.shutdown.isStopping(), false);
  assert.equal(f.shutdown.canCloseWindow(), false);
});

test('shutdown display observer failure cannot bypass or prevent cleanup', async () => {
  const gate = deferred();
  const f = shutdownFixture({
    native: () => gate.promise,
    onState: () => {
      throw new Error('display failed');
    },
  });
  const closing = f.shutdown.requestClose();
  assert.equal(f.shutdown.canCloseWindow(), false);
  gate.resolve();
  await closing;
  assert.equal(f.shutdown.getPhase(), 'closed');
});

const workerRegistry = () =>
  load('../../../service/lifecycle/worker-lifecycle.ts').default.create();

test('worker registry starts every disposal immediately and closes admission irreversibly', async () => {
  const registry = workerRegistry(),
    a = deferred(),
    b = deferred(),
    calls = [];
  registry.register(() => {
    calls.push('a');
    return a.promise;
  });
  registry.register(() => {
    calls.push('b');
    return b.promise;
  });
  const closing = registry.stopAll();
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(closing, registry.stopAll());
  assert.throws(() => registry.assertOpen(), /shutting down/);
  assert.throws(() => registry.register(async () => {}), /shutting down/);
  let finished = false;
  void closing.then(() => {
    finished = true;
  });
  a.resolve();
  await turn();
  assert.equal(finished, false);
  b.resolve();
  await closing;
  assert.throws(() => registry.assertOpen(), /shutting down/);
});

test('worker registry waits for held owners after synchronous failure and retains failure', async () => {
  const registry = workerRegistry(),
    gate = deferred();
  registry.register(() => {
    throw new Error('failed owner');
  });
  registry.register(() => gate.promise);
  const closing = registry.stopAll();
  const rejected = assert.rejects(closing, /failed owner/);
  let finished = false;
  void rejected.then(() => {
    finished = true;
  });
  await turn();
  assert.equal(finished, false);
  gate.resolve();
  await rejected;
  assert.equal(closing, registry.stopAll());
  await assert.rejects(registry.stopAll(), /failed owner/);
});

test('already released worker owners can unregister idempotently', async () => {
  const registry = workerRegistry();
  let called = false;
  const unregister = registry.register(async () => {
    called = true;
  });
  unregister();
  unregister();
  await registry.stopAll();
  assert.equal(called, false);
});

const adapterFixture = () => {
  const registry = workerRegistry(),
    workers = [],
    calls = [],
    initializations = [],
    disposals = [];
  class FakeWorker {
    posted = [];
    stops = 0;
    constructor() {
      workers.push(this);
    }
    postMessage(value) {
      this.posted.push(value);
    }
    terminate() {
      this.stops++;
    }
  }
  const { default: Adapter } = load(
    'ui/worker-adapter.ts',
    {
      '@tauri-apps/api/core': {
        invoke: (command, args) => {
          calls.push({ command, args });
          if (command === 'worker_init' || command === 'worker_dispose') {
            const gate = deferred();
            (command === 'worker_init' ? initializations : disposals).push(
              gate,
            );
            return gate.promise;
          }
          return Promise.resolve();
        },
      },
      '../../../../service/lifecycle/worker-lifecycle': {
        applicationWorkers: registry,
      },
    },
    {
      Worker: FakeWorker,
      crypto: { randomUUID: () => `adapter-${workers.length}` },
    },
  );
  return {
    registry,
    workers,
    calls,
    initializations,
    disposals,
    use: () => Adapter.use(() => {}),
  };
};

test('production adapter stops all WebWorkers immediately but waits for late init and native dispose', async () => {
  const f = adapterFixture(),
    a = f.use(),
    b = f.use();
  a.init();
  b.init();
  f.workers[0].onmessage({
    data: {
      type: 'invoke',
      id: 'init',
      command: 'worker_init',
      args: { executionId: a.getExecutionId() },
    },
  });
  const closing = f.registry.stopAll();
  assert.deepEqual(
    f.workers.map((worker) => worker.stops),
    [1, 1],
  );
  assert.deepEqual(
    f.workers.map((worker) => worker.onmessage),
    [null, null],
  );
  assert.throws(() => a.init(), /shutting down/);
  assert.throws(() => b.start({}), /shutting down/);
  assert.throws(() => f.use(), /shutting down/);
  await turn();
  assert.equal(f.disposals.length, 1);
  f.initializations[0].resolve();
  await turn();
  assert.equal(f.disposals.length, 2);
  assert.equal(f.workers[0].posted.length, 0);
  let finished = false;
  void closing.then(() => {
    finished = true;
  });
  f.disposals[0].resolve();
  await turn();
  assert.equal(finished, false);
  f.disposals[1].resolve();
  await closing;
});

test('production adapter keeps an earlier UI disposal registered until native cleanup completes', async () => {
  const f = adapterFixture(),
    session = f.use();
  session.init();
  const disposed = session.dispose();
  const closing = f.registry.stopAll();
  let finished = false;
  void closing.then(() => {
    finished = true;
  });
  await turn();
  assert.equal(f.disposals.length, 1);
  assert.equal(finished, false);
  f.disposals[0].resolve();
  await Promise.all([disposed, closing]);
  assert.equal(f.workers[0].stops, 1);
});

test('production adapter retains a previously failed disposal for application shutdown', async () => {
  const f = adapterFixture(),
    session = f.use();
  session.init();
  const rejected = assert.rejects(session.dispose(), /native dispose failed/);
  await turn();
  f.disposals[0].reject(new Error('native dispose failed'));
  await rejected;
  await assert.rejects(f.registry.stopAll(), /native dispose failed/);
  assert.equal(f.disposals.length, 1);
});

const executeProps = {
  type: 'execute',
  sourceMapText: 'source-map',
  outputText: '',
  contextData: { datasets: [], envs: [] },
  usableUtils: [],
  outputMethod: 'plain',
};
const sessionFixture = (options = {}) => {
  const workers = [],
    calls = [],
    events = [],
    observerErrors = [];
  const session = load('runtime/worker-session.ts').default.create({
    createId: () => `run-${workers.length}`,
    createWorker() {
      const worker = {
        handlers: null,
        posted: [],
        stops: 0,
        setHandlers(value) {
          this.handlers = value;
        },
        postMessage(value) {
          this.posted.push(value);
        },
        terminate() {
          this.stops++;
        },
      };
      workers.push(worker);
      return worker;
    },
    invoke: async (command, args) => {
      calls.push({ command, args });
      return options.invoke?.(command, args);
    },
    onEvent: async (event) => {
      events.push(event);
      await options.onEvent?.(event);
    },
    onObserverError: (error) => observerErrors.push(error),
  });
  session.init();
  session.start(executeProps);
  return {
    session,
    workers,
    calls,
    events,
    observerErrors,
    send: (data) => workers.at(-1).handlers.message(data),
  };
};
const invokeEvent = (command = 'read', id = 'request') => ({
  type: 'invoke',
  command,
  id,
  args: {},
  callsiteStack: 'Error\n at work',
});

const fileCommands = [
  'exists_path',
  'glob_path',
  'read_binary',
  'read_file',
  'read_tail_file',
  'read_dir',
  'stat',
  'save_text',
  'save_binary',
  'rename',
  'copy_file',
  'make_dir',
  'delete_file',
  'delete_dir',
  'delete_dir_all',
];

test('every native file command is covered by the worker ownership policy', () => {
  const source = readFileSync(
    path.join(app, 'src-tauri/src/file_system_commands.rs'),
    'utf8',
  );
  const commands = [...source.matchAll(/pub async fn (\w+)\(/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(commands.sort(), [...fileCommands].sort());
  const policy = load('runtime/native-io-policy.ts').default;
  assert.ok(commands.every(policy.isOwnedCommand));
  assert.equal(policy.isOwnedCommand('scan_directory'), true);
  assert.equal(policy.isOwnedCommand('excel_parse_file'), true);
  assert.equal(policy.isOwnedCommand('append_lines'), false);
});

for (const command of [...fileCommands, 'scan_directory', 'excel_parse_file']) {
  test(`${command} binds the current execution, has no detached RPC deadline, and blocks premature done`, async () => {
    let handler, posted;
    const api = load(
      'util/worker-invoke.ts',
      {},
      {
        self: {
          addEventListener: (_, fn) => {
            handler = fn;
          },
          removeEventListener() {},
        },
        postMessage: (event) => {
          posted = event;
        },
        setTimeout: () =>
          assert.fail('File I/O must remain owned until actual completion'),
      },
    ).default;
    const reply = api.call(command, {});
    handler({
      data: { type: 'invoke-result', id: posted.id, result: 'complete' },
    });
    assert.equal(await reply, 'complete');

    const request = deferred(),
      stopped = deferred();
    const f = sessionFixture({
      invoke: async (name) => {
        if (name === command) return request.promise;
        if (name === 'worker_stop') {
          await stopped.promise;
          request.reject(new Error('File I/O cancelled'));
        }
      },
    });
    f.send({
      ...invokeEvent(command),
      args: { executionId: 'forged', path: 'C:\\data' },
    });
    assert.equal(f.calls[0].args.executionId, f.session.getExecutionId());
    f.send({ type: 'done', vfs: { staged: true } });
    await turn();
    assert.deepEqual(f.events, []);
    stopped.resolve();
    await turn();
    assert.equal(f.events.at(-1).type, 'runtime-error');
    assert.match(f.events.at(-1).stack, /unfinished native I\/O/);
    assert.equal('vfs' in f.events.at(-1), false);
    assert.equal(f.workers[0].posted.length, 1);
    await f.session.dispose();
  });
}

test('native replies remain bound to their original worker after restart', async () => {
  const gate = deferred();
  const f = sessionFixture({
    invoke: (command) => (command === 'read' ? gate.promise : undefined),
  });
  const oldHandler = f.workers[0].handlers;
  f.send(invokeEvent());
  await f.session.terminate();
  f.session.init();
  f.session.start(executeProps);
  gate.resolve('old result');
  oldHandler.message({ type: 'done', vfs: null });
  await turn();
  assert.equal(f.workers[0].posted.length, 1);
  assert.equal(f.workers[1].posted.length, 1);
  assert.deepEqual(f.events, []);
  assert.notEqual(
    f.workers[0].posted[0].executionId,
    f.workers[1].posted[0].executionId,
  );
  await f.session.dispose();
});

for (const rejected of [false, true]) {
  test(`cleanup waits for late worker_init (${rejected ? 'rejected' : 'resolved'}) and is idempotent`, async () => {
    const gate = deferred();
    const f = sessionFixture({
      invoke: (command) =>
        command === 'worker_init' ? gate.promise : undefined,
    });
    f.send(invokeEvent('worker_init'));
    const cleanup = f.session.terminate();
    assert.equal(cleanup, f.session.terminate());
    await turn();
    assert.equal(
      f.calls.some((c) => c.command === 'worker_dispose'),
      false,
    );
    if (rejected) gate.reject(new Error('init failed'));
    else gate.resolve();
    await cleanup;
    assert.equal(
      f.calls.filter((c) => c.command === 'worker_dispose').length,
      1,
    );
    assert.equal(f.workers[0].posted.length, 1);
    await f.session.dispose();
    assert.throws(() => f.session.init(), /disposed/);
  });
}

test('native errors retain the work callsite', async () => {
  const f = sessionFixture({
    invoke: (command) => {
      if (command === 'read') throw new Error('unavailable');
    },
  });
  f.send(invokeEvent());
  await turn();
  assert.match(f.workers[0].posted[1].callsiteStack, /unavailable\n at work/);
  await f.session.dispose();
});

test('async output observers complete before terminal callbacks, exactly once', async () => {
  const gate = deferred(),
    order = [];
  const f = sessionFixture({
    onEvent: async (event) => {
      if (event.type === 'receive_stream') await gate.promise;
      order.push(event.type);
    },
  });
  f.send({ type: 'receive_stream', channelId: 'a' });
  f.send({ type: 'done', vfs: null });
  f.send({ type: 'done', vfs: null });
  f.send(invokeEvent());
  await turn();
  assert.deepEqual(order, []);
  assert.ok(f.workers[0].stops > 0);
  gate.resolve();
  await turn();
  assert.deepEqual(order, ['receive_stream', 'done']);
  assert.deepEqual(
    f.calls.map((c) => c.command),
    ['worker_stop'],
  );
  await f.session.dispose();
});

test('termination suppresses queued terminal callbacks', async () => {
  const gate = deferred();
  const f = sessionFixture({
    onEvent: (event) => (event.type === 'prepared' ? gate.promise : undefined),
  });
  f.send({ type: 'prepared' });
  f.send({ type: 'done', vfs: null });
  await turn();
  await f.session.terminate();
  gate.resolve();
  await turn();
  assert.deepEqual(
    f.events.map((e) => e.type),
    ['prepared'],
  );
});

for (const kind of ['error', 'messageError', 'observer']) {
  test(`${kind} failure becomes runtime-error and prevents done`, async () => {
    const f = sessionFixture({
      onEvent: (event) => {
        if (kind === 'observer' && event.type === 'receive_stream')
          throw new Error('render failed');
      },
    });
    if (kind === 'observer') f.send({ type: 'receive_stream', channelId: 'a' });
    else if (kind === 'error') f.workers[0].handlers.error('worker crashed');
    else f.workers[0].handlers.messageError();
    f.send({ type: 'done', vfs: null });
    await turn();
    assert.equal(f.events.filter((e) => e.type === 'runtime-error').length, 1);
    assert.equal(
      f.events.some((e) => e.type === 'done'),
      false,
    );
    assert.equal(f.events.at(-1).sourceMap, 'source-map');
    assert.deepEqual(f.observerErrors, []);
    await f.session.dispose();
  });
}

test('cleanup failure rejects, does not leave a live worker, and remains idempotent', async () => {
  const f = sessionFixture({
    invoke: () => {
      throw new Error('dispose failed');
    },
  });
  const cleanup = f.session.dispose();
  await assert.rejects(cleanup, /dispose failed/);
  assert.equal(f.session.dispose(), cleanup);
  assert.equal(f.workers[0].handlers, null);
  assert.equal(f.calls.length, 1);
});

test('double initialization and double start are rejected', async () => {
  const f = sessionFixture();
  assert.throws(() => f.session.init(), /already initialized/);
  assert.throws(() => f.session.start(executeProps), /cannot start/);
  await f.session.dispose();
});

test('worker creation failure leaves a disposable empty session', async () => {
  const session = load('runtime/worker-session.ts').default.create({
    createId: () => 'id',
    createWorker: () => {
      throw new Error('creation failed');
    },
    invoke: async () => assert.fail('No execution to dispose'),
    onEvent: () => {},
    onObserverError: () => {},
  });
  assert.throws(() => session.init(), /creation failed/);
  await session.dispose();
});

test('terminal delivery waits for native stop confirmation', async () => {
  const gate = deferred();
  const f = sessionFixture({
    invoke: (command) => (command === 'worker_stop' ? gate.promise : undefined),
  });
  f.send({ type: 'done', vfs: { staged: true } });
  await turn();
  assert.deepEqual(f.events, []);
  assert.ok(f.workers[0].stops > 0);
  gate.resolve();
  await turn();
  assert.equal(f.events.at(-1).type, 'done');
  await f.session.dispose();
});

test('admission rejection preserves accepted native ownership and waits for saturated cleanup before reporting failure', async () => {
  const source = readFileSync(
    path.join(app, 'src-tauri/src/resource_limits.rs'),
    'utf8',
  );
  const capacity = Number(
    source.match(/pub const NATIVE_IO_MAX_OPERATIONS: usize = (\d+);/)[1],
  );
  const accepted = deferred(),
    stopped = deferred();
  let requests = 0;
  const error = `Execution native I/O concurrency limit exceeded (${capacity})`;
  const f = sessionFixture({
    invoke: (command) => {
      if (command === 'worker_stop') return stopped.promise;
      if (command === 'read_file') {
        if (++requests > capacity) throw new Error(error);
        return accepted.promise;
      }
    },
  });
  for (let index = 0; index <= capacity; index++)
    f.send(invokeEvent('read_file', `request-${index}`));
  await turn();
  const reply = f.workers[0].posted.find((e) => e.type === 'invoke-error');
  assert.equal(reply.id, `request-${capacity}`);
  assert.ok(reply.callsiteStack.includes(error));
  assert.match(reply.callsiteStack, /at work/);
  assert.equal(
    f.workers[0].posted.some((e) => e.type === 'invoke-result'),
    false,
  );
  assert.deepEqual(f.events, []);
  f.send({ type: 'runtime-error', stack: error, sourceMap: 'source-map' });
  await turn();
  assert.equal(f.calls.filter((c) => c.command === 'worker_stop').length, 1);
  assert.deepEqual(f.events, []);
  accepted.reject(new Error('File I/O cancelled'));
  stopped.resolve();
  await turn();
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].type, 'runtime-error');
  assert.equal('vfs' in f.events[0], false);
  assert.deepEqual(f.observerErrors, []);
  await f.session.dispose();
});

test('unfinished native work is cancelled and never exposes a transaction', async () => {
  const request = deferred();
  const f = sessionFixture({
    invoke: async (command) => {
      if (command === 'run_process') return request.promise;
      if (command === 'worker_stop')
        request.reject(new Error('Process cancelled'));
    },
  });
  f.send({
    ...invokeEvent('run_process'),
    args: { executionId: 'forged', req: {} },
  });
  await turn();
  assert.equal(f.calls[0].args.executionId, f.session.getExecutionId());
  f.send({ type: 'done', vfs: { staged: true } });
  await turn();
  assert.equal(f.events.at(-1).type, 'runtime-error');
  assert.match(f.events.at(-1).stack, /unfinished native I\/O/);
  assert.equal('vfs' in f.events.at(-1), false);
  assert.equal(f.workers[0].posted.length, 1);
  await f.session.dispose();
});

test('awaited native work permits normal completion', async () => {
  const f = sessionFixture();
  f.send(invokeEvent('load_http'));
  await turn();
  assert.equal(f.workers[0].posted.at(-1).type, 'invoke-result');
  f.send({ type: 'done', vfs: null });
  await turn();
  assert.equal(f.events.at(-1).type, 'done');
  await f.session.dispose();
});

test('native stop failure replaces done with an explicit cleanup failure', async () => {
  const f = sessionFixture({
    invoke: (command) => {
      if (command === 'worker_stop') throw new Error('Cannot stop native work');
    },
  });
  f.send({ type: 'done', vfs: { staged: true } });
  await turn();
  assert.equal(f.events.at(-1).type, 'runtime-error');
  assert.equal(f.events.at(-1).cleanupFailed, true);
  assert.match(f.events.at(-1).stack, /Cannot stop native work/);
  assert.equal(f.calls.filter((c) => c.command === 'worker_stop').length, 1);
  await f.session.dispose();
});

test('fatal worker failure requests native stop while a display observer is still waiting', async () => {
  const gate = deferred();
  const f = sessionFixture({
    onEvent: (event) =>
      event.type === 'receive_stream' ? gate.promise : undefined,
  });
  f.send({ type: 'receive_stream', channelId: 'a' });
  await turn();
  f.workers[0].handlers.error('crash');
  await turn();
  assert.equal(f.calls.at(-1).command, 'worker_stop');
  assert.equal(
    f.events.some((e) => e.type === 'runtime-error'),
    false,
  );
  gate.resolve();
  await turn();
  assert.equal(f.events.at(-1).type, 'runtime-error');
  await f.session.dispose();
});

test('fatal failure waits for delayed initialization before native stop', async () => {
  const gate = deferred();
  const f = sessionFixture({
    invoke: (command) => (command === 'worker_init' ? gate.promise : undefined),
  });
  f.send(invokeEvent('worker_init'));
  f.workers[0].handlers.error('crash while initializing');
  await turn();
  assert.equal(
    f.calls.some((c) => c.command === 'worker_stop'),
    false,
  );
  gate.resolve();
  await turn();
  assert.equal(f.events.at(-1).type, 'runtime-error');
  assert.equal(f.calls.at(-1).command, 'worker_stop');
  await f.session.dispose();
});

test('a failure delayed by native cleanup cannot report into a restarted execution', async () => {
  const gate = deferred();
  const f = sessionFixture({
    invoke: (command) => (command === 'worker_stop' ? gate.promise : undefined),
  });
  f.workers[0].handlers.error('old failure');
  await turn();
  await f.session.terminate();
  f.session.init();
  f.session.start(executeProps);
  gate.resolve();
  await turn();
  assert.deepEqual(f.events, []);
  await f.session.dispose();
});

// Run the production worker with the platform/API injection replaced, not its scheduler.
const workerFixture = (options = {}) => {
  const self = {},
    events = [],
    calls = [],
    preparations = [];
  const globals = { self, postMessage: (event) => events.push(event) };
  let reserveApi;
  const mocks = {
    '../../../../util/data/data-util': { getAppliedEnvValue: (value) => value },
    '../util/worker-invoke': {
      call: async (command, args) => {
        calls.push({ command, args });
        if (options.failCommand === command)
          throw new Error(command + ' failed');
        return options.invoke?.(command, args);
      },
    },
    '../util/context-data-util': {
      createObjects: (data, preparation, rustCache) => {
        if (options.contextFailure) throw new Error('context failed');
        preparations.push(structuredClone(preparation));
        if (options.useProductionContext)
          return contextApi.createObjects(data, preparation, rustCache);
        return [];
      },
    },
    '../util/declare-util': {
      createUtilObject: (name, cache) => {
        if (options.reserveFailure) throw new Error('reserve failed');
        if (name === 'tx') return () => cache.createVFS();
        if (name === 'fs') return fileApi.getObject(cache);
        return reserveApi.createUtilObject(name, cache);
      },
    },
  };
  const fileApi = load(
    'util/fs/dcl-file-system.ts',
    {
      '../worker-invoke': mocks['../util/worker-invoke'],
      './tx/dcl-fs-transaction': {},
    },
    globals,
  ).default;
  const parserApi = load(
    'util/parser/dcl-parser.ts',
    {
      '../../../../../util/data/data-util': {},
      './dom-parser': {},
      '../worker-invoke': mocks['../util/worker-invoke'],
    },
    globals,
  ).default;
  const netApi = load('util/dcl-net.ts', {
    './worker-invoke': mocks['../util/worker-invoke'],
  }).default;
  const contextApi = load('util/context-data-util.ts', {
    '../../../../util/data/data-util': {
      getAppliedEnvValue: (value) => value,
      decodeBinary: (bytes) => new TextDecoder().decode(bytes),
    },
    '../../../../util/data/file-util': {},
    './worker-invoke': mocks['../util/worker-invoke'],
    '../../../../state/model/license-state': {},
    '../../../../util/typescript-util': {},
    './parser/dcl-parser': parserApi,
    './declare-util': {},
    '../../logic/util/logic-signature-cache': {},
  }).default;
  reserveApi = load(
    'util/declare-util.ts',
    {
      '../worker-invoke': mocks['../util/worker-invoke'],
      './fs/dcl-file-system': {},
      './dcl-net': netApi,
      './dcl-state': {},
      './parser/dcl-parser': parserApi,
      '../../../../state/model/license-state': { isPro: () => false },
    },
    globals,
  ).default;
  load('runtime/worker.ts', mocks, globals);
  const run = (source = '', extra = {}) =>
    self.onmessage({
      data: {
        ...executeProps,
        executionId: 'worker-run',
        outputText: source,
        usableUtils: ['println', 'runtime', 'tx'],
        ...extra,
      },
    });
  return { events, calls, preparations, run };
};
const terminal = (f) =>
  f.events.filter((e) => ['done', 'runtime-error'].includes(e.type));

test('dataset target conversion ignores root labels and never turns empty directories into files', () => {
  const api = load('runtime/dataset-scan-result.ts').default;
  assert.deepEqual(
    api.getTargets({
      name: 'C:\\',
      children: [
        { name: 'one.txt', children: null },
        { name: 'sub', children: [{ name: 'two.txt', children: null }] },
        { name: 'empty', children: [] },
      ],
    }),
    ['\\one.txt', '\\sub\\two.txt'],
  );
  assert.deepEqual(api.getTargets({ name: 'excluded-root', children: [] }), []);
  assert.throws(
    () => api.getTargets({ name: 'root', children: null }),
    /root must be a directory/,
  );
});

const dynamicDatasets = {
  envs: [],
  datasets: [
    {
      rootPath: 'C:\\',
      scanOption: { dirConds: [], fileConds: [] },
      varName: 'first',
    },
    {
      rootPath: 'C:\\empty',
      scanOption: { dirConds: [], fileConds: [] },
      varName: 'second',
    },
  ],
};

test('worker initializes native ownership before dataset scans and waits for all preparation', async () => {
  const initialized = deferred(),
    scanned = deferred();
  const f = workerFixture({
    invoke: (command, args) => {
      if (command === 'worker_init') return initialized.promise;
      if (command === 'scan_directory')
        return args.req.rootPath === 'C:\\'
          ? scanned.promise
          : { node: { name: 'empty', children: [] } };
    },
  });
  const run = f.run('', { contextData: dynamicDatasets });
  await turn();
  assert.deepEqual(
    f.calls.map((c) => c.command),
    ['worker_init'],
  );
  assert.equal(f.calls[0].args.executionId, 'worker-run');
  initialized.resolve();
  await turn();
  assert.equal(f.calls.filter((c) => c.command === 'scan_directory').length, 2);
  assert.equal(
    f.events.some((e) => e.type === 'prepared'),
    false,
  );
  scanned.resolve({
    node: { name: 'C:\\', children: [{ name: 'one.txt', children: null }] },
  });
  await run;
  assert.deepEqual(
    f.preparations[0].datasetMap.sort((a, b) => a.key.localeCompare(b.key)),
    [
      { key: 'first', targets: ['\\one.txt'] },
      { key: 'second', targets: [] },
    ],
  );
  assert.equal(terminal(f)[0].type, 'done');
});

test('initialization failure prevents all dataset scanning and user execution', async () => {
  const f = workerFixture({ failCommand: 'worker_init' });
  await f.run('throw new Error("user code must not run")', {
    contextData: dynamicDatasets,
  });
  assert.deepEqual(
    f.calls.map((c) => c.command),
    ['worker_init'],
  );
  assert.equal(terminal(f)[0].type, 'runtime-error');
  assert.match(terminal(f)[0].stack, /worker_init failed/);
  assert.equal(
    f.events.some((e) => e.type === 'prepared'),
    false,
  );
});

test('malformed scan root fails preparation instead of injecting a false target', async () => {
  const f = workerFixture({
    invoke: (command) =>
      command === 'scan_directory'
        ? { node: { name: 'root', children: null } }
        : undefined,
  });
  await f.run('$tx();', { contextData: dynamicDatasets });
  assert.equal(terminal(f)[0].type, 'runtime-error');
  assert.match(terminal(f)[0].stack, /root must be a directory/);
  assert.equal('vfs' in terminal(f)[0], false);
  assert.deepEqual(f.preparations, []);
});

test('scan resource overflow prevents preparation, user execution and transaction exposure', async () => {
  const error = 'Scan entry limit exceeded (100000)';
  const f = workerFixture({
    invoke: (command) => {
      if (command === 'scan_directory') throw new Error(error);
    },
  });
  await f.run('$println("must not execute"); $tx();', {
    usableUtils: ['println', 'tx'],
    contextData: dynamicDatasets,
  });
  assert.equal(terminal(f).length, 1);
  assert.equal(terminal(f)[0].type, 'runtime-error');
  assert.ok(terminal(f)[0].stack.includes(error));
  assert.equal('vfs' in terminal(f)[0], false);
  assert.deepEqual(f.preparations, []);
  assert.equal(
    f.events.some((e) => e.type === 'prepared'),
    false,
  );
  assert.equal(
    f.calls.some((c) => c.command === 'append_lines'),
    false,
  );
  assert.equal(f.calls[0].command, 'worker_init');
  assert.equal(f.calls[0].args.executionId, 'worker-run');
});

test('scan admission rejection prevents user execution and dataset injection', async () => {
  const error = 'Execution native I/O concurrency limit exceeded (32)';
  const f = workerFixture({
    invoke: (command) => {
      if (command === 'scan_directory') throw new Error(error);
    },
  });
  await f.run('$println("must not run"); $tx();', {
    usableUtils: ['println', 'tx'],
    contextData: dynamicDatasets,
  });
  assert.equal(terminal(f).length, 1);
  assert.equal(terminal(f)[0].type, 'runtime-error');
  assert.ok(terminal(f)[0].stack.includes(error));
  assert.equal('vfs' in terminal(f)[0], false);
  assert.deepEqual(f.preparations, []);
  assert.equal(
    f.events.some((e) => e.type === 'prepared'),
    false,
  );
  assert.equal(
    f.calls.some((c) => c.command === 'append_lines'),
    false,
  );
});

for (const [command, source] of [
  ['read_file', 'await $fs.readText("C:\\\\data.txt");'],
  ['exists_path', 'await $fs.exists("C:\\\\data.txt");'],
  ['glob_path', 'await $fs.glob("C:\\\\*.txt");'],
  ['save_text', 'await $fs.saveText("C:\\\\data.txt", "new");'],
]) {
  test(`production file API ${command} failure prevents worker transaction exposure`, async () => {
    const f = workerFixture({
      failCommand: command,
      invoke: (name) =>
        name === 'stat' ? { isFile: true, size: 1 } : undefined,
    });
    await f.run(`$tx(); ${source}`, { usableUtils: ['tx', 'fs'] });
    assert.equal(terminal(f).length, 1);
    assert.equal(terminal(f)[0].type, 'runtime-error');
    assert.match(terminal(f)[0].stack, new RegExp(command + ' failed'));
    assert.equal('vfs' in terminal(f)[0], false);
  });
}

test('production file API permits awaited success without changing public arguments', async () => {
  const f = workerFixture({
    invoke: (command) =>
      command === 'stat'
        ? { isFile: true, size: 1 }
        : command === 'read_file'
          ? 'content'
          : undefined,
  });
  await f.run('$println(await $fs.readText("C:\\\\data.txt", "sjis"));', {
    usableUtils: ['println', 'fs'],
  });
  assert.equal(terminal(f)[0].type, 'done');
  assert.deepEqual(f.calls.find((c) => c.command === 'read_file').args, {
    req: { filePath: 'C:\\data.txt', encoding: 'sjis' },
  });
  assert.deepEqual(
    f.calls.find((c) => c.command === 'append_lines').args.batches,
    [['content', '']],
  );
});

test('production Excel failure keeps earlier output but prevents worker transaction exposure', async () => {
  const f = workerFixture({ failCommand: 'excel_parse_file' });
  await f.run(
    '$tx(); $println("before Excel"); await $parser.excel("C:/data.xlsx");',
    {
      usableUtils: ['tx', 'println', 'parser'],
    },
  );
  assert.deepEqual(f.calls.find((c) => c.command === 'excel_parse_file').args, {
    filePath: 'C:/data.xlsx',
  });
  assert.equal(terminal(f).length, 1);
  assert.equal(terminal(f)[0].type, 'runtime-error');
  assert.match(terminal(f)[0].stack, /excel_parse_file failed/);
  assert.equal('vfs' in terminal(f)[0], false);
  assert.deepEqual(
    f.events.slice(-2).map((e) => e.type),
    ['receive_stream', 'runtime-error'],
  );
});

test('Excel resource overflow retains earlier output but never exposes a partial book or transaction', async () => {
  const error = 'Excel range cell limit exceeded (1000000)';
  const f = workerFixture({
    invoke: (command) => {
      if (command === 'excel_parse_file') throw new Error(error);
    },
  });
  await f.run(
    '$tx(); $println("before Excel"); const book = await $parser.excel("C:/data.xlsx"); $println(book.sheet("Data").name);',
    {
      usableUtils: ['tx', 'println', 'parser'],
    },
  );
  assert.equal(terminal(f).length, 1);
  assert.equal(terminal(f)[0].type, 'runtime-error');
  assert.ok(terminal(f)[0].stack.includes(error));
  assert.equal('vfs' in terminal(f)[0], false);
  assert.deepEqual(
    f.calls.find((c) => c.command === 'append_lines').args.batches,
    [['before Excel', '']],
  );
});

test('awaited Excel parsing waits for native completion and preserves Book, Sheet, Row and Cell APIs', async () => {
  const gate = deferred();
  const f = workerFixture({
    invoke: (command) =>
      command === 'excel_parse_file' ? gate.promise : undefined,
  });
  const run = f.run(
    `
    const book = await $parser.excel("C:/data.xlsx");
    const sheet = book.sheet("Data");
    if (book.sheet("missing") !== null) throw new Error("missing sheet");
    if (sheet.maxRow !== 3 || sheet.maxCol !== 2) throw new Error("range bounds");
    if (sheet.rowAt(3).cellAt(1).address !== "B4") throw new Error("cell address");
    if (sheet.cellAt("$C$4").value !== "3") throw new Error("cell value");
    $println(JSON.stringify(sheet.toTable(2)));
    $tx();
  `,
    { usableUtils: ['parser', 'println', 'tx'] },
  );
  await turn();
  assert.deepEqual(terminal(f), []);
  gate.resolve({
    sheets: [
      {
        name: 'Data',
        maxRow: 3,
        maxCol: 2,
        rows: [
          {
            index: 2,
            cells: [
              { row: 2, col: 1, value: 'name' },
              { row: 2, col: 2, value: 'count' },
            ],
          },
          {
            index: 3,
            cells: [
              { row: 3, col: 1, value: 'alpha' },
              { row: 3, col: 2, value: '3' },
            ],
          },
        ],
      },
    ],
  });
  await run;
  assert.equal(terminal(f)[0].type, 'done');
  assert.ok(terminal(f)[0].vfs);
  assert.deepEqual(
    f.calls.find((c) => c.command === 'append_lines').args.batches,
    [['[{"name":"alpha","count":"3"}]', '']],
  );
});

test('a Work may explicitly catch an Excel failure and continue', async () => {
  const f = workerFixture({ failCommand: 'excel_parse_file' });
  await f.run(
    `
    try { await $parser.excel("C:/data.xlsx"); }
    catch { $println("handled"); }
  `,
    { usableUtils: ['parser', 'println'] },
  );
  assert.equal(terminal(f)[0].type, 'done');
  assert.deepEqual(
    f.calls.find((c) => c.command === 'append_lines').args.batches,
    [['handled', '']],
  );
});

for (const [command, source, utility, error] of [
  [
    'read_file',
    'await $fs.readText("C:/data.txt");',
    'fs',
    'Execution native I/O concurrency limit exceeded (32)',
  ],
  [
    'excel_parse_file',
    'await $parser.excel("C:/data.xlsx");',
    'parser',
    'Execution native I/O concurrency limit exceeded (32)',
  ],
  [
    'load_http',
    'await $net.getText("http://local");',
    'net',
    'ConcurrencyLimitExceeded',
  ],
  [
    'load_html_from_url',
    'await $net.getHtml("http://local");',
    'net',
    'ConcurrencyLimitExceeded',
  ],
]) {
  test(`${command} admission rejection retains earlier output and prevents success or transaction exposure`, async () => {
    const f = workerFixture({
      invoke: (name) => {
        if (name === command) throw new Error(error);
        if (name === 'stat') return { isFile: true, size: 1 };
      },
    });
    await f.run(`$tx(); $println("before request"); ${source}`, {
      usableUtils: ['tx', 'println', utility],
    });
    assert.equal(terminal(f).length, 1);
    assert.equal(terminal(f)[0].type, 'runtime-error');
    assert.ok(terminal(f)[0].stack.includes(error));
    assert.equal('vfs' in terminal(f)[0], false);
    assert.deepEqual(
      f.calls.find((c) => c.command === 'append_lines').args.batches,
      [['before request', '']],
    );
  });
}

test('a Work may explicitly handle admission rejection without failing execution cleanup', async () => {
  const f = workerFixture({
    invoke: (command) => {
      if (command === 'load_http') throw new Error('ConcurrencyLimitExceeded');
    },
  });
  await f.run(
    'try { await $net.getText("http://local"); } catch (error) { $println("handled"); }',
    { usableUtils: ['net', 'println'] },
  );
  assert.equal(terminal(f).length, 1);
  assert.equal(terminal(f)[0].type, 'done');
  assert.deepEqual(
    f.calls.find((c) => c.command === 'append_lines').args.batches,
    [['handled', '']],
  );
});

for (const [command, source, error] of [
  ['load_http', 'await $net.getText("http://local");', 'ResponseTooLarge'],
  [
    'load_html_from_url',
    'await $net.getHtml("http://local");',
    'ResponseTooLarge',
  ],
  ['load_http', 'await $net.getText("http://local");', 'ResourceExhausted'],
]) {
  test(`${command} ${error} preserves prior output and prevents partial HTTP success or VFS exposure`, async () => {
    const f = workerFixture({
      invoke: (name) => {
        if (name === command) throw new Error(error);
      },
    });
    await f.run(`$tx(); $println("before request"); ${source}`, {
      usableUtils: ['tx', 'println', 'net'],
    });
    assert.equal(terminal(f).length, 1);
    assert.equal(terminal(f)[0].type, 'runtime-error');
    assert.match(terminal(f)[0].stack, new RegExp(error));
    assert.equal('vfs' in terminal(f)[0], false);
    assert.equal(
      f.calls.find((c) => c.command === command).args.executionId,
      'worker-run',
    );
    assert.deepEqual(
      f.calls.find((c) => c.command === 'append_lines').args.batches,
      [['before request', '']],
    );
  });
}

for (const error of [
  'Process output exceeded combined stdout/stderr limit (16777216 bytes)',
  'Execution native I/O concurrency limit exceeded (32)',
]) {
  test(`production process API ${error} does not decode a partial result or expose a transaction`, async () => {
    const f = workerFixture({
      useProductionContext: true,
      invoke: (command) => {
        if (command === 'run_process') throw new Error(error);
      },
    });
    await f.run('$tx(); $println("before process"); await $process.run();', {
      usableUtils: ['tx', 'println'],
      contextData: {
        envs: [],
        resources: [],
        datasets: [],
        logics: [],
        processes: [
          {
            funcName: 'run',
            prgPath: 'C:/program.exe',
            scriptArgs: [],
            cmdArgs: [],
            cwd: '',
            stdin: '',
            timeout: 25_000,
            encoding: { stdin: 'utf8', stdout: 'utf8', stderr: 'utf8' },
          },
        ],
      },
    });
    assert.equal(terminal(f).length, 1);
    assert.equal(terminal(f)[0].type, 'runtime-error');
    assert.ok(terminal(f)[0].stack.includes(error));
    assert.equal('vfs' in terminal(f)[0], false);
    assert.equal(
      f.calls.find((c) => c.command === 'run_process').args.executionId,
      'worker-run',
    );
    assert.deepEqual(
      f.calls.find((c) => c.command === 'append_lines').args.batches,
      [['before process', '']],
    );
  });
}

for (const ending of ['', 'return;', '$runtime.exit();']) {
  test(`worker drains real scheduler before done: ${ending || 'normal'}`, async () => {
    const gate = deferred();
    const f = workerFixture({
      invoke: (command) =>
        command === 'append_lines' ? gate.promise : undefined,
    });
    const run = f.run(`$println('last line'); $tx(); ${ending}`);
    await turn();
    assert.deepEqual(terminal(f), []);
    gate.resolve();
    await run;
    assert.equal(terminal(f)[0].type, 'done');
    assert.ok(terminal(f)[0].vfs);
    assert.deepEqual(
      f.events.slice(-2).map((e) => e.type),
      ['receive_stream', 'done'],
    );
    await f.run('throw new Error("must not run twice")');
    assert.equal(terminal(f).length, 1);
  });
}

test('worker flushes earlier output before reporting arbitrary thrown values', async () => {
  const f = workerFixture();
  await f.run('$println("before error"); throw null;');
  assert.deepEqual(
    f.events.slice(-2).map((e) => e.type),
    ['receive_stream', 'runtime-error'],
  );
  assert.equal(terminal(f)[0].stack, 'null');
});

for (const stage of [
  'reserve',
  'scan_directory',
  'worker_init',
  'add_channel',
  'context',
  'syntax',
  'append_lines',
]) {
  test(`worker reports ${stage} failure without done or transaction exposure`, async () => {
    const f = workerFixture({
      failCommand: stage,
      reserveFailure: stage === 'reserve',
      contextFailure: stage === 'context',
    });
    await f.run(
      stage === 'syntax' ? 'const =' : '$tx(); $println("line");',
      stage === 'scan_directory'
        ? {
            contextData: {
              envs: [],
              datasets: [
                { rootPath: 'C:\\data', scanOption: {}, varName: 'data' },
              ],
            },
          }
        : {},
    );
    assert.equal(terminal(f).length, 1);
    assert.equal(terminal(f)[0].type, 'runtime-error');
    assert.equal(terminal(f)[0].sourceMap, 'source-map');
    assert.equal('vfs' in terminal(f)[0], false);
  });
}

test('empty channel registration failure is observed without print', async () => {
  const f = workerFixture({ failCommand: 'add_channel' });
  await f.run('$channel.createTextStream("empty");', {
    usableUtils: ['channel'],
    outputMethod: 'channel',
  });
  assert.equal(terminal(f)[0].type, 'runtime-error');
  assert.match(terminal(f)[0].stack, /add_channel failed/);
});

test('first output waits for async channel registration', async () => {
  const gate = deferred();
  const f = workerFixture({
    invoke: (command) => (command === 'add_channel' ? gate.promise : undefined),
  });
  const run = f.run('$channel.createTextStream("a").println("line");', {
    usableUtils: ['channel'],
    outputMethod: 'channel',
  });
  await turn();
  assert.equal(
    f.calls.some((c) => c.command === 'append_lines'),
    false,
  );
  gate.resolve();
  await run;
  assert.equal(f.calls.filter((c) => c.command === 'append_lines').length, 1);
  assert.equal(terminal(f)[0].type, 'done');
});

test('text and table channels save their production-format batches before done', async () => {
  const f = workerFixture();
  await f.run(
    '$channel.createTextStream("text").println("one\\ntwo"); $channel.createTableStream("table", [{name:"value"}]).add({value:"row"});',
    { usableUtils: ['channel'], outputMethod: 'channel' },
  );
  assert.deepEqual(
    f.calls
      .filter((c) => c.command === 'append_lines')
      .map((c) => [c.args.channelId, c.args.batches]),
    [
      ['text', [['one', 'two', '']]],
      ['table', [['{"value":"row"}', '']]],
    ],
  );
  assert.equal(terminal(f)[0].type, 'done');
});

test('duplicate channel creation fails instead of replacing registration state', async () => {
  const f = workerFixture();
  await f.run(
    '$channel.createTextStream("same"); $channel.createTextStream("same");',
    { usableUtils: ['channel'], outputMethod: 'channel' },
  );
  assert.equal(f.calls.filter((c) => c.command === 'add_channel').length, 1);
  assert.match(terminal(f)[0].stack, /already exists/);
  assert.equal(terminal(f)[0].type, 'runtime-error');
});

test('worker invoke ignores matching IDs with wrong message type and removes listeners', async () => {
  const listeners = new Set(),
    posted = [];
  const self = {
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const api = load(
    'util/worker-invoke.ts',
    {},
    { self, postMessage: (e) => posted.push(e) },
  ).default;
  const result = api.call('read', {}, 100);
  const handler = [...listeners][0],
    id = posted[0].id;
  handler({ data: { type: 'execute', id } });
  assert.equal(listeners.size, 1);
  handler({ data: { type: 'invoke-result', id, result: 42 } });
  assert.equal(await result, 42);
  assert.equal(listeners.size, 0);
});

for (const failure of ['invoke-error', 'timeout', 'postMessage']) {
  test(`worker invoke ${failure} removes its listener and timer`, async () => {
    const listeners = new Set();
    const self = {
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
    };
    let posted;
    const api = load(
      'util/worker-invoke.ts',
      {},
      {
        self,
        console: { error() {} },
        postMessage: (event) => {
          if (failure === 'postMessage') throw new Error('cannot send');
          posted = event;
        },
      },
    ).default;
    const result = api.call('read', {}, 5);
    if (failure === 'invoke-error')
      [...listeners][0]({
        data: {
          type: 'invoke-error',
          id: posted.id,
          callsiteStack: 'native failed',
        },
      });
    await assert.rejects(
      result,
      failure === 'timeout'
        ? /timeout/
        : failure === 'postMessage'
          ? /cannot send/
          : /native failed/,
    );
    assert.equal(listeners.size, 0);
  });
}

test('native-owned timeout disables the unrelated Worker RPC timer', async () => {
  let handler, posted;
  const self = {
    addEventListener: (_, fn) => {
      handler = fn;
    },
    removeEventListener: () => {},
  };
  const api = load(
    'util/worker-invoke.ts',
    {},
    {
      self,
      postMessage: (event) => {
        posted = event;
      },
      setTimeout: () => assert.fail('Native operation owns its deadline'),
    },
  ).default;
  const result = api.call('run_process', {}, null);
  await turn();
  handler({
    data: { type: 'invoke-result', id: posted.id, result: 'completed' },
  });
  assert.equal(await result, 'completed');
});

test('every network API binds the execution and uses native timeout ownership', async () => {
  const calls = [];
  const api = load('util/dcl-net.ts', {
    './worker-invoke': {
      call: async (command, args, timeout) => {
        calls.push({ command, args, timeout });
        return { body: '{"value":1}', status: 200, ok: true };
      },
    },
  }).default.getObject({ executionId: 'owned-net' });
  await api.getHtml('http://local');
  await api.request({
    url: 'http://local',
    timeoutMs: 20_000,
    query: { keep: 3, skip: null },
  });
  assert.equal(await api.getText('http://local'), '{"value":1}');
  assert.deepEqual(await api.getJson('http://local'), { value: 1 });
  assert.equal(calls.length, 4);
  assert.ok(
    calls.every(
      (c) => c.args.executionId === 'owned-net' && c.timeout === null,
    ),
  );
  assert.equal(calls[1].args.req.timeoutMs, 20_000);
  assert.deepEqual(calls[1].args.req.query, { keep: '3' });
});

test('process context preserves configured deadlines beyond ten seconds and its execution ID', async () => {
  const calls = [];
  const api = load('util/context-data-util.ts', {
    '../../../../util/data/data-util': {
      getAppliedEnvValue: (value) => value,
      decodeBinary: (bytes) => new TextDecoder().decode(bytes),
    },
    '../../../../util/data/file-util': {},
    './worker-invoke': {
      call: async (command, args, timeout) => {
        calls.push({ command, args, timeout });
        return { stdout: [111, 107], stderr: [], exitCode: 7 };
      },
    },
    '../../../../state/model/license-state': {},
    '../../../../util/typescript-util': {},
    './parser/dcl-parser': { getObject: () => ({}) },
    './declare-util': {},
    '../../logic/util/logic-signature-cache': {},
  }).default;
  const entries = api.createObjects(
    {
      envs: [],
      resources: [],
      datasets: [],
      logics: [],
      processes: [
        {
          funcName: 'run',
          prgPath: 'C:\\program.exe',
          scriptArgs: [{ name: 'count', type: 'number' }],
          cmdArgs: ['--count', '__count__'],
          cwd: '',
          stdin: '',
          timeout: 25_000,
          encoding: { stdin: 'utf8', stdout: 'utf8', stderr: 'utf8' },
        },
      ],
    },
    { datasetMap: [] },
    { executionId: 'owned-process' },
  );
  assert.deepEqual(
    await entries.find((e) => e.name === '$process').value.run(3),
    { stdout: 'ok', stderr: '', exitCode: 7 },
  );
  assert.equal(calls[0].args.executionId, 'owned-process');
  assert.equal(calls[0].args.req.timeoutMs, 25_000);
  assert.deepEqual(calls[0].args.req.args, ['--count', '3']);
  assert.equal(calls[0].timeout, null);
});

const uiScanFixture = (options = {}) => {
  const calls = [],
    handlers = [],
    removed = [],
    alerts = [],
    counters = [],
    displays = [],
    searches = [],
    trees = [];
  let nextId = 0;
  const api = load(
    '../../maintenance/dataset/scan/dataset-scan-util.ts',
    {
      '@tauri-apps/api/core': {
        invoke: async (command, args) => {
          calls.push({ command, args });
          if (options.failure === 'invoke') throw new Error('scan failed');
          if (options.invoke) return options.invoke(command, args);
          return {
            node: {
              name: 'data',
              children: options.failure === 'root' ? null : [],
            },
          };
        },
      },
      '@tauri-apps/api/event': {
        listen: async (name, handler) => {
          assert.equal(name, 'progress');
          if (options.failure === 'listen') throw new Error('listen failed');
          handlers.push(handler);
          await options.listen?.();
          return () => {
            removed.push(handler);
            if (options.failure === 'unlisten')
              throw new Error('unlisten failed');
          };
        },
      },
    },
    {
      crypto: {
        randomUUID: () => {
          if (options.failure === 'id') throw new Error('id failed');
          return `scan-${++nextId}`;
        },
      },
      alert: (value) => alerts.push(String(value)),
    },
  ).default;
  const start = (extra = {}) =>
    api.buildDirectoryTree({
      scanRequest: { rootPath: 'C:\\data', dirConds: [], fileConds: [] },
      setCounter: (value) => counters.push(value),
      setScanningDispDir: (value) => displays.push(value),
      setSearch: (value) => searches.push(value),
      endProc: (value) => {
        if (options.failure === 'observer') throw new Error('observer failed');
        trees.push(value);
      },
      ...extra,
    });
  return {
    start,
    calls,
    handlers,
    removed,
    alerts,
    counters,
    displays,
    searches,
    trees,
  };
};

test('editor scan releases its progress listener on successful IPC completion without a done event', async () => {
  const gate = deferred();
  const f = uiScanFixture({ invoke: () => gate.promise });
  const run = f.start({
    scanRequest: { rootPath: 'C:\\', dirConds: [], fileConds: [] },
  });
  await turn();
  f.handlers[0]({
    payload: { scanId: 'foreign', path: 'C:\\other', counter: 99 },
  });
  f.handlers[0]({
    payload: { scanId: 'scan-1', path: 'C:\\child', counter: 2 },
  });
  assert.deepEqual(f.counters, [2]);
  assert.equal(f.calls[0].args.scanId, 'scan-1');
  assert.equal('executionId' in f.calls[0].args, false);
  gate.resolve({
    node: { name: 'C:\\', children: [{ name: 'one.txt', children: null }] },
  });
  await run;
  assert.equal(f.removed.length, 1);
  assert.deepEqual(f.searches, [false]);
  assert.equal(f.trees[0].path, 'C:\\');
  assert.equal(f.trees[0].child.nodes[0].path, 'C:\\one.txt');
  f.handlers[0]({
    payload: { scanId: 'scan-1', path: 'C:\\late', counter: 3 },
  });
  assert.deepEqual(f.counters, [2]);
});

for (const failure of ['id', 'listen', 'invoke', 'root', 'observer']) {
  test(`editor scan ${failure} failure releases state and any registered listener`, async () => {
    const f = uiScanFixture({ failure });
    await f.start();
    assert.equal(f.alerts.length, 1);
    assert.deepEqual(f.searches, [false]);
    assert.equal(f.removed.length, ['id', 'listen'].includes(failure) ? 0 : 1);
    assert.deepEqual(f.trees, []);
  });
}

test('editor scan resource overflow reports an error and releases its listener without installing a partial tree', async () => {
  const f = uiScanFixture({
    invoke: () => {
      throw new Error('Scan directory depth limit exceeded (64)');
    },
  });
  await f.start();
  assert.equal(f.removed.length, 1);
  assert.deepEqual(f.searches, [false]);
  assert.deepEqual(f.trees, []);
  assert.equal(f.alerts.length, 1);
  assert.match(f.alerts[0], /Scan directory depth limit exceeded/);
});

test('listener cleanup failure still releases editor search state', async () => {
  const f = uiScanFixture({ failure: 'unlisten' });
  await assert.rejects(f.start(), /unlisten failed/);
  assert.equal(f.removed.length, 1);
  assert.deepEqual(f.searches, [false]);
});

test('concurrent editor scans only observe their own progress and release independently', async () => {
  const gates = [deferred(), deferred()];
  const f = uiScanFixture({
    invoke: (_, args) => gates[Number(args.scanId.slice(-1)) - 1].promise,
  });
  const firstCounters = [],
    secondCounters = [];
  const first = f.start({ setCounter: (n) => firstCounters.push(n) });
  const second = f.start({ setCounter: (n) => secondCounters.push(n) });
  await turn();
  for (const handler of f.handlers)
    handler({ payload: { scanId: 'scan-1', path: 'C:\\data', counter: 1 } });
  assert.deepEqual(firstCounters, [1]);
  assert.deepEqual(secondCounters, []);
  gates[0].resolve({ node: { name: 'data', children: [] } });
  await first;
  for (const handler of f.handlers)
    handler({ payload: { scanId: 'scan-2', path: 'C:\\data', counter: 2 } });
  assert.deepEqual(firstCounters, [1]);
  assert.deepEqual(secondCounters, [2]);
  assert.equal(f.removed.length, 1);
  gates[1].resolve({ node: { name: 'data', children: [] } });
  await second;
  assert.equal(f.removed.length, 2);
});

for (const phase of ['before', 'listen', 'invoke']) {
  test(`aborting an editor scan observer during ${phase} suppresses obsolete view effects`, async () => {
    const controller = new AbortController(),
      gate = deferred();
    const f = uiScanFixture({
      listen: phase === 'listen' ? () => gate.promise : undefined,
      invoke: phase === 'invoke' ? () => gate.promise : undefined,
    });
    if (phase === 'before') controller.abort();
    const run = f.start({ signal: controller.signal });
    await turn();
    controller.abort();
    if (phase === 'invoke') assert.equal(f.removed.length, 1);
    for (const handler of f.handlers)
      handler({ payload: { scanId: 'scan-1', path: 'C:\\data', counter: 3 } });
    gate.resolve({ node: { name: 'data', children: [] } });
    await run;
    assert.equal(f.removed.length, phase === 'before' ? 0 : 1);
    assert.equal(f.calls.length, phase === 'invoke' ? 1 : 0);
    assert.deepEqual(f.trees, []);
    assert.deepEqual(f.alerts, []);
    assert.deepEqual(f.searches, []);
    assert.deepEqual(f.counters, []);
  });
}
