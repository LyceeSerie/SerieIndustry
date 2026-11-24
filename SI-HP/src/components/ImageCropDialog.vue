<script setup lang="ts">
import { t } from '../i18n/ui-text.mjs'
import {computed,nextTick,onMounted,onUnmounted,ref,watch} from 'vue'
import {cropFromPoints,moveCrop,encodeWithinLimit,fitImage,type Crop} from '../image-crop'
const props=defineProps<{file:File;label:string;limit:{width:number;height:number;bytes:number}}>()
const emit=defineEmits<{confirm:[file:File];cancel:[]}>()
const dialog=ref<HTMLDialogElement>(),canvas=ref<HTMLCanvasElement>(),loaded=ref(false),processing=ref(false),error=ref(''),ratio=ref(props.label==='アイコン'?'1':'free'),outputWidth=ref(1),result=ref<{blob:Blob;width:number;height:number}>(),preview=ref('')
const backgroundEnabled=ref(false),backgroundColor=ref('#ffffff'),dragMode=ref('select')
const crop=ref<Crop>({x:0,y:0,width:1,height:1})
let pointerId:number|undefined
let bitmap:ImageBitmap|undefined,selection:{x:number;y:number}|undefined,previousCrop:Crop|undefined,timer:ReturnType<typeof setTimeout>|undefined,sequence=0,disposed=false
const maximum=computed(()=>fitImage(crop.value.width,crop.value.height,props.limit.width,props.limit.height))
const size=(bytes:number)=>(bytes/1048576).toFixed(2)+' MiB'
function paint(){
 if(!bitmap||!canvas.value)return
 const el=canvas.value,ctx=el.getContext('2d')!;ctx.clearRect(0,0,el.width,el.height);if(backgroundEnabled.value){ctx.fillStyle=backgroundColor.value;ctx.fillRect(0,0,el.width,el.height)}ctx.drawImage(bitmap,0,0,el.width,el.height)
 const scale=el.width/bitmap.width,c=crop.value,x=c.x*scale,y=c.y*scale,w=c.width*scale,h=c.height*scale
 ctx.fillStyle='#0009';ctx.beginPath();ctx.rect(0,0,el.width,el.height);ctx.rect(x,y,w,h);ctx.fill('evenodd');ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h)
}
function point(event:PointerEvent){const rect=canvas.value!.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*bitmap!.width,y:(event.clientY-rect.top)/rect.height*bitmap!.height}}
function start(event:PointerEvent){if(!bitmap||event.button!==0||selection)return;canvas.value!.setPointerCapture(event.pointerId);pointerId=event.pointerId;selection=point(event);previousCrop={...crop.value};sequence++;clearTimeout(timer);processing.value=true}
function move(event:PointerEvent){if(!selection||!bitmap||event.pointerId!==pointerId)return;const p=point(event);crop.value=dragMode.value==='move'?moveCrop(previousCrop!,p.x-selection.x,p.y-selection.y,bitmap.width,bitmap.height):cropFromPoints(selection,p,bitmap.width,bitmap.height,ratio.value==='free'?0:Number(ratio.value));paint()}
function end(event:PointerEvent){if(!selection||event.pointerId!==pointerId)return;selection=undefined;pointerId=undefined;if(crop.value.width<1||crop.value.height<1)crop.value=previousCrop!;outputWidth.value=Math.min(outputWidth.value,maximum.value.width);paint();schedule()}
function nudge(event:KeyboardEvent){if(!bitmap||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?10:1;crop.value=moveCrop(crop.value,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0,bitmap.width,bitmap.height);paint();schedule()}
function reset(){if(!bitmap)return;let width=bitmap.width,height=bitmap.height;if(ratio.value!=='free'){const r=Number(ratio.value);width=Math.min(width,height*r);height=width/r}crop.value={x:(bitmap.width-width)/2,y:(bitmap.height-height)/2,width,height};outputWidth.value=maximum.value.width;paint();schedule()}
function schedule(){clearTimeout(timer);const version=++sequence;result.value=undefined;processing.value=true;timer=setTimeout(()=>void encode(version),180)}
async function encode(version:number){
 if(!bitmap||!crop.value.width||!crop.value.height){if(version===sequence)processing.value=false;return}
 error.value=''
 try{
  const background=backgroundEnabled.value?backgroundColor.value:'',source=bitmap,c={...crop.value},width=Math.max(1,Math.min(maximum.value.width,Math.floor(outputWidth.value)||1)),height=Math.min(props.limit.height,Math.max(1,Math.floor(width*c.height/c.width+1e-8)))
  const encoded=await encodeWithinLimit(width,height,props.limit.bytes,async(w,h)=>{const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d')!;if(background){ctx.fillStyle=background;ctx.fillRect(0,0,w,h)}ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,c.x,c.y,c.width,c.height,0,0,w,h);return new Promise<Blob>((resolve,reject)=>out.toBlob(blob=>blob?resolve(blob):reject(Error('PNGへ変換できませんでした。')),'image/png'))})
  if(disposed||version!==sequence)return
  if(preview.value)URL.revokeObjectURL(preview.value);preview.value=URL.createObjectURL(encoded.blob);result.value=encoded
 }catch(e){if(version===sequence&&!disposed)error.value=(e as Error).message}finally{if(version===sequence&&!disposed)processing.value=false}
}
function confirm(){if(!result.value||processing.value||selection)return;emit('confirm',new File([result.value.blob],props.file.name.replace(/\.[^.]+$/,'')+'.png',{type:'image/png'}))}
watch(ratio,reset)
watch([backgroundEnabled,backgroundColor],()=>{paint();schedule()})
onMounted(async()=>{
 dialog.value!.showModal()
 try{if(props.file.size>64*1048576)throw Error('編集できる元画像は64MiB以内です。');bitmap=await createImageBitmap(props.file);if(disposed){bitmap.close();return}if(bitmap.width*bitmap.height>64_000_000)throw Error('編集できる元画像は6400万画素以内です。');loaded.value=true;await nextTick();const dim=fitImage(bitmap.width,bitmap.height,1000,650);canvas.value!.width=dim.width;canvas.value!.height=dim.height;reset()}catch(e){error.value=(e as Error).message}
})
onUnmounted(()=>{disposed=true;sequence++;clearTimeout(timer);bitmap?.close();if(preview.value)URL.revokeObjectURL(preview.value)})
</script>
<template>
 <dialog ref="dialog" class="image-crop-dialog" aria-labelledby="crop-title" @cancel.prevent="emit('cancel')">
  <header><h2 id="crop-title">{{ label }}のトリミング・リサイズ</h2><button type="button" aria-label="画像編集を閉じる" @click="emit('cancel')">×</button></header>
  <p>「範囲を選ぶ」で切り抜き、「位置を動かす」で大きさを保って移動できます。元画像は変更しません。</p>
  <p class="hint">PNG出力・{{ limit.width }}×{{ limit.height }}px以内・{{ size(limit.bytes) }}以内。容量を超える場合は自動で縮小します。</p>
  <p v-if="!loaded&&!error" role="status">画像を読み込んでいます…</p>
  <template v-if="loaded">
   <div class="crop-controls ratio-controls"><span v-if="label==='アイコン'">切り抜く比率：正方形（1:1）固定</span><label v-else>切り抜く比率<select v-model="ratio"><option value="free">自由</option><option value="1">正方形（1:1）</option><option :value="String(16/9)">横長（16:9）</option><option value="0.5">縦長（1:2）</option></select></label><button type="button" @click="reset">範囲をリセット</button></div>
   <div class="crop-controls" role="group" aria-label="ドラッグ操作"><button type="button" :aria-pressed="dragMode==='select'" @click="dragMode='select'">範囲を選ぶ</button><button type="button" :aria-pressed="dragMode==='move'" @click="dragMode='move'">位置を動かす</button></div>
   <div class="canvas-stage"><canvas ref="canvas" class="crop-canvas" tabindex="0" :class="{moving:dragMode==='move'}" aria-label="画像の切り抜き範囲。矢印キーで位置移動、Shift併用で10ピクセル移動" @keydown="nudge" @pointerdown.prevent="start" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end"/></div>
   <p class="hint">矢印キーでも位置を動かせます（Shift併用で10px）。選択範囲：約{{ Math.round(crop.width) }}×{{ Math.round(crop.height) }}px</p>
   <div class="crop-controls background-controls"><label><input v-model="backgroundEnabled" type="checkbox"> 背景色を付ける</label><label>背景色<input v-model="backgroundColor" type="color" :disabled="!backgroundEnabled" aria-label="背景色を選択"></label></div>
   <label class="output-width">出力の横幅（縦横比を維持）<input v-model.number="outputWidth" type="number" min="1" :max="maximum.width" aria-label="出力の横幅（px）" @input="schedule"><input v-model.number="outputWidth" type="range" min="1" :max="maximum.width" aria-label="出力の横幅を調整" @input="schedule"></label>
   <p class="conversion-status" role="status">{{ processing?'変換しています…':result?`出力：${result.width}×${result.height}px ／ ${size(result.blob.size)}`:'' }}</p>
   <details><summary>仕上がりを確認</summary><div class="result-stage"><img v-if="preview" :src="preview" alt="トリミング・リサイズ後の画像" class="result-preview"><span v-else>仕上がりを準備しています…</span></div></details>
  </template>
  <p v-if="error" role="alert" class="crop-error">{{ error }}</p>
  <footer><button type="button" @click="emit('cancel')">{{ t('common.cancel') }}</button><button type="button" class="apply" :disabled="!result||processing" @click="confirm">この画像をアップロード</button></footer>
 </dialog>
</template>
<style scoped>
.image-crop-dialog{box-sizing:border-box;width:min(900px,calc(100% - 24px));height:min(900px,calc(100dvh - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:24px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-dialog);background:var(--db-surface-white);color:var(--db-text)}.image-crop-dialog::backdrop{background:#0009}.image-crop-dialog header,.crop-controls,.image-crop-dialog footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.image-crop-dialog header{justify-content:space-between}.image-crop-dialog h2{font-size:19px;margin:0}.image-crop-dialog button,.image-crop-dialog select,.image-crop-dialog input[type=number]{padding:9px 12px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-control);background:var(--db-surface-white);color:var(--db-text);font:inherit}.image-crop-dialog button{cursor:pointer}.image-crop-dialog button:disabled{opacity:.5;cursor:default}.crop-controls{margin:16px 0}.crop-controls label{display:flex;align-items:center;gap:10px}.ratio-controls label{margin:0}.ratio-controls select,.ratio-controls button{box-sizing:border-box;height:42px;margin:0;line-height:1.2;vertical-align:middle}.canvas-stage{height:min(34dvh,320px);display:flex;align-items:center;justify-content:center}.crop-canvas{display:block;max-width:100%;max-height:100%;width:auto;height:auto;margin:auto;background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0/16px 16px;touch-action:none;cursor:crosshair}.crop-canvas.moving{cursor:move}.crop-controls button[aria-pressed=true]{border-color:var(--db-primary);background:var(--db-control-hover)}.background-controls input[type=color]{width:44px;height:34px;padding:2px;border:1px solid var(--db-border-control);background:transparent}.conversion-status{min-height:1.5em}.result-stage{height:250px;display:flex;align-items:center;justify-content:center}.hint{font-size:12px;color:var(--db-text-muted)}.output-width{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px}.output-width input[type=number]{width:100px}.output-width input[type=range]{flex:1;min-width:150px}.result-preview{display:block;max-width:100%;max-height:250px;margin-top:10px;background:#ddd}.image-crop-dialog footer{justify-content:flex-end;position:sticky;bottom:-24px;padding:16px 0;background:var(--db-surface-white)}.image-crop-dialog .apply{background:var(--db-primary);color:var(--db-surface-white)}.crop-error{color:#b42318}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible,canvas:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:2px}@media(max-width:600px){.image-crop-dialog{padding:16px}.image-crop-dialog footer{bottom:-16px}.image-crop-dialog h2{font-size:16px}}
</style>
