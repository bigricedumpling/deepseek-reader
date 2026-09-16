import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'
import contentApi from './server/content-api.js'

export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [contentApi(), tailwindcss(), vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 8090,
    host: '127.0.0.1',
    open: false,
    watch: {
      ignored: [
        // 这些都由接口自己管，不能让 Vite 盯着——一盯就是整页刷新。
        // 尤其是内容结构.json，增删改文档都会写它，不忽略的话每建一篇文档页面就刷一遍。
        '**/内容结构.json',
        // 列宽旁路文件同理：拖一次列宽就写一次，不忽略的话每拖一下整页刷新
        '**/.表宽.json',
        '**/内容/**',
        '**/存档/**',
        '**/附录/**',
        '**/.回收站/**'
      ]
    }
  },
  // 这三个都是动态引入或体积大的包，提前预构建，避免用着用着触发重新优化导致整页失效
  optimizeDeps: {
    include: ['mermaid', '@milkdown/crepe', '@phosphor-icons/vue', 'markdown-it']
  },
  build: {
    outDir: 'dist',
    // 两个入口：阅读器（index.html）与知识库首页（kb/index.html）
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        kb: path.resolve(__dirname, 'kb/index.html')
      }
    },
    emptyOutDir: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000
  }
})
