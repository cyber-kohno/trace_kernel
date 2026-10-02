import type TauriDto from '../../../infra/tauri/tauri-dto';

namespace ProcessState {
  export type Props = {
    funcName: string;
    prgPath: string;
    scriptArgs: ScriptArgDef[];
    cmdArgs: string[];
    cwd: string;
    stdin: string;
    timeout: number;
    encoding: {
      stdin: TauriDto.TextEncoding;
      stdout: TauriDto.TextEncoding;
      stderr: TauriDto.TextEncoding;
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
export default ProcessState;
