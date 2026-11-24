import C from '../../../automation/discord/shared/band-editor.mjs'
import { t } from '../i18n/ui-text.mjs'
import appSettings from '../config/app-settings.json'

// Form settings are a copy: never mutate the shared editor singleton.
export const editor: typeof C = {
  ...C,
  defaults: {
    ...C.defaults,
    '活動形態１': [...appSettings.vrcBandDb.activityTypes],
    '活動形態３': [...appSettings.vrcBandDb.activityStatuses],
    '属性': [...appSettings.vrcBandDb.attributes],
    '活動プラットフォーム': [...appSettings.vrcBandDb.activityPlatforms],
  },
}

export const readingKey = '活動名（よみがな）※ひらがなで入力'
export const namedKeys = C.fields.filter(key => /^その他SNSリンク\d+$/.test(key))
export const imageKeys = ['ロゴ', 'アイコン', 'アー写']
export const labels: Record<string, string> = {
  '活動形態１': t('labels.activityType'),
  '活動形態２': t('labels.performanceType'),
  '活動形態３': t('labels.status'),
  [readingKey]: '活動名（よみがな）',
  'ロゴ配置位置': 'ロゴ配置位置',
  '募集パート': '募集パート（未選択でなし）',
  'YouTube動画URL': 'Youtube 動画 URL',
}

// Use field names, so additions to the export schema cannot move unrelated inputs.
export const sections = [
  { id: 'activity', title: t('registration.sections.activity'), fields: [
    '活動名', readingKey, '活動名（英語）',
    '活動形態１', '活動形態２', '活動形態３', '活動プラットフォーム',
    'メインジャンル', 'サブジャンル', '属性',
  ] },
  { id: 'images', title: t('registration.sections.images'), fields: imageKeys },
  { id: 'members', title: t('registration.sections.members'), fields: ['バンドメンバー', '募集パート'] },
  { id: 'video', title: t('registration.sections.video'), fields: ['YouTube動画URL'] },
  { id: 'links', title: t('registration.sections.links'), fields: ['SNSリンク（X/Twitter）', 'SNSリンク（Youtube）', 'VRC Groupリンク', ...namedKeys] },
  { id: 'introduction', title: t('registration.sections.introduction'), fields: ['コメント', '活動時間帯'] },
]
