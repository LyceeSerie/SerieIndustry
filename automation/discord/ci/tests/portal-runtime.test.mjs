import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('actual Worker bundle handles OAuth, private editor, CSRF and image stream forwarding in workerd',async()=>{
  const script=buildSync({entryPoints:[fileURLToPath(new URL('../../worker/src/entry.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',loader:{'.html':'text'}}).outputFiles[0].text
  const origin='https://portal.test',uid='666666666666666666';let uploaded=false
  const runtime=new Miniflare(convertV4MiniflareOptions({workers:[{
    name:'portal-runtime',modules:true,compatibilityDate:'2026-11-18',script,
    bindings:{PORTAL_ENABLED:'true',PORTAL_SESSION_SECRET:'runtime-test-secret-'.repeat(4),DISCORD_CLIENT_SECRET:'runtime-client-secret',DISCORD_APPLICATION_ID:'111111111111111111',DISCORD_GUILD_ID:'222222222222222222',DISCORD_CHANNEL_ID:'333333333333333333',GAS_HMAC_SECRET:'runtime-hmac-'.repeat(4),GAS_WEBAPP_URL:'https://script.google.com/macros/s/test/exec'},
    async outboundService(request){
      if(request.url==='https://script.googleusercontent.com/macros/echo?upload=result'){assert.equal(request.method,'GET');assert.equal(await request.text(),'');return Response.json({ok:true,url:'https://drive.google.com/file/d/test/view'})}
      if(request.url==='https://discord.com/api/oauth2/token')return Response.json({access_token:'private-test-token'})
      if(request.url==='https://discord.com/api/users/@me')return Response.json({id:uid})
      if(request.url.endsWith('/member'))return Response.json({roles:[]})
      assert.equal(request.url,'https://script.google.com/macros/s/test/exec')
      const body=await request.json()
      if(body.uploadTicket){assert.equal(body.dataBase64,'image-data');uploaded=true;return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?upload=result'}})}
      const input=JSON.parse(body.payload);assert.equal(input.actorId,uid)
      return Response.json(input.kind==='portal_list'?{ok:true,records:[]}:{ok:true})
    },
  }]}))
  try{
    const start=await runtime.dispatchFetch(origin+'/auth/login',{redirect:'manual'})
    assert.equal(start.status,302)
    const location=new URL(start.headers.get('Location')),oauthCookie=start.headers.get('Set-Cookie').split(';')[0]
    const callback=await runtime.dispatchFetch(origin+'/auth/callback?code=code&state='+location.searchParams.get('state'),{headers:{Cookie:oauthCookie},redirect:'manual'})
    assert.equal(callback.status,302)
    assert.equal(callback.headers.get('Location'),'/auth/complete')
    const pendingCookie=callback.headers.getSetCookie().find(value=>value.startsWith('__Host-vbd_login=')).split(';')[0]
    const complete=await runtime.dispatchFetch(origin+'/auth/complete',{headers:{Cookie:pendingCookie},redirect:'manual'})
    assert.equal(complete.status,302)
    const cookie=complete.headers.getSetCookie().find(value=>value.startsWith('__Host-vbd_session=')).split(';')[0]
    const editor=await runtime.dispatchFetch(origin+'/VRCBandDB/register',{headers:{Cookie:cookie}})
    assert.equal(editor.status,200);assert.match(await editor.text(),/registration-app/)
    assert.equal(editor.headers.get('Cache-Control'),'no-store')
    const me=await (await runtime.dispatchFetch(origin+'/api/me',{headers:{Cookie:cookie}})).json()
    assert.equal(me.ok,true);assert.equal(me.records.length,0)
    const input={field:'アイコン',bytes:50,sha256:'a'.repeat(64),uploadId:'11111111-1111-4111-8111-111111111111'}
    const headers={Cookie:cookie,Origin:origin,'X-CSRF-Token':me.csrf,'Content-Type':'application/json'}
    const ticket=await (await runtime.dispatchFetch(origin+'/api/upload-ticket',{method:'POST',headers,body:JSON.stringify(input)})).json()
    assert.equal(ticket.ok,true)
    const upload=await runtime.dispatchFetch(origin+'/api/upload',{method:'POST',headers,body:JSON.stringify({uploadTicket:ticket.ticket,dataBase64:'image-data'})})
    assert.equal(upload.status,200);assert.equal(uploaded,true)
    const blocked=await runtime.dispatchFetch(origin+'/api/save',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:'{}'})
    assert.equal((await blocked.json()).code,'CSRF_REJECTED')
  }finally{await runtime.dispose()}
})
