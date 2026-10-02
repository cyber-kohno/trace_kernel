import type DatasetState from '../../state/model/workspace/dataset-state';

namespace TauriDto {
  export const namespaceName = 'TauriDto';

  export type FileStat = {
    size: number;
    isFile: boolean;
    isDir: boolean;
    readonly: boolean;
    createdAt?: number;
    modifiedAt?: number;
  };

  export interface ScanRequest extends DatasetState.ScanOption {
    rootPath: string;
  }

  export type KeyValue = {
    key: string;
    value: string;
  };

  export type TextEncoding = 'utf8' | 'sjis';

  export type FileRequest = {
    filePath: string;
    encoding?: TextEncoding;
  };

  export type DirBelong = {
    name: string;
    isDir: boolean;
  };

  export type HtmlSource = {
    url: string;
    html: string;
    fetchedAt: number;
  };
}

export default TauriDto;
