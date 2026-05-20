---
psid_service_category: "C12"
psid_lifecycle: "L12"
psid_lifecycle_also: ["L5", "L7"]
flow_type: "standard"
spec_ref: "生活保護システム標準仕様書 厚生労働省"
spec_law: "生活保護法 第7条（申請保護の原則）、第24条（申請・決定、14日以内）"

# 依存関係
depends_on:
  - target: "concepts/income.md"
    type: "definition_dependency"
    note: "収入認定の方法が他制度と大きく異なる（稼働収入・年金・各種給付の個別認定）"
  - target: "concepts/household.md"
    type: "definition_dependency"
    note: "生活保護の世帯認定は届出でなく実態で判断する（住基世帯と独立）"
  - target: "concepts/dependent.md"
    type: "definition_dependency"
    note: "扶養義務者照会が必要。DV・虐待等の場合は照会しない（R3.3.30厚労省通知）"
  - target: "concepts/domicile.md"
    type: "definition_dependency"
    note: "現在地保護の原則。住民票がなくても申請可能。施設入所時の実施責任移管に関わる"

creates_risks:
  - target: "incident-catalog/INC-003-welfare-application-refused.md"
    condition: "申請書を交付せず・申請を抑制する「水際作戦」が行われた場合"
  - target: "incident-catalog/INC-005-welfare-transfer-gap.md"
    condition: "転入時の生活保護移管手続きが漏れ、保護が中断した場合"
  - target: "incident-catalog/INC-004-complex-needs-no-coordinator.md"
    condition: "複合困難ケースの支援調整者が決まらず孤立した場合"

concept_dependencies:
  - target: "concepts/income.md"
    note: "収入認定・最低生活費の算定"
  - target: "concepts/household.md"
    note: "世帯認定・世帯分離の判断"
  - target: "concepts/dependent.md"
    note: "扶養義務者照会の要否判断"
  - target: "concepts/domicile.md"
    note: "現在地保護・施設入所時の実施責任"

review_status: "drafted"
applicability_scope: "national-common"
---

# 生活保護 標準業務フロー

**出典**: 生活保護システム標準仕様書（厚生労働省）
**法令**: 生活保護法 第7条（申請保護の原則）、第24条（申請・決定、14日以内）

> ⚠️ **このフローで最も重要なこと**
> 生活保護法第7条: 申請意思を示した住民には**必ず申請書を渡す**。
> これは法的義務であり、断ることは違法（水際作戦の禁止）。

---

## 申請・決定フロー

```mermaid
flowchart TD
    subgraph 住民・申請者
        Start([相談の入口\n来庁・電話・他課連絡・支援団体])
    end

    subgraph 相談員（CW/FW）
        FirstContact[初回相談\nFW・CW対応\n⚡緊急性の確認]
        Urgent_GW{今夜の住む場所・\n食事はあるか?}
        Emergency[緊急対応\n係長即エスカレーション\nシェルター・食料支援]
        AppForm[["⚠️ 申請書を必ず渡す\n生活保護法第7条\n申請意思があれば全員"]]
    end

    subgraph 担当課（福祉事務所）
        ReceiveApp[申請書受付\n⚡申請日を確定・記録]
        CheckDV_GW{DV・家族関係\n断絶の懸念?}
        DVCheck[扶養照会の対象から除外\n厚労省通知R3.3.30確認\n係長判断]
        Survey[調査開始\n申請日から14日以内に決定]
        HomeVisit[家庭訪問\n生活実態確認]
        AssetCheck[資産調査\n預貯金・不動産等]
        IncomeCheck[収入調査\n就労・年金等]
        FamilyCheck[扶養義務者照会\n※DV等の場合は除外]
        Decision_GW{保護の要否}
        StartProtection[保護開始決定\n申請日に遡及して支給]
        Rejection[却下決定\n理由を文書で通知\n不服申立て案内]
        CW_Assign[担当CW決定\nケースワーク開始]
    end

    subgraph 関係機関（ハローワーク・医療機関・民生委員等）
    end

    subgraph システム
    end

    subgraph その他
        End_OK([保護開始])
        End_NG([終了\n他制度案内])
    end

    Start --> FirstContact

    FirstContact --> Urgent_GW

    Urgent_GW -- 緊急あり --> Emergency
    Emergency --> AppForm
    Urgent_GW -- 緊急なし --> AppForm

    AppForm --> ReceiveApp

    ReceiveApp --> CheckDV_GW

    CheckDV_GW -- YES --> DVCheck
    DVCheck --> Survey
    CheckDV_GW -- NO --> Survey

    Survey --> HomeVisit
    HomeVisit --> AssetCheck
    AssetCheck --> IncomeCheck
    IncomeCheck --> FamilyCheck

    FamilyCheck --> Decision_GW

    Decision_GW -- 要保護 --> StartProtection
    Decision_GW -- 非該当 --> Rejection

    StartProtection --> CW_Assign
    CW_Assign --> End_OK
    Rejection --> End_NG

    style AppForm fill:#ffcccc,stroke:#cc0000,stroke-width:3
    style CheckDV_GW fill:#fff3cc,stroke:#e6ac00
    style DVCheck fill:#fff3cc,stroke:#e6ac00
    style FirstContact fill:#e8f4f8
```

---

## 法定期限（標準仕様書が定める処理期限）

| 処理 | 期限 | 超過した場合 |
|---|---|---|
| 申請から保護可否の決定 | **14日以内** | 特別な理由があれば30日まで延長可 |
| 30日超過 | 違法 | 行政訴訟の対象になりうる |

---

## 扶養照会の判断基準（R3.3.30 厚労省通知）

生活保護法上、扶養義務者への照会は**義務ではなく裁量**。

```
照会を行わない/行わなくていいケース:
  ├─ DV被害者（加害者=夫等への照会は居場所漏洩リスク）
  ├─ 虐待・ハラスメント等で家族関係が断絶している
  ├─ 照会により申請者の生活が脅かされる恐れがある
  └─ 明らかに扶養能力がない（高齢・障害等）

判断権限: 係長以上
```

> この判断基準を知らないCWが照会してしまうケースが全国で発生している
> → `incident-catalog/INC-001-dv-cross-department.md`

---

## 転入者の保護移管（転入ジャーニーとの連携）

```
転入元で保護受給中 → みなと市に転入
  ↓
転出元: 保護廃止
みなと市: 転入届受付 → ここで発見できるかどうかが鍵
  ↓
発見できた場合: 福祉課に連絡票 → 保護申請案内
発見できない場合: 住民が自分で動けなければ無保護期間が続く
```

> 転入窓口（市民課）と福祉課の連携は標準仕様書に定められていない
> → `gap-notes.md` のギャップ3参照
