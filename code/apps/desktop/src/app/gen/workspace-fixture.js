import { CURRENT_GEN } from './gen-version.js';

/** @returns {import('../state/model/workspace/env-state').default.Props} */
export const createEnvFixture = () => ({
  varName: 'ENV_SAMPLE',
  value: 'C:/sample',
});

/** @returns {import('../state/model/workspace/resource-state').default.Props} */
export const createResourceFixture = () => ({
  varName: 'RESOURCE_SAMPLE',
  source: 'sample resource text',
});

/** @returns {import('../state/model/workspace/dataset-state').default.Props} */
export const createDatasetFixture = () => ({
  varName: 'DATASET_SAMPLE',
  rootPath: 'C:/sample-root',
  encoding: 'utf8',
  scanOption: {
    dirConds: [{ pattern: 'node_modules', isExclude: true }],
    fileConds: [{ pattern: '*.txt', isExclude: false }],
  },
  targets: ['docs/readme.txt'],
});

/** @returns {import('../state/model/workspace/process-state').default.Props} */
export const createProcessFixture = () => ({
  funcName: 'processSample',
  prgPath: 'C:/Windows/System32/cmd.exe',
  scriptArgs: [{ name: 'arg0', type: 'string' }],
  cmdArgs: ['/C', 'echo', '__arg0__'],
  cwd: '',
  stdin: '',
  timeout: 3000,
  encoding: {
    stdin: 'utf8',
    stdout: 'utf8',
    stderr: 'utf8',
  },
});

/** @returns {import('../state/model/workspace/logic-state').default.Props} */
export const createLogicFixture = () => ({
  name: 'logicSample',
  source: 'export default function () {}',
});

/** @returns {import('../state/model/workspace/declare-state').default.Props} */
export const createDeclareFixture = () => ({
  source: '',
});

/** @returns {import('../state/model/workspace/work-state').default.Props} */
export const createWorkFixture = () => ({
  name: 'workSample',
  method: 'plain',
  source: '',
});

/**
 * @returns {import('../state/model/workspace/workspace-state').default.Props}
 */
export const createMinimalWorkspace = () => ({
  gen: { ...CURRENT_GEN },
  envs: [],
  resources: [],
  datasets: [],
  processes: [],
  logics: [],
  declare: createDeclareFixture(),
  works: [],
});

/**
 * @returns {import('../state/model/workspace/workspace-state').default.Props}
 */
export const createWorkspaceSchemaFixture = () => ({
  gen: { ...CURRENT_GEN },
  envs: [createEnvFixture()],
  resources: [createResourceFixture()],
  datasets: [createDatasetFixture()],
  processes: [createProcessFixture()],
  logics: [createLogicFixture()],
  declare: createDeclareFixture(),
  works: [createWorkFixture()],
});
