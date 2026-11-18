# VRC Band DB Discord通知・承認連携 導入・運用手順

更新日：2026年11月18日  
状態：コードとローカル自動テストは実装済み。外部アカウントへの設定・投稿・公開・実連携試験は未実施。

詳細は [仕様書](VRC-Band-DB-discord-spec.md)。まず専用の試験環境で設定し、確認後に本番へ切り替える。

## 1. 実装したファイル

| ファイル | 用途 |
| --- | --- |
| automation/discord/gas/Core.gs | スナップショット・版・承認／却下・通知・公開キュー |
| automation/discord/gas/Code.gs | フォーム・シート・Discord・GitHubへの接続、トリガー、署名検証 |
| automation/discord/gas/appsscript.json | GASのランタイム・権限 |
| automation/discord/gas/settings.example.json | Script Propertiesへ登録する設定名。秘密値は空欄 |
| automation/discord/worker/src/index.mjs | Discord署名・ロール確認、GASへの転送 |
| automation/discord/worker/wrangler.jsonc | Cloudflare Workerのデプロイ設定 |
| automation/discord/tests/ | 外部サービスを模擬した自動テスト |

現行サイトの取得先はまだ変更していない。以下の公開用シート設定を有効にするまでは、従来どおり元回答シートからビルドする。**Botコードをpushしただけでは承認制へ切り替わらない。**

## 2. 人が準備するもの

- Google：フォーム編集権限、専用の審査管理スプレッドシート、専用の公開用スプレッドシート、GAS初回承認。
- Discord：アプリ／Bot作成、Bot招待、通知チャンネル・許可ロールの決定、IDとTokenの取得。
- Cloudflare：アカウント、Worker作成・Secrets登録。
- GitHub：ワークフロー変更のpush、既定ブランチへの定義配置、Token発行・Repository Variables登録。
- 運用：既存登録の移行判断、試験回答の送信、運用開始後の承認・却下。

秘密値はチャット・公開リポジトリに貼らず、各サービスの指定設定欄へ入力する。

## 3. 試験用Google環境を用意する

1. 試験用フォームと回答先を作成する。既存UIテスト用DBTestには回答を混ぜない。
2. 別スプレッドシートに「審査管理」を作成する。リンク共有せず、運営とGAS実行者だけに限定する。
3. さらに別スプレッドシートに「公開用データ」を作成する。空のタブを1つ用意し、spreadsheet IDとタブのgidを控える。元回答や審査管理と同一ファイルにはしない。
4. 公開用だけCSV取得可能な共有設定にする。初期見出しは後述のinitializeIntegrationが作るので手入力しない。
5. 試験用フォームに、活動名・活動形態１・メインジャンル等、現在の公開項目と同名の質問を作る。質問名の説明文は改行または全角括弧で続けられる。フォームの編集用IDを控える。

登録UUID・状態・版と承認時の公開項目だけを公開用へ出力する。GASは画像の共有権限を変更しないため、サイトに表示する画像の閲覧権限は別途確認する。

## 4. Discordの設定

1. Developer Portalでアプリを作成し、Bot名・アイコンを設定する。
2. Botを運営サーバーへ招待する。必要な権限は通知チャンネルの閲覧、メッセージ送信、埋め込み表示。AdministratorやMessage Content Intentは不要。
3. 審査用チャンネルと担当者ロールを用意する。Discordの開発者モードでサーバー・チャンネル・ロールIDをコピーする。
4. Application ID、Public Key、Bot Tokenを控える。Application IDはBotユーザーIDと一致する想定。
5. Interactions Endpoint URLはWorkerを配置した後に設定する。

## 5. GASへ配置する

1. フォームの所有者／編集者アカウントでApps Scriptプロジェクトを作る。
2. Core.gs、Code.gsの内容をそれぞれ同名のスクリプトファイルへ貼り付ける。Node専用コードやテストファイルは貼り付けない。
3. プロジェクト設定でappsscript.jsonを表示し、同梱の設定を反映する。
4. Script Propertiesに次の値を登録する。

| 設定名 | 値 |
| --- | --- |
| ENABLED | 設定中はfalse。初期化・試験を始めるときtrue |
| FORM_ID | 編集用フォームID。回答用の1FAIp...形式ではない |
| REVIEW_SPREADSHEET_ID | 非公開の審査管理ファイルID |
| PUBLIC_SPREADSHEET_ID | 公開用ファイルID |
| PUBLIC_SHEET_ID | 公開用タブの数値gid（例：0） |
| DISCORD_BOT_TOKEN | Bot Token |
| DISCORD_APPLICATION_ID | Application ID |
| DISCORD_GUILD_ID | 審査用サーバーID |
| DISCORD_CHANNEL_ID | 審査用チャンネルID |
| GAS_HMAC_SECRET | 32文字以上のランダムな共有鍵。Workerと同じ値 |
| GITHUB_TOKEN | 対象リポジトリに限定したActions書込Token |
| GITHUB_OWNER / GITHUB_REPO | LyceeSerie / SerieIndustry（試験先が別なら変更） |
| GITHUB_WORKFLOW | deploy-spa.yml |
| GITHUB_REF | feature/spa |

5. ENABLEDをtrueにし、initializeIntegrationを手動実行する。Googleから求められるフォーム・スプレッドシート・外部通信・トリガー権限を確認して承認する。
6. 審査管理にRegistrations、Audit、Noncesが作られ、公開タブに管理用3列と公開項目の見出しが作られたことを確認する。既存の異なる見出しは自動上書きしない。
7. Webアプリとしてデプロイする。実行者は自分、Workerから未ログインでも到達できるアクセス設定にする。本文HMACが正しくなければ処理しない。Workspaceの組織制限でこの公開方式が使えない場合は、その時点で導入を止める。
8. /execで終わるWebアプリURLを控える。
9. Worker接続とGitHub設定が終わってからinstallIntegrationTriggersを手動実行する。フォーム送信時と5分ごとのメンテナンストリガーを作る。再実行しても同名トリガーを重複作成しない。

onBandFormSubmitをエディタの実行ボタンで直接実行しない。手動の保守・再試行はrunMaintenanceを実行する。コード更新時はWebアプリのデプロイバージョンも更新する。

## 6. Workerへ配置する

1. automation/discord/worker/wrangler.jsoncのvarsを設定する。

| 設定名 | 値 |
| --- | --- |
| DISCORD_APPLICATION_ID / DISCORD_PUBLIC_KEY | DiscordのApplication IDとPublic Key |
| DISCORD_GUILD_ID / DISCORD_CHANNEL_ID | GASと同じサーバー・チャンネルID |
| ALLOWED_ROLE_IDS | 操作を許可するロールID。複数はカンマ区切り |
| GAS_WEBAPP_URL | GAS Webアプリの/exec URL |

2. Workerディレクトリで以下を実行する。確認時のWranglerは4.164.0。

```powershell
cd C:\Users\Cubase\Documents\SerieIndustry\automation\discord\worker
npx --yes wrangler@4.164.0 login
npx --yes wrangler@4.164.0 secret put GAS_HMAC_SECRET
npx --yes wrangler@4.164.0 deploy
```

共有鍵は対話入力し、コマンドの引数や設定ファイルへ直接書かない。Bot TokenとGitHub TokenはWorkerへ渡さない。

3. DiscordのInteractions Endpoint URLへ https://配置したWorkerのホスト/interactions を登録する。
4. DiscordのPING検証が成功することを確認する。設定不足なら503、不正署名なら401になる。

公開前の組み立て確認だけなら `npx --yes wrangler@4.164.0 deploy --dry-run` を使う。これはデプロイしない。

## 7. GitHubとサイトの切替

1. 実装をfeature/spaへpushする。**このpushは既存どおりデプロイを起動するため、まだ承認制の切替前であることに注意する。** 設定・移行を同時に済ませる場合は、先に公開用データを準備し、次のVariablesを設定してからpushする。
2. 既定ブランチにもworkflow_dispatch定義を配置する。ローカルorigin/HEADはmainを指すが、GitHub上で再確認する。
3. ActionsのRepository Variablesへ次を登録する。

| 名前 | 値 |
| --- | --- |
| VRC_BAND_DB_APPROVED_SHEET_URL | https://docs.google.com/spreadsheets/d/公開用ID/export?format=csv&gid=公開用gid |
| VRC_BAND_DB_REQUIRE_APPROVED | true |

4. ワークフローはfeature/spaだけを公開する。手動Run workflowもfeature/spaを選ぶ。GASのGITHUB_REFも同じ値に固定する。
5. workflow_dispatchでは公開シートURLが未設定なら必ず停止する。URLを設定した場合、通常pushでも承認用見出し・ID・版を検証し、未承認行を除外する。読取失敗や見出し不正で元回答に戻すことはない。
6. concurrencyは同一公開先で直列化する。待ち行列の統合で一部の保留実行が置換されても、各実行はその時点の公開用シート全体をビルドする。

ローカルでも承認用シートを使う場合は、同じ環境変数を設定してからnpm run buildを実行する。Viteの.envファイルだけではNodeのprebuildに自動反映されないため、PowerShellの環境変数を使う。

```powershell
$env:VRC_BAND_DB_APPROVED_SHEET_URL = 'https://docs.google.com/spreadsheets/d/公開用ID/export?format=csv&gid=0'
$env:VRC_BAND_DB_REQUIRE_APPROVED = 'true'
cd C:\Users\Cubase\Documents\SerieIndustry\SI-HP
npm run build
```

npm run build:testは既存UIテストシートを使い、これら本番設定の影響を受けない。

## 8. 連携試験

1. 試験フォームへ架空データを送信し、Discordに承認待ち通知が1件届くことを確認する。
2. 承認前にビルドし、未承認登録が出ないことを確認する。
3. 許可ロールで承認する。個人向けの受付応答後、公開用シートへ承認時の内容が入り、Actionsが起動することを確認する。
4. Actions完了後に公開JSONと画面を確認する。CSV配信のキャッシュ等で古い内容だった場合は再実行する。起動受付を公開完了とは扱わない。
5. 別回答を却下し、公開されず履歴だけが残ることを確認する。
6. 二重クリック・許可ロールなし・古い通知の操作が誤更新にならないことを確認する。
7. 承認済み回答を編集する。通知または定期照合で再審査になり、前回承認の公開内容が変わらないことを確認する。
8. GitHub Token無効等でActions起動を失敗させ、管理シートのfailedを確認する。設定復旧後runMaintenanceで再試行する。

Workerは決定をGASへ保存後、別リクエストで公開・通知更新を促す。促進リクエストが失敗しても、5分ごとのrunMaintenanceがキューを再試行する。回答変更は30件ずつ巡回照合するため、件数が多いほど検出までの時間が増える。

## 9. 本番移行

- 本番用の別シート・通知先・鍵を準備する。試験のTokenやチャンネルをそのまま本番用にしない。
- 現在の公開JSON・成果物を保存する。
- 既存フォーム回答も初回メンテナンスの巡回でpendingとして取り込まれる。運営が確認して承認する。既存の公開JSONを自動承認する機能はない。
- 必要な既存登録が公開用シートへ揃ってからRepository Variablesを切り替える。空の公開用シートへ切り替えるとサイトも0件になる。
- 共有されている元回答の公開範囲は、この仕組みでは変更しない。私的な審査ログは別の非公開シートだけに置く。

## 10. 運用・復旧

- 実行入口：onBandFormSubmit（イベント専用）、runMaintenance（手動実行可）。
- 承認待ち／承認済み／却下はRegistrationsのrecordJson、版ごとの履歴はAuditで確認する。これらを手動で並べ替え・編集する場合はIDとJSONを一体として扱う。
- publishStatus=dispatchedはGitHub APIの起動受付済み。公開完了はActionsの結果を見る。
- Discord投稿失敗はnoticeDirtyとlastErrorが残る。runMaintenanceで再送する。メッセージ自体が人手で削除された場合は、復旧前に管理者が原因確認する。
- Actions失敗時は公開コピーを維持する。通信断直後の再試行ではActionsが複数回起動される可能性があるが、登録行を重複追加しない。
- 停止はGASのENABLED=false。既存の公開成果物はそのまま。復旧時は設定を戻してrunMaintenanceを実行する。
- 元回答の物理削除、公開取り下げ、却下理由入力、公開完了のDiscord通知は今回の実装対象外。
- 管理データ1件はSheetsセル上限内にするため、公開項目のJSON換算12,000文字まで。超過は受付エラーとしてGAS実行履歴で確認する。大規模運用では審査管理と全回答走査の処理時間を見て別ストレージへ移行する。

## 11. ローカル検証結果

- SI-HPでnpm test：55件成功（連携関連22件＋既存33件）。
- GASは実際のCore.gs／Code.gsをVM上で動かし、Google・Discord・GitHubを模擬して検証した。
- Wrangler 4.164.0のdeploy --dry-run成功。Workerの実デプロイなし。
- 通常・テスト両ビルド成功。現在の画面・元回答シートは変更していない。
- Discord・GAS・Cloudflare・GitHubを実アカウントでつないだ試験は、上記設定後に行う。

## 共有済みの設定情報

- Discordアプリ名：VRC-BAND-DB-Notice-To-Action
- Application ID：1572571223731474452（Worker設定へ反映済み。GAS Script Propertiesにも同じ値を登録する）
- Public Key：Workerのwrangler.jsoncへ反映済み。公開情報でありBot Tokenとは別。
- 公開用シートID：1jN3Ujug7ANHsoryi5sNvNDFH3tLWaI_Uoy01zcveH9c。シート1、gid 0をメタデータで確認。
- 審査用シートID：1fvBBgXQszwi1nv_pISCO6z1y9qY99uPxN4tRyCpe6yI。接続アカウントからの読取は403。非公開を維持し、GAS実行アカウントに編集権限があることを確認する。
- 両シートID・公開gid・Application IDはsettings.example.jsonに反映済み。外部シートの内容・共有設定、本番取込先は変更していない。
- 追加で必要な非秘密情報：DiscordサーバーID・通知チャンネルID・許可ロールID、フォーム編集用ID（設定時に確認）。

- Cloudflareアカウント作成済み。次はローカルでWranglerへログインし、Discordサーバー・通知チャンネル・許可ロールIDを揃える。GAS WebアプリURLと共有鍵が揃うまでDiscordのEndpoint検証は完了しない。

### Discord接続先（設定へ反映済み）

- サーバーID：1571340844689268827
- 通知チャンネルID：1572258078017986620
- 許可ロールID：1572585514404413511
- WorkerとGASの設定テンプレートへ反映。実デプロイ・Bot招待・秘密値登録はまだ行っていない。

## 初期化で止まったときの診断

- Code.gsを最新版へ差し替え、保存する。関数選択からdiagnoseIntegrationを実行する。
- この関数はフォーム、審査シート、公開シートとgidを個別に確認し、成功／失敗と確認事項を実行ログへ出す。Bot Tokenや共有鍵は出さない。ENABLED=falseやToken未入力でも使え、シート・フォームへの書込や通知は行わない。
- 1項目で失敗しても後続の接続確認を続ける。Googleのログインアカウントは自動表示しないため、GASを実行しているアカウントで各編集URLを開けるか手動確認する。読取成功だけでは編集権限を保証しない。
- initializeIntegrationも処理単位で「開始／成功／失敗」を出す。フォームopenById、回答先、審査管理タブ、公開用タブ、見出しのどこで止まったか分かる。
- IDに引用符・URL・前後空白がある場合、またはFORM_IDに回答用1FAIp...形式が入っている場合は明示的にエラーとする。

### GAS初期化・配置の進捗

- ユーザーがinitializeIntegrationの全ステップ成功を確認。
- GAS WebアプリURL：https://script.google.com/macros/s/AKfycby-nljvIuObmMUoAufYOOSOqN3DnVbDRBUZI453GlpDJl8gCRAFMqZ9yIuGEbifTavq/exec
- Worker設定のGAS_WEBAPP_URLへ反映済み。共有鍵の登録とWorkerの実デプロイは未確認。
- FORM_IDは1LdLWEpaNGHiRtCKq_JKVZx9MRzQJHcEYnhTzf-DJLgsで接続成功。

## Discord Endpointの検証エラー

- Developer Portalの「アプリ認証」は大規模配布向けの審査で、Interactions Endpoint URLの接続検証とは別。運営サーバー内だけの通知・審査ではアプリ認証を原因と決めつけない。
- WorkerへGETは405、署名なしPOSTは401が正常。503なら設定不足。今回の公開URLはGET 405／署名なしPOST 401を確認済み。
- Workerは有効な署名付きの最小PINGにもPONGを返す。署名検証は省略しない。application_idが含まれる場合は一致を確認する。
- 最新Workerを再デプロイしてEndpointの保存を再試行する。まだ失敗する場合、Workerディレクトリで `npx --yes wrangler@4.164.0 tail --format pretty` を起動してからDiscordで保存する。
- ログはdiscord_endpoint_ping_ok、またはdiscord_endpoint_rejectedのreasonを確認する。signature_mismatch_check_public_keyならDeveloper PortalのPublic KeyとWorker設定の一致を確認。wrong_application_idならアプリID、configuration_incompleteなら設定を確認する。
- 診断ログにリクエスト本文・署名ヘッダー・Token・共有鍵・ユーザーIDは出力しない。

## 今後のコード更新

- 手動コピー・個別デプロイを省くため、[自動更新・認証設定](VRC-Band-DB-discord-ci.md) に従ってGitHub ActionsからGASとWorkerを更新できる。初期認証を済ませた後はリポジトリをコードの管理元にする。サイト再ビルドのActionsとは別。

## GASからのDiscord通知が40333になる場合

2026-11-19：同じBotのローカル投稿に成功した環境向けに、PCから通知する構成を追加しました。[ローカル通知の設定・起動手順](VRC-Band-DB-discord-local-notifier.md)を使用してください。従来の初期化・トリガー・Worker・サイトActionsの再設定は不要です。
