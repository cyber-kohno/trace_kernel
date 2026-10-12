import type PostUtil from '../post-util';
import type RuntimeUtil from './runtime-util';
import type DclChannel from '../util/channel/dcl-channel';

namespace WorkerProtocol {
  type StatePayload = {
    [K in PostUtil.StateMethod]: { method: K } & PostUtil.StateMethodMap[K];
  }[PostUtil.StateMethod];

  export type InvokeEvent = {
    type: 'invoke';
    command: string;
    args: any;
    id: string;
    callsiteStack: string;
  };

  export type Event =
    | { type: 'create_stream'; props: DclChannel.Props }
    | { type: 'receive_stream'; channelId: string }
    | { type: 'prepared' }
    | InvokeEvent
    | {
        type: 'runtime-error';
        stack: string;
        sourceMap: string;
        cleanupFailed?: boolean;
      }
    | { type: 'done'; vfs: RuntimeUtil.VFSState | null }
    | { type: 'progress'; cur: number; total?: number }
    | ({ type: 'state' } & StatePayload);
}
export type { WorkerProtocol as default };
