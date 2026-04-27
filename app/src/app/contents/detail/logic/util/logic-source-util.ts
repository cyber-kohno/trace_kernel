import * as ts from 'typescript';

namespace LogicSourceUtil {
  const ASYNC_LIB_SOURCE = `
interface PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}
interface Promise<T> extends PromiseLike<T> {}
interface PromiseConstructor {
  resolve<T>(value: T | PromiseLike<T>): Promise<T>;
}
declare var Promise: PromiseConstructor;
`;

  export type Marker = {
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };

  export type SignatureInfo = {
    name: string;
    args: string[];
    returnType: string;
  };

  export type AnalyzeOptions = {
    injectionDefs?: string[];
    declareSource?: string;
  };

  const FILE_NAME = 'logic.ts';

  const createSourceFile = (source: string) =>
    ts.createSourceFile(
      FILE_NAME,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

  const getDefaultFunctionNode = (
    sourceFile: ts.SourceFile,
  ): ts.FunctionLikeDeclaration | null => {
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement)) {
        const isDefault =
          statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ??
          false;
        if (isDefault) return statement;
      }

      if (
        ts.isExportAssignment(statement) &&
        (ts.isFunctionExpression(statement.expression) ||
          ts.isArrowFunction(statement.expression))
      ) {
        return statement.expression;
      }
    }
    return null;
  };

  const toMarker = (
    sourceFile: ts.SourceFile,
    node: ts.Node,
    message: string,
  ): Marker => {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      message,
      startLineNumber: start.line + 1,
      startColumn: start.character + 1,
      endLineNumber: end.line + 1,
      endColumn: end.character + 1,
    };
  };

  export const validate = (source: string): Marker[] => {
    const sourceFile = createSourceFile(source);

    const markers: Marker[] = [];
    const defaultFunctions: ts.Node[] = [];

    sourceFile.statements.forEach((statement) => {
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        defaultFunctions.push(statement);
        return;
      }

      if (
        ts.isExportAssignment(statement) &&
        (ts.isFunctionExpression(statement.expression) ||
          ts.isArrowFunction(statement.expression))
      ) {
        defaultFunctions.push(statement.expression);
        return;
      }

      if (
        ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement)
      ) {
        return;
      }

      if (ts.isImportDeclaration(statement)) {
        if (!statement.importClause?.isTypeOnly) {
          markers.push(
            toMarker(
              sourceFile,
              statement,
              'logic does not allow runtime imports.',
            ),
          );
        }
        return;
      }

      markers.push(
        toMarker(
          sourceFile,
          statement,
          'logic allows only a single default-exported function plus type declarations.',
        ),
      );
    });

    if (defaultFunctions.length === 0) {
      markers.push({
        message: 'logic must define one default-exported function.',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
      });
    } else if (defaultFunctions.length > 1) {
      defaultFunctions.slice(1).forEach((node) => {
        markers.push(
          toMarker(
            sourceFile,
            node,
            'logic can define only one default-exported function.',
          ),
        );
      });
    }

    return markers;
  };

  export const getSignatureInfo = (
    source: string,
    options?: AnalyzeOptions,
  ): SignatureInfo | null => {
    const sourceFile = createSourceFile(source);
    const fn = getDefaultFunctionNode(sourceFile);
    if (fn == null) return null;

    const injectionSource = (options?.injectionDefs ?? []).join('\n');
    const declareSource = options?.declareSource ?? '';
    const ambientFiles = new Map<string, string>([
      [FILE_NAME, source],
      ['__logic_async_lib__.d.ts', ASYNC_LIB_SOURCE],
      ['__logic_injection__.d.ts', injectionSource],
      ['__logic_declare__.d.ts', declareSource],
    ]);

    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      strict: true,
      noLib: true,
      noResolve: true,
    };

    const host: ts.CompilerHost = {
      getSourceFile: (fileName) => {
        if (fileName === FILE_NAME) return sourceFile;
        const text = ambientFiles.get(fileName);
        if (text == null) return undefined;
        return ts.createSourceFile(
          fileName,
          text,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        );
      },
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => {},
      getCurrentDirectory: () => '',
      getDirectories: () => [],
      fileExists: (fileName) => ambientFiles.has(fileName),
      readFile: (fileName) => ambientFiles.get(fileName),
      getCanonicalFileName: (fileName) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    };

    const program = ts.createProgram(
      Array.from(ambientFiles.keys()),
      compilerOptions,
      host,
    );
    const checker = program.getTypeChecker();
    const signature = checker.getSignatureFromDeclaration(fn);

    const typeToString = (type: ts.Type) =>
      checker.typeToString(
        type,
        fn,
        ts.TypeFormatFlags.NoTruncation |
          ts.TypeFormatFlags.UseFullyQualifiedType,
      );

    return {
      name:
        ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)
          ? fn.name?.text ?? 'default'
          : 'default',
      args: fn.parameters.map((param) => {
        const name = param.name.getText(sourceFile);
        const type = checker.getTypeAtLocation(param);
        return `${name}: ${typeToString(type)}`;
      }),
      returnType:
        signature != null
          ? typeToString(checker.getReturnTypeOfSignature(signature))
          : 'any',
    };
  };
}

export default LogicSourceUtil;
