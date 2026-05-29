import { get } from 'svelte/store';
import type StoreDataset from './store-dataset';
import type StoreDeclare from './store-declare';
import type StoreEnv from './store-env';
import type StoreLogic from './store-logic';
import type StoreProcess from './store-process';
import type StoreResource from './store-resource';
import uiStore from './ui-store';
import type StoreWork from './store-work';
import * as WorkspaceValidation from './workspace-validation';
import type { WorkspaceState } from './workspace-store';
import { createMinimalWorkspace } from '../workspace/workspace-fixture.js';

namespace StoreWorkspace {
  export type Props = {
    version: string;
    envs: StoreEnv.Props[];
    resources: StoreResource.Props[];
    datasets: StoreDataset.Props[];
    processes: StoreProcess.Props[];
    logics: StoreLogic.Props[];
    declare: StoreDeclare.Props;
    works: StoreWork.Props[];
  };

  export const getInitial = (): Props => {
    return createMinimalWorkspace();
  };

  export const getWorkspace = (state: WorkspaceState) => {
    const project = state.workspace;
    if (project == null) throw new Error();
    return project;
  };

  export const getTarget = (_store?: unknown) => {
    const target = get(uiStore).target;
    if (target == null) throw new Error();
    return target;
  };

  export type Category =
    | 'env'
    | 'resource'
    | 'dataset'
    | 'process'
    | 'logic'
    | 'work';

  export type Target = {
    cat: Category;
    index: number;
  };

  export const validate = (target: Target) =>
    WorkspaceValidation.validate(target);

  export const hasDisable = (target: Target) =>
    WorkspaceValidation.hasDisable(target);

  export const validateAll = () => WorkspaceValidation.validateAll();
}

export default StoreWorkspace;
