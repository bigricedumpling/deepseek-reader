import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: here,
  publicDir: path.resolve(here, '../public'),
  plugins: [vue()],
  resolve: {
    alias: {
      '@app': path.resolve(here, '../src')
    }
  },
  server: {
    port: 8092,
    strictPort: true,
    host: '127.0.0.1',
    open: false
  },
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
    reportCompressedSize: false
  }
})
