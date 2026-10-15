import Core from '../../../../../../../../packages/runtime-core/src/declarations/api-declarations';
import DclFileSystem from './fs/dcl-file-system';
import DclRuntime from './dcl-runtime';
import DclNet from './dcl-net';
import DclState from './dcl-state';
import DclChannel from './channel/dcl-channel';
import type WorkState from '../../../../state/model/workspace/work-state';
import LicenseState from '../../../../state/model/license-state';
import { createReservedApi } from '../../../../service/execution/create-reserved-api';
import {
  selectReservedApis,
  type ReservedApi,
} from '../../../../service/execution/work-execution-plan';
import RuntimeUtil from '../runtime/runtime-util';
import DclParser from './parser/dcl-parser';
import type WorkspaceState from '../../../../state/model/workspace/workspace-state';

namespace DeclareUtil {
  export type ReserveDef = ReservedApi;

  export const getUsableReserveList = (props: {
    method: WorkState.OutputMethod;
  }): ReserveDef[] => selectReservedApis(props.method, LicenseState.isPro());

  export const createUtilObject = (
    name: ReserveDef,
    workerCache: RuntimeUtil.WorkerCache,
  ): object => {
    return createReservedApi(name, {
      plainChannelId: RuntimeUtil.PLAIN_CHANNEL_ID,
      appendLines: (channelId, lines) => {
        let queue = workerCache.rust.logQueues.get(channelId);
        if (!queue) {
          queue = [];
          workerCache.rust.logQueues.set(channelId, queue);
        }
        queue.push(lines);
        workerCache.scheduleFlush(channelId);
      },
      registerChannel: (definition) =>
        DclChannel.registerChannel(workerCache, definition),
      createFileSystem: () => DclFileSystem.getObject(workerCache),
      createRuntime: () => DclRuntime.getObject(),
      createNetwork: () => DclNet.getObject(workerCache.rust),
      createState: () => DclState.getObject(workerCache),
      createParser: () => DclParser.getObject(workerCache.rust),
    });
  };

  export const createUtilDeclareDef = Core.createUtilDeclareDef;
}
export default DeclareUtil;
