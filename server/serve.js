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
/* 前端产物目录也可以按实例覆盖（独立实例部署在自己的子路径下，base 不同，要单独构建） */
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.resolve(HERE, '..', 'dist')
const PORT = Number(process.env.PORT ?? 8091)
/*
 * 站点标识与清单都可以按实例覆盖，用来跑第二个实例（独立的示例知识库）：
 * 同一个 dist，换标题、图标与 kb.json 就是另一个站点，不必再构建一份。
 * 不设这些变量时行为与以前完全一样。
 */
const SITE_TITLE = process.env.KB_TITLE || ''
const SITE_ICON = process.env.KB_ICON || ''
/*
 * 左上角的名字，写成「主标题|副标题」。
 * 那两行存在 localStorage 里，所以第二个实例要靠一段先行脚本把默认值盖掉 ——
 * 不然它显示的还是主站的名字（不同实例同源的话还会互相覆盖）。
 */
const SITE_BRAND = process.env.KB_BRAND || ''
/*
 * 品牌存 localStorage 的键名。
 *
 * 必须是按实例分开的 —— 两个站点在同一域名下（/deepseek/reader/ 与 /deepseek/demo/），
 * localStorage 是按域名共享的，共用一个键就会互相覆盖：
 * 打开过示例库之后，回主站看到的也是示例库的名字。默认值保持原样，
 * 独立实例用 KB_BRAND_KEY 指到自己的键。
 */
const BRAND_KEY = process.env.KB_BRAND_KEY || 'reader.brand'
const LOGO_KEY = process.env.KB_LOGO_KEY || 'reader.logo'
const args = process.argv.slice(2)
const forceGuest = args.includes('--guest')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
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

  /*
   * 访问日志。
   *
   * 目的是排查「某个浏览器打开分享链接进不去」这类问题 —— 从外面看只能看到一个
   * 403，看不到它实际请求了什么。这里把路径、查询串的有无、UA、cookie 键名记下来，
   * 就能分清是「链接里的 token 没送到」还是「送到了但没认出来」。
   * 不记 token 本身，只记有没有。
   */
  try {
    if (!url.pathname.match(/\.(js|css|png|jpe?g|svg|woff2?|otf|ttf|map)$/)) {
      const hasToken = url.searchParams.has('token')
      const cookieNames = String(req.headers.cookie || '')
        .split(';').map((x) => x.trim().split('=')[0]).filter(Boolean).join(',')
      const line = [
        new Date().toISOString().slice(11, 19),
        req.method,
        url.pathname + (url.search ? '?' + url.search.replace(/token=[^&]*/, 'token=<有>') : ''),
        'token=' + (hasToken ? '有' : '无'),
        'cookie=[' + cookieNames + ']',
        'ua=' + String(req.headers['user-agent'] || '').slice(0, 60),
      ].join(' | ')
      fs.appendFileSync('/tmp/reader-access.log', line + '\n')
    }
  } catch { /* 日志失败不影响请求 */ }

  if (url.pathname.startsWith('/api')) {
    return handleApi(req, res, { role: roleOf(req, url, share, { forceGuest }) })
  }

  // 知识库清单：每次都现读 public/kb.json，改完刷新页面就生效（不用重新构建）
  /*
   * 实例自己的品牌配置。
   *
   * 为什么不放 localStorage：两个站点在同一域名下（/deepseek/reader/ 与 /deepseek/demo/），
   * localStorage 按域名共享 —— 前端一写回就串味；而且前端写回用的键是写死的，
   * 注入的独立键根本读不到，所以「按实例分开键名」也解决不了。
   * 改成服务端按实例给：品牌从哪来由服务端决定。
   */
  if (url.pathname === '/brand.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
    return res.end(JSON.stringify({
      brand: SITE_BRAND ? SITE_BRAND.split('|') : null,
      logo: SITE_ICON || null,
    }))
  }

  if (url.pathname === '/kb.json') {
    try {
      const body = fs.readFileSync(process.env.KB_JSON || path.resolve(HERE, '..', 'public', 'kb.json'))
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
      return res.end(body)
    } catch {
      return res.end('{"libs":[]}')
    }
  }

  /*
   * 图标可换：独立实例有自己的 mark，不想跟主站共用一个。
   *
   * KB_ICON 两种写法都支持：
   *   - 磁盘路径（/data/demo-kb/favicon.svg）→ 直接读这个文件发出去
   *   - 站点内的 URL 路径（/favicon.svg）→ 什么都不做，交给下面的静态文件处理。
   *     独立实例的 dist 里有自己的 favicon.svg，那样发出去的就是它。
   * 早先只当磁盘路径用，传 URL 路径时 readFileSync 直接抛 ENOENT，把进程带崩了。
   */

  if (SITE_ICON && SITE_ICON.startsWith('/') && !fs.existsSync(SITE_ICON) && url.pathname === '/favicon.svg') {
    // URL 路径写法：落到静态文件那里
  } else if (SITE_ICON && url.pathname === '/favicon.svg') {
    try {
      const icon = fs.readFileSync(SITE_ICON)
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' })
      return res.end(icon)
    } catch {
      // 读不到就退回静态文件。一个图标不该把整个进程带走。
    }
  }

  // 静态文件：dist/ 里没有的路径一律回 index.html（前端自己路由）
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    return notFound(res)
  }
  if (rel === '/' || rel === '') rel = '/index.html'
  let file = path.resolve(DIST, '.' + rel)
  const inside = (candidate) => {
    const relative = path.relative(DIST, candidate)
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
  }
  if (!inside(file)) return notFound(res)
  // 目录名要补 index.html（比如门户页在 /kb/ 下），补不到再退回应用首页
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) file = path.join(DIST, 'index.html')

  try {
    // 静态目录里的软链也不能把请求带出构建产物。
    const realRoot = fs.realpathSync(DIST)
    const realFile = fs.realpathSync(file)
    const relative = path.relative(realRoot, realFile)
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return notFound(res)
    let body = fs.readFileSync(file)
    /*
     * 独立实例的标题与品牌在发出去的时候换掉。
     * 不在构建时改，是因为同一个 dist 要服务两个站点 —— 各构建一份的话，
     * 以后每次改前端都得记得构建两次，迟早会漏。
     */
    if (path.basename(file) === "index.html" && (SITE_TITLE || SITE_BRAND || SITE_ICON)) {
      let html = String(body)
      if (SITE_TITLE) html = html.replace(/<title>[^<]*<\/title>/, "<title>" + SITE_TITLE + "</title>")
      /*
       * 先行脚本：在应用挂载之前把品牌写进 localStorage。
       *
       * 两个要点：
       *   1. 键名按实例分开。两个站点在同一域名下（/deepseek/reader/ 与 /deepseek/demo/），
       *      localStorage 按域名共享 —— 共用一个键，打开示例库之后主站的名字也被顶掉。
       *   2. 顺手删掉旧键。早期版本用的是共享键（reader.brand / reader.logo），
       *      已经写进浏览器的值不会自己消失，不删的话那个串味的名字会一直显示。
       */
      const script = [
        "(function(){try{",
        'try{localStorage.removeItem("reader.brand");localStorage.removeItem("reader.logo");}catch(e){}',
        SITE_BRAND
          ? "localStorage.setItem(" + JSON.stringify(BRAND_KEY) + ",JSON.stringify(" + JSON.stringify(SITE_BRAND.split("|")) + "));"
          : "",
        SITE_ICON ? "localStorage.setItem(" + JSON.stringify(LOGO_KEY) + "," + JSON.stringify(SITE_ICON) + ");" : "",
        "}catch(e){}})()",
      ].join("")
      html = html.replace("</head>", "<script>" + script + "<\/script></head>")
      body = Buffer.from(html, "utf-8")
    }
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
  process.send?.({ port: server.address().port })
  console.log('文档工作台已启动：http://127.0.0.1:' + server.address().port + '/')
  console.log('文档根目录：' + DOCS_ROOT)
})

if (process.send) process.once('disconnect', () => server.close(() => process.exit(0)))
