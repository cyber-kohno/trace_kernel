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

  export const getLogicDisplayItem = (
    logic: WorkspaceState.Props['logics'][number],
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ) => {
    const signature = ContextDataUtil.getLogicSignature(
      logic,
      ContextDataUtil.getUsableData(workspace, disables),
      workspace.declare.source,
    );
    return `${logic.name}: ${LogicSignatureCache.formatFunctionType(signature)}`;
  };

  export const getWorkContextItems = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ): ContextItem[] => {
    const logicItems = ContextDataUtil.getUsableData(workspace, disables)
      .logics.filter((logic) => logic.name !== '')
      .map((logic) => ({
        prefix: '$logic' as const,
        item: getLogicDisplayItem(logic, workspace, disables),
      }));

    return [...getBaseContextItems(workspace, disables), ...logicItems];
  };

  export const getWorkContextDeclarations = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
  ): string[] =>
    ContextDataUtil.createDeclareDef(
      ContextDataUtil.getUsableData(workspace, disables),
      workspace.declare.source,
    );

  export const getLogicContextItems = (
    workspace: WorkspaceState.Props,
    disables: ValidationState.Target[],
    options?: {
      excludeName?: string;
    },
  ): ContextItem[] => {
    const logicItems = ContextDataUtil.getUsableData(workspace, disables)
      .logics.filter((logic) => {
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

  export const getWorkApiDeclarations = (
    method: WorkState.OutputMethod,
  ): string[] =>
    DeclareUtil.getUsableReserveList({ method }).map((name) => {
      const { typeDec, valueDec } = DeclareUtil.createUtilDeclareDef(name);
      return [typeDec, `declare const $${name}: ${valueDec};`]
        .filter((declaration) => declaration !== '')
        .join('\n');
    });

  export const getLogicApiItems = (): string[] => {
    return ['$parser'];
  };
}

export default ProgramInjectionUtil;
