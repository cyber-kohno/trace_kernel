import RuntimeUtil from '../../runtime/runtime-util';
import post from '../../runtime/worker-post';
import WorkerInvoke from '../worker-invoke';

namespace DclChannel {
  export type View = 'text' | 'table';
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
    [K in C[number] as K['name']]: K['type'] extends keyof ColumnTypeMap
      ? ColumnTypeMap[K['type']]
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

  export const getValueDeclare = () => 'ChannelAPI';

  export const getObject = (
    workerCache: RuntimeUtil.WorkerCache,
    createAppendTextCallback: (
      channelId: string,
      isLn: boolean,
    ) => (str: string) => void,
    createAppendTableCallback: (channelId: string) => (record: any) => void,
  ): ChannelAPI => {
    const addChannel = (props: Props) => {
      if (workerCache.rust.channelReady?.has(props.id)) {
        throw new Error(`A stream with ID "${props.id}" already exists.`);
      }
      post({ type: 'create_stream', props });
      const ready = Promise.resolve(
        WorkerInvoke.call<void>('add_channel', {
          executionId: workerCache.rust.executionId,
          channelId: props.id,
        }),
      );
      workerCache.rust.channelReady ??= new Map();
      workerCache.rust.channelReady.set(props.id, ready);
      // The output barrier observes failures even if no lines were printed.
      void ready.catch(() => {});
    };

    return {
      createTextStream: (channelId) => {
        addChannel({ id: channelId, view: 'text', detail: {} });
        return {
          print: createAppendTextCallback(channelId, false),
          println: createAppendTextCallback(channelId, true),
        };
      },
      createTableStream: (channelId, cols) => {
        const seen = new Set<string>();

        for (const col of cols) {
          if (seen.has(col.name)) {
            throw new Error(
              `Column names must be unique. Duplicate found: "${col.name}"`,
            );
          }
          seen.add(col.name);
        }
        addChannel({ id: channelId, view: 'table', detail: cols });
        return {
          add: createAppendTableCallback(channelId),
        };
      },
    };
  };
  // export const getDeclare = () => {

  //     const apis = [
  //         'createStream: (id: string) => {print: (str: string) => void; println: (str: string) => void; }',
  //     ];
  //     return `{${apis.join(';')};}`;
  // };
}
export default DclChannel;
