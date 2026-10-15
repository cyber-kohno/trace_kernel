/** Browser-independent runtime exports for an embedding host. */
export { default as RuntimeCache } from "../execution/runtime-cache";
export { createWorkContext } from "../execution/create-work-context";
export {
  createWorkExecutionPlan,
  compileWorkExecution,
} from "../execution/work-execution-plan";
export { runPreparedWork } from "../execution/run-work";
export {
  createReservedApi,
  createStateApi,
} from "../execution/create-reserved-api";
export { createFlushScheduler } from "../execution/stream-flush";
export { default as FileSystem } from "../api/fs/dcl-file-system";
export { default as Runtime } from "../api/dcl-runtime";
export { default as Network } from "../api/dcl-net";
export { default as Parser } from "../api/parser/dcl-parser";
export { default as Channel } from "../api/dcl-channel";
export { default as State } from "../api/dcl-state";
export { default as TransactionService } from "../transaction/transaction-service";
export { default as PlanNormalize } from "../transaction/tx-plan-normalize";
export { default as WorkspaceCodec } from "../workspace/workspace-codec";
export { default as ValidateWorkspace } from "../workspace/validate-workspace";
export { default as License } from "../license/license-util";
export { CURRENT_GEN } from "../metadata/gen-version.js";
export { default as Data } from "../data/data-util";
