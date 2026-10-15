import type { LogicDefinition } from "../model/workspace";
import type { ExecutionContextData } from "../execution/work-execution-plan";
import DataUtil from "../data/data-util";
import LogicSignatureCache from "../compiler/logic-signature-cache";
import ApiDeclarations from "./api-declarations";

namespace ContextDeclarations {
  export type Props = ExecutionContextData;
  export const createDeclareDef = (data: Props, declareSource = "") => {
    const { envs: envVars, resources, datasets, processes, logics } = data;
    const items: {
      name: string;
      defs: {
        name: string;
        declareDef: string;
      }[];
    }[] = [];

    // 環境変数
    if (envVars.length > 0) {
      items.push({
        name: "$env",
        defs: envVars.map((env) => {
          const declareDef = `${JSON.stringify(env.varName)}: string`;
          return { name: env.varName, declareDef };
        }),
      });
    }
    // 固定リソース
    if (resources.length > 0) {
      items.push({
        name: "$resource",
        defs: resources.map((r) => {
          let source = r.source;
          const varName = r.varName;
          let type: string = "string";
          if (r.parse != undefined) {
            const defs = DataUtil.convertTableToColDefs(source, r.parse);
            type = `{\n${defs.map((def) => `  ${JSON.stringify(def.name)}: ${def.type}${def.nullable ? " | null" : ""}`).join(";\n")};\n}[]`;
          }
          const declareDef = `${JSON.stringify(varName)}: ${type}`;
          return { name: varName, declareDef };
        }),
      });
    }
    // データセット
    if (datasets.length > 0) {
      items.push({
        name: "$dataset",
        defs: datasets.map((dataset) => {
          const name = `${dataset.varName}`;
          const types = [
            "fileName: string",
            "absolutePath: string",
            "relativePath: string",
            "content: () => Promise<string>",
          ];
          return {
            name,
            declareDef: `${JSON.stringify(name)}: {${types.join("; ")}}[]`,
          };
        }),
      });
    }
    // プロセス
    if (processes.length > 0) {
      items.push({
        name: "$process",
        defs: processes.map((proc) => {
          const name = `${proc.funcName}`;
          const args = proc.scriptArgs.map((a) => `${a.name}: ${a.type}`);
          return {
            name,
            declareDef: `${JSON.stringify(name)}: (${args}) => Promise<{stdout: string; stderr: string; exitCode: number;}>`,
          };
        }),
      });
    }
    if (logics.length > 0) {
      items.push({
        name: "$logic",
        defs: logics.map((logic) => {
          const signature = getLogicSignature(logic, data, declareSource);
          const name = `${logic.name}`;
          const declareDef = `${JSON.stringify(name)}: ${LogicSignatureCache.formatFunctionType(
            signature,
          )}`;
          return {
            name,
            declareDef,
          };
        }),
      });
    }
    return items.map(
      (item) =>
        `declare const ${item.name}: {${item.defs
          .map((d) => d.declareDef)
          .join(",")}}`,
    );
  };

  export const getLogicSignature = (
    logic: LogicDefinition,
    data: Props,
    declareSource = "",
  ) => {
    const parserDeclare = ApiDeclarations.createUtilDeclareDef("parser");
    return LogicSignatureCache.get({
      source: logic.source,
      injectionDefs: [
        `${parserDeclare.typeDec} declare const $parser: ${parserDeclare.valueDec};`,
        ...createDeclareDef({ ...data, logics: [] }, declareSource),
      ],
      declareSource,
      logicSources: data.logics,
      currentLogicName: logic.name,
    });
  };
}
export default ContextDeclarations;
