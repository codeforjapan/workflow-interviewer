# PSID（行政サービスID）との連携

## PSIDとは

**Public Service ID（PSID）** は、行政サービスを「ライフイベント×サービスカテゴリ」の2軸でコード化し、
異なるシステム間のデータ接続キーとする識別子の体系です。

- 仕様策定: 一般社団法人ユニバーサルメニュー普及協会（UM普及協会）
- 初版公開: 2019年。2022年にver.2.0公開（関係テーブル機能を追加）
- 設計思想: 「データとテクノロジーを分離し、データをオープンに、テクノロジーを競争領域に」
- 名称が「Government Service ID」でなく「Public Service ID」なのは、民間企業等が提供するサービスも対象に含むため

---

## PSID書式

```
'psid'《バージョン》'+'《管理者コード》'+'《サービスコード》

例: psid1.0+JA4010005017010+24
     ↑ver.1.0  ↑UM普及協会の法人ナンバー  ↑サービスコード（通し番号）
```

### サービスコードの仕様
- **可変長**: 毎年新たに作られる行政制度に発行し続けるため桁数は定めない
- **無為コード**: 制度内容の変更による不整合を防ぐためコードに意味を持たせない
- **人間可読性**: シンプルな数列とする

---

## PSID ver.2.0 関係テーブル

PSID ver.2.0では、行政制度データ同士の**関係性**を表現する「関係テーブル」が追加されました。
このリポジトリのファイル間参照設計はこの関係テーブルの概念に対応しています。

| 関係性 | 定義 | このKBでの対応 |
|---|---|---|
| `psid:exactMatch` | 実施根拠となる法令・予算が同一の制度（例: 全自治体の「児童手当」） | `related_workflows` で同一ワークフローを参照 |
| `psid:close` | 根拠法令等が異なるが実施内容が類似の制度（例: 自治体独自の子ども医療費助成） | gap-notesで「自治体差」として記録 |
| `psid:procedure` | 行政サービスに関する行政手続きの関係（例: 「児童手当」に対する「受給申請」） | journeys の手続き連鎖マトリクスで表現 |

---

## UMとUMIDについて

**ユニバーサルメニュー（UM）** はUM普及協会が提唱する行政制度の標準メニュー体系で、全国的に実施されている約800種類の行政制度を市民目線で分類・整理したものです。

UM にPSIDを付与したものを **UMID** と呼びます。UMIDは以下の4要件を満たします。

| 要件 | 内容 |
|---|---|
| 悉皆性 | 全国的に実施されている行政制度すべてに発行可能 |
| 唯一性 | 1つの行政制度に対してUMIDをただ一つ発行 |
| 不変性 | 発行済みUMIDの再発行・欠番の再利用は行わない |
| 継続性 | 制度の追加・削除・分割・統合・変更があっても上記3要件を維持 |

### UMタグ体系（126種）との対応

UMタグは行政制度情報の検索性向上のためのタグ体系で、126種類あります。このリポジトリのCコードはUMタグのカテゴリータグに対応します。

**カテゴリータグの主な分類（UMタグ番号 → このKBのCコード対応）:**

| UMタグ番号 | UMタグ名 | 対応Cコード |
|---|---|---|
| 13 | 戸籍・住民票・印鑑登録等 | C1 |
| 14 | 税 | C2 |
| 15 | 国民健康保険 | C3 |
| 16 | 国民年金 | C4 |
| 17 | 水道・ガス・電気 | C5 |
| 18 | 交通 | C6 |
| 19 | 駐輪・駐車 | C7 |
| 20 | 都市計画 | C8 |
| 21 | ごみ・環境保全 | C9 |
| 22 | 食品・衛生 | C10 |
| 23 | ペット・動物 | C11 |
| 24〜29 | 各種支援（生活困窮・障がい者・消費生活・健康・文化・市民活動） | C12〜C15 |
| **30** | **防災・災害** | **C16（新設→下記参照）** |
| 31 | 防犯・犯罪 | （未整備） |
| 32 | 救急・消防 | （未整備、shobo-kensaワークフローに一部対応） |

**対象者タグ（このKBでの活用）:**

| UMタグ番号 | 対象者タグ名 | このKBでの対応 |
|---|---|---|
| 96 | 高齢者 | journeys/aging-and-care.md |
| 97 | 介護中 | stakeholders/chiiki-houkatsu-shien-center.md |
| 98 | 障がい者 | workflows/_standardized-20/shogaisha-techo/ |
| **101** | **被災者** | **journeys/disaster-and-recovery.md（新設）** |
| 99 | 遺族 | journeys/death-and-bereavement.md |

---

## ライフイベントID（L コード）

| ID | ライフイベント | 対応ジャーニー |
|---|---|---|
| **L1** | **妊娠・出産** | **[journeys/birth-and-childcare.md](./journeys/birth-and-childcare.md)** |
| **L2** | **子育て** | **[journeys/birth-and-childcare.md](./journeys/birth-and-childcare.md)**（L1と統合） |
| L3 | 学校教育 | （未整備） |
| **L4** | **結婚・離婚** | **[journeys/marriage-and-divorce.md](./journeys/marriage-and-divorce.md)** |
| **L5** | **引越し・住まい** | **[journeys/moving.md](./journeys/moving.md)** |
| **L6** | **就職・退職** | **[journeys/employment-and-retirement.md](./journeys/employment-and-retirement.md)** |
| **L7** | **高齢者・介護** | **[journeys/aging-and-care.md](./journeys/aging-and-care.md)** |
| **L8** | **おくやみ** | **[journeys/death-and-bereavement.md](./journeys/death-and-bereavement.md)** |
| L9 | 健康を保つ | （未整備） |
| L10 | 生涯学習 | （未整備） |
| L11 | 楽しむ | （未整備） |
| **L12** | **支援を求める** | **[journeys/poverty-and-crisis.md](./journeys/poverty-and-crisis.md)** |
| **L13** | **被災・生活再建** | **[journeys/disaster-and-recovery.md](./journeys/disaster-and-recovery.md)** |

---

## バックオフィスジャーニーID（O コード）

| ID | サイクル | 対応ジャーニー |
|---|---|---|
| **O1** | **年度サイクル（予算編成〜決算）** | **[journeys/backoffice/fiscal-year-cycle.md](./journeys/backoffice/fiscal-year-cycle.md)** |
| **O2** | **議会対応サイクル** | **[journeys/backoffice/council-response-cycle.md](./journeys/backoffice/council-response-cycle.md)** |
| **O3** | **人事異動サイクル** | **[journeys/backoffice/staff-rotation-cycle.md](./journeys/backoffice/staff-rotation-cycle.md)** |
| **O4** | **監査・検査対応サイクル** | **[journeys/backoffice/audit-cycle.md](./journeys/backoffice/audit-cycle.md)** |
| **O5** | **災害対応サイクル（非定期発動型）** | **[journeys/backoffice/disaster-response-cycle.md](./journeys/backoffice/disaster-response-cycle.md)** |

---

## サービスカテゴリID（C コード）

| ID | サービスカテゴリ | 対応ワークフロー |
|---|---|---|
| **C1** | **戸籍・住民票・印鑑登録** | **[住民移動](./workflows/_standardized-20/jyumin-ido/) / [戸籍](./workflows/_standardized-20/koseki/) / [印鑑登録](./workflows/_standardized-20/inkan-toroku/) / [選挙名簿](./workflows/_standardized-20/senkyo-meibo/)** |
| **C2** | **税** | **[固定資産税](./workflows/_standardized-20/kotei-shisan-zei/) / [個人住民税](./workflows/_standardized-20/kojin-jumin-zei/) / [法人住民税](./workflows/_standardized-20/hojin-jumin-zei/) / [軽自動車税](./workflows/_standardized-20/keijidosha-zei/)** |
| **C3** | **国民健康保険** | **[国民健康保険](./workflows/_standardized-20/kokumin-kenko-hoken/) / [後期高齢者医療](./workflows/_standardized-20/kouki-koreisha-iryo/)** |
| **C4** | **国民年金** | **[国民年金](./workflows/_standardized-20/kokumin-nenkin/)** |
| C5 | 水道・ガス・電気 | （未整備） |
| C6 | 交通 | （未整備） |
| C7 | 駐車・駐輪 | （未整備） |
| C8 | 都市計画 | （未整備） |
| C9 | ごみ・環境保全 | （未整備） |
| **C10** | **食品・衛生** | **[食品衛生検査](./workflows/administrative-commons/shokuhin-esei-kansa/)** |
| C11 | ペット・動物 | （未整備） |
| **C12** | **金銭その他支援** | **[児童手当](./workflows/_standardized-20/jido-teate/) / [子育て支援](./workflows/_standardized-20/kosodate-shien/) / [生活保護](./workflows/_standardized-20/seikatsu-hogo/)** |
| **C13** | **障害者支援（介護含む）** | **[介護保険](./workflows/_standardized-20/kaigo-hoken/) / [障害者手帳](./workflows/_standardized-20/shogaisha-techo/)** |
| C14 | 消費生活 | （未整備） |
| **C15** | **健康・医療** | **[健康管理](./workflows/_standardized-20/kenko-kanri/) / [予防接種](./workflows/_standardized-20/yobo-sesshu/)** |
| **C16** | **防災・災害** | **[被災・生活再建ジャーニー](./journeys/disaster-and-recovery.md) / [災害対応サイクル](./journeys/backoffice/disaster-response-cycle.md) / [罹災証明書](./concepts/disaster-certificate.md) / [避難所類型](./concepts/evacuation-shelter.md) / [要配慮者](./concepts/disaster-vulnerable-person.md)** |

---

## このリポジトリとPSIDの関係

```
PSIDが提供するもの:              CfJのKBが提供するもの:
  ├─ サービスの「存在」             ├─ サービスの「中身」（業務フロー）
  ├─ ライフイベントとの対応         ├─ システムと現実の「差分」（gap-notes）
  └─ 法令根拠の紐付け              └─ 制度間の「穴の連鎖」（incident-catalog）
  → 「何があるか」のカタログ        → 「どう動くか・どこが壊れるか」の知識
```

PSIDはキー、このリポジトリはその値（バリュー）。
PSIDの `psid1.0:JA3000020141003:0000000022`（横浜市 児童手当）は、
このリポジトリの `workflows/_standardized-20/jido-teate/` が説明する業務の「全国標準版」を指します。

---

## PSIDとの接続方法

各ファイルの冒頭YAMLフロントマターにPSIDコードを記載しています。

```yaml
---
file_type: "journey"
psid_lifecycle: "L5"
psid_services: ["C1", "C3", "C12"]
psid_ref: "https://github.com/codeforjapan/municipal-workflow-kb"
---
```

ワークフローファイルの例：

```yaml
---
psid_service_category: "C12"
psid_lifecycle: "L1"
flow_type: "standard"
spec_ref: "..."
---
```

---

## 「共通領域・協調領域のアナログ部分」について

PSIDの設計者は「共通領域・協調領域をどう作り上げていくのか、ここはアナログの世界」と述べています。

このリポジトリはその「アナログの世界」を構造化する試みです。

- **共通領域**（全自治体が守るべき）→ `workflows/_standardized-20/` の `flow-standard.md`
- **協調領域**（自治体が協力して価値を上げる）→ `incident-catalog/` と `gap-notes.md`
- **競争領域**（各自治体が独自に設計する）→ 各自治体のForkリポジトリ

---

## 今後の連携候補

- **UM普及協会**: PSIDの仕様・データ共有の正式連携
- **育なび.net**: 子育てサービスデータとの接続（L1〜L2のジャーニー整備後）
- **マイナポータル**: 手続きのオンライン化とフロー標準化の接続
