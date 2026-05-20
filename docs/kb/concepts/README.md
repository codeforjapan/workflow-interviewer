# 概念競合ディレクトリ

## このディレクトリの目的

行政制度には、**同じ言葉が制度ごとに異なる定義を持つ**概念が多数存在する。

たとえば「世帯」は住民基本台帳・国民健康保険・税・生活保護でそれぞれ異なる定義を持つ。窓口担当者やシステムが「世帯」という言葉を何の断りもなく使うとき、どの「世帯」を指しているかが文脈によって変わる。

これが：
- 住民への誤案内（「同じ世帯だから対象です」→「でも国保世帯は別です」）
- 職員間の認識のズレ（課によって「世帯」の意味が違う）
- AIによる誤推論（「世帯が同じなら給付が同じ」という誤った推論）

の根本原因になる。

## このディレクトリの設計思想

- 「正しい定義はこれだ」と決めるのではなく、**複数の制度定義を並べて競合を可視化する**
- 各概念ファイルは「どの業務フローがこの競合に影響されるか」を示す
- AIが自動判断してはいけない箇所を明示的にマークする

---

## 概念の2種類

このディレクトリには2種類の概念ファイルが存在する。

### 1. 制度間競合型（`concept_type: "conflict"`）

**同じ言葉が制度ごとに異なる定義を持つ**概念。
例：「世帯」は住基・国保・税・生活保護でそれぞれ定義が異なる。

### 2. 役割型（`concept_type: "role"`）

**同じ人物が複数の役割を担い、役割・状態によって行政手続き上の扱いが変わる**概念。
例：「相続人」は承認・放棄・熟慮期間中で課税・給付上の扱いが全く変わる。

役割型の特徴：
- 同一人物が複数の役割を同時に持つことがある（「被保険者」かつ「被後見人」かつ「世帯主」等）
- 役割には**時間的な有効期限・発生条件**がある（相続は死亡時に発生、後見は審判確定後等）
- 「人を指す言葉」なのに制度・文脈によって誰を指すかが変わる

---

## ファイル一覧

### 制度間競合型

| 概念 | ファイル | 競合する制度数 |
|---|---|---|
| 世帯 | [household.md](./household.md) | 4制度以上（災害特例追記あり） |
| 収入・所得 | [income.md](./income.md) | 5制度以上（災害特例追記あり） |
| 扶養 | [dependent.md](./dependent.md) | 4制度以上 |
| 住所・居住地 | [domicile.md](./domicile.md) | 3制度以上（災害特例追記あり） |
| 不登校・長期欠席 | [truancy.md](./truancy.md) | 4制度以上 |
| 空き家 | [vacant-house.md](./vacant-house.md) | 5制度以上 |
| 条例・規則・要綱 | [ordinance-hierarchy.md](./ordinance-hierarchy.md) | 全業務横断（ai_caution最重要） |
| **罹災証明書・被害認定** | [disaster-certificate.md](./disaster-certificate.md) | 5制度以上（ai_caution） |
| **避難所の類型** | [evacuation-shelter.md](./evacuation-shelter.md) | 5類型（ai_caution） |
| **義援金・見舞金・支援金** | [disaster-relief-payment.md](./disaster-relief-payment.md) | 6制度以上（ai_caution） |

### 役割型

| 概念 | ファイル | 関連する主な場面 |
|---|---|---|
| 相続人 | [heir.md](./heir.md) | 固定資産税・年金・相続登記 |
| 代理人 | [agent.md](./agent.md) | 各種窓口手続き・申請代行 |
| 成年後見 | [adult-guardianship.md](./adult-guardianship.md) | 介護・生活保護・財産管理 |
| 親権者 | [parental-authority.md](./parental-authority.md) | 児童手当・保育・予防接種 |
| ヤングケアラー | [young-carer.md](./young-carer.md) | 教育・介護・子ども福祉・貧困 |
| **要配慮者・避難行動要支援者** | [disaster-vulnerable-person.md](./disaster-vulnerable-person.md) | 防災・避難支援・名簿管理（ai_caution） |

---

## frontmatter スキーマ

各概念ファイルの先頭には以下のYAMLフロントマターを付ける。

```yaml
---
file_type: "concept"
concept_type: "conflict"      # conflict（制度間競合型）または role（役割型）
concept_id: "CONCEPT-HOUSEHOLD"
concept_name: "世帯"
divergence_scope:             # 定義が競合する制度・文脈のリスト
  - "住基（住民基本台帳）"
  - "国保"
  - "税"
  - "生活保護"
related_workflows:            # この概念の競合が影響する業務フロー
  - "workflows/_standardized-20/jyumin-ido/"
related_incidents:            # この概念競合が関与するインシデント
  - "incident-catalog/INC-001-dv-cross-department.md"
ai_caution: true              # AIが自動判断してはいけない概念かどうか
review_status: "drafted"      # drafted / reviewed / verified
---
```

## 新しい概念を追加するとき

### 制度間競合型を追加する場合

1. 制度が異なるだけでなく「同じ言葉で別の意味」が使われている証拠を確認する
2. それが現場の誤案内・誤処理・AIの誤推論に直結しているかを確認する
3. `templates/concept-template.md` の「制度間競合型」セクションを使って記述する
4. `related_workflows` に影響を受ける業務フローを列挙する

### 役割型を追加する場合

1. 「同じ人物が役割・状態によって手続き上の扱いが変わる」証拠を確認する
2. 役割の**発生条件・消滅条件・時間的変化**を整理する
3. `templates/concept-template.md` の「役割型」セクションを使って記述する
4. `concept_type: "role"` を frontmatter に明記する
