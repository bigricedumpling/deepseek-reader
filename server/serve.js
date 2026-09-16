/**
 * 分享服务器：把打包好的前端 + 同一套 /api 一起端出去。
 *
 * 本地测试就靠它 —— 起一个进程扮演"别人"：
 *
 *   npm run share:local     # 只读访客模式，8091 端口，打开就是别人看到的样子
 *   npm run share:owner     # 同一个端口，但身份是我（用来验"打包后的前端"有没有问题）
 *
 * 上云时同一份代码直接跑在服务器上，前面挂 nginx（HTTPS、域名、可选的口令），
 * 到那时把本机直连算"我"的规则去掉即可（见 share.js 的 roleOf）。
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi, share, DOCS_ROOT } from './content-api.js'
import { roleOf } from './share.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, '..', 'dist')
const PORT = Number(process.env.PORT || 8091)
const args = process.argv.slice(2)
const forceGuest = args.includes('--guest')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8'
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('没有 dist/ —— 先跑一次：npm run build')
  process.exit(1)
}

/** 从 cookie 里取 token（页面首次带 ?token=... 进来时由这里种下） */
function cookieToken(req) {
  const raw = req.headers.cookie || ''
  const hit = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith('reader_token='))
  return hit ? decodeURIComponent(hit.slice('reader_token='.length)) : ''
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')

  if (url.pathname.startsWith('/api')) {
    // 链接里的 token 种进 cookie：之后页面里的 /api 调用就自带身份了
    const fromQuery = url.searchParams.get('token')
    if (fromQuery) {
      res.setHeader('Set-Cookie', 'reader_token=' + encodeURIComponent(fromQuery) + '; Path=/; HttpOnly; SameSite=Lax')
    }
    return handleApi(req, res, { role: roleOf(req, url, share, { forceGuest }) })
  }

  // 知识库清单：每次都现读 public/kb.json，改完刷新页面就生效（不用重新构建）
  if (url.pathname === '/kb.json') {
    try {
      const body = fs.readFileSync(path.resolve(HERE, '..', 'public', 'kb.json'))
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
      return res.end(body)
    } catch {
      return res.end('{"libs":[]}')
    }
  }

  // 静态文件：dist/ 里没有的路径一律回 index.html（前端自己路由）
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  let file = path.resolve(DIST, '.' + rel)
  if (!file.startsWith(DIST)) return notFound(res)
  // 目录名要补 index.html（比如门户页在 /kb/ 下），补不到再退回应用首页
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) file = path.join(DIST, 'index.html')

  try {
    const body = fs.readFileSync(file)
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      // 别被搜索引擎收录
      'X-Robots-Tag': 'noindex, nofollow'
    })
    res.end(body)
  } catch {
    notFound(res)
  }
})

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('没有这个文件')
}

server.listen(PORT, '127.0.0.1', () => {
  const mode = forceGuest ? '访客（只读）' : '我'
  console.log('分享服务器已启动： http://127.0.0.1:' + PORT + '/   身份：' + mode)
  console.log('文档根目录： ' + DOCS_ROOT)
  if (!forceGuest) {
    console.log('访客链接： http://127.0.0.1:' + PORT + '/?token=' + share.token('guest'))
  }
})
