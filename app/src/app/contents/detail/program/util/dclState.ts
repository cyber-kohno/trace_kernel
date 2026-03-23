import PostUtil from "../postUtil";
import type RuntimeUtil from "../runtime/runtimeUtil";

namespace DclState {

    type StateAPI = {
        useMonitor: (allocSize: number) => ((str: string) => void)[];
        useProgress: (denominator: number) => { getCurrent: () => number; tick: () => void };
    }
    export const getTypeDeclare = () => `
        type StateAPI = {
            useMonitor: (allocSize: number) => ((str: string) => void)[];
            useProgress: (denominator: number) => { getCurrent: () => number; tick: () => void };
        }
    `;
    export const getValueDeclare = () => `StateAPI`;

    export const getObject = (workerCache: RuntimeUtil.WorkerCache): StateAPI => {
        return {
            useProgress: (total) => {
                const {progress} = workerCache;
                progress.current = 0;
                postMessage(PostUtil.buildPostStateProgressStart(total));
                return {
                    getCurrent: () => progress.current,
                    tick: () => {
                        progress.current ++;
                        postMessage(PostUtil.buildPostStateProgressTick());
                    }
                }
            },
            useMonitor: (allocSize) => {

                postMessage(PostUtil.buildPostStateMonitorInit(allocSize));
                const callbacks: ((str: string) => void)[] =
                    Array.from({ length: allocSize }, (_, i) => {
                        return (str: string) => {
                            postMessage(PostUtil.buildPostStateMonitorSet(i, str));
                        };
                    });
                return callbacks;
            }
        }
    }

    // export const getDeclare = () => {
    //     const apis = [
    //         'useMonitor: (allocSize: number) => ((str: string) => void)[]',
    //         'useProgress: (total: number) => { getCurrent: () => number; tick: () => void; }',
    //     ];
    //     return `{${apis.join(';')};}`;
    // }
};
export default DclState;