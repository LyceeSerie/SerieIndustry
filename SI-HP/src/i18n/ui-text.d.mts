import ja from './locales/ja.json'
type Paths<T> = { [K in keyof T & string]: T[K] extends string ? K : T[K] extends object ? `${K}.${Paths<T[K]>}` : never }[keyof T & string]
export type UiMessageKey = Paths<typeof ja>
export const uiMessages: typeof ja
export function t(key: UiMessageKey, values?: Record<string, string | number>): string
