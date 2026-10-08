import * as ts from 'typescript';
import { restrictedGlobals } from '../monaco/restricted-globals';

export const getScriptCompilerOptions = (): ts.CompilerOptions => ({
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  strict: false,
  noImplicitAny: true,
  strictNullChecks: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noResolve: false,
  skipLibCheck: true,
});

export const wrapWorkSource = (source: string) =>
  `async function __run() {\n${source}\n}\n`;

export const getRestrictedGlobalDiagnostics = (source: string) => {
  const userFile = ts.createSourceFile(
    'script.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const globalsFile = ts.createSourceFile(
    'restricted.d.ts',
    restrictedGlobals
      .map(({ name }) => `declare const ${name}: any;`)
      .join('\n'),
    ts.ScriptTarget.Latest,
    true,
  );
  const files = new Map([
    [userFile.fileName, userFile],
    [globalsFile.fileName, globalsFile],
  ]);
  const host: ts.CompilerHost = {
    getSourceFile: (name) => files.get(name),
    getDefaultLibFileName: () => '',
    writeFile: () => undefined,
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    fileExists: (name) => files.has(name),
    readFile: (name) => files.get(name)?.text,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram(
    [...files.keys()],
    { noLib: true, noResolve: true },
    host,
  );
  const checker = program.getTypeChecker();
  const diagnostics: {
    code: number;
    message: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
  }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const restriction = restrictedGlobals.find(
        ({ name }) => name === node.text,
      );
      const symbol = ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node);
      if (
        restriction &&
        symbol?.declarations?.some(
          (declaration) => declaration.getSourceFile() === globalsFile,
        )
      ) {
        const start = userFile.getLineAndCharacterOfPosition(
          node.getStart(userFile),
        );
        const end = userFile.getLineAndCharacterOfPosition(node.end);
        diagnostics.push({
          // Application diagnostic, shared by GUI and MCP.
          code: 90001,
          message: restriction.message,
          line: start.line + 1,
          column: start.character + 1,
          endLine: end.line + 1,
          endColumn: end.character + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(userFile);
  return diagnostics;
};
