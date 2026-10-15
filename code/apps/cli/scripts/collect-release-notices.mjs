import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(app, "generated");
execFileSync(
  process.execPath,
  [path.join(app, "scripts/inspect-release.mjs")],
  { stdio: "inherit", windowsHide: true },
);
const audit = JSON.parse(
  readFileSync(path.join(generated, "release-audit/report.json"), "utf8"),
);
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--offline",
      "--locked",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
      "--format-version",
      "1",
      "--manifest-path",
      path.join(app, "Cargo.toml"),
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
  ),
);
const root = path.join(generated, "release-inputs", randomUUID());
mkdirSync(root, { recursive: true });
const hashes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const written = [];
const write = (relative, bytes, origin) => {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep))
    throw new Error("Release path escaped staging root");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  const item = {
    path: relative.replaceAll("\\", "/"),
    bytes: Buffer.byteLength(bytes),
    sha256: hashes(bytes),
    origin,
  };
  written.push(item);
  return item.path;
};
const v8ReceiptPath = path.join(generated, "cli-no-libm-receipt.json");
let v8Receipt = null;
if (existsSync(v8ReceiptPath)) {
  const candidate = JSON.parse(readFileSync(v8ReceiptPath, "utf8"));
  if (
    candidate.noLibmRequested === true &&
    candidate.forbiddenMembers?.length === 0 &&
    candidate.gnConfiguration?.v8_enable_temporal_support === false &&
    candidate.tableCheck?.locatedAt === -1 &&
    candidate.tableCheck.binarySha256 === audit.binary.sha256
  ) {
    v8Receipt = candidate;
    write(
      "build-provenance/v8-no-libm.json",
      JSON.stringify(candidate, null, 2) + "\n",
      "Verified source-built V8 archive and matching release executable",
    );
  }
}
const cache = path.join(generated, "notice-downloads");
mkdirSync(cache, { recursive: true });
async function download(url, optional = false) {
  const file = path.join(cache, hashes(url) + ".bin");
  if (existsSync(file)) return readFileSync(file);
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
      headers: { "User-Agent": "Trace-Kernel-release-notice-collection" },
      signal: AbortSignal.timeout(20000),
    });
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2)
      break;
    await response.arrayBuffer();
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (optional && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`Notice download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(file, bytes);
  return bytes;
}
const trees = new Map();
async function githubTree(repository, revision) {
  const key = repository + "@" + revision;
  if (!trees.has(key))
    trees.set(
      key,
      (async () => {
        const tree = JSON.parse(
          (
            await download(
              `https://api.github.com/repos/${repository}/git/trees/${revision}?recursive=1`,
            )
          ).toString(),
        );
        if (tree.truncated) throw new Error(`Incomplete upstream tree: ${key}`);
        return tree;
      })(),
    );
  return trees.get(key);
}
const isNotice = (filename) =>
  /^(license|licence|copying|notice|copyright)(?:$|[._-])|^ThirdPartyNoticeText\.txt$/i.test(
    filename,
  ) && !/\.(rs|cc|cpp|c|h|hpp|py|sh|js|mjs|ts|toml|json)$/i.test(filename);
const components = [];
const lockChecksums = new Map(
  readFileSync(path.join(app, "Cargo.lock"), "utf8")
    .split(/\[\[package\]\]/)
    .flatMap((block) => {
      const name = block.match(/^name = "([^"]+)"/m)?.[1],
        version = block.match(/^version = "([^"]+)"/m)?.[1],
        checksum = block.match(/^checksum = "([a-f0-9]{64})"/m)?.[1];
      return name && version && checksum
        ? [[`${name}@${version}`, checksum]]
        : [];
    }),
);
const verifyArchiveSource = (archive, sourceRoot, prefix) => {
  const tar = gunzipSync(archive),
    text = (buffer) => buffer.toString("utf8").replace(/\0.*$/s, "");
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const base = text(header.subarray(0, 100)),
      directory = text(header.subarray(345, 500)),
      name = directory ? directory + "/" + base : base;
    const size = parseInt(text(header.subarray(124, 136)).trim(), 8),
      type = header[156];
    if (!Number.isSafeInteger(size) || offset + 512 + size > tar.length)
      throw new Error("Invalid source archive entry");
    if (type === 0 || type === 48) {
      if (!name.startsWith(prefix + "/") || name.split("/").includes(".."))
        throw new Error("Unexpected source archive path");
      const relative = name.slice(prefix.length + 1),
        actual = readFileSync(path.join(sourceRoot, relative));
      if (!actual.equals(tar.subarray(offset + 512, offset + 512 + size)))
        throw new Error(
          `Modified MPL source must be handled explicitly: ${prefix}/${relative}`,
        );
    } else if (type !== 53)
      throw new Error(`Unsupported source archive entry type: ${type}`);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
};
for (const pkg of audit.rust.filter((pkg) => pkg.registry)) {
  const actual = metadata.packages.find(
    (item) => item.name === pkg.name && item.version === pkg.version,
  );
  const sourceRoot = path.dirname(actual.manifest_path),
    id = `rust-${pkg.name}-${pkg.version}`;
  const component = {
    id,
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    notices: [],
    sourceUrl: pkg.sourceArchive,
  };
  for (const file of pkg.files) {
    const bytes = readFileSync(path.join(sourceRoot, file.path));
    if (hashes(bytes) !== file.sha256)
      throw new Error(`Notice changed since inventory: ${id}`);
    component.notices.push(
      write(
        `licenses/${id}/${file.path}`,
        bytes,
        `${pkg.name}-${pkg.version}.crate/${file.path}`,
      ),
    );
  }
  if (!pkg.files.some((file) => !file.path.includes("/"))) {
    if (pkg.name === "deno_core_icudata") {
      // This crate contains no standalone LICENSE even in its pinned repository.
      // Preserve the Deno MIT text for the wrapper and defer the data notice to
      // the pinned ICU component explicitly identified by the package README.
      const url =
        "https://raw.githubusercontent.com/denoland/deno/0c071246a412575e07423263404a5d13e7ed6aa2/LICENSE.md";
      component.notices.push(
        write(`licenses/${id}/DENO-LICENSE-MIT`, await download(url), url),
      );
      component.notices.push(
        write(
          `licenses/${id}/SOURCE-ORIGIN.md`,
          readFileSync(path.join(sourceRoot, "README.md")),
          `${pkg.name}-${pkg.version}.crate/README.md`,
        ),
      );
      component.noticeReview =
        "The data origin is ICU; include the pinned ICU license in addition to the MIT wrapper metadata. Review upstream attribution before public release.";
      const dataHash = hashes(
        readFileSync(path.join(sourceRoot, "src/icudtl.dat")),
      );
      component.dataOriginVerification = {
        sha256: dataHash,
        icuRevision: "ee5f27adc28bd3f15b2c293f726d14d2e336cbd5",
        matchesPinnedIcuData:
          dataHash ===
          "1cf67874b5a87a8363a86fb3f81e3cbbed54d389062dab8fb52308d5cf8c8612",
      };
    } else if (pkg.name === "selectors") {
      const url = "https://www.mozilla.org/media/MPL/2.0/index.txt";
      const sourceFile = existsSync(path.join(sourceRoot, "lib.rs"))
        ? "lib.rs"
        : "src/lib.rs";
      const source = readFileSync(path.join(sourceRoot, sourceFile), "utf8");
      const header = source.match(/^\/\*[\s\S]*?\*\//)?.[0];
      if (!header?.includes("https://mozilla.org/MPL/2.0/"))
        throw new Error("Missing selectors source license declaration");
      component.notices.push(
        write(`licenses/${id}/LICENSE-MPL-2.0`, await download(url), url),
      );
      component.notices.push(
        write(
          `licenses/${id}/SOURCE-NOTICE.txt`,
          header,
          `${pkg.name}-${pkg.version}.crate/${sourceFile}`,
        ),
      );
    } else if (pkg.name === "mac") {
      const readme = readFileSync(path.join(sourceRoot, "README.md"), "utf8");
      if (!readme.includes("MIT/Apache-2.0, like rust itself"))
        throw new Error("Unrecognized mac license declaration");
      const url = "https://www.apache.org/licenses/LICENSE-2.0.txt";
      component.notices.push(
        write(`licenses/${id}/LICENSE-APACHE`, await download(url), url),
      );
      component.notices.push(
        write(
          `licenses/${id}/SOURCE-NOTICE.md`,
          readme,
          `${pkg.name}-${pkg.version}.crate/README.md`,
        ),
      );
      component.licenseSelection =
        "Apache-2.0 (README declares Rust-style MIT/Apache-2.0 dual licensing)";
    } else if (pkg.name === "fxhash" || pkg.name === "servo_arc") {
      const url = "https://www.apache.org/licenses/LICENSE-2.0.txt";
      component.notices.push(
        write(`licenses/${id}/LICENSE-APACHE`, await download(url), url),
      );
      const source = readFileSync(path.join(sourceRoot, "lib.rs"), "utf8");
      const header = source.match(/^(?:\/\/[^\n]*\n)+/)?.[0];
      if (
        !header?.includes("Rust Project Developers") ||
        !header.includes("Apache License")
      )
        throw new Error(`Unrecognized Rust source notice: ${id}`);
      component.notices.push(
        write(
          `licenses/${id}/SOURCE-NOTICE.txt`,
          header,
          `${pkg.name}-${pkg.version}.crate/lib.rs`,
        ),
      );
      component.licenseSelection =
        "Apache-2.0 (source header offers Apache-2.0 OR MIT)";
    } else {
      const vcsPath = path.join(sourceRoot, ".cargo_vcs_info.json"),
        vcs = existsSync(vcsPath)
          ? JSON.parse(readFileSync(vcsPath, "utf8"))
          : null;
      const revision =
        vcs?.git?.sha1 ??
        (pkg.name === "mac"
          ? "66afc663b68a65633ea165c742b5a9c6734581c2"
          : null);
      const match = pkg.repository
        ?.replace(/\.git$/, "")
        .match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/);
      if (!revision || !match)
        throw new Error(`No pinned upstream notice source for ${id}`);
      component.upstream = { repository: match[1], revision };
      const tree = await githubTree(match[1], revision),
        prefix = vcs?.path_in_vcs ?? "";
      const parents = new Set(["", prefix]);
      let current = prefix;
      while (current.includes("/")) {
        current = current.slice(0, current.lastIndexOf("/"));
        parents.add(current);
      }
      const notices = tree.tree.filter(
        (item) =>
          item.type === "blob" &&
          isNotice(path.posix.basename(item.path)) &&
          parents.has(
            path.posix.dirname(item.path) === "."
              ? ""
              : path.posix.dirname(item.path),
          ),
      );
      if (!notices.length) {
        if (!["sys_traits", "sys_traits_macros"].includes(pkg.name))
          throw new Error(`Missing pinned upstream license for ${id}`);
        component.noticeReview =
          "The published crate and pinned repository declare MIT but omit a license/attribution text. Public distribution requires resolving this upstream notice; this is not a replacement license.";
        component.notices.push(
          write(
            `licenses/${id}/UNRESOLVED-NOTICE.json`,
            JSON.stringify(
              {
                name: pkg.name,
                version: pkg.version,
                declaredLicense: pkg.license,
                authors: actual.authors,
                repository: pkg.repository,
                revision,
                review: component.noticeReview,
              },
              null,
              2,
            ) + "\n",
            "Original package metadata; unresolved upstream license notice",
          ),
        );
      }
      for (const notice of notices) {
        const url = `https://raw.githubusercontent.com/${match[1]}/${tree.sha}/${notice.path}`;
        component.notices.push(
          write(
            `licenses/${id}/upstream/${notice.path}`,
            await download(url),
            url,
          ),
        );
      }
    }
  }
  if (pkg.license?.includes("MPL-2.0")) {
    const archive = path.resolve(
        sourceRoot,
        "../../../cache",
        path.basename(path.dirname(sourceRoot)),
        `${pkg.name}-${pkg.version}.crate`,
      ),
      bytes = readFileSync(archive);
    if (hashes(bytes) !== lockChecksums.get(`${pkg.name}@${pkg.version}`))
      throw new Error(`Source archive checksum mismatch: ${id}`);
    verifyArchiveSource(bytes, sourceRoot, `${pkg.name}-${pkg.version}`);
    component.source = write(
      `third-party-sources/${pkg.name}-${pkg.version}.crate`,
      bytes,
      pkg.sourceArchive,
    );
  }
  components.push(component);
}
const core = path.resolve(app, "../../packages/runtime-core");
for (const pkg of audit.npm) {
  const id = `npm-${pkg.name.replaceAll("/", "--")}-${pkg.version}`,
    component = {
      id,
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      notices: [],
    };
  for (const file of pkg.files) {
    const bytes = readFileSync(
      path.join(core, "node_modules", pkg.name, file.path),
    );
    if (hashes(bytes) !== file.sha256)
      throw new Error(`npm notice changed: ${id}`);
    component.notices.push(
      write(
        `licenses/${id}/${file.path}`,
        bytes,
        `${pkg.name}@${pkg.version}/${file.path}`,
      ),
    );
  }
  if (pkg.name === "pako") {
    const header = readFileSync(
      path.join(core, "node_modules/pako/lib/zlib/adler32.js"),
      "utf8",
    ).match(/\/\/ \(C\) 1995[\s\S]*?(?=\nconst adler32)/)?.[0];
    if (!header?.includes("This notice may not be removed"))
      throw new Error("Missing pako zlib attribution");
    component.notices.push(
      write(
        `licenses/${id}/LICENSE-ZLIB.txt`,
        header,
        "pako@2.1.0/lib/zlib/adler32.js",
      ),
    );
  }
  components.push(component);
}

// V8's C++ license trees are absent from the Cargo tarball. Collect pinned
// upstream notices conservatively, including potential build dependencies.
const v8tree = await githubTree("denoland/rusty_v8", "v150.4.0");
const submodules = v8tree.tree.filter(
  (item) =>
    item.type === "commit" &&
    (item.path === "v8" || item.path.startsWith("third_party/")),
);
const modules = (
  await download(
    `https://raw.githubusercontent.com/denoland/rusty_v8/${v8tree.sha}/.gitmodules`,
  )
).toString();
const urls = new Map(
  [...modules.matchAll(/path = ([^\n]+)\n\s*url = ([^\n]+)/g)].map((match) => [
    match[1].trim(),
    match[2].trim().replace(/\.git$/, ""),
  ]),
);
for (const module of submodules) {
  // Internal GN Rust dependencies need a separate inventory when enabled.
  // This CLI build disables Temporal; Cargo dependencies are collected above.
  if (module.path === "third_party/rust") continue;
  const repository = urls.get(module.path);
  if (!repository) throw new Error(`Unknown V8 submodule: ${module.path}`);
  const id = "v8-" + module.path.replaceAll("/", "--"),
    component = {
      id,
      name: module.path,
      version: module.sha,
      license: "See upstream texts",
      notices: [],
      upstream: { repository, revision: module.sha },
    };
  if (module.path === "v8") {
    if (v8Receipt) {
      component.buildVerification = "build-provenance/v8-no-libm.json";
      component.noticeBasis =
        "This matching executable uses source-built V8 with v8_use_libm_trig_functions=false. The archive contains no glibc libm objects and the old sin/cos table sample is absent from the executable. Upstream glibc license texts remain in this conservative source-tree notice inventory; their inclusion does not indicate that glibc libm is linked.";
    } else {
      component.noticeReview = `CLI SHA-256 ${audit.binary.sha256} has no matching verified no-libm build receipt. The default prebuilt x64 V8 includes LGPL-2.1-or-later glibc libm objects. Public release requires a verified no-libm rebuild or an LGPL-compliant distribution design.`;
    }
  }
  const github = repository.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/);
  if (github) {
    const tree = await githubTree(github[1], module.sha);
    const notices = tree.tree.filter(
      (item) =>
        item.type === "blob" && isNotice(path.posix.basename(item.path)),
    );
    for (const file of notices) {
      const url = `https://raw.githubusercontent.com/${github[1]}/${tree.sha}/${file.path}`;
      component.notices.push(
        write(`licenses/${id}/${file.path}`, await download(url), url),
      );
    }
  } else if (repository.startsWith("https://chromium.googlesource.com/")) {
    const text = (
      await download(`${repository}/+/${module.sha}/?format=JSON`)
    ).toString();
    const tree = JSON.parse(text.replace(/^\)\]\}'\n/, ""));
    const names = tree.entries
      .filter((item) => item.type === "blob" && isNotice(item.name))
      .map((item) => item.name);
    if (module.path === "third_party/icu") names.push("icu4c/LICENSE");
    for (const name of new Set(names)) {
      const url = `${repository}/+/${module.sha}/${name}?format=TEXT`,
        bytes = await download(url, true);
      if (bytes)
        component.notices.push(
          write(
            `licenses/${id}/${name}`,
            Buffer.from(bytes.toString(), "base64"),
            url,
          ),
        );
    }
    if (
      module.path === "third_party/partition_alloc" &&
      !component.notices.length
    ) {
      // The standalone repository is an export of a Chromium subtree. Match
      // its exact tree to GitOrigin-RevId before using the enclosing LICENSE.
      const gitiles = async (url) =>
        JSON.parse((await download(url)).toString().replace(/^\)\]\}'\n/, ""));
      const commitUrl = `${repository}/+/${module.sha}?format=JSON`,
        exported = await gitiles(commitUrl),
        origins = [
          ...exported.message.matchAll(/^GitOrigin-RevId: ([a-f0-9]{40})$/gm),
        ];
      if (exported.commit !== module.sha || origins.length !== 1)
        throw new Error("Unrecognized PartitionAlloc export origin");
      const origin = origins[0][1],
        chromium = "https://chromium.googlesource.com/chromium/src",
        sourcePath = "base/allocator/partition_allocator",
        subtreeUrl = `${chromium}/+/${origin}/${sourcePath}?format=JSON`,
        subtree = await gitiles(subtreeUrl);
      if (!/^[a-f0-9]{40}$/.test(exported.tree) || subtree.id !== exported.tree)
        throw new Error(
          "PartitionAlloc export differs from the Chromium origin subtree",
        );
      const originRootUrl = `${chromium}/+/${origin}/?format=JSON`,
        originRoot = await gitiles(originRootUrl),
        licenseEntry = originRoot.entries.find(
          (entry) => entry.name === "LICENSE" && entry.type === "blob",
        );
      if (!licenseEntry)
        throw new Error("Missing Chromium origin LICENSE blob");
      // The GitHub mirror supplies the same commit's file; verify its Git blob
      // ID against the original Gitiles tree rather than trusting mirror text.
      const url = `https://raw.githubusercontent.com/chromium/chromium/${origin}/LICENSE`,
        license = await download(url),
        licenseBlob = createHash("sha1")
          .update(`blob ${license.length}\0`)
          .update(license)
          .digest("hex");
      if (licenseBlob !== licenseEntry.id)
        throw new Error("Chromium LICENSE mirror blob mismatch");
      component.notices.push(
        write(`licenses/${id}/CHROMIUM-LICENSE`, license, url),
      );
      const provenance = {
        exportRevision: module.sha,
        exportTree: exported.tree,
        originRevision: origin,
        originPath: sourcePath,
        originTree: subtree.id,
        licenseBlobSha1: licenseBlob,
        licenseSha256: hashes(license),
        sources: {
          exportCommit: commitUrl,
          originSubtree: subtreeUrl,
          originRoot: originRootUrl,
          license: url,
        },
      };
      component.originVerification = provenance;
      component.notices.push(
        write(
          `licenses/${id}/PROVENANCE.json`,
          JSON.stringify(provenance, null, 2) + "\n",
          "Matched exported tree and Chromium origin subtree; verified LICENSE Git blob",
        ),
      );
      component.noticeBasis =
        "The pinned PartitionAlloc export tree matches its GitOrigin-RevId Chromium subtree. The enclosing LICENSE is from that exact origin revision and its mirror bytes match the original Git blob ID.";
    }
  } else throw new Error(`Unsupported upstream notice URL: ${repository}`);
  if (!component.notices.length)
    throw new Error(`No embedded V8 notice collected: ${module.path}`);
  components.push(component);
  console.log(`Collected V8 notices: ${module.path}`);
}
const icuComponent = components.find(
  (component) => component.id === "v8-third_party--icu",
);
const icuData = components.find(
  (component) => component.name === "deno_core_icudata",
);
if (!icuComponent || !icuData)
  throw new Error("ICU data attribution was not collected");
icuData.notices.push(...icuComponent.notices);
write(
  "THIRD-PARTY-NOTICES.txt",
  components
    .map(
      (component) =>
        `${component.name} ${component.version}\nLicense metadata: ${component.license}\n${component.licenseSelection ? component.licenseSelection + "\n" : ""}Notices: ${component.notices.join(", ")}\n${component.source ? "Included source: " + component.source + "\n" : ""}`,
    )
    .join("\n"),
  "Generated from fixed package metadata and collected upstream texts",
);
write(
  "THIRD-PARTY-SOURCES.md",
  "# Third-party sources\n\nSource archives are provided for the MPL dependency candidates. These are the unmodified registry packages verified against Cargo's package checksum. Each .crate is a gzip tar archive.\n\n" +
    components
      .filter((component) => component.source)
      .map(
        (component) =>
          `- ${component.name} ${component.version}: [${component.source}](${component.source}); ${component.sourceUrl}`,
      )
      .join("\n") +
    "\n\nOther upstream revisions and notice origins are recorded in third-party-manifest.json.\n",
  "Generated source availability index",
);
writeFileSync(
  path.join(root, "third-party-manifest.json"),
  JSON.stringify(
    {
      formatVersion: 1,
      binary: audit.binary,
      scope: audit.scope,
      components,
      files: written,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  path.join(generated, "release-inputs/latest.json"),
  JSON.stringify({
    root: path.relative(generated, root).replaceAll("\\", "/"),
  }) + "\n",
);
console.log(
  JSON.stringify(
    {
      components: components.length,
      noticeAndSourceFiles: written.length,
      root,
    },
    null,
    2,
  ),
);
