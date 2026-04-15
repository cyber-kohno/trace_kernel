import { writable } from "svelte/store";
import StoreWorkspace from "./storeWorkspace";
import StoreInvalidate from "./storeInvalidate";
import type StoreCache from "./storeCache";
import type StoreLicense from "./storeLIcense";
import StoreSetting from "./StoreSetting";
import type { SnapshotLog } from "./dirty";

const store = writable<Store>({
  handlePath: null,
  workspace: null,
  target: null,
  shortcutEvent: null,
  dialog: null,
  cacheMap: [],
  invUnits: [],

  disables: [],

  snapshot: { env: '', resource: '', dataset: '', process: '', declare: '', work: '' },
  license: null,
  setting: StoreSetting.getInitial(),
});

export type Store = {
  handlePath: null | string;
  workspace: null | StoreWorkspace.Props;
  target: StoreWorkspace.Target | null;
  dialog: null | 'program' | 'declare' | 'setting';
  shortcutEvent: ((e: KeyboardEvent) => void) | null;

  cacheMap: StoreCache.Props[];

  disables: StoreWorkspace.Target[];

  /** 再描画関数のユニット */
  invUnits: StoreInvalidate.Props[];

  snapshot: SnapshotLog;
  license: StoreLicense.Props | null;

  setting: StoreSetting.Props;
}

export default store;