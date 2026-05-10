---
title: logic
description: 複数のworkから再利用する処理。
---

`logic`は、複数のworkから再利用する処理を定義するcontextです。

同じワークスペース内で共通化したい関数や処理を、workから`$logic`として呼び出せる形にします。

```ts
const normalized = $logic.normalizeUserName(row.name);
$println(normalized);
```

## 今後整理する仕様

- logicの定義方法
- workからの参照方法
- 補完への反映
- APIの自動利用
