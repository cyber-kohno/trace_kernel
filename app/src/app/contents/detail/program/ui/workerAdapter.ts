import { invoke } from "@tauri-apps/api/core";
import PostUtil from "../postUtil";
import type { MessageProps } from "../runtime/worker";
import type RuntimeUtil from "../runtime/runtimeUtil";
import type DclChannel from "../util/channel/dclChannel";

namespace WorkerAdapter {

    type StatePayload =
        {
            [K in PostUtil.StateMethod]: {
                method: K;
            } & PostUtil.StateMethodMap[K];
        }[PostUtil.StateMethod];

    export type StateEvent = {
        type: "state";
    } & StatePayload;

    export type WorkerEvent =
        // | { type: "log"; value: string }
        | { type: "create_stream"; props: DclChannel.Props }
        | { type: "receive_stream"; channelId: string; }
        | { type: "prepar_end" }
        | { type: "invoke"; command: string; args: any; id: string; callsiteStack: string }
        | { type: "runtime-error"; stack: string, sourceMap: string }
        | { type: "done"; vfs: RuntimeUtil.VFSState | null }
        | { type: "progress"; cur: number; total?: number }
        | StateEvent;

    export const post = (e: WorkerEvent) => {
        postMessage(e);
    }

    export const use = (onEvent: (e: WorkerEvent) => void) => {

        let worker: Worker;

        const init = () => {
            // worker.ts を生成して別スレッドで実行
            worker = new Worker(new URL("../runtime/worker.ts", import.meta.url), {
                type: "module",
            });
            worker.onmessage = async (e) => {
                const data = e.data;
                // 解析だけして
                onEvent({ ...data });
            };
            // console.log(worker);
        };

        const terminate = () => {
            worker.terminate();
            invoke('worker_dispose', { workerId: 'a' });
        }
        const start = (props: MessageProps) => worker.postMessage(props);

        const postInvoke = async (e: { type: "invoke"; command: string; args: any; id: string; callsiteStack: string }) => {

            try {
                const result = await invoke(e.command, e.args);
                worker.postMessage({ type: "invoke-result", id: e.id, result });
            } catch (err: any) {
                const callsiteStackArr = (e.callsiteStack as string).split("\n");
                callsiteStackArr[0] = err;
                worker.postMessage({
                    type: "invoke-error",
                    callsiteStack: callsiteStackArr.join("\n"),
                });
            }
        }
        return {
            init,
            terminate,
            start,
            postInvoke
        }
    };

}
export default WorkerAdapter;