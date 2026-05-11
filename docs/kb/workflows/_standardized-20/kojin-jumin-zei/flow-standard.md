---
psid_service_category: "C2"
psid_lifecycle: "L6"
psid_lifecycle_also: ["L5", "L8"]
spec_ref: "地方税法第294条〜第321条（個人住民税）標準運用ガイド（令和6年、総務省）"
spec_law: "第294条〜第321条（個人住民税）、第323条（特別徴収）"
flow_type: "standard"
---

# 個人住民税 標準業務フロー

**出典**: 地方税法（昭和25年法律第226号）
**法令**: 第294条〜第321条（個人住民税）、第323条（特別徴収）

> このフローは標準仕様の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 確定申告・住民税申告受付フロー

```mermaid
flowchart TD
    Start([1月1日〜3月15日\n申告受付期間]) --> TriggerCheck{申告が\n必要?}

    subgraph 住民・納税者
        TriggerCheck
        NoNeed[申告不要\n（確定申告不要制度）]
        NeedApp[申告必要\n住民税申告書\nまたは確定申告書]
    end

    subgraph 課税担当（市民税課）
        ReceiveApp[申告書受付\n①税務署での確定申告\n②市町村での住民税申告]
        VerifyPerson[本人確認\nマイナンバー確認\n申告内容チェック]
        CheckDoc{添付書類\nOK?}
        TempAccept[仮受付\n後日提出依頼]
        Registered[申告登録\nシステムに記録]
        CalcTax[住民税額計算\n所得控除・税額控除\n適用・減免審査]
        CheckMatch{税務署データと\n照合\n不一致あり?}
        ContactResident[住民に\n連絡\n修正手続き]
        Confirmed[申告内容\n確定]
    end

    subgraph 関係機関（税務署・都道府県）
        SystemLink[税務署から\n確定申告データを\n自動受信\nマッチング・統合]
    end

    subgraph 完了
        End_OK([5月末までに\n申告完了])
    end

    TriggerCheck -- 給与のみ\n税務署が把握 --> NoNeed
    TriggerCheck -- 給与+副業 --> NeedApp
    TriggerCheck -- 事業・農業 --> NeedApp
    TriggerCheck -- 一時所得 --> NeedApp

    NoNeed --> SystemLink
    NeedApp --> ReceiveApp

    ReceiveApp --> VerifyPerson
    VerifyPerson --> CheckDoc

    CheckDoc -- 不足 --> TempAccept
    CheckDoc -- OK --> Registered

    TempAccept --> Registered

    Registered --> CalcTax
    CalcTax --> SystemLink

    SystemLink --> CheckMatch

    CheckMatch -- あり → 修正必要 --> ContactResident
    CheckMatch -- なし → Confirmed

    ContactResident --> Confirmed
    Confirmed --> End_OK

    style ReceiveApp fill:#e8f4f8,stroke:#3b82f6
    style VerifyPerson fill:#e8f4f8,stroke:#3b82f6
    style CalcTax fill:#fff3cc,stroke:#e6ac00
    style SystemLink fill:#e8f4f8,stroke:#3b82f6
```

---

## 税額計算・決定フロー（5月から6月）

```mermaid
flowchart TD
    Start([4月末までに\n全申告完了]) --> PrepareMasterData

    subgraph システム
        PrepareMasterData[前年所得・\n控除情報を\n準備\nシステムで\n一括処理]
        CalcIncomeAll[全納税者の\n課税対象所得を\n計算]
        CalcTaxAmountAll[全納税者の\n住民税額を計算\n市町村税分・\n県税分]
        DetermineTax[住民税額\n確定\n決定通知書\n作成]
    end

    subgraph 課税担当（市民税課）
        CheckPaymentMethod{特別徴収対象?\n（給与天引き）}
        NotifyEmployer[特別徴収税額\n通知書を\n事業者に送付\n6月10日までに]
        PrepareBill[普通徴収\n納付書作成\n納期（4期）]
        SendNotice[住民税決定\n通知書\nを送付\n6月10日までに]
        End_OK([完了])
    end

    PrepareMasterData --> CalcIncomeAll
    CalcIncomeAll --> CalcTaxAmountAll
    CalcTaxAmountAll --> DetermineTax

    DetermineTax --> CheckPaymentMethod

    CheckPaymentMethod -- 対象 --> NotifyEmployer
    CheckPaymentMethod -- 非対象\nまたは\n自営業者 --> PrepareBill

    NotifyEmployer --> PrepareBill
    PrepareBill --> SendNotice
    SendNotice --> End_OK

    style PrepareMasterData fill:#e8f4f8,stroke:#3b82f6
    style CalcTaxAmountAll fill:#fff3cc,stroke:#e6ac00
    style CheckPaymentMethod fill:#fff3cc,stroke:#e6ac00
```

---

## 特別徴収（給与天引き）フロー

```mermaid
flowchart TD
    Start([給与所得者\n4月から6月]) --> NotifyAmount

    subgraph 課税担当（市民税課）
        NotifyAmount[特別徴収税額\n通知書送付\n(事業者向け)]
        CheckChange{年度途中\n異動あり?}
        RegularDeduct[毎月同額を\n給与から\n天引き\n4月〜翌年3月]
        HandleChange[異動届を\n新旧事業者から\nもらい\n対応]
    end

    subgraph システム
        MonthlyDeduct[毎月の\n天引き実績を\n事業者から\n報告\n(年1回)]
        YearEndAdjust[年度末\n(3月)に\n所得確定\nに基づき\n調整計算]
    end

    subgraph 住民・納税者
        FinalPayment{調整が\n必要?}
        Refund[還付\n4月以降\n対応]
        AddPayment[追徴\n(市町村が\n普通徴収\nで回収)]
        End_OK([完了])
    end

    NotifyAmount --> CheckChange

    CheckChange -- 異動なし --> RegularDeduct
    CheckChange -- 転職・退職 --> HandleChange

    RegularDeduct --> MonthlyDeduct
    HandleChange --> MonthlyDeduct

    MonthlyDeduct --> YearEndAdjust
    YearEndAdjust --> FinalPayment

    FinalPayment -- 過徴収 → 還付 --> Refund
    FinalPayment -- 過少徴収 → 追徴 --> AddPayment
    FinalPayment -- 完納 --> End_OK

    Refund --> End_OK
    AddPayment --> End_OK

    style NotifyAmount fill:#e8f4f8,stroke:#3b82f6
    style RegularDeduct fill:#e8f4f8,stroke:#3b82f6
    style YearEndAdjust fill:#fff3cc,stroke:#e6ac00
```

---

## 退職時の特別徴収→普通徴収切替フロー

```mermaid
flowchart TD
    Start([退職届出\n会社から\n届出]) --> ReceiveResignNotice

    subgraph 課税担当（市民税課）
        ReceiveResignNotice[退職所得控除\n申告書\n等を受付\n(1月以内)]
        CheckOption{退職所得の\n徴収方法\nを選択}
        DeductAtResign[勤務先が\n退職金から\n一括天引き]
        NoDeductOption[その年度\nの給与天引き\nのみで\n終了]
        CalcExemption[退職所得控除額\nを計算\n勤務年数から]
        CalcRetireTax[退職所得税額\n計算\nシステムで\n確定]
        PrepareNormal[次年度以降\n(通常の\nL6フロー)の\nための準備]
        CheckCarryOver{未払い\nがあるか?}
        PrepareJanuary[翌年1月\n以降に\n普通徴収\nで回収\n準備]
        Complete([完了])
        End_OK([普通徴収\n開始])
    end

    Start --> ReceiveResignNotice
    ReceiveResignNotice --> CheckOption

    CheckOption -- 勤務先で\n一括徴収\n希望 --> DeductAtResign
    CheckOption -- 申告分離\nなし --> NoDeductOption

    DeductAtResign --> CalcExemption
    NoDeductOption --> PrepareNormal

    CalcExemption --> CalcRetireTax
    CalcRetireTax --> PrepareNormal

    PrepareNormal --> CheckCarryOver

    CheckCarryOver -- あり → 退職後 --> PrepareJanuary
    CheckCarryOver -- なし → Complete

    PrepareJanuary --> End_OK

    style ReceiveResignNotice fill:#e8f4f8,stroke:#3b82f6
    style CheckOption fill:#fff3cc,stroke:#e6ac00
    style CalcExemption fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 税務署 | 確定申告データの自動受信・マッチング | 3月下旬から4月上旬 |
| 給与支払事業所 | 特別徴収税額通知、給与支払報告書の受付 | 6月10日までに通知、翌年1月31日までに報告書受付 |
| 住民基本台帳システム | 転出入・死亡情報の確認、課税自治体の判定 | 年1回（1月1日現在）・随時 |
| 生活保護システム | 生活保護受給者の税減免判定 | 随時 |
| 年金機構 | 退職年金受給者の確認（特別徴収対象判定） | 年1回 |

---

## 特別徴収と普通徴収の判定基準

標準仕様書は以下の基準により特別徴収該当者を決定するが、実装は自治体の条例で調整される。

| 項目 | 基準 |
|---|---|
| 特別徴収該当者 | 給与所得が主たる所得であり、給与支払事業所で給与支払報告書が提出されている者 |
| 特別徴収対象外 | 退職予定者、給与支払報告書提出なし、給与額が一定以下、前年度納付に問題あり等 |
| 税額通知方式 | 特別徴収税額通知書を事業者に6月10日までに送付（10枚複写式） |
| 給与との連携 | 5月から翌4月までの12か月間、毎月同額天引き（初月・最終月は異なる場合あり） |
| 年度途中の対応 | 転職時に「転職元での未徴収額」と「転職先での新規徴収」を調整 |
