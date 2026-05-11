---
psid_service_category: "C2"
psid_lifecycle: "L5"
psid_lifecycle_also: ["L2"]
spec_ref: "地方税法第340条〜第369条（固定資産税）標準運用ガイド（令和6年、総務省）"
spec_law: "第340条〜第369条（固定資産税）、第389条（評価替え）"
flow_type: "standard"
---

# 固定資産税 標準業務フロー

**出典**: 地方税法（昭和25年法律第226号）
**法令**: 第340条〜第369条（固定資産税）、第389条（評価替え）

> このフローは標準仕様の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 年度課税台帳整備フロー（毎年度サイクル）

```mermaid
flowchart TD
    Start([年度開始\n1月〜2月]) --> AssembleData

    subgraph システム
        AssembleData[前年度の課税台帳から\n開始データを抽出\nシステムで複製]
    end

    subgraph 関係機関（法務局・都道府県）
        LinkRegistry[住民基本台帳と\nマッチング\n所有者の住所・氏名\n最新化]
        LinkRegistrationOffice[法務局登記情報と\nマッチング\n所有権移転・分筆等\nを反映]
    end

    subgraph 課税担当（固定資産税課）
        IdentifyChanges{変動あり?}
        ReceiveNotification[新築・増改築届の\n受付・システム登録]
        ProcessLandTypeChange[地目変更申告\nまたは職権変更\n都市計画・農業委員会と連携]
        NoChange[変化なし]
        CalcValue[評価額計算\n前年度と同一方式で継続]
        CalcTax[税額計算\n評価額 × 税率\n1000円未満端数処理]
        CheckZeroProp{税額 = 0か\n非課税要件?}
        ZeroTax[非課税決定\n（公共用地等）]
        IssueNotice[納税通知書・\n課税明細書\n発行・郵送]
    end

    subgraph 収納担当
        CalcDebt[納期別納付額\n計算\n4期または12期]
        End_OK([完了\n納期開始])
    end

    AssembleData --> LinkRegistry
    LinkRegistry --> LinkRegistrationOffice
    LinkRegistrationOffice --> IdentifyChanges

    IdentifyChanges -- 新規・増改築 --> ReceiveNotification
    IdentifyChanges -- 地目変更 --> ProcessLandTypeChange
    IdentifyChanges -- その他 --> NoChange

    ReceiveNotification --> CalcValue
    ProcessLandTypeChange --> CalcValue
    NoChange --> CalcValue

    CalcValue --> CalcTax
    CalcTax --> CheckZeroProp

    CheckZeroProp -- 該当 --> ZeroTax
    CheckZeroProp -- 課税 --> IssueNotice

    ZeroTax --> IssueNotice
    IssueNotice --> CalcDebt
    CalcDebt --> End_OK

    style LinkRegistry fill:#e8f4f8,stroke:#3b82f6
    style LinkRegistrationOffice fill:#e8f4f8,stroke:#3b82f6
    style ProcessLandTypeChange fill:#fff3cc,stroke:#e6ac00
    style CalcValue fill:#fff3cc,stroke:#e6ac00
```

---

## 評価替え（3年に1回）フロー

```mermaid
flowchart TD
    Start([評価替え年度\n3年ごと 例:2022年]) --> NotifyResident

    subgraph 住民・納税者
        NotifyResident[住民向け説明会\n開催・チラシ配布\n「評価額が変わります」]
    end

    subgraph 課税担当（固定資産税課）
        EvalRefresh[全資産の評価額\nを再計算\n公示価格・売買事例から算定]
        RateReview[評価倍率・\n価格等の\n検証・決定]
        NotifyNewValue[新評価額の\nお知らせ送付\n前年度との比較]
        RecordsExamination{異議申立\nあり?}
        Hearing[異議申立に対する\n聞き取り・資料提出]
        CalcNewTax[新税額の\n計算]
        HearingReview{認定\nあり?}
        RecalcValue[評価額\n修正]
        IssueNewNotice[新納税通知書\n発行・郵送\n（通常より遅め）]
        End_OK([完了])
    end

    NotifyResident --> EvalRefresh
    EvalRefresh --> RateReview
    RateReview --> NotifyNewValue
    NotifyNewValue --> RecordsExamination

    RecordsExamination -- あり --> Hearing
    RecordsExamination -- なし --> CalcNewTax

    Hearing --> HearingReview
    HearingReview -- 認定 --> RecalcValue
    HearingReview -- 非認定 --> CalcNewTax

    RecalcValue --> CalcNewTax
    CalcNewTax --> IssueNewNotice
    IssueNewNotice --> End_OK

    style NotifyResident fill:#fff3cc,stroke:#e6ac00
    style EvalRefresh fill:#fff3cc,stroke:#e6ac00
    style Hearing fill:#ffcccc,stroke:#cc0000
```

---

## 新築・増改築評価フロー

```mermaid
flowchart TD
    Start([建築完了通知\nまたは検査済証提出]) --> ReceiveNotif

    subgraph 住民・納税者
        Start
    end

    subgraph 課税担当（固定資産税課）
        ReceiveNotif[新築・増改築届\n受付・整理\n物件所有者の確認]
        ConductSurvey[現地調査\n実施\n延べ面積・構造・\n工事費から評価額\nを算定]
        CheckCompletion{完成\nしている?}
        HoldEval[評価保留\n完成予定時期を\n把握]
        WaitNotif[完成通知\nを待機]
        CalcEval[評価額\n確定計算]
        CalcTax[税額計算\nその年度から\n課税]
        CheckNewBuilding{新築住宅\n軽減要件?}
        ApplyLightening[3年間（長期優良認定で\n5年間）の\n軽減措置適用\n家屋税額1/2]
        IssueNotice[納税通知書\n送付]
        End_OK([完了])
    end

    Start --> ReceiveNotif
    ReceiveNotif --> ConductSurvey
    ConductSurvey --> CheckCompletion

    CheckCompletion -- NO --> HoldEval
    CheckCompletion -- YES --> CalcEval

    HoldEval --> WaitNotif
    WaitNotif --> CalcEval

    CalcEval --> CalcTax
    CalcTax --> CheckNewBuilding

    CheckNewBuilding -- 適用 --> ApplyLightening
    CheckNewBuilding -- 非適用 --> IssueNotice

    ApplyLightening --> IssueNotice
    IssueNotice --> End_OK

    style ConductSurvey fill:#e8f4f8,stroke:#3b82f6
    style CalcEval fill:#fff3cc,stroke:#e6ac00
    style ApplyLightening fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 所有者の住所・氏名最新化、転出者確認 | 年1回（年度更新）、転出時 |
| 法務局登記情報 | 所有権移転・分筆・抵当権など登記事項の確認 | 年1回（年度更新）、月次 |
| 都市計画システム | 用途地域・市街化調整区域の確認、地目との対応確認 | 年1回、地目変更時 |
| 農業委員会 | 農地転用許可情報、採草放牧地の確認 | 年1回、転用時 |
| 建築管理システム | 新築・増改築の完了検査情報取得 | 随時 |
| 納税システム | 課税台帳から納期別納付予定額を転送 | 年1回（納税通知書前）、月次 |

---

## 評価額・税額の標準計算方法

標準仕様書は以下の計算原則を定めるが、各自治体の条例で調整される。

| 項目 | 内容 |
|---|---|
| 土地の評価 | 公示地価の1/3を基準に、地域の売買事例から補正率を算定 |
| 家屋の評価 | 建築後の経過年数・構造・機能低下率を考慮した再建築価格方式 |
| 償却資産の評価 | 取得価額から減価償却費を控除した帳簿価額に、取得年月日別減価率を乗じる |
| 課税標準 | 評価額（1000円未満端数切捨て）を基本とするが、負担調整措置により制限される |
| 税率 | 標準税率1.4%（地方譲与税・地方交付税の対象）。超過課税も可能 |
