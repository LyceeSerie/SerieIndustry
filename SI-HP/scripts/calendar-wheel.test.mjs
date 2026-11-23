import test from 'node:test'
import assert from 'node:assert/strict'
import {handleCalendarWheel} from '../src/calendar-wheel.mjs'
function wheel(options={},position=0,width=350,content=770){const element={clientWidth:width,scrollWidth:content,scrollLeft:position},state={prevented:false};const event={currentTarget:element,deltaX:0,deltaY:0,deltaMode:0,cancelable:true,preventDefault(){state.prevented=true},...options};return {event,element,state}}
test('tilt wheel scrolls calendar horizontally while ordinary and mostly vertical wheel input stays native',()=>{
 const right=wheel({deltaX:100});assert.equal(handleCalendarWheel(right.event),true);assert.equal(right.element.scrollLeft,100);assert.equal(right.state.prevented,true)
 const left=wheel({deltaX:-80},100);assert.equal(handleCalendarWheel(left.event),true);assert.equal(left.element.scrollLeft,20)
 for(const input of [{deltaY:100},{deltaX:2,deltaY:100}]){const sample=wheel(input);assert.equal(handleCalendarWheel(sample.event),false);assert.equal(sample.state.prevented,false);assert.equal(sample.element.scrollLeft,0)}
})
test('shift-wheel and line/page units work and edge input is not swallowed',()=>{
 const shifted=wheel({deltaY:60,shiftKey:true});handleCalendarWheel(shifted.event);assert.equal(shifted.element.scrollLeft,60)
 const lines=wheel({deltaX:3,deltaMode:1});handleCalendarWheel(lines.event);assert.equal(lines.element.scrollLeft,48)
 const page=wheel({deltaX:1,deltaMode:2});handleCalendarWheel(page.event);assert.equal(page.element.scrollLeft,350)
 const edge=wheel({deltaX:100},420);assert.equal(handleCalendarWheel(edge.event),false);assert.equal(edge.state.prevented,false)
 const clamped=wheel({deltaX:1000});handleCalendarWheel(clamped.event);assert.equal(clamped.element.scrollLeft,420)
})
test('zoom, canceled events and non-overflowing calendars are left untouched',()=>{
 for(const options of [{ctrlKey:true},{metaKey:true},{defaultPrevented:true},{cancelable:false}]){const sample=wheel({...options,deltaX:100});assert.equal(handleCalendarWheel(sample.event),false);assert.equal(sample.state.prevented,false)}
 const fits=wheel({deltaX:100},0,800,770);assert.equal(handleCalendarWheel(fits.event),false);assert.equal(fits.state.prevented,false)
})
