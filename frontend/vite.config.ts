import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Shared animations are a Vercel function, which the dev server does not
    // run. `node server/dev-server.mjs` serves the same code from memory on
    // 8787; with it stopped, the app simply works on this browser alone.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
