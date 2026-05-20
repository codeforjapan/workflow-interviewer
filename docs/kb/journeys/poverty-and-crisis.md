---
file_type: "journey"
psid_lifecycle: "L12"
psid_services:
  - "C12"
  - "C13"
  - "C15"
  - "C1"
psid_ref: "https://github.com/codeforjapan/municipal-workflow-kb"
---

# 困窮・複合課題 住民ジャーニー

> **このジャーニーが重要な理由**
> 標準化対象20業務はすべて「単一制度への申請」を前提に設計されている。
> しかし現実の困窮世帯は複数の制度にまたがる課題を同時に抱えており、
> 「どの窓口に行けばいいか」自体がわからない。
> この領域こそ、**属人的暗黙知が最も濃縮され、インシデントリスクが最も高い**。

---

## ジャーニーの類型

困窮・複合課題は、入口となる「きっかけ」によって異なる経路をたどる。

```
きっかけ
  │
  ├─ 本人・家族が来庁（「相談があって…」）
  ├─ 民生委員・地域住民からの通報
  ├─ 他課からの引き継ぎ（転入届で気づく、等）
  ├─ 病院・学校からの連絡
  └─ 支援団体・NPOからの連絡

        ↓ いずれも最初にたどり着く窓口はバラバラ
        ↓ そこで「最初の担当者」が全体像を把握できるかどうかが分岐点
```

---

## 複合課題の構造マップ

8050問題・ダブルケア・DV＋困窮など、典型的な複合課題パターン。

```
【パターンA: 8050問題】
  80代の親（要介護）× 50代の子（ひきこもり・無職）
  │
  ├─ 介護保険 → workflows/_standardized-20/kaigo-hoken/
  ├─ 生活保護（親の年金が尽きた場合）→ workflows/_standardized-20/seikatsu-hogo/
  ├─ ひきこもり支援 → workflows/community-care/comprehensive-support/
  └─ 穴: 介護課・福祉課・就労支援課が縦割りで動き、誰も全体を見ていない
     → incident-catalog/complex-needs-no-coordinator.md

【パターンB: DV＋困窮】
  DV被害者が逃げてきた → 住所・生活・子育てが同時に崩壊
  │
  ├─ 住民異動届（住所秘匿）→ journeys/moving.md
  ├─ 児童手当 → workflows/_standardized-20/jido-teate/
  ├─ 生活保護 → workflows/_standardized-20/seikatsu-hogo/
  ├─ DVシェルター連携 → workflows/community-care/comprehensive-support/
  └─ 穴: 3課をまたぐ情報連携の失敗
     → incident-catalog/dv-cross-department.md

【パターンC: ダブルケア】
  育児（乳幼児）× 介護（親）を同時に担う30〜40代
  │
  ├─ 児童手当・保育所 → workflows/_standardized-20/jido-teate/
  ├─ 介護認定 → workflows/_standardized-20/kaigo-hoken/
  ├─ 介護者支援 → workflows/community-care/comprehensive-support/
  └─ 穴: 子育て支援課と介護保険課が別々に動き、当事者が「はざま」に落ちる
     → incident-catalog/double-care-gap.md
```

---

## 「最初の担当者」が持つべき判断フロー

複合課題の窓口対応で最も重要なのは、**最初の担当者がアセスメントできるかどうか**。

```
相談者が来た
  │
  □ 1. 緊急性の判断（最優先）
  │     ├─ 今夜の住む場所がない → 緊急対応へ（係長即エスカレーション）
  │     ├─ 食事が数日できていない → 緊急対応へ
  │     ├─ DV・虐待の疑い → DV対応フローへ（個室・係長）
  │     └─ 緊急性なし → 次へ
  │
  □ 2. 世帯構成の把握
  │     「今、一緒に住んでいる方はどなたですか？」
  │     → 子ども・高齢者・障害者の有無を確認
  │     → 各制度の担当課への連携を検討
  │
  □ 3. 「どこに相談すればいいかわからなかった」への対応
  │     担当外の相談でも「たらい回し」にしない
  │     → 一緒に担当課に電話する、または案内まで付き添う
  │     ※ この行動基準はマニュアル化されていないことが多い
  │       → 各自治体でカスタマイズが必要
  │
  □ 4. 重層的支援体制への接続
        → workflows/community-care/comprehensive-support/ 参照
```

---

## 穴の連鎖マップ

```
初回相談
  │
  ├─[穴D] 担当外だからと案内だけして終わる
  │        → 相談者が次の窓口に行く気力を失う
  │        → incident-catalog/triage-abandonment.md
  │
  ├─[穴E] アセスメントが属人的（ベテランしかできない）
  │        → 新人が対応すると複合課題を見落とす
  │        → incident-catalog/complex-needs-no-coordinator.md
  │
  └─[穴F] 各課が個別に動いて情報共有されない
           → 同じ世帯に複数の担当者が別々にアクセス
           → 支援の重複・矛盾・落ち漏れが発生
           → incident-catalog/complex-needs-no-coordinator.md
```

---

## 関連ジャーニー・業務フロー

- [moving.md](./moving.md) — 困窮者の転入は複合課題の入口になりやすい
- [aging-and-care.md](./aging-and-care.md) — 8050問題の介護側
- [workflows/community-care/comprehensive-support/](../workflows/community-care/comprehensive-support/) — 重層的支援体制の業務フロー
