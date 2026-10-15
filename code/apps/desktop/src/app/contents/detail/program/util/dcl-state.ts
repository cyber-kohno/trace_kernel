import Core from '../../../../../../../../packages/runtime-core/src/api/dcl-state';
import type RuntimeUtil from '../runtime/runtime-util';
namespace DclState {
  export const getTypeDeclare = Core.getTypeDeclare;
  export const getValueDeclare = Core.getValueDeclare;
  export const getObject = (cache: RuntimeUtil.WorkerCache) =>
    Core.getObject(cache, (event) => postMessage(event));
}
export default DclState;
