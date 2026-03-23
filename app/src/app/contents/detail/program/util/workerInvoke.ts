import WorkerAdapter from "../ui/workerAdapter";

namespace WorkerInvoke {

    export const call = <T>(
        command: string,
        args: any,
        timeoutMs = 10_000
    ): Promise<T> => {
        const callsiteStack = new Error().stack;

        return new Promise<T>((resolve, reject) => {
            const id = Math.random().toString(36).substring(2);

            const handler = (e: MessageEvent) => {
                if (
                    e.data.type !== "invoke-error" &&
                    e.data.id !== id
                ) {
                    return;
                }
                if (e.data.type === 'invoke-error') {
                    reject(new Error(e.data.callsiteStack));
                }

                self.removeEventListener("message", handler);
                clearTimeout(timer);

                if ("error" in e.data) {
                    console.error(
                        `[invoke:${command}] failed`,
                        e.data.error,
                        { args }
                    );
                    reject(new Error(e.data.error));
                    return;
                }

                resolve(e.data.result as T);
            };

            const timer = setTimeout(() => {
                self.removeEventListener("message", handler);
                console.error(
                    `[invoke:${command}] timeout`,
                    { args }
                );
                reject(new Error(`invoke timeout: ${command}`));
            }, timeoutMs);

            self.addEventListener("message", handler);
            postMessage({ type: "invoke", command, args, id, callsiteStack });
        });
    };
};
export default WorkerInvoke;