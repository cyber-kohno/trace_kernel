import { get } from 'svelte/store';
import type ValidationState from '../state/model/validation-state';
import { validationStore, workspaceStore } from '../state/store';
import validateWorkspace, {
  validateWorkspaceCategory,
} from './workspace/validate-workspace';

namespace ValidationService {
  export const validate = (target: ValidationState.Target) => {
    const { workspace } = get(workspaceStore);
    if (workspace == null) return;
    const categoryDisables = validateWorkspaceCategory(workspace, target.cat);
    validationStore.update((state) => ({
      ...state,
      disables: [
        ...state.disables.filter((item) => item.cat !== target.cat),
        ...categoryDisables,
      ],
    }));
  };

  export const hasDisable = (target: ValidationState.Target) =>
    get(validationStore).disables.some(
      (item) => item.cat === target.cat && item.index === target.index,
    );

  export const validateAll = () => {
    const { workspace } = get(workspaceStore);
    if (workspace == null) throw new Error();
    validationStore.set({ disables: validateWorkspace(workspace) });
  };
}

export default ValidationService;
