import type StoreProcess from "../../../../store/StoreProcess";
import type StoreDataset from "../../../../store/storeDataset";
import type StoreResource from "../../../../store/StoreResource";
import type { FileRequest } from "../../../../store/types";
import DataUtil from "../../../../util/data/dataUtil";
import FileUtil from "../../../../util/data/fileUtil";
import type RuntimeUtil from "../runtime/runtimeUtil";
import WorkerInvoke from "./workerInvoke";
import type StoreEnv from "../../../../store/storeEnv";
import type StoreWorkspace from "../../../../store/storeWorkspace";
import StoreLicense from "../../../../store/storeLIcense";

namespace ContextDataUtil {

    export type Props = {
        envs: StoreEnv.Props[];
        resources: StoreResource.Props[];
        datasets: StoreDataset.Props[];
        processes: StoreProcess.Props[];
    }

    export const getUsableData = (workspace: StoreWorkspace.Props, disables: StoreWorkspace.Target[]) => {
        const isDisable = (cat: StoreWorkspace.Category, i: number) =>
            disables.find((d) => d.cat === cat && d.index === i) != undefined;

        let processes: StoreProcess.Props[] = [];
        if (StoreLicense.isPro()) {
            processes = workspace.processes.filter((_, i) => !isDisable("process", i));
        }
        const injectionalData: ContextDataUtil.Props = {
            envs: workspace.envs.filter((_, i) => !isDisable("env", i)),
            resources: workspace.resources.filter((_, i) => !isDisable("resource", i)),
            datasets: workspace.datasets.filter((_, i) => !isDisable("dataset", i)),
            processes,
        };
        return injectionalData;
    }

    export const createObjects = (data: Props, prepar: RuntimeUtil.PreparCache) => {
        const { envs: envVars, resources, datasets, processes } = data;
        const items = [
            // 環境変数
            {
                name: '$env',
                objects: envVars.map(env => {
                    return {
                        name: env.varName,
                        value: env.value
                    }
                })
            },
            // 固定リソース
            {
                name: '$resource',
                objects: resources.map(r => {
                    let source = r.source;
                    const varName = r.varName;
                    let value: any = source;
                    if (r.parse != undefined) {
                        value = DataUtil.convertTableToJson(source, r.parse);
                    }
                    return { name: varName, value };
                })
            },
            // ファイルごと
            {
                name: '$dataset',
                objects: datasets.map(ds => {
                    const name = ds.varName;
                    const value = (() => {
                        let { encoding, rootPath, targets } = ds;
                        // 遅延ロードのキャッシュから取得
                        if (targets == null) {
                            const fnd = prepar.datasetMap.find(dm => dm.key === ds.varName);
                            if (fnd == undefined) throw new Error();
                            targets = fnd.targets;
                        }
                        return targets.map((t) => {
                            const fileName = FileUtil.getFileNameFromPath(t);
                            const fixedRootPath = DataUtil.getAppliedEnvValue(rootPath, data.envs);
                            const absolutePath = fixedRootPath + t;
                            const relativePath = t;
                            const content = async () => {
                                const req: FileRequest = { filePath: absolutePath, encoding };
                                const text = await WorkerInvoke.call<string>("read_file", { req });
                                return text;
                            };

                            return { fileName, absolutePath, relativePath, content };
                        });
                    })();
                    return {
                        name,
                        value
                    };
                })
            },
            // プロセス
            {
                name: '$process',
                objects: processes.map(process => {
                    type ReturnType = { stdout: string; stderr: string; exitCode: number; };
                    const { prgPath, cmdArgs, scriptArgs, timeout } = process;
                    const callback = (async (...scriptArgValues: (string | number)[]): Promise<ReturnType> => {
                        type InvokeType = { stdout: number[]; stderr: number[]; exitCode: number; };

                        // スクリプト引数のKVを生成
                        const scriptKV = scriptArgValues.map((arg, i) => {
                            const def = scriptArgs[i];

                            // 型チェック
                            if (typeof arg !== def.type) {
                                throw new Error(`Argument types do not match definition. [${arg}]`);
                            }
                            const value = String(arg);
                            // 空文字チェック
                            if (value === '') throw new Error('Command line arguments do not allow empty strings.');
                            return { key: `__${def.name}__`, value };
                        });

                        const req = {
                            program: DataUtil.getAppliedEnvValue(prgPath, envVars),
                            args: cmdArgs.map(c => {
                                let cmd = DataUtil.getAppliedEnvValue(c, envVars);
                                // スクリプト引数を注入
                                scriptKV.forEach(kv => {
                                    cmd = cmd.replaceAll(kv.key, kv.value);
                                });
                                return cmd;
                            }),
                            timeoutMs: timeout,
                        };

                        // 未解決プレースホルダのチェック
                        const unresolved = req.args.filter(a => /__\w+__/.test(a));
                        if (unresolved.length > 0) {
                            throw new Error(
                                `Unresolved script arguments: ${unresolved.join(', ')}`
                            );
                        }
                        // 未使用スクリプト引数のチェック
                        scriptKV.forEach(kv => {
                            const used = cmdArgs.some(c => c.includes(kv.key));
                            if (!used) {
                                throw new Error(`Script argument "${kv.key}" is never used in cmdArgs.`);
                            }
                        });

                        const res = await WorkerInvoke.call<InvokeType>("run_process", { req });
                        return {
                            stdout: DataUtil.decodeBinary(new Uint8Array(res.stdout), process.encoding.stdout),
                            stderr: DataUtil.decodeBinary(new Uint8Array(res.stderr), process.encoding.stderr),
                            exitCode: res.exitCode
                        }
                    });
                    return {
                        name: process.funcName,
                        value: callback
                    }
                })
            },
        ];
        return items.map(item => {
            const objects: any = {};
            item.objects.forEach(o => {
                objects[o.name] = o.value;
            });
            return { name: item.name, value: objects };
        });
    }

    export const createDeclareDef = (data: Props) => {

        const { envs: envVars, resources, datasets, processes } = data;
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
                name: '$env',
                defs: envVars.map(env => {
                    const declareDef = `${env.varName}: string`;
                    return { name: env.varName, declareDef };
                })
            });
        }
        // 固定リソース
        if (resources.length > 0) {
            items.push({
                name: '$resource',
                defs:
                    resources.map(r => {
                        let source = r.source;
                        const varName = r.varName;
                        let type: string = "string";
                        if (r.parse != undefined) {
                            const defs = DataUtil.convertTableToColDefs(source, r.parse);
                            type = `{\n${defs.map(def => `  "${def.name}": ${def.type}`)};\n}[]`;
                        }
                        const declareDef = `${varName}: ${type}`;
                        return { name: varName, declareDef };
                    })
            });
        }
        // データセット
        if (datasets.length > 0) {
            items.push({
                name: '$dataset',
                defs:
                    datasets.map((dataset) => {
                        const name = `${dataset.varName}`;
                        const types = [
                            "fileName: string",
                            "absolutePath: string",
                            "relativePath: string",
                            "content: () => Promise<string>",
                        ];
                        return {
                            name,
                            declareDef: `${name}: {${types.join("; ")}}[]`,
                        };
                    })
            });
        }
        // プロセス
        if (processes.length > 0) {
            items.push({
                name: '$process',
                defs:
                    processes.map((proc) => {
                        const name = `${proc.funcName}`;
                        const args = proc.scriptArgs.map(a => `${a.name}: ${a.type}`);
                        return {
                            name,
                            declareDef: `${name}: (${args}) => Promise<{stdout: string; stderr: string; exitCode: number;}>`,
                        };
                    })
            });
        }
        return items.
            map(item => `declare const ${item.name}: {${item.defs
                .map(d => d.declareDef)
                .join(',')}}`)
            ;
    }
};
export default ContextDataUtil;