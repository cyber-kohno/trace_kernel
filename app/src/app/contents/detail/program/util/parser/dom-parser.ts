import type RuntimeUtil from '../../runtime/runtime-util';
import WorkerInvoke from '../worker-invoke';

namespace DomParser {
  type DomContext = {
    executionId: string;
    domId: number;
  };

  export type DomNode = {
    name(): Promise<string | null>;
    text(): Promise<string>;
    attr(name: string): Promise<string | null>;
    children(): Promise<DomNode[]>;
    parent(): Promise<DomNode | null>;
    query(xpath: string): Promise<DomNode[]>;
  };

  export type DomController = {
    root(): Promise<DomNode | null>;
    query(xpath: string): Promise<DomNode[]>;
    debug(): Promise<{
      domId: number;
      nodeCount: number;
    }>;
    dispose(): Promise<void>;
  };

  const createNode = (ctx: DomContext, nodeId: number): DomNode => {
    return {
      name() {
        return WorkerInvoke.call<string | null>('dom_node_name', {
          executionId: ctx.executionId,
          domId: ctx.domId,
          nodeId,
        });
      },
      text() {
        return WorkerInvoke.call<string>('dom_node_text', {
          executionId: ctx.executionId,
          domId: ctx.domId,
          nodeId,
        });
      },
      attr(name: string) {
        return WorkerInvoke.call<string | null>('dom_node_attr', {
          executionId: ctx.executionId,
          domId: ctx.domId,
          nodeId,
          name,
        });
      },
      async children() {
        const childIds = await WorkerInvoke.call<number[]>(
          'dom_node_children',
          {
            executionId: ctx.executionId,
            domId: ctx.domId,
            nodeId,
          },
        );
        return childIds.map((id) => createNode(ctx, id));
      },
      async parent() {
        const parentId = await WorkerInvoke.call<number | null>(
          'dom_node_parent',
          {
            executionId: ctx.executionId,
            domId: ctx.domId,
            nodeId,
          },
        );
        return parentId == null ? null : createNode(ctx, parentId);
      },
      async query(xpath: string) {
        const nodeIds = await WorkerInvoke.call<number[]>(
          'dom_query_from_node',
          {
            executionId: ctx.executionId,
            domId: ctx.domId,
            nodeId,
            xpath,
          },
        );
        return nodeIds.map((id) => createNode(ctx, id));
      },
    };
  };

  export const parse = async (
    rustCache: RuntimeUtil.RustCache,
    source: string,
  ): Promise<DomController> => {
    const executionId = rustCache.executionId;
    const domId = await WorkerInvoke.call<number>('dom_parse', {
      executionId,
      source,
    });
    const ctx: DomContext = { executionId, domId };

    return {
      async root() {
        const rootId = await WorkerInvoke.call<number | null>('dom_root', {
          executionId,
          domId,
        });
        return rootId == null ? null : createNode(ctx, rootId);
      },
      async query(xpath: string) {
        const nodeIds = await WorkerInvoke.call<number[]>('dom_query', {
          executionId,
          domId,
          xpath,
        });
        return nodeIds.map((id) => createNode(ctx, id));
      },
      async debug() {
        const [id, nodeCount] = await WorkerInvoke.call<[number, number]>(
          'dom_info',
          {
            executionId,
            domId,
          },
        );

        return { domId: id, nodeCount };
      },
      async dispose() {
        await WorkerInvoke.call<void>('dom_dispose', {
          executionId,
          domId,
        });
      },
    };
  };

  export const parseHtml = async (
    rustCache: RuntimeUtil.RustCache,
    source: string,
  ): Promise<DomController> => {
    const executionId = rustCache.executionId;
    const domId = await WorkerInvoke.call<number>('dom_parse_html', {
      executionId,
      source,
    });
    const ctx: DomContext = { executionId, domId };

    return {
      async root() {
        const rootId = await WorkerInvoke.call<number | null>('dom_root', {
          executionId,
          domId,
        });
        return rootId == null ? null : createNode(ctx, rootId);
      },
      async query(xpath: string) {
        const nodeIds = await WorkerInvoke.call<number[]>('dom_query', {
          executionId,
          domId,
          xpath,
        });
        return nodeIds.map((id) => createNode(ctx, id));
      },
      async debug() {
        const [id, nodeCount] = await WorkerInvoke.call<[number, number]>(
          'dom_info',
          {
            executionId,
            domId,
          },
        );

        return { domId: id, nodeCount };
      },
      async dispose() {
        await WorkerInvoke.call<void>('dom_dispose', {
          executionId,
          domId,
        });
      },
    };
  };
}

export default DomParser;
