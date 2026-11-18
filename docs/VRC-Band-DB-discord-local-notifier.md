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

`sent`がDiscord投稿または表示更新、`acknowledged`がGASへの送信済み記録を表す。通知なしの場合は30秒ごとに無言で待機する。Ctrl+Cで終了。今回通知待ちだった2件も対象になる。登録内容のテストメッセージへの置換や回答の再送信は不要。

この実行ではBot Tokenを復号してNodeプロセスへ引き渡す。標準出力・ログには鍵や回答を出さない。状態保存先local/.stateには送信済み記録とプロセスロックだけを保存し、Git対象外とする。複数起動はロックで防ぐ。複数PCではGAS側の引き当てで同じ通知の同時送信を防ぐが、通常は1台だけで稼働させる。

### 5. Windowsログイン時に自動起動（任意）

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

- ローカル専用鍵でHMAC署名する。5分の時刻許容・nonceの再利用拒否は既存方式を利用する。PCの時刻を正しく保つ。
- 専用鍵で許可する操作はlocal_claim/local_ackだけ。審査操作に使うWorker用GAS_HMAC_SECRETとは分ける。
- 1件を10分間引き当て、PC停止・送信失敗時は同じジョブIDで再取得する。引き当て中は他のPCに渡さない。失敗後の再取得は引き当て期限まで待つ場合がある。
- 新規Discord投稿はジョブID由来の安定したnonceとenforce_nonceを使用。既存メッセージはPATCHで更新する。
- Discord成功後はPCにreceipt.jsonを原子的に保存する。GASへの記録に失敗しても、PC再起動後は記録だけを再試行する。
- Discordが投稿を受理した直後に通信・PCが停止し、PCの送信済み記録を書けなかった場合、厳密な一度限りの保証はできない。Discordのnonce重複排除期間を過ぎた再送では重複の可能性が残る。
- 回答の版・表示状態が送信中に変わっても、古い通知の無効化と最新通知の送信を維持する。
- 失敗は1分から最大15分へ待機時間を延ばして再試行し、HTTP 429では指定の待機時間も尊重する（最大1時間）。API応答本文やTokenはログへ出さない。

## エラー

| 表示 | 確認事項 |
| --- | --- |
| GAS_REQUEST_REJECTED_CHECK_MODE_AND_LOCAL_KEY | GASの配置、NOTIFICATION_TRANSPORT=local、専用鍵、ENABLED、PC時計。GASロック競合でも一時的に発生し得る |
| GAS_INVALID_RESPONSE | Webアプリの実行権限・公開設定、正しい/exec URL |
| DISCORD_HTTP_401 | Tokenの相違・失効 |
| DISCORD_HTTP_403_CODE_50001/50013 | 対象チャンネルへのアクセス・投稿権限 |
| DISCORD_HTTP_403_CODE_40333 | ローカル通信もブロックされている。連続実行せずDiscord側へ調査依頼 |
| LOCAL_START_FAILED | setup済みか、同じWindowsユーザー/PCか、NodeのPATH、他の起動済みプロセス |
| RECEIPT_INVALID_DO_NOT_DELETE | 送信済み記録の破損。削除して再送せず調査する |

## 検証

既存テストと新規9件を含む69件、配置用テスト7件が成功。停止中の保留、引き当て競合と期限、別鍵の権限分離、回答編集中の旧ボタン無効化、記録再試行、承認→サイト公開、HTTPエラーの秘匿、再起動後の送信済み記録読取を確認。GASの実claspによる配置ファイル選択チェックも成功。Windowsの3スクリプトは構文解析済み。ダミーTokenとクリップボードのモックでsetup.ps1を実行し、DPAPI暗号化・復号と64桁の鍵生成を確認。本番の鍵保存・GASへの配置・タスク登録・連続稼働は利用者の設定後に確認する。
