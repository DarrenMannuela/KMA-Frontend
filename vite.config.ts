import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Uploaded client-item photos live on the Go server (see
      // r.Static("/uploads", "./uploads") in main.go), not as a frontend
      // asset — without this, requests for /uploads/... hit Vite's own
      // static serving instead of being forwarded, and just 404.
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})