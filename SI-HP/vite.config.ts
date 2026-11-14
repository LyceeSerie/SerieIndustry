import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  publicDir: mode === 'test' ? 'test-public' : 'public',
  plugins: [vue()],

  // 独自ドメイン直下で公開するため必須
  base: '/',

  // dist の出力先（デフォルトだが明示）
  build: {
    outDir: mode === 'test' ? 'dist-test' : 'dist',
    emptyOutDir: true,
  },
}))
