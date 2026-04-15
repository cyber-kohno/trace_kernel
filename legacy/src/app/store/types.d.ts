import type StoreDataset from "./storeDataset";

export type FileStat = {
  size: number;
  isFile: boolean;
  isDir: boolean;
  readonly: boolean;
  createdAt?: number;
  modifiedAt?: number;
};

export interface ScanRequest extends StoreDataset.ScanOption {
  rootPath: string;
};

export interface FileCond {
  pattern: string;
  isExclude: boolean;
}
export interface DirCond extends FileCond {
  depth?: number;
}

export type ScanResponse = {
  result: string;
  node: PayloadNode;
};
export interface PayloadNode {
  name: string;
  children: null | PayloadNode[];
}

export type KeyValue = {
  key: string;
  value: string;
}
export type TextEncoding = 'utf8' | 'sjis';
export type FileRequest = {
  filePath: string;
  encoding: TextEncoding;
}

export type DirBelong = {
  name: string;
  isDir: boolean;
}

export type HtmlSource = {
  url: string;
  html: string;
  fetchedAt: number;
}
// export type ChannelType = 'root' | 'category' | 'item';