import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { Store } from "@tauri-apps/plugin-store";
import type StoreLicense from "../../../../store/storeLIcense";

namespace LicenseUtil {

    // noble 設定
    ed.hashes.sha512 = sha512;

    export type Payload = { i: string, n: string, p: string, f: string[] };

    // アプリに埋め込む公開鍵（base64）
    const PUBLIC_KEY_BASE64 = "vci3pYW/kOt3mut40G/IrL+u6zECsQr5w3wN6sROyys=";
    // v1.eyJ2IjoxLCJuIjoiZmo2ODA2ZXgjMzc0OSIsInAiOiJ0ayIsImYiOlsiY29yZSIsImFkdmFuY2VkIl0sImkiOjE3NjgzOTQ1Mjl9.UPNg-ZBzIOa4sk4ZwrEd5-MzeKDB3RBV8BwTaw4jJK2k-fEymNluux2mFOCYlmTYvuf2IzyhdJ7um5oHzPZlDQ
    const publicKey = Uint8Array.from(
        atob(PUBLIC_KEY_BASE64),
        c => c.charCodeAt(0)
    );

    const base64urlDecode = (str: string): Uint8Array => {
        str = str.replace(/-/g, "+").replace(/_/g, "/");
        const pad = str.length % 4;
        if (pad) str += "=".repeat(4 - pad);

        return Uint8Array.from(atob(str), c => c.charCodeAt(0));
    }

    export const parseActivateInfoFromProductKey = async (productKey: string): Promise<Payload> => {
        // 1. split
        const parts = productKey.split(".");
        if (parts.length !== 3) {
            throw new Error("License format is invalid");
        }

        const [version, payloadB64, sigB64] = parts;

        // 2. version check
        if (version !== "v1") {
            throw new Error("Unsupported license version");
        }

        // 3. decode
        const payloadBytes = base64urlDecode(payloadB64);
        const signature = base64urlDecode(sigB64);

        // 4. verify
        const valid = await ed.verify(signature, payloadBytes, publicKey);
        if (!valid) {
            throw new Error("License signature is invalid");
        }

        // 5. payload parse
        const payloadJson = new TextDecoder().decode(payloadBytes);
        const payload = JSON.parse(payloadJson);
        // console.log(JSON.stringify(payload));

        // 6. payload validation
        if (payload.p !== "tk") {
            throw new Error("License is for a different product");
        }

        if (!Array.isArray(payload.f)) {
            throw new Error("Invalid license payload");
        }

        // 7. 成功
        return payload
    }

    export const saveLicense = async (productKey: string) => {
        const store = await Store.load("license.json");
        await store.set("key", productKey);
        await store.save();
    }

    export const loadLicenseOnStartup = async () => {
        const store = await Store.load("license.json");
        try {
            const productKey: string | undefined = await store.get("key");
            if (!productKey) return null;

            return await parseActivateInfoFromProductKey(productKey);
        } catch {
            await store.delete("key");
            await store.save();
            return null;
        }
    }

    export const getConvertedLicenseFromPayload = (payload: Payload): StoreLicense.Props => {
        const displayId = payload.n;
        const dateObj = new Date(Number.parseInt(payload.i) * 1000);
        const date = dateObj.toISOString().slice(0, 10);
        return { displayId, date };
    }
}
export default LicenseUtil;