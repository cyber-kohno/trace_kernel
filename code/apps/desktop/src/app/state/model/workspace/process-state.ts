import type * as Core from '../../../../../../../packages/runtime-core/src/model/workspace';

namespace ProcessState {
  export type Props = Core.ProcessDefinition;

  export const getInitial = (): Props => {
    return {
      funcName: '',
      prgPath: '',
      scriptArgs: [],
      cmdArgs: [],
      cwd: '',
      stdin: '',
      timeout: 3000,
      encoding: {
        stdin: 'utf8',
        stdout: 'utf8',
        stderr: 'utf8',
      },
    };
  };
}
export default ProcessState;
