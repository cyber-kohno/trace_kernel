import Core from '../../../../../../../../../packages/runtime-core/src/api/parser/dcl-parser';
import WorkerInvoke from '../worker-invoke';
import type RuntimeUtil from '../../runtime/runtime-util';
namespace DclParser {
  export const getObject = (cache: RuntimeUtil.RustCache) =>
    Core.getObject(cache, WorkerInvoke);
  export const getTypeDeclare = Core.getTypeDeclare;
  export const getValueDeclare = Core.getValueDeclare;
}
export default DclParser;
