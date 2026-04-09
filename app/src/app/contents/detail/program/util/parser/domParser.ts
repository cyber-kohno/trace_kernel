import type RuntimeUtil from "../../runtime/runtimeUtil";
import WorkerInvoke from "../workerInvoke";

namespace DomParser {
    type DomContext = {
        workerId: string;
        domId: number;
    };

    export type Node = {
        name(): Promise<string | null>;
        text(): Promise<string>;
        attr(name: string): Promise<string | null>;
        children(): Promise<Node[]>;
        parent(): Promise<Node | null>;
        query(xpath: string): Promise<Node[]>;
    };

    export type DomController = {
        root(): Promise<Node | null>;
        query(xpath: string): Promise<Node[]>;
        debug(): Promise<{
            domId: number;
            nodeCount: number;
        }>;
        dispose(): Promise<void>;
    };

    const createNode = (ctx: DomContext, nodeId: number): Node => {
        return {
            name() {
                return WorkerInvoke.call<string | null>("dom_node_name", {
                    workerId: ctx.workerId,
                    domId: ctx.domId,
                    nodeId,
                });
            },
            text() {
                return WorkerInvoke.call<string>("dom_node_text", {
                    workerId: ctx.workerId,
                    domId: ctx.domId,
                    nodeId,
                });
            },
            attr(name: string) {
                return WorkerInvoke.call<string | null>("dom_node_attr", {
                    workerId: ctx.workerId,
                    domId: ctx.domId,
                    nodeId,
                    name,
                });
            },
            async children() {
                const childIds = await WorkerInvoke.call<number[]>("dom_node_children", {
                    workerId: ctx.workerId,
                    domId: ctx.domId,
                    nodeId,
                });
                return childIds.map(id => createNode(ctx, id));
            },
            async parent() {
                const parentId = await WorkerInvoke.call<number | null>("dom_node_parent", {
                    workerId: ctx.workerId,
                    domId: ctx.domId,
                    nodeId,
                });
                return parentId == null ? null : createNode(ctx, parentId);
            },
            async query(xpath: string) {
                const nodeIds = await WorkerInvoke.call<number[]>("dom_query_from_node", {
                    workerId: ctx.workerId,
                    domId: ctx.domId,
                    nodeId,
                    xpath,
                });
                return nodeIds.map(id => createNode(ctx, id));
            },
        };
    };

    export const parse = async (
        rustCache: RuntimeUtil.RustCache,
        source: string
    ): Promise<DomController> => {
        const workerId = rustCache.workerId;
        const domId = await WorkerInvoke.call<number>("dom_parse", {
            workerId,
            source,
        });
        const ctx: DomContext = { workerId, domId };

        return {
            async root() {
                const rootId = await WorkerInvoke.call<number | null>("dom_root", {
                    workerId,
                    domId,
                });
                return rootId == null ? null : createNode(ctx, rootId);
            },
            async query(xpath: string) {
                const nodeIds = await WorkerInvoke.call<number[]>("dom_query", {
                    workerId,
                    domId,
                    xpath,
                });
                return nodeIds.map(id => createNode(ctx, id));
            },
            async debug() {
                const [id, nodeCount] = await WorkerInvoke.call<[number, number]>(
                    "dom_info",
                    {
                        workerId,
                        domId,
                    }
                );

                return { domId: id, nodeCount };
            },
            async dispose() {
                await WorkerInvoke.call<void>("dom_dispose", {
                    workerId,
                    domId,
                });
            },
        };
    };
}

export default DomParser;
