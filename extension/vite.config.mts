// Pages + service worker build (ES modules). Content scripts are built by build.mjs as IIFEs.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = (process.env.CW_CONSOLE_ORIGIN || "https://clearway.verxyl.com").replace(/\/+$/, "");

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(here, ".."), "~": path.resolve(here, "src") } },
  define: {
    "process.env.NEXT_PUBLIC_AGENT_BASE_URL": JSON.stringify("/agent"),
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
    __CW_CONSOLE_ORIGIN__: JSON.stringify(ORIGIN),
  },
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: false,
    target: "chrome116",
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(here, "src/sidepanel/index.html"),
        offscreen: path.resolve(here, "src/offscreen/index.html"),
        background: path.resolve(here, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (c) => (c.name === "background" ? "background.js" : "assets/[name].js"),
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
