---
psid_service_category: "C13"
psid_lifecycle: "L12"
psid_lifecycle_also: ["L5", "L6"]
flow_type: "standard"
spec_ref: "障害者総合支援システム標準仕様書【第1.0版】厚生労働省 2024"
spec_law: "身体障害者福祉法（身体障害者手帳）、精神保健及び精神障害者福祉に関する法律（精神障害者保健福祉手帳）、知的障害者福祉法・療育手帳制度要綱（療育手帳）"
---

# 障害者手帳・障害福祉サービス 標準業務フロー

**出典**: 障害者総合支援システム標準仕様書【第1.0版】（令和6年、厚生労働省）
**法令**: 身体障害者福祉法（身体障害者手帳）、精神保健及び精神障害者福祉に関する法律（精神障害者保健福祉手帳）、知的障害者福祉法・療育手帳制度要綱（療育手帳）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 障害者手帳は種別（身体・精神・療育）によって根拠法・判定機関が異なる。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 障害者手帳の種別と判定機関

```
身体障害者手帳     精神障害者保健福祉手帳     療育手帳（愛護手帳等）
  ├─ 根拠法: 身体障害者福祉法    ├─ 根拠法: 精神保健福祉法    ├─ 根拠: 療育手帳制度要綱
  ├─ 判定: 指定医による診断書    ├─ 判定: 精神保健指定医等     ├─ 判定: 知的障害判定機関
  └─ 交付: 都道府県知事          └─ 交付: 都道府県知事          └─ 交付: 都道府県知事
                                                                    （または指定都市市長）
  市区町村の役割: 申請受付・書類確認・都道府県への送付・手帳交付の代行
```

---

## 身体障害者手帳 新規申請フロー

```mermaid
flowchart TD
    Start([住民来庁\n身体障害者手帳申請希望]) --> FirstContact

    subgraph 住民・申請者
        FirstContact[相談・状況確認\n障害の種別・程度の聞き取り]
    end

    subgraph 窓口担当
        GuideDoctor[指定医への受診案内\n診断書様式の提供]
        ReceiveApp[申請書・診断書受付\n写真・マイナンバー確認]
        CheckDocs{書類OK?}
        TempAccept[仮受付\n不足書類の案内]
    end

    FirstContact --> GuideDoctor
    GuideDoctor --> ReceiveApp
    ReceiveApp --> CheckDocs

    CheckDocs -- 不足 --> TempAccept
    TempAccept --> SendPref
    CheckDocs -- OK --> SendPref

    subgraph 関係機関
        SendPref[都道府県へ書類送付\n市区町村経由が原則]
        PrefJudge[都道府県による審査\n身体障害者更生相談所]
        ReceiveCard[都道府県から手帳受領\n市区町村に配付]
        SendReject[非該当通知の送付\n不服申立て案内]
    end

    SendPref --> PrefJudge

    subgraph 窓口担当
        JudgeGW{判定結果}
    end

    PrefJudge --> JudgeGW

    JudgeGW -- 認定 --> ReceiveCard
    JudgeGW -- 非該当 --> SendReject

    subgraph 窓口担当
        IssueCall[交付通知を住民へ送付\n来庁日程調整]
        IssueCard[手帳交付\n等級・障害名の確認]
        GuideBenefits[関連制度の案内\n障害福祉サービス・各種割引等]
    end

    ReceiveCard --> IssueCall
    IssueCall --> IssueCard
    IssueCard --> GuideBenefits
    GuideBenefits --> End_OK([完了])

    SendReject --> End_Reject([終了])

    style FirstContact fill:#fff3cc,stroke:#e6ac00
    style GuideBenefits fill:#e8f4f8,stroke:#3b82f6
```

**標準的な処理期間**: 申請受付から手帳交付まで約2〜3か月（都道府県審査期間を含む）

---

## 精神障害者保健福祉手帳 申請フロー

```mermaid
flowchart TD
    Start([住民来庁\n精神障害者保健福祉手帳申請希望]) --> FirstContact

    subgraph 住民・申請者
        FirstContact[相談・状況確認\n受療状況・主治医の確認]
    end

    subgraph 窓口担当
        CheckMethod{申請方法}
        GuidePsych[精神保健指定医等\n診断書様式の提供]
        ReceiveYearCard[障害年金証書の確認\n診断書不要]
        ReceiveApp[申請書受付\n写真・マイナンバー確認]
        CheckDocs{書類OK?}
        TempAccept[仮受付\n不足書類の案内]
    end

    FirstContact --> CheckMethod
    CheckMethod -- 診断書による申請 --> GuidePsych
    CheckMethod -- 障害年金証書による申請 --> ReceiveYearCard

    GuidePsych --> ReceiveApp
    ReceiveYearCard --> ReceiveApp

    ReceiveApp --> CheckDocs

    CheckDocs -- 不足 --> TempAccept
    TempAccept --> SendPref
    CheckDocs -- OK --> SendPref

    subgraph 関係機関
        SendPref[都道府県へ書類送付]
        PrefJudge[都道府県による審査\n精神保健福祉センター]
        IssueCard[手帳交付\nまたは郵送]
        SendReject[非該当通知\n不服申立て案内]
    end

    SendPref --> PrefJudge

    subgraph 窓口担当
        JudgeGW{判定結果}
        GuideBenefits[関連制度の案内\n自立支援医療等]
    end

    PrefJudge --> JudgeGW

    JudgeGW -- 認定 --> IssueCard
    JudgeGW -- 非該当 --> SendReject

    IssueCard --> GuideBenefits
    GuideBenefits --> End_OK([完了])
    SendReject --> End_Reject([終了])

    style CheckMethod fill:#fff3cc,stroke:#e6ac00
```

**有効期限**: 2年（更新申請が必要）

---

## 障害福祉サービス 支給申請フロー

```mermaid
flowchart TD
    Start([住民来庁\nサービス利用希望]) --> Consult

    subgraph 住民・申請者
        Consult[相談支援専門員への繋ぎ\nまたは窓口での聞き取り]
        CheckHand{障害者手帳\n有り?}
    end

    Consult --> CheckHand

    subgraph 窓口担当
        CheckOther{難病・発達障害等\n対象となる可能性あり}
        GuideAssessment[障害支援区分認定の説明]
        GuideWelfare[相談支援窓口への案内]
        ReceiveApp[支給申請書受付\nサービス種別・希望内容の確認]
    end

    CheckHand -- NO --> CheckOther
    CheckOther -- YES --> GuideAssessment
    CheckOther -- NO --> GuideWelfare

    CheckHand -- YES --> ReceiveApp

    GuideAssessment --> ReceiveApp

    subgraph 担当課
        Assessment[障害支援区分認定調査\n調査員による聞き取り]
        Medical[主治医意見書の取得]
        Certification[認定審査会\n市区町村審査]
    end

    ReceiveApp --> Assessment
    Assessment --> Medical
    Medical --> Certification

    subgraph 窓口担当
        CertGW{区分判定}
        ServicePlan[サービス等利用計画作成\n相談支援専門員またはセルフプラン]
        Decision[支給決定\n種類・量・期間を決定]
        Notice[支給決定通知書・受給者証交付]
        Contract[事業所との契約\nサービス利用開始]
    end

    Certification --> CertGW

    CertGW -- 非該当〜区分1〜6 --> ServicePlan
    ServicePlan --> Decision
    Decision --> Notice
    Notice --> Contract
    Contract --> End_OK([完了])

    style Consult fill:#fff3cc,stroke:#e6ac00
    style Assessment fill:#e8f4f8,stroke:#3b82f6
    style Decision fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内・機関連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 住所・氏名変更の反映 | 住民異動届処理後 |
| 税務システム | 利用者負担額算定（所得状況確認） | 支給決定時・毎年度更新時 |
| 国民健康保険システム | 自立支援医療との給付調整 | 医療費助成申請時 |
| 国民年金システム | 障害基礎年金受給確認（法定免除連携） | 随時 |
| 都道府県（障害者更生相談所等） | 審査書類の送受信 | 申請受付後 |

---

## 各手帳の主な活用場面（窓口案内のポイント）

| 手帳種別 | 主な制度・サービス |
|---|---|
| 身体障害者手帳 | 障害福祉サービス、各種税の控除・減免、公共交通割引、補装具給付 |
| 精神障害者保健福祉手帳 | 障害福祉サービス、自立支援医療（精神通院）、各種税の控除・減免 |
| 療育手帳 | 障害福祉サービス、各種税の控除・減免、施設利用料の軽減 |

> 手帳の種別に関わらず「障害福祉サービス」は利用できる。
> 手帳を持っていなくても一定の要件を満たせば利用可能なサービスがある点を案内する。
