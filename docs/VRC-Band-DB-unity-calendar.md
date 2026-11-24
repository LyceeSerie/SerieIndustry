# VRChat用イベントカレンダー

開発・導入仕様は [アセットのREADME](../unity/VRCBandDB/README.md) にまとめる。

- 開発元：`unity/VRCBandDB`（このリポジトリ）
- 配置先：`C:/Users/Cubase/Documents/Unity_VRC/VCC/SI-Samples/Assets/SerieIndustry/VRCBandDB`
- 使用Prefab：`Prefabs/VRCBandDB Calendar.prefab`
- 公開イベントシートをVRChatのString Loadingで直接読み取り、終了前のVRChatイベントの日別一覧・詳細を表示する。
- サイトの登録／審査／認証／通知処理は変更しない。非公開シートや秘密値は使用しない。
- 参考パッケージの構成を確認して独自実装し、元Prefab・画像・マテリアルを複製しない。
- Unityで生成したPrefab・meta・Udonプログラムも開発元へ保持する。生成メニューは明示操作時のみ実行する。
- 検証：Editor 17項目、ClientSim 17項目成功。実VRChat／Quest実機は導入後に確認する。



