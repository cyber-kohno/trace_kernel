import type {
  compileWorkExecution,
  ExecutionContextData,
  ReservedApi,
} from "./work-execution-plan";
import {
  prepareDatasetTargets,
  type DatasetScanPort,
  type PreparedDataset,
} from "./prepare-dataset-targets";
import {
  executeCompiledWork,
  runWorkLifecycle,
  type WorkBinding,
  type WorkLifecycleStages,
} from "./execute-work";

export type PreparedWorkExecution = ReturnType<typeof compileWorkExecution>;
export type WorkExecutionHost = DatasetScanPort &
  Pick<WorkLifecycleStages, "waitForRegistrations" | "flushOutput"> & {
    initialize: () => Promise<unknown> | unknown;
    createReservedApi: (name: ReservedApi) => unknown;
    onPrepared: (datasets: PreparedDataset[]) => Promise<unknown> | unknown;
    prepareOutput: (
      method: PreparedWorkExecution["outputMethod"],
    ) => Promise<unknown> | unknown;
    createContext: (
      data: ExecutionContextData,
      datasets: PreparedDataset[],
    ) => WorkBinding[];
    isExitSignal: (error: unknown) => boolean;
  };

export const runPreparedWork = (
  execution: PreparedWorkExecution,
  host: WorkExecutionHost,
) =>
  runWorkLifecycle({
    execute: async () => {
      await host.initialize();
      const reserved = execution.usableUtils.map((name) => ({
        name: `$${name}`,
        value: host.createReservedApi(name),
      }));
      const datasets = await prepareDatasetTargets(execution.contextData, host);
      await host.onPrepared(datasets);
      await host.prepareOutput(execution.outputMethod);
      const context = host.createContext(execution.contextData, datasets);
      await executeCompiledWork(
        execution.outputText,
        [...reserved, ...context],
        host.isExitSignal,
      );
    },
    waitForRegistrations: () => host.waitForRegistrations(),
    flushOutput: () => host.flushOutput(),
  });
