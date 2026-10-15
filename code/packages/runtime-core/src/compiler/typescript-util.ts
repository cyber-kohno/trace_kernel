import * as ts from "typescript";

// Analysis and transpilation share the same pinned compiler instance.
export { ts as typescript };

namespace TypescriptUtil {
  export const transpileTsToJs = (tsCode: string) => {
    return ts.transpileModule(tsCode, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2017,
        sourceMap: true,
      },
      reportDiagnostics: true,
    });
  };

  export const transpileTsModuleToCjs = (tsCode: string) => {
    return ts.transpileModule(tsCode, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2017,
      },
    }).outputText;
  };
}
export default TypescriptUtil;
