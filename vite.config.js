import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/simple-websocket-chat/',
  server: {
    port: 5174,
    open: true
  }
})
