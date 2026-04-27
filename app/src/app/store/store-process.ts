import type { TextEncoding } from './types';

namespace StoreProcess {
  export type Props = {
    funcName: string;
    prgPath: string;
    scriptArgs: ScriptArgDef[];
    cmdArgs: string[];
    cwd: string;
    stdin: string;
    timeout: number;
    encoding: {
      stdin: TextEncoding;
      stdout: TextEncoding;
      stderr: TextEncoding;
    };
  };

  type ScriptArgDef = {
    name: string;
    type: 'string' | 'number';
  };

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
export default StoreProcess;
