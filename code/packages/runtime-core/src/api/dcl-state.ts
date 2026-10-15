import {
  createStateApi,
  type ExecutionStateEvent,
} from "../execution/create-reserved-api";
import type RuntimeUtil from "../execution/runtime-cache";

namespace DclState {
  type StateAPI = {
    useMonitor: (allocSize: number) => ((str: string) => void)[];
    useProgress: (denominator: number) => {
      getCurrent: () => number;
      tick: () => void;
    };
  };
  export const getTypeDeclare = () => `
        type StateAPI = {
            useMonitor: (allocSize: number) => ((str: string) => void)[];
            useProgress: (denominator: number) => { getCurrent: () => number; tick: () => void };
        }
    `;
  export const getValueDeclare = () => `StateAPI`;

  export const getObject = (
    workerCache: RuntimeUtil.WorkerCache,
    notify: (event: ExecutionStateEvent) => void,
  ): StateAPI => {
    return createStateApi(workerCache.progress, notify);
  };

  // export const getDeclare = () => {
  //     const apis = [
  //         'useMonitor: (allocSize: number) => ((str: string) => void)[]',
  //         'useProgress: (total: number) => { getCurrent: () => number; tick: () => void; }',
  //     ];
  //     return `{${apis.join(';')};}`;
  // }
}
export default DclState;
