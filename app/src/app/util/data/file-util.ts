import Pako from 'pako';
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
import checkWorkspaceCompatibility from '../../gen/check-workspace-compatibility';
import ValidationService from '../../service/validation-service';
import { appStore, dirtyStore, workspaceStore } from '../../state/store';

namespace FileUtil {
  export const VERSION = `v${0}.${0}.${2}`;
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

  /**
   * 譁・ｭ怜・繧貞悸邵ｮ縺吶ｋ
   * @param baseStr 蝨ｧ邵ｮ蜑阪・譁・ｭ怜・
   * @returns 蝨ｧ邵ｮ蠕後・譁・ｭ怜・
   */
  const gZip = (baseStr: string) => {
    const encoder = new TextEncoder(); // 譁・ｭ怜・繧旦int8Array縺ｫ繧ｨ繝ｳ繧ｳ繝ｼ繝峨☆繧九◆繧√↓菴ｿ逕ｨ
    const textUint8Array = encoder.encode(baseStr);

    // gzip蝨ｧ邵ｮ
    const compressed = Pako.gzip(textUint8Array); // Uint8Array 繧・Base64 譁・ｭ怜・縺ｫ螟画鋤
    const compressedBase64 = uint8ArrayToBase64(compressed);
    return compressedBase64;
  };
  // Uint8Array 繧・Base64 縺ｫ繧ｨ繝ｳ繧ｳ繝ｼ繝峨☆繧九・繝ｫ繝代・髢｢謨ｰ
  const uint8ArrayToBase64 = (buffer: Uint8Array) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  /**
   * 蝨ｧ邵ｮ縺輔ｌ縺滓枚蟄怜・繧定､・捷縺吶ｋ
   * @param baseStr 蝨ｧ邵ｮ縺輔ｌ縺滓枚蟄怜・
   * @returns 隍・捷蠕後・譁・ｭ怜・
   */
  export const unZip = (baseStr: string) => {
    const compressedFromBase64 = Uint8Array.from(atob(baseStr), (c) =>
      c.charCodeAt(0),
    );
    return Pako.inflate(compressedFromBase64, { to: 'string' });
  };

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
      const workspaceSrc = await getWorkspaceFile(res);
      const workspace: WorkspaceState.Props = JSON.parse(workspaceSrc);
      const compatibility = checkWorkspaceCompatibility({
        currentGen: CURRENT_GEN,
        fileGen: workspace.gen,
      });
      let apiWarning:
        | Extract<
            import('../../gen/check-workspace-compatibility').WorkspaceCompatibilityResult,
            { status: 'warn-api' }
          >
        | null = null;
      switch (compatibility.status) {
        case 'ok':
          break;
        case 'warn-api':
          apiWarning = compatibility;
          break;
        case 'needs-workspace-migration':
          appStore.update((curr) => ({
            ...curr,
            migration: MigrationFlow.create({
              handlePath: res,
              workspace,
              diff: compatibility.workspaceDiff,
            }),
          }));
          return;
        case 'reject-missing-gen':
        case 'reject-workspace-ahead':
        case 'reject-api-ahead':
          alert(compatibility.message);
          return;
      }
      const snapshot = await DirtyUtil.getSnapshot(workspace);
      if (apiWarning != null) {
        const state = await createApiWarningState({
          handlePath: res,
          workspace,
          snapshot,
          apiDiff: apiWarning.apiDiff,
        });
        appStore.update((curr) => ({
          ...curr,
          apiWarning: state,
        }));
        return;
      }
      workspaceStore.update((v) => {
        return {
          ...v,
          handlePath: res,
          workspace: workspace,
          snapshot,
        };
      });
      ValidationService.validateAll();
    }
  };

  const getWorkspaceFile = async (filePath: string) => {
    const req: TauriDto.FileRequest = { filePath, encoding: 'sjis' };
    const fileContent = await invoke<string>('read_file', { req });
    const jsonStr = FileUtil.unZip(fileContent);
    return jsonStr;
  };

  export const loadWorkspaceFile = async (filePath: string) => {
    const workspaceSrc = await getWorkspaceFile(filePath);
    const workspace: WorkspaceState.Props = JSON.parse(workspaceSrc);
    const compatibility = checkWorkspaceCompatibility({
      currentGen: CURRENT_GEN,
      fileGen: workspace.gen,
    });
    let apiWarning:
      | Extract<
          import('../../gen/check-workspace-compatibility').WorkspaceCompatibilityResult,
          { status: 'warn-api' }
        >
      | null = null;
    switch (compatibility.status) {
      case 'ok':
        break;
      case 'warn-api':
        apiWarning = compatibility;
        break;
      case 'needs-workspace-migration':
        appStore.update((curr) => ({
          ...curr,
          migration: MigrationFlow.create({
            handlePath: filePath,
            workspace,
            diff: compatibility.workspaceDiff,
          }),
        }));
        return;
      case 'reject-missing-gen':
      case 'reject-workspace-ahead':
      case 'reject-api-ahead':
        alert(compatibility.message);
        return;
    }
    const snapshot = await DirtyUtil.getSnapshot(workspace);
    if (apiWarning != null) {
      const state = await createApiWarningState({
        handlePath: filePath,
        workspace,
        snapshot,
        apiDiff: apiWarning.apiDiff,
      });
      appStore.update((curr) => ({
        ...curr,
        apiWarning: state,
      }));
      return;
    }
    workspaceStore.update((curr) => {
      curr.workspace = workspace;
      curr.handlePath = filePath;
      curr.snapshot = snapshot;
      return curr;
    });
    ValidationService.validateAll();
    ToastService.show({ text: 'Project loaded successfully.' });
  };
}
export default FileUtil;
