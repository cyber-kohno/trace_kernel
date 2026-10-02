import type WorkState from '../../../../state/model/workspace/work-state';
import type WorkspaceState from '../../../../state/model/workspace/workspace-state';
import type ValidationState from '../../../../state/model/validation-state';
import ContextDataUtil from '../../../detail/program/util/context-data-util';
import DeclareUtil from '../../../detail/program/util/declare-util';
import LogicSignatureCache from '../../../detail/logic/util/logic-signature-cache';

namespace ProgramInjectionUtil {
  export type ContextItem = {
    prefix: '$env' | '$resource' | '$dataset' | '$process' | '$logic';
    item: string;
  };

  const getBaseContextItems = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ): ContextItem[] => {
    const contexts = ContextDataUtil.getUsableData(workspace, disables);
    return [
      ...contexts.envs.map((env) => ({
        prefix: '$env' as const,
        item: env.varName,
      })),
      ...contexts.resources.map((resource) => ({
        prefix: '$resource' as const,
        item: resource.varName,
      })),
      ...contexts.datasets.map((dataset) => ({
        prefix: '$dataset' as const,
        item: dataset.varName,
      })),
      ...contexts.processes.map((process) => ({
        prefix: '$process' as const,
        item: process.funcName,
      })),
    ];
  };

  const getLogicApiDeclareDefs = () =>
    ['parser' as const].map((r) => {
      const { typeDec, valueDec } = DeclareUtil.createUtilDeclareDef(r);
      return `${typeDec} declare const $${r}: ${valueDec};`;
    });

  export const getLogicDisplayItem = (
    logic: WorkspaceState.Props['logics'][number],
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ) => {
    const injectionDefs = getLogicSignatureInjectionDefs(workspace, disables);
    const signature = LogicSignatureCache.get({
      source: logic.source,
      injectionDefs,
      declareSource: workspace.declare.source,
    });
    return `${logic.name}: ${LogicSignatureCache.formatFunctionType(signature)}`;
  };

  const getLogicSignatureInjectionDefs = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ) => {
    const contexts = ContextDataUtil.getUsableData(workspace, disables);
    return getLogicApiDeclareDefs().concat(
      ContextDataUtil.createDeclareDef({
        ...contexts,
        logics: [],
      }),
    );
  };

  export const getWorkContextItems = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ): ContextItem[] => {
    const isDisable = (cat: ValidationState.Category, index: number) =>
      disables.find((item) => item.cat === cat && item.index === index) !=
      undefined;

    const logicItems = workspace.logics
      .filter((logic, index) => !isDisable('logic', index) && logic.name !== '')
      .map((logic) => ({
        prefix: '$logic' as const,
        item: getLogicDisplayItem(logic, workspace, disables),
      }));

    return [...getBaseContextItems(workspace, disables), ...logicItems];
  };

  export const getLogicContextItems = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
    options?: {
      excludeName?: string;
    },
  ): ContextItem[] => {
    const isDisable = (cat: ValidationState.Category, index: number) =>
      disables.find((item) => item.cat === cat && item.index === index) !=
      undefined;

    const logicItems = workspace.logics
      .filter((logic, index) => {
        if (isDisable('logic', index)) return false;
        if (options?.excludeName && logic.name === options.excludeName) {
          return false;
        }
        return logic.name !== '';
      })
      .map((logic) => ({
        prefix: '$logic' as const,
        item: getLogicDisplayItem(logic, workspace, disables),
      }));

    return [...getBaseContextItems(workspace, disables), ...logicItems];
  };

  export const getWorkApiItems = (method: WorkState.OutputMethod): string[] => {
    return DeclareUtil.getUsableReserveList({
      method,
    }).map((res) => `$${res}`);
  };

  export const getLogicApiItems = (): string[] => {
    return ['$parser'];
  };
}

export default ProgramInjectionUtil;
