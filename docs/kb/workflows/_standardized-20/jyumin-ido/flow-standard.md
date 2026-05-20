---
psid_service_category: "C1"
psid_lifecycle: "L5"
psid_lifecycle_also: ["L4", "L7", "L8"]
flow_type: "standard"
spec_ref: "住民記録システム標準仕様書【第5.0版】総務省 2024-03-28"
spec_law: "住民基本台帳法 第22〜24条"

# 依存関係
depends_on:
  - target: "concepts/household.md"
    type: "definition_dependency"
    note: "世帯の構成・世帯主の定義が転入処理の基礎"
  - target: "concepts/domicile.md"
    type: "definition_dependency"
    note: "「住所（生活の本拠）」の定義とDV支援措置特例"

triggers:
  - target: "workflows/_standardized-20/kokumin-kenko-hoken/"
    event: "国保加入資格者（社保未加入者）が転入した場合"
    note: "14日以内に国保加入届が必要。窓口での案内が必須"
  - target: "workflows/_standardized-20/kokumin-nenkin/"
    event: "第1号被保険者に該当する転入者がいる場合"
    note: "年金の種別変更届が必要"
  - target: "workflows/_standardized-20/jido-teate/"
    event: "転入世帯に中学生以下の子がいる場合"
    note: "児童手当の認定請求（転入月を含め15日以内）"
  - target: "workflows/_standardized-20/kaigo-hoken/"
    event: "転入者が要介護・要支援認定を受けている場合"
    note: "14日以内の引き継ぎ申請が必要。転入窓口での案内が鍵"

creates_risks:
  - target: "incident-catalog/INC-001-dv-cross-department.md"
    condition: "DV支援措置対象者の住所情報が他課・他系統に漏洩した場合"
  - target: "incident-catalog/INC-002-care-handover-14days.md"
    condition: "転入時に介護保険の引き継ぎ案内が漏れた場合"
  - target: "incident-catalog/INC-006-retirement-uninsured.md"
    condition: "退職者の転入時に国保加入案内が漏れ、無保険状態が継続した場合"

concept_dependencies:
  - target: "concepts/household.md"
    note: "世帯の構成・世帯分離・世帯主の認定"
  - target: "concepts/domicile.md"
    note: "住所の定義（生活の本拠）・DV支援措置・施設入所特例"

review_status: "drafted"
applicability_scope: "national-common"
---

# 住民異動届 標準業務フロー

**出典**: 住民記録システム標準仕様書【第5.0版】（令和6年3月28日、自治体システム等標準化検討会）
**対応章**: 第３章 機能要件 > 4 異動 > 4.1 届出（転入・転居・転出）
**法令**: 住民基本台帳法 第22〜24条

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 転入届フロー

```mermaid
flowchart TD
    Start([住民来庁・転入届提出]) --> CheckOnline

    subgraph 住民・申請者
        Start
        CheckOnline{マイナポータル\nオンライン転出済み?}
    end

    CheckOnline -- YES\nカード転入 --> CardTransfer
    CheckOnline -- NO --> CheckCert

    subgraph 窓口担当
        CheckCert{転出証明書\n持参あり?}
        ReceiveApp[転入届受付\n届出日を記録]
        CheckID[本人確認\n住民基本台帳法施行規則]
        CheckDV[支援措置フラグ確認\n住民基本台帳法28条の2]
        GuideDoc[転出証明書の\n取得方法を案内]
        CardTransfer[マイナカード読取\n転出通知確認]
    end

    CheckCert -- YES --> ReceiveApp
    CheckCert -- NO --> GuideDoc
    GuideDoc --> End_Incomplete([後日再来庁])
    CardTransfer --> ReceiveApp

    ReceiveApp --> CheckID

    CheckID --> ID_GW

    subgraph 担当課（審査）
        ID_GW{本人確認OK?}
        DV_GW{支援措置\n対象?}
        DVProcess[支援措置対応\n個別処理]
        InputSystem[住民基本台帳\nシステム入力\n転入日・新住所・世帯]
    end

    ID_GW -- NG --> End_NG([受付不可\n必要書類を案内])
    ID_GW -- OK --> CheckDV

    CheckDV --> DV_GW

    DV_GW -- YES --> DVProcess
    DV_GW -- NO --> InputSystem

    DVProcess --> InputSystem

    InputSystem --> LinkedUpdate

    subgraph システム
        LinkedUpdate[庁内他業務連携\n標準仕様書7.2章]
        Notice[関連手続き案内\n標準オプション機能8.1]
    end

    LinkedUpdate --> Notice
    Notice --> End_OK([完了])

    style CheckDV fill:#fff3cc,stroke:#e6ac00
    style DVProcess fill:#ffcccc,stroke:#cc0000
    style LinkedUpdate fill:#e8f4f8,stroke:#3b82f6
```

**標準仕様書が定める庁内連携（7.2章）の範囲:**

| 連携先 | タイミング | 方式 |
|---|---|---|
| 国民健康保険 | 転入処理後 | データ連携（標準） |
| 後期高齢者医療 | 転入処理後 | データ連携（標準） |
| 介護保険 | 転入処理後 | データ連携（標準） |
| 個人番号（マイナンバー） | 転入処理後 | 自動更新 |

---

## 転出届フロー

```mermaid
flowchart TD
    Start([住民来庁または\nマイナポータル]) --> Channel

    subgraph 住民・申請者
        Start
        Channel{申請経路}
    end

    Channel -- 窓口 --> WindowReceive
    Channel -- オンライン\nマイナポータル --> OnlineReceive

    subgraph 窓口担当
        WindowReceive[転出届受付\n届出日を記録]
        CheckID_Out[本人確認]
    end

    subgraph システム
        OnlineReceive[翌営業日バッチ処理\n受付日を届出日として記録]
    end

    OnlineReceive --> IssueNotice
    WindowReceive --> CheckID_Out
    CheckID_Out --> IssueNotice

    subgraph 担当課（審査）
        IssueNotice{マイナカード\n所持?}
        CardRecord[カードに転出通知記録\n転出証明書不要]
        IssueCert[転出証明書発行]
    end

    IssueNotice -- YES\nカード転出 --> CardRecord
    IssueNotice -- NO --> IssueCert

    CardRecord --> End_OK([完了\n転入先で手続き])
    IssueCert --> End_OK
```

**標準仕様書が定める転出証明書の有効期限**: 転出予定日から起算して30日

---

## 転居届フロー

```mermaid
flowchart TD
    Start([住民来庁]) --> ReceiveApp

    subgraph 住民・申請者
        Start
    end

    subgraph 窓口担当
        ReceiveApp[転居届受付\n届出日を記録]
        CheckID[本人確認]
    end

    ReceiveApp --> CheckID

    CheckID --> InputSystem

    subgraph 担当課（審査）
        InputSystem[新住所・世帯情報を更新\n住民基本台帳システム]
        MynumberUpdate[マイナカード\n記載事項変更\n当日対応推奨]
    end

    InputSystem --> MynumberUpdate

    MynumberUpdate --> LinkedUpdate

    subgraph システム
        LinkedUpdate[庁内他業務連携\n標準仕様書7.2章]
    end

    LinkedUpdate --> End_OK([完了])
```

---

## 標準仕様書が定める「実装必須機能」の要点

標準仕様書第5.0版 第3章 4.1節より、窓口担当者が知っておくべき要点:

**転入に関する必須機能（抜粋）:**
- 転入年月日・届出年月日の記録（異なる場合は両方記録）
- マイナンバーカードを用いた転入処理（カード転入）への対応
- 支援措置（DV等）フラグの引き継ぎ・設定

**標準オプション機能（自治体が選択できる）:**
- 本人通知サービス（住民票の写しの交付を本人に通知）
- 特別永住者への対応

**実装不可機能（カスタマイズ禁止）:**
- 独自の帳票フォーマット（標準様式から変更不可）
- 独自の管理項目の追加
