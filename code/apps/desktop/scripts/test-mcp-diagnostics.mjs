import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadDesktopMcpIdentity } from '../../../release/desktop-mcp.mjs';

const source = readFileSync(
  new URL('../src/app/mcp/mcp-diagnostics.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
new Function('exports', compiled)(module.exports);
const {
  emptyDiagnostics,
  diagnosticState,
  rejectionExplanation,
  createDiagnosticMonitor,
  rejectionKey,
  rejectionIndex,
} = module.exports;

// Render the real popover markup in an opened fixture; native interaction/layout
// acceptance remains a separate GUI check. All modules stay in memory.
const resolver = createRequire(import.meta.url);
const diagnosticModule =
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
  ).toString('base64');
const componentModule = (filename, replacements = [], dependencies = {}) => {
  let text = readFileSync(
    new URL('../src/app/mcp/' + filename, import.meta.url),
    'utf8',
  );
  for (const [from, to] of replacements) {
    assert.ok(text.includes(from), `Fixture replacement not found: ${from}`);
    text = text.replace(from, to);
  }
  const code = compile(text, { generate: 'server', filename }).js.code.replace(
    /from (['"])([^'"]+)\1/g,
    (_match, _quote, name) => {
      const url =
        name === '../product-info'
          ? 'data:text/javascript;base64,' +
            Buffer.from(
              'export const PRODUCT_INFO = ' +
                JSON.stringify(loadDesktopMcpIdentity()) +
                ';',
            ).toString('base64')
          : name === './mcp-diagnostics'
            ? diagnosticModule
            : (dependencies[name] ??
              pathToFileURL(resolver.resolve(name)).href);
      return `from '${url}'`;
    },
  );
  return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
};
const dialogModule = componentModule('McpDiagnosticsDialog.svelte');
const Dialog = (await import(dialogModule)).default;
const RejectionsDialog = (
  await import(
    componentModule('McpDiagnosticsDialog.svelte', [
      [
        "let view: 'overview' | 'rejections' | 'help' = 'overview';",
        "let view: 'overview' | 'rejections' | 'help' = 'rejections';",
      ],
    ])
  )
).default;
const HelpDialog = (
  await import(
    componentModule('McpDiagnosticsDialog.svelte', [
      [
        "let view: 'overview' | 'rejections' | 'help' = 'overview';",
        "let view: 'overview' | 'rejections' | 'help' = 'help';",
      ],
    ])
  )
).default;
const Badge = (
  await import(
    componentModule(
      'McpSessionBadge.svelte',
      [['let expanded = false;', 'let expanded = true;']],
      { './McpDiagnosticsDialog.svelte': dialogModule },
    )
  )
).default;
const renderBadge = (diagnostics, extra = {}) =>
  render(Badge, {
    props: {
      isOpenProject: true,
      state: diagnosticState(diagnostics),
      session: diagnostics.session,
      diagnostics,
      onToggle: () => {},
      ...extra,
    },
  }).body;
const turn = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test('publication, verification history, cleanup failure and stopped are distinct', () => {
  const stopped = emptyDiagnostics();
  assert.equal(diagnosticState(stopped), 'stopped');
  const published = {
    ...stopped,
    session: { sessionId: 'a', endpoint: 'http://127.0.0.1:1' },
    published: true,
  };
  assert.equal(diagnosticState(published), 'available');
  const rejected = { ...published, rejectedRequests: 5 };
  assert.equal(diagnosticState(rejected), 'available'); // One rejected peer cannot disable the bridge.
  const accepted = { ...rejected, lastAcceptedAt: 123, lastPeerGeneration: 1 };
  assert.equal(diagnosticState(accepted), 'verified');
  assert.equal(diagnosticState({ ...accepted, published: false }), 'error');
  assert.equal(diagnosticState(emptyDiagnostics()), 'stopped');
  assert.notEqual(emptyDiagnostics().rejections, emptyDiagnostics().rejections);
});

test('rejection guidance explains matching generations, legacy, malformed and process restart', () => {
  for (const code of [
    'MCP_CONTRACT_REQUIRED',
    'MCP_CONTRACT_INVALID',
    'MCP_BRIDGE_GENERATION_INVALID',
    'MCP_BRIDGE_GENERATION_MISMATCH',
    'future-code',
  ]) {
    const explanation = rejectionExplanation(code);
    assert.ok(explanation.reason.length > 0);
    assert.match(explanation.action, /restart/i);
    assert.doesNotMatch(explanation.action, /same (product )?version/i);
  }
  assert.match(
    rejectionExplanation('MCP_BRIDGE_GENERATION_MISMATCH').action,
    /same MCP generation/,
  );
  assert.match(rejectionExplanation('MCP_CONTRACT_REQUIRED').reason, /legacy/);
});

test('popover contains only controls, MCP generation and concise state, never diagnostic history', () => {
  const identity = loadDesktopMcpIdentity();
  const diagnostics = {
    ...emptyDiagnostics(),
    session: {
      sessionId: 'abc-session-full-id',
      endpoint: 'http://127.0.0.1:1',
    },
    published: true,
  };
  let html = renderBadge(diagnostics);
  assert.match(html, new RegExp(`gen ${identity.bridgeProtocolGen}`));
  assert.match(html, /Ready to receive requests/);
  assert.doesNotMatch(
    html,
    /TRACE KERNEL|Development Session|Desktop version|API gen|Workspace gen/,
  );
  assert.doesNotMatch(
    html,
    /Endpoint|Accepted|Last compatible|Recent compatibility|No compatibility|Compatibility rejects:/,
  );
  assert.match(html, /Session ID/);
  assert.match(html, /Diagnostics/);
  assert.doesNotMatch(html, />Connected<|>Clients</);
  diagnostics.lastAcceptedAt = 123;
  diagnostics.lastPeerGeneration = identity.bridgeProtocolGen;
  diagnostics.rejectedRequests = 7;
  diagnostics.rejections = [
    {
      code: 'MCP_BRIDGE_GENERATION_MISMATCH',
      expectedGeneration: identity.bridgeProtocolGen,
      actualGeneration: identity.bridgeProtocolGen + 1,
      firstSeenAt: 123,
      lastSeenAt: 456,
      count: 7,
    },
  ];
  html = renderBadge(diagnostics);
  assert.match(html, /Verified request/);
  assert.match(html, /Compatible request received \(history\)/);
  assert.match(html, /Compatibility rejects: 7/);
  assert.doesNotMatch(
    html,
    /MCP_BRIDGE_GENERATION_MISMATCH|restart|Preflight failures/,
  );
  assert.match(html, /Stop MCP/);
  assert.match(
    renderBadge({ ...diagnostics, published: false }),
    /Cleanup pending/,
  );
  assert.match(renderBadge(emptyDiagnostics()), /Publish MCP/);
  assert.match(
    renderBadge(diagnostics, {
      state: 'error',
      diagnosticError: 'Status unavailable',
    }),
    /See diagnostics/,
  );
});

const rejectionFixture = (
  actualGeneration = 2,
  code = 'MCP_BRIDGE_GENERATION_MISMATCH',
) => ({
  code,
  expectedGeneration: 1,
  actualGeneration,
  firstSeenAt: 123,
  lastSeenAt: 456,
  count: 2,
});
const dialogProps = (diagnostics, extra = {}) => ({
  diagnostics,
  session: diagnostics.session,
  state: diagnosticState(diagnostics),
  onClose: () => {},
  ...extra,
});

test('diagnostic overview preserves connection, metrics, state meanings and recovery information', () => {
  const diagnostics = {
    ...emptyDiagnostics(),
    session: {
      sessionId: 'full-session-id',
      endpoint: 'http://127.0.0.1:1234',
    },
    published: true,
  };
  let html = render(Dialog, { props: dialogProps(diagnostics) }).body;
  assert.match(html, /MCP gen:/);
  assert.match(html, /full-session-id/);
  assert.match(html, /http:\/\/127.0.0.1:1234/);
  assert.match(html, /Ready to receive requests/);
  assert.doesNotMatch(html, /Desktop version|API gen|Workspace gen/);
  diagnostics.lastAcceptedAt = 123;
  diagnostics.lastPeerGeneration = 1;
  html = render(Dialog, { props: dialogProps(diagnostics) }).body;
  assert.match(html, /\(history\)/);
  assert.match(html, /Last compatible request/);
  assert.match(
    render(Dialog, { props: dialogProps({ ...diagnostics, published: false }) })
      .body,
    /finish cleanup/,
  );
  assert.match(
    render(Dialog, {
      props: dialogProps(diagnostics, {
        diagnosticError: 'Status unavailable',
      }),
    }).body,
    /Status unavailable/,
  );
  assert.match(
    render(Dialog, { props: dialogProps(emptyDiagnostics()) }).body,
    /not published/,
  );
});

test('rejection view renders one group at a time with pagination, generations and remediation', () => {
  const diagnostics = {
    ...emptyDiagnostics(),
    rejectedRequests: 16,
    rejections: Array.from({ length: 8 }, (_, index) =>
      rejectionFixture(index + 2),
    ),
  };
  const html = render(RejectionsDialog, {
    props: dialogProps(diagnostics),
  }).body;
  assert.equal((html.match(/<article/g) ?? []).length, 1);
  assert.match(html, /MCP_BRIDGE_GENERATION_MISMATCH/);
  assert.match(html, /Requester MCP gen 2/);
  assert.doesNotMatch(html, /Requester MCP gen 3/);
  assert.match(html, /same MCP generation/);
  assert.doesNotMatch(html, /Preflight failures|latest 8 groups/);
  assert.match(html, /1 \/ 8/);
  assert.match(html, /disabled[^>]*>Previous/);
  const legacy = {
    ...diagnostics,
    rejections: [rejectionFixture(null, 'MCP_CONTRACT_REQUIRED')],
  };
  const legacyHtml = render(RejectionsDialog, {
    props: dialogProps(legacy),
  }).body;
  assert.match(legacyHtml, /Requester MCP gen Unknown/);
  assert.match(legacyHtml, /legacy format/);
  assert.match(legacyHtml, /restart/);
  assert.match(legacyHtml, /disabled[^>]*>Next/);
  const emptyHtml = render(RejectionsDialog, {
    props: dialogProps(emptyDiagnostics()),
  }).body;
  assert.match(emptyHtml, /No compatibility rejections observed/);
  assert.doesNotMatch(emptyHtml, /Rejection history pages|<article/);
});

test('Help keeps the communication semantics and diagnostic scope out of the operational views', () => {
  const html = render(HelpDialog, {
    props: dialogProps(emptyDiagnostics()),
  }).body.replace(/\s+/g, ' ');
  assert.match(html, /not that a client is\s+connected/);
  assert.match(html, /not a persistent\s+connection/);
  assert.match(html, /Product versions may differ/);
  assert.match(html, /Preflight failures/);
  assert.match(html, /latest 8 groups/);
  assert.match(html, /does not restart external processes/);
});

test('history selection survives polling reorder/count changes and falls back safely on eviction or reset', () => {
  const first = rejectionFixture(2),
    selected = rejectionFixture(null, 'MCP_CONTRACT_REQUIRED');
  const key = rejectionKey(selected);
  assert.equal(rejectionIndex([first, selected], key), 1);
  assert.equal(
    rejectionIndex([{ ...selected, count: 99, lastSeenAt: 999 }, first], key),
    0,
  );
  assert.equal(rejectionIndex([first], key), 0);
  assert.equal(rejectionIndex([], key), 0);
  assert.notEqual(rejectionKey(first), key);
});

const setup = () => {
  const reads = [],
    applied = [],
    errors = [],
    schedules = [];
  const monitor = createDiagnosticMonitor(
    () => {
      const item = deferred();
      reads.push(item);
      return item.promise;
    },
    (value) => applied.push(value),
    () => errors.push(true),
    (callback) => {
      const item = { callback, cancelled: false };
      schedules.push(item);
      return () => {
        item.cancelled = true;
      };
    },
  );
  return { monitor, reads, applied, errors, schedules };
};

test('monitor polls after completion, not concurrently, and disposes its timer', async () => {
  const context = setup();
  assert.equal(context.reads.length, 1);
  assert.equal(context.schedules.length, 0);
  context.reads[0].resolve(emptyDiagnostics());
  await turn();
  assert.equal(context.applied.length, 1);
  assert.equal(context.schedules.length, 1);
  context.schedules[0].callback();
  assert.equal(context.reads.length, 2);
  context.reads[1].reject(new Error('private diagnostic detail'));
  await turn();
  assert.equal(context.errors.length, 1);
  context.monitor.dispose();
  assert.equal(context.schedules[1].cancelled, true);
});

test('a start/stop cycle suppresses stale replies and cannot create a second polling loop', async () => {
  const context = setup();
  context.monitor.pause();
  context.monitor.resume();
  assert.equal(context.reads.length, 2);
  const fresh = {
    ...emptyDiagnostics(),
    session: { sessionId: 'new', endpoint: 'http://127.0.0.1:1' },
    published: true,
  };
  context.reads[1].resolve(fresh);
  await turn();
  context.reads[0].resolve({
    ...fresh,
    session: { ...fresh.session, sessionId: 'old' },
  });
  await turn();
  assert.deepEqual(context.applied, [fresh]);
  assert.equal(context.schedules.length, 1);
  context.monitor.dispose();
});

test('paused or unmounted monitor neither applies failures nor schedules more work', async () => {
  for (const stop of ['pause', 'dispose']) {
    const context = setup();
    context.monitor[stop]();
    context.reads[0].reject(new Error('private detail'));
    await turn();
    assert.equal(context.errors.length, 0);
    assert.equal(context.applied.length, 0);
    assert.equal(context.schedules.length, 0);
    context.monitor.dispose();
    context.monitor.resume();
    assert.equal(context.reads.length, 1);
  }
});

test('cancelled callbacks and duplicate resume cannot start extra poll loops', async () => {
  const context = setup();
  context.reads[0].resolve(emptyDiagnostics());
  await turn();
  const oldCallback = context.schedules[0].callback;
  context.monitor.pause();
  context.monitor.resume();
  context.monitor.resume();
  oldCallback();
  assert.equal(context.reads.length, 2);
  context.monitor.dispose();
  oldCallback();
  context.reads[1].resolve(emptyDiagnostics());
  await turn();
  assert.equal(context.applied.length, 1);
  assert.equal(context.schedules.length, 1);
});

test('a failed probe can recover without silently retaining a stale verified status', async () => {
  const context = setup();
  context.reads[0].reject(new Error('ignored raw IPC error'));
  await turn();
  assert.equal(context.errors.length, 1);
  context.schedules[0].callback();
  context.reads[1].resolve(emptyDiagnostics());
  await turn();
  assert.equal(context.applied[0].published, false);
  context.monitor.dispose();
});
