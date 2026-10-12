import type DatasetState from '../../../../state/model/workspace/dataset-state';

namespace DatasetScanResult {
  export const getTargets = (root: DatasetState.PayloadNode): string[] => {
    if (root.children == null)
      throw new Error('Scan root must be a directory.');
    const targets: string[] = [];
    const visit = (node: DatasetState.PayloadNode, parts: string[]) => {
      const next = [...parts, node.name];
      if (node.children == null) targets.push(`\\${next.join('\\')}`);
      else node.children.forEach((child) => visit(child, next));
    };
    root.children.forEach((child) => visit(child, []));
    return targets;
  };
}
export default DatasetScanResult;
