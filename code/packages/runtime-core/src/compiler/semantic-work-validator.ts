import { typescript as ts } from "./typescript-util";
import type { WorkDefinition } from "../model/workspace";
import {
  getRestrictedGlobalDiagnostics,
  getScriptCompilerOptions,
  wrapWorkSource,
} from "./script-analysis";
import { cliWebDeclarations } from "./cli-profile";

export type WorkDeclarations = {
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

const libPath = (fileName: string) => `/__typescript_lib__/${fileName}`;
const contextPath = "/__trace_kernel__/context.d.ts";
const apiPath = "/__trace_kernel__/api.d.ts";
const declarePath = "/__trace_kernel__/declare.d.ts";
const workPath = "/__trace_kernel__/work.ts";

export const validateWorkTypes = async (
  work: Pick<WorkDefinition, "source">,
  declarations: WorkDeclarations,
  libs: Record<string, string>,
  profile: "worker" | "cli" = "worker",
): Promise<WorkTypeDiagnostic[]> => {
  const files = new Map<string, string>();
  for (const [fileName, source] of Object.entries(libs)) {
    files.set(libPath(fileName), source);
  }
  files.set(contextPath, declarations.contextDeclarations.join("\n"));
  files.set(apiPath, declarations.apiDeclarations.join("\n"));
  files.set(declarePath, declarations.declare);
  files.set(workPath, wrapWorkSource(work.source));
  if (profile === "cli") files.set(libPath("lib.cli.d.ts"), cliWebDeclarations);

  const options = getScriptCompilerOptions();
  const host: ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      const source = files.get(fileName);
      return source == null
        ? undefined
        : ts.createSourceFile(fileName, source, languageVersion, true);
    },
    getDefaultLibFileName: () => libPath("lib.es2020.d.ts"),
    writeFile: () => undefined,
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    fileExists: (fileName) => files.has(fileName),
    readFile: (fileName) => files.get(fileName),
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const program = ts.createProgram(
    [
      libPath("lib.es2020.d.ts"),
      libPath(profile === "cli" ? "lib.cli.d.ts" : "lib.webworker.d.ts"),
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
        "\n",
      );
      return {
        code: diagnostic.code,
        message,
        line: position?.line ?? 0,
        column: position == null ? 0 : position.character + 1,
      };
    });
  if (profile === "cli" && source) {
    const visit = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node) ||
        (ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword)
      ) {
        const position = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        diagnostics.push({
          code: 90002,
          message:
            "CLI Work does not support module loading. Use Workspace Logic and Declare.",
          line: position.line,
          column: position.character + 1,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...diagnostics, ...getRestrictedGlobalDiagnostics(work.source)];
};
