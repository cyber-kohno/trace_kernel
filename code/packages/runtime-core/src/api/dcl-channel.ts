import RuntimeUtil from "../execution/runtime-cache";
import type { NativeCall } from "./native-call";
import { createChannelApi } from "../execution/create-reserved-api";

namespace DclChannel {
  export type View = "text" | "table";
  export type Props = {
    id: string;
    view: View;
    detail: any;
  };

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
    [K in C[number] as K["name"]]: K["type"] extends keyof ColumnTypeMap
      ? ColumnTypeMap[K["type"]]
      : string;
  };

  type ChannelAPI = {
    createTextStream: (channelId: string) => {
      print: (str: string) => void;
      println: (str: string) => void;
    };
    createTableStream: <const C extends readonly ColumnDef[]>(
      channelId: string,
      cols: C,
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

  export const getValueDeclare = () => "ChannelAPI";

  export const registerChannel = (
    workerCache: RuntimeUtil.WorkerCache,
    props: Props,
    native: NativeCall,
    notify: (props: Props) => void,
  ) => {
    if (workerCache.rust.channelReady?.has(props.id)) {
      throw new Error(`A stream with ID "${props.id}" already exists.`);
    }
    notify(props);
    const ready = Promise.resolve(
      native.call<void>("add_channel", {
        executionId: workerCache.rust.executionId,
        channelId: props.id,
      }),
    );
    workerCache.rust.channelReady ??= new Map();
    workerCache.rust.channelReady.set(props.id, ready);
    // The output barrier observes failures even if no lines were printed.
    void ready.catch(() => {});
  };

  export const getObject = (
    workerCache: RuntimeUtil.WorkerCache,
    createAppendTextCallback: (
      channelId: string,
      isLn: boolean,
    ) => (str: string) => void,
    createAppendTableCallback: (channelId: string) => (record: any) => void,
    native: NativeCall,
    notify: (props: Props) => void,
  ): ChannelAPI =>
    createChannelApi(
      (props) => registerChannel(workerCache, props, native, notify),
      createAppendTextCallback,
      createAppendTableCallback,
    );
  // export const getDeclare = () => {

  //     const apis = [
  //         'createStream: (id: string) => {print: (str: string) => void; println: (str: string) => void; }',
  //     ];
  //     return `{${apis.join(';')};}`;
  // };
}
export default DclChannel;
