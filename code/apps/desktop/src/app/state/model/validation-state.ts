import type * as Core from '../../../../../../packages/runtime-core/src/model/workspace';
namespace ValidationState {
  export type Category = Core.ValidationCategory;

  export type Target = Core.ValidationTarget;

  export type StoreValue = {
    disables: Target[];
  };

  export const getInitial = (): StoreValue => ({
    disables: [],
  });
}

export default ValidationState;
