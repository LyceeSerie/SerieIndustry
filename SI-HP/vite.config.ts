import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { registrationPage } from './scripts/build-registration.mjs'

export default defineConfig(({ mode }) => ({
  publicDir: mode === 'test' ? 'test-public' : 'public',
  plugins: [vue(), ...(mode === 'test' ? [{
    name: 'test-registration-preview',
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'VRCBandDB/register/index.html', source: await registrationPage(true) })
      this.emitFile({ type: 'asset', fileName: 'register-preview.html', source: '<!doctype html><meta charset="utf-8"><script>location.replace("/VRCBandDB/register"+location.search)</script><a href="/VRCBandDB/register">バンド登録</a>' })
    },
    configureServer(server) {
      server.middlewares.use('/register-preview.html', (req,res) => {res.statusCode=302;res.setHeader('Location','/VRCBandDB/register'+(req.url?.includes('?')?'?'+req.url.split('?')[1]:''));res.end()})
      server.middlewares.use('/VRCBandDB/register', async (_req, res, next) => { try{res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await registrationPage(true))}catch(error){next(error)} })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req,_res,next)=>{
        if(req.url?.split('?')[0]==='/VRCBandDB/register')req.url=req.url.replace('/VRCBandDB/register','/VRCBandDB/register/index.html')
        next()
      })
    },
  } satisfies Plugin] : [])],

  // 独自ドメイン直下で公開するため必須
  base: '/',

  // dist の出力先（デフォルトだが明示）
  build: {
    outDir: mode === 'test' ? 'dist-test' : 'dist',
    emptyOutDir: true,
  },
}))
