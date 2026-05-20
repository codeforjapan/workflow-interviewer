---
psid_service_category: "C12"
psid_lifecycle: ["L1", "L2"]
flow_type: "standard"
spec_ref: "子ども・子育て支援システム標準仕様書【第2.0版】内閣府・厚生労働省 2023"
spec_law: "子ども・子育て支援法 第19条～（教育・保育給付認定）、第27条～（施設型給付）、第30条（地域型保育給付）"
---

# 子ども・子育て支援（保育所等利用） 標準業務フロー

**出典**: 子ども・子育て支援システム標準仕様書【第2.0版】（令和5年、内閣府・厚生労働省）
**法令**: 子ども・子育て支援法 第19条～（教育・保育給付認定）、第27条～（施設型給付）、第30条（地域型保育給付）

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## 利用申請・保育の必要性認定フロー

```mermaid
flowchart TD
    subgraph 保護者・申請者
        Start([保護者が利用申請\n認可保育所・認定こども園等])
    end

    subgraph 窓口担当
        ReceiveApplication[利用申請書受付\n提出書類（課税証明・勤務証明等）を確認]
        CheckDocs{書類\n完備?}
        RequestDoc[不足書類の提出依頼\n提出期限を告知]
        WaitDoc[提出待ち\n締切内に提出]
        ConfirmApplication[申請完了確認\n申請日を記録]
    end

    subgraph 担当課（子育て支援課）
        QueryIncome{所得確認\nシステムで\n可能?}
        AutoQueryIncome[自動で所得情報取得\n市町村税務部門から連携]
        ManualConfirm[提出書類から所得確認\n担当者が課税証明を確認]
        IdentifyNeed[保育の必要性を判定\n1号・2号・3号認定判断]
        CalcClass{保育料\nランク\n計算}
        CalcChildcareRank[保育料ランク決定\n世帯所得・家族構成等から\n13段階の保育料基準表で算出]
        CalcKinderRank[利用者負担額\n決定\n認定基準により]
        IssueCertificate[教育・保育給付認定証を発行\n認定区分・有効期間・保育料記載]
    end

    subgraph 施設（保育所・認定こども園等）
        NotifyFacility[利用調整前に\n申請内容を施設へ通知\n保護者の希望順位や要望]
    end

    subgraph その他
        End_OK([認定完了\n次フローへ])
    end

    Start --> ReceiveApplication

    ReceiveApplication --> CheckDocs

    CheckDocs -- 不足 --> RequestDoc
    RequestDoc --> WaitDoc
    WaitDoc --> CheckDocs

    CheckDocs -- 完備 --> ConfirmApplication

    ConfirmApplication --> QueryIncome

    QueryIncome -- 税務システム連携可 --> AutoQueryIncome
    QueryIncome -- 手作業必要\n転入者等 --> ManualConfirm

    AutoQueryIncome --> IdentifyNeed
    ManualConfirm --> IdentifyNeed

    IdentifyNeed --> CalcClass

    CalcClass -- 保育所（2号・3号） --> CalcChildcareRank
    CalcClass -- こども園（1号） --> CalcKinderRank

    CalcChildcareRank --> IssueCertificate
    CalcKinderRank --> IssueCertificate

    IssueCertificate --> NotifyFacility

    NotifyFacility --> End_OK

    style AutoQueryIncome fill:#e8f4f8,stroke:#3b82f6
    style ManualConfirm fill:#fff3cc,stroke:#e6ac00
    style IdentifyNeed fill:#fff3cc,stroke:#e6ac00
    style CalcChildcareRank fill:#e8f4f8,stroke:#3b82f6
```

---

## 利用調整（入園希望者の選考）フロー

```mermaid
flowchart TD
    subgraph 担当課（子育て支援課）
        Start([受付期間終了\n利用調整開始\n通常1月～2月])
        GatherApplications[全認可施設の申請状況を集計\n施設別・保育必要度別に分類]
        CheckDemand{定員と\nニーズの\nバランス?}
        AllAccept[希望順位1位の施設に\n全員の内定・通知]
        CalcScore[保育の必要度スコア\nを計算\nスコア表に基づき\n優先度を算出]
        ScoreRule["スコア計算例:\n・就労フルタイム: 100点\n・パート勤務: 90点\n・求職活動中: 80点\n・育休中で未就労: 50点\n※加点（多子・ひとり親等）"]
        RankByScore[スコア順に希望者をランク付け\n定員に達するまで合意内定]
        CheckWaitlist{スコア同点で\n定員超過?}
        UseTiebreaker[同点時の優先順位\n：第1子年齢が低い\n：母の就労時間が長い\n（自治体ルール）]
        IssueDecision[利用調整結果通知書発行\n内定施設を記載]
        SendNotice[保護者へ郵送\nまたはメール通知\n希望施設以外の施設が内定\nすることもある]
        CheckAccept{保護者が\n内定施設を\n承諾?}
        ReturnToWaitlist[待機児童リストへ\n次のニーズが出るまで待機]
        Enroll[入園決定\n入園予定日・契約内容を\n施設と保護者に通知]
        MonitorWaitlist[定員空き状況を\n月1回以上確認\n空きが出れば\n再調整]
    end

    subgraph その他
        End_Waitlist([待機児童として\n継続管理])
        End_OK([利用調整完了\n入園手続きへ])
    end

    Start --> GatherApplications

    GatherApplications --> CheckDemand

    CheckDemand -- 余裕あり --> AllAccept
    CheckDemand -- 定員超過 --> CalcScore

    CalcScore --> ScoreRule

    ScoreRule --> RankByScore

    RankByScore --> CheckWaitlist

    CheckWaitlist -- YES --> UseTiebreaker
    CheckWaitlist -- NO --> IssueDecision

    UseTiebreaker --> IssueDecision

    IssueDecision --> SendNotice

    SendNotice --> CheckAccept

    CheckAccept -- 辞退 --> ReturnToWaitlist
    CheckAccept -- 承諾 --> Enroll

    ReturnToWaitlist --> MonitorWaitlist

    MonitorWaitlist --> End_Waitlist

    Enroll --> End_OK

    style CalcScore fill:#fff3cc,stroke:#e6ac00
    style ScoreRule fill:#ffe8e8,stroke:#e6ac00
    style UseTiebreaker fill:#fff3cc,stroke:#e6ac00
    style CheckAccept fill:#fff3cc,stroke:#e6ac00
```

---

## 保育料算定・徴収フロー

```mermaid
flowchart TD
    subgraph 担当課（子育て支援課）
        Start([月次\n入園者の保育料徴収\n通常月初の調定から'])
        BuildRoster[入園児童の月次一覧（名簿）を作成\n前月末の入園・退園を反映]
        QueryIncome{所得情報の\n更新\n必要?}
        AutoUpdateIncome[前年度の課税情報を\n自動取得\n保育料ランク再計算]
        CheckChangeApp{保育料減額\n申請あり?}
        ProcessChangeApp[減額申請を審査\n大幅所得減等の判定\n ランク変更\nまたは\n減額決定]
        CalcFeePerChild[児童ごとに保育料を計算\nランク×基準額\n多子軽減あり\n第2子以降は割引]
        AggregateFamily[世帯単位で集計\n同一世帯の兄弟姉妹料金を\n合計・軽減適用]
        CreateInvoice[調定通知書（請求書）を発行\n口座振替・納付書等で\n納付方法を指定]
        SendInvoice[保護者へ請求書を郵送\n納付期日（月末等）を明示]
        ReceivePayment[銀行振替・窓口納付で\n保育料を回収]
        MatchPayment[納付額と請求額を照合\n過不足額の確認]
        CheckOverUnder{過納・\n未納?}
        RefundProcess[過納額を返金\n口座振替で返金\nまたは\n次月相殺]
        ReminderProcess[督促状送付\n翌月の保育料と\n合わせての\n納付指示]
    end

    subgraph その他
        End_OK([月次請求完了])
    end

    Start --> BuildRoster

    BuildRoster --> QueryIncome

    QueryIncome -- 年度更新時\n4月 --> AutoUpdateIncome
    QueryIncome -- 年度中の変更 --> CheckChangeApp

    AutoUpdateIncome --> CalcFeePerChild
    CheckChangeApp -- YES --> ProcessChangeApp
    CheckChangeApp -- NO --> CalcFeePerChild

    ProcessChangeApp --> CalcFeePerChild

    CalcFeePerChild --> AggregateFamily

    AggregateFamily --> CreateInvoice

    CreateInvoice --> SendInvoice

    SendInvoice --> ReceivePayment

    ReceivePayment --> MatchPayment

    MatchPayment --> CheckOverUnder

    CheckOverUnder -- 過納あり --> RefundProcess

    CheckOverUnder -- 未納 --> ReminderProcess

    CheckOverUnder -- 納付済み --> End_OK

    RefundProcess --> End_OK
    ReminderProcess --> End_OK

    style AutoUpdateIncome fill:#e8f4f8,stroke:#3b82f6
    style CalcFeePerChild fill:#e8f4f8,stroke:#3b82f6
    style AggregateFamily fill:#e8f4f8,stroke:#3b82f6
    style CheckOverUnder fill:#fff3cc,stroke:#e6ac00
```

---

## 標準仕様書が定める庁内連携

| 連携先 | 内容 | タイミング |
|---|---|---|
| 住民基本台帳システム | 住所・世帯構成の確認、転出入情報 | 申請時・月次更新 |
| 税務システム | 課税台帳・所得情報の自動取得 | 4月（年度更新）、減額申請時 |
| 保育施設システム | 定員情報・入園児童名簿・請求明細の共有 | 利用調整時、月次 |
| 児童手当システム | 児童手当受給者の多子情報確認（保育料軽減判定） | 減額申請時 |
| 幼稚園システム | 1号認定（教育）と2号認定（保育）の兼ねて利用の管理 | 利用申請受付時 |

---

## 利用調整における選考基準の多様性

標準仕様書は「スコア表に基づいて優先度を算出すること」を定めるが、
スコア点数・加点項目は各自治体の「保育必要度判断基準」に基づいており、全国一律ではない。

| 加点・減点項目の例 | 標準仕様書での取扱い |
|---|---|
| ひとり親家庭 | 加点対象（推奨） |
| 祖父母との同居 | 加点対象（自治体によって異なる） |
| 育休明け就職 | 就労予定扱いで加点 |
| DV被害 | 自治体の判断で優先度アップ |
| きょうだい同一施設入園 | 自治体によって優先度判定が異なる |
| 認可外施設からの転園希望 | 一部自治体で加点 |

この差異のため「引っ越し前の自治体では一位で内定、新居先では待機児童」というケースが多発している。

---

## 多子軽減・保育料減額の基準ばらつき

保育料の軽減制度も自治体ごとに設計されており、標準仕様書は「仕組み」を定めるが「基準値」は定めない。

| 軽減タイプ | 現状 |
|---|---|
| 多子軽減（第2子以降） | 第2子50%減、第3子以降無料が一般的だが、所得制限を設ける自治体も |
| 兄弟同一施設入園時 | 一部加算（上の子の兼弟弟割引）が自治体で異なる |
| 認可外施設の給付対象化 | 新制度移行施設のみの自治体と、移行未了でも対象の自治体がある |
