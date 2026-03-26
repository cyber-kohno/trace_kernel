# 独自API 概要

## 自動注入の仕組み

Trace Kernelでは、workのプログラムを実行する際、2種類の情報が**自動的に注入**されます。

```
自動注入される要素
├── コンテキスト：ワークスペースで定義した変数・関数
│   ├── $env.DEST_DIR
│   ├── $resource.userData
│   ├── $dataset.workspace
│   └── $process.myTool()
└── 独自API：Trace Kernelが提供するAPI群
    ├── $print / $println
    ├── $channel
    ├── $state
    ├── $fs
    ├── $parse
    └── $net
```

コンテキストはワークスペースの定義内容によって変わりますが、  
**独自APIは常に利用可能**です（output_methodによって一部変わります）。

---

## 独自API 一覧

### `$print` / `$println`

> output_method が **Plain** の場合に注入される

ターミナルの代わりに、Trace KernelのGUI出力パネルへ文字列を表示します。

```typescript
$print('hello');    // 改行なし出力
$println('world');  // 改行あり出力
```

詳細は `console.log` と同様の感覚で使用可能ですが、ターミナルは不要です。

---

### `$channel`

> output_method が **Channel** の場合に注入される

複数のストリームを動的に生成し、ストリームごとに出力を分けることができます。  
テキスト形式とテーブル形式の2種類のストリームに対応しています。

→ 詳細は [06_api_channel.md](./06_api_channel.md) を参照

---

### `$state`

処理の進捗をGUI上でリアルタイムに表示するためのAPIです。

- `$state.useProgress()` — プログレスバーの表示
- `$state.useMonitor()` — 固定テキスト（モニター）のリアルタイム更新

→ 詳細は [07_api_state.md](./07_api_state.md) を参照

---

### `$fs`

ファイルシステムへのアクセスを提供するAPIです。

- **直接操作**：即時にファイルの読み書きを行う非同期関数群
- **トランザクション操作**：仮想FS上にオーダーを積み、ダイアログで確認後に一括コミット

→ 詳細は [05_api_fs.md](./05_api_fs.md) を参照

---

### `$parse`

各種ファイルフォーマットのパースを行うAPIです。

対応形式（予定含む）：
- Excel
- XML
- CSV

> 詳細仕様は今後のリバースエンジニアリングにより追記予定。

---

### `$net`

外部ネットワークへのアクセスを行うAPIです。

主な用途：
- HTMLページのソース取得
- 外部APIの呼び出し（HTTPリクエスト）

> 詳細仕様は今後のリバースエンジニアリングにより追記予定。
