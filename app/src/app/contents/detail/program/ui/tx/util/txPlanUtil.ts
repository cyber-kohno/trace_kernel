import type RuntimeUtil from "../../../runtime/runtimeUtil";
import type TxExecuter from "./txExecuter";
import type TxVerifyUtil from "./txVerifyUtil";

namespace TxPlanUtil {

    export type TxPlanModel = {
        fileChanges: FileChangeProps[];
        fileCopies: FileCopyProps[];
    }

    interface PlanState {
        verify?: TxExecuter.VerifyResult;
        commit?: CommitResult;
    }
    export interface FileChangeProps extends PlanState {
        kind: "create" | "modify" | "delete" | "rename";
        path: string;
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

    interface FileCopyProps extends PlanState {
        from: string;
        dest: string;
    };

    export type CommitResult =
        | { kind: 'success'; }
        | { kind: 'error'; detail: string }

    export const convertVfsToPlan = (vfs: RuntimeUtil.VFSState): TxPlanModel => {
        const fileChanges: FileChangeProps[] = [];

        for (const [_, state] of vfs.fileTable.entries()) {
            if (!state.intent && !state.renameTo) continue;

            const item: FileChangeProps = {
                kind: state.intent ?? "rename",
                renameTo: state.renameTo,
                path: state.path,

                snapshot: state.snapshot,
                textCache: state.textCache
            };
            fileChanges.push(item);
        }

        const fileCopies: FileCopyProps[] = vfs.copyOps.map(op => ({ ...op }));

        return { fileChanges, fileCopies };
    };

    export type TxStatus =
        | "idle"
        | "verify-ok"
        | "verify-warn"
        | "verify-error"
        | "commit-ok"
        | "commit-error";

    export const getStatus = (order: TxExecuter.Status): TxStatus => {
        if (!order.verify) return 'idle';
        if (!order.commit) {
            switch (order.verify.kind) {
                case "checked": return 'verify-ok';
                case "warn": return 'verify-warn';
                case "error": return 'verify-error';
            }
        }
        switch (order.commit.kind) {
            case "success": return 'commit-ok';
            case "error": return 'commit-error';
        }
    };

    export const getIcon = (status: TxStatus) => {
        switch (status) {
            case 'idle': return "⏳";
            case 'verify-ok': return "✅";
            case 'verify-warn': return "⚠";
            case 'verify-error': return "❌";
            case 'commit-ok': return "✔";
            case 'commit-error': return "🚫";
        }
    };
};
export default TxPlanUtil;