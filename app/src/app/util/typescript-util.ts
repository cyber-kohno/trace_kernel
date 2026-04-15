import * as ts from "typescript";

namespace TypescriptUtil {

    export const transpileTsToJs = (tsCode: string) => {
        return ts.transpileModule(tsCode, {
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2017,
                sourceMap: true,
                // 必要ならここに strict, esModuleInterop などを入れる
            },
        });
    }
}
export default TypescriptUtil;