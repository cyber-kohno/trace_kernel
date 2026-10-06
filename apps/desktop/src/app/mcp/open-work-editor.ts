import { uiStore } from '../state/store';

export const openWorkEditor = () => {
  uiStore.update((state) => ({
    ...state,
    dialog: 'program',
    workEditorId: crypto.randomUUID(),
  }));
};
