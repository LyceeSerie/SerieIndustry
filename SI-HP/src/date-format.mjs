// Calendar semantics stay in Japan time even when the UI locale changes later.
export const displayLocale = 'ja-JP';
export const eventTimeZone = 'Asia/Tokyo';
const profiles = {
    time: { hour: '2-digit', minute: '2-digit' },
    date: { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' },
    month: { year: 'numeric', month: 'long' },
    event: { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    eventDetail: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' },
};
const formatters = new Map();
export function formatDateTime(value, profile = 'event') {
    if (!Object.hasOwn(profiles, profile))
        throw Error('Unknown date profile: ' + profile);
    if (!formatters.has(profile))
        formatters.set(profile, new Intl.DateTimeFormat(displayLocale, { ...profiles[profile], timeZone: eventTimeZone }));
    return formatters.get(profile).format(new Date(value));
}
export const formatCalendarDate = value => formatDateTime(value + 'T00:00:00+09:00', 'date');
