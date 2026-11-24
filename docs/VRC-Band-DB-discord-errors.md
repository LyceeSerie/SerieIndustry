# Discord操作が失敗したとき

更新：2026-11-20。

## 未承認の登録を削除・復元してから承認する

削除と復元で版が進む。例：登録時の版1 → 削除後の版2 → 復元後の版3。復元前の版1のボタンでは承認できない。これは古い内容の誤承認を防ぐための拒否。

1. PCのローカル通知プログラムが起動中か確認する。
2. 次の取得・表示更新を待つ（通常の取得間隔は30秒。失敗・引き当て中はそれ以上かかる）。PCログのsent→acknowledgedも確認する。
3. Discordの同じ登録IDの通知で、表示された版が現在の版になったことを確認する。
4. 更新後のボタンで承認する。管理人は1人、モデレーターは設定人数で確定する。

新しいメッセージが表示されても、PCからGASへの送信済み記録が未確定だと一時的に承認できない場合がある。NOTIFICATION_PENDINGの場合はacknowledgedまで待つ。既存メッセージの更新では、同じメッセージURLの内容が後から変わる。

## エラーコードと次の手順

| コード | 意味・対応 |
| --- | --- |
| STALE_REVIEW | 古い版のボタン。通知プログラムの稼働と更新を確認し、現在の版のボタンを押す |
| NOTIFICATION_PENDING | メッセージIDの送信済み記録が未確定。PCのacknowledgedを待ち、止まっていればPC側エラーログを確認 |
| WRONG_REVIEW_MESSAGE | 現在と異なるメッセージのボタン。同じ登録IDの最新通知を使う |
| REGISTRATION_DELETED | まだ削除済み。管理人がband-restoreで復元してから通知更新を待つ |
| FORM_RESPONSE_READ_FAILED | 原回答が読めない。FORM_ID、回答の存在、GAS実行アカウントの編集権限を確認。diagnoseIntegrationでフォームアクセスを診断。原回答が削除済みなら利用者に再登録を依頼し、古い登録は掲載削除を維持する |
| NOT_FOUND | 登録IDが見つからない。管理人がband-infoの名前検索で確認 |
| STALE_VOTE | 後の投票に対して古いリクエスト。最新通知の票を確認し、変更するときだけ再操作 |
| BUSY_RETRY | GASの他処理と競合。Workerが1回再試行。続く場合は通知の状態を確認してから再操作 |
| STALE_DELETE / STALE_RESTORE | 確認後に登録が更新された。band-infoで現在状態を見てコマンドから開き直す |
| INVALID_DELETE_CONFIRMATION | 削除・復元の確認が無効または5分の期限切れ。同じ本人が新しい確認画面で操作 |
| ROLE_REQUIRED / ADMIN_REQUIRED | 必要な運営ロールがない。管理人にロール確認・実行を依頼 |
| WRONG_DESTINATION | 操作チャンネルが違う。通知/コマンド用の区別とGAS/Workerの設定を確認 |
| INTEGRATION_DISABLED | GASのENABLED設定を管理人が確認 |
| INVALID_SIGNATURE | WorkerとGASのGAS_HMAC_SECRETを確認。PC用のLOCAL_NOTIFY_SECRETとは別 |
| INVALID_ENVELOPE / REPLAY | 形式・期限・再利用拒否。両方の配置を確認し、状態確認後にDiscordから再操作 |
| GAS_HTTP_数字 | GASがHTTPエラー。Webアプリの/exec URL・公開設定・デプロイを確認 |
| GAS_CONNECTION_FAILED | GASの応答を確認できない。URL・公開設定・配置結果とGAS実行履歴で保存済みか確認し、必要な場合だけ再操作 |
| OPERATION_REJECTED | まだ分類できない失敗。band-infoの状態、GAS実行ログとPCログを確認し、コード付きで共有 |

編集系の失敗は応急編集手順も参照する。

## 表示とログ

Discordには安全な固定メッセージによる原因・手順を表示する。古い通知等では「押したボタンの版／現在の版」「通知更新待ち」と現在のメッセージへのリンクも表示する。外部エラー本文・Token・秘密値は表示しない。

GASで処理を捕捉して返すため、実行履歴が「完了」でも操作が拒否されることがある。実行ログの`[審査拒否]`または`[操作失敗]`を開く。未知のエラーではコード・例外の種別・取得できたCode/Coreの行番号だけを記録する。生の例外本文は記録しない。

## 反映・検証

今回の変更はGASとWorkerの両方を配置する。コマンド定義・PCプログラムの変更はなく、再登録・鍵再設定・PC側コード更新は不要。

未承認→削除→復元→旧ボタンの拒否→ローカル通知の更新・送信済み記録→管理人/モデレーター承認、未ACK時の拒否とACK後の成功、原回答エラーの分類、Discordでの原因/手順/版/リンク表示を検証。追加4件を含むnpm test112件成功。実環境の拒否原因は、更新後に表示されるコードで確認する。


## 再承認の確認画面でGAS応答を取得できない場合（2026-11-23）

以前のGAS_CONNECTION_FAILEDは時間切れ・ネットワーク失敗・JSON以外の応答を区別していなかった。GAS呼び出しの初回待機を8秒から18秒へ延長し、再試行は8秒とする。失敗はGAS_TIMEOUT／GAS_NETWORK_ERROR／GAS_INVALID_RESPONSE／GAS_HTTP_ステータスで案内する。Workerログには操作種別・試行番号・安全なコード・経過時間だけを記録し、秘密値・URL・入力・外部レスポンス本文は出さない。

admin_reopen_previewは確認画面を取得する処理で、却下取り消しは実行しない。取得失敗なら少し待ち、最新通知の「再承認」またはband-reopenを再実行する。確定操作で失敗した場合は保存済みの可能性があるためband-infoで状態を確認する。GAS_INVALID_RESPONSEならGASの公開設定・既存デプロイ先を確認する。元のエラーメッセージだけでは原因は確定できないため、再発時は新しいコードとWorkerのgas_request_failedログで切り分ける。

## Discordコマンドのロール／チャンネル拒否

スラッシュコマンドは、署名検証済みinteraction.member.rolesにADMIN_ROLE_IDSのいずれかが含まれ、channel_idがDISCORD_COMMAND_CHANNEL_IDと一致するときに実行できる。ロール名・並び順・ユーザー名・DiscordのAdministrator権限だけでは管理人とみなさない。スレッドも親とは別のチャンネルIDになるため、専用チャンネル本体で実行する。

以前は管理人ロール不足とチャンネル不一致で同じ文言を返していた。2026-11-24の修正で以下へ分ける。

- COMMAND_CHANNEL_REQUIRED：管理人ロールは確認済み。表示された専用チャンネル本体で実行する。
- COMMAND_ADMIN_REQUIRED：運営ロールはあるが、設定された管理人ロールがない。
- OPERATOR_ROLE_REQUIRED：管理人・モデレーターのどちらも確認できない。表示されたロールIDと実際のロールIDを照合する。

Workerログのevent=discord_authorization_deniedに、拒否理由、interactionId、コマンド名、実行先／専用チャンネルID、管理人／モデレーターロールの一致結果とロール数を出す。トークン・コマンド入力値・ユーザーID・ロール一覧は出さない。許可対象の変更はない。
