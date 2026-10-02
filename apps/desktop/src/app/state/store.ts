import { writable } from 'svelte/store';
import AppState from './model/app-state';
import CacheState from './model/cache-state';
import InvalidateState from './model/invalidate-state';
import type ToastState from './model/toast-state';
import UiState from './model/ui-state';
import ValidationState from './model/validation-state';
import WorkspaceState from './model/workspace/workspace-state';

export const appStore = writable(AppState.getInitial());
export const cacheStore = writable(CacheState.getInitial());
export const dirtyStore = writable(false);
export const invalidateStore = writable(InvalidateState.getInitial());
export const toastStore = writable<ToastState.StoreValue | null>(null);
export const uiStore = writable(UiState.getInitial());
export const validationStore = writable(ValidationState.getInitial());
export const workspaceStore = writable(WorkspaceState.createInitialState());
