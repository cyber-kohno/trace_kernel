import Core from '../../../../../../../../packages/runtime-core/src/declarations/context-declarations';
import type RuntimeUtil from '../runtime/runtime-util';
import WorkerInvoke from './worker-invoke';
import type WorkspaceState from '../../../../state/model/workspace/workspace-state';
import type ValidationState from '../../../../state/model/validation-state';
import LicenseState from '../../../../state/model/license-state';
import type { ProcessResult } from '../../../../service/execution/create-io-context';
import { createWorkContext } from '../../../../service/execution/create-work-context';
import {
  selectContextData,
  type ExecutionContextData,
} from '../../../../service/execution/work-execution-plan';
import TypescriptUtil from '../../../../util/typescript-util';
import DclParser from './parser/dcl-parser';

namespace ContextDataUtil {
  export type Props = ExecutionContextData;

  export const getUsableData = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ): Props => selectContextData(workspace, disables, LicenseState.isPro());

  export const createObjects = (
    data: Props,
    preparation: RuntimeUtil.PreparationCache,
    rustCache: RuntimeUtil.RustCache,
  ) => {
    return createWorkContext(data, preparation.datasetMap, {
      readTextFile: (req) => WorkerInvoke.call<string>('read_file', { req }),
      runProcess: (req) =>
        WorkerInvoke.call<ProcessResult>(
          'run_process',
          { executionId: rustCache.executionId, req },
          null,
        ),
      createParserObject: () => DclParser.getObject(rustCache),
      transpileLogic: (source) => TypescriptUtil.transpileTsModuleToCjs(source),
    });
  };

  export const createDeclareDef = Core.createDeclareDef;
  export const getLogicSignature = Core.getLogicSignature;
}
export default ContextDataUtil;
