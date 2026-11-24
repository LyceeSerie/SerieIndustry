# VRC Band DB 管理フロー

## 入口と権限

管理画面とDiscordコマンドは入口だけを分け、GASの同じ登録・画像・イベント処理を使う。本人用画面は所有するバンドのみ、管理画面は管理人が全件を扱う。Discord管理コマンドは管理人ロールのみ、専用チャンネル本体のみで受け付ける。スレッドは対象外。返答・JSON添付は実行者限定。

管理人ロールの判定はロールIDで行う。DiscordのAdministrator権限や同名の別ロールだけでは許可しない。管理画面はOAuth認証とCSRF・セッション検証、コマンドはDiscord署名とサーバー・ロール・チャンネル検証を行った後に共通処理へ渡す。コマンドからWebセッションを偽造しない。

## 基本の流れ

1. 一覧・詳細で対象の登録IDと現在の版を確認する。
2. 新規追加・通常変更は保存して承認待ちへ進める。既存の承認済み内容は審査が完了するまで維持する。
3. Discordの通知でレビューする。管理人1人、または設定人数のモデレーター票で確定。投票数設定は従来どおり。
4. 承認済みの内容だけ公開シートへ反映し、サイト用Actionsを起動する。

例外は次のとおり。

- 応急編集 `/band-edit`：公開済み登録は選択した項目だけ即時反映。ほかの未承認内容は公開しない。未承認登録は承認待ちのまま。通常保存とは用途を分けて残す。
- イベント：既存の管理画面と同じく審査を挟まずイベント公開シートへ保存・削除する。サイトは直接取得するためJSON生成・サイト再ビルドは不要。
- 所有権移譲：内容の承認とは別に実施し、運営登録表示と本人の編集権限を更新する。

## 管理画面とコマンドの対応

| 操作 | Discord | 保存・公開の扱い |
|---|---|---|
| 一覧・所有者・審査状態を見る | `/band-list name:任意 status:任意 page:任意` | 閲覧のみ。削除済み以外を対象 |
| ID・名前で調べる | `/band-info id:登録ID` または `name:名前` | 既存コマンド。削除済みも照会可能 |
| 全項目を取得する | `/band-export id:登録ID` | 編集用band.jsonを実行者限定で返す |
| 新規1バンドを登録する | `/band-save file:JSON` | 運営所有・承認待ち。必須は活動名のみ |
| 通常変更を保存する | `/band-save file:JSON id:登録ID revision:現在の版` | 承認待ち。古い版なら拒否 |
| 複数バンドのJSON取込 | `/band-add file:JSON` | 既存コマンド。1〜20件・新規・承認待ち |
| PNGをアップロードする | `/band-upload file:PNG field:ロゴ等` | Webと同じDrive保存先・寸法・容量・日次上限。URLを返す |
| 登録済みユーザーを名前で探す | `/band-users name:任意 page:任意` | 表示名・ユーザー名・IDを表示 |
| ユーザーへ編集権を移譲する | `/band-owner id:登録ID user:ユーザー` | 所有者を置換。本人編集可能へ |
| 運営所有へ戻す | `/band-owner id:登録ID admin:true` | 本人の編集権を外し、運営登録表示へ |
| 掲載削除 | `/band-delete id:登録ID` | 既存の確認画面・非掲載化 |
| 削除の復元 | `/band-restore id:登録ID` | 既存の確認画面・元状態に従って復元 |
| 却下の取り消し | `/band-reopen id:登録ID` | 既存の確認画面・再審査通知 |
| 応急編集 | `/band-edit id:登録ID` | 項目選択→入力。通常保存と区別 |
| イベント一覧 | `/event-list name:任意 band:登録ID ended:true page:任意` | 既定では終了済みを除外。ended:trueで表示 |
| イベント詳細・編集用JSON | `/event-info id:イベントID` | event.jsonを実行者限定で返す |
| イベント新規・更新 | `/event-save file:JSON` | idなしで新規。更新はJSONにidとrevisionを含める |
| イベント削除 | `/event-delete id:イベントID revision:版 confirm:true` | 明示確認必須。公開対象から除外 |

`band-owner`のuserとadmin:trueはどちらか一方のみ。ユーザーの選択にはDiscordのユーザー選択UIを利用できる。`band-users`は本人登録画面へログイン済みのユーザーを探す補助機能。

## 通常のバンド編集

1. `/band-export`でJSONとID・版を取得する。
2. JSONを編集する。
3. `/band-save`へ添付してIDと版を指定する。
4. 新しい審査通知を確認する。

JSONは1バンドのオブジェクト、または1件だけの配列。64KiB以内。項目名・文字列形式は管理画面のJSON取込と同じ。更新では省略した項目は維持し、空文字にした項目をクリアする。活動名は空にできない。画像のURLも同じ公開項目へ設定する。所有者や内部ID、審査状態をJSONの任意項目から上書きすることはできない。

```json
[{"活動名":"サンプルバンド","コメント":"変更内容"}]
```

画像のトリミング・背景色・リサイズ・プレビューは管理画面側の補助機能。Discordでは加工済みPNGをアップロードし、返されたURLを通常保存または応急編集で設定する。アップロードしただけではバンドの画像項目は変更しない。

## イベント編集

`event-info`のJSONを編集してevent-saveへ添付する。開始終了はタイムゾーン付きISO日時。登録済み参加バンドは登録IDで検証し、正式な活動名へ置換する。未登録バンドはbandIdを空文字にして自由入力のnameを入れる。特定バンドに紐づかない運営イベントはownerBandIdを空にできる。

```json
{
  "ownerBandId":"",
  "title":"サンプルライブ",
  "subtitle":"イベントの説明",
  "place":"VRChat",
  "venueName":"会場名",
  "venueUrl":"https://vrchat.com/home",
  "startsAt":"2027-01-01T20:00:00+09:00",
  "endsAt":"2027-01-01T21:00:00+09:00",
  "participants":[{"bandId":"","name":"サンプルバンド"}]
}
```

## 共通化した実装

- `managementBandList_`：管理画面とコマンドの一覧データ。
- `managementSaveBand_`→`BandReview.userSubmit`：必須項目・版・承認待ち・所有者・監査・保存上限。
- `managementUpload_`：PNG検証、ハッシュ、Drive保存、共有設定、日次上限、再送時の重複防止。
- `managementEvents_`→`BandEvents.normalize`：イベント検証・保存・削除・公開シート同期。認証済みの共通サービスとして両入口から利用する。
- `BandReview.assignOwner`：所有権と運営登録表示・監査。`remove/restore/reopen/edit`も既存サービスを継続利用。
- `management.mjs`：コマンドの定義と入力検証。登録ツールとWorkerが同じ定義を使う。
- `gas-transport.mjs`：画像送信時のGASリダイレクト処理。WebとDiscordで共通化。
- 操作IDはDiscord interaction IDから安定生成し、通信再試行で登録・画像を重複作成しない。秘密値・Webセッション・コマンド入力値を公開シートや診断ログへ出さない。

## 反映手順

mainへマージすると既存のDeploy Discord integrationがGAS・Workerを更新し、続けて16個の管理コマンドをDiscordへ登録する。登録は名前ごとのupsertで、無関係なコマンドは削除しない。既存SecretsのDISCORD_NOTIFIER_BOT_TOKENを使い、新しい秘密値の入力は不要。

本変更のローカル検証はテスト用データ・偽の外部通信で行う。実データの登録・削除・移譲や本番のコマンド登録は実行しない。


## 検証

サイト・通知・審査・登録の277テスト、CI／workerdの10テスト、16コマンドのschema検証、GASとWorkerのdry-runが成功。新コマンドは署名済みDiscordリクエストから実際のGASコードまで通すテストで、承認待ち・版競合・重複送信・画像保存・イベント公開／削除・所有権・権限制限を確認した。本番のDiscord API・Drive・シートへの変更は未実施。
