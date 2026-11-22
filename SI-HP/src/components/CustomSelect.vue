<script setup lang="ts">
import {computed,nextTick,onMounted,onUnmounted,ref,watch,useId} from 'vue'
type Option={value:string|number;label:string;title?:string}
const props=defineProps<{modelValue:string|number;options:Option[];label:string;disabled?:boolean}>()
const emit=defineEmits<{(event:'update:modelValue',value:string|number):void}>()
const root=ref<HTMLElement|null>(null),trigger=ref<HTMLButtonElement|null>(null),list=ref<HTMLElement|null>(null),open=ref(false),active=ref(0)
const id='select-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),listId=id+'-options'
const selected=computed(()=>props.options.findIndex(option=>option.value===props.modelValue))
const text=computed(()=>props.options[selected.value]?.label||'選択してください')
async function reveal(){await nextTick();const option=list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`);if(option&&list.value){const top=option.offsetTop,bottom=top+option.offsetHeight;if(top<list.value.scrollTop)list.value.scrollTop=top;else if(bottom>list.value.scrollTop+list.value.clientHeight)list.value.scrollTop=bottom-list.value.clientHeight}}
function show(){if(props.disabled)return;open.value=true;active.value=Math.max(0,selected.value);reveal()}
function close(){open.value=false}
function choose(index:number){const option=props.options[index];if(!option)return;emit('update:modelValue',option.value);close();trigger.value?.focus()}
function keydown(event:KeyboardEvent){
 if(event.key==='Tab'){close();return}
 if(event.key==='Escape'){if(open.value){event.preventDefault();event.stopPropagation();close()}return}
 if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(event.key)){event.preventDefault();if(!open.value){show();return}const length=props.options.length;active.value=event.key==='Home'?0:event.key==='End'?length-1:Math.min(length-1,Math.max(0,active.value+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='PageDown'?5:-5)));reveal();return}
 if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open.value)choose(active.value);else show()}
}
function outside(event:PointerEvent){if(event.target instanceof Node&&!root.value?.contains(event.target))close()}
function blur(event:FocusEvent){if(!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node|null))close()}
watch(()=>props.modelValue,()=>{active.value=Math.max(0,selected.value)})
watch(()=>props.options,()=>{active.value=Math.min(Math.max(0,selected.value),props.options.length-1);if(open.value)reveal()})
watch(()=>props.disabled,value=>{if(value)close()})
onMounted(()=>document.addEventListener('pointerdown',outside))
onUnmounted(()=>document.removeEventListener('pointerdown',outside))
</script>
<template>
 <div ref="root" class="custom-select" @focusout="blur"><button ref="trigger" type="button" class="select-trigger" role="combobox" aria-haspopup="listbox" aria-autocomplete="none" :aria-label="label" :aria-expanded="open" :aria-controls="listId" :aria-activedescendant="open?id+'-'+active:undefined" :disabled="disabled" @click="open?close():show()" @keydown="keydown"><span>{{ text }}</span><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg></button>
 <div v-if="open" :id="listId" ref="list" class="select-options" role="listbox" :aria-label="label+'の選択肢'"><div v-for="(option,index) in options" :id="id+'-'+index" :key="option.value" class="select-option" :class="{active:active===index}" role="option" :aria-selected="option.value===modelValue" :title="option.title" :data-index="index" @pointerdown.prevent @pointermove="active=index" @click="choose(index)"><span>{{ option.label }}</span><span v-if="option.value===modelValue" aria-hidden="true">✓</span></div><p v-if="!options.length">選択肢がありません。</p></div></div>
</template>
<style scoped>
.custom-select{position:relative;min-width:0}.select-trigger{display:flex;align-items:center;justify-content:space-between;gap:4px;width:100%;height:40px;padding:0 9px;background:var(--db-surface-white);color:var(--db-text);border:1px solid var(--db-border-control);border-radius:5px;font:inherit;text-align:left;cursor:pointer}.select-trigger>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.select-trigger svg{width:12px;height:12px;flex-shrink:0}.select-trigger:disabled{opacity:.5;cursor:default}.select-trigger:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:-3px}.select-options{position:absolute;left:0;top:calc(100% + 5px);z-index:40;min-width:100%;width:max-content;max-width:min(280px,80vw);max-height:min(240px,45vh);overflow-y:auto;overscroll-behavior-y:contain;padding:4px;background:var(--db-surface-white);color:var(--db-text);border:1px solid var(--db-border-control);border-radius:7px;box-shadow:0 6px 20px var(--db-dropdown-shadow);font-size:13px;font-variant-numeric:tabular-nums}.select-option{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative;min-height:32px;padding:5px 9px;border-radius:4px;cursor:pointer;white-space:nowrap}.select-option.active{background:var(--db-control-hover)}.select-option[aria-selected=true]{font-weight:bold;color:var(--db-primary)}.select-options p{padding:4px 8px;font-size:12px}
</style>
