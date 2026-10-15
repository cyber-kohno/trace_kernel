import { get } from 'svelte/store';
import WorkspaceState from '../../state/model/workspace/workspace-state';
import UiState from '../../state/model/ui-state';
import type ValidationState from '../../state/model/validation-state';
import ValidationService from '../../service/validation-service';
import { uiStore, workspaceStore } from '../../state/store';

export const getTargetEntry = <T>(
  target: ValidationState.Target | null,
  category: ValidationState.Category,
  items: T[],
) => {
  if (target != null && target.cat === category) {
    return items[target.index];
  }

  throw new Error();
};

export const commitWorkspace = (
  workspace: WorkspaceState.Props,
  options?: {
    validate?: boolean;
  },
) => {
  workspaceStore.update((state) => ({
    ...state,
    workspace: { ...workspace },
  }));

  if (options?.validate ?? true) {
    ValidationService.validate(UiState.getTarget(get(uiStore)));
  }
};
