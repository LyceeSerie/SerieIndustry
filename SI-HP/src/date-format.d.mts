export const displayLocale: string
export const eventTimeZone: string
export type DateProfile = 'time' | 'date' | 'month' | 'event' | 'eventDetail'
export function formatDateTime(value: Date | string | number, profile?: DateProfile): string

export function formatCalendarDate(value: string): string
