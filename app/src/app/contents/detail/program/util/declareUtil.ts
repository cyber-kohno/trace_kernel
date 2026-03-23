import DclFileSystem from "./fs/dclFileSystem";
import DclRuntime from "./dclRuntime";
import DclNet from "./dclNet";
import DclState from "./dclState";
import DclChannel from "./channel/dclChannel";
import type StoreWork from "../../../../store/StoreWork";
import StoreLicense from "../../../../store/storeLIcense";
import RuntimeUtil from "../runtime/runtimeUtil";
import DclParser from "./parser/dclParser";
import type StoreWorkspace from "../../../../store/storeWorkspace";

namespace DeclareUtil {

    export type ReserveDef = 'print' | 'println' | 'channel' | 'runtime' | 'fs' | 'net' | 'state' | 'parser';

    export const getUsableReserveList = (props: {
        method: StoreWork.OutputMethod;
    }): ReserveDef[] => {
        const list: ReserveDef[] = [];

        switch (props.method) {
            case 'plain': {
                list.push('print');
                list.push('println');
            } break;
            case 'channel': {
                list.push('channel');
            } break;
        }
        list.push('runtime');
        list.push('state');
        list.push('parser');
        if (StoreLicense.isPro()) {
            list.push('fs');
            list.push('net');
        }
        return list;
    };

    export const createUtilObject = (name: ReserveDef, workerCache: RuntimeUtil.WorkerCache): object => {

        const scheduleFlush = (lines: string[], channelId: string) => {

            const { rust: rustCache } = workerCache;
            // チャンネルのキューを取得
            let queue = rustCache.logQueues.get(channelId);
            // なければ生成
            if (!queue) {
                queue = [];
                rustCache.logQueues.set(channelId, queue);
            }
            queue.push(lines);
            workerCache.scheduleFlush(channelId);
        }

        const createAppendTextCallback = (channelId: string, isLn: boolean) => {
            return (str: string) => {
                const lines = str.split('\n');
                if (isLn) lines.push('');

                scheduleFlush(lines, channelId);
            };
        };

        const createAppendTableCallback = (channelId: string) => {
            return (record: any) => {
                const lines = [JSON.stringify(record), ''];
                scheduleFlush(lines, channelId);
            };
        };

        const { vfs: txCache, rust: rustCache } = workerCache;
        switch (name) {
            case 'print': return createAppendTextCallback(RuntimeUtil.PLAIN_CHANNEL_ID, false);
            case 'println': return createAppendTextCallback(RuntimeUtil.PLAIN_CHANNEL_ID, true);
            case 'channel': return DclChannel.getObject(workerCache, createAppendTextCallback, createAppendTableCallback);
            case 'fs': {
                return DclFileSystem.getObject(workerCache);
            }
            case 'runtime': return DclRuntime.getObject();
            case 'net': return DclNet.getObject();
            case 'state': return DclState.getObject(workerCache);
            case 'parser': return DclParser.getObject(rustCache);
        }
    }

    export const createUtilDeclareDef = (name: ReserveDef): {
        typeDec: string;
        valueDec: string;
    } => {
        switch (name) {
            case 'print':
            case 'println': return {
                typeDec: '',
                valueDec: '(str: string) => void'
            };
            case 'channel': return {
                typeDec: DclChannel.getTypeDeclare(),
                valueDec: DclChannel.getValueDeclare()
            }
            case 'runtime': return {
                typeDec: '',
                valueDec: DclRuntime.getDeclare()
            };
            case 'net': return {
                typeDec: '',
                valueDec: DclNet.getDeclare()
            }
            case 'fs': return {
                typeDec: DclFileSystem.getTypeDeclare(),
                valueDec: DclFileSystem.getValueDeclare()
            }
            case 'state': return {
                typeDec: DclState.getTypeDeclare(),
                valueDec: DclState.getValueDeclare()
            }
            case 'parser': return {
                typeDec: DclParser.getTypeDeclare(),
                valueDec: DclParser.getValueDeclare()
            }
        }
    }
}
export default DeclareUtil;