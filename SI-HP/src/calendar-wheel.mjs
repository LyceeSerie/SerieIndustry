// Forward horizontal wheel input before a nested vertical/hidden scroller can consume it.
export function handleCalendarWheel(event){
 if(event.defaultPrevented||event.cancelable===false||event.ctrlKey||event.metaKey)return false
 const element=event.currentTarget
 if(!element||element.scrollWidth<=element.clientWidth)return false
 const x=Number(event.deltaX)||0,y=Number(event.deltaY)||0
 const horizontal=event.shiftKey?(x||y):Math.abs(x)>=Math.abs(y)?x:0
 if(!horizontal)return false
 const unit=event.deltaMode===1?16:event.deltaMode===2?element.clientWidth:1
 const next=Math.max(0,Math.min(element.scrollWidth-element.clientWidth,element.scrollLeft+horizontal*unit))
 if(next===element.scrollLeft)return false
 element.scrollLeft=next;event.preventDefault();return true
}
