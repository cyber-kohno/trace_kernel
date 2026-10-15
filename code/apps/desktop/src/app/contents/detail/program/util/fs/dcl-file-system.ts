import Core from '../../../../../../../../../packages/runtime-core/src/api/fs/dcl-file-system';
import type RuntimeUtil from '../../runtime/runtime-util';
import WorkerInvoke from '../worker-invoke';
namespace DclFileSystem {
  export const getTypeDeclare = Core.getTypeDeclare;
  export const getValueDeclare = Core.getValueDeclare;
  export const getObject = (cache: RuntimeUtil.WorkerCache) =>
    Core.getObject(cache, WorkerInvoke);
}
export default DclFileSystem;
