import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Express site the dev server forwards to. API_TARGET lets a second Vite
// point at a spare server while checking a change (default: the :4000 one).
const target = process.env.API_TARGET ?? "http://localhost:4000"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The chunks go in app/, not Vite's assets/: /assets is the site's own
  // fonts and icons (public/assets), served by Express.
  build: { assetsDir: "app" },
  server: {
    port: 5173,            // always this port
    strictPort: true,      // if it's busy, stop with an error instead of moving
    // Moorhen's coot build needs SharedArrayBuffer, which only a
    // cross-origin-isolated page gets, and the 3D frame is isolated only when
    // the page round it is (server.js isolate). Express sends these on
    // /structure/:id alone; here every page moves to a structure in place, so
    // the first page loaded must already carry them. Everything a page loads
    // is its own, so require-corp blocks nothing.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      // The 3D viewer's build, with Express's own headers (it adds CORP).
      "/viewer": target,
      "/api": target,
      "/assets": target,
      "/style.css": target,
      // The files the page offers (FASTA, a citation); the page itself stays React's.
      "^/structure/[^/]+/(fasta|citation)": target,
    },
  },
})
