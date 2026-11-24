<script setup lang="ts">
import CustomSelect from './CustomSelect.vue'
import {computed} from 'vue'
import {chooseCalendarDate,japanDate,weeksInMonth,weekDays} from '../band-events.mjs'
const props=defineProps<{modelValue:string;view:'day'|'week'|'month'}>()
const emit=defineEmits<{(event:'update:modelValue',value:string):void}>()
const year=computed(()=>Number(props.modelValue.slice(0,4))),month=computed(()=>Number(props.modelValue.slice(5,7))),date=computed(()=>Number(props.modelValue.slice(8)))
const currentYear=Number(japanDate().slice(0,4))
const years=computed(()=>[...new Set([...Array.from({length:21},(_,i)=>currentYear-10+i),year.value])].sort((a,b)=>a-b))
const dates=computed(()=>Array.from({length:new Date(Date.UTC(year.value,month.value,0)).getUTCDate()},(_,i)=>i+1))
const weeks=computed(()=>weeksInMonth(props.modelValue))
const weekNumber=computed(()=>weeks.value.find(week=>week.start===weekDays(props.modelValue)[0])?.number||1)
function choose(changes:{year?:number;month?:number;dayOfMonth?:number;week?:number}){emit('update:modelValue',chooseCalendarDate(props.modelValue,props.view,changes))}
</script>
<template>
 <div class="period-picker" role="group" :aria-label="view==='day'?'年月日の選択':view==='week'?'年月と週の選択':'年月の選択'">
  <CustomSelect class="year" label="年" :model-value="year" :options="years.map(value=>({value,label:String(value)}))" @update:model-value="choose({year:Number($event)})"/><span aria-hidden="true">/</span>
  <CustomSelect class="month" label="月" :model-value="month" :options="Array.from({length:12},(_,i)=>({value:i+1,label:String(i+1).padStart(2,'0')}))" @update:model-value="choose({month:Number($event)})"/>
  <template v-if="view==='day'"><span aria-hidden="true">/</span><CustomSelect class="date" label="日" :model-value="date" :options="dates.map(value=>({value,label:String(value).padStart(2,'0')}))" @update:model-value="choose({dayOfMonth:Number($event)})"/></template>
  <CustomSelect v-else-if="view==='week'" class="week" label="週" :model-value="weekNumber" :options="weeks.map(week=>({value:week.number,label:week.number+'週目',title:week.start.split('-').join('/')+'〜'+week.end.split('-').join('/')}))" @update:model-value="choose({week:Number($event)})"/>
 </div>
</template>
<style scoped>
.period-picker{display:inline-flex;align-items:center;height:40px;flex-shrink:0;padding:0 2px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-control);background:var(--db-surface-white);color:var(--db-text);font-variant-numeric:tabular-nums}.period-picker :deep(.select-trigger){font-size:13px;height:38px;padding:0 4px;border:0;border-radius:4px;background:transparent}.period-picker :deep(.select-trigger:hover){background:var(--db-control-hover)}.period-picker :deep(.select-options){min-width:88px}.year{width:70px}.month,.date{width:45px}.week{width:70px;margin-left:6px}.period-picker>span{font-size:12px;color:var(--db-text-muted);pointer-events:none}
</style>
