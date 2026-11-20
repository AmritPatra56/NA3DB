import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,            // always this port
    strictPort: true,      // if it's busy, stop with an error instead of moving
    proxy: {
      "/api": "http://localhost:4000",
      "/assets": "http://localhost:4000",
      "/style.css": "http://localhost:4000",
    },
  },
})
