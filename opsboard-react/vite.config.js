import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5174',
        changeOrigin: true,
      },
    },
  },
  // `vite preview` serves the built dist (what nginx serves) with the same API proxy — the rig's screen checks.
  preview: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5174',
        changeOrigin: true,
      },
    },
  },
})
