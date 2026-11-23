# GAS・Cloudflareの自動更新と認証設定

更新日：2026年11月18日  
状態：Actions・配置ツール・テストを実装済み。認証情報の登録とGitHubでの初回実行は未実施。

## 1. 更新の流れ

- サイト：既存のDeploy Vue SPA to deploy。登録の承認によるJSON再生成・サイト公開はこちら。
- Botコード：新しいDeploy Discord integration。feature/spaへコードをpushすると、変更した部品だけ更新する。
- GAS変更はGAS、Worker変更はWorkerを配置する。共通の配置ツール・ワークフロー変更時は両方を配置する。テストやREADMEだけの変更では再配置しない。
- Bot更新時もテストを先に実行する。GAS→Workerの順に配置し、GASが失敗したらWorker更新へ進まない。
- GASの既存WebアプリURL、Worker名、Script Properties、トリガー、WorkerのGAS_HMAC_SECRETは維持する。初期化・トリガー再作成・Bot Tokenの再登録はしない。

## 2. GitHubへ追加する設定

対象リポジトリ：LyceeSerie/SerieIndustry。

### Secrets（秘密情報）

[Settings → Secrets and variables → Actions → Secrets](https://github.com/LyceeSerie/SerieIndustry/settings/secrets/actions) のNew repository secretから登録する。

| Name | 内容 |
| --- | --- |
| CLOUDFLARE_API_TOKEN | Workerの自動配置用API Token。次の手順で発行 |
| CLASPRC_JSON | Googleログインで作成するclasp認証ファイルの内容全体 |

GASのGITHUB_TOKENやBot Tokenとは別の認証情報。GASの既存Script PropertiesをGitHubへコピーする必要はない。秘密値はチャットへ貼らず、GitHubの設定画面へ直接入力する。

### Variables（設定値）

[Settings → Secrets and variables → Actions → Variables](https://github.com/LyceeSerie/SerieIndustry/settings/variables/actions)へ登録する。

| Name | Value |
| --- | --- |
| CLOUDFLARE_ACCOUNT_ID | 970b023d595209b998607722cd45ee9b |
| GAS_SCRIPT_ID | GASプロジェクトの「プロジェクトの設定 → スクリプトID」の値 |
| DISCORD_DEPLOY_ENABLED | 初めはfalse。初回の確認実行後にtrue |

GAS_SCRIPT_IDはフォームID、シートID、WebアプリのデプロイIDのいずれとも異なる。WebアプリのデプロイIDは既存のWorker設定のGAS_WEBAPP_URLから自動取得するため、追加設定不要。

## 3. Cloudflare API Tokenを作る

1. [CloudflareのAPI Tokens](https://dash.cloudflare.com/profile/api-tokens)を開く。
2. Create TokenからカスタムTokenを作成する。
3. 権限をAccount → Workers Scripts → Editにする。
4. Account Resourcesは、今回のWorkerが属するアカウントだけをIncludeする。全アカウントへの許可は不要。
5. Tokenを発行し、GitHubのCLOUDFLARE_API_TOKEN Secretへ貼り付ける。

workers.devでの配置なので独自ドメインのZone権限は追加しない。期限付きTokenは期限切れ時に更新する。

## 4. Googleの自動更新用ログイン

**現在のWebアプリをデプロイしたGoogleアカウント**で操作する。フォーム所有者と同じかどうかより、対象GASと既存デプロイの更新権限が重要。

1. [Apps Scriptのユーザー設定](https://script.google.com/home/usersettings)で「Google Apps Script API」をオンにする。
2. PowerShellで以下を実行する。

```powershell
cd C:\Users\Cubase\Documents\SerieIndustry\automation\discord\gas
npx --yes @google/clasp@3.4.1 --auth .clasprc.deploy.json login
```

3. ブラウザでGASの配置に使用したGoogleアカウントを選択し、claspへのアクセスを承認する。`--use-project-scopes`は付けない。
4. ログイン完了後、以下を実行する。内容を画面に表示せずクリップボードへコピーする。

```powershell
Get-Content -LiteralPath .clasprc.deploy.json -Raw | Set-Clipboard
```

5. GitHubのCLASPRC_JSON Secretへそのまま貼り付ける。JSON全体を使う。refresh_tokenだけを抜き出さない。
6. GAS編集画面の「プロジェクトの設定 → スクリプトID」をGAS_SCRIPT_ID Variableへ登録する。

`.clasprc.deploy.json`はGoogle認証情報なので、Gitへ追加しない。.gitignoreで除外済み。ログイン情報の失効時は再ログインしてGitHub Secretを更新する。スコープを増やしたときは、Google側で追加の承認が必要になる場合がある。

## 5. 初回の実行

1. 今回の変更をfeature/spaへpushする。DISCORD_DEPLOY_ENABLEDがfalseまたは未設定なら、自動配置は動かない。
2. `.github/workflows/deploy-discord.yml`を既定ブランチmainにも反映し、Actionsの手動実行メニューを使えるようにする。
3. GitHub ActionsでDeploy Discord integration → Run workflowを開く。
4. branchはfeature/spa、targetはall、dry_runはチェックありで実行する。テストとファイル選択・Workerの組み立てだけを行い、Googleへ接続せず、実配置もしない。
5. 成功したらDISCORD_DEPLOY_ENABLEDをtrueにする。
6. 同じ手動実行でbranch=feature/spa、target=all、dry_runのチェックを外して実行する。これが認証を使う最初の実更新になる。
7. GAS・Workerの更新成功、Discord Endpointの応答、登録通知・承認の一連の動作を確認する。

以後は対象コードをfeature/spaへpushするだけで更新される。登録の承認で起動されるサイト用Actionsは、Botの自動配置を起動しない。

## 6. 何が維持・変更されるか

| 対象 | 動作 |
| --- | --- |
| GASコード | GitHubのCore.gs、Code.gs、appsscript.jsonで置き換える |
| GASの手動追加ファイル | 自動更新元に含まれなければ削除され得る。今後はリポジトリをコードの管理元にする |
| Script Properties | 変更しない |
| GASトリガー | 再作成しない。既存トリガーは新しいソースを使う |
| Webアプリ | 既存デプロイIDを更新し、/exec URLを保つ |
| Workerコード・非秘密のvars | wrangler.jsoncとsrc/index.mjsから反映 |
| Workerの共有鍵 | 現在のSecretを保持。GitHubへコピーしない |

## 7. 失敗時の扱い

- GAS_SCRIPT_IDに既存Webアプリのデプロイが存在することを、ソース送信前に確認する。異なるプロジェクトへの誤更新はここで止める。
- 認証ファイルはRunnerの一時ディレクトリへ作り、終了時に削除する。設定例・テスト・認証ファイルをGASへ送信しない。
- claspのエラー出力をそのまま公開ログへ転送しない。個々の認証値もGitHubのマスク対象へ登録する。
- ソース送信後、Webアプリの版更新だけが失敗することはあり得る。その場合、トリガーは新ソース、Webアプリは旧版となり得るため、ログの失敗段階を確認して再実行する。
- GASとWorkerの配置はサービスをまたぐので単一トランザクションではない。Workerだけ失敗した場合はtarget=workerで再実行できる。変更時は一時的な新旧混在に対応する互換性を保つ。
- 緊急停止はDISCORD_DEPLOY_ENABLED=false。これはコードの自動更新だけを止め、稼働中Botやサイトを停止しない。
- 対象Googleアカウントの権限・Token失効・API設定を直してから再実行する。秘密値をActionsログやチャットへ貼らない。

## 8. 検証

- 既存57テスト成功。配置用7テストを追加し、ファイル選択、誤デプロイID時の停止、失敗時の後続停止、一時認証ファイルの削除、変更ファイル別の配置先選択を確認。
- 実clasp 3.4.1のshow-file-statusでアップロード対象3ファイルを確認。
- 実Wrangler 4.164.0のdry-runでWorkerの組み立てを確認。
- 認証情報の作成・GitHub Secretsへの登録・本番デプロイは行っていない。

## 参照

2026-11-19追記：appsscript.jsonにwebappのaccess=ANYONE_ANONYMOUS、executeAs=USER_DEPLOYINGを明示し、自動配置での欠落を事前検査する。無署名リクエストは既存HMAC検証で拒否する。設定中URLで確認された404の復旧は、再配置後に別途確認する。配置テストは8件成功。

- [Cloudflare公式：GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Google公式：claspとGitHub Actions](https://developers.google.com/apps-script/guides/clasp)
- [claspの設定ファイルと認証ファイル](https://github.com/google/clasp/blob/master/docs/config-files.md)
