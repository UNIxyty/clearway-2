import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  // shared/passenger-viewer.jsx (one implementation, two places) sits outside this app and would resolve the
  // repo root's React (18) while this bundle carries its own (19) — two Reacts, and hooks read a null dispatcher.
  // Pin every 'react' import to this app's copy.
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^react$/, replacement: path.join(here, 'node_modules/react') },
      { find: /^react\/jsx-runtime$/, replacement: path.join(here, 'node_modules/react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.join(here, 'node_modules/react/jsx-dev-runtime') },
      { find: /^react-dom$/, replacement: path.join(here, 'node_modules/react-dom') },
    ],
  },
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
