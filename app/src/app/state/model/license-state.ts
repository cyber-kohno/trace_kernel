import { get } from 'svelte/store';
import { appStore } from '../store';

namespace LicenseState {
  export type StoreValue = {
    displayId: string;
    date: string;
  };

  export const isPro = () => {
    const permission = get(appStore).license;
    return permission != null;
  };
}

export default LicenseState;
