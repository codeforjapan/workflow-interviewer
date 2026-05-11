---
psid_service_category: "C15"
psid_lifecycle: ["L1", "L2", "L7"]
flow_type: "standard"
spec_ref: "予防接種に関する標準仕様書【第1.0版】厚生労働省 2023"
spec_law: "予防接種法 第4条～（定期接種）、第5条～（臨時接種）"
---

# 予防接種 標準業務フロー

**出典**: 予防接種に関する標準仕様書【第1.0版】（令和5年、厚生労働省）
**法令**: 予防接種法 第4条～（定期接種）、第5条～（臨時接種）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 定期接種対象者管理フロー

```mermaid
flowchart TD
    Start([定期接種対象者の抽出\nスケジュール：各月月初]) --> ExtractBorn

    subgraph 担当課
        ExtractBorn[住民基本台帳から該当月齢者を抽出\n1期・2期別に対象者リスト作成]
        QueryVRS{VRSで\n接種記録確認}
        SkipNotice[対象外とマーク\n案内対象外]
        CheckTransfer{転入者で\n旧自治体の\n記録あり?}
        ConfirmRecord[VRSの旧記録を確認\n重複接種チェック]
        ManualCheck[担当者が旧自治体へ\n接種記録照会]
        GenerateList[接種案内対象者リスト確定]
        SendNotice[保護者向け案内書送付\n接種機関・日程・持物]
        SendCoupon[接種クーポン\n（無料化対象）同封]
    end

    Start --> ExtractBorn
    ExtractBorn --> QueryVRS

    QueryVRS -- 接種済み --> SkipNotice
    QueryVRS -- 未接種 --> CheckTransfer

    CheckTransfer -- 旧記録あり\n連携済み --> ConfirmRecord
    CheckTransfer -- 旧記録未確認 --> ManualCheck

    ConfirmRecord --> GenerateList
    ManualCheck --> GenerateList
    SkipNotice --> GenerateList

    GenerateList --> SendNotice
    SendNotice --> SendCoupon

    subgraph 医療機関
        CreateSchedule[医療機関側に\n接種スケジュール提供]
    end

    SendCoupon --> CreateSchedule
    CreateSchedule --> End_OK([接種勧奨フロー完了])

    style ExtractBorn fill:#e8f4f8,stroke:#3b82f6
    style QueryVRS fill:#e8f4f8,stroke:#3b82f6
    style CheckTransfer fill:#fff3cc,stroke:#e6ac00
```

---

## 接種記録管理・入力フロー

```mermaid
flowchart TD
    Start([医療機関で接種実施]) --> ReportToMunicipality

    subgraph 医療機関
        ReportToMunicipality[医療機関がVRSへ\n接種報告（予診票スキャン等）]
    end

    subgraph システム
        VRSReceive{VRSで\n自動受信?}
    end

    ReportToMunicipality --> VRSReceive

    VRSReceive -- 自動受信\n成功 --> AutoRegister
    VRSReceive -- 手入力必要\nまたは遅延 --> ManualInput

    subgraph 担当課
        AutoRegister[VRS自動登録\n接種日・ワクチン種別]
        ManualInput[市町村担当者が\n手入力またはVRSデータ修正]
        UpdateHealthRecord[健康管理システムに\n母子健康手帳データ同期]
        SendCertificate[接種済証を\nオンライン発行\nまたは郵送]
        CheckNextSchedule{次回接種\nスケジュール\nあり?}
        SendNextNotice[次回接種案内を自動生成\n保護者へ送付]
    end

    AutoRegister --> UpdateHealthRecord
    ManualInput --> UpdateHealthRecord

    UpdateHealthRecord --> SendCertificate

    SendCertificate --> CheckNextSchedule

    CheckNextSchedule -- YES --> SendNextNotice
    CheckNextSchedule -- NO --> End_OK([管理完了])

    SendNextNotice --> End_OK

    style AutoRegister fill:#e8f4f8,stroke:#3b82f6
    style ManualInput fill:#fff3cc,stroke:#e6ac00
    style UpdateHealthRecord fill:#e8f4f8,stroke:#3b82f6
```

---

## 転入者の接種歴確認フロー

```mermaid
flowchart TD
    Start([転入者\n住民異動届提出]) --> ReceiveApplication

    subgraph 住民・対象者
        ReceiveApplication[転入者から転入前の\n接種記録有無を確認]
    end

    subgraph システム
        QueryVRS{新自治体VRSに\nすでに\n情報あり?}
    end

    ReceiveApplication --> QueryVRS

    QueryVRS -- 自動連携済み --> ConfirmData
    QueryVRS -- 未受信 --> RequestOldCity

    subgraph 担当課
        ConfirmData[転入元自治体から\n連携された記録を確認]
        RequestOldCity[転入元市町村へ\n接種記録照会依頼]
        ReceiveRecord[転入元からの回答待ち\n通常1～2週間]
        AssessGaps[接種漏れ・重複がないか\n確認・シミュレーション]
        GapGW{接種漏れ\nまたは\n不明な期間?}
        CreatePersonalPlan[個別予防接種予定表を\n保護者へ提供\n接種スケジュール提案]
        SendConfirm[接種済み確認書送付\nマイナポータル登録誘導]
    end

    ConfirmData --> AssessGaps
    RequestOldCity --> ReceiveRecord
    ReceiveRecord --> AssessGaps

    AssessGaps --> GapGW

    GapGW -- YES --> CreatePersonalPlan
    GapGW -- NO --> SendConfirm

    CreatePersonalPlan --> End_OK([手続き完了])
    SendConfirm --> End_OK

    style QueryVRS fill:#e8f4f8,stroke:#3b82f6
    style ReceiveRecord fill:#fff3cc,stroke:#e6ac00
    style AssessGaps fill:#fff3cc,stroke:#e6ac00
```

---

## 高齢者インフルエンザ等任意接種（公費助成）フロー

```mermaid
flowchart TD
    Start([高齢者インフルエンザ接種シーズン\n9月～11月]) --> ExtractElderly

    subgraph 担当課
        ExtractElderly[住民基本台帳から\n対象年齢者を抽出\n65歳以上等]
        CheckSubsidy{公費助成\n対象を\n確認}
        SendSubsidyNotice[公費助成通知\nクーポン券送付\n自己負担額明示]
        RegisterMedicalFacility[医療機関に\n助成対象者情報・助成額を提供]
    end

    Start --> ExtractElderly
    ExtractElderly --> CheckSubsidy

    CheckSubsidy -- 対象 --> SendSubsidyNotice
    CheckSubsidy -- 対象外 --> End_OutOfScope

    SendSubsidyNotice --> RegisterMedicalFacility

    subgraph 医療機関
        ImplReceive[医療機関から\n接種実績報告\n受診日・料金]
    end

    RegisterMedicalFacility --> ImplReceive

    subgraph 担当課
        CheckClaim{自己負担額\n回収状況}
        ClaimToCity[医療機関から\n市町村へ\n公費請求]
        ClaimProcess[住民からの\n払い戻し申請処理]
        PayMedicalFacility[公費分を\n医療機関へ支払]
        RefundResident[公費分を\n住民へ還付]
    end

    ImplReceive --> CheckClaim

    CheckClaim -- 医療機関が\n回収 --> ClaimToCity
    CheckClaim -- 住民が\n直接払い --> ClaimProcess

    ClaimToCity --> PayMedicalFacility
    ClaimProcess --> RefundResident

    PayMedicalFacility --> End_OK([接種シーズン終了])
    RefundResident --> End_OK
    End_OutOfScope --> End_OutOfScope([対象外\n完了])

    style ExtractElderly fill:#e8f4f8,stroke:#3b82f6
    style SendSubsidyNotice fill:#e8f4f8,stroke:#3b82f6
    style CheckClaim fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 年齢階級別対象者の月次抽出 | 毎月月初 |
| ワクチン記録システム(VRS) | 接種記録の登録・参照、全国連携 | リアルタイム（入力遅延あり） |
| 健康管理システム | 母子健康手帳データとの連携、妊婦接種の記録 | 接種後即日 |
| 医療機関 | 接種予定・実績・副反応報告の共有 | 月1回以上 |
| 保健所 | 感染症流行情報・接種勧奨方針の受信 | 随時 |

---

## VRS（ワクチン記録システム）の位置付け

定期接種・臨時接種の記録をオンラインで一元管理し、予診票スキャンや医療機関の電子カルテとの連携により、
市町村の手入力業務を軽減することが標準仕様書の理想。
ただし導入状況・運用の成熟度は自治体によって大きな差がある。

| 項目 | 現状のVRS機能 |
|---|---|
| 自動入力対象 | 医療機関の電子カルテ連携、予診票スキャン取込のみ |
| 手入力が必要な場合 | 紙予診票、転入者の旧記録、VRS未対応医療機関の報告 |
| 都道府県間の連携 | 全国ネットワークだが、開示権限の制限あり |
| マイナカード搭載 | 令和6年度末までに完全実装予定 |
