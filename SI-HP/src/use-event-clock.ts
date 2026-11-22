import {onMounted,onUnmounted,ref} from 'vue'
export function useEventClock(){
 const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined
 const refresh=()=>{now.value=Date.now()}
 onMounted(()=>{refresh();timer=setInterval(refresh,1000);document.addEventListener('visibilitychange',refresh)})
 onUnmounted(()=>{if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',refresh)})
 return now
}
