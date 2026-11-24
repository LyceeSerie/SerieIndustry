<script setup lang="ts">
import uiLinks from '../config/ui-links.json';
import { t } from '../i18n/ui-text.mjs';
import { computed } from 'vue';
import { activeEvents, eventsForBand } from '../band-events.mjs';
import { useLiveEvents } from '../use-live-events';
import { useEventClock } from '../use-event-clock';
import LiveEventList from './LiveEventList.vue';
const props = defineProps<{
    bandId: string;
    localPreview: boolean;
    sheetCsvUrl?: string;
}>();
const { events, error, loading, refresh } = useLiveEvents(() => ({
    localPreview: props.localPreview, sheetCsvUrl: props.sheetCsvUrl
}));
const now = useEventClock();
const upcoming = computed(() => activeEvents(eventsForBand(events.value, props.bandId), now.value));
</script>
<template><section class="band-events"><h2>{{ t('labels.schedule') }}</h2><p v-if="loading">ライブ予定を読み込み中…</p><p v-else-if="error" role="status">{{ error }} <button type="button" @click="refresh">{{ t('common.refresh') }}</button></p><LiveEventList v-else :events="upcoming"/><a class="calendar-link" :href="uiLinks.events">{{ t('navigation.viewCalendar') }}</a></section></template>
<style scoped>.band-events{margin-top:30px}.calendar-link{display:inline-block;margin-top:16px;color:var(--db-link)}</style>
