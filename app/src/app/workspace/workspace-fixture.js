import { CURRENT_GEN } from './workspace-version.js';

/** @returns {import('../store/store-env').default.Props} */
export const createEnvFixture = () => ({
  varName: 'ENV_SAMPLE',
  value: 'C:/sample',
});

/** @returns {import('../store/store-resource').default.Props} */
export const createResourceFixture = () => ({
  varName: 'RESOURCE_SAMPLE',
  source: 'sample resource text',
});

/** @returns {import('../store/store-dataset').default.Props} */
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

/** @returns {import('../store/store-process').default.Props} */
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

/** @returns {import('../store/store-logic').default.Props} */
export const createLogicFixture = () => ({
  name: 'logicSample',
  source: 'export default function () {}',
});

/** @returns {import('../store/store-declare').default.Props} */
export const createDeclareFixture = () => ({
  source: '',
});

/** @returns {import('../store/store-work').default.Props} */
export const createWorkFixture = () => ({
  name: 'workSample',
  method: 'plain',
  source: '',
});

/**
 * @returns {import('../store/store-workspace').default.Props}
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
 * @returns {import('../store/store-workspace').default.Props}
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
