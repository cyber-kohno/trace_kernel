import type { ExecutionContextData } from "./work-execution-plan";
import DataUtil from "../data/data-util";

export type TextFileRequest = {
  filePath: string;
  encoding: "utf8" | "sjis";
};

export type ProcessRequest = {
  program: string;
  args: string[];
  cwd?: string;
  stdin?: string;
  timeoutMs: number;
  stdinEncoding: "utf8" | "sjis";
};

export type ProcessResult = {
  stdout: number[];
  stderr: number[];
  exitCode: number;
};

export type ContextIoPorts = {
  readTextFile: (request: TextFileRequest) => Promise<string>;
  runProcess: (request: ProcessRequest) => Promise<ProcessResult>;
};

export const createIoContext = (
  data: ExecutionContextData,
  datasetMap: readonly { key: string; targets: string[] }[],
  ports: ContextIoPorts,
) => {
  const datasets = data.datasets.map((dataset) => {
    let { targets } = dataset;
    if (targets == null) {
      const prepared = datasetMap.find((item) => item.key === dataset.varName);
      if (prepared == null) throw new Error();
      targets = prepared.targets;
    }
    return {
      name: dataset.varName,
      value: targets.map((relativePath) => {
        const fileName = relativePath.split(/[/\\]/).pop()!;
        const rootPath = DataUtil.getAppliedEnvValue(
          dataset.rootPath,
          data.envs,
        );
        const absolutePath = rootPath + relativePath;
        return {
          fileName,
          absolutePath,
          relativePath,
          content: () =>
            ports.readTextFile({
              filePath: absolutePath,
              encoding: dataset.encoding,
            }),
        };
      }),
    };
  });

  const processes = data.processes.map((process) => {
    const callback = async (...scriptArgValues: (string | number)[]) => {
      const scriptKV = scriptArgValues.map((arg, index) => {
        const def = process.scriptArgs[index];
        if (typeof arg !== def.type) {
          throw new Error(`Argument types do not match definition. [${arg}]`);
        }
        const value = String(arg);
        if (value === "") {
          throw new Error("Command line arguments do not allow empty strings.");
        }
        return { key: `__${def.name}__`, value };
      });
      const applyScriptArgs = (base: string) => {
        let value = DataUtil.getAppliedEnvValue(base, data.envs);
        scriptKV.forEach((kv) => {
          value = value.replaceAll(kv.key, kv.value);
        });
        return value;
      };
      const normalizeOptional = (value: string) =>
        value === "" ? undefined : value;
      const cwd = process.cwd ?? "";
      const stdin = process.stdin ?? "";
      const request: ProcessRequest = {
        program: DataUtil.getAppliedEnvValue(process.prgPath, data.envs),
        args: process.cmdArgs.map((arg) => applyScriptArgs(arg)),
        cwd: normalizeOptional(applyScriptArgs(cwd)),
        stdin: normalizeOptional(applyScriptArgs(stdin)),
        timeoutMs: process.timeout,
        stdinEncoding: process.encoding.stdin ?? "utf8",
      };
      const unresolved = [
        ...request.args,
        ...(request.cwd == undefined ? [] : [request.cwd]),
        ...(request.stdin == undefined ? [] : [request.stdin]),
      ].filter((value) => /__\w+__/.test(value));
      if (unresolved.length > 0) {
        throw new Error(
          `Unresolved script arguments: ${unresolved.join(", ")}`,
        );
      }
      scriptKV.forEach((kv) => {
        const used =
          process.cmdArgs.some((arg) => arg.includes(kv.key)) ||
          cwd.includes(kv.key) ||
          stdin.includes(kv.key);
        if (!used) {
          throw new Error(
            `Script argument "${kv.key}" is never used in cmdArgs, cwd, or stdin.`,
          );
        }
      });
      const result = await ports.runProcess(request);
      return {
        stdout: DataUtil.decodeBinary(
          new Uint8Array(result.stdout),
          process.encoding.stdout,
        ),
        stderr: DataUtil.decodeBinary(
          new Uint8Array(result.stderr),
          process.encoding.stderr,
        ),
        exitCode: result.exitCode,
      };
    };
    return { name: process.funcName, value: callback };
  });
  return { datasets, processes };
};
