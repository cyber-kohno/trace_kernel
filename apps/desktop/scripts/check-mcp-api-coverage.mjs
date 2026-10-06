import { readFileSync } from 'node:fs';
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

const findVariable = (source, variableName) => {
  const file = ts.createSourceFile(
    'source.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let found;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName
    ) {
      found = node.initializer;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

const getTypeDeclaration = (relativePath, functionName) => {
  const initializer = findVariable(read(relativePath), functionName);
  const body =
    initializer && ts.isArrowFunction(initializer) ? initializer.body : null;
  if (
    body == null ||
    (!ts.isTemplateExpression(body) &&
      !ts.isNoSubstitutionTemplateLiteral(body))
  ) {
    throw new Error(
      `Could not find ${functionName} template in ${relativePath}`,
    );
  }
  if (ts.isTemplateExpression(body) && body.templateSpans.length > 0) {
    throw new Error(
      `${functionName} in ${relativePath} must remain a static declaration template`,
    );
  }
  return body.text;
};

const getStringArray = (relativePath, variableName) => {
  const initializer = findVariable(read(relativePath), variableName);
  if (initializer == null || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`Could not find ${variableName} array in ${relativePath}`);
  }
  return initializer.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error(
        `${variableName} in ${relativePath} must contain string literals`,
      );
    }
    return element.text;
  });
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

const typeDeclarationsFromArray = (items) =>
  items.filter((item) => item.startsWith('type ')).join(';\n');
const memberDeclarationsFromArray = (items) =>
  items.filter((item) => !item.startsWith('type ')).join(';\n');
const runtimeApiItems = getStringArray(
  'src/app/contents/detail/program/util/dcl-runtime.ts',
  'apis',
);
const networkApiItems = getStringArray(
  'src/app/contents/detail/program/util/dcl-net.ts',
  'apis',
);

const apiDeclarationSources = {
  plain: `declare const $print: (value: string) => void;\ndeclare const $println: (value: string) => void;`,
  channel: `${getTypeDeclaration('src/app/contents/detail/program/util/channel/dcl-channel.ts', 'getTypeDeclare')}\ndeclare const $channel: ChannelAPI;`,
  runtime: `type RuntimeAPI = {${memberDeclarationsFromArray(runtimeApiItems).replace(/;?$/, ';')}}\ndeclare const $runtime: RuntimeAPI;`,
  state: `${getTypeDeclaration('src/app/contents/detail/program/util/dcl-state.ts', 'getTypeDeclare')}\ndeclare const $state: StateAPI;`,
  parser: `${getTypeDeclaration('src/app/contents/detail/program/util/parser/dcl-parser.ts', 'getTypeDeclare')}\ndeclare const $parser: ParserAPI;`,
  filesystem: `${getTypeDeclaration('src/app/contents/detail/program/util/fs/dcl-file-system.ts', 'getTypeDeclare')}\ndeclare const $fs: FileSystemAPI;`,
  network: `${typeDeclarationsFromArray(networkApiItems)}\ntype NetworkAPI = {${memberDeclarationsFromArray(networkApiItems).replace(/;?$/, ';')}}\ndeclare const $net: NetworkAPI;`,
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

const getDiagnostics = (source, selectedFamilies) => {
  const virtualFiles = new Map([
    ['/__api_example__/context.d.ts', commonExampleDeclarations],
    ['/__api_example__/work.ts', `async function __example() {\n${source}\n}`],
  ]);
  for (const family of selectedFamilies) {
    virtualFiles.set(
      `/__api_example__/${family}.d.ts`,
      apiDeclarationSources[family],
    );
  }

  const options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    noImplicitAny: true,
    strictNullChecks: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    skipLibCheck: true,
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
  const workFile = program.getSourceFile('/__api_example__/work.ts');
  return ts
    .getPreEmitDiagnostics(program, workFile)
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
    sourceFiles: ['src/app/contents/detail/program/util/declare-util.ts'],
  },
  {
    name: 'channel output',
    docs: readMcp('resources/api-output.md'),
    declarations: getTypeDeclaration(
      'src/app/contents/detail/program/util/channel/dcl-channel.ts',
      'getTypeDeclare',
    ),
    roots: ['ChannelAPI'],
    sourceFiles: [
      'src/app/contents/detail/program/util/channel/dcl-channel.ts',
    ],
  },
  {
    name: 'runtime',
    docs: readMcp('resources/api-runtime-state.md'),
    declarations: `type RuntimeAPI = {${memberDeclarationsFromArray(runtimeApiItems).replace(/;?$/, ';')}}`,
    roots: ['RuntimeAPI'],
    sourceFiles: ['src/app/contents/detail/program/util/dcl-runtime.ts'],
  },
  {
    name: 'state',
    docs: readMcp('resources/api-runtime-state.md'),
    declarations: getTypeDeclaration(
      'src/app/contents/detail/program/util/dcl-state.ts',
      'getTypeDeclare',
    ),
    roots: ['StateAPI'],
    sourceFiles: ['src/app/contents/detail/program/util/dcl-state.ts'],
  },
  {
    name: 'parser',
    docs: readMcp('resources/api-parser.md'),
    declarations: getTypeDeclaration(
      'src/app/contents/detail/program/util/parser/dcl-parser.ts',
      'getTypeDeclare',
    ),
    roots: ['ParserAPI'],
    sourceFiles: [
      'src/app/contents/detail/program/util/parser/dcl-parser.ts',
      'src/app/contents/detail/program/util/parser/excel-parser.ts',
      'src/app/contents/detail/program/util/parser/dom-parser.ts',
      'src/app/contents/detail/program/util/parser/inspector/table-inspector.ts',
      'src/app/contents/detail/program/util/parser/inspector/json-inspector.ts',
    ],
  },
  {
    name: 'filesystem',
    docs: readMcp('resources/api-filesystem.md'),
    declarations: getTypeDeclaration(
      'src/app/contents/detail/program/util/fs/dcl-file-system.ts',
      'getTypeDeclare',
    ),
    roots: ['FileSystemAPI'],
    sourceFiles: [
      'src/app/contents/detail/program/util/fs/dcl-file-system.ts',
      'src/app/contents/detail/program/util/fs/tx/dcl-fs-transaction.ts',
    ],
  },
  {
    name: 'network',
    docs: readMcp('resources/api-network.md'),
    declarations: `${typeDeclarationsFromArray(networkApiItems)}\ntype NetworkAPI = {${memberDeclarationsFromArray(networkApiItems).replace(/;?$/, ';')}}`,
    roots: ['NetworkAPI'],
    sourceFiles: ['src/app/contents/detail/program/util/dcl-net.ts'],
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

for (const [description, source, selected] of [
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
]) {
  if (getDiagnostics(source, selected).length === 0) {
    throw new Error(`Expected a TypeScript error for ${description}`);
  }
  console.log(`${description}: representative misuse is rejected`);
}

// The runtime/network snippets are assembled from declaration strings rather
// than static TypeScript templates; parse them in exactly that combined shape.
for (const [relativePath, items] of [
  ['src/app/contents/detail/program/util/dcl-runtime.ts', runtimeApiItems],
  ['src/app/contents/detail/program/util/dcl-net.ts', networkApiItems],
]) {
  const aliases = typeDeclarationsFromArray(items);
  const properties = memberDeclarationsFromArray(items);
  const combined = `${aliases}; type InlineAPI = { ${properties}; };`;
  const parsed = ts.createSourceFile(
    'inline-api.d.ts',
    combined,
    ts.ScriptTarget.Latest,
    true,
  );
  if (parsed.parseDiagnostics.length > 0) {
    throw new Error(
      `Generated API declarations in ${relativePath} are not valid TypeScript`,
    );
  }
}
