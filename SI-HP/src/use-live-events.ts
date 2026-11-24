import { onMounted, onUnmounted, ref, watch } from 'vue';
import { loadEvents, type LiveEvent } from './band-events.mjs';
type EventSource = {
    enabled?: boolean;
    localPreview: boolean;
    sheetCsvUrl?: string;
};
/** Per-view state; public calendar data never shares the authenticated editor's cache. */
export function useLiveEvents(source: () => EventSource, fetchEvents = loadEvents) {
    const events = ref<LiveEvent[]>([]);
    const loading = ref(false);
    const error = ref('');
    let requestVersion = 0;
    async function refresh() {
        const version = ++requestVersion;
        const options = source();
        if (options.enabled === false) {
            events.value = [];
            loading.value = false;
            error.value = '';
            return;
        }
        loading.value = true;
        error.value = '';
        try {
            const result = await fetchEvents(options);
            if (version === requestVersion)
                events.value = result;
        }
        catch (cause) {
            if (version === requestVersion)
                error.value = (cause as Error).message;
        }
        finally {
            if (version === requestVersion)
                loading.value = false;
        }
    }
    watch(source, refresh);
    onMounted(() => {
        void refresh();
        window.addEventListener('storage', refresh);
        window.addEventListener('vbd-events-changed', refresh);
    });
    onUnmounted(() => {
        requestVersion++;
        window.removeEventListener('storage', refresh);
        window.removeEventListener('vbd-events-changed', refresh);
    });
    return { events, loading, error, refresh };
}
