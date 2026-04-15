import type { TextEncoding } from "./types";

namespace StoreProcess {

    export type Props = {
        funcName: string;
        prgPath: string;
        scriptArgs: ScriptArgDef[];
        cmdArgs: string[];
        timeout: number;
        encoding: {
            stdout: TextEncoding;
            stderr: TextEncoding;
        }
    }

    type ScriptArgDef = {
        name: string;
        type: "string" | "number";
    }

    export const getInitial = (): Props => {
        return {
            funcName: '',
            prgPath: '',
            scriptArgs: [],
            cmdArgs: [],
            timeout: 3000,
            encoding: {
                stdout: 'utf8',
                stderr: 'utf8'
            }
        }
    }
}
export default StoreProcess;