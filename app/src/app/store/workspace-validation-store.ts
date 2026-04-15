import { writable } from "svelte/store";
import type StoreWorkspace from "./store-workspace";

export type WorkspaceValidationState = {
  disables: StoreWorkspace.Target[];
};

const workspaceValidationStore = writable<WorkspaceValidationState>({
  disables: [],
});

export default workspaceValidationStore;
