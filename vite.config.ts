import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api/mediastack': {
        target: 'http://api.mediastack.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mediastack/, ''),
      },
    },
  },
})
