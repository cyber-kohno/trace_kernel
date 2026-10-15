import DataUtil from "../data/data-util";
import { createIoContext, type ContextIoPorts } from "./create-io-context";
import type { ExecutionContextData } from "./work-execution-plan";

export type WorkContextPorts = ContextIoPorts & {
  createParserObject: () => unknown;
  transpileLogic: (source: string) => string;
};

export const createWorkContext = (
  data: ExecutionContextData,
  datasetMap: readonly { key: string; targets: string[] }[],
  ports: WorkContextPorts,
) => {
  const ioContext = createIoContext(data, datasetMap, ports);
  const items = [
    {
      name: "$env",
      objects: data.envs.map((env) => ({
        name: env.varName,
        value: env.value,
      })),
    },
    {
      name: "$resource",
      objects: data.resources.map((resource) => ({
        name: resource.varName,
        value:
          resource.parse == undefined
            ? resource.source
            : DataUtil.convertTableToJson(resource.source, resource.parse),
      })),
    },
    { name: "$dataset", objects: ioContext.datasets },
    { name: "$process", objects: ioContext.processes },
    {
      name: "$logic",
      objects: data.logics.map((logic) => ({
        name: logic.name,
        value: async (..._args: any[]) => undefined,
      })),
    },
  ];
  const mappedItems = items.map((item) => {
    const objects: Record<string, any> = {};
    item.objects.forEach((entry) => {
      objects[entry.name] = entry.value;
    });
    return { name: item.name, value: objects };
  });

  const contextMap = Object.fromEntries(
    mappedItems.map((item) => [item.name, item.value]),
  ) as Record<string, any>;
  const logicObjects = contextMap.$logic as Record<
    string,
    (...args: any[]) => any
  >;
  const parserObject = ports.createParserObject();

  data.logics.forEach((logic) => {
    if (logic.name === "") return;

    logicObjects[logic.name] = (...args: any[]) => {
      const compiledJs = ports.transpileLogic(logic.source);
      const createExportedFunc = new Function(
        "$env",
        "$resource",
        "$dataset",
        "$process",
        "$logic",
        "$parser",
        `
const module = { exports: {} };
const exports = module.exports;
${compiledJs}
return module.exports.default ?? exports.default;
`,
      );

      const injectedLogics = Object.fromEntries(
        Object.entries(logicObjects).filter(([name]) => name !== logic.name),
      );
      const exported = createExportedFunc(
        contextMap.$env,
        contextMap.$resource,
        contextMap.$dataset,
        contextMap.$process,
        injectedLogics,
        parserObject,
      );
      if (typeof exported !== "function") {
        throw new Error(`$logic.${logic.name} did not export a function.`);
      }
      return exported(...args);
    };
  });

  return mappedItems;
};
