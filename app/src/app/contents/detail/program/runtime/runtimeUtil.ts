namespace RuntimeUtil {

    export const PLAIN_CHANNEL_ID = '__plain__';
    export type WorkerCache = {
        progress: ProgressProps;
        prepar: PreparCache;
        vfs: VFSState | null;
        rust: RustCache;

        scheduleFlush: (channelId: string) => void;
        createVFS: () => VFSState
    }

    export type PreparCache = {
        datasetMap: { key: string, targets: string[] }[];
    }

    export type RustCache = {
        workerId: string;
        logQueues: Map<string, string[][]>;
    }

    type ProgressProps = {
        total: number;
        current: number;
    }

    /**
     * 仮想FSの状態を管理するプロパティ
     */
    export type VFSState = {
        pathIndex: Map<string, FileToken>;
        fileTable: Map<FileToken, FileState>;
        reservedPaths: Set<string>;

        copyOps: Array<CopyOps>;
    };
    export type CopyOps = {
        from: string;
        dest: string;
    };

    export const getInitialVfsState = (): VFSState => ({
        pathIndex: new Map(),
        fileTable: new Map(),
        reservedPaths: new Set(),
        copyOps: new Array(),
    });

    export type FileToken = {
        readonly __fileTokenBrand: unique symbol;
        id: number;
    };

    export const createFileToken = (): FileToken => {
        return {} as RuntimeUtil.FileToken;
    }

    export type FileState = {
        path: string;

        // 内容の意図
        intent?: "create" | "modify" | "delete";

        // renameした場合のみ
        renameTo?: string;

        snapshot?: {
            mtimeMs: number;
            size: number;
        };

        textCache?: {
            encoding: "utf8" | "sjis";
            original: string;
            current: string;
        };
    };

};

export default RuntimeUtil;