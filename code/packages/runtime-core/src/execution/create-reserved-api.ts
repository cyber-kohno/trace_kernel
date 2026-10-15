import type { ReservedApi } from "./work-execution-plan";

export type ChannelDefinition = {
  id: string;
  view: "text" | "table";
  detail: any;
};
export type ColumnDefinition = {
  name: string;
  type?: "string" | "number";
  width?: number;
};
type ColumnTypes = { string: string; number: number };
type RecordFromColumns<C extends readonly ColumnDefinition[]> = {
  [K in C[number] as K["name"]]: K["type"] extends keyof ColumnTypes
    ? ColumnTypes[K["type"]]
    : string;
};
export type ChannelApi = {
  createTextStream: (id: string) => {
    print: (text: string) => void;
    println: (text: string) => void;
  };
  createTableStream: <const C extends readonly ColumnDefinition[]>(
    id: string,
    columns: C,
  ) => { add: (record: RecordFromColumns<C>) => void };
};

export const createChannelApi = (
  register: (definition: ChannelDefinition) => void,
  textWriter: (id: string, newline: boolean) => (text: string) => void,
  tableWriter: (id: string) => (record: any) => void,
): ChannelApi => ({
  createTextStream: (id) => {
    register({ id, view: "text", detail: {} });
    return { print: textWriter(id, false), println: textWriter(id, true) };
  },
  createTableStream: (id, columns) => {
    const seen = new Set<string>();
    for (const column of columns) {
      if (seen.has(column.name)) {
        throw new Error(
          `Column names must be unique. Duplicate found: "${column.name}"`,
        );
      }
      seen.add(column.name);
    }
    register({ id, view: "table", detail: columns });
    return { add: tableWriter(id) };
  },
});

export type ExecutionStateEvent =
  | { type: "state"; method: "progress_start"; total: number }
  | { type: "state"; method: "progress_tick" }
  | { type: "state"; method: "monitor_init"; allocSize: number }
  | { type: "state"; method: "monitor_set"; index: number; str: string };

export const createStateApi = (
  progress: { current: number },
  notify: (event: ExecutionStateEvent) => void,
) => ({
  useProgress: (total: number) => {
    progress.current = 0;
    notify({ type: "state", method: "progress_start", total });
    return {
      getCurrent: () => progress.current,
      tick: () => {
        progress.current++;
        notify({ type: "state", method: "progress_tick" });
      },
    };
  },
  useMonitor: (allocSize: number) => {
    notify({ type: "state", method: "monitor_init", allocSize });
    return Array.from({ length: allocSize }, (_, index) => (str: string) => {
      notify({ type: "state", method: "monitor_set", index, str });
    });
  },
});

export type ReservedApiPorts = {
  plainChannelId: string;
  appendLines: (channelId: string, lines: string[]) => void;
  registerChannel: (definition: ChannelDefinition) => void;
  createFileSystem: () => object;
  createRuntime: () => object;
  createNetwork: () => object;
  createState: () => object;
  createParser: () => object;
};

export const createReservedApi = (
  name: ReservedApi,
  ports: ReservedApiPorts,
): object => {
  const textWriter = (id: string, newline: boolean) => (text: string) => {
    const lines = text.split("\n");
    if (newline) lines.push("");
    ports.appendLines(id, lines);
  };
  const tableWriter = (id: string) => (record: any) => {
    ports.appendLines(id, [JSON.stringify(record), ""]);
  };
  switch (name) {
    case "print":
      return textWriter(ports.plainChannelId, false);
    case "println":
      return textWriter(ports.plainChannelId, true);
    case "channel":
      return createChannelApi(ports.registerChannel, textWriter, tableWriter);
    case "fs":
      return ports.createFileSystem();
    case "runtime":
      return ports.createRuntime();
    case "net":
      return ports.createNetwork();
    case "state":
      return ports.createState();
    case "parser":
      return ports.createParser();
  }
};
