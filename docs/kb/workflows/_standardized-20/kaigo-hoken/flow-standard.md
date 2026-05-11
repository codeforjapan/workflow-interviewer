---
psid_service_category: "C13"
psid_lifecycle: "L7"
psid_lifecycle_also: ["L5", "L8"]
flow_type: "standard"
spec_ref: "介護保険システム標準仕様書 厚生労働省"
spec_law: "介護保険法 第27条（要介護認定）、第32条（要支援認定）"

# 依存関係
depends_on:
  - target: "workflows/_standardized-20/jyumin-ido/"
    type: "data_dependency"
    note: "住民票の住所・年齢データが被保険者資格の基礎"
  - target: "workflows/_standardized-20/kokumin-kenko-hoken/"
    type: "authority_dependency"
    note: "第2号被保険者（40〜64歳）は医療保険加入が前提条件"
  - target: "concepts/domicile.md"
    type: "definition_dependency"
    note: "施設入所時の住所地特例。住民票移動による保険者変更と住所地特例の選択"

creates_risks:
  - target: "incident-catalog/INC-002-care-handover-14days.md"
    condition: "転入時の介護認定引き継ぎ案内が転入窓口に届いておらず、14日が経過した場合"
  - target: "incident-catalog/INC-004-complex-needs-no-coordinator.md"
    condition: "要介護者が生活保護・障害福祉と複合する状況で調整者が不在になった場合"
  - target: "incident-catalog/INC-009-pension-overpayment-bereavement.md"
    condition: "被保険者死亡後の資格抹消・保険証回収が遅れた場合"

triggers:
  - target: "stakeholders/chiiki-houkatsu-shien-center.md"
    event: "要支援1・2または事業対象者と判定された場合"
    note: "地域包括支援センターによる介護予防ケアマネジメントへ移行"

concept_dependencies:
  - target: "concepts/domicile.md"
    note: "施設入所時の住所地特例・保険者判定"

review_status: "drafted"
applicability_scope: "national-common"
---

# 介護保険（要介護認定申請） 標準業務フロー

**出典**: 介護保険システム標準仕様書（厚生労働省）
**法令**: 介護保険法 第27条（要介護認定）、第32条（要支援認定）

---

## 要介護認定申請フロー

```mermaid
flowchart TD
    Start([申請の契機\n本人・家族来庁/地域包括/病院連絡]) --> AgeGW

    subgraph 住民・申請者
        AgeGW{年齢・被保険者区分}
    end

    AgeGW -- 65歳以上\n第1号被保険者 --> ReceiveApp
    AgeGW -- 40〜64歳\n第2号被保険者\n特定疾病のみ --> CheckDisease
    AgeGW -- 40歳未満 --> End_NG([対象外\n他制度案内])

    subgraph 窓口担当
        CheckDisease{特定疾病\n16種類に該当?}
        ReceiveApp[申請書受付\n申請日を記録]
        CheckDocs[必要書類確認\n保険証・本人確認]
    end

    CheckDisease -- NO --> End_NG
    CheckDisease -- YES --> ReceiveApp
    ReceiveApp --> CheckDocs

    subgraph 担当課
        InputSystem[介護保険システム入力\n申請日・被保険者番号]
    end

    CheckDocs --> InputSystem

    subgraph システム
        ParallelStart([並行処理開始])
    end

    InputSystem --> ParallelStart

    subgraph 調査員
        Survey[認定調査員アサイン\n訪問調査日程調整\n74項目チェック]
    end

    subgraph 医師
        DoctorOpinion[主治医意見書依頼\n主治医がいない場合は市が指定]
    end

    ParallelStart --> Survey
    ParallelStart --> DoctorOpinion

    subgraph 担当課
        PrimaryJudge[一次判定\nコンピュータ判定]
    end

    Survey --> PrimaryJudge
    DoctorOpinion --> PrimaryJudge

    subgraph 介護認定審査会
        Committee[介護認定審査会\n月2回開催\n二次判定]
    end

    PrimaryJudge --> Committee

    subgraph 担当課
        ResultGW{判定結果}
    end

    Committee --> ResultGW

    ResultGW -- 要介護1〜5 --> Notify
    ResultGW -- 要支援1〜2 --> Notify
    ResultGW -- 非該当 --> NonApproval[非該当通知\n地域包括支援センターへ案内]

    subgraph 担当課
        Notify[認定通知書送付\n⚡申請から原則30日以内]
    end

    Notify --> CareManager[ケアマネジャーへ情報提供]
    CareManager --> ServiceStart([サービス利用開始])
    NonApproval --> End_Non([総合事業・地域包括へ])

    style ParallelStart fill:#e8f4f8
    style Committee fill:#e8f4f8
    style Notify fill:#fff3cc,stroke:#e6ac00
```

---

## 転入時の引き継ぎ認定（最重要・14日ルール）

```mermaid
flowchart TD
    Transfer([要介護認定者が転入]) --> Check14

    subgraph 住民・申請者
        Check14{転入日から\n14日以内に申請?}
    end

    Check14 -- YES\n14日以内 --> FastTrack
    Check14 -- NO\n14日超過 --> NewApp

    subgraph 担当課
        FastTrack[引き継ぎ認定\n原則として転出元の認定を継続\n新たな調査は原則不要]
        NewApp[通常の新規申請\n認定まで最大30日]
    end

    FastTrack --> Notice_Fast[認定通知\n転入月からサービス継続可]
    NewApp --> Notice_New[認定通知\n申請月からサービス開始]

    style Check14 fill:#ffcccc,stroke:#cc0000
    style FastTrack fill:#e8f4f8
```

> ⚠️ この14日ルールを知らない担当者（転入窓口）が多い。
> 転入届受付時に介護保険証の確認・案内をしなければ14日が過ぎる。
> → `incident-catalog/INC-002-care-handover-14days.md`

---

## 標準仕様書が定める主な連携

| 連携先 | 内容 |
|---|---|
| 住民基本台帳システム | 被保険者情報の照会・更新 |
| 国民健康保険システム | 保険料算定との連携 |
| 後期高齢者医療システム | 75歳以上の被保険者管理 |
| 地域包括支援センター | 非該当・要支援者の情報共有 |

---

## 審査会の運営（標準仕様書が定める要件）

- 開催頻度: 各自治体が設定（月2回程度が標準）
- 委員構成: 保健・医療・福祉の専門家
- 審査方式: コンピュータ一次判定 + 特記事項・主治医意見書を加味した二次判定
- 有効期間: 原則6ヶ月（更新認定では最長48ヶ月まで）
