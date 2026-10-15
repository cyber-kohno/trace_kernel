import type { ApiWarningState } from '../../gen/api-warning';
import type MigrationFlow from '../../gen/migration-flow';
import type LicenseState from './license-state';
import SettingState from './setting-state';

namespace AppState {
  export type StoreValue = {
    apiWarning: ApiWarningState | null;
    migration: MigrationFlow.State | null;
    license: LicenseState.StoreValue | null;
    setting: SettingState.StoreValue;
  };

  export const getInitial = (): StoreValue => ({
    apiWarning: null,
    migration: null,
    license: null,
    setting: SettingState.getInitial(),
  });
}

export default AppState;
