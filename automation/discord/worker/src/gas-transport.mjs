const MAX_UPLOAD_BODY = 24 * 1024 * 1024
export function boundedBody(request,maximum) {
  if(Number(request.headers.get('Content-Length'))>maximum)throw Error('BODY_TOO_LARGE')
  let total=0
  if(!request.body)throw Error('INVALID_BODY')
  return request.body.pipeThrough(new TransformStream({transform(chunk,controller){total+=chunk.byteLength;if(total>maximum)throw Error('BODY_TOO_LARGE');controller.enqueue(chunk)}}))
}
export function gasFailure(data){
  const error=Error(/^[A-Z][A-Z0-9_]{0,79}$/.test(data?.code||'')?data.code:'GAS_REJECTED'),value=data?.diagnostic
  if(value&&['Error','TypeError','ReferenceError','RangeError','SyntaxError'].includes(value.type))error.diagnostic={type:value.type,stage:['SAVE_BAND','SAVE_COUNTER','UPLOAD_BLOB','UPLOAD_CREATE_FILE','UPLOAD_SHARE_FILE'].includes(value.stage)?value.stage:'PORTAL',locations:Array.isArray(value.locations)?value.locations.filter(item=>typeof item==='string'&&/^(?:Code|Core)(?:\.gs)?:\d+(?::\d+)?$/.test(item)).slice(0,3):[],...(typeof value.detail==='string'?{detail:value.detail.slice(0,300)}:{})}
  return error
}
export async function forwardUpload(request,env,fetchImpl=fetch) {
  // ContentService redirects to a one-time result URL. Workers cannot replay a
  // streaming POST body: send it once, then fetch only the result using GET.
  const signal=AbortSignal.timeout(120000)
  let result=await fetchImpl(env.GAS_WEBAPP_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:boundedBody(request,MAX_UPLOAD_BODY),redirect:'manual',signal})
  for(let count=0;[301,302,303].includes(result.status);count++){
    if(count>=3)throw Error('UPLOAD_GAS_REDIRECT_INVALID')
    let target;try{target=new URL(result.headers.get('Location'))}catch{throw Error('UPLOAD_GAS_REDIRECT_INVALID')}
    if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.port||target.username||target.password||target.href.length>16384)throw Error('UPLOAD_GAS_REDIRECT_INVALID')
    await result.body?.cancel()
    result=await fetchImpl(target.href,{method:'GET',redirect:'manual',signal})
  }
  if(!result.ok)throw Error('UPLOAD_GAS_HTTP_'+result.status)
  let data;try{data=await result.json()}catch{throw Error('UPLOAD_GAS_RESPONSE_INVALID')}
  if(!data||data.ok!==true)throw gasFailure(data)
  return data
}
