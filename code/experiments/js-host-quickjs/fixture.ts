import DclChannel from "../../packages/runtime-core/src/api/dcl-channel";
import DclNet from "../../packages/runtime-core/src/api/dcl-net";
import RuntimeUtil from "../../packages/runtime-core/src/execution/runtime-cache";
import DclFileSystem from "../../packages/runtime-core/src/api/fs/dcl-file-system";
import DclRuntime from "../../packages/runtime-core/src/api/dcl-runtime";
import DclParser from "../../packages/runtime-core/src/api/parser/dcl-parser";
import TxPlanNormalize from "../../packages/runtime-core/src/transaction/tx-plan-normalize";
import TransactionService from "../../packages/runtime-core/src/transaction/transaction-service";
import type TransactionIO from "../../packages/runtime-core/src/transaction/transaction-io";
import DataUtil from "../../packages/runtime-core/src/data/data-util";
import HostCall from "./host-call";
import {
  createReservedApi,
  createStateApi,
} from "../../packages/runtime-core/src/execution/create-reserved-api";
import { createWorkContext } from "../../packages/runtime-core/src/execution/create-work-context";
import {
  createWorkExecutionPlan,
  compileWorkExecution,
  type ExecutionContextData,
} from "../../packages/runtime-core/src/execution/work-execution-plan";
import { runPreparedWork } from "../../packages/runtime-core/src/execution/run-work";
import { createFlushScheduler } from "../../packages/runtime-core/src/execution/stream-flush";

declare const __beginWork: () => void;
declare const __finishWork: undefined | (() => void);
declare const __finishNative: undefined | (() => void);

export const run = async (
  outputText: string,
  options: {
    nativeChannels?: boolean;
    contextData?: ExecutionContextData;
    professional?: boolean;
    outputMethod?: "plain" | "channel";
    compiledLogics?: Record<string, string>;
  } = {},
) => {
  const cache: RuntimeUtil.WorkerCache = {
    progress: { current: 0, total: 0 },
    preparation: { datasetMap: [] },
    vfs: null,
    rust: { executionId: "spike", logQueues: new Map() },
    scheduleFlush: (id) => scheduler.schedule(id),
    createVFS: () => {
      const vfs = RuntimeUtil.getInitialVfsState();
      cache.vfs = vfs;
      return vfs;
    },
  };
  const states: unknown[] = [];
  const channels: unknown[] = [];
  const registrations = new Map<string, Promise<void>>();
  const scheduler = createFlushScheduler({
    getBatches: (id) => cache.rust.logQueues.get(id)?.splice(0) ?? [],
    appendToRuntime: async (id, batches) => {
      await registrations.get(id);
      if (options.nativeChannels)
        await HostCall.call<void>("append_lines", {
          executionId: cache.rust.executionId,
          channelId: id,
          batches,
        });
      await HostCall.call<void>("append_output", {
        text: batches.map((lines) => lines.join("\n")).join(""),
      });
    },
    notifyUI: () => {},
    getActiveChannelIds: () => Array.from(cache.rust.logQueues.keys()),
    hasAnyPending: () =>
      Array.from(cache.rust.logQueues.values()).some(
        (queue) => queue.length > 0,
      ),
  });
  cache.rust.channelReady = registrations;
  const register = (id: string) => {
    DclChannel.registerChannel(
      cache,
      { id, view: "text", detail: {} },
      HostCall,
      () => {},
    );
    return registrations.get(id)!;
  };
  const parser = () => DclParser.getObject(cache.rust, HostCall);
  const ioPorts = {
    readTextFile: (req: { filePath: string; encoding: string }) =>
      HostCall.call<string>("read_file", { req }),
    runProcess: (req: any) =>
      HostCall.call<any>("run_process", { executionId: "spike", req }),
    createParserObject: parser,
    transpileLogic: (source: string) => {
      const compiled = options.compiledLogics?.[source];
      if (compiled == null) throw new Error("Missing compiled logic fixture.");
      return compiled;
    },
  };
  const apiPorts = {
    plainChannelId: RuntimeUtil.PLAIN_CHANNEL_ID,
    appendLines: (id: string, lines: string[]) => {
      const queue = cache.rust.logQueues.get(id) ?? [];
      cache.rust.logQueues.set(id, queue);
      queue.push(lines);
      scheduler.schedule(id);
    },
    registerChannel: (definition: any) => {
      DclChannel.registerChannel(cache, definition, HostCall, (props) =>
        channels.push(props),
      );
    },
    createFileSystem: () => DclFileSystem.getObject(cache, HostCall),
    createRuntime: () => DclRuntime.getObject(),
    createParser: parser,
    createNetwork: () => DclNet.getObject(cache.rust, HostCall),
    createState: () =>
      createStateApi(cache.progress, (event) => states.push(event)),
  };
  const workspace = options.contextData ?? {
    envs: [],
    resources: [],
    datasets: [],
    processes: [],
    logics: [],
  };
  const plan = createWorkExecutionPlan({
    workspace: workspace as any,
    work: {
      source: outputText,
      method: options.outputMethod ?? "plain",
    } as any,
    disables: [],
    professional: options.professional ?? true,
  });
  const execution = compileWorkExecution(plan, (source) => ({
    outputText: source,
    sourceMapText: "spike-map",
  }));
  const outcome = await runPreparedWork(execution, {
    initialize: () => HostCall.call("worker_init", { executionId: "spike" }),
    createReservedApi: (name) => createReservedApi(name, apiPorts),
    scanDirectory: (req) => HostCall.call<any>("scan_directory", { req }),
    onPrepared: (datasets) => {
      cache.preparation.datasetMap = datasets;
    },
    prepareOutput: async (method) => {
      if (method === "plain") await register(RuntimeUtil.PLAIN_CHANNEL_ID);
    },
    createContext: (data, datasets) => {
      const context = createWorkContext(data, datasets, ioPorts);
      __beginWork();
      return context;
    },
    isExitSignal: DclRuntime.isExitSignal,
    waitForRegistrations: () => {
      if (typeof __finishWork === "function") __finishWork();
      return Promise.all(registrations.values());
    },
    flushOutput: () => scheduler.finish(),
  });
  if (typeof __finishNative === "function") __finishNative();
  const orders = cache.vfs ? TxPlanNormalize.convertVfsToOrder(cache.vfs) : [];
  const metadata = {
    ...(channels.length ? { channels } : {}),
    ...(states.length ? { states } : {}),
  };
  if (outcome.status === "failed") {
    const value = outcome.error;
    return {
      kind: "runtime-error",
      error: {
        name: value instanceof Error ? value.name : typeof value,
        message: value instanceof Error ? value.message : String(value),
        hasStack: value instanceof Error && typeof value.stack === "string",
      },
      orders,
      ...metadata,
    };
  }
  const io: TransactionIO.Port = {
    existsPath: (path) => HostCall.call("exists_path", { path }),
    stat: (path) => HostCall.call("stat", { path }),
    readDirectory: (dir) => HostCall.call("read_dir", { dir }),
    readText: async (filePath, encoding) => {
      const bytes = await HostCall.call<number[]>("read_binary", { filePath });
      return DataUtil.decodeBinary(new Uint8Array(bytes), encoding);
    },
    saveText: (path, content, encoding) =>
      HostCall.call("save_binary", {
        path,
        bytes: Array.from(DataUtil.encodeText(content, encoding)),
      }),
    deleteFile: (path) => HostCall.call("delete_file", { path }),
    deleteDir: (path) => HostCall.call("delete_dir", { path }),
    renameFile: (from, to) => HostCall.call("rename", { from, to }),
    copyFile: (src, dest) => HostCall.call("copy_file", { src, dest }),
    makeDir: (dirPath) => HostCall.call("make_dir", { dirPath }),
  };
  const session = TransactionService.create(orders, io);
  const result = await session.run();
  const snapshot = session.getSnapshot();
  return {
    kind: result.kind,
    result,
    state: snapshot.state,
    operations: snapshot.operations,
    completedCount: snapshot.completedCount,
    ...metadata,
  };
};
