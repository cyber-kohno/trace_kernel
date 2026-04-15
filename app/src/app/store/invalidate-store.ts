import { writable } from "svelte/store";
import type StoreInvalidate from "./store-invalidate";

export type InvalidateState = {
  invUnits: StoreInvalidate.Props[];
};

const invalidateStore = writable<InvalidateState>({
  invUnits: [],
});

export default invalidateStore;
