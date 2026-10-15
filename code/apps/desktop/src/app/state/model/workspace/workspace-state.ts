import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';
import { createMinimalWorkspace } from '../../../gen/workspace-fixture.js';

namespace WorkspaceState {
  export type Gen = Core.WorkspaceGeneration;

  export type Props = Core.Workspace;

  export type SnapshotLog = {
    gen: string;
    env: string;
    resource: string;
    dataset: string;
    process: string;
    logic: string;
    declare: string;
    work: string;
  };

  export type StoreValue = {
    handlePath: null | string;
    workspace: null | Props;
    snapshot: SnapshotLog;
  };

  export const createInitialSnapshot = (): SnapshotLog => ({
    gen: '',
    env: '',
    resource: '',
    dataset: '',
    process: '',
    logic: '',
    declare: '',
    work: '',
  });

  export const createInitialState = (): StoreValue => ({
    handlePath: null,
    workspace: null,
    snapshot: createInitialSnapshot(),
  });

  export const getInitial = (): Props => {
    return createMinimalWorkspace();
  };

  export const getWorkspace = (state: StoreValue) => {
    const project = state.workspace;
    if (project == null) throw new Error();
    return project;
  };
}

export default WorkspaceState;
