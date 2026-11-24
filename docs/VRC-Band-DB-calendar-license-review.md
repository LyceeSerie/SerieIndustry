# イベントカレンダーのライセンス調査

調査日：2026-11-24。対象は参考パッケージ `vrceve.calendar` 2.0.0と、自作 `com.serieindustry.vrcbanddb.calendar` 0.1.0。

## 参考元 vrceve.calendar

- 導入先：`C:/Users/Cubase/Documents/Unity_VRC/VCC/SI-Samples/Packages/vrceve.calendar`。
- package.jsonのauthorはsatania、サイトは https://vrceve.com/ 。licenseフィールドはない。
- READMEは「vrceve.calendar by happy」のみ。ローカルの全ファイルと公開リポジトリのmainツリーを確認した範囲では、カレンダー本体のLICENSE・改変／再配布を明示的に許諾する文書は見つからなかった。リポジトリ内のSDK・依存ライブラリのライセンスをカレンダー本体へ流用してはならない。
- 公開リポジトリ：https://github.com/vrceve/vrceve-asset
- パッケージREADME：https://github.com/vrceve/vrceve-asset/blob/main/Packages/vrceve.calendar/README.md
- manifest：https://github.com/vrceve/vrceve-asset/blob/main/Packages/vrceve.calendar/package.json

現行の公式利用規約 https://vrceve.com/policy/ は、第1条で関連アセットにも適用するとしている。第7条では許可範囲を超える解析・改変・複製・再配布等を禁止し、第6条ではイベントデータの無許可二次利用を禁止する。第12条の問い合わせ先は vrceve.mailbox@gmail.com 。現在の規約の適用範囲や、導入時の個別許諾まではこの調査で確定していない。

「GitHubで公開」「無料で取得できる」ことを、自由な改変・再配布の許諾とみなさない。元のコード・Prefab・画像・マテリアルを含めて配布する場合は、対象物と改変・VPM配布の範囲について権利者の許諾を確認する必要がある。

## 自作アセットの確認

- 自作スクリプト・Unity APIで生成したPrefabを配布対象とする構成で、vrceve.calendarを依存パッケージにはしていない。
- 配布対象のprefab／asset／mat内のGUIDを、参考パッケージ全metaのGUIDと比較し、一致する外部参照は0件だった。
- 自作C#・manifestに、参考元のクラス名やvrceve.comへの通信先はない。データ取得先はVRC Band DB自身の公開イベントシート。
- これは参照関係とファイル構成の確認であり、ソースの表現上の類似性や契約上の適否を法的に保証するものではない。元アセットの一部をコピーしたものへライセンスを付け直すことはできない。
- 自作package.jsonのUNLICENSEDは、参考元のライセンスを表すものではなく、自作コードに公開用の利用許諾をまだ設定していないことを表す。自由利用・改変・再配布を許可するなら、公開前に自作部分のLICENSEとmanifestを設定する。

## 同梱フォント

M PLUS 1p RegularはSIL Open Font License 1.1。アプリ等への同梱・再配布は著作権表示とOFLを保持する条件で可能。フォント単体の販売は禁止。フォント自体は別のライセンスへ変更できず、自作コードのライセンスと分けて扱う。現状はFonts/OFL.txtを同梱している。

公式配布元のライセンス：https://github.com/google/fonts/blob/main/ofl/mplus1p/OFL.txt

## 判断

参考元を「MIT等の自由なライセンスの素材」として扱う根拠は確認できなかった。参考元を改変・同梱して配布する場合は許諾確認が必要。自作分の配布にあたっては、参考元の素材を混入させず、自作コードの配布条件とフォントの独立したライセンスを明記する。

一般的なGitHubのライセンス案内：https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

## コードの類似点の追加調査（2026-11-24）

比較対象は導入済みvrceve.calendar内の3つのC#と、自作Runtime内のVbdEventCalendar.cs／VbdCalendarRow.cs。追加アセットのZIP・unitypackageはダウンロードしていない。

### 共通している点

- UdonSharpBehaviour、BehaviourSyncMode.None、Unity UI、VRCStringDownloader、OnStringLoadSuccess/Error、VRCJson/DataToken/DataList等。VRChatの公開SDKを使うための共通点。
- 日本時間へ揃えること、ISO日時を文字位置と数字の検査で解析すること、文字列配列とDateTime配列でイベントを持つこと、約300秒の再取得。日時形式やUdonの制約に沿うが、機能・設計上は類似点として記録する。
- 行用の小さいコンポーネントから中央カレンダーに選択情報を渡し、詳細表示を呼ぶ構造。元はeventIDを渡すdrawContent、今回はslotを渡すPress。構造の共通点はあるものの、識別方法・メソッド・処理は異なる。

### 異なる点

- 元：JSON＋画像ダウンロード＋ジャンル／キーワード絞り込み。今回：自サイトのGoogle Sheets CSV＋テキスト描画、VRChat固定、8件ページ送り。
- 元：近接範囲・可視行更新・遅延イベントループ・リトライ時の待機増加と揺らぎ。今回：Update内の取得間隔／30秒判定、CSV検証後の一括置換、失敗時の既存データ保持。
- 元の日時解析は小数秒をミリ秒へ変換し、時差なしを日本時間扱いし、hh:mm／hhmm／hhの時差を受け付ける。今回は小数秒を読み飛ばし、Zまたは±hh:mmを必須とし、UTCへ正規化後に表示時にJSTへ変換する。月日検査も元は手書き、今回はDateTime.DaysInMonth。
- 元はXMLコメント・region・複数行のif・snake_caseの配列名等が多い。今回はnamespace、camelCase、1行の小メソッドと条件式が多い。書式・命名は相違が目立つ。

### 簡易機械比較

C#をコメント／空白を除いたトークン列へ分割し、識別子は置換せず、difflib.SequenceMatcher（autojunk=False）で連続完全一致を調べた。AST解析・変数名を変更した複製の検出・意味的同一性の判定ではない。

- VbdEventCalendar.cs：3,745トークン。元3ファイルとの最長一致は26トークンで、using宣言部分。
- usingを除くと最長15トークン。月・日の範囲確認条件 `month < 1 / month > 12 / day < 1` の一部。
- VbdCalendarRow.cs：最長10トークンで、同期なしのUdonBehaviourSyncMode属性とクラス宣言部分。

長い固有のコード塊の完全一致はこの方法では見つからなかった。ただし、参照して開発した経緯を消すものではなく、依拠性・創作的表現の類似性を法的に否定する根拠にはならない。変数名や記法を変えれば問題がなくなる、という判断はしない。

## 類似アセット候補（公開ページの調査のみ）

### 1. TaAGatheringListSystem：優先候補

- BOOTH：https://booth.pm/ja/items/5320755
- ソース／LICENSE：https://github.com/Azukimochi/TaAGatheringListSystem
- 技術・学術系イベントをJSONから取得し、曜日表示・種別絞り込み。VCC導入に対応。
- 公開ページとREADMEはMITと明記。フォントは別途OFL。
- JSON読込・Udonでの一覧・詳細・VPM構成の比較に適する。MITの著作権表示・許諾文を保持する必要がある。掲載データ自体の二次利用許諾までMITで包括されるとは判断しない。

### 2. VRC_UdonEventCalendar：旧Udon実装

- https://github.com/AoiKamishiro/VRC_UdonEventCalendar
- スクロール、手動再読込、UI／Unlit／Standard、スクロール同期ありなしのPrefab。
- READMEはUnityPackage内アセットをMITと明記。配信されるカレンダー画像は別条件で、改変・再配布時は画像取得URLを変更するよう指定している。
- 2022-02-18にアーカイブ。統合先として https://github.com/AoiKamishiro/VRChatPrefabs を案内しているが、現在の統合先READMEにはカレンダーが掲載されていないため、最新版対応を断定しない。
- 今のSDKで動くことは未確認。コード・UI構造の歴史的比較向け。

### 3. vrchat-scroll-calendar：描画・スクロールの比較

- https://github.com/bdunderscore/vrchat-scroll-calendar
- スクロール式カレンダー、Unlit／Standardの描画・明度調整。
- READMEではPrefab・ローディング画像はCC0、シェーダーはファイルごとにCC0またはMIT。具体的には各シェーダーのヘッダーを確認する。
- 配信されるカレンダー画像の改変・再配布は禁止と記載。アセットのライセンスと配信コンテンツを区別する。
- 古い実装のため現行SDK動作は未確認。特に描画順や奥行きの比較候補。

### 4. Wonder Note / Event TT for VRChat

- https://wondernote.net/event_timetable
- イベントを時間帯順に画像で表示し、詳細、ジャンル／キーワード検索、グループへの導線等を備える。
- 公式ページは無料利用・商用環境での利用を認める一方、販売・再配布、コードの直接コピー／改変による新規プログラム制作を禁止。詳細は同梱LICENSE.txt。
- 機能・見た目の比較対象。改変して自作アセットの土台にする候補にはしない。パッケージ内コードは今回未確認。

### 5. Android・iOS定期イベントカレンダー（Quest日本集会場）

- https://booth.pm/ja/items/8281665
- 開催中／本日／明日の優先表示、曜日別、iOS対応の絞り込み。
- Publicワールド設置可。単体再配布不可。改変も、情報パネル・データ取得URL・取得データの扱いには明確な制限がある。URL変更やJSON改変を禁止しているため、自サイトのデータへ差し替える基盤には適さない。
- コミュニティ間の共同作業共有の例外はあるが、一般向けVPM配布の許諾とはみなさない。パッケージ内コードは今回未確認。

### 補足：Virtual Calendar

- https://booth.pm/ja/items/4058516
- 一般的なワールド設置用カレンダー。公開説明からイベントデータ連動は確認できないため、今回の主要比較からは外す。
- 二次配布・自作発言は禁止と記載。配色・Inspector操作等のUI比較向け。

## 次に確認するもの

コードを含めて比較するなら、まずTaAGatheringListSystem、次に旧VRC_UdonEventCalendar、描画の比較ならvrchat-scroll-calendar。Wonder Noteとクエ集は利用制限を先に確認し、無許可のコード転用を行わない。ユーザーが取得した場合は、同梱LICENSE・README・package.jsonと、対象スクリプト・シェーダーのヘッダーを版ごとに確認する。
