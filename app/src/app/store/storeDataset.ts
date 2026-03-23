import type StoreResource from "./StoreResource";

namespace StoreDataset {

    export type Props = {
        varName: string;
        rootPath: string;
        encoding: StoreResource.Encoding;
        scanOption: ScanOption;
        targets: string[] | null;
    }

    export const getInitial = (varName: string): Props => {
        return {
            varName,
            rootPath: "",
            encoding: 'utf8',
            scanOption: { dirConds: [], fileConds: [] },
            targets: null
        }
    }
    export type ChoosePhase = "scan" | "choose" | "list";

    export type ScanOption = {
        limitDepth?: number;
        dirConds: DirCond[];
        fileConds: FileCond[];
    };

    export interface FileCond {
        pattern: string;
        isExclude: boolean;
    }
    export interface DirCond extends FileCond {
        depth?: number;
    }

    export type ScanResponse = {
        result: string;
        node: PayloadNode;
    };
    export interface PayloadNode {
        name: string;
        children: null | PayloadNode[];
    }

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

    export type NodeIndent = "none" | "middle" | "last";
    export type NodeDispProps = {
        indents: NodeIndent[];
        node: UsableNode;
        seq: number;
    };
}
export default StoreDataset;