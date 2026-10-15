export type TextEncoding = "utf8" | "sjis";
export type ResourceParseMethod = "csv" | "tsv";
export type OutputMethod = "plain" | "channel";
export type EnvPurpose = "dir" | "file";
export type EnvDefinition = {
  varName: string;
  value: string;
  purpose?: EnvPurpose;
};
export type ResourceDefinition = {
  varName: string;
  source: string;
  parse?: ResourceParseMethod;
  parseValidated?: true;
};
export interface FileCondition {
  pattern: string;
  isExclude: boolean;
}
export interface DirectoryCondition extends FileCondition {
  depth?: number;
}
export type DatasetScanOptions = {
  limitDepth?: number;
  dirConds: DirectoryCondition[];
  fileConds: FileCondition[];
};
export interface DatasetNode {
  name: string;
  children: null | DatasetNode[];
}
export type DatasetDefinition = {
  varName: string;
  rootPath: string;
  encoding: TextEncoding;
  scanOption: DatasetScanOptions;
  targets: string[] | null;
};
export type ProcessDefinition = {
  funcName: string;
  prgPath: string;
  scriptArgs: { name: string; type: "string" | "number" }[];
  cmdArgs: string[];
  cwd: string;
  stdin: string;
  timeout: number;
  encoding: { stdin: TextEncoding; stdout: TextEncoding; stderr: TextEncoding };
};
export type LogicDefinition = { name: string; source: string };
export type WorkDefinition = {
  name: string;
  method: OutputMethod;
  source: string;
  origin?: "user" | "ai";
};
export type DeclareDefinition = { source: string };
export type WorkspaceGeneration = { workspace: string; api: string };
export type Workspace = {
  gen: WorkspaceGeneration;
  envs: EnvDefinition[];
  resources: ResourceDefinition[];
  datasets: DatasetDefinition[];
  processes: ProcessDefinition[];
  logics: LogicDefinition[];
  declare: DeclareDefinition;
  works: WorkDefinition[];
};
export type ValidationCategory =
  | "env"
  | "resource"
  | "dataset"
  | "process"
  | "logic"
  | "work";
export type ValidationTarget = { cat: ValidationCategory; index: number };
