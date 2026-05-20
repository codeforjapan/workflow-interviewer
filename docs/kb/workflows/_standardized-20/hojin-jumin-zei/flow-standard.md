---
psid_service_category: "C2"
psid_lifecycle: ["L6"]
spec_ref: "地方税システム標準仕様書【第2.0版】総務省 2024"
spec_law: "地方税法 第294条〜第319条（法人住民税：均等割・法人税割）"
flow_type: "standard"
---

# 法人住民税 標準業務フロー

**出典**: 地方税システム標準仕様書【第2.0版】（令和6年、総務省）
**法令**: 地方税法 第294条〜第319条（法人住民税：均等割・法人税割）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 法人設立・異動届受付フロー

```mermaid
flowchart TD
    Start([法人の設立・異動\n法務局登記]) --> ReceiveNotif{届出\n受付}

    subgraph 事業者
        Start
    end

    subgraph 課税担当（法人市民税課）
        ReceiveNotif
        ReceiveApp1[設立届・初年度\n申告書受付]
        ReceiveApp2[異動届受付\n変更内容確認]
        CheckDocs1{必要書類\nOK?}
        Notify1[書類不足通知\n提出期限設定]
        CheckDocs2{必要書類\nOK?}
        Notify2[書類不足通知]
        ExtractInfo1[法人情報抽出\n本店所在地・\n事業内容・\n資本金等]
        ExtractInfo2[変更情報抽出\n新所在地・\n異動年月日等]
        Register1[法人マスタ登録\n法人番号付番]
        UpdateInfo[法人情報更新\n課税地変更処理]
        RecordInfo1[課税台帳作成\n初年度税額\n計算準備]
        RecordInfo2[課税台帳更新\n効力発生日設定]
        End_OK1([完了\n初年度申告受付へ])
        End_OK2([完了\n翌年度賦課へ])
    end

    ReceiveNotif -- 設立届\n初回申告時に 受付 --> ReceiveApp1
    ReceiveNotif -- 異動届\n本店移転・\n支店設置等 --> ReceiveApp2

    ReceiveApp1 --> CheckDocs1
    CheckDocs1 -- 不足 --> Notify1
    Notify1 --> ReceiveApp1
    CheckDocs1 -- OK --> ExtractInfo1

    ReceiveApp2 --> CheckDocs2
    CheckDocs2 -- 不足 --> Notify2
    Notify2 --> ReceiveApp2
    CheckDocs2 -- OK --> ExtractInfo2

    ExtractInfo1 --> Register1
    ExtractInfo2 --> UpdateInfo

    Register1 --> RecordInfo1
    UpdateInfo --> RecordInfo2

    RecordInfo1 --> End_OK1
    RecordInfo2 --> End_OK2

    style ReceiveApp1 fill:#e8f4f8,stroke:#3b82f6
    style ReceiveApp2 fill:#e8f4f8,stroke:#3b82f6
    style Register1 fill:#fff3cc,stroke:#e6ac00
    style UpdateInfo fill:#fff3cc,stroke:#e6ac00
```

---

## 申告受付・税額計算フロー

```mermaid
flowchart TD
    Start([申告書受付\n確定申告・中間申告]) --> TriggerType{申告\n種別}

    subgraph 事業者
        Start
        RecvApp1[申告書・決算書受付\n税務署提出の別紙等添付]
        RecvApp2[中間申告書受付\n月次売上高等記載]
    end

    subgraph 課税担当（法人市民税課）
        TriggerType
        CheckApp1{申告書\n記載内容\nOK?}
        NotifyErr1[修正依頼\nまたは補正受付]
        CheckApp2{中間申告\n書類OK?}
        NotifyErr2[修正依頼]
        ExtractData1[納税地・\n資本金・\n売上高等\n抽出]
        ExtractData2[売上高・\n営業利益等\n抽出]
        CalcTax[法人税額算定\n及び地方譲与税から\n控除額算出]
        CalcMid[中間納付額算定]
        CalcLocal[法人住民税\nの計算\n均等割\n法人税割]
        RecordMid[仮納付額\nを記録]
        SplitCheck{本店・\n支店所在地\n分割対象?}
        SplitCalc[按分計算\n支店所在地別に\n税額配分]
        DirectReg[課税台帳に\n税額登録\n納期設定]
        IssueNotif[納税通知書\n発行]
        End_OK([完了\n納付受け付けへ])
    end

    TriggerType -- 確定申告 --> RecvApp1
    TriggerType -- 中間申告 --> RecvApp2

    RecvApp1 --> CheckApp1
    CheckApp1 -- 不足・誤記 --> NotifyErr1
    NotifyErr1 --> RecvApp1
    CheckApp1 -- OK --> ExtractData1

    RecvApp2 --> CheckApp2
    CheckApp2 -- 不足 --> NotifyErr2
    NotifyErr2 --> RecvApp2
    CheckApp2 -- OK --> ExtractData2

    ExtractData1 --> CalcTax
    ExtractData2 --> CalcMid

    CalcTax --> CalcLocal
    CalcMid --> RecordMid

    CalcLocal --> SplitCheck
    SplitCheck -- YES --> SplitCalc
    SplitCheck -- NO --> DirectReg

    SplitCalc --> DirectReg
    RecordMid --> DirectReg

    DirectReg --> IssueNotif
    IssueNotif --> End_OK

    style RecvApp1 fill:#e8f4f8,stroke:#3b82f6
    style RecvApp2 fill:#e8f4f8,stroke:#3b82f6
    style CalcTax fill:#fff3cc,stroke:#e6ac00
    style SplitCalc fill:#ffcccc,stroke:#cc0000
```

---

## 納付・収納フロー（年度サイクル）

```mermaid
flowchart TD
    Start([納期到来\n年4回分割納付\n6月・8月・\n11月・1月]) --> SendNotif

    subgraph 課税担当（法人市民税課）
        SendNotif[納税通知書\n及び納付書\n送付]
    end

    subgraph 事業者
        PayGW{納付\n状況}
        Paid[完納]
        AutoPay[自動収納\n記録]
        Reminder[督促状送付\n督促手数料加算]
        ReminderGW{再納付}
        Enforcement[滞納処分\n予告]
        EnforceGW{対応}
        Seizure[差押予告\n財産調査]
    end

    subgraph 収納担当
        UpdateRecord[課税台帳\nに納付情報\n反映]
        End_OK([完了])
    end

    SendNotif --> PayGW
    PayGW -- 期日内納付 --> Paid
    PayGW -- 口座振替 --> AutoPay
    PayGW -- 未納 --> Reminder

    AutoPay --> Paid
    Reminder --> ReminderGW
    ReminderGW -- 納付 --> Paid
    ReminderGW -- 未納継続 --> Enforcement

    Enforcement --> EnforceGW
    EnforceGW -- 納付 --> Paid
    EnforceGW -- 応じない --> Seizure

    Paid --> UpdateRecord
    Seizure --> UpdateRecord

    UpdateRecord --> End_OK

    style SendNotif fill:#e8f4f8,stroke:#3b82f6
    style Enforcement fill:#ffcccc,stroke:#cc0000
    style Seizure fill:#ffcccc,stroke:#cc0000
```

---

## 休廃業・解散処理フロー

```mermaid
flowchart TD
    Start([法人の\n休業・廃業・\n解散]) --> TriggerEvent{事由}

    subgraph 事業者
        Start
        ReceiveDec[休廃業届\n受付]
    end

    subgraph 関係機関（税務署）
        AutoNotif[法務局からの\n登記情報\n自動受信]
    end

    subgraph 課税担当（法人市民税課）
        TriggerEvent
        CheckDocs{書類\nOK?}
        NotifyErr[修正依頼]
        ExtractDate[休廃業予定日\n確定]
        CalcFinal{年度途中\n廃業?}
        CalcPortion[按分計算\n廃業月までの\n税額]
        CalcNormal[通常賦課\n最終年度分]
        FinalNotif[最終納税通知書\n発行]
        UpdateRecord[課税台帳に\n廃業区分\n記録]
        CancelReg[翌年度以降\n課税停止]
        End_OK([完了])
    end

    TriggerEvent -- 自発報告 --> ReceiveDec
    TriggerEvent -- 法務局通知 --> AutoNotif

    ReceiveDec --> CheckDocs
    CheckDocs -- 不足 --> NotifyErr
    NotifyErr --> ReceiveDec
    CheckDocs -- OK --> ExtractDate

    AutoNotif --> ExtractDate

    ExtractDate --> CalcFinal
    CalcFinal -- YES --> CalcPortion
    CalcFinal -- NO --> CalcNormal

    CalcPortion --> FinalNotif
    CalcNormal --> FinalNotif

    FinalNotif --> UpdateRecord
    UpdateRecord --> CancelReg
    CancelReg --> End_OK

    style ReceiveDec fill:#e8f4f8,stroke:#3b82f6
    style AutoNotif fill:#e8f4f8,stroke:#3b82f6
    style CalcPortion fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 税務署（国税庁） | 法人税申告データ・所得情報の連携 | 年1回（確定申告期後） |
| 法務局 | 法人登記情報・異動情報 | リアルタイム（登記時） |
| 住民基本台帳システム | 本店住所地の住民票確認 | 届出受付時 |
| 固定資産税システム | 本店・支店所在地の固定資産情報 | 賦課計算時 |
| 納税通知システム | 納付管理・口座振替情報 | 年間通じて随時 |

---

## 法人住民税の課税方式（全国統一）

標準仕様書は課税対象となる法人と税額算定を定める。

| 計算要素 | 内容 |
|---|---|
| 均等割 | 法人の資本金等の額による段階的定額（全国統一） |
| 法人税割 | 法人税額に一定税率（13.1%）を乗じる（全国統一） |
| 本店・支店等の按分 | 複数都道府県に支店がある場合、従業員数等で按分 |
| 休廃業時の月割計算 | 年度途中廃業の場合、月数で按分計算 |

---

## 法人番号制度との関係

令和2年度以降、法人番号（総務省が付番）は法人住民税の課税番号として機能。
これにより:
- 他市区町村間での法人二重課税防止
- 申告書の電子化・自動処理の基盤形成
- 脱税防止（転出した法人の追跡）
