# File System API (`$fs`)

`$fs` is available only with the Pro capability. File operations can read or change the user's machine. Inspect the target and intended effect before generating code; do not guess paths or delete/overwrite data without a clear request. `get_work_context` reports whether `$fs` is currently injected.

## Read and inspect

- `exists(path)`, `glob(pattern)`, `stat(path)`, and `readDir(dir)` inspect paths. `stat` returns `size`, `isFile`, `isDir`, and optional `createdAt` and `modifiedAt` timestamps.
- `readText(filePath, encoding?)` reads UTF-8 by default; `sjis` is also supported. It requires an absolute path to a regular file no larger than 50 MiB.
- `tailText(filePath, lineCount, encoding?)` reads the final lines. The path must be absolute and the count must be a non-negative integer; zero returns an empty string after validating those arguments, without opening the path. For a positive count, the target must be a regular file and the scanned tail must not exceed 50 MiB. It reads backward in chunks, so the whole file may be larger than 50 MiB when the requested tail is small.

```ts
if (await $fs.exists(filePath)) {
  const info = await $fs.stat(filePath);
  if (info.isFile) $println(await $fs.tailText(filePath, 20));
}
```

## Direct changes

`saveText`, `copyFile`, `makeDir`, `deleteFile`, `deleteDir`, `renameFile`, and `renameDir` perform direct file-system operations. Paths must be absolute. Rename takes the existing target path and a new name within the same directory, not a destination path. Existing directories passed to `makeDir` are left as-is. These operations are not grouped into a transaction.

## Transaction API

`useTransaction()` creates a Work-session virtual file transaction and may be called only once per worker session. It returns synchronous staged operations plus `openText`, which asynchronously returns a branded, opaque token and current content. Do not construct, persist, or alter tokens; pass a token only to operations for the file opened in this transaction. `updateText(token, content)`, `copyFileByToken(token, dest)`, `deleteFileByToken(token)`, and `renameFileByToken(token, newName)` operate on the file identified by a token. Path-based alternatives include `copyFile(from, dest)`, `deleteFile(filePath)`, and `renameFile(targetFilePath, newFileName)`. The transaction also provides `makeDir`, `deleteDir`, `saveText`, and `openText`. The transaction is presented to the user in Trace Kernel's transaction review UI after the Work finishes; it is not committed merely because the Work returns. Prefer it when several related changes must be reviewed and applied together.

```ts
const tx = $fs.useTransaction();
const opened = await tx.openText(filePath);
tx.updateText(opened.token, opened.content + '\n追加行');
```

Avoid claiming that a transaction is committed until the Work's normal transaction workflow has completed successfully. Do not call `useTransaction()` again in the same worker session.
