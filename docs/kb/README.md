# 自治体業務ナレッジベース

**Municipal Workflow Knowledge Base** — Code for Japan / 公共ナレッジエンジニアリング開発室  
ライセンス: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)

---

## このリポジトリの目的

全国の自治体に共通する業務の「標準フロー」と「穴の連鎖」を集合知として蓄積し、  
**重大インシデントの予防**と**属人的暗黙知の形式知化**を支援する。

各ファイルには [PSID（行政サービスID）](./PSID.md) のコードを付与しており、  
行政サービスデータのエコシステムとの接続を意図している。

---

## 自治体による利用方法（Fork運用モデル）

各自治体はこのリポジトリを **Fork して自分たちのナレッジベースとして運用する** ことを想定している。

```
CfJ管理リポジトリ（本リポジトリ）
  ↓ Fork
各自治体のリポジトリ
  ├── /（ルート直下）← CfJが管理。原則、自治体側では編集しない
  └── local/         ← 自治体が自由に追加・編集する領域
```

**ルート直下**（`journeys/`, `workflows/`, `incident-catalog/` 等）は全国共通ナレッジとして  
CfJ が維持管理する。自治体はこの部分を読み取り専用として参照する。

**`local/`** は各自治体の現場情報を蓄積する領域。事案記録・固有ルール・連絡先・独自フロー等を置く。

CfJが本リポジトリを更新した際は、Forkリポジトリ側で upstream pull を行う。  
この作業はFDE（フィールドデジタルエキスパート）または専門職員が担当することを想定している。

**運用体制の目安:**
中核市以上は自治体職員がFDEとAIの力を借りながら管理し、中核市未満は都道府県職員とFDE・AIが支援する形で運用する。

---

## どこから読むか

**住民の体験から理解したい** → `journeys/README.md`（8ライフイベント整備済み）
**自治体内部の時系列サイクルを理解したい** → `journeys/backoffice/README.md`（年度・議会サイクル等）
**特定の業務フローを参照したい** → `workflows/_standardized-20/README.md`（20業務整備済み）
**標準化対象外の汎用業務を参照したい** → `workflows/administrative-commons/README.md`（照会回答・発注等）
**インシデントリスクを評価したい** → `incident-catalog/`
**関連団体との役割分担を知りたい** → `stakeholders/README.md`（社協・民生委員等）
**制度間の概念競合を確認したい** → `concepts/README.md`（世帯・所得・扶養・住所等）
**PSIDとの接続方法を知りたい** → `PSID.md`
**自治体への説明資料がほしい** → `overview-for-municipalities.md`
**新しい業務・ナレッジを追加したい** → `templates/` → `CONTRIBUTING.md`
**概念競合を追加・編集したい** → `concepts/README.md` → `CONTRIBUTING.md`（セクションF）
**自治体固有の情報を記録したい** → `local/README.md`

---

## ディレクトリ構成

```
municipal-workflow-kb/
│
├── README.md                    # このファイル
├── CONTRIBUTING.md              # コントリビュートガイド（全国共通ナレッジへの貢献）
├── LICENSE                      # CC BY 4.0
├── UPDATE_RULES.md              # 標準仕様書改版・法改正時の更新アルゴリズム
├── PSID.md                      # PSIDとの連携（行政サービスID）
│
├── local/                       # 【Fork先の自治体が自由に編集する領域】
│   ├── README.md                # local/ フォルダの使い方
│   ├── index.md                 # ファイル一覧・目次（手動管理）
│   ├── incidents/               # 自治体固有の事案・トラブル記録
│   ├── rules/                   # 固有ルール・例規・内部規程
│   ├── contacts/                # 担当者・ベンダー・関係機関の連絡先
│   ├── processes/               # 標準フローから逸脱している独自業務フロー
│   └── archive/                 # 更新・解決済みで参照のみ必要なファイル
│
├── journeys/                    # 住民ジャーニー（業務間相関の表現場所）
│   ├── README.md                # ジャーニー一覧・読み方ガイド
│   ├── birth-and-childcare.md  # 妊娠・出産・子育て [L1/L2]
│   ├── marriage-and-divorce.md # 結婚・離婚 [L4]
│   ├── moving.md               # 引越し・住まい [L5]
│   ├── employment-and-retirement.md  # 就職・退職 [L6]
│   ├── aging-and-care.md       # 高齢者・介護 [L7]
│   ├── death-and-bereavement.md     # おくやみ [L8]
│   ├── poverty-and-crisis.md   # 困窮・複合課題 [L12]
│   ├── disaster-and-recovery.md     # 被災・生活再建 [L13] ★新規
│   └── backoffice/              # バックオフィスジャーニー（組織の時系列サイクル）
│       ├── README.md                  # コンセプト説明・O-コード定義
│       ├── fiscal-year-cycle.md       # 年度サイクル [O1]
│       ├── council-response-cycle.md  # 議会対応サイクル [O2]
│       ├── staff-rotation-cycle.md    # 人事異動サイクル [O3]
│       ├── audit-cycle.md             # 監査・検査対応サイクル [O4]
│       └── disaster-response-cycle.md # 災害対応サイクル [O5] ★新規
│
├── stakeholders/                # 関連団体・ステークホルダー構造知識
│   ├── README.md                # 構造知識 vs 関係知識の整理方針
│   ├── shakyo-welfare-council.md    # 社会福祉協議会プロファイル
│   ├── minseiiin.md             # 民生委員・児童委員プロファイル
│   ├── chiiki-houkatsu-shien-center.md  # 地域包括支援センタープロファイル
│   ├── prefecture.md            # 都道府県（行政間連携・災害時役割追記）
│   ├── japan-pension-service.md # 日本年金機構（特殊法人）
│   ├── kouki-koreisha-koiki-rengo.md  # 後期高齢者医療広域連合
│   ├── fukushi-jimusho.md       # 福祉事務所（都道府県設置型vs市設置型）
│   ├── jido-sodan-jo.md         # 児童相談所
│   ├── kyoiku-iinkai.md         # 教育委員会（行政内独立機関）
│   ├── shobo-honbu.md           # 消防本部・消防署 ★新規
│   ├── jieitai-saigai-haken.md  # 自衛隊（災害派遣） ★新規
│   └── shakyo-saigai-vc.md      # 社協（災害ボランティアセンター） ★新規
│
├── concepts/                    # 制度間概念競合（同じ言葉が制度ごとに異なる定義を持つ概念）
│   ├── README.md                # 設計思想・スキーマ定義（役割型・競合型の2分類）
│   ├── household.md             # 世帯（住基/国保/税/生活保護・災害特例追記）
│   ├── income.md                # 収入・所得（税/国保/生保/給付・災害特例追記）
│   ├── dependent.md             # 扶養（所得税/健保/年金/生保）
│   ├── domicile.md              # 住所・居住地（住基/民法/生保/DV・災害特例追記）
│   ├── heir.md                  # 相続人（役割型）
│   ├── agent.md                 # 代理人（役割型）
│   ├── adult-guardianship.md    # 成年後見（役割型）
│   ├── parental-authority.md    # 親権者（役割型）
│   ├── truancy.md               # 不登校・長期欠席（制度間競合型）
│   ├── vacant-house.md          # 空き家（制度間競合型）
│   ├── ordinance-hierarchy.md   # 条例・規則・要綱（ai_caution最重要）
│   ├── young-carer.md           # ヤングケアラー（役割型）
│   ├── disaster-certificate.md  # 罹災証明書・被害認定 ★新規
│   ├── evacuation-shelter.md    # 避難所の類型 ★新規
│   ├── disaster-vulnerable-person.md  # 要配慮者・避難行動要支援者 ★新規
│   └── disaster-relief-payment.md     # 義援金・見舞金・支援金 ★新規
│
├── incident-catalog/            # インシデントカタログ（予算化の根拠文書）
│   ├── README.md                # 使い方・予算化の論理
│   ├── _template.md
│   ├── INC-001-dv-cross-department.md
│   ├── INC-002-care-handover-14days.md
│   ├── INC-003-welfare-application-refused.md
│   ├── INC-004-complex-needs-no-coordinator.md
│   ├── INC-005-welfare-transfer-gap.md
│   ├── INC-006-retirement-uninsured.md
│   ├── INC-007-mental-health-card-expired.md
│   ├── INC-008-inheritance-unregistered-tax.md
│   ├── INC-009-pension-overpayment-bereavement.md
│   ├── INC-D01-vulnerable-person-list-failure.md  # 要支援者名簿機能不全 ★新規
│   ├── INC-D02-welfare-shelter-unknown.md          # 福祉避難所未周知 ★新規
│   └── INC-D03-disaster-certificate-dispute.md     # 罹災証明書不服 ★新規
│
├── templates/                   # 記述テンプレート
│
└── workflows/
    ├── _standardized-20/        # 標準化対象20業務（20フォルダ整備済み）
    │   ├── README.md            # 業務一覧・仕様書リンク
    │   ├── jyumin-ido/          # 住民異動届 [C1 / L5]
    │   ├── koseki/              # 戸籍・戸籍附票 [C1 / L4,L8]
    │   ├── inkan-toroku/        # 印鑑登録 [C1 / L5]
    │   ├── senkyo-meibo/        # 選挙人名簿管理 [C1 / L5]
    │   ├── kotei-shisan-zei/    # 固定資産税 [C2 / L5]
    │   ├── kojin-jumin-zei/     # 個人住民税 [C2 / L6]
    │   ├── hojin-jumin-zei/     # 法人住民税 [C2 / L6]
    │   ├── keijidosha-zei/      # 軽自動車税 [C2 / L5]
    │   ├── kokumin-kenko-hoken/ # 国民健康保険 [C3 / L5,L6]
    │   ├── kouki-koreisha-iryo/ # 後期高齢者医療 [C3 / L7]
    │   ├── kokumin-nenkin/      # 国民年金 [C4 / L6]
    │   ├── jido-teate/          # 児童手当 [C12 / L1,L2]
    │   ├── kosodate-shien/      # 子ども・子育て支援 [C12 / L2]
    │   ├── kaigo-hoken/         # 介護保険 [C13 / L7]
    │   ├── shogaisha-techo/     # 障害者手帳・福祉 [C13 / L12]
    │   ├── seikatsu-hogo/       # 生活保護 [C12 / L12]
    │   ├── kenko-kanri/         # 健康管理・母子保健 [C15 / L1]
    │   ├── yobo-sesshu/         # 予防接種 [C15 / L1,L2]
    │   ├── zaimu-kaikei/        # 財務会計（内部管理）
    │   └── jinji-kyuyo/         # 人事給与（内部管理）
    └── administrative-commons/  # 汎用行政業務（全国共通の典型フロー）
        ├── README.md            # flow-canonical の考え方・収録方針
        ├── shokai-kaito/        # 照会回答の典型フロー
        ├── hatchu-nohinkensa/   # 軽微発注・納品検査の典型フロー
        ├── kaigi-logi/          # 外部会議ロジスティクス（審議会・ケース会議等）
        ├── shokuhin-esei-kansa/ # 食品衛生監査・立入検査
        ├── shobo-kensa/         # 消防査察（防火対象物立入検査）
        └── hojokin-kanri/       # 補助金管理（自治会・まちづくり団体）
```

---

## ナレッジの構造

### 住民・業務の3層

```
journeys/              業務間の「つながり」を住民視点で示す
                       → 「どの業務が連鎖するか」がわかる

workflows/             各業務の「中身」を担当者視点で示す
                       → 「どうやるか・なぜそうするか」がわかる

incident-catalog/      業務の「穴」が引き起こすインシデントを示す
                       → 「何が起きうるか・どう防ぐか」がわかる
```

各層は**互いを参照するが、単独でも読める**ように設計されている。
自治体がForkする際は、必要な業務フォルダだけを使えばよい。

### バックオフィスジャーニー（組織の時系列知識）

```
journeys/backoffice/   組織が動く「時系列サイクル」を示す
                       → 年度末、議会前、人事異動など「いつ何が連鎖するか」がわかる
```

住民起点の L-コードとは独立した O-コード（O1〜O5）で分類し、
ベテラン職員が持つ「時期による行動様式」を形式知化する。O5は「大規模災害対応サイクル」（非定期発動型）。

### ステークホルダー構造知識

```
stakeholders/          自治体と連携する団体の役割・ギャップを示す
                       → 社協・民生委員・外郭団体等との「つなぎ目」がわかる
```

**構造知識**（役割分担・制度的位置づけ）のみここに記載。
**関係知識**（担当者・交渉経緯・関係性）は各自治体の `local/contacts/` または内部KBに記載する。

### 概念競合ディレクトリ

```
concepts/              「同じ言葉が制度ごとに異なる定義を持つ」概念を集める
                       → 住民誤案内・職員間の認識齟齬・AIの誤推論を防ぐ
```

2種類の概念ファイルが存在する。

- **制度間競合型**（`concept_type: "conflict"`）: 「世帯」「所得」「扶養」「住所」「罹災証明書」「避難所」「義援金」など
- **役割型**（`concept_type: "role"`）: 「相続人」「代理人」「成年後見」「親権者」「ヤングケアラー」「要配慮者」など

`ai_caution: true` フラグを持つ概念は、AIが自動判断してはならないことを明示する。

---

## ワークフローの2種類

| ファイル名 | 根拠 | 対象ディレクトリ |
|---|---|---|
| `flow-standard.md` | デジタル庁・各省庁の標準仕様書 | `workflows/_standardized-20/` |
| `flow-canonical.md` | 全国共通の典型的な実務慣行 | `workflows/administrative-commons/` |

いずれも `gap-notes.md` を対で持ち、「あるべきフロー」と「現実の差分」を記録する。
gap-notes はFDE提案・予算化根拠として使用することを想定している。

---

## コントリビュート

→ [CONTRIBUTING.md](./CONTRIBUTING.md)

自治体担当者・支援者・研究者など、どなたでもPull Requestを歓迎します。  
「全国共通の知識」と「自治体固有の知識」を明確に区別して記述してください。
