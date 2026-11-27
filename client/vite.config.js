import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import process from 'node:process'

// API_TARGET points the dev server at another Express (default :4000).
const target = process.env.API_TARGET ?? "http://localhost:4000"

export default defineConfig({
  plugins: [react()],
  // Chunks go in app/: /assets is the site's own fonts and icons.
  build: { assetsDir: "app" },
  server: {
    port: 5173,            // always this port
    strictPort: true,      // if it's busy, stop with an error instead of moving
    // Same isolation headers as Express, for the 3D viewer's SharedArrayBuffer.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/viewer": target,
      "/api": target,
      "/assets": target,
      "/style.css": target,
      "^/structure/[^/]+/(fasta|citation|arcs\\.svg)": target,
    },
  },
})
