import { get } from 'svelte/store';
import appStore from './app-store';

namespace StoreLicense {
  export type Props = {
    displayId: string;
    date: string;
  };
  export const isPro = () => {
    const permission = get(appStore).license;
    return permission != null;
  };
}
export default StoreLicense;
