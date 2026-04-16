import { writable } from 'svelte/store';
import type StoreWorkspace from './store-workspace';

const uiStore = writable<UiState>({
  target: null,
  shortcutEvent: null,
  dialog: null,
});

export type UiDialog = null | 'program' | 'declare' | 'setting';

export type UiState = {
  target: StoreWorkspace.Target | null;
  shortcutEvent: ((e: KeyboardEvent) => void) | null;
  dialog: UiDialog;
};

export default uiStore;
