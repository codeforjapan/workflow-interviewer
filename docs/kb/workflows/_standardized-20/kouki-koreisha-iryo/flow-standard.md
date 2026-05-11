---
psid_service_category: "C3"
psid_lifecycle: "L7"
psid_lifecycle_also: ["L5", "L8"]
flow_type: "standard"
spec_ref: "高齢者の医療の確保に関する法律 標準運用ガイド（令和6年、厚生労働省）"
spec_law: "第10条〜第15条（被保険者）、第45条〜第47条（保険料）、第68条（負担額）"
---

# 後期高齢者医療 標準業務フロー

**出典**: 高齢者の医療の確保に関する法律（昭和57年法律第80号）
**法令**: 第10条〜第15条（被保険者）、第45条〜第47条（保険料）、第68条（負担額）

> このフローは標準仕様の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 資格取得（75歳到達）フロー

```mermaid
flowchart TD
    Start([年度内に75歳誕生日を迎える住民])

    subgraph 住民・被保険者（75歳以上）
        Start
    end

    subgraph 担当課（後期高齢者医療担当）
        PreCheckInJanuary[前年1月時点で\n75歳到達者を抽出\n住基システムで自動検知]
        SixMonthBefore[誕生日6か月前から\n事前案内開始]
        SendGuide1[案内資料送付\nQ&Aパンフレット・申請書]
        ThreeMonthBefore[誕生日3か月前\n「資格取得のお知らせ」送付\n保険証様式確認]
        OnMonthBefore[誕生日1か月前\n後期高齢者医療広域連合へ\n資格取得申請]
        IssueCard[保険証発行\n（広域連合から郵送）\nまたはマイナカード利用登録]
    end

    subgraph 広域連合
        AutoLossKokumin[誕生日当日\n国民健康保険を\n自動喪失登録]
        AutoAcquireKouki[同日\n後期高齢者医療を\n自動資格取得登録]
        CalcPremium[保険料決定\n所得・被扶養者等から計算\n（広域連合で実施）]
    end

    subgraph システム
        End_OK([完了])
    end

    Start --> PreCheckInJanuary

    PreCheckInJanuary --> SixMonthBefore

    SixMonthBefore --> SendGuide1

    SendGuide1 --> ThreeMonthBefore

    ThreeMonthBefore --> OnMonthBefore

    OnMonthBefore --> AutoLossKokumin

    AutoLossKokumin --> AutoAcquireKouki

    AutoAcquireKouki --> IssueCard

    IssueCard --> CalcPremium

    CalcPremium --> End_OK

    style PreCheckInJanuary fill:#e8f4f8,stroke:#3b82f6
    style AutoLossKokumin fill:#fff3cc,stroke:#e6ac00
    style AutoAcquireKouki fill:#fff3cc,stroke:#e6ac00
```

---

## 保険証・限度額認定証フロー

```mermaid
flowchart TD
    Start([保険証関連の申請・問い合わせ])

    subgraph 住民・被保険者（75歳以上）
        Start
    end

    subgraph 担当課（後期高齢者医療担当）
        TriggerGW{申請内容}
        LostCard[保険証紛失・破損\nの報告]
        LimitApp[限度額適用認定証\n申請]
        InfoReq[保険証内容照会\n・変更]
        VerifyPerson[本人確認\n住所・氏名・生年月日]
        CheckStatus{資格\nあり?}
        ErrorMsg[資格なし\nエラー案内]
        VerifyIncomeApp[所得状況の確認\n前年所得証明書等]
        CalcLimit[限度額区分を判定\nI〜III（一般）\nIV（低所得II）\nV（低所得I）]
        IssueLimit[限度額適用認定証\n発行]
        CheckInfo[システムで\n資格情報照会]
        ReplyInfo[電話・窓口で\n情報回答]
    end

    subgraph 広域連合
        ContactKohi[広域連合に\n再発行依頼]
        SendCard[保険証郵送\n郵便受け取り]
        SendLimit[認定証郵送\nまたは窓口交付]
    end

    subgraph システム
        End_OK([完了])
    end

    Start --> TriggerGW

    TriggerGW -- 再発行 --> LostCard
    TriggerGW -- 限度額認定 --> LimitApp
    TriggerGW -- その他 --> InfoReq

    LostCard --> VerifyPerson

    VerifyPerson --> CheckStatus

    CheckStatus -- YES --> ContactKohi
    CheckStatus -- NO --> ErrorMsg

    LimitApp --> VerifyIncomeApp

    VerifyIncomeApp --> CalcLimit

    CalcLimit --> IssueLimit

    ContactKohi --> SendCard

    IssueLimit --> SendLimit

    InfoReq --> CheckInfo

    CheckInfo --> ReplyInfo

    SendCard --> End_OK
    SendLimit --> End_OK
    ReplyInfo --> End_OK
    ErrorMsg --> End_OK

    style VerifyPerson fill:#e8f4f8,stroke:#3b82f6
    style CalcLimit fill:#fff3cc,stroke:#e6ac00
```

---

## 保険料賦課・徴収フロー（年度サイクル）

```mermaid
flowchart TD
    Start([年度更新\n4月〜5月])

    subgraph 住民・被保険者（75歳以上）
        CheckPayment{納付方法}
        AutoDeduct[4月・6月・8月・10月・12月・2月\n年6回 偶数月に\n老齢年金から徴収]
        PaymentApp[窓口・銀行\nでの納付]
        PaymentGW{納付状況}
        Paid([完納])
        ReminderGW{納付}
        ShortCard[短期被保険者証\n（概ね10か月）発行]
    end

    subgraph 担当課（後期高齢者医療担当）
        CalcIncome[前年度所得確定\n税務システムから連携]
    end

    subgraph 広域連合
        SendKohi[保険料決定通知書を\n広域連合から\n被保険者へ送付]
        MonitorDeduct[納付確認\n（広域連合で管理）]
        Reminder[督促通知送付\n（広域連合）]
        CheckEndYear[年度終了時に\n納付状況集計]
        SettleAccount[決算処理\n繰越金・赤字等を\n次年度に反映]
    end

    subgraph システム
        End_OK([翌年度へ])
    end

    Start --> CalcIncome

    CalcIncome --> SendKohi

    SendKohi --> CheckPayment

    CheckPayment -- 特別徴収\n年金天引き --> AutoDeduct

    CheckPayment -- 普通徴収 --> PaymentApp

    AutoDeduct --> MonitorDeduct

    PaymentApp --> PaymentGW

    PaymentGW -- 期日内納付 --> Paid

    PaymentGW -- 未納 --> Reminder

    MonitorDeduct --> CheckEndYear

    CheckEndYear --> SettleAccount

    Reminder --> ReminderGW

    ReminderGW -- 納付 --> Paid

    ReminderGW -- 未納継続 --> ShortCard

    ShortCard --> Paid

    SettleAccount --> End_OK

    style CalcIncome fill:#e8f4f8,stroke:#3b82f6
    style AutoDeduct fill:#e8f4f8,stroke:#3b82f6
    style CheckPayment fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 75歳到達者・転出者・死亡者情報の抽出 | 年1回（4月）・住民異動時 |
| 国民健康保険システム | 75歳到達者の国保喪失処理、データ移管 | 誕生日前日 |
| 後期高齢者医療広域連合 | 資格取得申請、保険料決定情報、納付状況照会 | 随時・年1回 |
| 税務システム | 所得情報の照会 | 保険料賦課時（年1回） |
| 介護保険システム | 要介護認定者の保険料軽減判定 | 随時 |

---

## 特別徴収（年金天引き）の基準

標準仕様書は以下の基準を定めているが、実装は広域連合と市町村の役割分担により異なる。

| 要件 | 内容 |
|---|---|
| 特別徴収対象者 | 老齢基礎年金・退職年金受給者で、年金額が年18万円以上 |
| 天引き額 | 保険料の2か月分を3回（4月・6月・8月）に分割、10月・12月・2月で調整 |
| 切替条件 | 普通徴収から特別徴収への切替は、前年の特別徴収税（住民税）対象要件と連動 |
| 停止要件 | 年金受給権喪失・一時停止時に自動停止 |
