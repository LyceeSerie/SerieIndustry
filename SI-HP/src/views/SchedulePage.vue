<template>
    <div class="calendar-wrapper">

        <div class="calendar-body">
            <FullCalendar ref="calendarRef" :options="calendarOptions" />
        </div>

        <div v-if="selectedEvent" class="event-card" :style="{ '--category-color': selectedEvent.color }">
            <div class="event-main">
                <div class="event-card-header">
                    <div class="event-category-badge" :style="{ backgroundColor: selectedEvent.color }">
                        {{ selectedEvent.category }}
                    </div>
                    <div class="event-title">
                        {{ selectedEvent.title }}
                    </div>
                </div>

                <div class="event-card-body">
                    <div class="event-row">
                        <span class="event-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                        </span>
                        <span>{{ selectedEvent.date }}</span>
                    </div>

                    <div v-if="selectedEvent.time" class="event-row">
                        <span class="event-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                            </svg>
                        </span>
                        <span>{{ selectedEvent.time }}</span>
                    </div>

                    <div class="event-row">
                        <span class="event-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                            </svg>
                        </span>
                        <span>{{ selectedEvent.place }}</span>
                    </div>
                </div>
            </div>

            <div v-if="selectedEvent.note" class="event-note">
                {{ selectedEvent.note }}
            </div>
        </div>
    </div>
</template>

<script setup>

import { ref, onMounted } from "vue"

import FullCalendar from "@fullcalendar/vue3"
import dayGridPlugin from "@fullcalendar/daygrid"
import Papa from "papaparse"

const calendarRef = ref(null)
const selectedEvent = ref(null)
const calendarOptions = ref({

    plugins: [dayGridPlugin],
    initialView: "dayGridMonth",
    locale: "ja",
    events: [],
    headerToolbar: {
        left: "prev",
        center: "title",
        right: "next"
    },

    titleFormat: {
        year: "numeric",
        month: "long"
    },
    height: "100%",
    eventClick: function (info) {
        const e = info.event
        selectedEvent.value = {
            title: e.title,
            place: e.extendedProps.place,
            category: e.extendedProps.category,
            date: formatDate(e.startStr),
            time: e.extendedProps.time,
            note: e.extendedProps.note,
            color: e.backgroundColor
        }
    },
    datesSet: function () {
        selectedEvent.value = null
    }
})

const CSV_URL = "https://docs.google.com/spreadsheets/d/1GQbRmEJZ0tHuT_l1kmqu3MVa8VH9mwxhIlo67Fflmks/export?format=csv"

const categoryColors = {}
function getColor(category) {
    if (categoryColors[category])
        return categoryColors[category]
    const hue = Object.keys(categoryColors).length * 60 % 360
    const color = `hsl(${hue}, 70%, 60%)`
    categoryColors[category] = color
    return color
}

async function loadEvents() {
    const response = await fetch(CSV_URL)
    const text = await response.text()
    const parsed = Papa.parse(text, {
        header: true
    })

    const events = parsed.data
        .filter(row => row["日付"])
        .map(row => ({
            title: row["内容"],
            start: row["日付"],
            color: getColor(row["区分"]),
            extendedProps: {
                place: row["場所"],
                category: row["区分"],
                time: row["時間"],
                note: row["備考"]
            }
        }))
    calendarOptions.value.events = events
}

function formatDate(dateStr) {

    const d = new Date(dateStr)

    return d.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric"
    })

}

onMounted(() => {
    loadEvents()
})

</script>

<style>
.calendar-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 10;
}

.calendar-body {
    margin-top: 10vh;
    width: calc(75vw - 250px);
    height: 60vh;
}

.calendar-footer {
    margin-top: 10px;
}

.fc-toolbar-title {
    color: #000;
}

.event-card-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
}

.event-category-badge {
    display: inline-block;
    width: fit-content;
    padding: 3px 10px;
    border-radius: 999px;
    color: white;
    font-size: 0.8rem;
    font-weight: bold;
}

.event-title {
    font-size: 1.3rem;
    font-weight: bold;
}

.event-card-body {
    display: flex;
    gap: 20px;
}

.event-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.95rem;
}

.event-card {
    display: flex;
    position: relative;
    overflow: hidden;
    width: calc(73vw - 250px);
    margin-top: 20px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    padding: 16px;
    color: #000;
}

.event-main {
    flex: 1;
    padding: 16px;
}

.event-note {
    position: relative;
    flex: 1;
    padding: 16px;
    font-size: 0.95rem;
    line-height: 1.6;
    white-space: pre-line;
}

.event-note::before {
    content: "";
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 1px;
    background: #ddd;
}

.event-icon {
    width: 20px;
    text-align: center;
}

.event-card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    background: var(--category-color);
}

.fc a {
    color: #000;
}

.fc-daygrid-day-number {
    color: #000;
}

.fc-col-header-cell-cushion {
    color: #000;
}

.fc-day-sat .fc-daygrid-day-number,
.fc-day-sat .fc-col-header-cell-cushion {
    color: #0066ff;
}

.fc-day-sun .fc-daygrid-day-number,
.fc-day-sun .fc-col-header-cell-cushion {
    color: #d00000;
}

@media (max-width: 768px) {
    .calendar-body {
        margin-left: 10vw;
        width: 70vw;
        height: 60vh;
    }

    .event-card {
        margin-left: 10vw;
        width: 64vw;
        flex-direction: column;
    }

    .event-card-body {
        flex-direction: column;
    }

    .event-note {
        border-left: none;
        border-top: none;
    }

    .event-note::before {
        top: 0;
        left: 12px;
        right: 12px;
        height: 1px;
        width: auto;
    }
}
</style>