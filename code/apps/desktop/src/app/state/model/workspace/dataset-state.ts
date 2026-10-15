import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';

namespace DatasetState {
  export type Props = Core.DatasetDefinition;

  export const getInitial = (varName: string): Props => {
    return {
      varName,
      rootPath: '',
      encoding: 'utf8',
      scanOption: { dirConds: [], fileConds: [] },
      targets: null,
    };
  };
  export type DatasetPhase = 'scan' | 'choose' | 'list';

  export type ScanOption = Core.DatasetScanOptions;

  export type FileCond = Core.FileCondition;
  export type DirCond = Core.DirectoryCondition;

  export type ScanResponse = {
    result: string;
    node: PayloadNode;
  };
  export type PayloadNode = Core.DatasetNode;

  export interface ChildProps {
    fileCnt: number;
    selectCnt: number;
    isOpen: boolean;
    nodes: UsableNode[];
  }
  export interface UsableNode {
    name: string;
    isSelected: boolean;
    path: string;
    child?: ChildProps;
  }

  export type NodeIndent = 'none' | 'middle' | 'last';
  export type NodeDispProps = {
    indents: NodeIndent[];
    node: UsableNode;
    seq: number;
  };
}
export default DatasetState;
