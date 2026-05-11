# local/ — 自治体固有ナレッジ

このフォルダは、**各自治体が自由に追加・編集できる領域**です。  
リポジトリをForkした自治体が、自分たちの現場固有の情報をここに蓄積します。

---

## 基本原則

- `/local/` 以下は **自治体担当者・FDE・都道府県支援職員が自由に編集できる**。
- `/` 直下（national部分）は CfJ が管理するため、自治体側では原則編集しない。
- CfJ がnational部分を更新した際は、Forkリポジトリ側でupstream pullを行う（FDE or 専門職員が担当）。

---

## フォルダ構成

```
local/
├── incidents/     ← 自治体固有の事案・トラブル記録
├── rules/         ← 自治体固有のルール・例規・内部規程
├── contacts/      ← 担当者・ベンダー・関係機関の連絡先
├── processes/     ← 標準フローから逸脱している独自業務フロー
├── archive/       ← 更新・解決済みで参照のみ必要なファイル
└── index.md       ← このフォルダ全体の目次（手動管理）
```

---

## 各フォルダの使い方

### incidents/ — 事案記録

自治体の現場で起きた問題・トラブルをここに記録します。  
ファイル名は `YYYY-MM-DD-概要.md` の形式を推奨。

テンプレート参照: `../templates/incident-template.md`

YAMLフロントマターの例:
```yaml
---
title: ○○担当の窓口対応で保険証情報が未更新だった
date: 2026-03-10
tags: [kokumin-kenko-hoken, counter, manual-error]
status: resolved   # open / in-progress / resolved
related_national: workflows/_standardized-20/kokumin-kenko-hoken/gap-notes.md
---
```

### rules/ — 固有ルール・例規

国の標準では定義されていない自治体独自のルールや内部規程をここに記録します。  
例: 独自の仮証明書運用、条例による特例措置、首長方針による運用変更など。

### contacts/ — 連絡先情報

関係機関・ベンダー・担当者の連絡先情報を管理します。  
**個人情報の取り扱いに注意してください。** 公開リポジトリの場合はprivateリポジトリへの移行を推奨。

### processes/ — 独自業務フロー

nationalの `flow-standard.md` や `flow-canonical.md` から逸脱している部分を記録します。  
「なぜ標準と異なるのか」の理由も必ず記載してください。

### archive/ — アーカイブ

解決済みのincident、廃止されたルールなどを保管します。  
削除はせず、ここに移動することで参照性を保ちます。

---

## index.md の管理

`index.md` はこのフォルダ全体の目次です。ファイルを追加した際は index.md も更新してください。  
（GitHub Actionsで自動生成する場合はその設定を参照）

---

## 運用体制の目安

| 自治体規模 | 主な管理者 |
|---|---|
| 中核市以上 | 自治体職員 ＋ FDE ＋ AI |
| 中核市未満 | 都道府県職員 ＋ FDE ＋ AI |

運用上の判断に迷った場合は、CfJの担当FDEに相談してください。
