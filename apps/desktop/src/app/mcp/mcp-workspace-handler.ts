import { get } from 'svelte/store';
import { uiStore, workspaceStore } from '../state/store';
import WorkspaceState from '../state/model/workspace/workspace-state';
import ValidationService from '../service/validation-service';
import type WorkState from '../state/model/workspace/work-state';
import ProgramInjectionUtil from '../contents/maintenance/program/injection/program-injection-util';
import { validationStore } from '../state/store';
import TypescriptUtil from '../util/typescript-util';
import type ValidationState from '../state/model/validation-state';

const getUiTarget = (
  target: ValidationState.Target | null,
  workspace: WorkspaceState.Props,
) => {
  if (target == null || !Number.isInteger(target.index) || target.index < 0) return null;
  const { cat, index } = target;
  const names = {
    env: workspace.envs.map((item) => item.varName),
    resource: workspace.resources.map((item) => item.varName),
    dataset: workspace.datasets.map((item) => item.varName),
    process: workspace.processes.map((item) => item.funcName),
    logic: workspace.logics.map((item) => item.name),
    work: workspace.works.map((item) => item.name),
  };
  const name = names[cat]?.[index];
  return name == null ? null : { type: cat, name, index };
};

type Request = { method: string; params?: Record<string, unknown> };

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

const diagnosticMessage = (message: unknown): string => {
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object' && 'messageText' in message) return diagnosticMessage((message as { messageText: unknown }).messageText);
  return String(message);
};

const staticValidateWork = (work: WorkState.Props, workspace: WorkspaceState.Props) => {
  const errors: { code: string; message: string }[] = [];
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(work.name)) {
    errors.push({ code: 'INVALID_NAME', message: 'Work name must be a valid TypeScript identifier.' });
  }
  if (workspace.works.some((item) => item.name === work.name)) {
    errors.push({ code: 'DUPLICATE_NAME', message: `Work '${work.name}' already exists.` });
  }
  if (work.source.trim() === '') errors.push({ code: 'EMPTY_SOURCE', message: 'Work source must not be empty.' });
  if (work.method !== 'plain' && work.method !== 'channel') errors.push({ code: 'INVALID_METHOD', message: 'Work method must be plain or channel.' });
  const transpiled = TypescriptUtil.transpileTsToJs(work.source);
  for (const diagnostic of transpiled.diagnostics ?? []) {
    errors.push({ code: 'TYPESCRIPT_SYNTAX', message: diagnosticMessage(diagnostic.messageText) });
  }
  return { valid: errors.length === 0, errors, warnings: [] };
};

export const handleMcpWorkspaceRequest = (request: Request) => {
  const workspace = get(workspaceStore).workspace;
  if (request.method === 'ping') return { application: 'Trace Kernel', status: 'ok' };
  if (workspace == null) throw new Error('No Trace Kernel project is open.');

  switch (request.method) {
    case 'getUiState': {
      const ui = get(uiStore);
      const outlineSelection = getUiTarget(ui.target, workspace);
      const editorType = ui.dialog === 'program' ? 'work' : ui.dialog === 'logic' ? 'logic' : null;
      const editor = ui.dialog === 'declare'
        ? { type: 'declare', name: null, index: null, open: true }
        : editorType != null && outlineSelection?.type === editorType
          ? { ...outlineSelection, open: true }
          : null;
      return { outlineSelection, editor };
    }
    case 'getWorkspaceOverview':
      return { workspace: json(workspace.gen), counts: { envs: workspace.envs.length, resources: workspace.resources.length, datasets: workspace.datasets.length, processes: workspace.processes.length, logics: workspace.logics.length, works: workspace.works.length }, names: { resources: workspace.resources.map((item) => item.varName), works: workspace.works.map((item) => item.name) } };
    case 'listEnvs':
      return json(workspace.envs);
    case 'getEnv': {
      const name = String(request.params?.varName ?? '');
      const env = workspace.envs.find((item) => item.varName === name);
      if (!env) throw new Error(`Environment '${name}' was not found.`);
      return json(env);
    }
    case 'listResources':
      return json(workspace.resources.map(({ varName, source, parse, parseValidated }) => ({ varName, source, parse, parseValidated })));
    case 'getResource': {
      const name = String(request.params?.varName ?? '');
      const resource = workspace.resources.find((item) => item.varName === name);
      if (!resource) throw new Error(`Resource '${name}' was not found.`);
      return json(resource);
    }
    case 'getResourceSample': {
      const name = String(request.params?.varName ?? '');
      const resource = workspace.resources.find((item) => item.varName === name);
      if (!resource) throw new Error(`Resource '${name}' was not found.`);
      const lines = resource.source.split(/\r?\n/).filter((line) => line.trim() !== '');
      const delimiter = resource.parse === 'tsv' ? '\t' : ',';
      return { varName: resource.varName, parse: resource.parse ?? null, headers: lines[0]?.split(delimiter) ?? [], rows: lines.slice(1, 11).map((line) => line.split(delimiter)), totalRows: Math.max(0, lines.length - 1) };
    }
    case 'listWorks':
      return json(workspace.works.map(({ name, method, origin }) => ({ name, method, origin: origin ?? 'user' })));
    case 'getWork': {
      const name = String(request.params?.name ?? '');
      const work = workspace.works.find((item) => item.name === name);
      if (!work) throw new Error(`Work '${name}' was not found.`);
      return json(work);
    }
    case 'getWorkContext':
      return { context: ProgramInjectionUtil.getWorkContextItems(workspace, get(validationStore).disables), api: ProgramInjectionUtil.getWorkApiItems((request.params?.method ?? 'plain') as WorkState.OutputMethod), declare: workspace.declare.source };
    case 'validateWork': {
      const work = request.params?.work as Partial<WorkState.Props> | undefined;
      if (!work) throw new Error('work is required.');
      return staticValidateWork({ name: String(work.name ?? ''), method: (work.method ?? 'plain') as WorkState.OutputMethod, source: String(work.source ?? ''), origin: 'ai' }, workspace);
    }
    case 'createWork': {
      const input = request.params?.work as Partial<WorkState.Props> | undefined;
      if (!input) throw new Error('work is required.');
      const work: WorkState.Props = { name: String(input.name ?? ''), method: (input.method ?? 'plain') as WorkState.OutputMethod, source: String(input.source ?? ''), origin: 'ai' };
      const analysis = staticValidateWork(work, workspace);
      if (!analysis.valid) return { created: false, staticAnalysis: analysis };
      workspace.works = [...workspace.works, work];
      workspaceStore.update((state) => ({ ...state, workspace: { ...workspace } }));
      ValidationService.validateAll();
      return { created: true, work: json(work), staticAnalysis: analysis };
    }
    default: throw new Error(`Unsupported MCP method '${request.method}'.`);
  }
};
