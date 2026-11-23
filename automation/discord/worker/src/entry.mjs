import { handleRequest } from './index.mjs'
import { handlePortal } from './portal.mjs'
import { drainNotifications } from './notification-runner.mjs'
import editorHtml from '../generated/registration.html'

export default {
  fetch(request,env,ctx) {
    const path=new URL(request.url).pathname
    if(path==='/VRCBandDB/register'||path==='/VRCBandDB/register/'||path==='/register'||path.startsWith('/auth/')||path.startsWith('/api/')) return handlePortal(request,env,ctx,editorHtml,fetch,drainNotifications)
    return handleRequest(request,env,ctx)
  },
  scheduled(event,env,ctx) { ctx.waitUntil(drainNotifications(env)) },
}
