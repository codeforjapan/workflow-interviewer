---
psid_service_category: "C4"
psid_lifecycle: "L6"
psid_lifecycle_also: ["L5", "L8"]
flow_type: "standard"
spec_ref: "国民年金システム標準仕様書【第2.0版】厚生労働省・日本年金機構 2024"
spec_law: "国民年金法 第7〜9条（被保険者）、第89〜90条（保険料免除・猶予）"
---

# 国民年金 標準業務フロー

**出典**: 国民年金システム標準仕様書【第2.0版】（令和6年、厚生労働省）
**法令**: 国民年金法 第7〜9条（被保険者）、第89〜90条（保険料免除・猶予）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 国民年金の実務は市区町村と日本年金機構が分担しており、
> 市区町村が担う「第1号被保険者の届出受付・免除申請」に焦点を当てる。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 市区町村の役割の整理

```
国民年金の業務分担:

  市区町村                          日本年金機構（年金事務所）
  ├─ 第1号被保険者の届出受付           ├─ 年金給付（老齢・障害・遺族）
  ├─ 保険料免除・猶予申請の受付        ├─ 被保険者記録の管理（基礎年金番号）
  ├─ 住所変更に伴う職権届出            └─ 保険料の徴収（口座振替等）
  └─ 住基連携による自動通知
```

---

## 第1号被保険者 資格取得フロー

```mermaid
flowchart TD
    Start([資格取得の契機\n退職・20歳到達・第2号喪失等])

    subgraph 住民・被保険者
        Start
    end

    subgraph 窓口担当（市民課）
        ReceiveApp[資格取得届受付\n退職日・基礎年金番号確認]
        CheckDocs{退職証明書等\nマイナンバー確認OK?}
        TempAccept[仮受付\n後日提出依頼]
    end

    subgraph 担当課（国保年金課）
        TriggerGW{取得事由}
        LinkedFromJyumin[住民異動届連携\n職権届出処理]
        SendJKK[年金機構への届出データ送信\neLTAX経由または直接連携]
    end

    subgraph 関係機関（日本年金機構）
        AutoNotice[日本年金機構から\n加入通知書が自動送付\n届出不要]
        End_Auto([年金事務所で手続き\n市区町村窓口は不要])
    end

    subgraph システム
        End_OK([完了\n納付書は年金機構から送付])
    end

    Start --> TriggerGW

    TriggerGW -- 20歳到達 --> AutoNotice
    TriggerGW -- 退職（会社員等） --> ReceiveApp
    TriggerGW -- 配偶者の退職\n（第3号→第1号） --> ReceiveApp
    TriggerGW -- 転入 --> LinkedFromJyumin

    AutoNotice --> End_Auto

    ReceiveApp --> CheckDocs

    CheckDocs -- 不足 --> TempAccept
    TempAccept --> SendJKK
    CheckDocs -- OK --> SendJKK

    LinkedFromJyumin --> SendJKK

    SendJKK --> End_OK

    style LinkedFromJyumin fill:#e8f4f8,stroke:#3b82f6
    style AutoNotice fill:#e8f4f8,stroke:#3b82f6
```

---

## 保険料免除・猶予申請フロー

```mermaid
flowchart TD
    Start([住民来庁\n免除・猶予申請希望])

    subgraph 住民・被保険者
        Start
    end

    subgraph 窓口担当（市民課）
        CheckType{申請種別}
        StudentCheck[学生証確認\n前年所得確認]
        StudentGW{要件OK?}
        MaternalCheck[出産予定日・出生届確認\n産前4か月〜産後翌々月まで]
    end

    subgraph 担当課（国保年金課）
        LegalExempt[法定免除確認\n障害年金受給確認]
        AutoExempt[職権で免除登録\n申請不要]
        IncomeCheck[前年所得確認\n税務システム照会\n本人・配偶者・世帯主]
        IncomeGW{所得基準内?}
        ExemptLevel[免除割合判定\n全額・3/4・半額・1/4]
        SendJKK_Exempt[年金機構への申請データ送信]
        Notice[受付票交付\n審査結果は年金機構から通知]
    end

    subgraph 関係機関（日本年金機構）
        End_NG([免除不可\n猶予制度を案内])
        End_OK([完了])
    end

    subgraph システム
    end

    Start --> CheckType

    CheckType -- 法定免除\n障害基礎年金2級等 --> LegalExempt
    CheckType -- 申請免除\n所得要件審査 --> IncomeCheck
    CheckType -- 納付猶予\n学生・若年者 --> StudentCheck
    CheckType -- 産前産後免除 --> MaternalCheck

    LegalExempt --> AutoExempt
    AutoExempt --> SendJKK_Exempt

    IncomeCheck --> IncomeGW

    IncomeGW -- YES --> ExemptLevel
    IncomeGW -- NO --> End_NG

    ExemptLevel --> SendJKK_Exempt

    StudentCheck --> StudentGW
    StudentGW -- YES --> SendJKK_Exempt
    StudentGW -- NO --> End_NG

    MaternalCheck --> SendJKK_Exempt

    SendJKK_Exempt --> Notice
    Notice --> End_OK

    style IncomeCheck fill:#e8f4f8,stroke:#3b82f6
    style ExemptLevel fill:#fff3cc,stroke:#e6ac00
    style MaternalCheck fill:#e8f4f8,stroke:#3b82f6
```

---

## 住所変更に伴う職権届出フロー

```mermaid
flowchart TD
    Start([転入届処理完了\n住基連携])

    subgraph 住民・被保険者
        Start
    end

    subgraph 担当課（国保年金課）
        CheckNenkin{第1号被保険者?}
        AutoAddress[住所変更の職権届出\n年金機構へ自動送信]
    end

    subgraph 関係機関（日本年金機構）
        End_Skip([届出不要\n第2・3号は年金機構が管理])
        End_OK([完了\n住民への通知不要])
    end

    subgraph システム
    end

    Start --> CheckNenkin

    CheckNenkin -- YES --> AutoAddress
    CheckNenkin -- NO --> End_Skip

    AutoAddress --> End_OK

    style AutoAddress fill:#e8f4f8,stroke:#3b82f6
```

---

## 標準仕様書が定める庁内・機関連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 転入・転出・死亡・氏名変更の自動通知 | 住民異動届処理後 |
| 税務システム | 前年所得の照会（免除審査用） | 免除申請受付時 |
| 日本年金機構 | 届出データ送信（eLTAX等） | 届出受付後、原則当日〜翌営業日 |
| 障害福祉システム | 障害基礎年金受給者の法定免除確認 | 随時 |

---

## 保険料免除・猶予の効果（担当者の説明ポイント）

| 種別 | 保険料 | 将来の年金額への影響 |
|---|---|---|
| 全額免除 | 0円 | 受給資格期間算入・給付額は1/2（国庫負担分） |
| 3/4免除 | 1/4負担 | 受給資格期間算入・給付額は5/8 |
| 半額免除 | 1/2負担 | 受給資格期間算入・給付額は3/4 |
| 1/4免除 | 3/4負担 | 受給資格期間算入・給付額は7/8 |
| 納付猶予 | 0円（後払い可） | 受給資格期間算入・給付額には反映されない |
| 学生納付特例 | 0円（後払い可） | 受給資格期間算入・給付額には反映されない |

> 追納（10年以内）によって給付額を回復できることを必ず案内する。
