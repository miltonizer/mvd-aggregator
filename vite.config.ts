import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mvd_aggregator/',
  server: {
    port: 5173,
    proxy: {
      '/mvd_aggregator/api': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace('/mvd_aggregator', ''),
      },
    },
  },
  build: {
    outDir: 'dist/client',
  },
})
