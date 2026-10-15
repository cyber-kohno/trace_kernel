# 上流ライセンス表記の確認文案

2026-10-15。いずれも未送信。GitHub issue・メール等で送信するにはユーザーの明示許可が必要。公開する文面には利用者キー・Work・私有pathを含めない。

## sys_traits / sys_traits_macros

宛先：[dsherret/sys_traits](https://github.com/dsherret/sys_traits)

Title: License text and copyright notice for published sys_traits crates

Body:

```text
The published crates declare MIT in Cargo.toml, but I could not find a
LICENSE or copyright notice in the package archives or their corresponding
repository revisions:

- sys_traits 0.1.29: 0b168a2935d4c398d38ea5d25af8f793858299b5
- sys_traits_macros 0.1.0: 75cbf3ea478624cc78275b0264e78e9ae13ce3f5

Could you point to the applicable MIT license text and copyright attribution
for these versions, or add a license file and confirm its applicability to
these published versions? We want to retain the correct upstream notices
in a binary distribution rather than invent an attribution.

Thank you.
```

2026-10-15に公開APIの既存issue/PR 87件をtitle/bodyのlicense/copyright/attributionで確認した範囲では、該当する確認回答は見つからなかった。新しい回答がないことを永続的に保証するものではない。

## deno_core_icudata

宛先：[denoland/deno_core_icudata](https://github.com/denoland/deno_core_icudata)

Title: MIT wrapper notice and ICU data attribution for deno_core_icudata

Body:

```text
deno_core_icudata 0.77.0 declares MIT and "the Deno authors" in Cargo.toml,
but its package and repository do not contain a standalone license file.
The README identifies Rusty V8's ICU data as the source of icudtl.dat.

Could you confirm the license text/copyright notice to retain for the Rust
wrapper, and confirm that the bundled ICU data retains ICU's own license
and third-party notices? A link to the applicable upstream notice is enough.

The package revision is 83537ba16a4bf1645fc8322e81f7aaf0149a8922.
The wrapper source history points to 8cf4d53874bd4523fe4f1c8e74d7ed7762e8b84b
and 3d6fd3baa9013051c4b864bbb722662fe14216a9; neither change supplies a
license text. We already retain the pinned ICU notices with the data.

Thank you.
```

dataのSHA-256一致だけでRust wrapperへの別プロジェクトの利用許諾を確定しない。上流から正式な本文や適用確認が得られるまでreview項目を維持する。
