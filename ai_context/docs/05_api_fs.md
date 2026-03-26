# $fs API リファレンス

`$fs` は、ファイルシステムへの読み書きを行う関数群を提供する独自APIです。

操作方法は2種類あります。

| 方式 | 概要 |
|------|------|
| **直接操作** | 即時に実FSへ読み書きする非同期関数群 |
| **トランザクション操作** | 仮想FS上にオーダーを積み、確認後に一括コミット |

---

## 直接操作 API

全て非同期関数です。`await` が必要です。

```typescript
$fs.exists(path)
```

### 関数一覧

| 関数 | シグネチャ | 説明 |
|------|-----------|------|
| `exists` | `(path: string) => Promise<boolean>` | パスの存在チェック |
| `glob` | `(pattern: string) => Promise<string[]>` | パターン一致のパス一覧を取得 |
| `stat` | `(path: string) => Promise<FileStat>` | 作成日・更新日・ファイルサイズを取得 |
| `readDir` | `(dir: string) => Promise<{ name: string; isDir: boolean; }[]>` | ディレクトリ配下の要素一覧を取得 |
| `readBinary` | `(filePath: string) => Promise<ArrayBuffer>` | バイナリファイルを読み込む |
| `readText` | `(filePath: string, encoding: 'utf8' \| 'sjis') => Promise<string>` | テキストファイルを読み込む |
| `saveText` | `(filePath: string, content: string) => Promise<void>` | テキストファイルを保存（書き込み） |
| `copyFile` | `(src: string, dest: string) => Promise<void>` | ファイルをバイナリコピー |
| `makeDir` | `(dirPath: string) => Promise<void>` | ディレクトリを作成（存在の保証） |
| `deleteFile` | `(filePath: string) => Promise<void>` | ファイルを削除 |
| `deleteDir` | `(dirPath: string) => Promise<void>` | ディレクトリを削除（**中身が空の場合のみ可能**） |
| `renameFile` | `(targetFilePath: string, newFileName: string) => Promise<void>` | ファイル名を変更（同ディレクトリ内のみ） |
| `renameDir` | `(targetDirPath: string, newDirName: string) => Promise<void>` | ディレクトリ名を変更（同ディレクトリ内のみ） |

### コード例

```typescript
// テキストファイルの読み込み
const content = await $fs.readText(`${$env.ROOT}\\file.txt`, 'utf8');

// ファイルの存在チェック
const exists = await $fs.exists(`${$env.OUTPUT}\\result.csv`);

// ディレクトリ内の一覧取得
const entries = await $fs.readDir($env.SRC_DIR);
for (const entry of entries) {
  $println(`${entry.name} (${entry.isDir ? 'DIR' : 'FILE'})`);
}
```

---

## トランザクション操作 API

### 概要

トランザクションAPIは、直接FSに書き込む代わりに**仮想FS上に書き込みオーダーを積み**、  
スクリプト実行終了後に表示される**トランザクションダイアログで確認・コミット**する仕組みです。

- 書き込み系の操作は**同期処理**で書ける（`await` 不要）
- 読み込み（`openText`）は非同期（`await` 必要）

### useTransaction

```typescript
const tx = $fs.useTransaction();
```

`useTransaction()` はトランザクションの開始ではなく、**トランザクション利用の宣言**です。  
この呼び出しにより、仮想FSへ書き込むためのハンドル（API群）を取得します。

### トランザクション関数一覧

| 関数 | シグネチャ | 説明 |
|------|-----------|------|
| `openText` | `(filePath: string, encoding: 'utf8' \| 'sjis') => Promise<{ token: FileToken; content: string; }>` | テキストを読み込み、**チェックアウト状態**にする。以降はトークン経由でのみ変更操作可能。 |
| `saveText` | `(filePath: string, content: string) => void` | 新規テキストファイルを作成するオーダーを積む |
| `updateText` | `(token: FileToken, content: string) => void` | テキストを更新するオーダーを積む。`openText` とペアで使用。 |
| `copyFile` | `(from: string, dest: string) => void` | ファイルコピーのオーダーを積む |
| `deleteFile` | `(filePath: string) => void` | ファイル削除のオーダーを積む |
| `deleteFileByToken` | `(token: FileToken) => void` | トークン経由でファイル削除のオーダーを積む |
| `renameFile` | `(targetFilePath: string, newFileName: string) => void` | ファイル名変更のオーダーを積む |
| `renameFileByToken` | `(token: FileToken, newName: string) => void` | トークン経由でファイル名変更のオーダーを積む |

### コード例

```typescript
const tx = $fs.useTransaction();

// ファイルを開いてチェックアウト（非同期）
const { token, content } = await tx.openText(`${$env.DIR}\\target.txt`, 'utf8');

// 内容を加工して更新オーダーを積む（同期）
const newContent = content.replace(/old/g, 'new');
tx.updateText(token, newContent);

// 新しいファイルのオーダーを積む（同期）
tx.saveText(`${$env.DIR}\\newFile.txt`, 'hello');
```

> スクリプト終了後、トランザクションダイアログが開きます。

---

## トランザクションダイアログ

トランザクションAPIで書き込みオーダーを積んでスクリプトが完了すると、  
トランザクションダイアログが表示されます。

### フェーズ

| フェーズ | 説明 |
|----------|------|
| **1. confirm（確認）** | 仮想FSのオーダー内容を目視確認する。ファイル名をクリックすると変更内容の詳細を確認できる。 |
| **2. verify（検証）** | 実FSをチェックし、変更可否を検証する。問題がなければ実FSへの変更が実行される。 |
| **3. commit（完了）** | 全ての変更が実FSに適用された状態。 |

### verify で検出されるエラー例

- ファイルを作成しようとしたディレクトリが存在しない
- 更新しようとしたファイルが存在しない
- 書き込み権限がない

エラーが1件でも発生した場合、実FSの変更処理は一切行われません。

### 論理整合性の担保

チェックアウト（`openText`）したパスに対して、直接ファイル操作（保存・削除・リネーム・再読み込み）を行った場合、**ランタイムエラー**となります。

### このワークフローが解決すること

| 問題 | トランザクションによる解決 |
|------|--------------------------|
| 実装ミスで意図しないファイルが変更される | confirmフェーズで目視確認できる |
| 途中でエラーが発生して中途半端な状態になる | verifyで全チェック後に一括適用するため起きない |
