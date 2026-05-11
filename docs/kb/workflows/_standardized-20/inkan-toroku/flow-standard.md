---
psid_service_category: "C1"
psid_lifecycle: ["L5"]
flow_type: "standard"
spec_ref: "印鑑登録証明事務処理要領（各自治体の条例・規則）"
spec_law: "印鑑登録法（廃止後、各自治体の条例に基づく）"
---

# 印鑑登録 標準業務フロー

**出典**: 印鑑登録証明事務処理要領（総務省通知）及び各自治体の印鑑登録条例・規則
**法令**: 印鑑登録法（廃止後、各自治体の条例に基づく）

> このフローは標準的な「あるべきフロー」。
> 自治体の条例・規則による差分、及び現実の運用との乖離は `gap-notes.md` を参照。

---

## 新規登録（本人申請）フロー

```mermaid
flowchart TD
    Start([印鑑登録の申請\n本人が来庁]) --> CheckResidence

    subgraph 住民・申請者
        Start
    end

    subgraph 窓口担当
        CheckResidence[住所確認\n住民基本台帳システムで本人確認]
        CheckAge{年齢確認\n15歳以上か?}
        CheckStatus{成年被後見人\nまたは被保佐人か?}
        CheckMulti{同一個人が\n複数登録か?}
        GuardianNotice[法定代理人同意確認\nまたは申請却下]
        ReceiveStamp[印鑑（実印）受け取り\n外観検査実施]
        PhotographStamp[印鑑の写真・画像記録]
        ReceiveIDDoc[本人確認書類確認\nマイナンバーカード・運転免許証等]
    end

    CheckResidence --> CheckAge

    CheckAge -- NO --> Reject1[申請受付不可\n年齢要件不符合]
    CheckAge -- YES --> CheckStatus

    CheckStatus -- YES --> GuardianNotice
    CheckStatus -- NO --> CheckMulti

    CheckMulti -- YES --> Reject2[登録不可\n重複登録]
    CheckMulti -- NO --> ReceiveStamp

    ReceiveStamp --> PhotographStamp
    PhotographStamp --> ReceiveIDDoc

    ReceiveIDDoc --> Register

    subgraph システム
        Register[システム登録\n登録番号（番地）付番]
        IssueCert[印鑑登録証発行\n暗証番号を付加]
    end

    Register --> IssueCert
    IssueCert --> End_OK([完了\n証明書発行可能])

    GuardianNotice --> Decision

    subgraph 担当課（審査）
        Decision{法定代理人\n同意あり?}
    end

    Decision -- NO --> Reject3[申請受付不可\n法定代理人同意なし]
    Decision -- YES --> ReceiveStamp

    Reject1 -.-> End_NG([申請却下])
    Reject2 -.-> End_NG
    Reject3 -.-> End_NG

    style CheckResidence fill:#e8f4f8,stroke:#3b82f6
    style ReceiveStamp fill:#fff3cc,stroke:#e6ac00
    style IssueCert fill:#e8f4f8,stroke:#3b82f6
```

---

## 新規登録（代理申請）フロー

```mermaid
flowchart TD
    Start([代理人が代理申請\n登録本人と同時来庁・別日来庁]) --> CheckProxy

    subgraph 住民・申請者
        Start
    end

    subgraph 窓口担当
        CheckProxy{代理人の\n範囲確認}
        SendInquiry[照会書送付\n登録本人へ郵送]
        CheckConsent[登録本人に\n対する照会書作成]
        WaitReply[登録本人から\n回答書受領\n一定期間内]
        CheckReply{本人が\n同意か?}
        CheckResidence[住所確認\n住民基本台帳システムで本人確認]
        CheckMulti{同一個人が\n複数登録か?}
        ReceiveStamp[印鑑（実印）受け取り\n外観検査実施]
        PhotographStamp[印鑑の写真・画像記録]
        ReceiveIDDoc[代理人の確認書類確認\n代理人のマイナンバーカード等]
    end

    CheckProxy -- 配偶者・成人親族等 --> CheckConsent
    CheckProxy -- その他 --> Reject_Proxy[代理申請不可\n代理人の範囲外]

    CheckConsent --> SendInquiry
    SendInquiry --> WaitReply
    WaitReply --> CheckReply

    CheckReply -- NO --> Reject_Consent[代理申請受付不可\n本人不同意]
    CheckReply -- YES --> CheckResidence
    CheckReply -- 未回答 --> Reject_Timeout[代理申請受付不可\n期間経過]

    CheckResidence --> CheckMulti

    CheckMulti -- YES --> Reject_Multi[登録不可\n重複登録]
    CheckMulti -- NO --> ReceiveStamp

    ReceiveStamp --> PhotographStamp
    PhotographStamp --> ReceiveIDDoc
    ReceiveIDDoc --> Register

    subgraph システム
        Register[システム登録\n登録番号（番地）付番]
        IssueCert[印鑑登録証発行\n本人へ送付または代理人に渡付]
    end

    Register --> IssueCert
    IssueCert --> End_OK([完了])

    Reject_Proxy -.-> End_NG([申請却下])
    Reject_Consent -.-> End_NG
    Reject_Timeout -.-> End_NG
    Reject_Multi -.-> End_NG

    style SendInquiry fill:#fff3cc,stroke:#e6ac00
    style CheckReply fill:#fff3cc,stroke:#e6ac00
```

---

## 印鑑登録証明書交付フロー

```mermaid
flowchart TD
    Start([証明書交付の請求]) --> CheckMethod

    subgraph 住民・申請者
        Start
        CheckMethod{請求方法}
    end

    CheckMethod -- 窓口請求 --> WindowRequest
    CheckMethod -- コンビニ請求\nマイナカード利用 --> ConveniRequest
    CheckMethod -- 郵送請求 --> PostRequest

    subgraph 窓口担当
        WindowRequest[本人または代理人が来庁\n印鑑登録証・認印持参]
        CheckIDWindow[本人確認\n認印で署名・照合]
        CheckCert{印鑑登録証\n有効か?}
        CheckIDPost[本人確認書類確認\n署名の真正性確認]
        CheckCertPost{登録情報\n有効か?}
        IssueWindow[証明書発行\n手数料収納]
        IssuePost[証明書発行\n手数料納付確認後郵送]
    end

    WindowRequest --> CheckIDWindow
    CheckIDWindow --> CheckCert

    PostRequest --> CheckIDPost
    CheckIDPost --> CheckCertPost

    CheckCert -- YES --> IssueWindow
    CheckCert -- NO/失効 --> Reject1[交付不可]

    CheckCertPost -- YES --> IssuePost
    CheckCertPost -- NO/失効 --> Reject3[交付不可]

    subgraph システム
        ConveniRequest[マイナンバーカード利用\n対応コンビニで直接取得]
        CheckCertConv{登録情報\n有効か?}
        IssueConv[証明書コンビニ発行\n手数料自動収納]
    end

    ConveniRequest --> CheckCertConv

    CheckCertConv -- YES --> IssueConv
    CheckCertConv -- NO/失効 --> Reject2[交付不可]

    IssueWindow --> End_OK([完了])
    IssueConv --> End_OK
    IssuePost --> End_OK

    Reject1 -.-> End_NG([交付不可])
    Reject2 -.-> End_NG
    Reject3 -.-> End_NG

    style CheckIDWindow fill:#e8f4f8,stroke:#3b82f6
    style CheckIDPost fill:#e8f4f8,stroke:#3b82f6
    style IssueConv fill:#e8f4f8,stroke:#3b82f6
```

---

## 転出に伴う印鑑登録の自動廃止フロー

```mermaid
flowchart TD
    Start([住民異動届\n転出手続き]) --> TriggerGW

    subgraph 住民・申請者
        Start
    end

    subgraph 窓口担当
        TriggerGW[住民異動処理\n他市区町村への転出登録]
        NotifyCert[手続き完了案内で\n印鑑登録証返納の案内]
    end

    TriggerGW --> QueryInkan

    subgraph システム
        QueryInkan[住民基本台帳システムから\n印鑑登録データ照会]
        CheckReg{当該個人が\n印鑑登録\nありか?}
        NoReg[登録なし\nフロー終了]
        AutoCancel[自動廃止登録\n廃止年月日を転出予定日に設定]
    end

    QueryInkan --> CheckReg

    CheckReg -- NO --> NoReg
    CheckReg -- YES --> AutoCancel

    AutoCancel --> NotifyCert

    NotifyCert --> End_OK([完了\n新住所地での再登録可能])

    NoReg -.-> End_OK

    style QueryInkan fill:#e8f4f8,stroke:#3b82f6
    style AutoCancel fill:#e8f4f8,stroke:#3b82f6
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 本人確認・年齢確認・転出情報の受信 | 申請時、転出届処理後 |
| マイナンバーカード利用システム | マイナカード利用者による証明書コンビニ交付 | 証明書交付時（リアルタイム） |
| 関連市区町村の印鑑登録システム | 重複登録確認（将来） | 申請時（現在は未連携） |

---

## 印鑑登録の基本ルール（条例で定めるべき部分）

| 項目 | 内容 |
|---|---|
| 登録できる者 | 15歳以上の住民（条例で下限年齢設定可） |
| 成年被後見人・被保佐人 | 法定代理人の同意が必要（自治体によって対応異なる） |
| 1人1個の原則 | 同一人物は複数登録不可 |
| 代理申請の範囲 | 配偶者・成人親族など（条例で規定） |
| 照会書・回答書 | 代理申請時に本人確認する仕組み（紛失・流用リスク） |
| 証明書発行手数料 | 1通あたり250〜350円程度（条例で設定） |
| 印鑑の要件 | 変形・判読困難でないこと（条例で詳細設定） |
