import Core from '../../../../../../../../../packages/runtime-core/src/api/dcl-channel';
import type RuntimeUtil from '../../runtime/runtime-util';
import post from '../../runtime/worker-post';
import WorkerInvoke from '../worker-invoke';
namespace DclChannel {
  export type View = Core.View;
  export type Props = Core.Props;
  export type ColumnDef = Core.ColumnDef;
  export const getTypeDeclare = Core.getTypeDeclare;
  export const getValueDeclare = Core.getValueDeclare;
  const notify = (props: Props) => post({ type: 'create_stream', props });
  export const registerChannel = (
    cache: RuntimeUtil.WorkerCache,
    props: Props,
  ) => Core.registerChannel(cache, props, WorkerInvoke, notify);
  export const getObject = (
    cache: RuntimeUtil.WorkerCache,
    text: Parameters<typeof Core.getObject>[1],
    table: Parameters<typeof Core.getObject>[2],
  ) => Core.getObject(cache, text, table, WorkerInvoke, notify);
}
export default DclChannel;
