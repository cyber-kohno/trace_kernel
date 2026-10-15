import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';
namespace LogicState {
  const INITIAL_SOURCE = `export default function () {
}`;

  export type Props = Core.LogicDefinition;

  export const getInitial = (): Props => {
    return {
      name: '',
      source: INITIAL_SOURCE,
    };
  };
}
export default LogicState;
