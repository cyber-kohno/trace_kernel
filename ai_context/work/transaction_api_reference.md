# Trace Kernel Transaction API リファレンス (Draft)

Trace Kernelでは、ファイルシステムへの変更操作を即座に実環境へ反映するのではなく、「トランザクション」として仮想ファイルシステム（VFS）上に予約（オーダー）し、最終的に整合性や競合を検証（Verify）した上で一括適用・コミットする仕組みを提供しています。

本ドキュメントでは、スクリプト実行中に利用可能な `$fs.useTransaction()` 経由で取得できる [TransactionAPI](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#12-24) の各メソッドの仕様と、VFS上で行われる検証ロジックについて解説します。

---

## 共通する概念・仕様

*   **VFS（Virtual File System）による論理検証**:
    メソッドを呼び出した際、実ファイルシステムへの即時反映は行われません。代わりにVFS上に「意図（intent）」が記録され、その時点で既存のオーダーとの論理的な競合（例: 削除済みファイルを更新しようとしていないか、作成予定のディレクトリとファイルパスが衝突していないか等）がチェックされます。
*   **FileToken**:
    [openText](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#31-34) 等でファイルを読み込んだ際に発行される識別子です。一度開いたファイル（チェックアウト状態）への変更や操作は、パス指定ではなく必ずこのTokenを経由する必要があります。

---

## API仕様詳細

### 📁 ディレクトリ操作

#### [makeDir(dirPath: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#28-31)
ディレクトリ作成を予約します。

*   **引数**:
    *   `dirPath`: 作成するディレクトリのパス
*   **概要**:
    指定したパスにディレクトリを作成するオーダーを積みます。
*   **VFSでの検証（エラー条件）**:
    *   同トランザクション内で既に該当ディレクトリを削除予約（[delete](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#46-49)）している場合はエラーとなります。
    *   指定したパスが、既にファイルとして予約・作成されている場合はエラーとなります。
    *   親パスが「ファイル」としてVFSに存在している場合（ファイルの下にディレクトリを作ろうとした場合）もエラーとなります。
    *   ※冪等性が考慮されており、既にディレクトリの作成予約がある場合はスキップされます。

---

### 📄 ファイル読み込み・更新・保存

#### [openText(filePath: string, encoding: "utf8" | "sjis"): Promise<{ token: FileToken; content: string; }>](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#31-34)
テキストファイルを実FSから読み込み、VFS上でチェックアウト状態（変更可能状態）にします。

*   **引数**:
    *   `filePath`: 読み込むファイルのパス
    *   `encoding`: 文字エンコーディング（`"utf8"` または `"sjis"`）
*   **返り値**:
    指定ファイルに対する [FileToken](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/runtime/runtimeUtil.ts#58-62) と、ファイルの内容（`content`）。
*   **概要**:
    対象の内容を取得すると同時に、これ以降の同ファイルに対する操作（更新、リネーム、削除、コピー等）をToken経由に制限します。
*   **VFSでの検証（エラー条件）**:
    *   既に同トランザクション内で対象のパスに対する操作履歴（作成や削除、あるいは既にopen済）がある場合は即エラーとなります。

#### [updateText(token: FileToken, content: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#37-40)
[openText](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#31-34) 等で取得したTokenを用いて、ファイル内容の更新を予約します。

*   **引数**:
    *   `token`: [openText](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#31-34) などで取得した対象ファイルの識別子
    *   `content`: 更新するテキスト内容
*   **概要**:
    ファイルの内容を上書きします。VFS上でのintent（意図）は `modify`（変更）に設定されます。
*   **VFSでの検証（エラー条件）**:
    *   Tokenが無効、または実体（textCache）が未保持の場合はエラーとなります。
    *   該当のToken（ファイル）が同トランザクション内で既に削除（[delete](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#46-49)）されている場合はエラーとなります。

#### [saveText(filePath: string, content: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#34-37)
新しいテキストファイルの作成（保存）を予約します。

*   **引数**:
    *   `filePath`: 作成するファイルのパス
    *   `content`: ファイルに書き込むテキスト内容（エンコーディングは `utf8` 固定）
*   **概要**:
    指定パスに新規ファイルを作成するオーダーを積みます。VFS上でのintentは [create](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/runtime/runtimeUtil.ts#63-66) に設定され、新たなTokenが発行されます。
*   **VFSでの検証（エラー条件）**:
    *   既に同パスに対して「作成」「変更（open済）」「削除」のいずれかの履歴がある場合はエラーとなります。
    *   他の書き込み操作（renameやcopy等）によってパスが「予約済（reserved）」となっている場合はエラーとなります。
    *   ファイルの作成先となる親・祖先ディレクトリが、同トランザクション内で「削除予約（delete）」されている場合はエラーとなります。

---

### 📋 ファイルのコピー・削除・リネーム

#### [copyFile(from: string, dest: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#40-43)
#### [copyFileByToken(token: FileToken, dest: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#43-46)
指定したファイルを別のパスへコピー・複製する予約を行います。

*   **引数**:
    *   `from` / `token`: コピー元のファイルパス、または [FileToken](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/runtime/runtimeUtil.ts#58-62)
    *   `dest`: コピー先のファイルパス
*   **概要**:
    ファイルを `dest` に複製します。既に [openText](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#31-34) で読み込み済みのファイルをコピーする場合は、必ずToken経由（[copyFileByToken](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#43-46)）で行う必要があります。
*   **VFSでの検証（エラー条件）**:
    *   コピー先（`dest`）が既に操作予約（予約済 or トランザクション履歴あり）されている場合はエラーとなります。
    *   コピー先祖先ディレクトリが削除予約（delete）されている場合はエラーとなります。
    *   （パス指定の場合）コピー元が既にopen済（snapshotあり）の場合は、「Token経由でコピーしてください」というエラーになります。
    *   （Token指定の場合）ファイルにすでに手元で未確定の変更・削除意図（intentあり）がある場合は、「pending changesがあるファイルはコピーできない」というエラーになります。

#### [deleteFile(filePath: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#46-49)
#### [deleteFileByToken(token: FileToken): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#49-53)
ファイルの削除を予約します。

*   **引数**:
    *   `filePath` / `token`: 削除するファイルのパス、または [FileToken](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/runtime/runtimeUtil.ts#58-62)
*   **概要**:
    対象パス（またはTokenに紐づくパス）のファイルを削除します。
*   **VFSでの検証（エラー条件）**:
    *   同トランザクション内で「新規作成（create）」されたばかりのファイルを削除しようとするとエラーとなります。
    *   既に削除予約済みの場合はエラーとなります。
    *   （パス指定の場合）既に対象が [openText](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#31-34) 等で開かれている場合は、Token経由で削除しないとエラーとなります。

#### [renameFile(targetFilePath: string, newFileName: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#53-56)
#### [renameFileByToken(token: FileToken, newName: string): void](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/util/fs/tx/dclFSTransaction.ts#56-59)
ファイルの名前変更（リネーム）を予約します。

*   **引数**:
    *   `targetFilePath` / `token`: リネーム対象のファイルのパス、または [FileToken](file:///c:/Users/funny/OneDrive/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/rust/trace_kernel/app/src/app/contents/detail/program/runtime/runtimeUtil.ts#58-62)
    *   `newFileName` / `newName`: 新しい**ファイル名**（ディレクトリの変更/移動は不可）
*   **概要**:
    ファイルを同じディレクトリ内で新しい名前に変更します。変更先のパスは予約（reservations）として管理されます。
*   **VFSでの検証（エラー条件）**:
    *   新しいファイル名にスラッシュやバックスラッシュ（パス区切り文字）が含まれる場合はエラー（※ディレクトリ移動不可）。
    *   新旧のファイル名（パス）が全く同じ場合はエラーとなります。
    *   同トランザクション内で「新規作成（create）」されたばかりのファイル、または「削除（delete）」されたファイルに対するリネームはエラーとなります。
    *   該当ファイルが既に別の名前にリネーム済みの場合はエラーとなります。
    *   変更先のパスが、既にトランザクション内で予約済み・作成済み、または別ファイルのリネーム先として使われている場合はエラーとなります。
