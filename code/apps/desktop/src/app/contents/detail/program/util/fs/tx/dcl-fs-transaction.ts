import Core from '../../../../../../../../../../packages/runtime-core/src/api/fs/tx/dcl-fs-transaction';
import type RuntimeUtil from '../../../runtime/runtime-util';
import RealFSWriter from '../real-fs-writer';
namespace DclFSTransaction {
  export type TransactionAPI = Core.TransactionAPI;
  export const getObject = (vfs: RuntimeUtil.VFSState) =>
    Core.getObject(vfs, RealFSWriter);
}
export default DclFSTransaction;
