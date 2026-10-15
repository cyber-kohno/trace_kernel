import Pako from "pako";
import type { WorkspaceGeneration } from "../model/workspace";
import prepareWorkspaceLoad from "./prepare-workspace-load";

namespace WorkspaceCodec {
  /**
   * 文字列を圧縮する
   * @param baseStr 圧縮前の文字列
   * @returns 圧縮後の文字列
   */
  export const gZip = (baseStr: string) => {
    const encoder = new TextEncoder(); // 文字列をUint8Arrayにエンコードするために使用
    const textUint8Array = encoder.encode(baseStr);

    // gzip圧縮
    const compressed = Pako.gzip(textUint8Array); // Uint8ArrayをBase64文字列に変換
    const compressedBase64 = uint8ArrayToBase64(compressed);
    return compressedBase64;
  };
  // Uint8ArrayをBase64にエンコードするヘルパー関数
  const uint8ArrayToBase64 = (buffer: Uint8Array) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  /**
   * 圧縮された文字列を復元する
   * @param baseStr 圧縮された文字列
   * @returns 復元後の文字列
   */
  export const unZip = (baseStr: string) => {
    const compressedFromBase64 = Uint8Array.from(atob(baseStr), (c) =>
      c.charCodeAt(0),
    );
    const text = Pako.inflate(compressedFromBase64, { to: "string" });
    // Pako can return undefined for a truncated stream without throwing.
    if (typeof text !== "string") {
      throw new Error("Workspace compression data is incomplete.");
    }
    return text;
  };

  export const prepareFile = (
    content: string,
    currentGen: WorkspaceGeneration,
  ) => prepareWorkspaceLoad(unZip(content), currentGen);
}
export default WorkspaceCodec;
