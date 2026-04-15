import { writable } from "svelte/store";
import type StoreCache from "./store-cache";

export type CacheState = {
  cacheMap: StoreCache.Props[];
};

const cacheStore = writable<CacheState>({
  cacheMap: [],
});

export default cacheStore;
