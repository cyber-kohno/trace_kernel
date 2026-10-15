import NativeIoPolicy from '../runtime/native-io-policy';

namespace WorkerInvoke {
  export const call = <T>(
    command: string,
    args: any,
    timeoutMs: number | null = NativeIoPolicy.isOwnedCommand(command)
      ? null
      : 10_000,
  ): Promise<T> => {
    const callsiteStack = new Error().stack;

    return new Promise<T>((resolve, reject) => {
      const id = Math.random().toString(36).substring(2);
      const cleanup = () => {
        self.removeEventListener('message', handler);
        clearTimeout(timer);
      };

      const handler = (e: MessageEvent) => {
        if (
          e.data.id !== id ||
          !['invoke-result', 'invoke-error'].includes(e.data.type)
        ) {
          return;
        }
        if (e.data.type === 'invoke-error') {
          reject(new Error(e.data.callsiteStack));
          cleanup();
          return;
        }

        cleanup();

        if ('error' in e.data) {
          console.error(`[invoke:${command}] failed`, e.data.error, { args });
          reject(new Error(e.data.error));
          return;
        }

        resolve(e.data.result as T);
      };

      const timer =
        timeoutMs == null
          ? undefined
          : setTimeout(() => {
              cleanup();
              console.error(`[invoke:${command}] timeout`, { args });
              reject(new Error(`invoke timeout: ${command}`));
            }, timeoutMs);

      self.addEventListener('message', handler);
      try {
        postMessage({ type: 'invoke', command, args, id, callsiteStack });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  };
}
export default WorkerInvoke;
