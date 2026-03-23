import { invoke } from "@tauri-apps/api/core";
import type { FileStat } from "../../store/types";
import WorkerInvoke from "../../contents/detail/program/util/workerInvoke";

namespace FsApi {

    export const readBinary = async (filePath: string) => {
        const raw = await WorkerInvoke.call<number[]>("read_binary", { filePath });
        return new Uint8Array(raw);
    }

    export const readText = (path: string,)=>{
        
    }
}
export default FsApi;