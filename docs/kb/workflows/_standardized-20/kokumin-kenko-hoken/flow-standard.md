---
psid_service_category: "C3"
psid_lifecycle: "L5"
psid_lifecycle_also: ["L6", "L8", "L9"]
flow_type: "standard"
spec_ref: "国民健康保険システム標準仕様書【第2.0版】厚生労働省 2024"
spec_law: "国民健康保険法 第6〜9条（加入資格）、第76条（保険料賦課）"

# 依存関係
depends_on:
  - target: "workflows/_standardized-20/jyumin-ido/"
    type: "data_dependency"
    note: "住民票の転入・転出・世帯構成データが国保資格異動の起点"
  - target: "concepts/household.md"
    type: "definition_dependency"
    note: "国保世帯は住基世帯に準拠するが独自の世帯主概念を持つ"
  - target: "concepts/income.md"
    type: "definition_dependency"
    note: "国保保険料（所得割）の算定基礎所得は税法上の所得と計算方法が異なる"

triggers:
  - target: "workflows/_standardized-20/kouki-koreisha-iryo/"
    event: "国保被保険者が75歳に到達した場合"
    note: "国保から後期高齢者医療へ自動的に資格移行"

creates_risks:
  - target: "incident-catalog/INC-006-retirement-uninsured.md"
    condition: "退職後14日以内に国保加入届が提出されず、無保険期間が生じた場合"

concept_dependencies:
  - target: "concepts/household.md"
    note: "国保世帯・国保世帯主の定義"
  - target: "concepts/income.md"
    note: "保険料算定基礎所得の定義"

review_status: "drafted"
applicability_scope: "national-common"
---

# 国民健康保険 標準業務フロー

**出典**: 国民健康保険システム標準仕様書【第2.0版】（令和6年、厚生労働省）
**法令**: 国民健康保険法 第6〜9条（加入資格）、第76条（保険料賦課）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 加入（資格取得）フロー

```mermaid
flowchart TD
    Start([加入の契機\n転入・職場脱退・75歳未満のおくやみ等])

    subgraph 住民・被保険者
        Start
    end

    subgraph 窓口担当（市民課）
        TriggerGW{加入事由}
        ReceiveApp[資格取得届・申請書受付\n届出日を記録]
        CheckID[本人確認\nマイナンバー確認]
    end

    subgraph 担当課（国保年金課）
        CheckDocs{脱退証明書等\n書類OK?}
        TempAccept[仮受付\n後日提出依頼]
        CalcAcquireDate[資格取得年月日を確定\n事由発生日が原則]
        Register[システム登録\n世帯番号・被保険者番号付番]
        CalcPremium[保険料賦課計算\n所得・世帯員数・固定資産等]
        IssueCard[保険証（被保険者証）発行\nまたはマイナカード利用登録]
    end

    subgraph システム（国保システム・LGWAN）
        LinkedFromJyumin[住民異動届処理後\n自動連携データ受信]
        AutoRegister[自動資格取得登録\n保険証発行処理へ]
        CheckAlreadyLinked{住基連携で\n加入情報あり?}
    end

    subgraph 関係機関（都道府県・協会けんぽ）
        End_OK([完了])
    end

    Start --> TriggerGW
    TriggerGW -- 転入 --> LinkedFromJyumin
    TriggerGW -- 職場健保・共済\n脱退 --> ReceiveApp
    TriggerGW -- 生活保護廃止 --> ReceiveApp

    LinkedFromJyumin --> CheckAlreadyLinked
    CheckAlreadyLinked -- YES --> AutoRegister
    CheckAlreadyLinked -- NO --> ReceiveApp

    ReceiveApp --> CheckID

    CheckID --> CheckDocs

    CheckDocs -- 不足 --> TempAccept
    TempAccept --> CalcAcquireDate
    CheckDocs -- OK --> CalcAcquireDate

    CalcAcquireDate --> Register

    AutoRegister --> Register

    Register --> CalcPremium

    CalcPremium --> IssueCard

    IssueCard --> End_OK

    style LinkedFromJyumin fill:#e8f4f8,stroke:#3b82f6
    style AutoRegister fill:#e8f4f8,stroke:#3b82f6
    style CalcAcquireDate fill:#fff3cc,stroke:#e6ac00
```

---

## 喪失（資格喪失）フロー

```mermaid
flowchart TD
    Start([喪失の契機\n転出・職場健保加入・75歳到達・死亡等])

    subgraph 住民・被保険者
        Start
    end

    subgraph 窓口担当（市民課）
        ReceiveApp[資格喪失届受付\n健康保険証（職場）の提示確認]
    end

    subgraph 担当課（国保年金課）
        TriggerGW{喪失事由}
        CheckLossDate[喪失年月日を確定\n事由発生日の翌日が原則]
        RegisterLoss[システム上で資格喪失登録]
        ReturnCard[保険証返納\nまたはマイナカード利用停止処理]
        CheckOverpaid{保険料\n過払いあり?}
        Refund[過誤納還付計算\n還付通知書送付]
    end

    subgraph システム（国保システム・LGWAN）
        LinkedOut[住民異動届処理後\n自動連携データ受信]
        AutoLoss75[後期高齢者医療へ自動移行\n前日付で国保喪失]
    end

    subgraph 関係機関（都道府県・協会けんぽ）
        End_OK([完了])
    end

    Start --> TriggerGW

    TriggerGW -- 転出 --> LinkedOut
    TriggerGW -- 75歳到達 --> AutoLoss75
    TriggerGW -- 職場健保加入 --> ReceiveApp
    TriggerGW -- 死亡 --> ReceiveApp

    LinkedOut --> RegisterLoss
    AutoLoss75 --> RegisterLoss

    ReceiveApp --> CheckLossDate

    CheckLossDate --> RegisterLoss

    RegisterLoss --> ReturnCard

    ReturnCard --> CheckOverpaid

    CheckOverpaid -- YES --> Refund
    CheckOverpaid -- NO --> End_OK

    Refund --> End_OK

    style LinkedOut fill:#e8f4f8,stroke:#3b82f6
    style AutoLoss75 fill:#e8f4f8,stroke:#3b82f6
    style CheckLossDate fill:#fff3cc,stroke:#e6ac00
```

---

## 保険料賦課・徴収フロー（年度サイクル）

```mermaid
flowchart TD
    Start([年度更新\n4月〜5月])

    subgraph 住民・被保険者
        PayGW{納付状況}
        ReminderGW{納付}
        FinalGW{更なる未納}
        Paid([完納])
    end

    subgraph 窓口担当（市民課）
        Reminder[督促状送付\n督促手数料加算]
    end

    subgraph 担当課（国保年金課）
        CalcIncome[前年度所得確定\n税務システムから連携]
        CalcPremiumAll[全被保険者の保険料算定\n所得割・均等割・平等割]
        SendNotice[保険料決定通知書・納付書送付\n6月〜7月]
        ShortCard[短期被保険者証発行\n3か月更新]
        SuspendCard[資格証明書へ切替\n窓口10割負担]
    end

    subgraph システム（国保システム・LGWAN）
    end

    subgraph 関係機関（都道府県・協会けんぽ）
    end

    Start --> CalcIncome

    CalcIncome --> CalcPremiumAll

    CalcPremiumAll --> SendNotice

    SendNotice --> PayGW

    PayGW -- 期日内納付 --> Paid
    PayGW -- 未納 --> Reminder

    Reminder --> ReminderGW
    ReminderGW -- 納付 --> Paid
    ReminderGW -- 未納継続 --> ShortCard

    ShortCard --> FinalGW
    FinalGW -- 納付 --> Paid
    FinalGW -- 未納継続 --> SuspendCard

    style CalcIncome fill:#e8f4f8,stroke:#3b82f6
    style ShortCard fill:#fff3cc,stroke:#e6ac00
    style SuspendCard fill:#ffcccc,stroke:#cc0000
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 転入・転出・死亡情報の自動受信 | 住民異動届処理後 |
| 税務システム | 所得情報・固定資産税情報の照会 | 保険料賦課時（年1回） |
| 後期高齢者医療システム | 75歳到達者の自動移行 | 誕生日前日 |
| 生活保護システム | 医療扶助との重複排除 | 随時 |

---

## 保険料算定方式（自治体ごとに異なる部分）

標準仕様書は算定ロジックの**実装要件**を定めるが、**算定方式の選択**は各自治体の条例に委ねられている。

| 算定要素 | 内容 |
|---|---|
| 所得割 | 前年所得に一定率を乗じる（率は条例で設定） |
| 均等割 | 被保険者1人当たりの定額（額は条例で設定） |
| 平等割 | 1世帯当たりの定額（採用しない自治体もあり） |
| 資産割 | 固定資産税額に一定率を乗じる（廃止傾向） |
