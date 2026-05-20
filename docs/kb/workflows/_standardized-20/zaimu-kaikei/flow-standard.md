---
psid_service_category: "内部管理"
psid_lifecycle: "-"
flow_type: "standard"
spec_ref: "地方自治体における財務会計システム標準仕様書【第1.0版】総務省 2023"
spec_law: "地方自治法 第211条～（予算）、第232条の4～（支出の手続き）、第233条（収入の調定）"
---

# 財務会計 標準業務フロー

**出典**: 地方自治体における財務会計システム標準仕様書【第1.0版】（令和5年、総務省）
**法令**: 地方自治法 第211条～（予算）、第232条の4～（支出の手続き）、第233条（収入の調定）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 支出フロー（予算執行サイクル）

```mermaid
flowchart TD
    Start([会計年度開始\n4月1日]) --> PrepareBudget

    subgraph 議会予算審議
        PrepareBudget[予算成立\n議会承認済みの当初予算\nまたは補正予算が開始]
    end

    PrepareBudget --> RequestDepartments

    subgraph 担当課
        RequestDepartments[各課から支出要求\n「支出負担行為」申請\n契約内容・金額・納期を記載]
        ApprovalFirstLevel[一次承認\n各課長承認]
        CheckBudget{予算額内\nか?}
    end

    RequestDepartments --> CheckBudget

    CheckBudget -- NO --> ReturnReject

    subgraph 財政課査定管理
        ReturnReject[予算超過のため不可\n申請部門に返却]
        ApprovalSecondLevel{財政部門\n承認も\n必要?}
        FinanceReview[財政課による\n予算執行チェック\n必要性・妥当性確認]
        FinanceApprove[財政課長承認]
    end

    ReturnReject --> End_Reject

    CheckBudget -- YES --> ApprovalFirstLevel
    ApprovalFirstLevel --> ApprovalSecondLevel

    ApprovalSecondLevel -- 金額大\nまたは\n重要支出 --> FinanceReview

    ApprovalSecondLevel -- 小額・\n定型 --> SkipFinance

    FinanceReview --> FinanceApprove

    subgraph システム財務会計
        SkipFinance[小額・定型案件を\nスキップ]
        ExecBudget[システム上で\n支出負担行為として\n記録\n予算額から差引く]
        IssuePaymentOrder[支出命令書作成\n金額・支払期日・振込先を記載\n支出負担行為から抜粋]
        ProcessPayment[出納室が支払処理実行\n銀行振込またはチェック発行\n支払日記録]
    end

    SkipFinance --> ExecBudget
    FinanceApprove --> ExecBudget

    ExecBudget --> ContractOrOrder

    subgraph 上司決裁者
        ContractOrOrder[契約・発注実行\n支出負担行為により\n拘束力が生じる]
        ApprovalPayment[支出命令承認フロー\n一次～最終承認\n決裁]
    end

    ContractOrOrder --> ReceiveGoodsServices

    subgraph 会計課
        ReceiveGoodsServices[納品・サービス提供\n納期確認・受領検査\nを実施]
        CheckDelivery{納品\n内容\nOK?}
    end

    ReceiveGoodsServices --> CheckDelivery

    CheckDelivery -- NO --> ReturnGoods

    subgraph 担当課
        ReturnGoods[返品・修正依頼\n契約に基づき対応]
    end

    ReturnGoods --> ReceiveGoodsServices

    CheckDelivery -- YES --> IssuePaymentOrder

    IssuePaymentOrder --> ApprovalPayment
    ApprovalPayment --> CashierPayment

    subgraph システム財務会計
        CashierPayment[出納室へ支出命令書提出\nまたはシステム連携]
    end

    CashierPayment --> ProcessPayment

    ProcessPayment --> End_OK

    End_OK([支出完了\n決算データ])

    style ExecBudget fill:#e8f4f8,stroke:#3b82f6
    style CheckBudget fill:#fff3cc,stroke:#e6ac00
    style IssuePaymentOrder fill:#e8f4f8,stroke:#3b82f6
    style ProcessPayment fill:#e8f4f8,stroke:#3b82f6
```

---

## 収入フロー（年度通期）

```mermaid
flowchart TD
    Start([会計年度開始\nまたは随時]) --> CreateAdjustment

    subgraph システム財務会計
        CreateAdjustment[市町村税・使用料等の\n調定（請求）を発生\nシステムで調定票作成\nまたは手動作成]
    end

    CreateAdjustment --> SendInvoice

    subgraph 担当課
        SendInvoice[納税義務者・使用者へ\n納税通知書・請求書を郵送\nまたは電子送付]
    end

    SendInvoice --> ReceivePayment

    subgraph 会計課
        ReceivePayment[納付方法を提供\n銀行振込・コンビニ・\nペイジー・口座振替等\n複数チャネル対応]
        ProcessCollection[収納（現金回収）\n銀行・コンビニから\n日々の納付データを受け取り\nシステムに取込]
        MatchAdjustment[収納消込\n納付額と調定額を照合\nシステムが自動マッチング]
        CheckStatus{納付状況\nは?}
    end

    ReceivePayment --> ProcessCollection
    ProcessCollection --> MatchAdjustment
    MatchAdjustment --> CheckStatus

    CheckStatus -- 完納 --> End_Paid

    CheckStatus -- 一部納付 --> PartialAccept

    subgraph 担当課
        PartialAccept[部分充当\n分割納付の場合\n残額を追跡]
    end

    PartialAccept --> CheckRemain

    subgraph 会計課
        CheckRemain{残額\nなし?}
    end

    CheckRemain -- YES --> End_Paid
    CheckRemain -- NO --> ReminderFlow

    CheckStatus -- 未納 --> ReminderFlow

    subgraph 財政課査定管理
        ReminderFlow[督促手続き\n督促状送付\n法定期限から\n20日以内]
        AddFee[督促手数料加算\n一般的に100～300円\nシステムで自動加算]
        FurtherAction{更なる\nアクション\n必要?}
        ExecAuction[強制執行手続き\n債権回収部門へ\n引継ぎ]
        WriteOff[不納欠損処分\n監査委員同意の上\n帳簿から削除\n決算で報告]
    end

    ReminderFlow --> AddFee
    AddFee --> ReminderPayment

    subgraph 会計課
        ReminderPayment[督促後の納付を\n再度処理\n又は更なる未納へ進む]
    end

    ReminderPayment --> FurtherAction

    FurtherAction -- 徴収強化\n（差し押さえ等） --> ExecAuction

    FurtherAction -- 経営判断\nで不納欠損 --> WriteOff

    ExecAuction --> End_Collection
    WriteOff --> End_Collection

    End_Paid([納付完了])
    End_Collection([収納フロー終了])

    style ProcessCollection fill:#e8f4f8,stroke:#3b82f6
    style MatchAdjustment fill:#e8f4f8,stroke:#3b82f6
    style CheckStatus fill:#fff3cc,stroke:#e6ac00
    style WriteOff fill:#ffcccc,stroke:#cc0000
```

---

## 決算調製フロー（年度末～翌年度初期）

```mermaid
flowchart TD
    Start([会計年度終了\n3月31日]) --> FinalClosing

    subgraph 会計課
        FinalClosing[最終的な出納報告\n出納室から会計課へ\n最後の支払・収納データ提出]
        GatherTransactions[会計年度中の全取引データを集計\nすべての支出・収入を台帳化]
        AdjustmentEntry[決算調整仕訳\n未払金・前払金・\n減価償却費の計上\n経理基準に基づき]
        PrepareLedger[財務諸表（台帳）の作成\n一般会計・特別会計ごとに\n貸借対照表・収支計算書\n など]
        InternalAudit[会計課による内部確認\n計算ミス・論理矛盾がないか\n複数担当者によるチェック]
    end

    FinalClosing --> GatherTransactions
    GatherTransactions --> AdjustmentEntry
    AdjustmentEntry --> PrepareLedger
    PrepareLedger --> AuditReady

    subgraph システム財務会計
        AuditReady[監査委員による\n決算審査向けの資料準備\n領収書・契約書等の\n抽出・整理]
    end

    AuditReady --> InternalAudit
    InternalAudit --> ExternalAudit

    subgraph 財政課査定管理
        ExternalAudit[監査委員事務局への\n決算書類提出\nスケジュール通り\n通常6月30日まで]
    end

    ExternalAudit --> AuditProcess

    subgraph 上司決裁者
        AuditProcess[監査委員による\n決算審査\n（通常1～2か月）\n会計処理の適正性確認\n コンプライアンス確認]
        AuditResult{監査\n指摘\nあり?}
        CorrectFindings[会計課が修正対応\n次年度の措置を報告]
    end

    AuditProcess --> AuditResult

    AuditResult -- 指摘あり\n重大 --> CorrectFindings
    CorrectFindings --> ReauditSubmit

    AuditResult -- 指摘軽微\nまたはなし --> ApprovedAccounts

    subgraph 会計課
        ReauditSubmit[修正後に\n再度監査委員へ提出\n最終承認待ち]
        ApprovedAccounts[監査意見付き\n決算書を最終確定\n議会へ報告]
    end

    ReauditSubmit --> ApprovedAccounts
    ApprovedAccounts --> CouncilReview

    subgraph 議会予算審議
        CouncilReview[議会での決算特別委員会審議\n認定（承認）を議決\nまたは\n認定保留]
    end

    CouncilReview --> End_Approval

    subgraph システム財務会計
        End_Approval[決算確定\nシステムを新年度へ\n準備完了]
    end

    End_Approval --> End_OK

    End_OK([決算年度完了])

    style GatherTransactions fill:#e8f4f8,stroke:#3b82f6
    style AdjustmentEntry fill:#fff3cc,stroke:#e6ac00
    style InternalAudit fill:#fff3cc,stroke:#e6ac00
    style ExternalAudit fill:#fff3cc,stroke:#e6ac00
    style AuditResult fill:#fff3cc,stroke:#e6ac00
    style CouncilReview fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 各課（予算部門） | 支出負担行為・支出命令の申請・承認 | 随時（通年） |
| 出納室 | 支払処理の実行、現金・銀行口座管理 | 随時（通年） |
| 税務部門 | 市町村税の調定・収納・決算データ | 月次・年次 |
| 監査委員事務局 | 決算書類の審査 | 6月中旬～8月下旬 |
| 議会事務局 | 決算認定議案の提出・報告 | 8月～9月 |
| 企画財政部門 | 予算編成に向けた決算分析、決算情報の政策展開への活用 | 10月～12月 |

---

## 支出負担行為～支払の手続きの多様性

標準仕様書は「支出負担行為」「支出命令」「支払」の3段階の手続きを定めるが、
各段階での承認権者・承認基準・システム処理は自治体ごとに大きく異なる。

| 項目 | 標準仕様書での取扱い | 現実の多様性 |
|---|---|---|
| 支出負担行為の承認権限 | 原則課長、金額大は部長以上 | 自治体ごとに金額基準が異なる（50万、100万、など） |
| 支出命令の承認権限 | 原則課長、監査委員制度がある場合は監査委員承認 | 監査委員への報告時期・報告範囲が自治体で異なる |
| 決裁印鑑の使用 | 電子決裁またはハンコ | 混在（紙文書は判子、システムは電子決裁） |
| 支払遅延時の利息 | 契約書に明記する | 自治体によって遅延利息計算が異なる（年5%か年3%か） |
