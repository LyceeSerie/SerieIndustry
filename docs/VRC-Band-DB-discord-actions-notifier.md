# GitHub ActionsによるDiscord通知

## 構成

PCの常駐通知プログラムに代わり、GitHub ActionsがGASの既存の通知キューを読み取って送信する。バンドの審査・公開や、登録画面のDiscordログイン経路は変更しない。

```text
GAS：通知待ちと送信ジョブを保持
  ↓ 5分間隔／手動実行
GitHub Actions：署名付き取得 → Discord送信 → GASへ送信結果を通知
```

GASのNOTIFICATION_TRANSPORTはlocalのまま使う。localは通知専用の署名鍵・キュー経路の名称で、実行場所がPCであることは要求しない。PCとActionsはGASの10分リースで同じジョブの同時取得を防ぐ。ただし運用切替後はPC側を停止する。

## ファイルと設定

- `.github/workflows/discord-notify.yml`：スケジュールと手動テスト。
- `automation/discord/actions/notifier.mjs`：1実行最大20ジョブを処理する。
- `automation/discord/local/config.json`：既存のGAS URL・通知先・アプリID。秘密値は含まない。
- Secrets `DISCORD_NOTIFIER_BOT_TOKEN`：Discord Botトークン。
- Secrets `DISCORD_NOTIFIER_HMAC_SECRET`：GASのLOCAL_NOTIFY_SECRETと同じ通知専用鍵。承認用GAS_HMAC_SECRETは渡さない。
- Variable `DISCORD_NOTIFIER_ENABLED`：trueで定期処理を有効化。テスト成功まではfalse。

既定ブランチmainに起動用ワークフローを置き、実行コードは既存の運用ブランチfeature/spaから取得する。ワークフローにも同じファイルを保持する。GitHub標準Linuxランナー・Node.js 24で、npm install不要。GITHUB_TOKEN権限はcontents:readのみ。PRやforkからは起動せず、同時実行を直列化し、実行時間は最大15分。

5分間隔はGitHubの定期実行であり、開始遅延・実行のスキップがあり得る。既定ブランチにワークフローが必要で、公開リポジトリの無活動期間が60日を超えると定期実行が無効になる場合がある。現段階ではGASからイベントごとの起動は追加しない。

## 送信・再試行

1. 通知専用鍵で署名してlocal_claimを取得する。
2. 既存メッセージがあるジョブはPATCHする。
3. 新規ジョブは同じ通知IDのメッセージが直近100件にないか確認し、未送信なら固定nonceでPOSTする。
4. 埋め込みのフッターに非秘密の通知IDを保存する。
5. GASへlocal_ackを送り、同じジョブの結果を確定する。

GASの混雑・通信失敗は短い待機を挟んで再試行する。結果確定に失敗したら、そのジョブで実行を終了して次のジョブへ進まない。次回実行時はDiscordの通知IDを照合し、既存メッセージがあれば再投稿せず結果だけを確定する。ローカルディスクやrunner間キャッシュに依存しない。

DiscordエラーはHTTPステータスと数値コードだけを記録し、トークン・HMAC鍵・本文・画像URL・登録内容はActionsログや成果物へ出力しない。メンションは禁止。履歴照合は直近100件と残っているフッターが対象であり、履歴削除等を含む完全なexactly-once配信を保証するものではない。

## 手動通知テスト

Actionsの「Discord notifications」からtest_notification=trueで実行する。この場合は自動処理フラグfalseでもテストのみ許可する。

- 通知チャンネルへ「GitHub Actions 通知テスト」を送る。
- 同じrun IDの再実行では同じ通知を探し、重複投稿を抑える。
- Discord APIからメッセージを読み戻して、BotのIDと通知IDを検証する。
- バンドの登録・審査・公開データ・GASキューはテストでは操作しない。

成功後にDISCORD_NOTIFIER_ENABLED=trueへ変更し、test_notification=falseでGAS接続と通常キュー処理を確認する。その後、PCの「VRC Band DB Local Notifier」タスクを停止・無効化し、PC側プログラムが残っていないことを確認する。PCに未確定の送信結果が残っている場合は、先にGASへの確定を済ませる。

## 検証状況

通知ランナーの5件を含むアプリ全体251件が成功。GASキュー取得・送信・確定、runnerをまたぐ応答喪失からの復旧、既存通知の更新、通知先検証、Discordエラー時の停止、テスト通知の読み戻しをモックで検証した。

実DiscordへのテストはGitHub Secrets設定後に行う。認証情報のGitHub移転に対する自動承認レビューが明示承認を要求したため、現時点ではSecrets未設定、自動処理は無効。
