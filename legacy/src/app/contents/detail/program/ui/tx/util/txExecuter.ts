import TxCommitRunner from "./txCommitRunner";
import type TxPlanNormalize from "./txPlanNormalize";
import TxVerifyUtil from "./txVerifyUtil";

namespace TxExecuter {
    export type Phase = "confirm" | "verify" | "commit";

    export type CommitResult =
        | { kind: 'success'; }
        | { kind: 'error'; detail: string }


    export type VerifyResult =
        | { kind: 'checked'; }
        | { kind: 'warn'; message: string; }
        | { kind: 'error'; message: string; }

    export interface Status {
        verify?: VerifyResult;
        commit?: CommitResult;
    }

    export interface OrderRow {
        order: TxPlanNormalize.Order;
        status: TxExecuter.Status;
    }

    export const run = async (props: {
        setPhase: (phase: Phase) => void;
        rows: TxExecuter.OrderRow[];
        progressTick: () => void;
    }) => {
        const { setPhase, progressTick } = props;

        setPhase("verify");

        const orderPriority: Record<string, number> = {
            create_dir: 0,
            copy_file: 1,
            delete_file: 2,
            create_file: 3,
            modify_file: 4,
            rename_file: 5,
        };

        const rows = props.rows.slice().sort((a, b) => {
            return orderPriority[a.order.type] - orderPriority[b.order.type];
        });

        const reserveDirs: string[] = [];
        for (const row of rows) {
            const { order, status } = row;
            switch (order.type) {
                case "create_dir":
                    const result = await TxVerifyUtil.checkCreateDir(
                        order.path
                    );
                    status.verify = result;
                    if (result.kind === 'checked') reserveDirs.push(order.path);
                    break;
                case "copy_file":
                    status.verify = await TxVerifyUtil.checkCopyFile(
                        order.from,
                        order.to,
                        reserveDirs
                    );
                    break;
                case "create_file":
                    status.verify = await TxVerifyUtil.checkSaveFile(order.path, reserveDirs);
                    break;
                case "modify_file":
                    status.verify = await TxVerifyUtil.checkExistsFile(order.path, false);
                    break;
                case "delete_file":
                    status.verify = await TxVerifyUtil.checkExistsFile(order.path, true);
                    break;
                case "rename_file":
                    status.verify = await TxVerifyUtil.checkRenameFile(
                        order.from,
                        order.to,
                    );
                    break;
            }
        }
        const errCnt = rows.filter((r) => r.status.verify?.kind === 'error').length;
        const warnCnt = rows.filter((r) => r.status.verify?.kind === "warn").length;

        // エラーがあったらコミットに進まない
        if (errCnt > 0 || warnCnt > 0) {
            return;
        }

        setPhase("commit");

        for (const row of rows) {
            const { order, status } = row;
            switch (order.type) {
                case "create_dir": {
                    status.commit = await TxCommitRunner.makeDir(
                        order.path
                    );
                } break;
                case "copy_file": {
                    status.commit = await TxCommitRunner.copyFile(
                        order.from, order.to
                    );
                } break;
                case "create_file": {
                    status.commit = await TxCommitRunner.saveText(
                        order.path,
                        order.content,
                        "utf8",
                    );
                } break;
                case "modify_file": {
                    status.commit = await TxCommitRunner.saveText(
                        order.path,
                        order.current,
                        order.encoding
                    );
                    break;
                }
                case "delete_file": {
                    status.commit = await TxCommitRunner.deleteFile(order.path);
                    break;
                }
                case "rename_file": {
                    status.commit = await TxCommitRunner.renameFile(
                        order.from,
                        order.to,
                    );
                    break;
                }
            }
            // await new Promise((resolve) => setTimeout(resolve, 10));
            progressTick();
        }
    }
};
export default TxExecuter;