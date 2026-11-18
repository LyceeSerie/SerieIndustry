# Discord 40333のローカル診断

更新日：2026-11-19

## 確認結果

- GASでフォーム2件の取込に成功したが、Discord投稿はHTTP 403 / code 40333で失敗。
- ローカルPCから公式User-Agent付きで公開API `GET /api/v10/gateway` にアクセスし、HTTP 200と正常なgateway URLを確認した。
- この結果は認証不要APIの接続確認のみ。Bot認証・チャンネルへのアクセス・投稿の成功は保証しない。
- このPCの実行環境と所定のローカル設定ファイルにはBot Tokenがなかったため、同一Botでの認証付き比較は未実施。

## 認証付きの比較方法

PowerShellで実行する。GASのスクリプトプロパティ `DISCORD_BOT_TOKEN` と同じ値を使用する。

```powershell
cd C:\Users\Cubase\Documents\SerieIndustry
powershell -NoProfile -File .\automation\discord\ci\diagnose-local.ps1 -SendTest
```

入力を求められたらTokenだけを貼り付けてEnter。入力は非表示。Tokenをコマンド引数・ソース・チャットへ書かない。Windowsの実行ポリシーで拒否された場合はそのエラーを確認し、組織設定を無断で変更しない。

診断順序：

1. `GET /users/@me`：Bot認証とアプリIDの一致を確認。
2. `GET /channels/1572258078017986620`：対象チャンネルとサーバーの一致を確認。
3. `-SendTest`指定時のみ、メンションなしのテストメッセージ1件と埋め込みを投稿。登録回答・審査データは使用しない。テスト投稿はチャンネルに残る。

`-SendTest`を省略すれば読み取り確認のみ。失敗時はそこで停止し、自動再試行はしない。APIの生応答・Token・チャンネル名などは出力しない。認証ヘッダーを含むクライアントは終了時に破棄する。Tokenはファイルに保存しないが、通信のためプロセスメモリ上では扱う。

## 結果の解釈

- 全段階成功：少なくともローカルからの同じBotの投稿と埋め込みは成功。GASとの差があることを示すが、共有IPやUser-Agent等のどれが原因かまでは特定できない。
- HTTP 401：Tokenの相違・失効等を確認。
- Discord code 50001 / 50013：対象へのアクセス・権限を確認。
- code 40333：そのリクエストもDiscord側Cloudflareに拒否されている。連続実行せずDiscordへ調査を依頼する。

ローカル送信の成功だけでは、本番通知の復旧とはしない。異なるネットワークへの移行やプロキシによる自動迂回はこの診断には含まない。

## 検証

- PowerShellの構文解析：成功。
- ローカル公開API：HTTP 200。
- 認証付き実行：Token入力待ち。

## 公式資料

- https://docs.discord.com/developers/resources/user#get-current-user
- https://docs.discord.com/developers/resources/channel#get-channel
- https://docs.discord.com/developers/resources/message#create-message
