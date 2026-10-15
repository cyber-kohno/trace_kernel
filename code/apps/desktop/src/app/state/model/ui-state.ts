import type ValidationState from './validation-state';

namespace UiState {
  export type Dialog =
    | null
    | 'program'
    | 'work-proposal'
    | 'logic'
    | 'declare'
    | 'setting';

  export type StoreValue = {
    target: ValidationState.Target | null;
    shortcutEvent: ((e: KeyboardEvent) => void) | null;
    dialog: Dialog;
    workEditorId: string | null;
  };

  export const getInitial = (): StoreValue => ({
    target: null,
    shortcutEvent: null,
    dialog: null,
    workEditorId: null,
  });

  export const getTarget = (state: StoreValue) => {
    const target = state.target;
    if (target == null) throw new Error();
    return target;
  };
}

export default UiState;
