import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';
namespace DeclareState {
  export type Props = Core.DeclareDefinition;

  export const getInitial = (): Props => {
    return { source: '' };
  };
}
export default DeclareState;
