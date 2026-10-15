import type { DatasetScanOptions, DatasetNode } from "../model/workspace";
import DataUtil from "../data/data-util";
import type { ExecutionContextData } from "./work-execution-plan";

export type DatasetScanRequest = DatasetScanOptions & { rootPath: string };
export type PreparedDataset = { key: string; targets: string[] };
export type DatasetScanPort = {
  scanDirectory: (
    request: DatasetScanRequest,
  ) => Promise<{ node: DatasetNode }>;
};

export const getDatasetTargets = (root: DatasetNode): string[] => {
  if (root.children == null) {
    throw new Error("Scan root must be a directory.");
  }
  const targets: string[] = [];
  const visit = (node: DatasetNode, parts: string[]) => {
    const next = [...parts, node.name];
    if (node.children == null) targets.push(`\\${next.join("\\")}`);
    else node.children.forEach((child) => visit(child, next));
  };
  root.children.forEach((child) => visit(child, []));
  return targets;
};

export const prepareDatasetTargets = async (
  data: Pick<ExecutionContextData, "envs" | "datasets">,
  port: DatasetScanPort,
): Promise<PreparedDataset[]> =>
  Promise.all(
    data.datasets
      .filter((dataset) => dataset.targets == null)
      .map(async (dataset) => {
        const request: DatasetScanRequest = {
          rootPath: DataUtil.getAppliedEnvValue(dataset.rootPath, data.envs),
          ...dataset.scanOption,
        };
        const response = await port.scanDirectory(request);
        return {
          key: dataset.varName,
          targets: getDatasetTargets(response.node),
        };
      }),
  );
