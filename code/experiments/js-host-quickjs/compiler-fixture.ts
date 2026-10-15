import TypescriptUtil from "../../packages/runtime-core/src/compiler/typescript-util";

export const transpile = (source: string) =>
  TypescriptUtil.transpileTsToJs(source);
