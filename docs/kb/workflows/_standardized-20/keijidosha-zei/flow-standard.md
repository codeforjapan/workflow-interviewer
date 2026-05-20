---
psid_service_category: "C2"
psid_lifecycle: ["L5", "L6"]
spec_ref: "地方税システム標準仕様書【第2.0版】総務省 2024"
spec_law: "地方税法 第442条〜第462条（軽自動車税）、消費税法（環境性能割）"
flow_type: "standard"
---

# 軽自動車税（種別割・環境性能割） 標準業務フロー

**出典**: 地方税システム標準仕様書【第2.0版】（令和6年、総務省）
**法令**: 地方税法 第442条〜第462条（軽自動車税）、消費税法（環境性能割）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 軽自動車登録（新規・移転・廃車）フロー

```mermaid
flowchart TD
    Start([軽自動車の\n登録・廃車]) --> TriggerType{登録\n事由}

    subgraph 住民・納税者
        Start
    end

    subgraph 関係機関（軽自動車検査協会等）
        NewReg[軽検協で\n新規登録申請]
        Transfer[軽検協で\n転入・移転登録]
        Discard[軽検協で\n廃車申告]
        NotifyMun1[軽検協から\n市区町村へ\n登録通知\n（自動連携）]
        NotifyMun2[軽検協から\n市区町村へ\n移転通知\n（自動連携）]
        NotifyMun3[軽検協から\n市区町村へ\n廃車通知\n（自動連携）]
    end

    subgraph 課税担当（軽自動車税担当）
        CheckReg1{課税\n台帳登録\n確認}
        CheckReg2{前住所地\n台帳から\n削除確認}
        CheckReg3{廃車\n手続き\n確認}
        NewEntry[課税台帳に\n新規登録\n初年度特例\n確認]
        UpdateEntry[課税台帳を\n更新\n減免申請\nあれば確認]
        DeleteEntry[課税台帳から\n削除\n廃車年月日\n記録]
        CalcInitial[初年度の\n軽自動車税\n又は\n環境性能割\n計算]
        CalcTransfer[転入地での\nも税額\n計算]
        RecordNew[課税台帳\nに記録\n登録番号・\n車種・\n初年度登録\n月記載]
        RecordTransfer[課税台帳\nに記録\n異動年月日\n更新]
        End_OK1([完了\n以降年度\nサイクルへ])
        End_OK2([完了\n翌年度\n賦課へ])
    end

    subgraph 収納担当
        End_Discard([完了\n以降課税なし])
    end

    TriggerType -- 新規登録\n購入時 --> NewReg
    TriggerType -- 転入・移転 --> Transfer
    TriggerType -- 廃車 --> Discard

    NewReg --> NotifyMun1
    Transfer --> NotifyMun2
    Discard --> NotifyMun3

    NotifyMun1 --> CheckReg1
    NotifyMun2 --> CheckReg2
    NotifyMun3 --> CheckReg3

    CheckReg1 -- 初回登録 --> NewEntry
    CheckReg2 -- 市内転入 --> UpdateEntry
    CheckReg3 -- 確認 --> DeleteEntry

    NewEntry --> CalcInitial
    UpdateEntry --> CalcTransfer
    DeleteEntry --> End_Discard

    CalcInitial --> RecordNew
    CalcTransfer --> RecordTransfer

    RecordNew --> End_OK1
    RecordTransfer --> End_OK2

    style NotifyMun1 fill:#e8f4f8,stroke:#3b82f6
    style NotifyMun2 fill:#e8f4f8,stroke:#3b82f6
    style NotifyMun3 fill:#e8f4f8,stroke:#3b82f6
    style CalcInitial fill:#fff3cc,stroke:#e6ac00
    style CalcTransfer fill:#fff3cc,stroke:#e6ac00
```

---

## 毎年度賦課・納付フロー

```mermaid
flowchart TD
    Start([年度更新\n4月〜5月]) --> PreCalc

    subgraph 課税担当（軽自動車税担当）
        PreCalc[前年度\n課税台帳\n確認]
        IdentifyVeh[課税対象\n軽自動車\n抽出]
        CheckDisc{廃車\n登録あり?}
        RemoveVeh[台帳から削除\n同一車両のみ除外]
        CalcTax[軽自動車税\n（種別割）計算\n車種別・\n初年度登録\n月別に\n異なる税率]
        CheckReduced{減免\n申請\nあり?}
        VerifyDoc[減免\n証明書\n確認]
        ApplyReduction[税額を\n100%\nまたは\n75%減免]
        NoReduction[通常税率\nのまま]
    end

    subgraph システム
        SendNotif[納税通知書\n及び納付書\n送付\n5月末]
    end

    subgraph 住民・納税者
        PayGW{納付\n状況}
        Paid[完納]
        AutoPay[自動収納\n記録]
        ConvPay[コンビニ\n納付\n記録]
        Reminder[督促状送付\n督促手数料\n加算]
        ReminderGW{再納付}
        ShortTerm[短期課税\n証明書\n発行\n再発行\n対応]
    end

    subgraph 収納担当
        UpdateRecord[課税台帳\n納付情報\n反映]
        End_OK([完了])
    end

    Start --> PreCalc
    PreCalc --> IdentifyVeh
    IdentifyVeh --> CheckDisc

    CheckDisc -- YES --> RemoveVeh
    CheckDisc -- NO --> CalcTax

    RemoveVeh --> CalcTax
    CalcTax --> CheckReduced

    CheckReduced -- YES → 障害者等 --> VerifyDoc
    VerifyDoc --> ApplyReduction
    CheckReduced -- NO --> NoReduction

    ApplyReduction --> SendNotif
    NoReduction --> SendNotif

    SendNotif --> PayGW

    PayGW -- 期日内納付 --> Paid
    PayGW -- 口座振替 --> AutoPay
    PayGW -- コンビニ納付 --> ConvPay
    PayGW -- 未納 --> Reminder

    AutoPay --> Paid
    ConvPay --> Paid
    Reminder --> ReminderGW
    ReminderGW -- 納付 --> Paid
    ReminderGW -- 未納 --> ShortTerm

    Paid --> UpdateRecord
    ShortTerm --> UpdateRecord

    UpdateRecord --> End_OK

    style IdentifyVeh fill:#e8f4f8,stroke:#3b82f6
    style CalcTax fill:#fff3cc,stroke:#e6ac00
    style VerifyDoc fill:#fff3cc,stroke:#e6ac00
    style Reminder fill:#ffcccc,stroke:#cc0000
```

---

## 減免申請・審査フロー

```mermaid
flowchart TD
    Start([減免申請\n障害者・\n生活保護\n等]) --> ReceiveApp

    subgraph 住民・納税者
        Start
        ReceiveApp[減免申請書\n受付]
    end

    subgraph 課税担当（軽自動車税担当）
        CheckDocs{必要書類\n（身障者手帳等）\nOK?}
        NotifyErr[書類不足通知\n再提出期限\n設定]
        Verify[減免要件\n確認\n所得確認\n必要に応じて]
        JudgeReq{減免\n要件\n満たす?}
        CalcDisc[減免率適用\n（100%or75%）\n税額再計算]
        Reject[申請却下\n却下通知\n送付]
        UpdateRecord[課税台帳\nに減免情報\n記録]
        SendDisc[減免決定\n通知書送付\n減免後の\n納税額\n案内]
        End_OK([完了\n減免後の\n金額で\n納付受付へ])
        End_Reject([完了\n納付書\nそのまま\n有効])
    end

    ReceiveApp --> CheckDocs

    CheckDocs -- 不足 --> NotifyErr
    NotifyErr --> ReceiveApp
    CheckDocs -- OK --> Verify

    Verify --> JudgeReq

    JudgeReq -- YES --> CalcDisc
    JudgeReq -- NO --> Reject

    CalcDisc --> UpdateRecord
    Reject --> End_Reject

    UpdateRecord --> SendDisc
    SendDisc --> End_OK

    style ReceiveApp fill:#e8f4f8,stroke:#3b82f6
    style CheckDocs fill:#fff3cc,stroke:#e6ac00
    style Verify fill:#fff3cc,stroke:#e6ac00
    style CalcDisc fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 軽自動車検査協会 | 登録・転入・廃車情報の自動受信 | リアルタイム（登録時） |
| 住民基本台帳システム | 転入時の課税地確認・転出時の削除 | 住民異動届処理後 |
| 障害福祉課 | 身体障害者手帳等の確認（減免申請） | 減免申請受付時 |
| 生活保護課 | 生活保護受給者の確認（減免対象確認） | 減免申請受付時 |
| 納税通知システム | 納付管理・口座振替情報 | 年間通じて随時 |

---

## 軽自動車税の税率体系（全国統一）

標準仕様書は課税対象となる車種と税額を定める。

| 項目 | 内容 |
|---|---|
| 種別割（旧名：軽自動車税） | 年額1,200円〜4,600円（車種別・初年度登録月別） |
| 環境性能割 | 新規登録時に3%〜0%（環境性能に応じた減税） |
| 初年度登録月の特例 | 登録翌年度から税額が加算される（初年度は低税率） |
| 身障者減免 | 身体障害者が所有・運転する軽自動車は100%または75%減免 |
| 生活保護世帯 | 条例で定める場合、減免対象となり得る |
| グリーン化税制 | 排出ガス・燃費基準達成車は減税 |

---

## 廃車手続きの留意点

軽自動車の廃車は軽検協への届出が必須。市区町村への届出ではなく検査機構への手続きが実務上の起点となる。
- 廃車申告（一時的に使用を中止する場合）
- 廃車登録（車両を解体する場合）

市区町村は軽検協からの通知を受けて初めて台帳から削除する受動的な立場。
