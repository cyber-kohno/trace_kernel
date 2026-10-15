import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';
namespace ResourceState {
  export type ParseMethod = Core.ResourceParseMethod;
  export type Encoding = Core.TextEncoding;
  export type Props = Core.ResourceDefinition;

  export const getInitial = (varName: string): Props => {
    return {
      varName,
      source: '',
    };
  };
}
export default ResourceState;
