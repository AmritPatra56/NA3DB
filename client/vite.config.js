import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Express site the dev server forwards to. API_TARGET lets a second Vite
// point at a spare server while checking a change (default: the :4000 one).
const target = process.env.API_TARGET ?? "http://localhost:4000"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,            // always this port
    strictPort: true,      // if it's busy, stop with an error instead of moving
    proxy: {
      "/api": target,
      "/assets": target,
      "/style.css": target,
    },
  },
})
