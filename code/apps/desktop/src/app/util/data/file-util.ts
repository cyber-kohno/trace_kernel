import WorkspaceCodec from '../../../../../../packages/runtime-core/src/workspace/workspace-codec';
import { get } from 'svelte/store';
import { ask, open, save } from '@tauri-apps/plugin-dialog';
import type TauriDto from '../../infra/tauri/tauri-dto';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';
import ToastService from '../../service/toast-service';
import WorkspaceState from '../../state/model/workspace/workspace-state';
import DirtyUtil from '../../service/dirty/dirty-util';
import MigrationFlow from '../../gen/migration-flow';
import { CURRENT_GEN } from '../../gen/gen-version.js';
import createApiWarningState from '../../gen/api-warning';
import prepareWorkspaceLoad from '../../service/workspace/prepare-workspace-load';
import ValidationService from '../../service/validation-service';
import { appStore, dirtyStore, workspaceStore } from '../../state/store';
import { PRODUCT_INFO } from '../../product-info';

namespace FileUtil {
  export const VERSION = `v${PRODUCT_INFO.releaseVersion}`;
  export const APP_NAME = `Trace Kernel ${VERSION}`;
  const FILE_EXTENSION: string = `${VERSION}.trk`;

  export const updateAppTitle = async () => {
    let fileDisp = '';
    const lastStore = get(workspaceStore);
    if (lastStore.workspace != null) {
      let fileName = '(Untitled)';

      const handlePath = lastStore.handlePath;
      if (handlePath != null) {
        fileName = getFileNameFromPath(handlePath);
      }
      fileDisp = `${fileName}${get(dirtyStore) ? '*' : ''} - `;
    }
    const win = Window.getCurrent();
    const pro = get(appStore).license == null ? '' : ' @Professional';
    await win.setTitle(`${fileDisp}${FileUtil.APP_NAME}${pro}`);
  };

  export const getFileNameFromPath = (path: string) => {
    return path.split(/[/\\]/).pop()!;
  };

  const gZip = WorkspaceCodec.gZip;
  export const unZip = WorkspaceCodec.unZip;

  export const base64ToBlob = (base64: string, type: string) => {
    const byteString = atob(base64);
    const arrayBuffer = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      arrayBuffer[i] = byteString.charCodeAt(i);
    }
    return new Blob([arrayBuffer], { type });
  };

  export const saveWorkspace = async () => {
    if (!get(dirtyStore)) return;

    const lastStore = get(workspaceStore);

    let isCreate = false;
    if (lastStore.handlePath == null) {
      isCreate = true;
      const handlePath = await save({
        filters: [{ name: 'Text File', extensions: [FILE_EXTENSION] }],
      });
      workspaceStore.update((v) => ({ ...v, handlePath }));
    }

    const workspace = get(workspaceStore).workspace;
    if (workspace == null) throw new Error();
    const currentWorkspaceState = get(workspaceStore);
    if (currentWorkspaceState.handlePath != null) {
      const content = gZip(JSON.stringify(workspace));
      const path = currentWorkspaceState.handlePath;
      await invoke('save_text', { path, content });
      if (!isCreate) {
        ToastService.show({ text: 'File saving successful.' });
      }
      const snapshot = await DirtyUtil.getSnapshot(workspace);
      workspaceStore.update((v) => ({ ...v, snapshot }));
    }
  };

  export const loadWorkspaceChoose = async () => {
    const res = await open({
      multiple: false,
      filters: [
        {
          name: 'Trace Kernel Workspace',
          extensions: ['trk'],
        },
      ],
    });
    if (res != null) {
      await openWorkspacePath(res, false);
    }
  };

  const getWorkspaceFile = async (filePath: string) => {
    const req: TauriDto.FileRequest = { filePath, encoding: 'sjis' };
    const fileContent = await invoke<string>('read_file', { req });
    const jsonStr = FileUtil.unZip(fileContent);
    return jsonStr;
  };

  const openWorkspacePath = async (
    filePath: string,
    showSuccessToast: boolean,
  ) => {
    const workspaceSrc = await getWorkspaceFile(filePath);
    const prepared = prepareWorkspaceLoad(workspaceSrc, CURRENT_GEN);
    const { workspace } = prepared;
    switch (prepared.status) {
      case 'ok':
        break;
      case 'warn-api':
        break;
      case 'needs-workspace-migration':
        appStore.update((curr) => ({
          ...curr,
          migration: MigrationFlow.create({
            handlePath: filePath,
            workspace,
            diff: prepared.workspaceDiff,
          }),
        }));
        return;
      case 'reject-missing-gen':
      case 'reject-workspace-ahead':
      case 'reject-api-ahead':
        alert(prepared.message);
        return;
    }
    const snapshot = await DirtyUtil.getSnapshot(workspace);
    if (prepared.status === 'warn-api') {
      const state = await createApiWarningState({
        handlePath: filePath,
        workspace,
        snapshot,
        apiDiff: prepared.apiDiff,
      });
      appStore.update((curr) => ({
        ...curr,
        apiWarning: state,
      }));
      return;
    }
    workspaceStore.update((curr) => ({
      ...curr,
      workspace,
      handlePath: filePath,
      snapshot,
    }));
    ValidationService.validateAll();
    if (showSuccessToast) {
      ToastService.show({ text: 'Project loaded successfully.' });
    }
  };

  export const loadWorkspaceFile = async (filePath: string) => {
    await openWorkspacePath(filePath, true);
  };
}
export default FileUtil;
