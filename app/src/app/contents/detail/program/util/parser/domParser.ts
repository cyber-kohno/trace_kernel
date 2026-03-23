import RuntimeUtil from "../../runtime/runtimeUtil";
import WorkerInvoke from "../workerInvoke";

namespace DomParser {

    export type DomController = {
        // query(xpath: string): Controller;
        // text(): string;
        // attr(name: string): string | null;
        // children(): Controller[];
        debug(): Promise<{
            domId: number;
            nodeCount: number;
        }>;
        dispose(): Promise<void>;
    };

    export type Node = {
        /** ノード名（Element のみ） */
        name(): string | null;

        /** テキスト内容（Text ノード含む） */
        text(): string;

        /** 属性取得 */
        attr(name: string): string | null;

        /** 子要素 */
        children(): Node[];

        /** 親要素 */
        parent(): Node | null;
    };

    export const parse = async (rustCache: RuntimeUtil.RustCache, source: string): Promise<DomController> => {
        const domId = await WorkerInvoke.call<number>("dom_parse", {
            workerId: rustCache.workerId,
            source,
        });
        console.log(domId);

        return {
            async debug() {
                const [id, nodeCount] = await WorkerInvoke.call<[number, number]>(
                    "dom_info",
                    {
                        workerId: rustCache.workerId,
                        domId,
                    }
                );

                return { domId: id, nodeCount };
            },
            async dispose() {
                await WorkerInvoke.call<void>("dom_dispose", {
                    workerId: rustCache.workerId,
                    domId,
                });
            },
        };
    };
}

export default DomParser;
