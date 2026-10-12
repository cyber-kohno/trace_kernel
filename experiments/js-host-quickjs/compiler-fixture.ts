import TypescriptUtil from "../../apps/desktop/src/app/util/typescript-util";

export const transpile = (source: string) =>
  TypescriptUtil.transpileTsToJs(source);
