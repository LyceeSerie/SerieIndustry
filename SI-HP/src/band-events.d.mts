export type EventBand={id:string;name:string}
export type LiveEvent={id:string;ownerBandId:string;title:string;subtitle:string;place:string;venueName:string;venueUrl:string;startsAt:string;endsAt:string;participants:{bandId:string;name:string}[];updatedAt:string}
export const eventPlaces:string[]
export const eventStorageKey:string
export const eventColumns:string[]
export function previewAllowed(enabled:boolean):boolean
export function japanDate(value?:Date|string):string
export function toJapanInput(value:Date|string):string
export function fromJapanInput(value:string):string
export function normalizeEvent(value:unknown):LiveEvent
export function eventsOnDay(events:LiveEvent[],day:string,places?:string[]):LiveEvent[]
export function eventsForBand(events:LiveEvent[],id:string):LiveEvent[]
export function parseEventCsv(csv:string):LiveEvent[]
export function sampleEvents(bands:EventBand[],now?:Date):LiveEvent[]
export function loadEventBands():Promise<EventBand[]>
export function loadEvents(options?:{localPreview?:boolean;sheetCsvUrl?:string}):Promise<LiveEvent[]>
export function savePreviewEvent(input:unknown,options:{localPreview:boolean;admin?:boolean;bandId?:string;events:LiveEvent[]}):LiveEvent[]
export function deletePreviewEvent(id:string,options:{localPreview:boolean;admin?:boolean;bandId?:string;events:LiveEvent[]}):LiveEvent[]

export function activeEvents(events:LiveEvent[],now?:number|Date|string):LiveEvent[]
export function shiftDay(day:string,amount:number):string
export function weekDays(day:string):string[]
export function monthDays(day:string):string[]
export function moveCalendar(day:string,view:string,amount:number):string
export function layoutDayEvents(events:LiveEvent[],day:string):{event:LiveEvent;start:number;end:number;column:number;columns:number}[]
export function eventDetailsUrl(id:string,query?:Record<string,unknown>):string

export function calendarEvents(events:LiveEvent[],options?:{now?:number|Date|string;places?:string[];showEnded?:boolean}):LiveEvent[]

export const eventFixtureKey:string
export function mergeEventSamples(events:LiveEvent[],samples:LiveEvent[]):LiveEvent[]
export function expandedEventSamples(bands:EventBand[],now?:Date):LiveEvent[]

export function sampleVenue(place:string,index?:number):{venueName:string;venueUrl:string}

export function weeksInMonth(day:string):{number:number;start:string;end:string;anchor:string}[]
export function chooseCalendarDate(day:string,view:string,changes?:{year?:number;month?:number;dayOfMonth?:number;week?:number}):string

export function refreshFixtureFields(events:LiveEvent[],samples:LiveEvent[]):LiveEvent[]
export function specEventSamples(bands:EventBand[],now?:Date):LiveEvent[]
