import { createMinimalWorkspace } from '../../../gen/workspace-fixture.js';
import type DatasetState from './dataset-state';
import type DeclareState from './declare-state';
import type EnvState from './env-state';
import type LogicState from './logic-state';
import type ProcessState from './process-state';
import type ResourceState from './resource-state';
import type WorkState from './work-state';

namespace WorkspaceState {
  export type Gen = {
    workspace: string;
    api: string;
  };

  export type Props = {
    gen: Gen;
    envs: EnvState.Props[];
    resources: ResourceState.Props[];
    datasets: DatasetState.Props[];
    processes: ProcessState.Props[];
    logics: LogicState.Props[];
    declare: DeclareState.Props;
    works: WorkState.Props[];
  };

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
