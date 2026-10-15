import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

// noble-ed25519 の必須設定
ed.hashes.sha512 = sha512;

// 環境変数から秘密鍵を取得（base64）
const PRIVATE_KEY_BASE64 = process.env.LICENSE_PRIVATE_KEY;
if (!PRIVATE_KEY_BASE64) {
  throw new Error("LICENSE_PRIVATE_KEY is not set");
}

// base64 → Uint8Array
const privateKey = Uint8Array.from(Buffer.from(PRIVATE_KEY_BASE64, "base64"));

// Base64URL エンコード関数
function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ライセンスキー発行関数
export async function issueLicenseKey(payload) {
  // 1. payload を JSON → bytes
  const json = JSON.stringify(payload);
  const message = new TextEncoder().encode(json);

  // 2. 署名生成
  const signature = await ed.sign(message, privateKey);

  // 3. ライセンスキー文字列化
  return ["v1", base64url(message), base64url(signature)].join(".");
}
