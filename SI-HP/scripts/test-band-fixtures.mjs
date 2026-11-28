export const fixtureHeaders = ['タイムスタンプ', 'メールアドレス', '活動名', '活動名（よみがな）※ひらがなで入力', '活動名（英語）', '活動形態１', '活動形態２', '活動プラットフォーム', 'メインジャンル', 'サブジャンル', 'ロゴ（1024x512px程度）', 'アイコン（256x256px程度）', 'アー写（3840x2160px上限目安）', 'SNSリンク（X/Twitter）', 'SNSリンク（Youtube）', 'VRC Groupリンク', 'その他SNSリンク1', 'その他SNSリンク2', 'その他SNSリンク3', 'その他SNSリンク4', 'その他SNSリンク5', 'コメント', '活動時間帯', 'ロゴ配置位置（デフォルトは重ねない）', '活動形態３', 'テストケース', '募集パート（未選択でなし）', '属性\n※その他に複数入力する場合はカンマ/句読点/空白/スラッシュのどれかで区切ってください', 'バンドメンバー', '_registrationSource', '_updatedAt', 'YouTube動画URL']
const asset = 'http://127.0.0.1:5174/test-assets/'
const logo = asset + 'logo.png', icon = asset + 'icon.png', photo = asset + 'photo.png'
const base = { '活動形態１': 'バンド', '活動形態２': 'オリジナル', '活動プラットフォーム': 'VRChat', 'メインジャンル': 'ロック', 'サブジャンル': 'ポストロック', 'ロゴ（1024x512px程度）': logo, 'アイコン（256x256px程度）': icon, 'アー写（3840x2160px上限目安）': photo, '活動形態３': '活動中' }
const samples = [
  ['TC01 標準・全リンク', { 'YouTube動画URL': 'https://www.youtube.com/watch?v=M7lc1UVf-VE', 'バンドメンバー': 'ボーカル / ギター | テスト太郎 | @example_vocal\nベース｜テスト花子｜https://x.com/example_bass', '活動名（よみがな）※ひらがなで入力': 'てすとばんど', '活動名（英語）': 'Test Alpha', 'SNSリンク（X/Twitter）': '@test_band', 'SNSリンク（Youtube）': '@test_channel', 'VRC Groupリンク': 'https://vrc.group/TEST.0000', 'その他SNSリンク1': 'HP:https://example.com/a:b', 'その他SNSリンク2': 'mail:contact@example.invalid', 'その他SNSリンク3': 'Bluesky:https://bsky.app/profile/example.com', 'その他SNSリンク4': 'https://example.com/', 'その他SNSリンク5': 'サイト：https://example.org/', 'コメント': '1行目\n2行目：改行を維持', '活動時間帯': '土曜 22:00〜' }],
  ['TC02 左上レイヤー', { 'バンドメンバー': 'ドラム | アイコンなし', 'ロゴ配置位置（デフォルトは重ねない）': 'アー写に重ねる 左上' }],
  ['TC03 運営登録・全項目', { 'YouTube動画URL': 'https://youtu.be/M7lc1UVf-VE', '_registrationSource': 'admin', '活動名（よみがな）※ひらがなで入力': 'うんえいとうろく ぜんこうもく', '活動名（英語）': 'Admin Registered Band', 'コメント': 'DiscordのJSON一括追加を想定した運営登録データです。バンド名の上の目印と、タグ・募集メンバー・リンクの表示を確認してください。', '活動時間帯': '土曜 22:00〜', 'SNSリンク（X/Twitter）': 'https://x.com/zerry_furai', 'バンドメンバー': 'ギター | 芹井 | zerry_furai', 'ロゴ配置位置（デフォルトは重ねない）': 'アー写に重ねる 左下' }],
  ['TC04 右上レイヤー', { 'ロゴ配置位置（デフォルトは重ねない）': 'アー写に重ねる 右上' }],
  ['TC05 右下レイヤー', { 'ロゴ配置位置（デフォルトは重ねない）': 'アー写に重ねる 右下' }],
  ['TC06 重ねない', { 'ロゴ配置位置（デフォルトは重ねない）': 'アー写に重ねない' }],
  ['TC07 解散', { '活動形態３': '解散', '活動プラットフォーム': 'Cluster' }],
  ['TC08 休止', { '活動形態３': '休止中', '活動形態１': '弾き語り', '活動形態２': 'カバー', 'メインジャンル': 'ポップ' }],
  ['TC09 未設定', { '活動形態３': '', 'ロゴ配置位置（デフォルトは重ねない）': '' }],
  ['TC10 複数分類', { '活動プラットフォーム': 'VRChat, Cluster', 'メインジャンル': 'ポップ, ロック, ジャズ／フュージョン, ヒップホップ／ラップ, ロック', 'サブジャンル': 'シティポップ、ジャズ,フォーク ロック/メタル／ブルース。パンク\nジャズ', '活動形態１': '楽器ソロ', '活動形態２': 'オリジナル, カバー' }],
  ['TC11 写真なし', { 'アー写（3840x2160px上限目安）': '', 'ロゴ配置位置（デフォルトは重ねない）': 'アー写に重ねる 右下' }],
  ['TC12 ロゴなし', { 'ロゴ（1024x512px程度）': '' }],
  ['TC13 アイコンなし', { 'アイコン（256x256px程度）': '' }],
  ['TC14 画像全なし', { 'ロゴ（1024x512px程度）': '', 'アイコン（256x256px程度）': '', 'アー写（3840x2160px上限目安）': '' }],
  ['TC15 画像読込失敗', { 'ロゴ（1024x512px程度）': asset + 'missing-logo.png', 'アイコン（256x256px程度）': asset + 'missing-icon.png', 'アー写（3840x2160px上限目安）': asset + 'missing-photo.png' }],
  ['TC16 不正リンク', { 'YouTube動画URL': 'https://example.com/watch?v=M7lc1UVf-VE', 'SNSリンク（X/Twitter）': 'javascript:alert(1)', 'SNSリンク（Youtube）': 'a', 'VRC Groupリンク': 'data:text/html,unsafe', 'その他SNSリンク1': '危険:javascript:alert(1)', 'その他SNSリンク2': 'mail:invalid' }],
  ['TC17 文字列の安全表示', { '活動名（英語）': 'ＦｕｌｌＷｉｄｔｈ', 'コメント': '<script>alert("test")</script>\n<b>HTMLは文字として表示</b>', 'その他SNSリンク1': '名前:<script>test</script>' }],
  ['TC18 長文・未知値', { '活動形態１': '歌＋オケ', 'メインジャンル': 'その他', '活動形態３': '確認中', 'ロゴ配置位置（デフォルトは重ねない）': '未知の配置', 'コメント': '長文テキストの折り返しを確認します。'.repeat(30) + '\nhttps://example.com/' + 'a'.repeat(200) }],
  ['TC19 URL入力・Drive形式', { 'SNSリンク（X/Twitter）': 'https://x.com/test_band', 'SNSリンク（Youtube）': 'https://www.youtube.com/@test_channel', 'ロゴ（1024x512px程度）': 'https://drive.google.com/file/d/test_logo_id/view', 'アイコン（256x256px程度）': 'https://drive.google.com/open?id=test_icon_id' }],
  ['TC20 運営登録・最小項目', { 'コメント': '権利者向け連絡ボタン確認：運営情報の「運営掲載について」が表示されることを確認します。', '_registrationSource': 'admin', '活動形態１': '', '活動形態２': '', '活動プラットフォーム': '', 'メインジャンル': '', 'サブジャンル': '', '活動形態３': '', 'ロゴ（1024x512px程度）': '', 'アイコン（256x256px程度）': '', 'アー写（3840x2160px上限目安）': '' }],
  ['', { '活動名': '', 'コメント': 'TC21 活動名なしの行は掲載しない' }],
]
const extraCases = [
  ['ベース', '男性ボーカル'],
  ['リードギター, ベース', '女性ボーカル'],
  ['ドラム', 'インスト'],
  ['その他: ピアノ/サックス', '男性ボーカル, その他：コーラス/混声'],
  ['ベース, その他：ベース。シンセ　フルート', '女性ボーカル, その他: 女性ボーカル/ツインボーカル'],
  ['', 'インスト, VTuber, VSinger'],
  ['ボーカル（男性）, ボーカル（女性）', '男性ボーカル, 女性ボーカル'],
  ['リズムギター', 'その他：打ち込み併用、生演奏'],
  ['その他：', 'その他:'],
  ['シンセ', 'その他：ツインボーカル/コーラス'],
  ['その他：パーカッション', ''],
]
// Public demonstration videos are unrelated to these fictional bands.
const musicSamples = {
  1: 'https://youtu.be/aqz-KE-bpKQ',
  3: 'https://youtu.be/jNQXAC9IVRw',
  4: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  5: 'https://youtu.be/00000000000',
  6: 'https://youtu.be/___________',
  7: 'https://example.com/not-a-youtube-video',
}
for (const [index,url] of Object.entries(musicSamples)) {
  samples[Number(index)][1]['YouTube動画URL'] = url
  samples[Number(index)][1]['コメント'] = '動画再生テスト用です。公開サンプル動画は架空のバンドとは関係ありません。再生不能・重複・無効URLのケースも含みます。'
}
export const fixtureRecords = samples.map(([name, overrides], index) => ({ ...base, '_updatedAt': index === 19 ? '' : '2026-11-21T03:00:00.000Z', 'タイムスタンプ': '2026/10/26 00:00:00', 'メールアドレス': `private-${index + 1}@example.invalid`, '活動名': name, 'テストケース': name || 'TC21 活動名なし', ...overrides, '募集パート（未選択でなし）': extraCases[index]?.[0] || '', [fixtureHeaders[27]]: extraCases[index]?.[1] || '' }))
export const fixtureValues = [fixtureHeaders, ...fixtureRecords.map(record => fixtureHeaders.map(header => record[header] || ''))]
