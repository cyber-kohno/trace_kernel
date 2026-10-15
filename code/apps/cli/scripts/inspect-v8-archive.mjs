import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const archiveFile = argument("--archive");
if (!archiveFile) throw new Error("Specify --archive <rusty_v8.lib>");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parseArchive = (file) => {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).toString() !== "!<arch>\n")
    throw new Error("Unsupported archive format");
  const members = [];
  let longNames;
  for (let offset = 8; offset + 60 <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + 60),
      raw = header.subarray(0, 16).toString().trim(),
      size = Number(header.subarray(48, 58).toString().trim());
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + 60 + size > bytes.length
    )
      throw new Error("Invalid archive member");
    const data = bytes.subarray(offset + 60, offset + 60 + size);
    if (raw === "//") longNames = data;
    let name = raw;
    if (/^\/\d+$/.test(raw)) {
      if (!longNames) throw new Error("Missing archive long names");
      const start = Number(raw.slice(1));
      let end = longNames.indexOf(0, start);
      if (end < 0) end = longNames.indexOf(10, start);
      if (end < 0) throw new Error("Invalid archive name");
      name = longNames.subarray(start, end).toString().replace(/\/$/, "");
    }
    if (!["/", "//", "/SYM64/"].includes(raw)) members.push({ name, data });
    offset += 60 + size + (size % 2);
  }
  return { bytes, members };
};
const archive = parseArchive(archiveFile);
const forbidden = archive.members.filter((member) =>
  /[\\/]v8[\\/]libm[\\/]|(?:branred|sincostab|s_sin)\.(?:obj|o)$/i.test(
    member.name,
  ),
);
const argsFile = argument("--gn-args"),
  gnArgs = argsFile ? readFileSync(argsFile, "utf8") : null;
const noLibm =
  gnArgs != null && /^v8_use_libm_trig_functions\s*=\s*false\s*$/m.test(gnArgs);
const gnBoolean = (name) => {
  const value = gnArgs?.match(new RegExp(`^${name}\\s*=\\s*(true|false)\\s*$`, "m"));
  return value ? value[1] === "true" : null;
};
const binaryFile = argument("--binary"),
  referenceFile = argument("--reference-library");
let tableCheck = null;
if (binaryFile && referenceFile) {
  const reference = parseArchive(referenceFile),
    member = reference.members.find((member) =>
      /[\\/]libm[\\/]sincostab\.obj$/i.test(member.name),
    );
  if (!member) throw new Error("Reference archive does not contain sincostab");
  const data = member.data,
    big = data.readUInt16LE(0) === 0 && data.readUInt16LE(2) === 0xffff;
  const count = big ? data.readUInt32LE(44) : data.readUInt16LE(2),
    header = big ? 56 : 20 + data.readUInt16LE(16);
  let sample;
  for (let index = 0; index < count; index++) {
    const section = header + index * 40,
      name = data
        .subarray(section, section + 8)
        .toString()
        .replace(/\0.*$/s, ""),
      size = data.readUInt32LE(section + 16),
      offset = data.readUInt32LE(section + 20);
    if (name.startsWith(".rdata") && size >= 256) {
      sample = data.subarray(offset, offset + 256);
      break;
    }
  }
  if (!sample?.some((byte) => byte !== 0))
    throw new Error("Missing reference constant-table sample");
  const binary = readFileSync(binaryFile);
  tableCheck = {
    binarySha256: sha256(binary),
    referenceLibrarySha256: sha256(reference.bytes),
    sampleSha256: sha256(sample),
    sampleBytes: sample.length,
    locatedAt: binary.indexOf(sample),
  };
}
const report = {
  formatVersion: 1,
  archive: {
    sha256: sha256(archive.bytes),
    bytes: archive.bytes.length,
    memberCount: archive.members.length,
  },
  gnArgsSha256: gnArgs == null ? null : sha256(gnArgs),
  noLibmRequested: noLibm,
  gnConfiguration: {
    v8_use_libm_trig_functions: gnBoolean("v8_use_libm_trig_functions"),
    v8_enable_temporal_support: gnBoolean("v8_enable_temporal_support"),
    use_custom_libcxx: gnBoolean("use_custom_libcxx"),
    rusty_v8_enable_simdutf: gnBoolean("rusty_v8_enable_simdutf"),
  },
  forbiddenMembers: forbidden.map((member) => member.name),
  tableCheck,
};
if (
  process.argv.includes("--expect-no-libm") &&
  (!noLibm || forbidden.length || tableCheck?.locatedAt >= 0)
)
  throw new Error("No-libm verification failed: " + JSON.stringify(report));
const output =
  argument("--output") ?? path.join(app, "generated/v8-archive-report.json");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
