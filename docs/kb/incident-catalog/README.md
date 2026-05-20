# インシデントカタログ

> **このディレクトリの役割**  
> 業務の「穴の連鎖」が実際にインシデントに至ったパターンを収録する。  
> `journeys/` と `workflows/` の両方から参照される独立した資料。  
> **予算化の根拠文書として使うことを想定している。**

---

## 使い方

### 自治体担当者として読む場合
自分の自治体で「似たパターンがないか」を確認する。  
あれば、対策案の列（`prevention`）を参考に改善提案を起票する。

### CfJとしてFDE提案に使う場合
「このインシデントは御市でも発生しうる」という根拠として提示する。  
`severity` と `fix_cost` の非対称性（安い対策で高リスクを防げる）が予算化の論理になる。

---

## 収録インシデント一覧

### 🔴 生命・身体への危害 または 法令違反

| ID | タイトル | 関連ジャーニー | 対策コスト |
|---|---|---|---|
| [INC-001](./INC-001-dv-cross-department.md) | DV情報の課横断連携失敗 | moving / poverty-and-crisis | 低 |
| [INC-002](./INC-002-care-handover-14days.md) | 介護認定引き継ぎ14日切れ | moving / aging-and-care | 低 |
| [INC-003](./INC-003-welfare-application-refused.md) | 生活保護申請書の不交付（水際作戦） | poverty-and-crisis | 低 |
| [INC-004](./INC-004-complex-needs-no-coordinator.md) | 複合課題の調整者不在による孤立死 | poverty-and-crisis / aging-and-care | 中 |
| [INC-005](./INC-005-welfare-transfer-gap.md) | 転入時の生活保護移管漏れによる無保護状態 | moving / poverty-and-crisis | 低 |
| [INC-006](./INC-006-retirement-uninsured.md) | 退職後の国保・年金未手続きによる無保険と受診抑制 | employment-and-retirement | 低 |

### 🟠 住民の権利侵害 または 訴訟リスク

| ID | タイトル | 関連ジャーニー | 対策コスト |
|---|---|---|---|
| [INC-007](./INC-007-mental-health-card-expired.md) | 精神障害者手帳の更新失効によるサービス停止連鎖 | poverty-and-crisis | 低 |

### 🟡 経済的損失 または 行政の不良債権化

| ID | タイトル | 関連ジャーニー | 対策コスト |
|---|---|---|---|
| [INC-008](./INC-008-inheritance-unregistered-tax.md) | 固定資産税の相続未登記継続による課税誤りと不良債権化 | death-and-bereavement | 中 |
| [INC-009](./INC-009-pension-overpayment-bereavement.md) | おくやみ後の年金過払いと遺族への一括返還請求 | death-and-bereavement / poverty-and-crisis | 低 |

### 🔴 災害対応（生命・身体への危害）

| ID | タイトル | 関連ジャーニー | 対策コスト |
|---|---|---|---|
| [INC-D01](./INC-D01-vulnerable-person-list-failure.md) | 避難行動要支援者名簿が機能せず要配慮者が取り残される | disaster-and-recovery | 中 |
| [INC-D02](./INC-D02-welfare-shelter-unknown.md) | 福祉避難所の存在が周知されず要配慮者が劣悪な状況に置かれる | disaster-and-recovery / aging-and-care | 中 |
| [INC-D03](./INC-D03-disaster-certificate-dispute.md) | 被害認定不服制度を知らず支援を受け損なう | disaster-and-recovery | 低 |

---

## インシデント記述の標準フォーマット

各ファイルは以下の構造で記述する（`_template.md` 参照）。

```yaml
id: INC-XXX
title: （インシデントの名称）
related_journeys:
  - journeys/xxx.md
related_workflows:
  - workflows/xxx/
severity: critical / high / medium
  # critical = 生命・身体への危害、または法令違反
  # high     = 住民の権利侵害、または訴訟リスク
  # medium   = 業務品質・住民満足度の低下
frequency: daily / weekly / monthly / yearly / rare
current_fix: （現在の対処方法と属人度）
fix_cost: low / medium / high
prevention: （推奨される対策）
real_cases: （全国で起きた類似事例への参照）
```

---

## 「予算化の非対称性」について

このカタログが示す最も重要なメッセージ：

```
INC-001（DV情報連携）
  対策コスト: 連絡票の整備 ＋ 研修 = 数万〜十数万円
  放置コスト: 被害者発見・傷害事件 → 訴訟・報道・信頼失墜 = 数千万円〜

INC-003（申請書不交付）
  対策コスト: チェックシートの整備 ＋ ロールプレイ研修 = 数万円
  放置コスト: 孤立死・報道・刑事訴追 = 計り知れない

INC-006（退職後無保険）
  対策コスト: 案内チラシの整備 ＋ ハローワーク連携協定 = 数万円
  放置コスト: 無保険者の重症化 → 救急搬送・生活保護流入 = 数百万円〜/件

INC-008（相続未登記課税誤り）
  対策コスト: 死亡届→税務課の連絡票整備 = 数万円
  放置コスト: 税債権消滅（時効5年） = 数十万円〜/件 × 毎年累積

INC-009（年金過払い）
  対策コスト: おくやみ案内票に年金停止を追記 = ほぼゼロ
  放置コスト: 過払い返還不能・遺族の困窮・刑事告発リスク = 数十〜数百万円/件

→ 「暗黙知の可視化」ではなく
  「重大インシデントの予防策」として予算要求する根拠がここにある
```

## インシデントと業務フロー・ジャーニーのクロス参照

| ジャーニー | 関連インシデント |
|---|---|
| 引越し・住まい（L5） | INC-001, INC-002, INC-005 |
| 就職・退職（L6） | INC-006 |
| 高齢者・介護（L7） | INC-002, INC-004 |
| おくやみ（L8） | INC-008, INC-009 |
| 困窮・複合課題（L12） | INC-001, INC-003, INC-004, INC-005, INC-006, INC-007, INC-009 |
| **被災・生活再建（L13）** | **INC-D01, INC-D02, INC-D03** |
