import type {
  Workspace,
  WorkDefinition,
  OutputMethod,
  ValidationTarget,
  ValidationCategory,
} from "../model/workspace";

export type ExecutionContextData = Pick<
  Workspace,
  "envs" | "resources" | "datasets" | "processes" | "logics"
>;

export type ReservedApi =
  | "print"
  | "println"
  | "channel"
  | "runtime"
  | "fs"
  | "net"
  | "state"
  | "parser";

export type WorkExecutionPlan = {
  source: string;
  outputMethod: OutputMethod;
  contextData: ExecutionContextData;
  usableUtils: ReservedApi[];
};

export const selectContextData = (
  workspace: Workspace,
  disables: readonly ValidationTarget[],
  professional: boolean,
): ExecutionContextData => {
  const enabled = (cat: ValidationCategory, index: number) =>
    !disables.some((item) => item.cat === cat && item.index === index);
  return {
    envs: workspace.envs.filter((_, index) => enabled("env", index)),
    resources: workspace.resources.filter((_, index) =>
      enabled("resource", index),
    ),
    datasets: workspace.datasets.filter((_, index) =>
      enabled("dataset", index),
    ),
    processes: professional
      ? workspace.processes.filter((_, index) => enabled("process", index))
      : [],
    logics: professional
      ? workspace.logics.filter((_, index) => enabled("logic", index))
      : [],
  };
};

export const selectReservedApis = (
  method: OutputMethod,
  professional: boolean,
): ReservedApi[] => {
  const apis: ReservedApi[] = [];
  if (method === "plain") apis.push("print", "println");
  if (method === "channel") apis.push("channel");
  apis.push("runtime", "state", "parser");
  if (professional) apis.push("fs", "net");
  return apis;
};

export const createWorkExecutionPlan = ({
  workspace,
  work,
  disables,
  professional,
}: {
  workspace: Workspace;
  work: WorkDefinition;
  disables: readonly ValidationTarget[];
  professional: boolean;
}): WorkExecutionPlan => ({
  source: work.source,
  outputMethod: work.method,
  contextData: selectContextData(workspace, disables, professional),
  usableUtils: selectReservedApis(work.method, professional),
});

export const compileWorkExecution = (
  plan: WorkExecutionPlan,
  transpile: (source: string) => {
    outputText: string;
    sourceMapText?: string;
  },
) => {
  const { outputText, sourceMapText } = transpile(plan.source);
  if (!sourceMapText) {
    throw new Error("Work compilation did not produce a source map.");
  }
  return {
    outputText,
    sourceMapText,
    contextData: plan.contextData,
    usableUtils: plan.usableUtils,
    outputMethod: plan.outputMethod,
  };
};
