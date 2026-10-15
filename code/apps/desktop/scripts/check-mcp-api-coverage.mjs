import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoAppsDir = path.resolve(appDir, '..');
const read = (relativePath) =>
  readFileSync(path.join(appDir, relativePath), 'utf8');
const readMcp = (relativePath) =>
  readFileSync(path.join(repoAppsDir, 'mcp', relativePath), 'utf8');
const ledger = readMcp('API_COVERAGE.md');

// Execute the shared declaration factory used by get_work_context, not a
// reconstruction of selected string literals from its implementation.
const coreDir = path.resolve(appDir, '../../packages/runtime-core');
const coreSourceDir = path.join(coreDir, 'src');
const requireCore = createRequire(path.join(coreDir, 'package.json'));
const modules = new Map();
const loadCore = (file) => {
  assert.ok(file.startsWith(coreSourceDir + path.sep), `Host import: ${file}`);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require', 'exports', 'module', compiled)(
    (name) =>
      name.startsWith('.')
        ? loadCore(path.resolve(path.dirname(file), name + '.ts'))
        : requireCore(name),
    module.exports,
    module,
  );
  return module.exports;
};
const api = loadCore(
  path.join(coreSourceDir, 'declarations/api-declarations.ts'),
).default;
const declarations = (name) => {
  const { typeDec, valueDec } = api.createUtilDeclareDef(name);
  return `${typeDec}\ndeclare const $${name}: ${valueDec};`;
};
const coverageDeclaration = (name) => {
  const { typeDec, valueDec } = api.createUtilDeclareDef(name);
  return `${typeDec}\ntype CoverageAPI = ${valueDec};`;
};

const collectTypeMembers = (declarations, rootNames, family) => {
  const file = ts.createSourceFile(
    `${family}.d.ts`,
    declarations,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length > 0) {
    const first = file.parseDiagnostics[0];
    throw new Error(
      `Could not parse ${family} declarations: ${ts.flattenDiagnosticMessageText(first.messageText, '\n')}`,
    );
  }

  const aliases = new Map(
    file.statements
      .filter(ts.isTypeAliasDeclaration)
      .map((alias) => [alias.name.text, alias.type]),
  );
  const members = new Set();
  const visitedAliases = new Set();

  const visit = (node) => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const alias = node.typeName.text;
      if (aliases.has(alias) && !visitedAliases.has(alias)) {
        visitedAliases.add(alias);
        visit(aliases.get(alias));
      }
      node.typeArguments?.forEach(visit);
      return;
    }
    if (ts.isTypeLiteralNode(node)) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) || ts.isMethodSignature(member)) {
          const name = member.name.getText(file).replace(/^['"]|['"]$/g, '');
          members.add(name);
          if (ts.isPropertySignature(member)) {
            if (member.type) visit(member.type);
          } else {
            member.parameters.forEach(
              (parameter) => parameter.type && visit(parameter.type),
            );
            if (member.type) visit(member.type);
          }
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };

  for (const rootName of rootNames) {
    if (!aliases.has(rootName))
      throw new Error(`Missing ${rootName} in ${family} declarations`);
    visit(aliases.get(rootName));
  }
  return members;
};

const apiDeclarationSources = {
  plain: `${declarations('print')}\n${declarations('println')}`,
  channel: declarations('channel'),
  runtime: declarations('runtime'),
  state: declarations('state'),
  parser: declarations('parser'),
  filesystem: declarations('fs'),
  network: declarations('net'),
};

const commonExampleDeclarations = `
declare const rows: any[];
declare function processRow(row: any): void;
declare const filePath: string;
declare const htmlSource: string;
declare const csvText: string;
declare const jsonText: string;
declare const $env: Record<string, string>;
declare const $resource: Record<string, any>;
declare const $dataset: Record<string, any>;
declare const $process: Record<string, (...args: any[]) => Promise<{stdout: string; stderr: string; exitCode: number}>>;
declare const $logic: Record<string, (...args: any[]) => any>;
`;

const exampleApiFamilies = (guide, code) => {
  switch (guide) {
    case 'api-output':
      return code.includes('$channel') ? ['channel'] : ['plain'];
    case 'api-runtime-state':
      return ['runtime', 'state', 'plain'];
    case 'api-parser':
      return ['parser', 'plain'];
    case 'api-filesystem':
      return ['filesystem', 'plain'];
    case 'api-network':
      return ['network', 'plain'];
    case 'context':
      return ['parser', 'plain'];
    default:
      return [];
  }
};

const getDiagnostics = (
  source,
  selectedFamilies,
  declarationSources = apiDeclarationSources,
) => {
  const virtualFiles = new Map([
    ['/__api_example__/context.d.ts', commonExampleDeclarations],
    ['/__api_example__/work.ts', `async function __example() {\n${source}\n}`],
  ]);
  for (const family of selectedFamilies) {
    virtualFiles.set(
      `/__api_example__/${family}.d.ts`,
      declarationSources[family],
    );
  }

  const options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    noImplicitAny: true,
    strictNullChecks: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    // Work declarations must not inherit ambient @types from the test host.
    types: [],
    // Missing types in a declaration must not silently become any.
    skipLibCheck: false,
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    virtualFiles.has(fileName)
      ? ts.createSourceFile(
          fileName,
          virtualFiles.get(fileName),
          languageVersion,
          true,
        )
      : originalGetSourceFile(fileName, languageVersion, ...rest);
  host.fileExists = (fileName) =>
    virtualFiles.has(fileName) || originalFileExists(fileName);
  host.readFile = (fileName) =>
    virtualFiles.get(fileName) ?? originalReadFile(fileName);

  const program = ts.createProgram([...virtualFiles.keys()], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => !diagnostic.reportsUnnecessary);
};

const compileDocumentExamples = (guide, markdown) => {
  const snippets = [
    ...markdown.matchAll(/```(?:ts|typescript)\s*\r?\n([\s\S]*?)```/g),
  ];
  for (const [index, match] of snippets.entries()) {
    const code = match[1];
    const selected = exampleApiFamilies(guide, code);
    if (selected.length === 0) continue;
    const errors = getDiagnostics(code, selected);
    if (errors.length > 0) {
      const details = errors
        .map(
          (diagnostic) =>
            `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
        )
        .join('\n');
      throw new Error(
        `${guide} TypeScript example ${index + 1} does not compile:\n${details}`,
      );
    }
  }
  console.log(
    `${guide}: ${snippets.length} TypeScript examples compile against current declarations`,
  );
};

const families = [
  {
    name: 'plain output',
    docs: readMcp('resources/api-output.md'),
    members: new Set(['print', 'println']),
    sourceFiles: [
      '../../packages/runtime-core/src/execution/create-reserved-api.ts',
    ],
  },
  {
    name: 'channel output',
    docs: readMcp('resources/api-output.md'),
    declarations: coverageDeclaration('channel'),
    roots: ['CoverageAPI'],
    sourceFiles: [
      '../../packages/runtime-core/src/api/dcl-channel.ts',
      '../../packages/runtime-core/src/execution/create-reserved-api.ts',
    ],
  },
  {
    name: 'runtime',
    docs: readMcp('resources/api-runtime-state.md'),
    declarations: coverageDeclaration('runtime'),
    roots: ['CoverageAPI'],
    sourceFiles: ['../../packages/runtime-core/src/api/dcl-runtime.ts'],
  },
  {
    name: 'state',
    docs: readMcp('resources/api-runtime-state.md'),
    declarations: coverageDeclaration('state'),
    roots: ['CoverageAPI'],
    sourceFiles: [
      '../../packages/runtime-core/src/api/dcl-state.ts',
      '../../packages/runtime-core/src/execution/create-reserved-api.ts',
    ],
  },
  {
    name: 'parser',
    docs: readMcp('resources/api-parser.md'),
    declarations: coverageDeclaration('parser'),
    roots: ['CoverageAPI'],
    sourceFiles: [
      '../../packages/runtime-core/src/api/parser/dcl-parser.ts',
      '../../packages/runtime-core/src/api/parser/excel-parser.ts',
      '../../packages/runtime-core/src/api/parser/dom-parser.ts',
      '../../packages/runtime-core/src/api/parser/inspector/table-inspector.ts',
      '../../packages/runtime-core/src/api/parser/inspector/json-inspector.ts',
    ],
  },
  {
    name: 'filesystem',
    docs: readMcp('resources/api-filesystem.md'),
    declarations: coverageDeclaration('fs'),
    roots: ['CoverageAPI'],
    sourceFiles: [
      '../../packages/runtime-core/src/api/fs/dcl-file-system.ts',
      '../../packages/runtime-core/src/api/fs/tx/dcl-fs-transaction.ts',
    ],
  },
  {
    name: 'network',
    docs: readMcp('resources/api-network.md'),
    declarations: coverageDeclaration('net'),
    roots: ['CoverageAPI'],
    sourceFiles: ['../../packages/runtime-core/src/api/dcl-net.ts'],
  },
];

for (const family of families) {
  const members =
    family.members ??
    collectTypeMembers(family.declarations, family.roots, family.name);
  const source = family.sourceFiles.map(read).join('\n');
  for (const member of members) {
    if (family.name === 'filesystem' && member === '__fileTokenBrand') continue;
    if (!family.docs.includes(member)) {
      throw new Error(
        `Missing ${family.name} guide entry for declared member '${member}'`,
      );
    }
    if (!ledger.includes(member)) {
      throw new Error(
        `Missing ${family.name} ledger entry for declared member '${member}'`,
      );
    }
    if (!source.includes(member)) {
      throw new Error(
        `Could not trace ${family.name} member '${member}' to its implementation source`,
      );
    }
  }
  console.log(`${family.name}: ${members.size} declared members covered`);
}

for (const guide of [
  'api-output',
  'api-runtime-state',
  'api-parser',
  'api-filesystem',
  'api-network',
  'context',
]) {
  compileDocumentExamples(guide, readMcp(`resources/${guide}.md`));
}

for (const [description, source, selected, expectedCode] of [
  ['plain output argument type', '$println(123);', ['plain']],
  [
    'channel table record type',
    `const table = $channel.createTableStream('results', [{ name: 'count', type: 'number' }] as const);\ntable.add({ count: 'wrong' });`,
    ['channel'],
  ],
  [
    'Excel nullable sheet handling',
    `const book = await $parser.excel(filePath);\nbook.sheet('Orders').toTable();`,
    ['parser'],
  ],
  [
    'plain/channel output method separation',
    '$println("not injected in channel mode");',
    ['channel'],
  ],
  [
    'Pro-only filesystem API visibility',
    'await $fs.readText(filePath);',
    ['plain'],
  ],
  [
    'network request URL type',
    'await $net.request({ url: 123 });',
    ['network'],
    2322,
  ],
  [
    'network request timeout type',
    'await $net.request({ url: "https://example.invalid", timeoutMs: "slow" });',
    ['network'],
    2322,
  ],
  [
    'network query value type',
    'await $net.request({ url: "https://example.invalid", query: { nested: {} } });',
    ['network'],
    2322,
  ],
  [
    'network convenience method options',
    'await $net.getText("https://example.invalid", { timeoutMs: "slow" });',
    ['network'],
    2322,
  ],
  [
    'network response property',
    'const response = await $net.request({ url: "https://example.invalid" }); response.nonexistentField;',
    ['network'],
    2339,
  ],
  [
    'network response status type',
    'const response = await $net.request({ url: "https://example.invalid" }); const status: string = response.status; status.toUpperCase();',
    ['network'],
    2322,
  ],
]) {
  const errors = getDiagnostics(source, selected);
  if (errors.length === 0) {
    throw new Error(`Expected a TypeScript error for ${description}`);
  }
  if (expectedCode != null) {
    assert.ok(
      errors.some((error) => error.code === expectedCode),
      `Expected TS${expectedCode} for ${description}, not an unrelated error`,
    );
  }
  console.log(`${description}: representative misuse is rejected`);
}

// Validate declaration files themselves, including references not exercised by
// a particular documentation snippet. Syntax-only checks miss unresolved aliases.
for (const family of Object.keys(apiDeclarationSources)) {
  assert.deepEqual(
    getDiagnostics('', [family]).map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, '\n'),
    ),
    [],
    `Invalid shared ${family} declaration`,
  );
}

assert.deepEqual(
  getDiagnostics(
    'const response = await $net.request({ url: "https://example.invalid", query: { page: 1, active: true, omitted: null }, timeoutMs: 100 }); const status: number = response.status; const body: string = response.body; status + body.length;',
    ['network'],
  ).map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
  [],
  'Valid network request and response must remain typed and accepted',
);
const networkMembers = collectTypeMembers(
  coverageDeclaration('net'),
  ['CoverageAPI'],
  'network',
);
for (const member of [
  'method',
  'query',
  'headers',
  'body',
  'timeoutMs',
  'status',
  'ok',
  'contentType',
  'fetchedAt',
]) {
  assert.ok(
    networkMembers.has(member),
    `Missing network alias member: ${member}`,
  );
}

const missingAliasErrors = getDiagnostics('', ['network'], {
  network:
    'declare const $net: { request: (req: MissingNetRequest) => Promise<MissingNetResponse> };',
});
for (const name of ['MissingNetRequest', 'MissingNetResponse']) {
  assert.ok(
    missingAliasErrors.some(
      (error) =>
        error.code === 2304 &&
        ts.flattenDiagnosticMessageText(error.messageText, '\n').includes(name),
    ),
    `Missing declaration alias ${name} must not silently become any`,
  );
}
console.log(
  'Shared declarations, network aliases and unresolved-type regression checks passed.',
);
