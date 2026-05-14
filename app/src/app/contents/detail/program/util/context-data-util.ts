import type StoreProcess from '../../../../store/store-process';
import type StoreDataset from '../../../../store/store-dataset';
import type StoreLogic from '../../../../store/store-logic';
import type StoreResource from '../../../../store/store-resource';
import type { FileRequest } from '../../../../store/types';
import DataUtil from '../../../../util/data/data-util';
import FileUtil from '../../../../util/data/file-util';
import type RuntimeUtil from '../runtime/runtime-util';
import WorkerInvoke from './worker-invoke';
import type StoreEnv from '../../../../store/store-env';
import type StoreWorkspace from '../../../../store/store-workspace';
import StoreLicense from '../../../../store/store-license';
import TypescriptUtil from '../../../../util/typescript-util';
import DclParser from './parser/dcl-parser';
import DeclareUtil from './declare-util';
import LogicSignatureCache from '../../logic/util/logic-signature-cache';

namespace ContextDataUtil {
  export type Props = {
    envs: StoreEnv.Props[];
    resources: StoreResource.Props[];
    datasets: StoreDataset.Props[];
    processes: StoreProcess.Props[];
    logics: StoreLogic.Props[];
  };

  export const getUsableData = (
    workspace: StoreWorkspace.Props,
    disables: StoreWorkspace.Target[],
  ) => {
    const isDisable = (cat: StoreWorkspace.Category, i: number) =>
      disables.find((d) => d.cat === cat && d.index === i) != undefined;

    let processes: StoreProcess.Props[] = [];
    let logics: StoreLogic.Props[] = [];
    if (StoreLicense.isPro()) {
      processes = workspace.processes.filter(
        (_, i) => !isDisable('process', i),
      );
      logics = workspace.logics.filter((_, i) => !isDisable('logic', i));
    }
    const injectionalData: ContextDataUtil.Props = {
      envs: workspace.envs.filter((_, i) => !isDisable('env', i)),
      resources: workspace.resources.filter(
        (_, i) => !isDisable('resource', i),
      ),
      datasets: workspace.datasets.filter((_, i) => !isDisable('dataset', i)),
      processes,
      logics,
    };
    return injectionalData;
  };

  export const createObjects = (
    data: Props,
    prepar: RuntimeUtil.PreparCache,
    rustCache: RuntimeUtil.RustCache,
  ) => {
    const { envs: envVars, resources, datasets, processes, logics } = data;
    const items = [
      // 迺ｰ蠅・､画焚
      {
        name: '$env',
        objects: envVars.map((env) => {
          return {
            name: env.varName,
            value: env.value,
          };
        }),
      },
      // 蝗ｺ螳壹Μ繧ｽ繝ｼ繧ｹ
      {
        name: '$resource',
        objects: resources.map((r) => {
          let source = r.source;
          const varName = r.varName;
          let value: any = source;
          if (r.parse != undefined) {
            value = DataUtil.convertTableToJson(source, r.parse);
          }
          return { name: varName, value };
        }),
      },
      // 繝輔ぃ繧､繝ｫ縺斐→
      {
        name: '$dataset',
        objects: datasets.map((ds) => {
          const name = ds.varName;
          const value = (() => {
            let { encoding, rootPath, targets } = ds;
            if (targets == null) {
              const fnd = prepar.datasetMap.find((dm) => dm.key === ds.varName);
              if (fnd == undefined) throw new Error();
              targets = fnd.targets;
            }
            return targets.map((t) => {
              const fileName = FileUtil.getFileNameFromPath(t);
              const fixedRootPath = DataUtil.getAppliedEnvValue(
                rootPath,
                data.envs,
              );
              const absolutePath = fixedRootPath + t;
              const relativePath = t;
              const content = async () => {
                const req: FileRequest = { filePath: absolutePath, encoding };
                const text = await WorkerInvoke.call<string>('read_file', {
                  req,
                });
                return text;
              };

              return { fileName, absolutePath, relativePath, content };
            });
          })();
          return {
            name,
            value,
          };
        }),
      },
      // 繝励Ο繧ｻ繧ｹ
      {
        name: '$process',
        objects: processes.map((process) => {
          type ReturnType = {
            stdout: string;
            stderr: string;
            exitCode: number;
          };
          const { prgPath, cmdArgs, scriptArgs, timeout } = process;
          const cwd = process.cwd ?? '';
          const stdin = process.stdin ?? '';
          const stdinEncoding = process.encoding.stdin ?? 'utf8';
          const callback = async (
            ...scriptArgValues: (string | number)[]
          ): Promise<ReturnType> => {
            type InvokeType = {
              stdout: number[];
              stderr: number[];
              exitCode: number;
            };

            const scriptKV = scriptArgValues.map((arg, i) => {
              const def = scriptArgs[i];

              // 蝙九メ繧ｧ繝・け
              if (typeof arg !== def.type) {
                throw new Error(
                  `Argument types do not match definition. [${arg}]`,
                );
              }
              const value = String(arg);
              // 遨ｺ譁・ｭ励メ繧ｧ繝・け
              if (value === '')
                throw new Error(
                  'Command line arguments do not allow empty strings.',
                );
              return { key: `__${def.name}__`, value };
            });

            const applyScriptArgs = (base: string) => {
              let value = DataUtil.getAppliedEnvValue(base, envVars);
              scriptKV.forEach((kv) => {
                value = value.replaceAll(kv.key, kv.value);
              });
              return value;
            };

            const normalizeOptional = (value: string) =>
              value === '' ? undefined : value;
            const req = {
              program: DataUtil.getAppliedEnvValue(prgPath, envVars),
              args: cmdArgs.map((c) => applyScriptArgs(c)),
              cwd: normalizeOptional(applyScriptArgs(cwd)),
              stdin: normalizeOptional(applyScriptArgs(stdin)),
              timeoutMs: timeout,
              stdinEncoding,
            };

            const unresolved = [
              ...req.args,
              ...(req.cwd == undefined ? [] : [req.cwd]),
              ...(req.stdin == undefined ? [] : [req.stdin]),
            ].filter((a) => /__\w+__/.test(a));
            if (unresolved.length > 0) {
              throw new Error(
                `Unresolved script arguments: ${unresolved.join(', ')}`,
              );
            }
            scriptKV.forEach((kv) => {
              const used =
                cmdArgs.some((c) => c.includes(kv.key)) ||
                cwd.includes(kv.key) ||
                stdin.includes(kv.key);
              if (!used) {
                throw new Error(
                  `Script argument "${kv.key}" is never used in cmdArgs, cwd, or stdin.`,
                );
              }
            });
            const res = await WorkerInvoke.call<InvokeType>('run_process', {
              req,
            });
            return {
              stdout: DataUtil.decodeBinary(
                new Uint8Array(res.stdout),
                process.encoding.stdout,
              ),
              stderr: DataUtil.decodeBinary(
                new Uint8Array(res.stderr),
                process.encoding.stderr,
              ),
              exitCode: res.exitCode,
            };
          };
          return {
            name: process.funcName,
            value: callback,
          };
        }),
      },
      {
        name: '$logic',
        objects: logics.map((logic) => {
          const callback = async (..._args: any[]) => undefined;
          return {
            name: logic.name,
            value: callback,
          };
        }),
      },
    ];
    const mappedItems = items.map((item) => {
      const objects: any = {};
      item.objects.forEach((o) => {
        objects[o.name] = o.value;
      });
      return { name: item.name, value: objects };
    });

    const logicEntry = mappedItems.find((item) => item.name === '$logic');
    if (logicEntry == null) {
      return mappedItems;
    }

    const contextMap = Object.fromEntries(
      mappedItems.map((item) => [item.name, item.value]),
    ) as Record<string, any>;
    const logicObjects = logicEntry.value as Record<
      string,
      (...args: any[]) => any
    >;
    const parserObject = DclParser.getObject(rustCache);

    logics.forEach((logic) => {
      if (logic.name === '') return;

      logicObjects[logic.name] = (...args: any[]) => {
        const compiledJs = TypescriptUtil.transpileTsModuleToCjs(logic.source);
        const createExportedFunc = new Function(
          '$env',
          '$resource',
          '$dataset',
          '$process',
          '$logic',
          '$parser',
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

        if (typeof exported !== 'function') {
          throw new Error(`$logic.${logic.name} did not export a function.`);
        }

        return exported(...args);
      };
    });

    return mappedItems;
  };

  export const createDeclareDef = (data: Props) => {
    const { envs: envVars, resources, datasets, processes, logics } = data;
    const items: {
      name: string;
      defs: {
        name: string;
        declareDef: string;
      }[];
    }[] = [];

    // 迺ｰ蠅・､画焚
    if (envVars.length > 0) {
      items.push({
        name: '$env',
        defs: envVars.map((env) => {
          const declareDef = `${env.varName}: string`;
          return { name: env.varName, declareDef };
        }),
      });
    }
    // 蝗ｺ螳壹Μ繧ｽ繝ｼ繧ｹ
    if (resources.length > 0) {
      items.push({
        name: '$resource',
        defs: resources.map((r) => {
          let source = r.source;
          const varName = r.varName;
          let type: string = 'string';
          if (r.parse != undefined) {
            const defs = DataUtil.convertTableToColDefs(source, r.parse);
            type = `{\n${defs.map((def) => `  "${def.name}": ${def.type}`)};\n}[]`;
          }
          const declareDef = `${varName}: ${type}`;
          return { name: varName, declareDef };
        }),
      });
    }
    // 繝・・繧ｿ繧ｻ繝・ヨ
    if (datasets.length > 0) {
      items.push({
        name: '$dataset',
        defs: datasets.map((dataset) => {
          const name = `${dataset.varName}`;
          const types = [
            'fileName: string',
            'absolutePath: string',
            'relativePath: string',
            'content: () => Promise<string>',
          ];
          return {
            name,
            declareDef: `${name}: {${types.join('; ')}}[]`,
          };
        }),
      });
    }
    // 繝励Ο繧ｻ繧ｹ
    if (processes.length > 0) {
      items.push({
        name: '$process',
        defs: processes.map((proc) => {
          const name = `${proc.funcName}`;
          const args = proc.scriptArgs.map((a) => `${a.name}: ${a.type}`);
          return {
            name,
            declareDef: `${name}: (${args}) => Promise<{stdout: string; stderr: string; exitCode: number;}>`,
          };
        }),
      });
    }
    if (logics.length > 0) {
      const ambientDefs = createLogicSignatureAmbientDefs(items);
      items.push({
        name: '$logic',
        defs: logics.map((logic) => {
          const signature = LogicSignatureCache.get({
            source: logic.source,
            injectionDefs: ambientDefs,
          });
          const name = `${logic.name}`;
          const declareDef = `${name}: ${LogicSignatureCache.formatFunctionType(
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
          .join(',')}}`,
    );
  };

  export const createLogicSignatureAmbientDefs = (
    items: {
      name: string;
      defs: {
        name: string;
        declareDef: string;
      }[];
    }[],
  ) => {
    const parserDeclare = DeclareUtil.createUtilDeclareDef('parser');
    return [
      `${parserDeclare.typeDec} declare const $parser: ${parserDeclare.valueDec};`,
      ...items.map(
        (item) =>
          `declare const ${item.name}: {${item.defs
            .map((d) => d.declareDef)
            .join(',')}}`,
      ),
    ];
  };
}
export default ContextDataUtil;
