# 標準化対象20業務フロー

## このディレクトリの位置づけ

デジタル庁・各省の**標準仕様書に記載された業務フロー**をBPMN化したもの。

### 3種類のファイル構成

各業務フォルダに以下の3ファイルを置く。

| ファイル | 内容 | 出典 |
|---|---|---|
| `flow-standard.md` | 標準仕様書のBPMN変換（Mermaid） | 標準仕様書 |
| `knowledge-notes.md` | 仕様書に「ない」暗黙知・判断根拠 | 現場知識 |
| `gap-notes.md` | 仕様書と現実の差分・インシデント接点 | 現場観察 |

### なぜ「仮説」と書かないか

標準仕様書は法令に基づく公式文書であり、業務フローも明示されている。  
これをBPMN化することは「仮説の作成」ではなく「公式文書の構造化」。  
ただし仕様書は**システム機能**を記述しており、**人の判断・暗黙知**は記述されていない。  
その差分を `knowledge-notes.md` と `gap-notes.md` で補う。

### デジタル庁標準仕様書へのリンク

#### 住民サービス系

| 業務 | 仕様書 | 版 | フォルダ |
|---|---|---|---|
| 住民基本台帳（住民記録） | [総務省](https://www.soumu.go.jp/main_content/000939004.pdf) | 第5.0版（R6.3） | [jyumin-ido/](./jyumin-ido/) |
| 戸籍・戸籍の附票 | [法務省](https://www.moj.go.jp/) | 最新版参照 | [koseki/](./koseki/) |
| 印鑑登録 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [inkan-toroku/](./inkan-toroku/) |
| 選挙人名簿管理 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [senkyo-meibo/](./senkyo-meibo/) |

#### 税務系

| 業務 | 仕様書 | 版 | フォルダ |
|---|---|---|---|
| 固定資産税 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [kotei-shisan-zei/](./kotei-shisan-zei/) |
| 個人住民税 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [kojin-jumin-zei/](./kojin-jumin-zei/) |
| 法人住民税 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [hojin-jumin-zei/](./hojin-jumin-zei/) |
| 軽自動車税 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [keijidosha-zei/](./keijidosha-zei/) |

#### 社会保険・医療系

| 業務 | 仕様書 | 版 | フォルダ |
|---|---|---|---|
| 国民健康保険 | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [kokumin-kenko-hoken/](./kokumin-kenko-hoken/) |
| 後期高齢者医療 | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [kouki-koreisha-iryo/](./kouki-koreisha-iryo/) |
| 国民年金 | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [kokumin-nenkin/](./kokumin-nenkin/) |

#### 福祉・子育て・健康系

| 業務 | 仕様書 | 版 | フォルダ |
|---|---|---|---|
| 児童手当 | [こども家庭庁](https://www.cfa.go.jp/) | 最新版参照 | [jido-teate/](./jido-teate/) |
| 子ども・子育て支援（保育） | [こども家庭庁](https://www.cfa.go.jp/) | 最新版参照 | [kosodate-shien/](./kosodate-shien/) |
| 介護保険 | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [kaigo-hoken/](./kaigo-hoken/) |
| 障害者手帳・障害福祉サービス | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [shogaisha-techo/](./shogaisha-techo/) |
| 生活保護 | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [seikatsu-hogo/](./seikatsu-hogo/) |
| 健康管理・母子保健 | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [kenko-kanri/](./kenko-kanri/) |
| 予防接種 | [厚生労働省](https://www.mhlw.go.jp/) | 最新版参照 | [yobo-sesshu/](./yobo-sesshu/) |

#### 内部管理系

| 業務 | 仕様書 | 版 | フォルダ |
|---|---|---|---|
| 財務会計 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [zaimu-kaikei/](./zaimu-kaikei/) |
| 人事給与 | [総務省](https://www.soumu.go.jp/) | 最新版参照 | [jinji-kyuyo/](./jinji-kyuyo/) |

### 移行後フロー再設計との関係

標準準拠システムへの移行が完了した自治体では、  
`gap-notes.md` の内容をFDE支援の起点として使う。  
「標準仕様書通りになっているはずなのに、なぜこの穴が残るのか」  
という問いが、移行後の業務改善の核心になる。
