---
psid_service_category: "C?"        # 例: "C1", "C2", "内部管理"
psid_lifecycle: "L?"               # 例: "L5"
psid_lifecycle_also: ["L?", "L?"]  # 関連ライフイベント（不要な場合は行ごと削除）
flow_type: "standard"
spec_ref: "[システム標準仕様書名]【第?.?版】[省庁名] YYYY-MM-DD"
spec_law: "[根拠法令] 第○条"

# 依存関係（任意。把握済みのものから記述する）
depends_on:
  - target: "concepts/household.md"          # 相対パス（workflow/journey/concepts）
    type: "definition_dependency"            # data / timing / definition / authority / notification
    note: "[この業務でどの定義に依存するか]"
  # - target: "workflows/.../flow-standard.md"
  #   type: "data_dependency"
  #   note: "[どのデータを受け取るか]"

triggers:
  - target: "workflows/_standardized-20/[業務名]/"
    event: "[この業務の処理が完了したとき、後続業務が必要になる条件]"
    note: "[窓口案内・期限等の補足]"

creates_risks:
  - target: "incident-catalog/INC-XXX-[slug].md"
    condition: "[このフローの欠陥・漏れがインシデントに転化する条件]"

concept_dependencies:
  - target: "concepts/[concept].md"
    note: "[この業務でその概念をどの文脈で使うか]"

review_status: "drafted"           # drafted / reviewed / verified
applicability_scope: "national-common"  # national-common / requires-local-check
---

# [業務名] 標準業務フロー

**出典**: [標準仕様書名・版・日付・省庁名]
**対応章**: [章番号] > [セクション名]
**法令**: [根拠法令 第○条]

> このフローは標準仕様書の機能要件に基づく「あるべきフロー」。
> 自治体の現実との差分は `gap-notes.md` を参照。

---

## [主要フロー名]

```mermaid
flowchart TD
    subgraph 住民・申請者
        A["[申請・届出]"]
    end

    subgraph 窓口担当
        B["受付・書類確認"]
        C{"要件充足？"}
    end

    subgraph 審査担当・システム
        D["審査・処理"]
        E["[完了通知・交付]"]
    end

    A --> B
    B --> C
    C -- 充足 --> D
    C -- 不備あり --> A
    D --> E
```

---

## 標準仕様書が定める主な連携

| 連携先システム | 連携内容 | タイミング |
|---|---|---|
| [システム名] | [データ内容] | [処理タイミング] |
