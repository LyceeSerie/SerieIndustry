import { IMAGE_LIMITS } from './image-limits.mjs'
// Shared Discord command schema and validation. Authorization remains in index.mjs.
const text = (name, description, required = false) => ({ type: 3, name, description, required, max_length: 100 })
const id = (name = 'id') => ({ ...text(name, '登録IDまたはイベントID', true), min_length: 36, max_length: 36 })
const file = { type: 11, name: 'file', description: 'JSONまたはPNGファイル', required: true }
const page = { type: 4, name: 'page', description: 'ページ番号（1ページ5件）', min_value: 1, max_value: 1000000 }
const revision = { type: 4, name: 'revision', description: '一覧・exportで確認した現在の版（更新時に必須）', min_value: 1 }
const command = (name, description, options) => ({ type: 1, name, description: '【管理人専用】' + description, default_member_permissions: null, options })
export const managementCommands = [
  command('band-list', '全バンドの一覧・状態・所有者を確認', [text('name', '活動名の部分一致'), { ...text('status', '審査状態'), choices: ['pending','approved','rejected'].map(value => ({name:value,value})) }, page]),
  command('band-users', '登録済みユーザーを名前・IDで検索', [text('name', '名前・ユーザー名・IDの部分一致'), page]),
  command('band-export', '通常編集用JSONを取得（所有者情報は含めない）', [id()]),
  command('band-save', 'JSONから1バンドを通常保存（承認待ち）', [file, {...id(), required:false}, revision]),
  command('band-upload', 'PNGを共通画像保存先へアップロードしURLを取得', [{...file,description:'規定寸法・容量内のPNG'}, {...text('field','画像の種類',true),choices:['ロゴ','アイコン','アー写'].map(value=>({name:value,value}))}]),
  command('event-list', 'ライブ予定一覧（終了済みは既定で非表示）', [text('name','イベント名の部分一致'), text('band','参加・主催バンドの登録ID'), {type:5,name:'ended',description:'終了済みも表示'}, page]),
  command('event-info', 'イベント詳細・編集用JSONを取得', [id()]),
  command('event-save', 'JSONからイベントを追加・更新（即時反映）', [file]),
  command('event-delete', 'イベントを削除（版・明示確認が必要）', [id(),{...revision,required:true},{type:5,name:'confirm',description:'削除する場合はtrue',required:true}]),
]
export const managementCommandNames = managementCommands.map(item => item.name)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
export function parseManagementCommand(data) {
  const definition = managementCommands.find(item => item.name === data.name)
  if (!definition || !Array.isArray(data.options ?? [])) throw Error('MANAGEMENT_INVALID_REQUEST')
  const options = data.options || [], seen = new Set(), values = {}
  for (const option of options) {
    const spec = definition.options.find(item => item.name === option.name)
    if (!spec || seen.has(option.name) || option.type !== spec.type) throw Error('MANAGEMENT_INVALID_REQUEST')
    seen.add(option.name); values[option.name] = option.value
    if (spec.type === 3 && (typeof option.value !== 'string' || !option.value.trim() || option.value.length > spec.max_length)) throw Error('MANAGEMENT_INVALID_REQUEST')
    if (spec.type === 4 && (!Number.isSafeInteger(option.value) || option.value < spec.min_value || spec.max_value && option.value > spec.max_value)) throw Error('MANAGEMENT_INVALID_REQUEST')
    if (spec.type === 5 && typeof option.value !== 'boolean') throw Error('MANAGEMENT_INVALID_REQUEST')
    if (spec.choices && !spec.choices.some(choice=>choice.value===option.value)) throw Error('MANAGEMENT_INVALID_REQUEST')
  }
  if (definition.options.some(option => option.required && !seen.has(option.name))) throw Error('MANAGEMENT_INVALID_REQUEST')
  if (values.id !== undefined && !uuid(values.id) || values.band !== undefined && !uuid(values.band)) throw Error('MANAGEMENT_INVALID_REQUEST')
  const kind = {'band-list':'list','band-users':'users','band-export':'export','band-save':'save','band-upload':'upload','event-list':'event_list','event-info':'event_info','event-save':'event_save','event-delete':'event_delete'}[data.name]
  const result = { kind: 'admin_manage_' + kind }
  if(data.name==='band-save' && ((values.id===undefined)!==(values.revision===undefined)))throw Error('MANAGEMENT_REVISION_REQUIRED')
  if(data.name==='event-delete'){if(values.confirm!==true)throw Error('MANAGEMENT_CONFIRM_REQUIRED');result.confirm=true}
  if(values.id)result[data.name.startsWith('event-')?'eventId':'registrationId']=values.id.toLowerCase()
  if(values.revision!==undefined)result.revision=values.revision
  if(values.band)result.bandId=values.band.toLowerCase()
  if(values.ended!==undefined)result.includeEnded=values.ended
  if(values.file!==undefined){
    const attachment=data.resolved?.attachments?.[values.file],image=data.name==='band-upload'
    const maximum=image?IMAGE_LIMITS[values.field]?.bytes:65536
    if(!attachment||attachment.id!==values.file||typeof attachment.url!=='string'||!Number.isSafeInteger(attachment.size)||attachment.size<1||attachment.size>maximum||!(image?/\.png$/i:/\.json$/i).test(attachment.filename||''))throw Error('MANAGEMENT_ATTACHMENT_INVALID')
    result.attachment={url:attachment.url};result.maximumBytes=maximum
  }
  for (const key of ['name','status','page','field']) if(values[key]!==undefined)result[key]=values[key]
  return result
}
export async function managementRequestId(interactionId, kind) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('discord-management:'+interactionId+':'+kind)))
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('').slice(0,32)
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20)
}
export async function prepareManagementCommand(command, fetchImpl, readBytes) {
  if (!command.attachment) return
  const bytes=await readBytes(command.attachment,fetchImpl,command.maximumBytes)
  delete command.attachment;delete command.maximumBytes
  if(command.kind==='admin_manage_upload'){
    if(bytes.length<24||[137,80,78,71,13,10,26,10].some((value,index)=>bytes[index]!==value))throw Error('INVALID_IMAGE')
    command.bytes=bytes.length;command.uploadId=command.requestId
    command.sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')
    const parts=[];for(let at=0;at<bytes.length;at+=16384)parts.push(String.fromCharCode(...bytes.subarray(at,at+16384)))
    command.uploadBody=btoa(parts.join(''));return
  }
  let value
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''))}catch{throw Error('INVALID_IMPORT')}
  if(command.kind==='admin_manage_save'){
    if(Array.isArray(value)&&value.length===1)value=value[0]
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_IMPORT')
    command.band=value;command.submissionId=command.requestId
  }else{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_EVENT')
    command.event=value;if(value.id){if(!uuid(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('STALE_EVENT');command.revision=value.revision}
  }
}
