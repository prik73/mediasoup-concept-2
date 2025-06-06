import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    https: true,
    proxy: {
      '/socket.io': {
        target: 'https://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true
  }
})