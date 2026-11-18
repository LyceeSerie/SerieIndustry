# VRC Band DB Discord連携

フォーム回答をDiscordへ通知し、運営ロールの承認・却下をGASへ保存するサーバーレス連携です。

- [設定・運用手順](../../docs/VRC-Band-DB-discord-setup.md)
- [仕様書](../../docs/VRC-Band-DB-discord-spec.md)
- [GAS・Workerの自動更新と認証設定](../../docs/VRC-Band-DB-discord-ci.md)

このディレクトリを作成しただけでは動作しません。Google／Discord／Cloudflare／GitHubの設定が必要です。現在のサイトは従来の取得先を維持しています。

## 配置

- `gas/Core.gs` と `gas/Code.gs`：同じApps Scriptプロジェクトへコピー。
- `gas/appsscript.json`：GAS設定。
- `gas/settings.example.json`：Script Propertiesの設定名。秘密値は各設定欄に入力。
- `worker/src/index.mjs`：Discord Interactions受付。
- `worker/wrangler.jsonc`：Workerの非秘密設定。

## テスト

`SI-HP`ディレクトリで`npm test`。外部サービスへの実投稿・シート更新・ワークフロー起動は行わず、実際の処理コードを模擬サービスでテストします。

実アカウントでの試験は専用チャンネル・フォーム・シートで行ってください。

## 自動更新

`.github/workflows/deploy-discord.yml`がサイト更新とは別にBotコードを配置します。
GitHubで`DISCORD_DEPLOY_ENABLED=true`にするまでは、自動配置しません。
GASの配置先は既存Webアプリ、Workerの配置先は既存名を使い、Script Propertiesと共有鍵を維持します。

配置ツールの確認はこのディレクトリで`npm ci`後、`npm run test:deploy`・`npm run check:gas`・`npm run check:worker`。
確認コマンドは実配置・Googleへの接続を行いません。
