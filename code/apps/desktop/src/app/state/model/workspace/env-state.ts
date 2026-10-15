import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';
namespace EnvState {
  export type Purpose = Core.EnvPurpose;
  export type Props = Core.EnvDefinition;

  export const getInitial = (): Props => ({ varName: '', value: '' });
}
export default EnvState;
