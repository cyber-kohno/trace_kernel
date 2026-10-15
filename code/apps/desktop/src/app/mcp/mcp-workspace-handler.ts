import { get } from 'svelte/store';
import { uiStore, workspaceStore } from '../state/store';
import WorkspaceState from '../state/model/workspace/workspace-state';
import ValidationService from '../service/validation-service';
import type WorkState from '../state/model/workspace/work-state';
import ProgramInjectionUtil from '../contents/maintenance/program/injection/program-injection-util';
import { validationStore } from '../state/store';
import TypescriptUtil from '../util/typescript-util';
import type ValidationState from '../state/model/validation-state';
import { validateWorkTypes } from './semantic-work-validator';
import ResourceSample from './resource-sample';
import { validateWorkName } from '../util/data/work-name-validation';
import {
  clearWorkUpdateProposal,
  openWorkUpdateProposal,
  type WorkUpdateProposal,
  type WorkUpdateResolution,
} from './work-update-proposal';

const getUiTarget = (
  target: ValidationState.Target | null,
  workspace: WorkspaceState.Props,
) => {
  if (target == null || !Number.isInteger(target.index) || target.index < 0)
    return null;
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

type Request = {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
};

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

const diagnosticMessage = (message: unknown): string => {
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object' && 'messageText' in message)
    return diagnosticMessage((message as { messageText: unknown }).messageText);
  return String(message);
};

const staticValidateWork = (
  work: WorkState.Props,
  workspace: WorkspaceState.Props,
) => {
  const errors = validateWorkName(
    work.name,
    workspace.works.map((item) => item.name),
  );
  if (work.source.trim() === '')
    errors.push({
      code: 'EMPTY_SOURCE',
      message: 'Work source must not be empty.',
    });
  if (work.method !== 'plain' && work.method !== 'channel')
    errors.push({
      code: 'INVALID_METHOD',
      message: 'Work method must be plain or channel.',
    });
  const transpiled = TypescriptUtil.transpileTsToJs(work.source);
  for (const diagnostic of transpiled.diagnostics ?? []) {
    errors.push({
      code: 'TYPESCRIPT_SYNTAX',
      message: diagnosticMessage(diagnostic.messageText),
    });
  }
  return { valid: errors.length === 0, errors, warnings: [] };
};

export const handleMcpWorkspaceRequest = async (request: Request) => {
  const workspace = get(workspaceStore).workspace;
  if (request.method === 'ping')
    return { application: 'Trace Kernel', status: 'ok' };
  if (workspace == null) throw new Error('No Trace Kernel project is open.');

  switch (request.method) {
    case 'getUiState': {
      const ui = get(uiStore);
      const outlineSelection = getUiTarget(ui.target, workspace);
      const editorType =
        ui.dialog === 'program' || ui.dialog === 'work-proposal'
          ? 'work'
          : ui.dialog === 'logic'
            ? 'logic'
            : null;
      const editor =
        ui.dialog === 'declare'
          ? { type: 'declare', name: null, index: null, open: true }
          : editorType != null && outlineSelection?.type === editorType
            ? {
                ...outlineSelection,
                open: true,
                ...(editorType === 'work' && ui.workEditorId != null
                  ? { editorId: ui.workEditorId }
                  : {}),
              }
            : null;
      return { outlineSelection, editor };
    }
    case 'getWorkspaceOverview':
      return {
        workspace: json(workspace.gen),
        counts: {
          envs: workspace.envs.length,
          resources: workspace.resources.length,
          datasets: workspace.datasets.length,
          processes: workspace.processes.length,
          logics: workspace.logics.length,
          works: workspace.works.length,
        },
        names: {
          resources: workspace.resources.map((item) => item.varName),
          works: workspace.works.map((item) => item.name),
        },
      };
    case 'listEnvs':
      return json(workspace.envs);
    case 'getEnv': {
      const name = String(request.params?.varName ?? '');
      const env = workspace.envs.find((item) => item.varName === name);
      if (!env) throw new Error(`Environment '${name}' was not found.`);
      return json(env);
    }
    case 'listResources':
      return json(
        workspace.resources.map(
          ({ varName, source, parse, parseValidated }) => ({
            varName,
            source,
            parse,
            parseValidated,
          }),
        ),
      );
    case 'getResource': {
      const name = String(request.params?.varName ?? '');
      const resource = workspace.resources.find(
        (item) => item.varName === name,
      );
      if (!resource) throw new Error(`Resource '${name}' was not found.`);
      return json(resource);
    }
    case 'getResourceSample': {
      const name = String(request.params?.varName ?? '');
      const resource = workspace.resources.find(
        (item) => item.varName === name,
      );
      if (!resource) throw new Error(`Resource '${name}' was not found.`);
      return ResourceSample.create(resource);
    }
    case 'listWorks':
      return json(
        workspace.works.map(({ name, method, origin }) => ({
          name,
          method,
          origin: origin ?? 'user',
        })),
      );
    case 'getWork': {
      const name = String(request.params?.name ?? '');
      const work = workspace.works.find((item) => item.name === name);
      if (!work) throw new Error(`Work '${name}' was not found.`);
      return json(work);
    }
    case 'getWorkContext':
      return {
        context: ProgramInjectionUtil.getWorkContextItems(
          workspace,
          get(validationStore).disables,
        ),
        contextDeclarations: ProgramInjectionUtil.getWorkContextDeclarations(
          workspace,
          get(validationStore).disables,
        ),
        api: ProgramInjectionUtil.getWorkApiItems(
          (request.params?.method ?? 'plain') as WorkState.OutputMethod,
        ),
        apiDeclarations: ProgramInjectionUtil.getWorkApiDeclarations(
          (request.params?.method ?? 'plain') as WorkState.OutputMethod,
        ),
        declare: workspace.declare.source,
      };
    case 'validateWork': {
      const work = request.params?.work as Partial<WorkState.Props> | undefined;
      if (!work) throw new Error('work is required.');
      const normalizedWork: WorkState.Props = {
        name: String(work.name ?? ''),
        method: (work.method ?? 'plain') as WorkState.OutputMethod,
        source: String(work.source ?? ''),
        origin: 'ai',
      };
      const analysis = staticValidateWork(normalizedWork, workspace);
      if (!analysis.valid) return analysis;
      const typeDiagnostics = await validateWorkTypes(normalizedWork, {
        contextDeclarations: ProgramInjectionUtil.getWorkContextDeclarations(
          workspace,
          get(validationStore).disables,
        ),
        apiDeclarations: ProgramInjectionUtil.getWorkApiDeclarations(
          normalizedWork.method,
        ),
        declare: workspace.declare.source,
      });
      return {
        valid: typeDiagnostics.length === 0,
        errors: typeDiagnostics.map((diagnostic) => ({
          code: 'TYPESCRIPT_TYPE',
          message: diagnostic.message,
          typescriptCode: diagnostic.code,
          line: diagnostic.line,
          column: diagnostic.column,
        })),
        warnings: [],
        analysis: 'TypeScript semantic diagnostics; Work was not executed.',
      };
    }
    case 'proposeWorkUpdate': {
      const input = request.params as
        | (Partial<WorkUpdateProposal> & { method?: string })
        | undefined;
      if (!input) throw new Error('Work update proposal is required.');
      if (
        typeof input.editorId !== 'string' ||
        typeof input.name !== 'string' ||
        typeof input.baselineSource !== 'string' ||
        typeof input.proposedSource !== 'string'
      ) {
        throw new Error(
          'Proposal must include editorId, name, baselineSource, and proposedSource.',
        );
      }
      const editorId = input.editorId;
      const name = input.name;
      const baselineSource = input.baselineSource;
      const proposedSource = input.proposedSource;
      const stale = (reason: string) => ({
        status: 'rejected_stale',
        reason,
        message:
          'Proposal rejected because the Work editor or source changed since it was read. No changes were applied.',
      });
      const readLiveWork = (allowProposalDialog = false) => {
        const ui = get(uiStore);
        const currentWorkspace = get(workspaceStore).workspace;
        const target = ui.target;
        if (
          currentWorkspace !== workspace ||
          (ui.dialog !== 'program' &&
            !(allowProposalDialog && ui.dialog === 'work-proposal')) ||
          ui.workEditorId !== editorId ||
          target?.cat !== 'work' ||
          !Number.isInteger(target.index) ||
          target.index < 0
        ) {
          return null;
        }
        const work = currentWorkspace.works[target.index];
        if (!work || work.name !== name || work.source !== baselineSource) {
          return null;
        }
        return { ui, workspace: currentWorkspace, target, work };
      };
      if (baselineSource === proposedSource) {
        return {
          status: 'no_changes',
          message: 'The proposed source matches the current source.',
        };
      }
      if (!readLiveWork()) return stale('editor_or_source_changed');

      const validateProposedSource = async () => {
        const current = readLiveWork(true);
        if (!current) return null;
        const method = current.work.method;
        const candidate = { ...current.work, source: proposedSource };
        const syntaxErrors =
          TypescriptUtil.transpileTsToJs(candidate.source).diagnostics ?? [];
        if (syntaxErrors.length > 0) {
          return syntaxErrors.map((diagnostic) => ({
            code: diagnostic.code,
            message: diagnosticMessage(diagnostic.messageText),
          }));
        }
        const diagnostics = await validateWorkTypes(candidate, {
          contextDeclarations: ProgramInjectionUtil.getWorkContextDeclarations(
            current.workspace,
            get(validationStore).disables,
          ),
          apiDeclarations: ProgramInjectionUtil.getWorkApiDeclarations(method),
          declare: current.workspace.declare.source,
        });
        // Declarations and the Work context can change while the checker loads
        // TypeScript libraries. Never treat diagnostics from an old context as
        // authorization to apply into a newer workspace state.
        if (!readLiveWork(true)) return null;
        return diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message,
          line: diagnostic.line,
          column: diagnostic.column,
        }));
      };

      const preflightErrors = await validateProposedSource();
      if (preflightErrors == null) return stale('editor_or_source_changed');
      if (preflightErrors.length > 0) {
        return { status: 'validation_failed', errors: preflightErrors };
      }
      // Validation is asynchronous; recheck before opening any confirmation UI.
      if (!readLiveWork()) return stale('editor_or_source_changed');

      const proposalId = crypto.randomUUID();
      if (typeof request.id !== 'string') {
        throw new Error('Bridge request ID is required for Work proposals.');
      }
      const proposal: WorkUpdateProposal = {
        proposalId,
        editorId,
        name,
        baselineSource,
        proposedSource,
      };
      let decisionPromise: Promise<WorkUpdateResolution>;
      try {
        decisionPromise = openWorkUpdateProposal(proposal, request.id);
      } catch {
        return {
          status: 'proposal_pending',
          message:
            'Another Work update proposal is already awaiting a decision.',
        };
      }
      uiStore.update((ui) => ({ ...ui, dialog: 'work-proposal' }));
      const decision = await decisionPromise;
      const restoreEditor = () => {
        clearWorkUpdateProposal(proposalId);
        uiStore.update((ui) =>
          ui.dialog === 'work-proposal' && ui.workEditorId === editorId
            ? { ...ui, dialog: 'program' }
            : ui,
        );
      };
      if (decision === 'reject') {
        if (!readLiveWork(true)) {
          restoreEditor();
          return stale('editor_or_source_changed');
        }
        restoreEditor();
        return {
          status: 'rejected_by_user',
          message:
            'The user rejected the Work update. No changes were applied.',
        };
      }
      if (decision === 'cancel') {
        restoreEditor();
        return {
          status: 'cancelled',
          message:
            'The proposal request was cancelled. No changes were applied.',
        };
      }
      if (decision === 'timeout') {
        restoreEditor();
        return {
          status: 'timed_out',
          message:
            'The proposal expired after 10 minutes. No changes were applied.',
        };
      }
      const applyErrors = await validateProposedSource();
      if (applyErrors == null) {
        restoreEditor();
        return stale('editor_or_source_changed');
      }
      if (applyErrors.length > 0) {
        restoreEditor();
        return {
          status: 'validation_failed',
          errors: applyErrors,
          message:
            'The proposal no longer passes validation. No changes were applied.',
        };
      }
      const applyTarget = readLiveWork(true);
      if (!applyTarget || get(uiStore).dialog !== 'work-proposal') {
        restoreEditor();
        return stale('editor_or_source_changed');
      }

      applyTarget.workspace.works[applyTarget.target.index] = {
        ...applyTarget.work,
        source: proposedSource,
      };
      workspaceStore.update((state) => ({
        ...state,
        workspace: { ...applyTarget.workspace },
      }));
      ValidationService.validate({
        cat: 'work',
        index: applyTarget.target.index,
      });
      restoreEditor();
      return {
        status: 'applied',
        name,
        message: 'The Work source update was applied.',
      };
    }
    case 'createWork': {
      const input = request.params?.work as
        | Partial<WorkState.Props>
        | undefined;
      if (!input) throw new Error('work is required.');
      const work: WorkState.Props = {
        name: String(input.name ?? ''),
        method: (input.method ?? 'plain') as WorkState.OutputMethod,
        source: String(input.source ?? ''),
        origin: 'ai',
      };
      const analysis = staticValidateWork(work, workspace);
      if (!analysis.valid) return { created: false, validation: analysis };
      const typeDiagnostics = await validateWorkTypes(work, {
        contextDeclarations: ProgramInjectionUtil.getWorkContextDeclarations(
          workspace,
          get(validationStore).disables,
        ),
        apiDeclarations: ProgramInjectionUtil.getWorkApiDeclarations(
          work.method,
        ),
        declare: workspace.declare.source,
      });
      if (get(workspaceStore).workspace !== workspace) {
        throw new Error(
          'The active workspace changed during Work validation. Retry the request.',
        );
      }
      if (typeDiagnostics.length > 0) {
        return {
          created: false,
          validation: {
            valid: false,
            errors: typeDiagnostics.map((diagnostic) => ({
              code: 'TYPESCRIPT_TYPE',
              message: diagnostic.message,
              typescriptCode: diagnostic.code,
              line: diagnostic.line,
              column: diagnostic.column,
            })),
            warnings: [],
          },
        };
      }
      workspace.works = [...workspace.works, work];
      workspaceStore.update((state) => ({
        ...state,
        workspace: { ...workspace },
      }));
      ValidationService.validateAll();
      return {
        created: true,
        work: json(work),
        validation: {
          valid: true,
          errors: [],
          warnings: [],
          analysis: 'TypeScript semantic diagnostics; Work was not executed.',
        },
      };
    }
    default:
      throw new Error(`Unsupported MCP method '${request.method}'.`);
  }
};
