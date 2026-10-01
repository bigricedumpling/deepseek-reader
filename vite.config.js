import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'
import contentApi from './server/content-api.js'
import fs from 'node:fs'

/*
 * 把站点图标内联成 data URI。
 *
 * 为什么不让浏览器去取那张 svg：
 *   1. 两个站点同域名不同子路径，图标路径必须按实例给，写错了就是一张裂图；
 *   2. 更要紧的是缓存 —— 早先裂过一次之后，浏览器（尤其微信内置浏览器）
 *      会把那次失败结果留着，同一条 URL 不再重试，改服务端也没用；
 *      换 URL 能绕，但要看它肯不肯发那次请求。
 *   data URI 不产生网络请求，上面两件事就都不存在了。
 *
 * 图标只有 1–4 KB，编码后也不过 5 KB，内联代价可以忽略。
 */
function inlineIcon() {
  const file = process.env.VITE_SITE_ICON_FILE
  if (!file) return { name: 'inline-icon-noop' }
  const svg = fs.readFileSync(file)
  const uri = 'data:image/svg+xml;base64,' + svg.toString('base64')
  return {
    name: 'inline-icon',
    transform(code, id) {
      if (!id.match(/.(vue|js|ts)$/)) return
      if (!code.includes('__SITE_ICON__')) return
      return { code: code.split('__SITE_ICON__').join(uri), map: null }
    },
    transformIndexHtml(html) {
      /*
       * 路径可能是 /favicon.svg，也可能已经被 base 加了前缀（/deepseek/demo/favicon.svg），
       * 所以匹配「斜杠 + 任意前缀 + favicon.svg」，不要写死根路径。
       */
      return html.replace(/href="[^"]*\/favicon\.svg"/g, 'href="' + uri + '"')
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [inlineIcon(), contentApi(), tailwindcss(), vue()],
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
        '**/.回收站/**', '**/.reader/**', '**/.runtime/**'
      ]
    }
  },
  // 这三个都是动态引入或体积大的包，提前预构建，避免用着用着触发重新优化导致整页失效
  optimizeDeps: {
    include: ['mermaid', '@milkdown/crepe', '@phosphor-icons/vue', 'markdown-it']
  },
  build: {
    outDir: 'dist',
    // 阅读器、知识库首页与 DSH 工作区 Markdown 预览。
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        kb: path.resolve(__dirname, 'kb/index.html'),
        preview: path.resolve(__dirname, 'preview/index.html')
      }
    },
    emptyOutDir: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000
  }
})
