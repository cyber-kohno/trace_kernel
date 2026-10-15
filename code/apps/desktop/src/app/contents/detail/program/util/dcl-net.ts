import Core from '../../../../../../../../packages/runtime-core/src/api/dcl-net';
import WorkerInvoke from './worker-invoke';
import type RuntimeUtil from '../runtime/runtime-util';
namespace DclNet {
  export const getObject = (cache: RuntimeUtil.RustCache) =>
    Core.getObject(cache, WorkerInvoke);
  export const getDeclare = Core.getDeclare;
}
export default DclNet;
