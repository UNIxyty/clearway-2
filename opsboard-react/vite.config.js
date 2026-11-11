import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// The token stylesheets the console injects as strings (components/console/ui.jsx: ?raw) carry the design's block
// comments; a client's bundle must ship none (rig/bundle-sweep.mjs counts them), and since 2026-11-11 the client's
// settings page draws the console's cards. Strip the comments from the raw text at build time.
function rawCssWithoutComments() {
  return { name: 'raw-css-without-comments', enforce: 'post', transform(code, id) { if (!/\.css\?raw$/.test(id)) return null; return { code: code.replace(/\/\*[\s\S]*?\*\//g, ''), map: null }; } };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), rawCssWithoutComments()],
  // No comments in the shipped chunks (2026-11-10): rig/client-allow-check.mjs sweeps what a client's browser downloads
  // and counts block comments as a leak signal; the libraries' license banners are the only ones a production build
  // keeps, and they are not ours to ship.
  esbuild: { legalComments: 'none' },
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
