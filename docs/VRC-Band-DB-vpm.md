# VPM配布の手順

## 用意したもの

- パッケージ：`unity/VRCBandDB`、ID `com.serieindustry.vrcbanddb.calendar`、初期バージョン `0.1.0`。
- パッケージZIP作成：`python unity/build-vpm.py`。生成先は `unity/dist`（Git対象外）。ZIP直下にpackage.jsonを配置し、UnityのGUID/metaとフォントのOFLも含める。
- 配布用JSON：公開済みの旧バージョンを残し、ZIPのSHA-256を付けて生成する。同じバージョンの内容差し替えは拒否する。
- Actions：`Release VRC Band DB VPM package`。`calendar-v*`タグで実行し、ZIPをGitHub Releasesへ、配布用JSONを既存のdeployブランチへ配置する。
- 配布ページ：`https://serieindustry.com/vpm/`。
- ALCOM／VCC追加URL：`https://serieindustry.com/vpm/index.json`。

初回リリース前のJSONはpackagesが空。準備中の表示になり、未公開ZIPをインストール候補に出さない。

## 初回公開

1. この変更をコミットしてmainへマージし、通常のサイトデプロイを完了する。
2. main上のリリース対象コミットにタグを付けてpushする。

```powershell
git tag calendar-v0.1.0
git push origin calendar-v0.1.0
```

3. `Release VRC Band DB VPM package` の成功を確認する。mainに含まれないコミットや、package.jsonと異なるバージョンのタグは拒否する。
4. 配布ページの追加ボタン、またはALCOMのリポジトリ追加から上記JSON URLを登録する。
5. Worldsプロジェクトのパッケージ管理で追加し、Packages内の `Prefabs/VRCBandDB Calendar.prefab` をシーンに配置する。

追加Secretsは不要。既存GitHub Pagesのdeployブランチ設定とActionsのGITHUB_TOKENを使う。サイト側デプロイは既存のVPM JSONを引き継ぎ、リリース側はvpmディレクトリだけを更新する。両Actionsは共通のconcurrencyグループで競合を防止する。

## 更新

package.jsonのversionとurl（タグ名・ZIP名）を変更し、Unityで動作確認して生成アセットをリポジトリへ戻す。mainへ反映した後、同じ規則の新しいタグをpushする。旧ZIPは削除しない。同じバージョンを使い回さない。

```powershell
python -m unittest discover -s unity -p test_vpm.py
python unity/build-vpm.py --tag calendar-v0.1.0
```

## Packagesでの利用

通常は同梱Prefabを直接使う。カスタマイズ時はPrefabをAssetsへコピーする。Build Calendar Prefabメニューは、Packages導入時には `Assets/SerieIndustry/VRCBandDBGenerated` へ生成する。元パッケージにMaterialやPrefabを生成しない。UdonSharpのコンパイルキャッシュはSDK側で管理する。

まだ配布前のため、自動削除するlegacyFoldersは設定していない。開発用Assets版が入っているSI-SamplesへVPM版を同時導入するとGUIDが重複するため、導入テストは別プロジェクトで行う。既存Assets版はそのまま配置・更新している。

## 公開範囲とライセンス

この作業ではリリース・タグpush・サイトへの公開は行わない。オリジナルコードの公開ライセンスはまだ指定されていないため、package.jsonはUNLICENSEDとする（オープンソースの再配布許諾を追加しない）。配布条件を決める場合は公開前にLICENSEとmanifestを更新する。日本語フォントは独立したSIL OFL 1.1で、Fonts/OFL.txtを必ず同梱する。

VPM公式仕様：https://vcc.docs.vrchat.com/vpm/packages/ 、https://vcc.docs.vrchat.com/vpm/repos/

## 検証結果

Unity 2022.3.22f1 / Worlds SDK 3.10.4でasmdefとUdonSharp Assembly Definitionを追加した状態のC#・Udonコンパイル成功。Editor 17項目とClientSim 17項目成功。ZIP生成テストは、直下manifest・Prefab・meta、SHA-256、再現性、旧パッケージ保持、公開済み版の差し替え拒否、異なるタグの拒否を確認する。GitHub上のActions実行と、公開URLを使ったALCOM導入は初回公開後に確認する。

## Assets版とVPM版を二重導入した場合の復旧

Assets版がある状態でVPM版を導入すると、同じGUIDが競合してUnityがVPM版のmetaへ別GUIDを割り当てる場合がある。その後Assets版を削除しても自動的には元に戻らず、UdonプログラムのsourceCsScript参照がnullになってコンパイルできない。

基本手順は、シーンをバックアップした上でVPM版を一度削除し、開発用Assets版がUnityプロジェクト内にないことを確認し、ALCOMからVPM版を再インストールする。GUID競合状態で作った独自Prefab・シーンの参照は別途確認する。Library全体の削除は最初の対応として不要。

2026-11-24のSI-SamplesではログにAssets版との競合とGUIDの再割り当てを確認した。Assets版削除済みを確認し、VPM版metaをLibraryへバックアップ後、配布時のmetaへ戻してUnityを再読み込みした。今後sync-to-unity.ps1は、VPM版導入済みのプロジェクトへのAssets版コピーを拒否する。

復旧後はPackages配下の実際のVPM版でUdonコンパイル・Editor 17項目・ClientSim 17項目が成功した。Packages導入時の生成先もAssets/SerieIndustry/VRCBandDBGeneratedになり、開発版スクリプトの二重配置は行っていない。配布ZIP内のmetaは元々正しく、今回の直接原因は導入順によるプロジェクト内GUID競合だった。
