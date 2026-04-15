namespace PostUtil {
    export const _ = {};

    export interface StateMethodMap {
        progress_start: {
            total: number;
        };
        progress_tick: {};
        monitor_init: {
            allocSize: number;
        };
        monitor_set: {
            index: number;
            str: string;
        };
    }

    export type StateMethod = keyof StateMethodMap;

    export interface PostStateProgressTick {
        type: "state";
        method: 'progress_tick'
    };

    export const buildPostStateProgressStart = (total: number) => ({
        type: "state",
        method: 'progress_start',
        total
    });
    export const buildPostStateProgressTick = () => ({
        type: "state",
        method: 'progress_tick'
    });
    export const buildPostStateMonitorInit = (allocSize: number) => ({
        type: "state",
        method: 'monitor_init',
        allocSize
    });
    export const buildPostStateMonitorSet = (index: number, str: string) => ({
        type: "state",
        method: 'monitor_set',
        index, str
    });
};
export default PostUtil;