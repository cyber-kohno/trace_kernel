import { toastStore } from '../state/store';
import type ToastState from '../state/model/toast-state';

namespace ToastService {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  export const show = (toast: ToastState.StoreValue) => {
    if (timerId != null) {
      clearTimeout(timerId);
    }

    toastStore.set(toast);
    timerId = setTimeout(() => {
      toastStore.set(null);
      timerId = null;
    }, toast.sustainMs ?? 1000);
  };
}

export default ToastService;
