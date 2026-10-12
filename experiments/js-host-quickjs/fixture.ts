import RuntimeUtil from "../../apps/desktop/src/app/contents/detail/program/runtime/runtime-util";
import DclFileSystem from "../../apps/desktop/src/app/contents/detail/program/util/fs/dcl-file-system";
import DclRuntime from "../../apps/desktop/src/app/contents/detail/program/util/dcl-runtime";
import DclParser from "../../apps/desktop/src/app/contents/detail/program/util/parser/dcl-parser";
import TxPlanNormalize from "../../apps/desktop/src/app/contents/detail/program/ui/tx/util/tx-plan-normalize";
import TransactionService from "../../apps/desktop/src/app/contents/detail/program/runtime/transaction/transaction-service";
import type TransactionIO from "../../apps/desktop/src/app/contents/detail/program/runtime/transaction/transaction-io";
import DataUtil from "../../apps/desktop/src/app/util/data/data-util";
import HostCall from "./host-call";

declare const __beginWork: () => void;

export const run = async (outputText: string) => {
  const cache: RuntimeUtil.WorkerCache = {
    progress: { current: 0, total: 0 },
    preparation: { datasetMap: [] },
    vfs: null,
    rust: { executionId: "spike", logQueues: new Map() },
    scheduleFlush: () => {},
    createVFS: () => {
      const vfs = RuntimeUtil.getInitialVfsState();
      cache.vfs = vfs;
      return vfs;
    },
  };
  let output = Promise.resolve();
  const append = (text: string) => {
    output = output.then(() => HostCall.call<void>("append_output", { text }));
  };
  const print = (text: string) => append(text.split("\n").join("\n"));
  const println = (text: string) => append(text.split("\n").join("\n") + "\n");
  const fs = DclFileSystem.getObject(cache);
  const runtime = DclRuntime.getObject();
  const parser = DclParser.getObject(cache.rust);
  const func = new Function(
    "$fs",
    "$runtime",
    "$print",
    "$println",
    "$parser",
    `return (async () => {${outputText}\n})()`,
  );
  let error: { name: string; message: string; hasStack: boolean } | undefined;
  try {
    __beginWork();
    await func(fs, runtime, print, println, parser);
  } catch (value) {
    if (!DclRuntime.isExitSignal(value)) {
      error = {
        name: value instanceof Error ? value.name : typeof value,
        message: value instanceof Error ? value.message : String(value),
        hasStack: value instanceof Error && typeof value.stack === "string",
      };
    }
  }
  // This barrier is a proposed host contract, not the existing Worker scheduler.
  await output;
  const orders = cache.vfs ? TxPlanNormalize.convertVfsToOrder(cache.vfs) : [];
  if (error) return { kind: "runtime-error", error, orders };
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
  };
};
