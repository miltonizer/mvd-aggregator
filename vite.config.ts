import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/mvd_aggregator/',
  server: {
    port: 5173,
    proxy: {
      [`${process.env.VITE_BASE_PATH ?? '/mvd_aggregator/'}api`]: {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(process.env.VITE_BASE_PATH ?? '/mvd_aggregator/', '/'),
      },
    },
  },
  build: {
    outDir: 'dist/client',
  },
})
