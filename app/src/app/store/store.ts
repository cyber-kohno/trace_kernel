import { writable } from "svelte/store";
import StoreWorkspace from "./storeWorkspace";
import StoreInvalidate from "./storeInvalidate";
import type StoreCache from "./storeCache";
import FileUtil from "../util/data/fileUtil";
import type StoreLicense from "./storeLIcense";
import StoreSetting from "./StoreSetting";

const store = writable<Store>({
  handlePath: null,
  workspace: null,
  target: null,
  shortcutEvent: null,
  dialog: null,
  cacheMap: [],
  invUnits: [],

  disables: [],

  snapshot: '',
  license: null,
  setting: StoreSetting.getInitial(),
});

export const dirty = writable(true);

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

  snapshot: string;
  license: StoreLicense.Props | null;

  setting: StoreSetting.Props;
}

export async function getSnapshot(project: StoreWorkspace.Props) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(project))
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// let lastProjectRef: StoreProject.Props | null = null;
store.subscribe(async (s) => {
  if (!s.workspace) return;

  //   // project が同一参照なら無視
  //   if (s.project === lastProjectRef) return;
  //   lastProjectRef = s.project;

  const hash = await getSnapshot(s.workspace);

  dirty.update(prev => {
    const nextDirty = s.snapshot !== hash;
    if (prev === nextDirty) return prev;
    return nextDirty;
  });

  FileUtil.updateAppTitle();
});

export default store;