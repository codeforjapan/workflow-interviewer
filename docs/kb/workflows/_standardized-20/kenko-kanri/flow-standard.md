---
psid_service_category: "C15"
psid_lifecycle: ["L1", "L2", "L7"]
flow_type: "standard"
spec_ref: "母子保健法・健康増進法・高齢者の医療確保法 標準仕様書"
spec_law: "母子保健法 第15条（妊娠の届出）、健康増進法 第8条（特定健康診査）"
---

# 健康管理・母子保健 標準業務フロー

**出典**: 母子保健法、健康増進法、高齢者の医療の確保に関する法律、各省通知
**法令**: 母子保健法 第15条（妊娠の届出）、健康増進法 第8条（特定健康診査）

> このフローは法令が定める「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 妊娠届出・母子健康手帳交付フロー

```mermaid
flowchart TD
    Start([妊娠確認\n産科医療機関受診]) --> ReceiveNotice

    subgraph 住民・対象者
        ReceiveNotice[妊娠届出書提出\n本人が来庁または郵送]
    end

    subgraph 保健師・担当者
        CheckDocs{必要書類\nそろっているか?}
        TempAccept[仮受付\n後日提出依頼]
        Reminder[期限内提出催促\nメール・電話]
        Register[妊娠記録をシステムに登録\n妊娠週数・予定日確定]
        RegisterAfter[書類完備後登録]
        Interview[伴走型相談支援の面談\nスタッフによる安心確認・情報提供]
        CheckConsent{相談支援\n実施できたか?}
        SkipSupport[令和5年から努力義務\n自治体の対応差あり]
        IssueTecho[母子健康手帳交付\n妊婦健康診査受診票・補助券同時交付]
        CheckMarriage{婚外子か?}
        SpecialNotice[特別な配慮\n本人意思確認]
    end

    ReceiveNotice --> CheckDocs
    CheckDocs -- 不足 --> TempAccept
    CheckDocs -- OK --> Register

    TempAccept --> Reminder
    Reminder --> RegisterAfter

    Register --> Interview
    RegisterAfter --> Interview

    Interview --> CheckConsent
    CheckConsent -- NO/未実施 --> SkipSupport
    CheckConsent -- YES --> IssueTecho

    SkipSupport --> IssueTecho

    IssueTecho --> CheckMarriage
    CheckMarriage -- YES --> SpecialNotice
    CheckMarriage -- NO --> NotifyOB

    SpecialNotice --> NotifyOB

    subgraph 医療機関
        NotifyOB[産科医療機関へ母子手帳交付を報告\n妊婦健診開始]
    end

    NotifyOB --> End_OK([完了\n妊婦健診スタート])

    style Interview fill:#fff3cc,stroke:#e6ac00
    style CheckConsent fill:#fff3cc,stroke:#e6ac00
    style IssueTecho fill:#e8f4f8,stroke:#3b82f6
```

---

## 乳幼児健診（1歳6か月・3歳）フロー

```mermaid
flowchart TD
    Start([対象者自動抽出\n1歳6か月到達児・3歳児]) --> SendNotice

    subgraph 保健師・担当者
        SendNotice[受診案内・予診票送付\n保護者宛に郵送]
        JudgeVenue{受診方式}
        GroupReserve[予約受付\nウェブ・電話]
        PrivateReserve[医療機関へ直接予約\n案内に記載]
        GroupCheckIn[当日来庁\n予診票回収・確認]
        PrivateCheckIn[医療機関で実施\n予診票持参]
        Record[健診結果を記録\nシステムに登録]
        JudgeResult{健診結果\nは?}
        NormalNotify[保護者に結果通知\nフォローアップ不要]
        FollowUp[フォローアップ健診の\n予約案内・保護者説明]
        Referral[医療機関への\n紹介・受診勧奨]
        Intervention[療育支援の利用勧奨\n福祉部門と連携]
        FollowUpExam[3か月後の\nフォローアップ健診実施]
        JudgeFollowResult{フォロー\n結果は?}
        MedicalCheck[医療機関での\n精密検査\n診断確定]
        TherapyStart[発達支援センター\nなどでの療育開始]
        CheckUnreceived{健診\n未受診者か?}
        FollowUpUnreceived[未受診者フォローアップ\n電話・家庭訪問]
        WaitResponse{応答\nあるか?}
        RescheduleExam[受診日程の\n再調整]
        HomeVisit[福祉部門へ報告\n虐待等の懸念確認]
    end

    SendNotice --> JudgeVenue
    JudgeVenue -- 集団健診 --> GroupReserve
    JudgeVenue -- 個別医療機関 --> PrivateReserve

    GroupReserve --> GroupCheckIn
    PrivateReserve --> PrivateCheckIn

    subgraph 医療機関
        HealthCheck[乳幼児健診実施\n医師による診察・検査]
    end

    GroupCheckIn --> HealthCheck
    PrivateCheckIn --> HealthCheck

    HealthCheck --> Record

    Record --> JudgeResult
    JudgeResult -- 正常 --> NormalNotify
    JudgeResult -- 要経過観察 --> FollowUp
    JudgeResult -- 要精密検査 --> Referral
    JudgeResult -- 発達上の懸念 --> Intervention

    FollowUp --> FollowUpExam
    FollowUpExam --> JudgeFollowResult
    JudgeFollowResult -- 改善 --> NormalNotify
    JudgeFollowResult -- 継続懸念 --> Referral

    Referral --> MedicalCheck
    Intervention --> TherapyStart

    NormalNotify --> CheckUnreceived
    MedicalCheck --> CheckUnreceived
    TherapyStart --> CheckUnreceived

    CheckUnreceived -- YES --> FollowUpUnreceived
    CheckUnreceived -- NO --> End_OK([完了])

    FollowUpUnreceived --> WaitResponse
    WaitResponse -- YES --> RescheduleExam
    WaitResponse -- NO --> HomeVisit

    RescheduleExam --> HealthCheck
    HomeVisit --> End_NG([経過観察\n次年度検討])

    style SendNotice fill:#e8f4f8,stroke:#3b82f6
    style CheckUnreceived fill:#fff3cc,stroke:#e6ac00
    style FollowUpUnreceived fill:#fff3cc,stroke:#e6ac00
```

---

## 特定健康診査（40〜74歳）フロー

```mermaid
flowchart TD
    Start([年度更新 4月\n対象者年齢確定]) --> ExtractTarget

    subgraph 保健師・担当者
        ExtractTarget[国民健康保険・後期高齢者医療対象者から\n40〜74歳を自動抽出]
        CheckCriteria{健診対象\nか?}
        Exclude[健診対象外\n生活保護受給者など]
        SendNotice[受診案内・受診券・予診票送付\n5月〜6月に郵送]
        JudgeVenue{受診方式}
        GroupReserve[予約受付\nウェブ・電話・郵送]
        PrivateReserve[医療機関へ直接予約\n案内に記載]
        WorkplaceExempt[事業主経由での\n健診実施\n報告受領]
        InputResult[健診結果を\nシステムに入力・登録]
        AnalyzeResult[健診結果の分析\nリスク層別化]
        JudgeIntervention{リスク\n判定は?}
        NormalNotify[結果通知\nかかりつけ医への手紙]
        MedicalRef[医療機関への\n受診勧奨通知]
        Guidance[保健指導\n対象者リスト化]
        GuidanceType{指導\n内容}
        Intensive[集中的な保健指導\n栄養・運動・禁煙など]
        Motivate[動機付け支援\nアプリ・WEB活用]
        HealthEd[集団での健康教育\nセミナー・講座]
        FollowEval[3か月後の\n評価実施]
        EvalResult{評価結果}
        CloseIntervention[介入終了\n次年度健診へ]
        ContinueGuidance[継続的な保健指導]
    end

    Start --> ExtractTarget
    ExtractTarget --> CheckCriteria
    CheckCriteria -- NO/除外事由あり --> Exclude
    CheckCriteria -- YES --> SendNotice

    SendNotice --> JudgeVenue
    JudgeVenue -- 集団健診 --> GroupReserve
    JudgeVenue -- 医療機関健診 --> PrivateReserve
    JudgeVenue -- 職域健診 --> WorkplaceExempt

    subgraph 医療機関
        GroupExam[集団健診会場での実施\n身体計測・血液検査・尿検査]
        PrivateExam[医療機関での実施\n受診券・予診票持参]
    end

    GroupReserve --> GroupExam
    PrivateReserve --> PrivateExam
    WorkplaceExempt --> InputResult

    GroupExam --> InputResult
    PrivateExam --> InputResult

    InputResult --> AnalyzeResult

    AnalyzeResult --> JudgeIntervention
    JudgeIntervention -- 異常なし --> NormalNotify
    JudgeIntervention -- 受診勧奨 --> MedicalRef
    JudgeIntervention -- 指導対象 --> Guidance

    Guidance --> GuidanceType
    GuidanceType -- 高リスク --> Intensive
    GuidanceType -- 動機付け支援 --> Motivate
    GuidanceType -- 健康教育 --> HealthEd

    Intensive --> FollowEval
    Motivate --> FollowEval
    HealthEd --> FollowEval

    FollowEval --> EvalResult
    EvalResult -- 改善 --> CloseIntervention
    EvalResult -- 継続必要 --> ContinueGuidance

    MedicalRef --> End_OK([完了\n医療機関受診へ])
    NormalNotify --> End_OK
    CloseIntervention --> End_OK
    ContinueGuidance --> End_OK

    Exclude --> End_NG([対象外])

    style ExtractTarget fill:#e8f4f8,stroke:#3b82f6
    style SendNotice fill:#e8f4f8,stroke:#3b82f6
    style GuidanceType fill:#fff3cc,stroke:#e6ac00
    style FollowEval fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 対象者の抽出（年齢・住所確認） | 妊娠届受付時、健診対象者自動抽出時 |
| 国民健康保険システム | 特定健診対象者の確認、受診資格の確認 | 受診券発行時、結果登録時 |
| 医療機関 | 妊婦健診結果の受領、特定健診結果の受領 | 健診実施後、定期受信 |
| 福祉部門（児童・介護） | 健診結果に基づく支援対象者の情報共有 | 結果分析後、支援必要時 |
| 後期高齢者医療システム | 特定健診受診対象者の確認 | 年度初期、受診券発行時 |

---

## 母子保健・特定健診の基本ルール

| 項目 | 内容 |
|---|---|
| 母子健康手帳 | 妊娠届出時に発行、生涯の健康記録 |
| 妊婦健診 | 妊娠初期から出産まで計14回の健診（国庫補助） |
| 伴走型相談支援 | 令和5年から努力義務、妊娠時・出生時・新生児訪問で実施 |
| 乳幼児健診 | 1歳6か月・3歳の2回（市区町村実施義務） |
| 未受診者フォローアップ | 虐待防止・発達支援の観点から全員把握が原則 |
| 特定健康診査対象 | 40〜74歳の国保・後期高齢者医療加入者 |
| 特定健診受診率 | 目標値は自治体によって異なる（全国平均50%程度） |
| 保健指導 | 健診結果に基づくリスク層別化と個別・集団指導 |
