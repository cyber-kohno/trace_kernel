import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (relative, mocks = {}, fetchMock) => {
  const output = ts.transpileModule(
    readFileSync(path.join(appDir, relative), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    const match = Object.keys(mocks).find((suffix) => name.endsWith(suffix));
    return match == null
      ? require(name)
      : { __esModule: true, ...mocks[match] };
  };
  new Function('require', 'exports', 'module', 'fetch', output)(
    localRequire,
    module.exports,
    module,
    fetchMock,
  );
  return module.exports;
};
const moduleDefault = (value) => ({ default: value });
const utilDir = 'src/app/contents/detail/program/util/';
const restrictions = load('src/app/util/monaco/restricted-globals.ts');
const analysis = load('src/app/util/typescript/script-analysis.ts', {
  'restricted-globals': restrictions,
});
const nameValidation = load('src/app/util/data/work-name-validation.ts');

for (const source of [
  'await fetch("example");',
  'console.log("hello");',
  'const x = { fetch };',
]) {
  assert.ok(analysis.getRestrictedGlobalDiagnostics(source).length > 0, source);
}
for (const source of [
  '// fetch console\nconst text = "fetch console";',
  'const obj = { fetch() {} }; obj.fetch();',
  'const fetch = () => 1; fetch();',
  'function f(fetch: () => number) { return fetch(); }',
  'const obj = { console: 1, fetch: 2 };',
]) {
  assert.deepEqual(analysis.getRestrictedGlobalDiagnostics(source), [], source);
}
const position = analysis.getRestrictedGlobalDiagnostics(
  '// comment\nfetch("x");',
)[0];
assert.equal(position.line, 2);
assert.equal(position.column, 1);
assert.deepEqual(nameValidation.validateWorkName('Sales summary', []), []);
assert.deepEqual(nameValidation.validateWorkName('売上集計', []), []);
assert.equal(nameValidation.validateWorkName('', [])[0].code, 'INVALID_NAME');
assert.equal(
  nameValidation.validateWorkName('Sales summary', ['Sales summary'])[0].code,
  'DUPLICATE_NAME',
);
assert.deepEqual(
  nameValidation.validateWorkName('Sales summary', ['Sales summary'], 0),
  [],
);

const data = load('src/app/util/data/data-util.ts').default;
const logicSource = load(
  'src/app/contents/detail/logic/util/logic-source-util.ts',
).default;
const cache = load(
  'src/app/contents/detail/logic/util/logic-signature-cache.ts',
  { 'logic-source-util': moduleDefault(logicSource) },
).default;
let pro = false;
const license = { isPro: () => pro };
const parser = load(utilDir + 'parser/dcl-parser.ts', {
  'dom-parser': moduleDefault({}),
  'excel-parser': moduleDefault({}),
  'table-inspector': moduleDefault({}),
  'json-inspector': moduleDefault({}),
  'data-util': moduleDefault(data),
}).default;
const declare = load(utilDir + 'declare-util.ts', {
  'dcl-file-system': moduleDefault({}),
  'dcl-runtime': moduleDefault({}),
  'dcl-net': moduleDefault({}),
  'dcl-state': moduleDefault({}),
  'dcl-channel': moduleDefault({}),
  'license-state': moduleDefault(license),
  'runtime-util': moduleDefault({}),
  'dcl-parser': moduleDefault(parser),
}).default;
const context = load(utilDir + 'context-data-util.ts', {
  'data-util': moduleDefault(data),
  'file-util': moduleDefault({}),
  'worker-invoke': moduleDefault({}),
  'license-state': moduleDefault(license),
  'typescript-util': moduleDefault({}),
  'dcl-parser': moduleDefault(parser),
  'declare-util': moduleDefault(declare),
  'logic-signature-cache': moduleDefault(cache),
}).default;
const injection = load(
  'src/app/contents/maintenance/program/injection/program-injection-util.ts',
  {
    'context-data-util': moduleDefault(context),
    'declare-util': moduleDefault(declare),
    'logic-signature-cache': moduleDefault(cache),
  },
).default;
const emptyWorkspace = () => ({
  envs: [],
  resources: [],
  datasets: [],
  processes: [],
  logics: [],
  works: [],
  declare: { source: '' },
});
const workspace = emptyWorkspace();
workspace.logics = [
  { name: 'calc', source: 'export default function() { return 1; }' },
];
assert.deepEqual(injection.getWorkContextItems(workspace, []), []);
assert.deepEqual(injection.getLogicContextItems(workspace, []), []);
assert.deepEqual(injection.getWorkContextDeclarations(workspace, []), []);
pro = true;
assert.ok(
  injection
    .getWorkContextItems(workspace, [])
    .some((item) => item.prefix === '$logic'),
);
assert.deepEqual(
  injection.getWorkContextItems(workspace, [{ cat: 'logic', index: 0 }]),
  [],
);
workspace.declare.source = 'declare const helper: () => { total: number };';
workspace.logics[0].source = 'export default function() { return helper(); }';
const current = context.getUsableData(workspace, []);
assert.match(
  context.getLogicSignature(
    workspace.logics[0],
    current,
    workspace.declare.source,
  ).returnType,
  /total: number/,
);
assert.match(
  injection.getWorkContextItems(workspace, [])[0].item,
  /total: number/,
);
assert.match(
  injection.getWorkContextDeclarations(workspace, []).join('\n'),
  /total: number/,
);
workspace.logics.push({
  name: 'derived',
  source: 'export default function() { return $logic.calc(); }',
});
assert.match(
  injection.getWorkContextItems(workspace, [])[1].item,
  /total: number/,
);
assert.match(
  injection.getWorkContextDeclarations(workspace, []).join('\n'),
  /"derived": \(\) => \{ total: number/,
);
workspace.declare.source = 'declare const helper: () => { label: string };';
assert.match(
  injection.getWorkContextItems(workspace, [])[1].item,
  /label: string/,
);
assert.doesNotMatch(
  injection.getWorkContextDeclarations(workspace, []).join('\n'),
  /total: number/,
);

const resourceWorkspace = emptyWorkspace();
resourceWorkspace.resources = [
  {
    varName: 'example',
    parse: 'csv',
    source: 'id,note\n1,\n2,ready',
    parseValidated: true,
  },
];
const definitions = injection.getWorkContextDeclarations(resourceWorkspace, []);
assert.match(definitions.join('\n'), /"note": string \| null/);
assert.match(definitions.join('\n'), /"id": number/);
assert.deepEqual(
  definitions,
  context.createDeclareDef(
    context.getUsableData(resourceWorkspace, []),
    resourceWorkspace.declare.source,
  ),
);
assert.equal(
  data.convertTableToColDefs('id,note\n1,ready', 'csv')[1].nullable,
  false,
);
assert.equal(
  data.convertTableToColDefs('id\tnote\n1\t', 'tsv')[1].nullable,
  true,
);
resourceWorkspace.resources[0].source =
  'id,note\n' +
  Array.from({ length: 10 }, (_, index) => `${index},ready`).join('\n') +
  '\n10,';
assert.match(
  injection.getWorkContextDeclarations(resourceWorkspace, []).join('\n'),
  /"note": string \| null/,
);

const libDir = path.dirname(require.resolve('typescript/lib/lib.es2020.d.ts'));
const libs = Object.fromEntries(
  readdirSync(libDir)
    .filter((name) => /^lib\..*\.d\.ts$/.test(name))
    .map((name) => [name, readFileSync(path.join(libDir, name), 'utf8')]),
);
const { validateWorkTypes } = load(
  'src/app/mcp/semantic-work-validator.ts',
  {
    'script-analysis': analysis,
    'virtual:trace-kernel-ts-libs': moduleDefault('in-memory-typescript-libs'),
  },
  async () => ({ ok: true, json: async () => libs }),
);
const work = (source) => ({ name: 'Sales summary', method: 'plain', source });
const declarations = {
  contextDeclarations: [],
  apiDeclarations: ['declare const $println: (value: string) => void;'],
  declare: '',
};
const fetchDiagnostics = await validateWorkTypes(
  work('await fetch("example");'),
  declarations,
);
assert.ok(fetchDiagnostics.some((diagnostic) => diagnostic.code === 90001));
assert.equal(
  fetchDiagnostics.find((diagnostic) => diagnostic.code === 90001).message,
  analysis.getRestrictedGlobalDiagnostics('await fetch("example");')[0].message,
);
assert.deepEqual(
  await validateWorkTypes(work('$println("hello");'), declarations),
  [],
);
const nullableDeclarations = {
  ...declarations,
  contextDeclarations: definitions,
};
assert.ok(
  (
    await validateWorkTypes(
      work('$println($resource.example[0].note.toUpperCase());'),
      nullableDeclarations,
    )
  ).length > 0,
);
assert.deepEqual(
  await validateWorkTypes(
    work('$println(($resource.example[0].note ?? "").toUpperCase());'),
    nullableDeclarations,
  ),
  [],
);

console.log(
  'MCP/GUI consistency passed: restrictions, Work names, Logic licensing/Declare/dependencies, Resource nullability.',
);
