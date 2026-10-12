import type WorkerProtocol from './worker-protocol';

const post = (event: WorkerProtocol.Event) => postMessage(event);
export default post;
