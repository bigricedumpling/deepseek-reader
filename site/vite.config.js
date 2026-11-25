import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '')
  const siteUrl = (env.VITE_SITE_URL || '').trim().replace(/\/$/, '')
  const ogImage = siteUrl ? `${siteUrl}/og.png` : '/og.png'
  const siteMeta = siteUrl
    ? `<link rel="canonical" href="${siteUrl}/" />\n    <meta property="og:url" content="${siteUrl}/" />`
    : ''

  return {
    root: here,
    publicDir: path.resolve(here, 'public'),
    plugins: [
      vue(),
      {
        name: 'landing-og-image',
        transformIndexHtml(html) {
          return html
            .replace('<!-- site-url-meta -->', siteMeta)
            .replaceAll('%OG_IMAGE%', ogImage)
        }
      }
    ],
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
  }
})
