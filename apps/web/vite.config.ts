import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      // REST API
      '/api': {
        target: 'http://localhost:6002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Socket.IO (websocket + polling)
      '/socket.io': {
        target: 'http://localhost:6002',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
