# Discord本人認証・登録編集

## 実装した構成と現在の状態

公開サイトはGitHub Pagesのまま、登録・編集画面を既存Workerの `/register` で配信する。Discord OAuth2の認可コード＋PKCEで本人のDiscord IDを確認し、GASの管理シートから本人所有のバンドだけを返す。画像もブラウザ→Worker→GAS→既存Driveフォルダへ送る。これらの処理にローカルPCは不要。

既存Workerに登録済みのSecret名を読み取り、GAS_HMAC_SECRETだけであることを確認した。実運用のOAuth Client Secret設定・Drive権限承認が未実施のため、本人登録とWorker通知のフラグはfalse、登録ボタンはローカル確認用にregistrationMode=discordへ変更し、Workerの /register へ遷移する。Worker側の有効化・配置前は認証画面を利用できない。認証・所有者・画像・通知はテスト用の応答で検証済みだが、実DiscordのOAuth／通知がCloudflare側から拒否されないかは、有効化時に確認する。GASの新しいDrive権限を承認せず配置すると既存の実行にも認可エラーが出る可能性があるため、先に手順を確認する。

```mermaid
flowchart LR
  Site[GitHub Pages バンド登録] --> UI[Worker 登録・編集画面]
  UI <--> OAuth[Discord OAuth2]
  UI --> API[Worker 認証・CSRF・送信中継]
  API --> GAS[GAS 本人権限・画像検証]
  GAS --> Review[既存の審査管理シート]
  GAS --> Drive[既存Driveの3フォルダ]
  Review --> Queue[既存の通知待ち・リース]
  Queue --> Cloud[Worker通知 試験用フラグ]
  Queue --> PC[ローカル通知 暫定のまま]
  Cloud --> Discord[Discord審査チャンネル]
  PC --> Discord
  Discord --> Approval[既存の承認・却下]
  Approval --> Public[公開シート]
  Public --> Actions[GitHub Actions JSON生成・配置]
  Actions --> Site
```

## 初回の設定手順

### 1. Discord OAuth2

既存DiscordアプリのDeveloper Portal → OAuth2 → Redirectsに次を追加する。

```text
https://vrc-band-db-review.serieindustry.workers.dev/auth/callback
```

OAuth2のClient Secretを取得する。Bot Token／公開キーとは別の値。公開コード・チャットへ貼らない。

WorkerのSecretsへ以下を追加する（既存のGAS_HMAC_SECRETは維持）。

```powershell
cd C:\Users\Cubase\Documents\SerieIndustry\automation\discord
npx wrangler secret put DISCORD_CLIENT_SECRET --config worker/wrangler.jsonc
npx wrangler secret put PORTAL_SESSION_SECRET --config worker/wrangler.jsonc
```

PORTAL_SESSION_SECRETはランダム32バイト以上の秘密値。例：PowerShellで次を実行し、コピーされた値をSecret入力欄へ貼る。

```powershell
$portalBytes = [byte[]]::new(32)
$portalRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$portalRng.GetBytes($portalBytes)
$portalRng.Dispose()
Set-Clipboard -Value ([BitConverter]::ToString($portalBytes).Replace('-', '').ToLowerInvariant())
```

### 2. GASの配置・Drive認可

新しいコードとmanifestを配置し、GASエディターで `initializePortalIntegration` を手動実行する。運営の実行アカウントでDriveアクセスを承認する。関数は保存先の読取確認と管理タブ準備だけを行い、画像の作成・移動・共有変更は行わない。

提供された親フォルダ内をDriveツールで確認し、次の3フォルダをコードの既定値として設定済み（本番Script Propertiesへの書き込みは未実施）。必要ならScript Propertiesで上書きできる。

| Script Property | 保存先ID |
|---|---|
| PORTAL_LOGO_FOLDER_ID | 1JRfnhJcPhHKt2T5N5NKTI3Yd-k_oheB-wNBLGTqsvWhjh4p3H8VB01svi00aqpmwTvTzrI0B |
| PORTAL_ICON_FOLDER_ID | 1uiSDdGTidNutU1wDnCfFCXFNG75wqxauDfCpHGFgwkXxRU_q7fijNEvYLZhpkbNN7sdDK8uW |
| PORTAL_PHOTO_FOLDER_ID | 1bsW_QPAdBxPR-GvpdcPJopFbMST5Gq2HiVsQNGwEk9a_9kA0ms845eu4RyXABMZXzg01N57M |

GASのScript Propertiesに `PORTAL_ENABLED=true` を設定する。既存のENABLED等は維持。GASにはDriveスコープを追加しているが、利用者自身のGoogleログインは不要。

### 3. 本人登録を試験公開

`automation/discord/worker/wrangler.jsonc` の `vars.PORTAL_ENABLED` を文字列 `"true"` にし、Workerを配置する。まず `/register` を直接開いてログイン・新規登録・画像送信・編集・他人のデータが見えないことを確認する。

```powershell
npm run deploy:worker --prefix automation/discord
```

OAuthの経路が拒否された場合は `DISCORD_OAUTH_HTTP_403_CODE_40333` 等を返す。ログインが成功したこととBot通知が成功することは別。拒否された場合、PCを使う認証へは迂回しない。既存フォームへの登録ボタンはまだ維持されている。

既存バンドは管理人用チャンネルで次を実行し、本人のDiscord IDへ紐付ける。名前・Xの一致からは自動で権限を渡さない。

```text
/band-owner id:登録ID user:本人
```

コマンド追加時は保存済み認証情報を使い一度登録する。

```powershell
powershell -NoProfile -File .\automation\discord\local\start.ps1 -RegisterCommands
```

このコマンド登録用スクリプトは初回の運営作業だけで、利用者のログイン・登録には不要。band-ownerは既存の所有者を置換し、管理シートへ操作履歴を残す。将来、複数担当者を扱う場合はownerUserIds配列を拡張できる。

### 4. 公開サイトの登録先を切替

`SI-HP/src/config/app-settings.json` を次のように変更してサイトをビルド・配置する。

```json
{
  "vrcBandDb": {
    "discoveryEnabled": true,
    "discoveryCarouselEnabled": true,
    "registrationMode": "discord",
    "registrationUrl": "https://vrc-band-db-review.serieindustry.workers.dev/register"
  }
}
```

`registrationMode=form` に戻せば従来フォームへ戻る。フォームの回答シートや既存記録は削除しない。フォームの受付連携と定期読取を停止する場合はGASの `FORM_SYNC_ENABLED=false` とする。本人編集へ移行したレコードは、定期フォーム読取で上書きしない。

### 5. 通知のPC依存を段階的に外す

WorkerのSecretsに `DISCORD_BOT_TOKEN` と `LOCAL_NOTIFY_SECRET` を追加する。LOCAL_NOTIFY_SECRETは現在GASに設定した通知キュー専用鍵と同じ値。名前は旧方式のままだが、PCが必須という意味ではない。

`vars.NOTIFICATION_RUNNER_ENABLED="true"` にして配置すると、保存直後と5分ごとのCronで通知待ちを最大2件処理する。GASの `NOTIFICATION_TRANSPORT=local` は維持する（既存のキューを利用するため）。通常のCookieやOAuth秘密値を通知に使わない。

Discordが拒否した場合はACKせず、通知待ちを維持して安全なコードだけを記録する。通知失敗で登録情報は失われない。現行PCとは同じキューの10分リースを共有するため、失敗後の再引き当てまで待つ場合がある。新規投稿のnonceも既存PC方式と共通。投稿直後の通信断とDiscord側のnonce保持期限によっては厳密な一度限りを保証できない。

実際に新規／更新・承認ボタンまで届くことを確認してから、PCの通知タスクを停止・無効化する。拒否が続く間はフラグをfalseへ戻し、暫定のPC通知を残す。今回はPCタスクを停止していない。

## 認証と権限

- OAuthのstateを暗号化Cookieに結び付け、PKCEを使う。Discordのメール権限は要求しない。
- セッションは暗号化HttpOnly／Secure／SameSite=Lax Cookie。Discordアクセストークンは暗号化したセッション内だけに保持し、JavaScriptやAPI応答には公開しない。有効期限はDiscordのトークン期限と8時間の短い方。ローカルストレージ・シートには保存しない。
- セッションIDとDiscord IDの対応を非公開管理シートWebSessionsへ保存し、ログアウト後はGASでも拒否する。Workerは変更リクエストのOriginとCSRFトークンを検証する。
- フロントから送られたactorId等は信用せず、Workerが認証済みIDで署名し、GASが所有者と版を再検証する。
- レコードはownerUserIds、source=userを保持するが、所有者IDは公開シートへ出さない。本人登録・本人編集の承認後は「運営登録」を表示しない。引き継ぎ中は承認前の公開内容とマークを維持する。
- 1人最大10バンド、保存は1日60回。版の競合は拒否。通信再試行はsubmissionIdで重複作成を防ぐ。
- 通知は既存の承認待ちとして送る。本人が保存しただけでは公開しない。運営の既存edit・delete・restoreも維持する。

## 画像の処理と上限

| 項目 | PNG容量 | 最大寸法 |
|---|---:|---:|
| ロゴ | 2MiB | 1024×512 |
| アイコン | 512KiB | 256×256 |
| アー写 | 16MiB | 3840×2160 |

ブラウザでPNG・寸法・容量を確認し、SHA-256を計算する。Workerが小さなアップロードチケットだけに署名し、画像本体は24MiBで制限したストリームとしてGASへ中継する。大きなBase64変換や画像ハッシュ計算をWorkerで行わない。GASはセッション・チケット・SHA-256・PNGの署名／チャンク／CRC・IHDR寸法・容量を検証する。PNGの圧縮画素全体のデコードはGASでは行わない。

Driveへ保存した画像ファイルだけをリンク共有（閲覧のみ）にする。既存ファイルや親フォルダの権限は変更しない。変更前の画像は承認前の公開表示に必要なため、自動削除しない。

WebUploadsにuploadId・所有者・ハッシュ・容量・保存先を記録し、同じ画像送信の再試行で重複保存しない。保存途中で台帳更新に失敗した場合はUPLOAD_PENDINGとして運営確認を求め、無条件に再作成しない。使われなかった画像や旧画像も容量に含まれ、運営による定期整理が必要。

日次上限（UTC日付）は1人64MiB、全体256MiB。Script PropertiesのPORTAL_USER_DAILY_BYTES／PORTAL_GLOBAL_DAILY_BYTESで変更可能。無料枠そのものではなく、意図しない容量消費を防ぐ運用上限。初期値では全画像を上限まで使う登録を1人3組分・全体13組分／日程度まで送れる。

## 無料枠の見積もり（2026-11-21確認）

Workers Freeは1日100,000リクエスト、1実行CPU10ms。転送した画像が何GBを超えたら従量課金されるという方式ではない。画像1枚はチケット発行と実送信の2リクエスト。初回ログインから3枚を送って保存する一連の操作は概ね11リクエストだが、表示・再試行・Cron・既存Discord操作も合算される。画像中継のCPU使用量は本番ログで確認し、Freeの上限超過は処理失敗として扱う。料金プランの自動アップグレードは行わない。

Googleアカウントの容量は通常15GBでGmail／Drive／Photos共用。以前の使用量198.8MBが現在も同じなら、残り約14.8GB。3画像の合計容量別に、初回保存できる組数は次の概算。

| 1バンドの画像合計 | 保存可能な概算 |
|---|---:|
| 3MiB | 約4,700組 |
| 8MiB | 約1,760組 |
| 上限合計18.5MiB | 約760組 |

画像の更新履歴・未承認・未使用画像も容量を使うので、実際の登録可能数は下がる。Base64は転送時に約4/3へ増えるが、Driveへは元のPNGサイズで保存する。GASの1実行6分・同時実行・各Googleサービスの利用制限も別にあり、単純な枚数だけで動作保証はできない。16MiBの実画像や低速回線を含む本番負荷試験は未実施。

参照：[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers制限](https://developers.cloudflare.com/workers/platform/limits/)、[GAS制限](https://developers.google.com/apps-script/guides/services/quotas)、[Google容量](https://support.google.com/drive/answer/9312312?hl=en)、[Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)。

審査管理シートの共有メタデータは利用者指定の既存シートで確認し、userのowner/writerだけでanyone/domain公開がないことを確認した。WebSessions・WebUploads等を追加してもこの非公開運用を維持し、公開シートと分離する。

## ローカルでの画面確認

テストモードの localhost:5174 ではバンド登録ボタンから /register-preview.html を開き、認証を省略する。テストバンドを初期表示し、保存はブラウザのlocalStorageだけに行う。PNGもブラウザ内で保持するため、保存容量の制限を受ける。Drive・GAS・Discordへの送信は行わない。テストページは通常ビルドに含めず、localhost以外では利用できない。認証・審査・通知の結合確認は実サービス設定後に別途行う。

## 通常用・管理用の区別

Discord OAuthのscopeは identify guilds.members.read。対象サーバーのメンバー情報を /users/@me/guilds/{guildId}/member から取得し、既存コマンドと同じ ADMIN_ROLE_IDS（現在1572585514404413511）に一致した場合だけ管理用とする。モデレーターだけ・ロールなし・サーバー未参加は通常用。メンバー照会がエラーの場合は保存を停止し、管理権限を付与しない。古いセッションは通常用のままなので、配置後にログインし直す。

通常用は自分に紐付くバンドのみ表示・編集できる。管理用は削除済みを除く全バンドを表示・編集でき、新規追加は運営登録となる。既存データを管理用で編集しても、登録元と所有者は変更しない。管理用の保存も承認待ちに入り、審査を迂回しない。Workerは一覧取得・保存のたびにロールを照会し、その結果を署名してGASへ送る。ブラウザのrole指定では権限を変更できない。

ローカルテスト画面の上部に確認モードの選択肢を表示する。通常用では本人の1件、管理用では他の登録者のバンドを含む2件を初期表示。切り替え時はページを再読込するため、必要な変更を先に保存する。テストでの切り替えは認証権限に影響せず、本番の画面には表示しない。


## 初回登録の同意

通常用・管理用ともに、Discordアカウント単位で初回に「登録時の同意事項」7項目を表示する。チェックは初期状態で未選択とし、「上記の内容を確認し、誓約・同意します。」を選択してから「同意して登録画面へ進む」で進む。初回とはバンドごとではなく、現在の版への同意記録がないアカウントの初回利用を指す。既存フォームの同意は自動移行しない。

同意記録は審査用シートの非公開WebConsentsタブにDiscord ID・同意事項の版・サーバー時刻（UTC）を保存する。公開JSONには含めない。同じアカウント・版での再送は重複記録しない。同意前は編集画面を隠し、GASでも保存・画像保存を拒否する。同意済みなら以降の登録・編集では省略する。本文は共通エディターHTMLのregistration-termsに保持。本文変更時はHTML・GAS・ローカルテストのversionを合わせて更新する（現在2026-11-21-v1）。

テスト画面も同じ同意画面を表示するが記録はブラウザ内のみ。「初回同意を再表示」でテスト用同意記録をリセットできる。


## Vue登録画面とプレビュー

登録UIはSI-HP/src/views/BandRegistrationPage.vueに移行。DBページとは独立したVueエントリーを持ち、URLはWorkerの/register、ローカルは/register-preview.htmlを維持する。画像URL変換はband-media.mjs、画像表示はBandImage、ロゴとアー写の合成はBandVisual、YouTubeはBandVideoを両画面で共用する。画像URLまたはPNG保存後のURLを即時プレビューし、取得失敗時は「読み込めません」と元画像へのリンクを出す。YouTube側が埋め込みを禁止している場合等は、プレーヤー側のエラーとYouTubeで開くリンクで確認する。

必須マークは赤。よみがなは未入力なら警告せず、ひらがな・長音・空白以外があると「ひらがなで入力してください。」を表示して保存を止める。GASでも同じ検証を行う。その他SNSリンクはタイトルとURLを別々に入力し、保存時だけ従来のタイトル:URLに変換する（メール表記も維持）。募集パートの自由入力ボタンは「＋ 募集パート（自由入力）」。

ビルドはSI-HP/scripts/build-registration.mjsでVueと共通データをまとめ、外部CDNに依存しない単一HTMLを生成する。生成先worker/generatedはGit管理せず、npm run check:worker／deploy:worker／test:deployで事前に生成する。手動配置もautomation/discordでnpm run deploy:workerを使用する。Actionsは同じnpm経路で生成・検査・配置する。サイトソース変更もWorker配置の検知対象。通常のサイトビルドにはテスト専用画面を含めない。


## 管理用のJSON読み込み・削除

JSONを読み込む（新規バンド）で1〜20件・64KiB以内の従来形式を追加できる。既存の一覧は保持し、読み込んだバンドには既存IDを引き継がない。読み込みだけでは送信せず、各バンドで保存する。管理用以外には読み込みを表示しない。

削除は活動時間帯の下に表示し、確認ダイアログで確定する。未保存の入力はブラウザ内から取り除く。登録済みデータは/api/deleteからWorkerでロール再確認、署名済みportal_deleteをGASで検証し、既存のremove処理とpublishを実行する。通常用はAPI直接呼び出しでも拒否。版違いは停止し、同じ版の再送は二重削除しない。履歴・元データ・復元バックアップを残し、Discordの/band-restoreで復元する。ローカルテストでは保存先はブラウザ内だけ。

よみがなと英語欄の言語チェックは現在、項目名の右の黄色い任意警告。警告中も保存可能で、GASも拒否しない。以前の保存禁止の記述より本項を優先する。

## 本番有効化の進捗（2026-11-22）

WorkerのSecret名を確認し、DISCORD_CLIENT_SECRET・PORTAL_SESSION_SECRET・GAS_HMAC_SECRETの登録を確認した。wranglerのPORTAL_ENABLEDはtrueに変更し、配置なしのdry-runが成功した。本番配置は自動承認レビューで拒否されたため未実施。本番配置・公開切替の承認と、GAS側のDrive再認可・PORTAL_ENABLED設定の完了確認後に進める。

### 本番Worker配置完了（2026-11-22）

ユーザーの明示承認後にWorkerを配置し、PORTAL_ENABLED=trueを反映した。Version:350cf903-1810-4a5b-b60c-ea7d423c0815。/VRCBandDB/registerから/auth/login、さらにDiscordの認可画面への302転送を確認。scopeはidentify guilds.members.read、callbackは既存/auth/callback。GASのinitializePortalIntegrationとPORTAL_ENABLED設定はユーザーが実施済み。実アカウントでの認可後のGAS接続・保存・画像アップロードは未確認。通知のクラウド実行フラグはfalseのまま。

### 画像送信の転送対応（2026-11-22）

画像をストリームPOSTした後、ContentServiceの結果URLへの自動転送でWorkersが本文の再送を要求し、TypeErrorからPORTAL_REQUEST_FAILEDになっていた。実GASへの署名なし無効リクエストをCloudflare互換ランタイムで送って再現した（登録・Drive書込なし）。画像POSTはredirect:manualで一度だけ送り、301/302/303のLocationをhttps://script.googleusercontent.comに限定してGETで結果を受け取る方式へ修正。画像や認証ヘッダーは転送先に再送しない。不正な転送先・過剰転送・非JSON・HTTP失敗は個別エラーにする。

修正後に実GASのJSON（INVALID_ENVELOPE）を取得できることを確認。画像中継の単体14件・実行環境10件成功。本番Worker Version:afb18e2e-a14d-42c1-af78-f1f8c228d23cへ配置済み。認証済み利用者による実画像の最終保存は再試行で確認する。

### 管理人の個人用切り替え

登録画面上部の管理用／個人用で切り替える。管理人だけに表示し、個人用では本人バンドのみ・本人登録として動作する（運営登録マークなし）。既存の運営登録を本人が編集するには所有者の紐付けが必要。未保存内容は確認後に破棄し、選択はsessionStorageへ保持。管理人資格canManageと有効モードroleをAPIで分ける。通常ユーザーはURLや本文にmode=adminを指定しても権限を得られない。

管理人の個人用切り替えを本番Workerへ配置済み（2026-11-22、Version:5123a7c7-bec1-4f2c-a1e5-f7cd2e54ce6c）。対象の単体・ローカルテスト21件、実行環境テスト10件成功。GASコードの変更は不要。
