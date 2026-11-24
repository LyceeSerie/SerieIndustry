# VRC Band DB ワールド用イベントカレンダー

Unity 2022.3 / VRChat Worlds SDK / UdonSharp向け。配布元・開発元はこのリポジトリの `unity/VRCBandDB`。参考パッケージ `vrceve.calendar` の文字列取得・ワールドUIの構成を確認して独自実装したもので、参考Prefab・画像・マテリアルは複製していない。

## 導入

1. Runtime・Editor・Samples・Prefabsを `Assets/SerieIndustry/VRCBandDB` に配置する。VRChat Worlds SDK 3.10.4、Unity 2022.3.22f1で確認する構成。
2. Unityメニュー `Tools > SerieIndustry > VRC Band DB > Build Calendar Prefab` を実行する。初回はUdonプログラムアセット・ワールドスペースUIをUnity APIで生成する。Prefab再生成は明示操作だけで行う。
3. `Prefabs/VRCBandDB Calendar.prefab` をワールドへ配置する。Canvasは横2.4m×縦1.68m。パネル正面をプレイヤーに向け、既存の楽器・Pickup等のコライダーから離す。
4. VbdEventCalendarの `Data Url` を確認する。既定は本サイトの公開イベントシートのみ。非公開の審査管理シートや認証情報を設定しない。
5. PC・Android向けに通常のVRChat SDK手順でビルドする。配信URLが許可されない場合は以下の条件を確認する。

## 読み込み条件

Google SheetsはVRChatの標準String Loading許可リスト外のため、利用者側で `Allow Untrusted URLs` の許可が必要。ワールド側のURL許可設定が求められる環境では `docs.google.com` も確認する。このアセットがユーザーのセキュリティ設定を自動で変更することはない。

既定URLは `docs.google.com/spreadsheets/d/.../gviz/tq?tqx=out:csv&headers=1&gid=0`。GoogleのCSV export経路のリダイレクトを避けるための読み取り専用URLで、既存公開イベントシートを直接読む。Google側の仕様・共有設定やVRChatの制限により取得できない場合はステータスへ表示し、前回データを保持する。変更はシートの配信キャッシュと更新間隔に従って反映され、即時性は保証しない。GitHub用のイベントJSON生成や新規バックエンドは不要。

## 表示・操作

- 初期は日本時間の当日。VRChatイベントのみ表示し、終了済みは常に除外する。
- 前日／今日／翌日で表示日を変更。形態切替・終了済み表示の操作は設けない。日付ボタンはPointerDownで1日移動し、PointerUpまで再入力を受けない。同一フレームの重複入力も除外する。
- 日付を跨ぐ予定も当日に重なる範囲で表示。開始時刻順、8件ずつのページ送り。
- 行を押すと右の色付き見出しにイベント名を大きく表示し、その下を日時・場所名／URL・参加バンド・概要の区切りで表示する。共通の「形態：VRChat」は表示しない。長文は右側でスクロールする。
- 外部URLは文字表示のみ。クリックによるブラウザ起動・ポータル生成・動画再生は行わない。
- `Band Id` が空なら全件。登録元または参加バンドのIDを指定すると特定バンドの予定だけに絞れる。
- 全操作は各プレイヤーのローカル表示。ネットワーク同期・編集機能・ログインはない。
- 初回取得後、既定300秒で再取得。再読込ボタンの連打でも5秒制限を超えない。自動取得は最低30秒。時刻による終了判定は30秒ごと。

## サンプルと日本語フォント

`Use Sample Data` を有効にすると通信せず `Samples/CalendarSample.csv` を使用。日付のプレースホルダーを当日基準へ展開する。全4形態・翌日・日跨ぎ・終了済み・参加バンド2件・改行／CSV引用符を含む架空データ。

日本語表示用にM PLUS 1p Regular（SIL Open Font License 1.1）を `Fonts/CalendarFont.ttf` として同梱。ライセンスは `Fonts/OFL.txt`。生成時に自動で割り当てる。別フォントを使用する場合は同パスのファイルを差し替えるか、Prefab内のTextへ手動指定する。フォントが見つからない場合のみLegacyRuntimeへフォールバックする。元データ：https://github.com/google/fonts/tree/main/ofl/mplus1p

## 入力と制限

公開イベントシートの列名を使用。必須列はeventId/title/place/startsAt/endsAt/participants、任意はownerBandId/subtitle/venueName/venueUrl。participantsは既存のJSON配列形式。CSVの引用符・カンマ・改行・BOM、UTCおよび時差付きISO日時に対応。最大512件・CSV最大200万文字。列不一致・重複ID・不正日時等は取り込み全体を停止し、前回データを保持する。TextのRich Textは無効で入力タグを実行しない。

## 開発・配置

リポジトリ側で修正後、`powershell -NoProfile -File unity/sync-to-unity.ps1` で指定Unityプロジェクトへコピーする。生成も依頼する場合だけ `-Build`。既存Prefabとmetaは既定コピーで上書きせず、既存ファイルの削除も行わない。Prefabをカスタマイズする場合はコピーして別名で保存し、ビルドメニューによる元Prefab再生成と区別する。

Prefab生成は一時的な空Sceneで行い、元のアクティブSceneを復元する。既存Sceneの保存・ユーザーの配置変更を行わない。Canvas/VRCUiShapeはDefaultレイヤー、GraphicRaycasterとTrigger BoxColliderを設定。UIボタンはPointerDown→backing UdonBehaviour.SendCustomEventで配線し、onClick重複を避ける。

## 参考

- VRChat String Loading: https://creators.vrchat.com/worlds/udon/string-loading/
- UdonSharp Editor API: https://udonsharp.docs.vrchat.com/editor-scripting/

## 確認結果（2026-11-24）

- Unity 2022.3.22f1 / Worlds SDK 3.10.4でC#・UdonSharpコンパイル成功。
- Editor検証17項目：ISO日時・時差、CSV引用符／改行、不正データ時の保持、重複ID、VRChat限定、終了済み除外、バンド絞り込み、日付重複入力など。
- ClientSim検証17項目：実際のUdon VMによるサンプル5件の読込、PointerDown/Upによる行・日付操作、日跨ぎ、詳細表示、押下表示、日付の同一フレーム重複・長押し再入力の防止、離した後の再操作など。
- 公開CSVのHTTP 200応答は確認済み。実VRChatクライアント／Quest実機・ワールドアップロード後の通信と操作は未確認。
- 検証後はPlay Modeを終了。既存Sceneを保存せず、Prefabのシーン配置は導入先で行う。

### 日付ボタンの調査（2026-11-24）

配置済みの前日ボタンはPointerDownが1件、onClickが0件で、配線の二重登録は見つからなかった。従来の日付メソッドは呼ばれるたびに無条件で日数を変更していた。入力重複時に数日動く経路を、押下から解放までのロックと同一フレーム判定で防ぐ。実VR機器の入力発生元は未特定のため、ClientSimでは重複Downを明示的に送って回帰確認する。



### 奥のUIと裏面の遮蔽

CanvasのSorting Orderは既存カレンダーと同じ0。UIの背後に、不透明なUnlit/Colorの白い背面板（BackCover）を配置する。板が深度を書き込むことで奥のUIを遮り、裏から反転した文字が見えることも防ぐ。Colliderは付けず、表面のUI操作を妨げない。Editorでは背後の高Sorting Orderの赤いUIが透けないこと、裏面が白になることをRenderTextureで検証する（画像出力はしない）。


## VPM / ALCOM配布

Packages導入に対応したmanifest・asmdefを同梱。導入済みなら同梱Prefabをそのまま配置する。Packages内でBuildメニューを実行した場合の生成先は `Assets/SerieIndustry/VRCBandDBGenerated`。配布・更新・タグ操作は [VPM配布手順](https://github.com/LyceeSerie/SerieIndustry/blob/main/docs/VRC-Band-DB-vpm.md)（リポジトリ内）を参照。

開発用Assets版とVPM版は同じGUIDを持つため、同一プロジェクトへの二重導入は避ける。

