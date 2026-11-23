export function logoLayout(value) {
  const choices={'アー写に重ねる 左上':'top-left','アー写に重ねる 左下':'bottom-left','アー写に重ねる 右上':'top-right','アー写に重ねる 右下':'bottom-right'}
  return choices[String(value||'').trim().replace(/\s+/gu,' ')]||'separate'
}
export function bandImage(value,{localPreview=false}={}) {
  const source=String(value||'').trim()
  if(localPreview&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source))return {source,url:source}
  try{
    const url=new URL(source)
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null
    if(url.hostname==='drive.google.com'){
      const id=url.searchParams.get('id')||url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]
      if(!id||!/^[-\w]+$/.test(id))return null
      return {source,url:`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`}
    }
    return {source,url:source}
  }catch{return null}
}
export const validReading=value=>/^[\p{Script=Hiragana}\u3099\u309aー\s]*$/u.test(String(value||''))
export const platformLabel=value=>value==='音源/動画のみ'?'音源/動画':value
export const validEnglish=value=>/^[\p{Script=Latin}0-9\p{P}\p{S}\p{M}\s]*$/u.test(String(value||''))
export function splitNamedLink(value){
  const text=String(value||'').trim()
  if(/^https?:\/\//i.test(text))return {title:'',url:text}
  const match=/^([^:：]+)[:：]\s*(.*)$/u.exec(text)
  return match?{title:match[1].trim(),url:match[2].trim()}:{title:'',url:text}
}
export const joinNamedLink=(title,url)=>String(title||'').trim()?`${String(title).trim()}:${String(url||'').trim()}`:String(url||'').trim()
