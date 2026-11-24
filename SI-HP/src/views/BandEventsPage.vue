<script setup lang="ts">
import uiLinks from '../config/ui-links.json';
import { t } from '../i18n/ui-text.mjs';
import '../styles/vrc-band-db-theme.css';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { calendarEvents, eventPlaces, eventsOnDay, japanDate, previewAllowed, weekDays, monthDays, moveCalendar, layoutDayEvents, eventDetailsUrl, type LiveEvent } from '../band-events.mjs';
import { useLiveEvents } from '../use-live-events';
import { formatDateTime, formatCalendarDate } from '../date-format.mjs';
import { useEventClock } from '../use-event-clock';
import { handleCalendarWheel } from '../calendar-wheel.mjs';
import CalendarPeriodPicker from '../components/CalendarPeriodPicker.vue';
import EventVenue from '../components/EventVenue.vue';
import UiIcon from '../components/UiIcon.vue';
import settings from '../config/app-settings.json';
import brandIcon from '../assets/VBDLogo.png';
type View = 'day' | 'week' | 'month';
const route = useRoute();
const router = useRouter();
const localPreview = previewAllowed(import.meta.env.MODE === 'test');
const enabled = localPreview || settings.vrcBandDb.liveEvents.enabled;
const { events, loading, error, refresh } = useLiveEvents(() => ({
    enabled, localPreview, sheetCsvUrl: settings.vrcBandDb.liveEvents.sheetCsvUrl
}));
const day = ref(japanDate());
const view = ref<View>('day');
const showEnded = ref(false);
const places = ref([...eventPlaces]);
const dayScroll = ref<HTMLElement | null>(null);
const now = useEventClock();
const hourHeight = 72;
const dayHeight = hourHeight * 24;
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
const today = computed(() => japanDate(new Date(now.value)));
const remaining = computed(() => calendarEvents(events.value, {
    now: now.value, places: places.value, showEnded: showEnded.value
}));
const visible = computed(() => eventsOnDay(remaining.value, day.value));
const days = computed(() => view.value === 'week' ? weekDays(day.value) : monthDays(day.value));
const cells = computed(() => days.value.map(date => ({
    date, events: eventsOnDay(remaining.value, date)
})));
const displayedCount = computed(() => view.value === 'day' ? visible.value.length : new Set(cells.value.flatMap(cell => cell.events.map(event => event.id))).size);
const minEventHeight = 64;
const slots = computed(() => layoutDayEvents(visible.value, day.value, (minEventHeight + 2) / hourHeight * 60));
const dayGridHeight = computed(() => Math.max(dayHeight, ...slots.value.map(slot => slot.start / 60 * hourHeight + minEventHeight)));
const dayColumns = computed(() => Math.max(1, ...slots.value.map(slot => slot.columns)));
const dayMinWidth = computed(() => `calc(68px + ${dayColumns.value} * (var(--db-calendar-event-min-width) + 4px))`);
const minutes = computed(() => {
    const date = new Date(now.value + 9 * 3600000);
    return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
});
const currentTime = computed(() => formatDateTime(now.value, 'time'));
const heading = computed(() => view.value === 'month' ? formatDateTime(day.value + 'T00:00:00+09:00', 'month') : view.value === 'week' ? `${labelDate(days.value[0]!)} 〜 ${labelDate(days.value[6]!)}` : labelDate(day.value));
const previousLabel = computed(() => view.value === 'day' ? t('calendar.previousDay') : view.value === 'week' ? t('calendar.previousWeek') : t('calendar.previousMonth'));
const nextLabel = computed(() => view.value === 'day' ? t('calendar.nextDay') : view.value === 'week' ? t('calendar.nextWeek') : t('calendar.nextMonth'));
const linkQuery = computed(() => ({
    day: day.value, view: view.value, places: places.value.join(','), ended: showEnded.value ? '1' : '0'
}));
function validDay(value: unknown) {
    try {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && japanDate(value + 'T00:00:00+09:00') === value;
    }
    catch {
        return false;
    }
}
const labelDate = formatCalendarDate;
const time = (value: string) => formatDateTime(value, 'time');
function shortTime(event: LiveEvent, date: string) {
    return japanDate(event.startsAt) < date ? '継続 ' + time(event.startsAt) + '〜' : time(event.startsAt);
}
watch(() => route.query, query => {
    showEnded.value = query.ended === '1';
    day.value = validDay(query.day) ? String(query.day) : japanDate();
    view.value = ['day', 'week', 'month'].includes(String(query.view)) ? query.view as View : 'day';
    places.value = typeof query.places === 'string' ? eventPlaces.filter(place => query.places!.toString().split(',').includes(place)) : [...eventPlaces];
}, { immediate: true });
function navigate(changes: {
    day?: string;
    view?: View;
    places?: string[];
    ended?: boolean;
}) {
    const targetDay = changes.day || day.value;
    if (!validDay(targetDay))
        return;
    day.value = targetDay;
    view.value = changes.view || view.value;
    places.value = changes.places || places.value;
    showEnded.value = changes.ended ?? showEnded.value;
    return router.replace({ query: {
            ...route.query, ...linkQuery.value
        } });
}
function selectDay(value: string) {
    if (validDay(value))
        navigate({ day: value });
}
function move(amount: number) {
    navigate({ day: moveCalendar(day.value, view.value, amount) });
}
function toggle(place: string) {
    navigate({ places: places.value.includes(place) ? places.value.filter(item => item !== place) : [...places.value, place] });
}
function eventUrl(event: LiveEvent) {
    return eventDetailsUrl(event.id, linkQuery.value);
}
function slotStyle(slot: ReturnType<typeof layoutDayEvents>[number]) {
    return {
        top: `${slot.start / 60 * hourHeight}px`, height: `${Math.max(minEventHeight, (slot.end - slot.start) / 60 * hourHeight - 2)}px`, left: `calc(64px + ${slot.column} * min(calc(var(--db-calendar-event-max-width) + 4px), calc((100% - 68px) / ${slot.columns})))`, width: `min(var(--db-calendar-event-max-width), calc((100% - 68px) / ${slot.columns} - 4px))`
    };
}
async function scrollToTime() {
    await nextTick();
    if (view.value === 'day' && dayScroll.value) {
        const minute = day.value === today.value ? minutes.value : 9 * 60;
        dayScroll.value.scrollTop = Math.max(0, minute / 60 * hourHeight - dayScroll.value.clientHeight / 3);
    }
}
watch([day, view, loading], () => {
    if (!loading.value)
        scrollToTime();
});
onMounted(() => {
    document.title = 'VRC Band DB｜イベントカレンダー';
});
</script>
<template>
 <div class="band-db event-calendar"><header><a class="event-brand" :href="uiLinks.bandHome"><img :src="brandIcon" width="42" height="42" alt=""><span>VRC BAND <b>DB.</b></span></a><nav class="event-header-actions" aria-label="関連ページ"><a class="vpm-button db-header-button" :href="uiLinks.assets" target="_blank" rel="noopener noreferrer" :title="t('common.openNewTab', {label:t('navigation.vpmAssets')})"><UiIcon name="package"/><span>{{ t('navigation.vpm') }}</span></a><a class="back db-header-button" :href="uiLinks.bandHome">{{ t('navigation.backToBands') }}</a></nav></header>
 <main><p class="eyebrow">{{ t('labels.schedule') }}</p><div class="page-title"><h1>{{ t('navigation.events') }}</h1><button class="refresh-button" type="button" :disabled="loading||!enabled" @click="refresh">{{ t('common.refresh') }}</button></div>
 <p v-if="localPreview" class="preview-note">{{ t('calendar.preview') }}</p>
 <p v-if="!enabled">{{ t('calendar.unavailable') }}</p>
 <template v-else>
  <div class="calendar-toolbar"><div class="date-controls"><button type="button" :aria-label="previousLabel" @click="move(-1)">‹</button><CalendarPeriodPicker :model-value="day" :view="view" @update:model-value="selectDay"/><button type="button" :aria-label="nextLabel" @click="move(1)">›</button><button type="button" @click="selectDay(today)">{{ t('common.today') }}</button></div><div class="view-switch" role="group" :aria-label="t('calendar.viewMode')"><button v-for="item in ([['day',t('calendar.day')],['week',t('calendar.week')],['month',t('calendar.month')]] as const)" :key="item[0]" type="button" :aria-pressed="view===item[0]" @click="navigate({view:item[0]})">{{ item[1] }}</button></div></div>
  <fieldset><legend>{{ t('labels.format') }}</legend><div class="place-filters"><button type="button" :aria-pressed="places.length===eventPlaces.length" @click="navigate({places:[...eventPlaces]})">{{ t('common.all') }}</button><button v-for="place in eventPlaces" :key="place" type="button" :aria-pressed="places.includes(place)" @click="toggle(place)">{{ place }}</button></div></fieldset>
  <label class="ended-setting"><input type="checkbox" :checked="showEnded" @change="navigate({ended:($event.target as HTMLInputElement).checked})">{{ t('calendar.showEnded') }}</label>
  <div class="day-heading"><h2>{{ heading }}</h2><span>{{ t('calendar.count',{count:displayedCount}) }}</span></div>
  <p v-if="loading" role="status">{{ t('calendar.loading') }}</p><p v-else-if="error" class="error" role="alert">{{ error }}</p>
  <template v-else>
   <template v-if="view==='day'">
    <p v-if="!visible.length" class="empty">{{ t('calendar.empty') }}</p>
    <div ref="dayScroll" class="day-scroll" @wheel.capture="handleCalendarWheel" tabindex="0" role="region" :aria-label="heading+'の時間グリッド、上下・左右にスクロール'">
     <div class="day-grid" :style="{height:dayGridHeight+'px',minWidth:dayMinWidth}">
      <div v-for="hour in 25" :key="hour" class="hour-row" :style="{top:(hour-1)*hourHeight+'px'}"><span>{{ String(hour-1).padStart(2,'0') }}:00</span></div>
      <div v-for="hour in 24" :key="'half'+hour" class="half-row" :style="{top:((hour-1)*hourHeight+hourHeight/2)+'px'}"></div>
      <div v-for="slot in slots" :key="slot.event.id" class="time-event" :class="{ended:new Date(slot.event.endsAt).getTime()<=now}" :style="slotStyle(slot)" :title="slot.event.title+'｜'+time(slot.event.startsAt)+'〜'+time(slot.event.endsAt)+'｜'+slot.event.place" :aria-label="slot.event.title+' '+time(slot.event.startsAt)+'〜'+time(slot.event.endsAt)+'の詳細を開く'"><a class="time-event-main" :href="eventUrl(slot.event)"><time>{{ time(slot.event.startsAt) }}〜{{ time(slot.event.endsAt) }}</time><strong>{{ slot.event.title }}</strong><small>{{ slot.event.place }}{{ new Date(slot.event.endsAt).getTime()<=now?'・終了':'' }}</small></a><EventVenue :name="slot.event.venueName" :url="slot.event.venueUrl"/></div>
      <div v-if="day===today" class="now-line" :style="{top:minutes/60*hourHeight+'px'}" :aria-label="'現在時刻 '+currentTime"><span>{{ currentTime }}</span></div>
     </div>
    </div>
   </template>
   <div v-else class="calendar-scroll" @wheel.capture="handleCalendarWheel" tabindex="0" role="region" :aria-label="view==='week'?'週カレンダー、狭い画面では左右にスクロール':'月カレンダー、狭い画面では左右にスクロール'">
    <div class="calendar-grid" :class="view">
     <div v-for="(weekday,index) in weekdays" :key="weekday" class="weekday" :class="{sunday:index===0,saturday:index===6}">{{ weekday }}</div>
     <section v-for="cell in cells" :key="cell.date" class="calendar-cell" :class="{outside:view==='month'&&cell.date.slice(0,7)!==day.slice(0,7),today:cell.date===today}">
      <button type="button" class="cell-date" :aria-label="labelDate(cell.date)+'を日表示で開く'" @click="navigate({day:cell.date,view:'day'})"><time :datetime="cell.date">{{ view==='week'?cell.date.slice(5).replace('-','/'):Number(cell.date.slice(8)) }}</time><span v-if="cell.date===today">{{ t('common.today') }}</span></button>
      <div class="cell-events" :tabindex="view==='month'&&cell.events.length?0:undefined" :role="view==='month'?'region':undefined" :aria-label="view==='month'?labelDate(cell.date)+'のイベント一覧':undefined">
      <div v-for="event in cell.events" :key="event.id" class="compact-event" :class="{ended:new Date(event.endsAt).getTime()<=now}" :title="event.title+'｜'+event.place"><a class="compact-event-main" :href="eventUrl(event)"><time>{{ shortTime(event,cell.date) }}{{ new Date(event.endsAt).getTime()<=now?'・終了':'' }}</time><strong>{{ event.title }}</strong></a><EventVenue :name="event.venueName" :url="event.venueUrl"/></div>
      </div>
     </section>
    </div>
   </div>
  </template>
 </template><aside class="asset-guide"><div><strong>{{ t('calendar.assetHeading') }}</strong><p>{{ t('calendar.assetDescription') }}</p></div><a class="vpm-button db-header-button" :href="uiLinks.assets" target="_blank" rel="noopener noreferrer"><UiIcon name="package"/>{{ t('navigation.assetDownload') }}</a></aside></main></div>
</template>
<style scoped>
.calendar-toolbar .date-controls{align-items:center;gap:6px;flex-wrap:wrap}.date-controls>button{height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 12px;flex-shrink:0;line-height:1}.date-controls>button:first-child,.date-controls>button:nth-last-child(2){width:32px;padding:0}.refresh-button,.view-switch button{height:40px;display:inline-flex;align-items:center;justify-content:center;line-height:1}.refresh-button{flex-shrink:0;white-space:nowrap}

.month .calendar-cell{height:var(--db-calendar-month-cell-height);min-height:0;display:flex;flex-direction:column;overflow:hidden}.month .cell-date{flex-shrink:0}.month .cell-events{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:auto;scrollbar-gutter:stable;padding:0 2px}.month .cell-events .compact-event:first-child{margin-top:0}

.time-event,.compact-event{position:relative}.time-event-main,.compact-event-main{color:inherit;text-decoration:none;display:flex;flex-direction:column}.time-event-main::after,.compact-event-main::after{content:'';position:absolute;inset:0}.time-event-main:focus-visible,.compact-event-main:focus-visible{outline:0}.time-event-main:focus-visible::after,.compact-event-main:focus-visible::after{outline:3px solid var(--db-focus-ring);outline-offset:-2px}.time-event :deep(.event-venue),.compact-event :deep(.event-venue){font-size:10px;margin-top:3px}

.event-calendar{min-height:100vh;background:var(--db-background);color:var(--db-text);font-family:Arial,'Yu Gothic',sans-serif;line-height:1.7}.event-calendar *{box-sizing:border-box}header{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--db-header-background);border-bottom:1px solid var(--db-border-control);padding:18px max(20px,calc((100vw - 1120px)/2))}.event-brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:20px;text-decoration:none;color:var(--db-logo-color);white-space:nowrap}.event-brand b{color:var(--db-logo-accent)}.back{font-size:13px;color:var(--db-link)}main{max-width:1120px;margin:auto;padding:32px 24px 60px}.page-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--db-text-muted);margin:0}h1{margin:2px 0;font-size:26px}.preview-note{font-size:12px;background:var(--db-surface-muted);padding:12px;border-radius:var(--db-radius-control)}.calendar-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start;margin:24px 0}.date-controls{display:flex;gap:7px;align-items:center}.date-controls label{font-size:10px;color:var(--db-text-muted)}input,button{font:inherit;color:var(--db-text);background:var(--db-surface-white);border:1px solid var(--db-border-control);border-radius:var(--db-radius-control);padding:8px 12px}input{display:block}button{cursor:pointer}button:disabled{opacity:.5}a:focus-visible,button:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:2px}fieldset{border:0;padding:0;margin:0 0 24px}legend{font-size:13px;margin-bottom:8px}.place-filters{display:flex;flex-wrap:wrap;gap:8px}.place-filters button{font-size:12px;border-radius:var(--db-radius-pill)}.place-filters button[aria-pressed=true],.view-switch button[aria-pressed=true]{background:var(--db-primary);color:var(--db-surface-white);border-color:var(--db-primary)}.view-switch{display:flex;flex-shrink:0}.view-switch button{border-radius:0;min-width:44px}.view-switch button:first-child{border-radius:6px 0 0 6px}.view-switch button:last-child{border-radius:0 6px 6px 0}.view-switch button+button{margin-left:-1px}.day-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:26px 0 15px}.day-heading h2{font-size:19px;margin:0}.day-heading>span,.empty{font-size:12px;color:var(--db-text-muted)}.error{color:#b42318}.ended-setting{display:flex;align-items:center;gap:8px;font-size:13px}.ended-setting input{margin:0;width:16px;height:16px;accent-color:var(--db-primary)}
.day-scroll{height:clamp(340px,65vh,660px);overflow:auto;overscroll-behavior:contain;background:var(--db-surface-white);border:1px solid var(--db-border-control);border-radius:var(--db-radius-surface);padding:14px 0 18px;scrollbar-gutter:stable}.day-grid{position:relative;margin-right:6px}.hour-row,.half-row{position:absolute;left:58px;right:0;border-top:1px solid var(--db-border-control);pointer-events:none}.hour-row>span{position:absolute;right:calc(100% + 8px);top:-10px;font-size:11px;color:var(--db-text-muted);font-variant-numeric:tabular-nums}.half-row{border-top-style:dashed;opacity:.55}.time-event{position:absolute;z-index:1;display:flex;flex-direction:column;overflow:hidden;padding:3px 8px;border:1px solid var(--db-primary);border-left-width:4px;border-radius:4px;background:var(--db-surface-muted);color:var(--db-text);text-decoration:none;line-height:1.35}.time-event time{font-size:11px;font-variant-numeric:tabular-nums}.time-event strong{font-size:13px;overflow-wrap:anywhere}.time-event small{font-size:10px;color:var(--db-text-muted)}.time-event.ended,.compact-event.ended{opacity:.65}.time-event:hover,.compact-event:hover{background:var(--db-control-hover)}.now-line{position:absolute;left:58px;right:0;height:2px;z-index:3;background:#d52c3e;pointer-events:none}.now-line::before{content:'';position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:var(--db-radius-circle);background:#d52c3e}.now-line>span{position:absolute;right:calc(100% + 6px);top:-10px;padding:1px 3px;background:#d52c3e;color:white;font-size:10px;line-height:18px;font-variant-numeric:tabular-nums}
.calendar-scroll{overflow-x:auto;border:1px solid var(--db-border-control);border-radius:var(--db-radius-surface);background:var(--db-surface-white)}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-width:630px}.calendar-grid.week{min-width:770px}.weekday{text-align:center;background:var(--db-surface-muted);font-size:12px;font-weight:bold;padding:9px;border-bottom:1px solid var(--db-border-control)}.sunday{color:#b42338}.saturday{color:#2864ab}.calendar-cell{min-width:0;min-height:140px;padding:7px;border-right:1px solid var(--db-border-control);border-bottom:1px solid var(--db-border-control)}.calendar-cell:nth-child(7n){border-right:0}.week .calendar-cell{min-height:360px}.calendar-cell.outside{background:var(--db-surface);color:var(--db-text-muted)}.calendar-cell.today{box-shadow:inset 0 0 0 2px var(--db-primary)}.cell-date{border:0;padding:0 3px 6px;background:none;display:flex;align-items:center;gap:5px;font-size:12px;width:100%;text-align:left}.cell-date>span{font-size:9px;background:var(--db-primary);color:var(--db-surface-white);border-radius:3px;padding:0 4px}.compact-event{display:flex;flex-direction:column;gap:1px;line-height:1.35;text-decoration:none;color:var(--db-text);background:var(--db-surface-muted);border-left:3px solid var(--db-primary);border-radius:3px;margin:5px 0;padding:5px;overflow-wrap:anywhere}.compact-event time{font-size:10px;font-variant-numeric:tabular-nums}.compact-event strong{font-size:11px;font-weight:600}
@media(max-width:600px){main{padding:24px 12px 40px}header{padding:12px 16px}.event-brand{font-size:16px}.event-brand img{width:32px;height:32px}.calendar-toolbar{gap:8px}.date-controls button{padding:8px 10px}h1{font-size:21px}.view-switch button{min-width:36px;padding:7px 10px}.day-heading{align-items:flex-start;flex-direction:column}.day-heading h2{font-size:17px}.day-scroll{height:60vh;min-height:340px}.time-event{padding:3px 5px}.calendar-scroll{touch-action:pan-x pan-y}}
</style>

<style scoped>
.event-header-actions .back{border:1px solid var(--db-border-control);background:var(--db-surface-white);text-decoration:none;white-space:nowrap}.event-header-actions .back:hover{background:var(--db-control-hover)}
.event-header-actions{display:flex;align-items:center;gap:16px;flex-shrink:0}.vpm-button{gap:7px;border:1px solid var(--db-border-control);background:var(--db-surface-white);color:var(--db-link);text-decoration:none;white-space:nowrap}.vpm-button:hover{background:var(--db-control-hover)}.date-controls{min-width:0}.page-title h1{line-height:1.4}.asset-guide{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:32px;padding:20px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-surface);background:var(--db-surface-white)}.asset-guide strong{font-size:14px}.asset-guide p{margin:4px 0 0;font-size:12px;color:var(--db-text-muted)}
@media(max-width:600px){.asset-guide{align-items:flex-start;flex-direction:column;padding:16px}.event-header-actions{gap:8px}.back{font-size:11px}.event-brand{gap:6px}}
@media(max-width:600px){.date-controls :deep(.period-picker){order:-1;flex-basis:100%;min-width:0;max-width:100%}.date-controls :deep(.year){width:64px}.date-controls :deep(.month),.date-controls :deep(.date){width:37px}.date-controls :deep(.week){width:62px;margin-left:2px}}
@media(max-width:420px){.event-brand span{display:none}}
</style>


