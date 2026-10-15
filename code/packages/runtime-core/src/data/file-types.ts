namespace FileTypes {
  export type FileStat = {
    size: number;
    isFile: boolean;
    isDir: boolean;
    readonly: boolean;
    createdAt?: number;
    modifiedAt?: number;
  };
  export type TextEncoding = "utf8" | "sjis";
  export type FileRequest = { filePath: string; encoding?: TextEncoding };
}
export type { FileTypes as default };
