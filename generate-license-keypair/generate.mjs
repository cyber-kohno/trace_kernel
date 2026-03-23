import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { randomBytes } from "crypto";

// ★ 最新版ではここ
ed.hashes.sha512 = sha512;

const privateKey = randomBytes(32);
const publicKey = await ed.getPublicKey(privateKey);

console.log("=== PRIVATE KEY (KEEP SECRET) ===");
console.log(Buffer.from(privateKey).toString("base64"));

console.log("\n=== PUBLIC KEY (EMBED IN APP) ===");
console.log(Buffer.from(publicKey).toString("base64"));
