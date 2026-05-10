---
title: $fs
description: ファイルシステム操作API。
---

`$fs`は、ファイルシステムへの読み書きを行うAPIです。

操作方法は2種類あります。

| 方式 | 概要 |
| --- | --- |
| 直接操作 | 実ファイルへ即時に読み書きする非同期関数群です。 |
| トランザクション操作 | 仮想FS上に操作を積み、確認後に一括コミットします。 |

## 直接操作

直接操作APIは、実行時に実ファイルシステムへ操作を反映します。すべて非同期関数であり、呼び出しには`await`が必要です。

パスを引数に取るメソッドは、絶対パスを前提にします。相対パスを渡すと実行時エラーになります。

### FileStat

```ts
type FileStat = {
  size: number;
  isFile: boolean;
  isDir: boolean;
  createdAt?: number;
  modifiedAt?: number;
};
```

### 状態取得・検索

| メソッド | 説明 |
| --- | --- |
| `exists(path)` | 指定パスが存在するか確認します。 |
| `glob(pattern)` | パターンに一致するパス配列を取得します。 |
| `stat(path)` | サイズ、作成日、ファイル/ディレクトリ判定などを取得します。 |
| `readDir(dir)` | ディレクトリ配下の要素一覧を取得します。 |

### ファイル読み書き

| メソッド | 説明 |
| --- | --- |
| `readText(filePath, encoding?)` | テキストデータを読み込みます。encoding省略時は`utf8`です。 |
| `saveText(filePath, content)` | テキストファイルを作成または上書き保存します。 |
| `copyFile(src, dest)` | ファイルをバイナリコピーします。 |

### ディレクトリ・削除・リネーム

| メソッド | 説明 |
| --- | --- |
| `makeDir(dirPath)` | ディレクトリを作成します。既存ディレクトリの場合は何もしません。 |
| `deleteFile(filePath)` | ファイルを削除します。 |
| `deleteDir(dirPath)` | 空ディレクトリを削除します。 |
| `renameFile(targetFilePath, newFileName)` | ファイル名を変更します。ディレクトリ移動はできません。 |
| `renameDir(targetDirPath, newDirName)` | ディレクトリ名を変更します。 |

### コード例

```ts
const content = await $fs.readText(`${$env.ROOT}\\file.txt`, 'utf8');

const exists = await $fs.exists(`${$env.OUTPUT}\\result.csv`);

const entries = await $fs.readDir($env.SRC_DIR);
for (const entry of entries) {
  $println(`${entry.name} (${entry.isDir ? 'DIR' : 'FILE'})`);
}
```

## トランザクション操作

トランザクションAPIは、実ファイルへ直接書き込む代わりに、仮想FS上へ操作を積みます。

workの実行後にトランザクションダイアログが表示され、変更内容を確認してからコミットできます。

```ts
const tx = $fs.useTransaction();
```

`useTransaction()`は、トランザクション利用の宣言です。1つのwork実行につき1回のみ呼び出せます。

### 関数一覧

| 関数 | 説明 |
| --- | --- |
| `makeDir(dirPath)` | ディレクトリ作成を予約します。 |
| `openText(filePath, encoding?)` | テキストを読み込み、チェックアウト状態にします。 |
| `updateText(token, content)` | `openText`で得たtokenを使って更新オーダーを積みます。 |
| `saveText(filePath, content)` | 新規テキストファイル作成を予約します。 |
| `copyFile(from, dest)` | ファイルコピーを予約します。 |
| `copyFileByToken(token, dest)` | チェックアウト中のファイルをtoken経由でコピーします。 |
| `deleteFile(filePath)` | ファイル削除を予約します。 |
| `deleteFileByToken(token)` | チェックアウト中のファイルをtoken経由で削除します。 |
| `renameFile(targetFilePath, newFileName)` | ファイル名変更を予約します。 |
| `renameFileByToken(token, newName)` | チェックアウト中のファイル名変更を予約します。 |

各メソッドは呼び出し時点でVFS上の論理検証を行います。不正な操作や競合が見つかった場合は、その場でエラーになります。

### コード例

```ts
const tx = $fs.useTransaction();

const { token, content } = await tx.openText(`${$env.DIR}\\target.txt`, 'utf8');

const newContent = content.replace(/old/g, 'new');
tx.updateText(token, newContent);

tx.saveText(`${$env.DIR}\\newFile.txt`, 'hello');
```

## トランザクションダイアログ

![トランザクションダイアログ](/screen_shot/トランザクションダイアログ.JPG)

トランザクションAPIで書き込みオーダーを積んでworkが完了すると、トランザクションダイアログが表示されます。

### フェーズ

| フェーズ | 説明 |
| --- | --- |
| confirm | 仮想FS上のオーダー内容を目視確認します。ファイル名をクリックすると詳細を確認できます。 |
| verify | 実ファイルシステム上で変更可能か検証します。 |
| commit | すべての変更が実ファイルへ適用された状態です。 |

![書き込み内容確認](/screen_shot/書き込み内容確認.JPG)
![更新内容確認](/screen_shot/更新内容確認.JPG)
![書き込み完了](/screen_shot/書き込み完了.JPG)

verifyでエラーが1件でも発生した場合、実ファイルへの変更処理は行われません。

## 解決する問題

| 問題 | トランザクションによる解決 |
| --- | --- |
| 実装ミスで意図しないファイルが変更される | confirmフェーズで目視確認できます。 |
| 途中でエラーが発生して中途半端な状態になる | verifyで全チェック後に一括適用するため、部分的な変更を避けられます。 |
| 大量変更の内容を実行前に確認できない | ダイアログで変更一覧と詳細を確認できます。 |
