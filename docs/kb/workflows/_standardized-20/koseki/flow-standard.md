---
psid_service_category: "C1"
psid_lifecycle: ["L1", "L4", "L8"]
flow_type: "standard"
spec_ref: "戸籍システム標準仕様書【第2.0版】法務省 2024"
spec_law: "戸籍法 第13条（戸籍の記載事項）、第86条以下（届出）、第120条（戸籍の附票）"
---

# 戸籍・戸籍の附票 標準業務フロー

**出典**: 戸籍システム標準仕様書【第2.0版】（令和6年、法務省）
**法令**: 戸籍法 第13条（戸籍の記載事項）、第86条以下（届出）、第120条（戸籍の附票）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 婚姻届・離婚届受付フロー

```mermaid
flowchart TD
    Start([婚姻・離婚届]) --> TriggerType

    subgraph 住民・申請者
        Start
        TriggerType{届出\n種別}
    end

    TriggerType -- 婚姻 --> RecvMarriage
    TriggerType -- 離婚 --> RecvDivorce

    subgraph 窓口担当（戸籍担当）
        RecvMarriage[婚姻届受付\n本籍地または\n届出人住所地\nのいずれかで\n受付可]
        RecvDivorce[離婚届受付\n協議離婚は\n署名のみ\n調停は調停調書]
        CheckMarriage{婚姻届\n記載内容\nOK?}
        CheckDivorce{離婚届\n書類OK?\n調停書あり?}
        VerifyMarriage[本人確認\n署名・捺印\n確認]
        VerifyDivorce[本人確認\n署名確認\n調停書確認]
        NotifyMarriage[修正依頼\n再提出]
        NotifyDivorce[修正依頼]
    end

    RecvMarriage --> CheckMarriage
    RecvDivorce --> CheckDivorce

    CheckMarriage -- 記載不足 --> NotifyMarriage
    NotifyMarriage --> RecvMarriage
    CheckMarriage -- OK --> VerifyMarriage

    CheckDivorce -- 不完全 --> NotifyDivorce
    NotifyDivorce --> RecvDivorce
    CheckDivorce -- OK → VerifyDivorce

    VerifyMarriage --> CalcEffective1
    VerifyDivorce --> CalcEffective2

    subgraph 担当課（戸籍処理）
        CalcEffective1[婚姻効力発生日\n決定\n受付日が原則]
        CalcEffective2[離婚効力発生日\n決定\n受付日が原則]
        CrossCheck1{本籍地と\n届出地\n異なる?}
        CrossCheck2{本籍地と\n届出地\n異なる?}
        LocalReg1[戸籍に婚姻\n記載\n新本籍地・\n離婚の場合は\n筆頭者設定]
        LocalReg2[戸籍に離婚\n記載]
        UpdateAttachment1[戸籍の附票\nに変動を記録\n婚氏続称\n届出の案内]
        UpdateAttachment2[戸籍の附票\nに変動を記録\n新戸籍作成\nの可能性\n案内]
        NotifyComplete1[届出人に\n受理証明\n発行\n（必要に応じて）]
        NotifyComplete2[届出人に\n受理証明\n発行]
    end

    CalcEffective1 --> CrossCheck1
    CrossCheck1 -- YES → 異なる --> SendTransfer1
    CrossCheck1 -- NO --> LocalReg1

    CalcEffective2 --> CrossCheck2
    CrossCheck2 -- YES --> SendTransfer2
    CrossCheck2 -- NO --> LocalReg2

    subgraph 関係機関（法務局）
        SendTransfer1[本籍地に\n戸籍謄本等\n送付\n処理依頼]
        SendTransfer2[本籍地に\n離婚届\n転送]
    end

    SendTransfer1 --> LocalReg1
    SendTransfer2 --> LocalReg2

    LocalReg1 --> UpdateAttachment1
    LocalReg2 --> UpdateAttachment2

    UpdateAttachment1 --> NotifyComplete1
    UpdateAttachment2 --> NotifyComplete2

    NotifyComplete1 --> End_OK1([完了\n戸籍謄本交付\nへ])
    NotifyComplete2 --> End_OK2([完了\n戸籍謄本交付\nへ])

    style RecvMarriage fill:#e8f4f8,stroke:#3b82f6
    style RecvDivorce fill:#e8f4f8,stroke:#3b82f6
    style SendTransfer1 fill:#ffcccc,stroke:#cc0000
    style SendTransfer2 fill:#ffcccc,stroke:#cc0000
```

---

## 出生届・死亡届受付フロー

```mermaid
flowchart TD
    Start([出生・死亡届]) --> TriggerType

    subgraph 住民・申請者
        Start
        TriggerType{届出\n種別}
    end

    TriggerType -- 出生 --> RecvBirth
    TriggerType -- 死亡 --> RecvDeath

    subgraph 窓口担当（戸籍担当）
        RecvBirth[出生届受付\n出生地・本籍地\nいずれでも\n受付可\n医師の\n出生証明書\n必須]
        RecvDeath[死亡届受付\n本籍地で\n受付\n医師等の\n死亡診断書\n必須]
        CheckBirth{出生届\n記載OK?\n出生証明書\n有効?}
        CheckDeath{死亡届\n記載OK?\n死亡診断書\n有効?}
        VerifyBirth[出生日時\n本籍地\n子の氏\n確認]
        VerifyDeath[死亡年月日\n時刻\n本籍地\n確認]
        NotifyBirth[修正依頼\nまたは\n書類不足通知]
        NotifyDeath[修正依頼]
    end

    RecvBirth --> CheckBirth
    RecvDeath --> CheckDeath

    CheckBirth -- 不足 --> NotifyBirth
    NotifyBirth --> RecvBirth
    CheckBirth -- OK --> VerifyBirth

    CheckDeath -- 不足 --> NotifyDeath
    NotifyDeath --> RecvDeath
    CheckDeath -- OK --> VerifyDeath

    VerifyBirth --> CalcEffect1
    VerifyDeath --> CalcEffect2

    subgraph 担当課（戸籍処理）
        CalcEffect1[出生日が\n戸籍記載日\n決定]
        CalcEffect2[死亡日が\n戸籍記載日\n決定]
        CrossCheck1{出生地と\n本籍地\n異なる?}
        CrossCheck2{死亡地と\n本籍地\n異なる?}
        LocalReg1[戸籍に出生\n記載\n筆頭者との\n続柄確認\n届出人に\n受理証明書\n発行]
        LocalReg2[戸籍に死亡\n記載\n（何番目の\n者が死亡か\n記載）\n死亡原因\n も記載]
        UpdateAttach1[戸籍の附票\nに出生者\n追加\n新生児の\n住所確認]
        UpdateAttach2[戸籍の附票\nに死亡者\n削除\n国保・年金等\n保険関係\n自動通知]
    end

    CalcEffect1 --> CrossCheck1
    CrossCheck1 -- YES --> SendTransfer1
    CrossCheck1 -- NO --> LocalReg1

    CalcEffect2 --> CrossCheck2
    CrossCheck2 -- YES --> SendTransfer2
    CrossCheck2 -- NO --> LocalReg2

    subgraph 関係機関（法務局）
        SendTransfer1[本籍地に\n出生届転送]
        SendTransfer2[本籍地に\n死亡届転送]
    end

    SendTransfer1 --> LocalReg1
    SendTransfer2 --> LocalReg2

    LocalReg1 --> UpdateAttach1
    LocalReg2 --> UpdateAttach2

    UpdateAttach1 --> End_OK1([完了\n出生届が\n進学・入園\n契機に])
    UpdateAttach2 --> End_OK2([完了\n保険課・\n年金課へ\n自動通知])

    style RecvBirth fill:#e8f4f8,stroke:#3b82f6
    style RecvDeath fill:#e8f4f8,stroke:#3b82f6
    style SendTransfer1 fill:#ffcccc,stroke:#cc0000
    style SendTransfer2 fill:#ffcccc,stroke:#cc0000
```

---

## 戸籍謄本・抄本交付フロー

```mermaid
flowchart TD
    Start([戸籍謄本・抄本\n請求]) --> ReceiveReq

    subgraph 住民・申請者
        Start
    end

    subgraph 窓口担当（戸籍担当）
        ReceiveReq[請求書受付\n窓口・郵送・\nコンビニ\nいずれでも\n対応]
        CheckReq{請求内容\nOK?\n本籍地\n記載あり?}
        NotifyErr[請求者に\n確認照会]
        AuthOK1[本人確認\n身分証提示\nまたはマイナ\n確認]
        AuthOK2[親族関係\n確認\n戸籍謄本等\nで確認]
        AuthOK3[事由確認\n書類確認]
        ExtractData[請求内容に\n応じて\n謄本または\n抄本\n抽出]
        Print[交付票作成\n認定\n印刷\n署名]
        WindowDeliver[窓口で\nお渡し\n返納期限\n案内]
        MailDeliver[郵送で\n発送\n到着確認]
        ConvDeliver[コンビニで\n発行\n受取期限\n案内]
        Deny[請求却下\n却下通知\n送付]
    end

    ReceiveReq --> CheckReq

    CheckReq -- 不足 --> NotifyErr
    NotifyErr --> ReceiveReq
    CheckReq -- OK --> AuthCheck

    subgraph 担当課（戸籍処理）
        AuthCheck{本人\n親族\n第三者?}
        CheckAuth3{正当事由\n有る?}
    end

    AuthCheck -- 本人 --> AuthOK1
    AuthCheck -- 親族 --> AuthOK2
    AuthCheck -- 第三者 --> CheckAuth3

    CheckAuth3 -- 無し --> Deny
    CheckAuth3 -- 有り → 裁判等 --> AuthOK3

    AuthOK1 --> ExtractData
    AuthOK2 --> ExtractData
    AuthOK3 --> ExtractData

    ExtractData --> Print

    Print --> SendResp

    subgraph システム
        SendResp{窓口\nまたは\n郵送?}
    end

    SendResp -- 窓口 --> WindowDeliver
    SendResp -- 郵送 --> MailDeliver
    SendResp -- コンビニ --> ConvDeliver

    WindowDeliver --> End_OK1([完了])
    MailDeliver --> End_OK2([完了\n返納期限\n管理])
    ConvDeliver --> End_OK3([完了])
    Deny --> End_Deny([却下\nご依頼者に\n通知])

    style ReceiveReq fill:#e8f4f8,stroke:#3b82f6
    style AuthOK1 fill:#fff3cc,stroke:#e6ac00
    style AuthOK2 fill:#fff3cc,stroke:#e6ac00
    style CheckAuth3 fill:#ffcccc,stroke:#cc0000
    style Print fill:#e8f4f8,stroke:#3b82f6
```

---

## 戸籍の附票管理フロー

```mermaid
flowchart TD
    Start([戸籍の附票\n作成・更新\n住所履歴\n管理]) --> TriggerEvent

    subgraph 住民・申請者
        Start
    end

    subgraph 担当課（戸籍処理）
        TriggerEvent{契機}
        CreateAttach[戸籍の附票\n新規作成\n筆頭者の\n現住所\n記載]
        UpdateMove[戸籍の附票\n更新\n新住所を\n追記]
        UpdateOut[戸籍の附票\n転出先\n記載\n（本籍地\n変わらない\n場合）]
        UpdateMarital[戸籍の附票\n変動記録\n新筆頭者の\n場合は\n新たに\n作成]
        DeleteAttach[戸籍の附票\n削除\n保存期間\n経過後\n廃棄]
        RecordHistory[附票に\n記載:\n住所\n転入日\n転出日\n等]
        Preserve[30年間\n保存後\n廃棄]
    end

    TriggerEvent -- 新規戸籍\n作成時 --> CreateAttach
    TriggerEvent -- 転入届\n処理時 --> UpdateMove
    TriggerEvent -- 転出届\n処理時 --> UpdateOut
    TriggerEvent -- 婚姻・\n離婚届 --> UpdateMarital
    TriggerEvent -- 死亡届 --> DeleteAttach

    subgraph システム（住民基本台帳）
        LinkJumin1[住民基本\n台帳から\n住所\n自動連携]
        LinkJumin2[住民基本\n台帳から\n住所変動\n自動連携]
        LinkJumin3[住民基本\n台帳から\n転出情報\n自動連携]
        LinkJumin4[新本籍地\nの附票\n作成\n旧附票は\n保管]
    end

    CreateAttach --> LinkJumin1
    UpdateMove --> LinkJumin2
    UpdateOut --> LinkJumin3
    UpdateMarital --> LinkJumin4
    DeleteAttach --> Preserve

    LinkJumin1 --> RecordHistory
    LinkJumin2 --> RecordHistory
    LinkJumin3 --> RecordHistory
    LinkJumin4 --> RecordHistory

    RecordHistory --> End_OK1([管理継続])
    Preserve --> End_OK2([廃棄完了])

    style LinkJumin1 fill:#e8f4f8,stroke:#3b82f6
    style LinkJumin2 fill:#e8f4f8,stroke:#3b82f6
    style LinkJumin3 fill:#e8f4f8,stroke:#3b82f6
    style RecordHistory fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 転入・転出情報の自動受信、住所の附票へ反映 | 住民異動届処理後 |
| 戸籍情報連携システム（法務省） | 本籍地以外での謄本取得、戸籍情報共有 | 令和6年以降 |
| 他市区町村 | 本籍地と届出地が異なる場合の書類転送 | 届出受付時 |
| 国保・後期高齢者医療 | 死亡情報の自動通知（資格喪失） | 死亡届受付後 |
| 年金事務所 | 死亡情報の通知（年金給付停止） | 死亡届受付後 |

---

## 戸籍届出の種類と本籍地ルール

標準仕様書は以下の届出を定める。本籍地でない場所での届出は可能だが、本籍地への転送処理が生じる。

| 届出 | 受付地 | 本籍地転送 | 効力 |
|---|---|---|---|
| 婚姻届 | 本籍地または住所地 | YES（異なる場合） | 受付日 |
| 離婚届 | 本籍地または住所地 | YES（異なる場合） | 受付日 |
| 出生届 | 出生地または本籍地 | YES（異なる場合） | 出生日 |
| 死亡届 | 本籍地（原則） | NO（本籍地受付） | 死亡日 |
| 認知届 | 本籍地または住所地 | YES（異なる場合） | 受付日 |
| 婚氏続称届 | 本籍地 | NO | 受付日 |

---

## 令和6年施行の改正対応

令和6年3月27日施行の戸籍法改正により、以下が新たに対応が必要になった：

| 変更点 | 内容 |
|---|---|
| 本籍地外での謄本取得 | 全市区町村で本籍地以外の場所でも謄本・抄本取得可能に |
| 戸籍情報連携システム導入 | 法務省のシステムで全国的な戸籍情報共有（マイナンバー連携） |
| マイナカードの活用 | マイナカードによる本人確認強化 |
| 夜間・休日受付対応 | 一部自治体で拡大（死亡届の当番制等） |

---

## 戸籍の附票と住民票の違い

| 項目 | 戸籍の附票 | 住民票 |
|---|---|---|
| 管理主体 | 戸籍係 | 住民基本台帳係 |
| 記載内容 | 本籍地・氏名・住所履歴 | 住所・世帯構成 |
| 法的根拠 | 戸籍法第120条 | 住民基本台帳法 |
| 更新のタイミング | 転入届・転出届処理後 | 住民異動届処理後 |
| 保存期間 | 30年 | 5年 |
