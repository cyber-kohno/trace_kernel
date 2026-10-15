// In-memory UI/store/license ports. This is not a Tauri/WebView/license-signature test.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { CURRENT_GEN } from '../../../packages/runtime-core/src/metadata/gen-version.js';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = path.resolve(app, '../..');
const require = createRequire(import.meta.url);
const libDirectory = path.dirname(
  require.resolve('typescript/lib/lib.es2020.d.ts'),
);
const libs = Object.fromEntries(
  readdirSync(libDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/.test(name))
    .map((name) => [name, readFileSync(path.join(libDirectory, name), 'utf8')]),
);

export const acceptanceHarness = () => {
  let professional = false;
  let validations = 0;
  const mocks = new Map();
  const cache = new Map();
  const load = (relative) => {
    const file = path.isAbsolute(relative)
      ? relative
      : path.resolve(code, relative);
    assert.ok(
      file.startsWith(code + path.sep),
      'fixture import escaped code directory',
    );
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText;
    new Function('require', 'exports', 'module', compiled)(
      (name) => {
        const match = [...mocks.keys()].find(
          (key) => name === key || name.endsWith('/' + key),
        );
        if (match) return mocks.get(match);
        if (!name.startsWith('.')) {
          assert.ok(
            [
              'typescript',
              'svelte/store',
              'encoding-japanese',
              'pako',
            ].includes(name),
            `Unexpected host dependency: ${name}`,
          );
          return require(name);
        }
        let target = path.resolve(path.dirname(file), name);
        if (!existsSync(target)) target += '.ts';
        return load(target);
      },
      module.exports,
      module,
    );
    return module.exports;
  };
  const defaultModule = (value) => ({ __esModule: true, default: value });
  const { writable, get } = require('svelte/store');
  const workspaceStore = writable({
    workspace: {
      gen: { ...CURRENT_GEN },
      envs: [],
      resources: [],
      datasets: [],
      processes: [],
      logics: [],
      works: [],
      declare: { source: '' },
    },
  });
  const uiStore = writable({ target: null, dialog: null, workEditorId: null });
  const validationStore = writable({ disables: [] });
  mocks.set('state/store', { workspaceStore, uiStore, validationStore });
  mocks.set(
    'validation-service',
    defaultModule({
      validate: () => validations++,
      validateAll: () => validations++,
    }),
  );
  mocks.set(
    'context-data-util',
    defaultModule({
      getUsableData: (workspace) => workspace,
      getLogicSignature: () => {
        throw new Error('No Logic in acceptance fixture');
      },
      createDeclareDef: () => [],
    }),
  );
  mocks.set('logic-signature-cache', defaultModule({}));
  mocks.set(
    'resource-sample',
    defaultModule({
      create: () => {
        throw new Error('No Resource in acceptance fixture');
      },
    }),
  );
  const api = load(
    'packages/runtime-core/src/declarations/api-declarations.ts',
  ).default;
  const { selectReservedApis } = load(
    'packages/runtime-core/src/execution/work-execution-plan.ts',
  );
  mocks.set(
    'declare-util',
    defaultModule({
      getUsableReserveList: ({ method }) =>
        selectReservedApis(method, professional),
      createUtilDeclareDef: api.createUtilDeclareDef,
    }),
  );
  const validator = load(
    'packages/runtime-core/src/compiler/semantic-work-validator.ts',
  );
  mocks.set('semantic-work-validator', {
    validateWorkTypes: (work, declarations) =>
      validator.validateWorkTypes(work, declarations, libs),
  });
  const { handleMcpWorkspaceRequest } = load(
    'apps/desktop/src/app/mcp/mcp-workspace-handler.ts',
  );
  const proposals = load('apps/desktop/src/app/mcp/work-update-proposal.ts');
  return {
    handle: handleMcpWorkspaceRequest,
    setPro: (value) => {
      professional = value;
    },
    workspace: () => get(workspaceStore).workspace,
    openEditor: () =>
      uiStore.set({
        target: { cat: 'work', index: 0 },
        dialog: 'program',
        workEditorId: 'fixture-editor',
      }),
    closeEditor: () =>
      uiStore.set({ target: null, dialog: null, workEditorId: null }),
    proposal: () => get(proposals.workUpdateProposalStore),
    decide: (decision) =>
      proposals.resolveWorkUpdateProposal(
        get(proposals.workUpdateProposalStore).proposalId,
        decision,
      ),
    dispose: () => {
      const proposal = get(proposals.workUpdateProposalStore);
      if (proposal)
        proposals.resolveWorkUpdateProposal(proposal.proposalId, 'cancel');
    },
    validations: () => validations,
  };
};
