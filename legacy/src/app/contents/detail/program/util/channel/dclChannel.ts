import RuntimeUtil from "../../runtime/runtimeUtil";
import WorkerAdapter from "../../ui/workerAdapter";
import WorkerInvoke from "../workerInvoke";

namespace DclChannel {

    export type View = 'text' | 'table';
    export type Props = {
        id: string;
        view: View;
        detail: any;
    }

    type ColumnTypeMap = {
        string: string;
        number: number;
    };

    export type ColumnDef = {
        name: string;
        type?: keyof ColumnTypeMap;
        width?: number;
    };

    type RecordFromCols<C extends readonly ColumnDef[]> = {
        [K in C[number]as K["name"]]:
        K["type"] extends keyof ColumnTypeMap
        ? ColumnTypeMap[K["type"]]
        : string;
    };

    type ChannelAPI = {
        createTextStream: (channelId: string) => {
            print: (str: string) => void;
            println: (str: string) => void;
        };
        createTableStream: <
            const C extends readonly ColumnDef[]
        >(
            channelId: string,
            cols: C
        ) => {
            add: (record: RecordFromCols<C>) => void;
        };
    };

    export const getTypeDeclare = () => `
        type ColumnTypeMap = {
            string: string;
            number: number;
        };

        type ColumnDef = {
            name: string;
            type?: keyof ColumnTypeMap;
            width?: number;
        };

        type RecordFromCols<C extends readonly ColumnDef[]> = {
            [K in C[number]as K["name"]]:
            K["type"] extends keyof ColumnTypeMap
            ? ColumnTypeMap[K["type"]]
            : string;
        };

        type ChannelAPI = {
            createTextStream: (channelId: string) => {
                print: (str: string) => void;
                println: (str: string) => void;
            };
            createTableStream: <
                const C extends readonly ColumnDef[]
            >(
                channelId: string,
                cols: C
            ) => {
                add: (record: RecordFromCols<C>) => void;
            };
        };
    `;

    export const getValueDeclare = () => 'ChannelAPI';

    export const getObject = (
        workerCache: RuntimeUtil.WorkerCache,
        createAppendTextCallback: (channelId: string, isLn: boolean) => ((str: string) => void),
        createAppendTableCallback: (channelId: string) => ((record: any) => void)
    ): ChannelAPI => {

        const addChannel = (props: Props) => {
            WorkerAdapter.post({ type: 'create_stream', props });
            WorkerInvoke.call('add_channel', {
                workerId: workerCache.rust.workerId,
                channelId: props.id
            });
        }

        return {
            createTextStream: (channelId) => {
                addChannel({ id: channelId, view: 'text', detail: {} });
                return {
                    print: createAppendTextCallback(channelId, false),
                    println: createAppendTextCallback(channelId, true)
                }
            },
            createTableStream: (channelId, cols) => {
                const seen = new Set<string>();

                for (const col of cols) {
                    if (seen.has(col.name)) {
                        throw new Error(`Column names must be unique. Duplicate found: "${col.name}"`);
                    }
                    seen.add(col.name);
                }
                addChannel({ id: channelId, view: 'table', detail: cols });
                return {
                    add: createAppendTableCallback(channelId)
                }
            }
        };
    }
    // export const getDeclare = () => {

    //     const apis = [
    //         'createStream: (id: string) => {print: (str: string) => void; println: (str: string) => void; }',
    //     ];
    //     return `{${apis.join(';')};}`;
    // };
};
export default DclChannel;