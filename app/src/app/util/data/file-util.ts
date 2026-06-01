import Pako from 'pako';
import { get } from 'svelte/store';
import appStore from '../../store/app-store';
import workspaceStore from '../../store/workspace-store';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { FileRequest } from '../../store/types';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';
import ToastUtil from '../item/toast-util';
import StoreWorkspace from '../../store/store-workspace';
import { dirty, getSnapshot } from '../../store/dirty';
import { CURRENT_GEN } from '../../workspace/workspace-version.js';

namespace FileUtil {
  export const VERSION = `v${0}.${0}.${1}`;
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
      fileDisp = `${fileName}${get(dirty) ? '*' : ''} - `;
    }
    const win = Window.getCurrent();
    const pro = get(appStore).license == null ? '' : ' @Professional';
    await win.setTitle(`${fileDisp}${FileUtil.APP_NAME}${pro}`);
  };

  export const getFileNameFromPath = (path: string) => {
    return path.split(/[/\\]/).pop()!;
  };

  /**
   * 文字列を圧縮する
   * @param baseStr 圧縮前の文字列
   * @returns 圧縮後の文字列
   */
  const gZip = (baseStr: string) => {
    const encoder = new TextEncoder(); // 文字列をUint8Arrayにエンコードするために使用
    const textUint8Array = encoder.encode(baseStr);

    // gzip圧縮
    const compressed = Pako.gzip(textUint8Array); // Uint8Array を Base64 文字列に変換
    const compressedBase64 = uint8ArrayToBase64(compressed);
    return compressedBase64;
  };
  // Uint8Array を Base64 にエンコードするヘルパー関数
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
   * 圧縮された文字列を複号する
   * @param baseStr 圧縮された文字列
   * @returns 複号後の文字列
   */
  export const unZip = (baseStr: string) => {
    // Base64 文字列を Uint8Array に戻す
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
    // 変更がなければセーブしない。
    if (!get(dirty)) return;

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
        ToastUtil.disp({ text: 'File saving successful.' });
      }
      const snapshot = await getSnapshot(workspace);
      workspaceStore.update((v) => ({ ...v, snapshot }));
    }
  };

  const validateWorkspaceGen = (fileGen: StoreWorkspace.Gen | undefined) => {
    if (fileGen == undefined) {
      alert('Workspace generation data is missing.');
      return false;
    }
    if (
      fileGen.workspace !== CURRENT_GEN.workspace ||
      fileGen.api !== CURRENT_GEN.api
    ) {
      alert(
        `Workspace generation mismatch detected. File workspace/api: ${fileGen.workspace}/${fileGen.api}, App workspace/api: ${CURRENT_GEN.workspace}/${CURRENT_GEN.api}.`,
      );
      return false;
    }
    return true;
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
      const workspace: StoreWorkspace.Props = JSON.parse(workspaceSrc);
      if (!validateWorkspaceGen(workspace.gen)) return;
      const snapshot = await getSnapshot(workspace);
      workspaceStore.update((v) => {
        return {
          ...v,
          handlePath: res,
          workspace: workspace,
          snapshot,
        };
      });
      StoreWorkspace.validateAll();
    }
  };

  const getWorkspaceFile = async (filePath: string) => {
    const req: FileRequest = { filePath, encoding: 'sjis' };
    const fileContent = await invoke<string>('read_file', { req });
    const jsonStr = FileUtil.unZip(fileContent);
    return jsonStr;
  };

  export const loadWorkspaceFile = async (filePath: string) => {
    const workspaceSrc = await getWorkspaceFile(filePath);
    const workspace: StoreWorkspace.Props = JSON.parse(workspaceSrc);
    if (!validateWorkspaceGen(workspace.gen)) return;
    const snapshot = await getSnapshot(workspace);
    workspaceStore.update((curr) => {
      curr.workspace = workspace;
      curr.handlePath = filePath;
      curr.snapshot = snapshot;
      return curr;
    });
    StoreWorkspace.validateAll();
    ToastUtil.disp({ text: 'Project loaded successfully.' });
  };
}
export default FileUtil;
