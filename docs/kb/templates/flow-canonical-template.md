---
psid_service_category: "[類型]"  # 内部調整 / 調達 / 会議運営 / 規制・監査 / 財政・補助 等
psid_lifecycle: "-"
flow_type: "canonical"
spec_ref: "なし（全国自治体の一般的な実務）"

# 依存関係（任意。把握済みのものから記述する）
creates_risks:
  - target: "incident-catalog/INC-XXX-[slug].md"
    condition: "[このフローの欠陥・漏れがインシデントに転化する条件]"

review_status: "drafted"           # drafted / reviewed / verified
applicability_scope: "national-common"  # national-common / requires-local-check
---

# [業務名] 典型業務フロー

## 業務概要

[業務の定義。典型的にどんな場面で発生し、誰が担当するか。全国的な実務の共通点を記述。]

## 対象の類型

| 類型 | 説明 | 特徴 |
|---|---|---|
| [類型1] | [説明] | [特徴] |
| [類型2] | [説明] | [特徴] |

## ワークフロー図

```mermaid
flowchart TD
    subgraph 担当課
        A["[開始・起案]"]
        D["[処理・記録]"]
    end

    subgraph 相手方・関係者
        B["[対応・提出]"]
    end

    subgraph 承認者・上位
        C{"[判断・承認]"}
    end

    A --> B
    B --> C
    C -- 承認 --> D
    C -- 差戻し --> A
```

## 補足説明

| ステップ | 担当者 | 留意点・暗黙知 |
|---|---|---|
| [ステップ名] | [担当] | [実務上の留意点] |
