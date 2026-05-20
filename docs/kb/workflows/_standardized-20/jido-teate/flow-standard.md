---
psid_service_category: "C12"
psid_lifecycle: "L1"
psid_lifecycle_also: ["L2", "L5"]
flow_type: "standard"
spec_ref: "児童手当システム標準仕様書【第2.0版】こども家庭庁 2024"
spec_law: "児童手当法（令和6年10月改正後）"

# 依存関係
depends_on:
  - target: "workflows/_standardized-20/jyumin-ido/"
    type: "data_dependency"
    note: "住民票の世帯情報・転入情報が受給資格確認の基礎データ"
  - target: "concepts/household.md"
    type: "definition_dependency"
    note: "「生計同一」の判定に使われる「世帯」は住基世帯と一致しない場合がある"
  - target: "concepts/income.md"
    type: "definition_dependency"
    note: "所得上限の判定には税法上の前年所得を使用（6月に基準年度が切り替わる）"
  - target: "concepts/dependent.md"
    type: "definition_dependency"
    note: "扶養親族の数が所得上限額に影響するが、税法上の扶養と健保の扶養は異なる"

creates_risks:
  - target: "incident-catalog/INC-001-dv-cross-department.md"
    condition: "DV被害者の受給情報（住所・口座）が加害者（配偶者）に漏洩した場合"

concept_dependencies:
  - target: "concepts/household.md"
    note: "生計同一・監護の認定"
  - target: "concepts/income.md"
    note: "所得制限・所得の算定方法"
  - target: "concepts/dependent.md"
    note: "扶養親族の数による限度額の変動"

review_status: "drafted"
applicability_scope: "national-common"
---

# 児童手当 標準業務フロー

**出典**: 児童手当システム標準仕様書【第2.0版】（令和6年、こども家庭庁）
**別紙**: 業務フロー及びツリー図（Visio形式）
**法令**: 児童手当法（令和6年10月改正後）

> ⚠️ **令和6年10月改正対応版**
> 支給対象: 0歳〜18歳年度末 / 所得制限: 撤廃 / 第3子加算: 22歳年度末まで含む

---

## 新規認定請求フロー

```mermaid
flowchart TD
    subgraph 住民・申請者
        Start([申請の契機\n出生・転入・公務員退職等])
    end

    subgraph 窓口担当（市民課）
        TriggerGW{申請者の\n雇用形態}
        GuidePub[勤務先への\n申請を案内\n市区町村では受付不可]
        ReceiveApp[申請書受付\n⚡申請日を確定・記録]
        CheckDocs[添付書類確認\nマイナンバー・口座・健保証等]
        Docs_GW{書類OK?}
        TempAccept[仮受付\n申請日を保護\n後日提出依頼]
    end

    subgraph 担当課（子育て支援課）
        CheckEligibility[受給資格確認\n住所・監護・生計同一]
        Residence_GW{市内に住所あり?}
        CheckPriority[父母の優先順位確認\n所得が高い方が請求者]
        CalcAmount[支給額算定\n年齢・第何子・22歳以下の上の子確認]
        CreateCase[台帳作成\n審査資料整備]
        Decision[認定決定\n課長決裁]
        Decision_GW{判定}
        RejectNotice[不認定通知\n不服申立て案内]
    end

    subgraph システム（児童手当システム）
        Register[システム登録\n支給開始月確定]
        PaySchedule[支払スケジュール設定\n2月・6月・10月]
    end

    subgraph 関係機関（職場・健康保険組合等）
        End_Other([終了\n勤務先で手続き])
    end

    subgraph その他
        Notice[認定通知書送付]
        End_NG([不受理\n住民異動届の案内])
        End_Reject([終了])
        End_OK([完了])
    end

    Start --> TriggerGW
    TriggerGW -- 国家・地方公務員 --> GuidePub
    TriggerGW -- 私立学校教職員\nR6.10〜市区町村へ --> ReceiveApp
    TriggerGW -- 会社員・自営等 --> ReceiveApp

    GuidePub --> End_Other

    ReceiveApp --> CheckDocs

    CheckDocs --> Docs_GW

    Docs_GW -- 不足 --> TempAccept
    TempAccept --> CheckEligibility
    Docs_GW -- OK --> CheckEligibility

    CheckEligibility --> Residence_GW

    Residence_GW -- NO --> End_NG
    Residence_GW -- YES --> CheckPriority

    CheckPriority --> CalcAmount

    CalcAmount --> CreateCase

    CreateCase --> Decision

    Decision --> Decision_GW

    Decision_GW -- 認定 --> Register
    Decision_GW -- 不認定 --> RejectNotice

    Register --> PaySchedule
    PaySchedule --> Notice
    RejectNotice --> End_Reject
    Notice --> End_OK

    style ReceiveApp fill:#fff3cc,stroke:#e6ac00
    style CheckPriority fill:#e8f4f8
    style CalcAmount fill:#e8f4f8
```

---

## 申請日と支給開始月の関係（最重要ルール）

標準仕様書が定める申請日確定ルール:

| 事由 | 期限 | 支給開始 |
|---|---|---|
| 出生 | **出生翌日から15日以内** | 出生月から |
| 転入 | **転入翌日から15日以内** | 転入月から |
| 上記以外 | ― | 申請翌月から |

> このルールを担当者が正確に理解しているかどうかが、支給漏れ・住民クレームの分岐点

---

## 支給額算定ロジック（R6.10改正後）

```
月額:
  0〜3歳未満    → 15,000円（第3子以降: 30,000円）
  3歳〜18歳年度末 → 10,000円（第3子以降: 30,000円）

第3子のカウント方法（改正で拡大）:
  22歳年度末まで生計維持している上の子を含む
  → 大学生の子がいる場合は生計同一確認書が必要

所得制限: なし（R6.10〜）
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 住所・世帯情報の照会 | 申請時・随時 |
| 税務システム | 所得情報の照会 | 優先順位判定時 |
| 子ども・子育て支援システム | 保育料算定との連携 | 認定後 |
