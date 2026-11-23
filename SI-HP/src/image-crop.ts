export type Crop={x:number;y:number;width:number;height:number}
export function moveCrop(crop:Crop,dx:number,dy:number,width:number,height:number):Crop{
  return {...crop,x:Math.max(0,Math.min(width-crop.width,crop.x+dx)),y:Math.max(0,Math.min(height-crop.height,crop.y+dy))}
}
export function fitImage(width:number,height:number,maxWidth:number,maxHeight:number){
  const scale=Math.min(1,maxWidth/width,maxHeight/height)
  return {width:Math.min(maxWidth,Math.max(1,Math.floor(width*scale+1e-8))),height:Math.min(maxHeight,Math.max(1,Math.floor(height*scale+1e-8)))}
}
export function cropFromPoints(a:{x:number;y:number},b:{x:number;y:number},width:number,height:number,ratio=0):Crop{
  const x=Math.max(0,Math.min(width,a.x)),y=Math.max(0,Math.min(height,a.y))
  const dx=b.x-x,dy=b.y-y,sx=dx<0?-1:1,sy=dy<0?-1:1
  let w=Math.min(Math.abs(dx),sx<0?x:width-x),h=Math.min(Math.abs(dy),sy<0?y:height-y)
  if(ratio>0){w=Math.min(w,h*ratio);h=w/ratio}
  return {x:sx<0?x-w:x,y:sy<0?y-h:y,width:w,height:h}
}
// The encoder is injected so capacity fallback can be tested without a browser.
export async function encodeWithinLimit(width:number,height:number,maxBytes:number,encode:(w:number,h:number)=>Promise<Blob>){
  let w=width,h=height
  for(let i=0;i<20;i++){
    const blob=await encode(w,h)
    if(blob.size<=maxBytes)return {blob,width:w,height:h}
    if(w===1&&h===1)break
    const scale=Math.min(.85,Math.sqrt(maxBytes/blob.size)*.95)
    w=Math.max(1,Math.floor(w*scale));h=Math.max(1,Math.floor(h*scale))
  }
  throw Error('容量上限に収まりません。範囲を小さくして再度お試しください。')
}
