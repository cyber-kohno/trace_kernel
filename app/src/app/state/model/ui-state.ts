import type ValidationState from './validation-state';

namespace UiState {
  export type Dialog = null | 'program' | 'logic' | 'declare' | 'setting';

  export type StoreValue = {
    target: ValidationState.Target | null;
    shortcutEvent: ((e: KeyboardEvent) => void) | null;
    dialog: Dialog;
  };

  export const getInitial = (): StoreValue => ({
    target: null,
    shortcutEvent: null,
    dialog: null,
  });

  export const getTarget = (state: StoreValue) => {
    const target = state.target;
    if (target == null) throw new Error();
    return target;
  };
}

export default UiState;
