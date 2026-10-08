import * as ts from 'typescript';
import type WorkState from '../state/model/workspace/work-state';
import {
  getRestrictedGlobalDiagnostics,
  getScriptCompilerOptions,
  wrapWorkSource,
} from '../util/typescript/script-analysis';

type WorkDeclarations = {
  contextDeclarations: string[];
  apiDeclarations: string[];
  declare: string;
};

export type WorkTypeDiagnostic = {
  code: number;
  message: string;
  line: number;
  column: number;
};

let libFilesPromise: Promise<Record<string, string>> | null = null;
const loadLibFiles = async () => {
  libFilesPromise ??= import('virtual:trace-kernel-ts-libs').then(
    async (module) => {
      const response = await fetch(module.default);
      if (!response.ok) {
        throw new Error(
          `Could not load local TypeScript libraries (${response.status}).`,
        );
      }
      return (await response.json()) as Record<string, string>;
    },
  );
  return libFilesPromise;
};

const libPath = (fileName: string) => `/__typescript_lib__/${fileName}`;
const contextPath = '/__trace_kernel__/context.d.ts';
const apiPath = '/__trace_kernel__/api.d.ts';
const declarePath = '/__trace_kernel__/declare.d.ts';
const workPath = '/__trace_kernel__/work.ts';

export const validateWorkTypes = async (
  work: WorkState.Props,
  declarations: WorkDeclarations,
): Promise<WorkTypeDiagnostic[]> => {
  const libs = await loadLibFiles();
  const files = new Map<string, string>();
  for (const [fileName, source] of Object.entries(libs)) {
    files.set(libPath(fileName), source);
  }
  files.set(contextPath, declarations.contextDeclarations.join('\n'));
  files.set(apiPath, declarations.apiDeclarations.join('\n'));
  files.set(declarePath, declarations.declare);
  files.set(workPath, wrapWorkSource(work.source));

  const options = getScriptCompilerOptions();
  const host: ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      const source = files.get(fileName);
      return source == null
        ? undefined
        : ts.createSourceFile(fileName, source, languageVersion, true);
    },
    getDefaultLibFileName: () => libPath('lib.es2020.d.ts'),
    writeFile: () => undefined,
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    fileExists: (fileName) => files.has(fileName),
    readFile: (fileName) => files.get(fileName),
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram(
    [
      libPath('lib.es2020.d.ts'),
      libPath('lib.webworker.d.ts'),
      contextPath,
      apiPath,
      declarePath,
      workPath,
    ],
    options,
    host,
  );
  const source = program.getSourceFile(workPath);
  const diagnostics = ts
    .getPreEmitDiagnostics(program, source)
    .filter((diagnostic) => !diagnostic.reportsUnnecessary)
    .map((diagnostic) => {
      const position =
        diagnostic.file && diagnostic.start != null
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
          : null;
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      );
      return {
        code: diagnostic.code,
        message,
        line: position?.line ?? 0,
        column: position == null ? 0 : position.character + 1,
      };
    });
  return [...diagnostics, ...getRestrictedGlobalDiagnostics(work.source)];
};
