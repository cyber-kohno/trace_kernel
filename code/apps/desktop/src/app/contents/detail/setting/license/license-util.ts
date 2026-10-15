import Core from '../../../../../../../../packages/runtime-core/src/license/license-util';
import { Store } from '@tauri-apps/plugin-store';

namespace LicenseUtil {
  export type Payload = Core.Payload;
  export const parseActivateInfoFromProductKey =
    Core.parseActivateInfoFromProductKey;
  export const getConvertedLicenseFromPayload =
    Core.getConvertedLicenseFromPayload;

  export const saveLicense = async (productKey: string) => {
    const store = await Store.load('license.json');
    await store.set('key', productKey);
    await store.save();
  };

  export const loadLicenseOnStartup = async () => {
    const store = await Store.load('license.json');
    try {
      const productKey: string | undefined = await store.get('key');
      if (!productKey) return null;

      return await parseActivateInfoFromProductKey(productKey);
    } catch {
      await store.delete('key');
      await store.save();
      return null;
    }
  };
}
export default LicenseUtil;
