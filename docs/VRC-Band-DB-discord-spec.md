# VRC Band DB Discord通知・承認連携 仕様案

作成日：2026年11月18日  
状態：GAS・Worker・承認データ取込・Actions定義を実装済み。ローカルテストとビルドを確認。外部設定・本番の取込先切替・実アカウントでの連携試験は未実施。

導入順序は [設定・運用手順](VRC-Band-DB-discord-setup.md) を参照。

## 1. 目的と範囲

- Googleフォームへの回答をDiscordの運営チャンネルへ通知する。
- 運営メンバーが通知の「承認」「却下」ボタンで審査する。
- 承認した内容だけをサイト公開用データへ反映し、GitHub Actionsを起動する。
- 常時稼働するBotサーバーは置かず、GASとサーバーレスのHTTP受付を使う。
- 却下は削除ではなく非掲載とする。管理人専用のスラッシュコマンドで掲載削除を行える。元回答の物理削除とリアクション操作は含めない。

## 2. 現在の実装と変更点

| 項目 | 現在 | 導入後 |
| --- | --- | --- |
| 取込元 | 元回答シートのCSV | 承認時に作成した公開用シートのCSV |
| JSON作成 | ビルド時 | 維持 |
| 画面表示 | 生成済みJSONを取得 | 維持。Bot・シートへ直接接続しない |
| 公開起動 | feature/spaへのpush | pushに加え、承認後のworkflow_dispatch |
| 却下 | 処理なし | 非掲載として履歴を保存 |

現行ファイル：

- `SI-HP/scripts/band-source.mjs`：本番・テストの取込先。
- `SI-HP/scripts/band-data.mjs`：公開項目への変換。
- `.github/workflows/deploy-spa.yml`：テスト・シート取得・ビルド・deployブランチ更新。
- リポジトリ：`LyceeSerie/SerieIndustry`。ローカルのorigin/HEADはmainを指すが、導入時にGitHub側の既定ブランチを再確認する。

## 3. 構成

```mermaid
flowchart TD
  F[Googleフォーム] --> R[元回答シート]
  R --> G[GAS: 受付・固定ID・審査待ち記録]
  G --> D[Discord運営チャンネル: 承認 / 却下]
  D --> W[Cloudflare Worker: 署名・権限検証]
  W --> G
  G --> M[非公開の審査管理シート]
  G -->|承認したスナップショットのみ| P[公開用シート]
  G -->|公開用シート反映成功後| A[GitHub Actions]
  P --> A
  A --> J[公開用JSON・サイトのビルド]
  J --> S[GitHub Pages]
```

### 役割

| 部品 | 担当 |
| --- | --- |
| GAS | 回答受付、審査状態、公開用シート更新、Discord通知、Actions起動・再試行 |
| Discordアプリ | Bot名・アイコン、運営チャンネルへの投稿、承認・却下ボタン |
| Cloudflare Worker | Discord Interactions受付、署名確認、運営権限確認、GASへの認証付き転送 |
| GitHub Actions | 公開用シートを再取得し、既存手順でテスト・ビルド・公開 |

GASはフォーム送信時のインストール型トリガーを使用する。DiscordのHTTP署名検証はWorkerで行い、GASに直接Discordの受付を任せない。

## 4. データと公開の境界

### 4.1 元回答シート

- フォームの回答先は維持する。元の入力内容を受け取るための場所。
- 現在はリンクを知っている人が閲覧できる運用。審査制を導入しても元回答の閲覧制限が強化されるわけではない。
- 審査ログや却下理由は元回答シートへ書かない。
- 行番号や活動名を登録の識別子にしない。並べ替え・同名登録に対応するため固定UUIDを用いる。

### 4.2 非公開の審査管理シート

元回答とは別のスプレッドシートとし、運営担当者とGAS実行者だけが閲覧できるようにする。

| 項目 | 内容 |
| --- | --- |
| registrationId | 登録単位の固定UUID |
| responseId | Googleフォームの回答ID |
| revision | 回答内容の版。変更時に増加 |
| contentHash | 公開対象項目の正規化済み内容から算出したハッシュ |
| snapshot | 審査対象の内容。公開用項目だけを保持 |
| reviewStatus | pending / approved / rejected |
| discordChannelId / discordMessageId | 通知先と通知メッセージ |
| reviewedBy / reviewedAt | 操作したDiscordユーザーID・UTC日時 |
| lastInteractionId | 二重処理の判定に使うDiscord操作ID |
| publishStatus | not_needed / queued / dispatched / failed |
| lastError / retryCount | 再試行に必要な情報。秘密情報は含めない |

受付はフォーム側の送信イベントを使い、回答IDを取得する。UUID・版・通知の対応は管理シートへ保存する。

### 4.3 公開用シート

- 元回答とは別の公開専用スプレッドシートを用意し、CSV取得可能にする。
- 公開可能な列のみを承認時にコピーする。メール収集列・回答時刻・却下理由・DiscordユーザーID・秘密情報は入れない。
- 現行パーサーが使う見出しを維持する。登録UUIDを保持する場合は公開可能な管理IDとして扱う。
- 常に「最後に承認した内容」のコピーを保持する。回答元への動的参照式や、元回答全体への自動同期は使わない。
- 本番ビルドの取得先をこの公開用シートに変更する。元回答シートを直接読む経路は残さない。

**重要：承認フラグだけではなく承認時の内容を固定する。** 元回答が編集された際に、未審査の変更が次のビルドで公開されることを防ぐ。

## 5. 通知と操作

### 新しい回答

1. responseIdから登録を特定する。新規ならUUIDを発行する。
2. 公開項目の内容を正規化し、ハッシュとスナップショットを保存する。
3. 同じ回答ID・同じハッシュなら重複受付として通知しない。
4. pendingとして、Discordへ通知する。

通知内容：活動名、活動形態、メイン／サブジャンル、登録ID、版、確認用の回答概要。「承認」「却下」のボタンを付ける。

- 長文はDiscordの上限内に省略する。応募者の文字列からメンションを発生させない（allowed_mentionsを制限）。
- ボタンのcustom_idには操作種別・UUID・版を含め、秘密情報は入れない。

### 承認

1. WorkerでDiscord署名と操作権限を検証する。
2. 3秒以内に受付応答し、後続処理を非同期で行う。
3. GASで登録ID・版・状態と署名済みの役割を確認する。ロック下でモデレーターの一人一票を保存し、必要人数（既定3人）または管理人1人で最新pendingを確定する。未確定の票では公開を更新しない。
4. 公開用シートへその版のスナップショットを反映する。
5. 確定時に永続化した公開キューに従い、公開コピーの反映後にActionsを起動する。
6. Discordの通知を「承認済み・公開処理受付」に更新し、ボタンを無効にする。

「承認済み」と「サイトへの反映完了」は別。Actionsの受付成功だけで公開完了とは表示しない。初期版の完了確認はActions実行結果と公開サイトで行う。

### 却下

- 必要人数の却下票（既定3人）または管理人1人でpendingの版をrejectedにし、通知を更新、ボタンを無効にする。
- 新規登録は公開用シートに追加しない。公開内容に変化がないため通常はActionsを起動しない。
- 更新申請の却下では、前回承認済みの内容を維持する。公開済み情報を取り下げたい場合は別操作として扱う。
- 初期版は元回答行の物理削除を行わない。将来追加する場合は、固定IDによる特定、退避保存、二段階確認を必須にする。シートの行削除とフォーム回答の削除は別操作である。

### 再送・編集・競合

- 回答編集時のイベント動作だけに依存せず、GASの定期照合でもresponseIdとハッシュを確認する。変更検出時は新しいpending版を作り、再審査する。
- 過去版のボタンは無効扱いとし、最新版を案内する。
- 同時承認・却下はGASのロックと状態遷移で直列化する。先に確定した操作だけ有効にする。
- 通知や公開用シート更新の失敗時は再試行可能な状態を残す。確定前に通知だけを承認済みにしない。
- Workerの非同期処理には実行時間上限がある。時間切れでもGAS側の記録を基準に復旧できるようにし、無制限のバックグラウンド処理を前提にしない。

## 6. 権限と接続

- 指定のDiscordサーバー・チャンネル・許可ロールIDのみ操作可能。権限はWorker側で毎回確認し、画面のボタン表示だけに頼らない。
- Discord署名は生のリクエスト本文と署名ヘッダーで検証する。不正署名は401、PINGには所定の応答を返す。
- Worker→GASは本文内のタイムスタンプ・nonce・HMAC署名で認証する。GASで有効時間とnonce再利用を確認する。URLへ秘密値を含めない。
- GAS Webアプリは実行者のシート権限を使う。匿名到達可能なURLであっても、有効な署名なしでは読み書き・Actions起動を行わない。
- GitHubトークンはGASのScript Propertiesへ保管する。対象リポジトリに限定したActions書込権限でworkflow_dispatchを使う。
- Botトークン、Webhook URL、GAS共有鍵、GitHubトークンを公開リポジトリやブラウザへ渡さない。ログにも出さない。

## 7. GitHub Actions

- 既存のfeature/spaへのpush条件は維持し、workflow_dispatchを追加する。
- デフォルトブランチにもdispatch可能なワークフローを配置する。GitHub上の既定ブランチを確認し、起動refは許可した公開元ブランチに固定する。
- 実行前のテストとnpm run buildは維持する。
- デプロイは同じconcurrencyグループで直列化し、公開途中の強制中断は避ける。
- Actions起動に失敗した場合はシートの承認を取り消さず、queued / failedを再送する。既に承認した行を重複追加しない。
- GitHub APIの起動受付とサイト公開は非同期。公開まで数分程度かかる可能性があるため、即時公開の保証はしない。

## 8. 費用・保留事項

- 提案する受付先はCloudflare Workers。Free枠とGAS・GitHub側の上限内での運用を目指す。無制限・将来も無料とは保証しない。
- Cloudflare公式で確認したFree枠は1日100,000リクエスト。GAS実行時間・外部HTTP呼出し等も上限確認が必要。
- 未確定：Discordサーバー／チャンネル／許可ロール、公開用シートID、既存登録の移行判断、回答更新の照合間隔、公開取り下げ機能。
- 元回答の自動物理削除、却下理由入力、Discordへの公開完了通知、GitHub App認証は次段階。管理人専用の掲載削除コマンドは実装済み。

## 9. 受入条件

| ケース | 期待結果 |
| --- | --- |
| 新規回答 | pendingとして1回通知され、公開用シートには未掲載 |
| 権限ありの承認 | 正しいUUID・版だけ公開用シートへ反映しActions受付 |
| 未承認のまま通常push | 未承認情報がJSONへ混入しない |
| 却下 | 公開されず、履歴が残る |
| 権限なし・別チャンネル・不正署名 | データ変更・Actions起動なし |
| 同じ操作の再送・同時操作 | 二重追加・二重確定なし |
| 承認済み回答を編集 | 公開済みコピーは変わらず、変更内容は再審査 |
| 古い版のボタン | 最新版を誤って確定しない |
| 通知・GAS・Actionsの通信失敗 | 状態を保持し再試行可能。公開完了とは表示しない |
| ビルド失敗 | 現行公開サイトを維持し、Actionsで失敗が確認できる |

## 10. 参照

- [Google：インストール型トリガー](https://developers.google.com/apps-script/guides/triggers/installable)
- [Google：Webアプリ](https://developers.google.com/apps-script/guides/web)
- [Google：GASの上限](https://developers.google.com/apps-script/guides/services/quotas)
- [Discord：Interactionsの受付・応答](https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx)
- [GitHub：ワークフロー起動API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
- [GitHub：手動実行と既定ブランチ](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [Cloudflare：Workersの上限](https://developers.cloudflare.com/workers/platform/limits/)

## 11. 実装時の補足

- 配置先はautomation/discord/gasとautomation/discord/worker。設定と起動入口の実名は導入手順を参照する。
- GASはRegistrationsのrecordJsonに最新版と最後の承認コピーを保存し、Auditへ審査・版の履歴を残す。公開キューの状態はnot_needed／queued／dispatched／failed。
- Workerから決定を保存した後、署名付きflushリクエストで公開用シート更新・Actions起動・通知更新を促す。失敗時は5分ごとのrunMaintenanceが再試行する。
- 新規回答は送信時に取り込み、既存回答・回答編集は30件ずつ巡回照合する。承認直前にも元回答を再取得し、変更があれば旧版の決定を拒否する。
- 公開項目のJSONは12,000文字以内。過大な回答はスナップショットを保存せずエラーにする。
- 公開側の見出しは_registrationId／_approvedRevision／_reviewStatus＋公開項目。承認モードではapprovedのみ取得し、UUIDの重複・不正な版・管理列欠落はエラーにする。
- sourceConfigはVRC_BAND_DB_APPROVED_SHEET_URLを設定した時点で承認モードに切り替わる。VRC_BAND_DB_REQUIRE_APPROVED=trueではURL未設定もエラー。設定なしの通常ローカルビルドは現状維持のため旧取込先を使用する。導入時には両Variablesを設定し、旧取込経路を実運用で使わない。
- workflow_dispatchは承認済みURL必須。公開ブランチはfeature/spaに限定し、その他のrefは実行しない。既定ブランチへの定義配置とRepository Variables設定は人の作業として残る。
- 再送で通知やActionsの受付成功を確認できない場合は重複リクエストが発生し得る。状態更新と公開行はIDで冪等にし、Actionsは直列化して同じ承認コピーを取り込む。
- 現在の公開用JSONを自動で承認扱いにする移行・物理削除は実装していない。

- 初期化処理はステップ別の診断ログを実装。diagnoseIntegrationは読取だけでフォームと両シートを独立確認する。エラー文にはToken・共有鍵を出さず、シートへの書込・Discord通知・Actions起動はしない。

## Botコードの自動更新

- サイト用と分離したdeploy-discord.ymlを追加。feature/spaへの変更時にテスト後、GAS／Workerの変更した部品を配置する。DISCORD_DEPLOY_ENABLED=trueで有効化する。
- GASは既存デプロイIDを更新してURLを保持し、Script Propertiesとトリガーは変更しない。Workerの既存共有鍵も再登録しない。
- 初回認証とGitHub Secrets／Variablesの設定は [自動更新・認証設定](VRC-Band-DB-discord-ci.md) を参照。実配置はまだ行っていない。

### 通知の診断ログ（2026-11-19）
runMaintenanceはフォーム回答数、処理後の管理件数・通知待ち件数・通知失敗件数を記録する。Discord送信のHTTP失敗はEXTERNAL_HTTP_403等のステータスのみ記録し、回答本文・API応答本文・Tokenは記録しない。実行完了でも通知失敗はあり得るため、このログとRegistrationsのrecordJson内lastErrorを確認する。取込失敗はRESPONSE_IMPORT_FAILEDとしてログへ記録する。通知HTTP失敗と秘密値非出力を含むGASテスト9件成功。

DiscordのHTTP失敗時は、JSON応答の数値codeのみをDISCORD_CODEとして記録する。非JSON応答はNON_JSON_RESPONSE、数値codeなしはNO_DISCORD_CODEとする。応答本文やmessageは出力しない。HTTP403の権限問題とそれ以外の応答を切り分けるために使用。GASテスト10件成功。

### Discord 40333への対応（2026-11-19）
公式の40333はCloudflareによるリクエスト拒否を表す。チャンネル権限不足とは断定しない。GASのDiscord API送信に公式形式のUser-Agent: DiscordBot (https://github.com/LyceeSerie/SerieIndustry, 1.0.0)を追加した。GASテスト11件で確認済み。本番の解消は更新後のrunMaintenanceで確認する。引き続き拒否される場合はDiscord側へ調査を依頼する。参照：https://github.com/discord/discord-api-docs/blob/main/developers/reference.mdx および developers/topics/opcodes-and-status-codes.mdx。

## ローカル通知への切替（2026-11-19）

通知の送信元をWindows PCに切り替える実装を追加。手順・認証・キューの引き当てと再試行の仕様は[VRC-Band-DB-discord-local-notifier.md](VRC-Band-DB-discord-local-notifier.md)を参照する。
NOTIFICATION_TRANSPORT=localの場合、GASのnotifyはDiscordへアクセスせず、審査用シートに通知待ちを保持する。PCは専用LOCAL_NOTIFY_SECRETによるHMAC認証でlocal_claim/local_ackを呼び出し、投稿と既存メッセージ更新を行う。審査操作は既存Workerの別鍵でのみ許可する。
PC停止中も回答・審査・公開は既存のGAS/Worker/GitHubで維持し、Discord表示の更新を保留する。デフォルトは既存互換のgasで、GAS配置後に利用者が専用鍵を登録してlocalへ切り替える。

## 審査通知の画像確認（2026-11-19）

- ロゴ・アイコン・アー写ごとに「画像を開く」リンクを表示し、各画像のプレビュー用Embedを追加する。未登録は未登録と表示する。
- 対象はHTTPS URL。複数URLが入っている項目では最初の有効なURLを使用する。Driveの/file/d/IDまたは?id=ID形式は既存サイトと同じthumbnail URLでプレビューを試み、確認リンクは元のURLを維持する。
- Drive等で認証が必要な画像はDiscordが取得できず、プレビューが出ない場合がある。確認リンクから閲覧権限のあるGoogleアカウントで開く。Driveの共有権限の変更・一般公開化・ファイルのDiscordへの再アップロードはしない。
- 各画像URLの長さ・Markdown区切り文字を検査し、通知全体のEmbed文字数上限を超えないようにする。画像のためにGAS/PCが任意URLの内容を取得する処理は追加しない。
- 通知フォーマット版を2へ変更。送信済みレコードも版が古ければ既存メッセージをPATCHで更新し、回答の版・審査状態・メッセージIDは維持する。PC側の引き当てと送信済み記録を通して一度更新する。処理中の旧ジョブは完了後に新版を反映する。
- プレビューが必ず出る保証はない。認証付きDrive画像そのものをDiscord内へ添付する機能は別途権限・取得方式の検討が必要。

## 審査通知の登録リンク確認（2026-11-19）

通知フォーマット版を3へ更新。X/Twitter、YouTube、VRC Group、その他SNSリンク1〜5の入力済み項目を審査通知から確認できるようにする。

- 有効なHTTP/HTTPS URLはDiscordのリンクボタンで開く。最大8リンクを5個/行、最大2行に分け、承認・却下の行とは分ける。
- X/TwitterとYouTubeの@IDは公開サイトと同じベースURLへ変換。その他は「表示名：URL」「表示名:URL」とURL単体に対応する。
- URL形式、認証情報入りURL、空白や不正な文字、512文字超のURLを検査し、不正なものにはボタンを付けず警告する。メール形式はWebリンクと区別して表示し、メール送信ボタンは付けない。
- X/Twitter欄はx.com/twitter.com、YouTube欄はyoutube.com/youtu.be、VRC Group欄はvrchat.com/vrc.groupを想定し、別ドメインには警告。ホスト名の部分一致では判定せず、x.com.attacker.example等は不一致とする。
- vrchat.comの場合は/home/group/grp_...形式か確認する。チェックは構文上の判定であり、そのグループが実在する保証ではない。診断には入力先のホスト名も表示する。
- 形式が有効で入力欄とドメインだけが異なるURLは、警告付きで開けるようにする。HTTPはHTTPと表示する。
- 本人のアカウント・実在性・公開可否は運営がリンク先で確認する。自動アクセスによるHTTP到達性判定・ログイン・本人確認は行わない。
- 送信済み通知は既存のフォーマット版更新処理で同じメッセージを更新。承認/却下の操作・審査状態・画像確認を維持する。
- 全Embed共通の文字数制限を超えそうなときは通知上のコメント等だけを短縮する。画像URLやリンクURLを途中で切断せず、保存済みの回答も変更しない。

テスト3件追加、npm test 76件成功。公式仕様参照：https://docs.discord.com/developers/components/reference#button
## 管理人向け名前検索（2026-11-19）

band-infoはidまたはnameで検索可能。nameは活動名の部分一致（NFKC・大小文字非区別）とし、同名の複数登録を別々のIDと状態で表示する。1ページ5件・page指定で全件へアクセスできる。削除済みも検索対象。削除時は必ずband-deleteへ検索結果の登録IDを指定し、名前での一括削除は行わない。管理人ロール・専用チャンネル制限は維持する。GAS/Worker更新とコマンド再登録が必要。詳細は[管理人コマンド手順](VRC-Band-DB-discord-moderation.md)を参照。
## 掲載復元・重複操作（2026-11-19）

管理人用band-restoreを追加。削除時の承認済みバックアップ（従来データは承認履歴）を使い、承認済み内容のみ再掲載する。未承認内容は承認待ちへ復元し、票をリセットする。確認は本人・版・操作種別に署名して5分間有効。承認/却下・削除・復元の二重押下は処理済み応答にし、版・票数・公開キューを重複更新しない。GASロック競合はWorkerが1回再試行し、継続時は処理中と案内する。詳細は[ロール別審査・管理コマンド](VRC-Band-DB-discord-moderation.md)を参照。
## 管理人による応急編集（2026-11-19）

band-editで登録ID→公開用25項目から選択→現在値確認→Modal入力・保存が可能。原本のフォーム回答は変更しない。補正対象のフォーム値が変わるまで審査レコードの上書きを維持し、同じ項目が利用者により修正されたら解除する。掲載中の登録は選択した項目だけを公開へ反映し、ほかの未承認内容を混ぜない。未承認登録は承認待ちにする。編集で版を進め、票をリセットし、AdminEditsへ記録する。権限・本人・項目・版・期限を検証し、再送信を重複適用しない。手順と詳細は[応急編集仕様](VRC-Band-DB-discord-edit.md)を参照。
## 審査拒否の診断（2026-11-20）

GASは古い版・未確定の通知・別メッセージ・削除状態・原回答読取失敗等を固定コードで返す。Workerは生のエラー本文を使わず、安全な原因説明と対応手順を表示する。審査拒否には要求版/現在版・通知更新待ち・メッセージIDを付け、Workerで型を検査して案内へ整形する。GASのログにも固定コードと数値の版を記録する。詳細は[エラーと復旧手順](VRC-Band-DB-discord-errors.md)。
