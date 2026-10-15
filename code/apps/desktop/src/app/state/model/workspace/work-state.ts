import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';
namespace WorkState {
  export type Props = Core.WorkDefinition;

  export type OutputMethod = Core.OutputMethod;

  export const getInitial = (name: string): Props => {
    return {
      name,
      method: 'plain',
      source: '',
      origin: 'user',
    };
  };
}
export default WorkState;
