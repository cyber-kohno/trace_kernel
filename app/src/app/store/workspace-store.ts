import { writable } from 'svelte/store';
import type StoreWorkspace from './store-workspace';

export type SnapshotLog = {
  env: string;
  resource: string;
  dataset: string;
  process: string;
  logic: string;
  declare: string;
  work: string;
};

export type WorkspaceState = {
  handlePath: null | string;
  workspace: null | StoreWorkspace.Props;
  snapshot: SnapshotLog;
};

export const createInitialSnapshot = (): SnapshotLog => ({
  env: '',
  resource: '',
  dataset: '',
  process: '',
  logic: '',
  declare: '',
  work: '',
});

const workspaceStore = writable<WorkspaceState>({
  handlePath: null,
  workspace: null,
  snapshot: createInitialSnapshot(),
});

export default workspaceStore;
