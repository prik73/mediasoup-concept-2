import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 5173,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../backend/ssl/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../backend/ssl/cert.pem'))
    },
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