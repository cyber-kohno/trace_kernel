import Core from '../../../../../../../../../packages/runtime-core/src/api/parser/dom-parser';
import WorkerInvoke from '../worker-invoke';
import type RuntimeUtil from '../../runtime/runtime-util';
namespace DomParser {
  export type DomNode = Core.DomNode;
  export type DomController = Core.DomController;
  export const parse = (cache: RuntimeUtil.RustCache, source: string) =>
    Core.parse(cache, source, WorkerInvoke);
  export const parseHtml = (cache: RuntimeUtil.RustCache, source: string) =>
    Core.parseHtml(cache, source, WorkerInvoke);
}
export default DomParser;
