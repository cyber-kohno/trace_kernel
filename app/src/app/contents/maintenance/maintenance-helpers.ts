import StoreWorkspace from '../../store/store-workspace';
import workspaceStore from '../../store/workspace-store';

export const getTargetEntry = <T>(
  target: StoreWorkspace.Target | null,
  category: StoreWorkspace.Category,
  items: T[],
) => {
  if (target != null && target.cat === category) {
    return items[target.index];
  }

  throw new Error();
};

export const commitWorkspace = (
  workspace: StoreWorkspace.Props,
  options?: {
    validate?: boolean;
  },
) => {
  workspaceStore.update((state) => ({
    ...state,
    workspace: { ...workspace },
  }));

  if (options?.validate ?? true) {
    StoreWorkspace.validate(StoreWorkspace.getTarget());
  }
};
