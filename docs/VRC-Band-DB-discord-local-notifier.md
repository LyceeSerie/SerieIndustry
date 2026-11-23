# ローカルPCからDiscordへ通知する

更新：2026-11-19。コード実装・自動テスト済み。本番GAS更新、鍵設定、PCへのタスク登録は未実施。

## 構成

Googleフォーム → GASで審査用シートに保存 → PCが通知を取得 → 同じDiscord Botで投稿。

GASのフォーム送信トリガーと5分ごとのrunMaintenanceは維持する。PCは30秒ごとに通知を問い合わせる。フォーム送信トリガーが正常なら通常は次のポーリングで拾う。取り込みの再試行待ちやサービス遅延がある場合はそれ以上かかる。PCの電源オフ・スリープ・ログオフ中は通知を保留し、起動・ログイン後に再開する。

承認ボタンは既存Worker → GASで処理し、承認済みデータの公開とGitHub Actionsの起動は従来どおり。承認・却下後の通知メッセージ更新、編集前の古い通知のボタン無効化もPCから行う。PC停止中も既存ボタンで審査はできるが、通知表示の更新はPC再開後になる。新規投稿からGASへの送信済み記録完了までの間にボタンを押すと、未確定として拒否される場合があるので数秒後に再操作する。

## 初回設定

### 1. GASコードを更新

今回の変更をfeature/spaへPushし、Deploy Discord integrationのGAS更新が成功したことを確認する。Workerは変更不要。ローカルのプログラムをActionsからPCへ配布・起動する仕組みではないため、このPCのチェックアウトも更新した状態で使う。

### 2. PCに鍵を保存

Node.js 24とWindows PowerShellを使用する。既存プロジェクトでNode.jsを使っていれば追加のnpmインストールは不要。

```powershell
cd C:\Users\Cubase\Documents\SerieIndustry
powershell -NoProfile -File .\automation\discord\local\setup.ps1
```

GASに設定していたDISCORD_BOT_TOKENと同じTokenを、非表示の入力欄へ貼り付けてEnterする。Tokenをコマンド引数やチャットへ書かない。

専用のLOCAL_NOTIFY_SECRETが自動生成され、クリップボードへコピーされる。既存のGAS_HMAC_SECRETは変更しない。Tokenと専用鍵はWindows DPAPIで暗号化してlocal/.credentials.jsonに保存し、Gitから除外する。同じPC・同じWindowsユーザーで使用する。クリップボード履歴を有効にしている場合は設定後に該当項目も消す。

setup.ps1の再実行は既存鍵の再コピーだけを行い、鍵・Tokenを再生成しない。Token変更が必要になったら通知を停止し、.credentials.jsonを削除して再設定する。その場合は新しいLOCAL_NOTIFY_SECRETをGASにも登録し直す。

### 3. GASのスクリプトプロパティ

| 名前 | 値 |
| --- | --- |
| LOCAL_NOTIFY_SECRET | 手順2でクリップボードにコピーされた64桁の値 |
| NOTIFICATION_TRANSPORT | local |

ENABLED=trueと既存トリガーは維持する。GAS_HMAC_SECRET、GitHub Token、DiscordアプリID等も維持する。ローカルモードではGASのDISCORD_BOT_TOKENは不要になるが、初回はそのまま残してよい。切替後、GASのrunMaintenanceがDiscordへ直接送信しなくなる。initializeIntegrationやinstallIntegrationTriggersの再実行は不要。

### 4. 起動して確認

```powershell
powershell -NoProfile -File .\automation\discord\local\start.ps1
```

`sent`がDiscord投稿または表示更新、`acknowledged`がGASへの送信済み記録を表す。30秒間隔で確認し、通知なしの場合は5分ごとに`idle: no pending notifications`を記録する。Ctrl+Cで終了。回答の再送信は不要。

この実行ではBot Tokenを復号してNodeプロセスへ引き渡す。標準出力・ログには鍵や回答を出さない。状態保存先local/.stateには送信済み記録、プロセスロック、稼働ログを保存し、Git対象外とする。複数起動はロックで防ぐ。複数PCではGAS側の引き当てで同じ通知の同時送信を防ぐが、通常は1台だけで稼働させる。

### 5. Windowsログイン時に自動起動（任意）

2026-11-20：このPCでは通知プロセス停止・タスク未登録を確認したため、以下のタスクを登録して起動した。タスクのRunning状態、Nodeプロセス、Discord送信（sent）とGASへの記録（acknowledged）を確認済み。Nodeの絶対パスを登録し、タスクからも起動できるようにしている。失敗時は1分後に最大3回再起動し、通常稼働の時間制限は設けない。

稼働ログは`automation/discord/local/.state/notifier.log`。1MiBで直前のログを`notifier.log.previous`へ退避する。日時はUTC。ログイン中かつPCが起動・通信可能な間だけ処理する。スリープ・電源オフ中の通知は、再稼働後に処理する。

```powershell
Get-ScheduledTask -TaskName "VRC Band DB Local Notifier" | Select-Object TaskName, State
Get-Content -LiteralPath .\automation\discord\local\.state\notifier.log -Tail 20
```

まず手動起動で動作を確認し、Ctrl+Cで終了してから実行する。

```powershell
powershell -NoProfile -File .\automation\discord\local\install-task.ps1
Start-ScheduledTask -TaskName "VRC Band DB Local Notifier"
```

現在のWindowsユーザーのログイン時に、非表示ウィンドウで起動するタスクを登録する。タスク名：VRC Band DB Local Notifier。Windowsパスワードの保存や管理者権限での実行は要求しない。ログイン前やログオフ中は動かない。PCのスリープ設定は変更しない。エラー調査時はタスクを止め、start.ps1を手動起動してコードを確認する。

停止・無効化：

```powershell
Stop-ScheduledTask -TaskName "VRC Band DB Local Notifier"
Disable-ScheduledTask -TaskName "VRC Band DB Local Notifier"
```

強制停止でprocess.lockが残ることはあるが、次回起動時に所有PIDが存在しなければ回収する。PIDが再利用されている場合は安全側で起動を拒否するため、通知プロセスが存在しないことを確認したうえでlocal/.state/process.lockだけを削除する。receipt.jsonは未確定の送信済み記録なので削除しない。

## 認証と二重送信の扱い

2026-11-19：審査メッセージにロゴ・アイコン・アー写の確認リンクとプレビューを追加。GAS更新後は送信済みのメッセージも新しい通知フォーマットへ自動更新する。再回答・メッセージ削除・鍵再設定は不要。非公開Drive画像のプレビューは表示できない場合があり、確認リンクを閲覧権限のあるGoogleアカウントで開く。

- ローカル専用鍵でHMAC署名する。5分の時刻許容・nonceの再利用拒否は既存方式を利用する。PCの時刻を正しく保つ。
- 専用鍵で許可する操作はlocal_claim/local_ackだけ。審査操作に使うWorker用GAS_HMAC_SECRETとは分ける。
- 1件を10分間引き当て、PC停止・送信失敗時は同じジョブIDで再取得する。引き当て中は他のPCに渡さない。失敗後の再取得は引き当て期限まで待つ場合がある。
- 新規Discord投稿はジョブID由来の安定したnonceとenforce_nonceを使用。既存メッセージはPATCHで更新する。
- Discord成功後はPCにreceipt.jsonを原子的に保存する。GASへの記録に失敗しても、PC再起動後は記録だけを再試行する。
- Discordが投稿を受理した直後に通信・PCが停止し、PCの送信済み記録を書けなかった場合、厳密な一度限りの保証はできない。Discordのnonce重複排除期間を過ぎた再送では重複の可能性が残る。
- 回答の版・表示状態が送信中に変わっても、古い通知の無効化と最新通知の送信を維持する。
- 失敗は1分から最大15分へ待機時間を延ばして再試行し、HTTP 429では指定の待機時間も尊重する（最大1時間）。API応答本文やTokenはログへ出さない。

## エラー

ロール別審査と管理人コマンドを追加。GAS/Workerの配置後、保存済みの認証情報を使い`powershell -NoProfile -File .\automation\discord\local\start.ps1 -RegisterCommands`を実行すると、管理人用のband-info/band-delete/band-restoreをサーバーへ登録・更新する。登録だけを行って終了し、稼働中の通知処理とは独立する。人数の共通値・承認/却下の個別値はGASのプロパティで変更可能。復元と二重押下対策を含む詳細は[ロール別審査・コマンド手順](VRC-Band-DB-discord-moderation.md)。

2026-11-19：GASの通知フォーマット3で、登録されたSNS等のリンクを開くボタンとURL形式・ドメインの警告を追加。GASコード更新後はPCの通知処理が既存メッセージも更新する。PC側の追加認証・鍵再設定は不要。本人のアカウントやリンク先の実在性は運営が開いて確認する。自動巡回・接続可否の判定は行わない。

| 表示 | 確認事項 |
| --- | --- |
| GAS_REQUEST_REJECTED_CHECK_MODE_AND_LOCAL_KEY | GASの配置、NOTIFICATION_TRANSPORT=local、専用鍵、ENABLED、PC時計。GASロック競合でも一時的に発生し得る |
| GAS_INVALID_RESPONSE | Webアプリの実行権限・公開設定、正しい/exec URL |
| GAS_HTTP_404 | デプロイのWebアプリ公開設定とURLを確認。配置元マニフェストにもwebapp.access=ANYONE_ANONYMOUS、executeAs=USER_DEPLOYINGを保持する。更新後も続く場合はGASの「デプロイを管理」で有効な既存WebアプリURLと設定を確認 |
| DISCORD_HTTP_401 | Tokenの相違・失効 |
| DISCORD_HTTP_403_CODE_50001/50013 | 対象チャンネルへのアクセス・投稿権限 |
| DISCORD_HTTP_403_CODE_40333 | ローカル通信もブロックされている。連続実行せずDiscord側へ調査依頼 |
| LOCAL_START_FAILED | setup済みか、同じWindowsユーザー/PCか、NodeのPATH、他の起動済みプロセス |
| RECEIPT_INVALID_DO_NOT_DELETE | 送信済み記録の破損。削除して再送せず調査する |

## 検証

### GAS HTTP 404の調査・修正（2026-11-19）

設定中のURLへ認証なしGET/無効なPOSTを行い、両方ともscript.google.comからHTTP 404（リダイレクトなし）となることを確認。Discord投稿前の接続エラーであり、Token変更では解消しない。配置元appsscript.jsonにWebアプリ設定がなかったため、ANYONE_ANONYMOUS/USER_DEPLOYINGを明示した。これが本番404の直接原因かは更新後に確認する。HMAC認証と審査データ非公開は維持し、無署名リクエストでは操作できない。配置前にマニフェストの設定欠落を拒否する検査も追加し、配置テスト8件とclaspのdry-runに成功した。

再配置後に通知プログラムを再起動して確認。404が継続する場合は、GASのデプロイ管理画面で現在の既存Webアプリの公開設定と/exec URLを確認する。別URLへ変更した場合はlocal/config.jsonのgasUrlとworker/wrangler.jsoncのGAS_WEBAPP_URLを両方更新し、Workerにも反映する。既存URLを使う自動配置が前提のため、原因不明のまま新規デプロイを増やさない。

参照：[Google公式・Webアプリのマニフェスト](https://developers.google.com/apps-script/manifest/web-app-api-executable)。

既存テストと新規9件を含む69件、配置用テスト7件が成功。停止中の保留、引き当て競合と期限、別鍵の権限分離、回答編集中の旧ボタン無効化、記録再試行、承認→サイト公開、HTTPエラーの秘匿、再起動後の送信済み記録読取を確認。GASの実claspによる配置ファイル選択チェックも成功。Windowsの3スクリプトは構文解析済み。ダミーTokenとクリップボードのモックでsetup.ps1を実行し、DPAPI暗号化・復号と64桁の鍵生成を確認。本番の鍵保存・GASへの配置・タスク登録・連続稼働は利用者の設定後に確認する。
