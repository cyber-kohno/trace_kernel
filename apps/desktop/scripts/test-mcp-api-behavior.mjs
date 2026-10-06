import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const utilDir = path.join(
  appDir,
  'src',
  'app',
  'contents',
  'detail',
  'program',
  'util',
);
let tokenSequence = 0;
const sourcePath = (...parts) =>
  path.join(
    appDir,
    'src',
    'app',
    'contents',
    'detail',
    'program',
    'util',
    'parser',
    ...parts,
  );
const loadMockedNamespace = (filePath, namespaceName, mocks) =>
  loadNamespace(filePath, namespaceName, (moduleName) => {
    const match = Object.entries(mocks).find(([suffix]) =>
      moduleName.endsWith(suffix),
    );
    assert.ok(
      match,
      `${namespaceName} requested unexpected module ${moduleName}`,
    );
    const mocked = typeof match[1] === 'function' ? match[1]() : match[1];
    return { default: mocked };
  });

const loadNamespace = (filePath, namespaceName, requireMock = () => {}) => {
  const source = readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (moduleName) => {
    const imported = requireMock(moduleName);
    return imported?.default ? { ...imported, __esModule: true } : imported;
  };
  new Function('exports', 'require', 'module', output)(
    module.exports,
    localRequire,
    module,
  );
  const api = module.exports.default;
  const requiredExport =
    {
      ExcelParser: 'parse',
      DclRuntime: 'getObject',
      DclState: 'getObject',
      PathUtil: 'validateWindowsPath',
      TxPathValidate: 'windowsPath',
      MakeDir: 'execute',
      RuntimeUtil: 'getInitialVfsState',
      DclFSTransaction: 'getObject',
      DeleteFile: 'byPath',
      RenameFile: 'byPath',
      SaveFile: 'execute',
      UpdateFile: 'execute',
      OpenText: 'execute',
      CopyFile: 'byPath',
      DeleteDir: 'execute',
    }[namespaceName] ?? 'create';
  assert.equal(
    typeof api?.[requiredExport],
    'function',
    `${namespaceName} namespace did not transpile`,
  );
  return api;
};

const tableInspector = loadNamespace(
  sourcePath('inspector', 'table-inspector.ts'),
  'TableInspector',
);
const table = tableInspector.create([
  { name: 'alpha', count: 3 },
  { name: 'beta', count: 0 },
]);
assert.equal(table.rowCount(), 2);
assert.equal(table.colCount(), 2);
assert.deepEqual(table.columns(), ['name', 'count']);
assert.equal(table.row(0).getString('name'), 'alpha');
assert.equal(table.row(1).getNumber('count'), 0);
assert.equal(table.row(0).has('missing'), false);
assert.deepEqual(table.row(0).keys(), ['name', 'count']);
assert.throws(() => table.row(-1), /Row index out of range: -1/);
assert.throws(() => table.row(2), /Row index out of range: 2/);
assert.throws(() => table.row(0).get('missing'), /Column not found: "missing"/);
assert.throws(() => table.row(0).getNumber('name'), /is not number/);
assert.deepEqual(tableInspector.create([]).columns(), []);

const runtimeApi = loadNamespace(
  path.join(utilDir, 'dcl-runtime.ts'),
  'DclRuntime',
);
const runtime = runtimeApi.getObject();
assert.throws(
  () => runtime.exit(),
  (error) => runtimeApi.isExitSignal(error),
);
assert.equal(runtimeApi.isExitSignal(new Error('Runtime exited.')), false);
assert.equal(
  runtimeApi.isExitSignal(
    Object.assign(new Error('Runtime exited.'), {
      name: 'DclRuntimeExitSignal',
    }),
  ),
  true,
);

const messages = [];
globalThis.postMessage = (message) => messages.push(message);
const stateApi = loadNamespace(
  path.join(utilDir, 'dcl-state.ts'),
  'DclState',
  (moduleName) => {
    assert.match(moduleName, /post-util/);
    return {
      default: {
        buildPostStateProgressStart: (total) => ({
          type: 'progress-start',
          total,
        }),
        buildPostStateProgressTick: () => ({ type: 'progress-tick' }),
        buildPostStateMonitorInit: (size) => ({ type: 'monitor-init', size }),
        buildPostStateMonitorSet: (index, value) => ({
          type: 'monitor-set',
          index,
          value,
        }),
      },
    };
  },
);
const workerCache = { progress: { total: 0, current: 9 } };
const state = stateApi.getObject(workerCache);
const progress = state.useProgress(2);
assert.equal(progress.getCurrent(), 0);
progress.tick();
assert.equal(progress.getCurrent(), 1);
const monitor = state.useMonitor(2);
monitor[1]('ready');
assert.deepEqual(messages, [
  { type: 'progress-start', total: 2 },
  { type: 'progress-tick' },
  { type: 'monitor-init', size: 2 },
  { type: 'monitor-set', index: 1, value: 'ready' },
]);

const txPath = path.join(utilDir, 'fs', 'tx');
const pathUtil = loadNamespace(
  path.join(appDir, 'src', 'app', 'util', 'data', 'path-util.ts'),
  'PathUtil',
);
const runtimeUtil = loadNamespace(
  path.join(
    appDir,
    'src',
    'app',
    'contents',
    'detail',
    'program',
    'runtime',
    'runtime-util.ts',
  ),
  'RuntimeUtil',
);
const txValidator = loadMockedNamespace(
  path.join(txPath, 'tx-path-validate.ts'),
  'TxPathValidate',
  { 'path-util': pathUtil },
);
const txMocks = {
  'delete-file': () =>
    loadNamespace(path.join(txPath, 'delete-file.ts'), 'DeleteFile'),
  'rename-file': () =>
    loadMockedNamespace(path.join(txPath, 'rename-file.ts'), 'RenameFile', {
      'runtime-util': runtimeUtil,
      'tx-path-validate': txValidator,
    }),
  'save-file': () =>
    loadMockedNamespace(path.join(txPath, 'save-file.ts'), 'SaveFile', {
      'path-util': pathUtil,
      'runtime-util': runtimeUtil,
      'tx-path-validate': txValidator,
    }),
  'update-file': () =>
    loadMockedNamespace(path.join(txPath, 'update-file.ts'), 'UpdateFile', {
      'runtime-util': runtimeUtil,
    }),
  'open-text': () =>
    loadMockedNamespace(path.join(txPath, 'open-text.ts'), 'OpenText', {
      'data-util': { decodeBinary: (bytes) => new TextDecoder().decode(bytes) },
      'runtime-util': runtimeUtil,
      'real-fs-writer': {
        assertTextReadSize: async () => ({ modifiedAt: 1, size: 8 }),
        readBinary: async () => [...new TextEncoder().encode('fixture')],
      },
      'tx-path-validate': txValidator,
    }),
  'copy-file': () =>
    loadMockedNamespace(path.join(txPath, 'copy-file.ts'), 'CopyFile', {
      'path-util': pathUtil,
      'runtime-util': runtimeUtil,
      'tx-path-validate': txValidator,
    }),
  'make-dir': () =>
    loadMockedNamespace(path.join(txPath, 'make-dir.ts'), 'MakeDir', {
      'path-util': pathUtil,
      'runtime-util': runtimeUtil,
      'tx-path-validate': txValidator,
    }),
  'delete-dir': () =>
    loadMockedNamespace(path.join(txPath, 'delete-dir.ts'), 'DeleteDir', {
      'path-util': pathUtil,
      'runtime-util': runtimeUtil,
      'tx-path-validate': txValidator,
    }),
  'runtime-util': runtimeUtil,
};
const txApi = loadMockedNamespace(
  path.join(txPath, 'dcl-fs-transaction.ts'),
  'DclFSTransaction',
  txMocks,
);
const txState = {
  pathIndex: new Map(),
  fileTable: new Map(),
  dirTable: new Map(),
  reservedPaths: new Set(),
  copyOps: [],
};
const tx = txApi.getObject(txState);
tx.saveText('C:\\fixture\\new.txt', 'new');
const createdToken = txState.pathIndex.get('C:\\fixture\\new.txt');
tx.updateText(createdToken, 'updated');
assert.equal(txState.fileTable.get(createdToken).textCache.current, 'updated');
assert.throws(
  () => tx.saveText('C:\\fixture\\new.txt', 'again'),
  /file already created/,
);
tx.copyFile('C:\\fixture\\source.txt', 'C:\\fixture\\copy.txt');
assert.deepEqual(txState.copyOps, [
  {
    from: 'C:\\fixture\\source.txt',
    dest: 'C:\\fixture\\copy.txt',
    existVirtualDir: false,
  },
]);
assert.throws(
  () => tx.copyFile('C:\\fixture\\source.txt', 'C:\\fixture\\copy.txt'),
  /already reserved/,
);
tx.renameFile('C:\\fixture\\old.txt', 'renamed.txt');
assert.equal(
  [...txState.fileTable.values()].find(
    (entry) => entry.path === 'C:\\fixture\\old.txt',
  ).renameTo,
  'C:\\fixture\\renamed.txt',
);
assert.throws(
  () => tx.renameFile('C:\\fixture\\another.txt', 'bad/name.txt'),
  /invalid Windows character/,
);
const dirApi = loadMockedNamespace(
  path.join(txPath, 'make-dir.ts'),
  'MakeDir',
  { 'path-util': pathUtil, 'tx-path-validate': txValidator },
);
const dirState = {
  ...txState,
  pathIndex: new Map(),
  fileTable: new Map(),
  reservedPaths: new Set(),
  dirTable: new Map(),
};
dirApi.execute(dirState, 'C:\\fixture\\folder');
assert.equal(dirState.dirTable.get('C:\\fixture\\folder').intent, 'create');
assert.throws(
  () => dirApi.execute(dirState, 'C:\\fixture\\folder\\bad:name'),
  /invalid Windows character/,
);

const jsonInspector = loadNamespace(
  sourcePath('inspector', 'json-inspector.ts'),
  'JsonInspector',
);
const json = jsonInspector.create({
  people: [{ name: 'A', active: true, score: 7 }],
  absentValue: null,
});
assert.equal(json.queryString('people[0].name'), 'A');
assert.equal(json.queryNumber('people[0].score'), 7);
assert.equal(json.queryBoolean('people[0].active'), true);
assert.equal(json.exists('absentValue'), true);
assert.equal(json.exists('people[2]'), false);
assert.deepEqual(json.keys('people[0]'), ['name', 'active', 'score']);
assert.equal(json.length('people'), 1);
assert.throws(() => json.query('people[2]'), /Path not found/);
assert.throws(() => json.queryNumber('people[0].name'), /is not number/);
assert.throws(() => json.query('people[0'), /missing \"]\"/);
assert.throws(() => json.query('people[nope]'), /Invalid array index/);
assert.equal(
  jsonInspector.create([{ label: 'A,B', value: 4 }]).toCsv(),
  'label,value\n"A,B",4',
);
assert.equal(
  jsonInspector.create([{ label: 'A\tB', value: 4 }]).toTsv(),
  'label\tvalue\nA\\tB\t4',
);
assert.throws(() => jsonInspector.create({}).toCsv(), /root must be an array/);
assert.throws(() => jsonInspector.create([]).toTsv(), /at least one record/);
assert.throws(
  () => jsonInspector.create([{ a: 1 }, { b: 2 }]).toCsv(),
  /does not match/,
);
assert.equal(jsonInspector.create([{ a: 1 }, { a: '2' }]).toCsv(), 'a\n1\n2');
assert.throws(
  () => jsonInspector.create([{ a: null }]).toCsv(),
  /string or number/,
);

let invoked;
const excelParser = loadNamespace(
  sourcePath('excel-parser.ts'),
  'ExcelParser',
  (moduleName) => {
    assert.match(moduleName, /worker-invoke/);
    return {
      default: {
        call: async (command, args) => {
          invoked = { command, args };
          return {
            sheets: [
              {
                name: 'Data',
                maxRow: 2,
                maxCol: 2,
                rows: [
                  {
                    index: 0,
                    cells: [
                      { row: 0, col: 0, value: 'name' },
                      { row: 0, col: 1, value: 'count' },
                    ],
                  },
                  {
                    index: 1,
                    cells: [
                      { row: 1, col: 0, value: 'alpha' },
                      { row: 1, col: 1, value: '3' },
                    ],
                  },
                ],
              },
            ],
          };
        },
      },
    };
  },
);
const book = await excelParser.parse('C:/fixture.xlsx');
assert.deepEqual(invoked, {
  command: 'excel_parse_file',
  args: { filePath: 'C:/fixture.xlsx' },
});
const sheet = book.sheet('Data');
assert.equal(sheet.rowAt(1)?.cellAt(0)?.address, 'A2');
assert.equal(sheet.cellAt('$B$2')?.value, '3');
assert.equal(sheet.cellAt('not-an-address'), null);
assert.equal(sheet.cellAt(9, 0), null);
assert.deepEqual(sheet.toTable(), [{ name: 'alpha', count: '3' }]);
assert.throws(() => sheet.toTable(9), /Header row not found/);
assert.equal(book.sheet('missing'), null);

console.log(
  'MCP API behavioral boundaries passed (Table, JSON, Excel, Runtime, State).',
);
