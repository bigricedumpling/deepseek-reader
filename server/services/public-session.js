import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fork, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildPublicSnapshot } from './public-snapshot.js'

export function publicSession(repo, share) {
  let proxy, child, tunnel, port, current, url = '', updated = 0, busy = false, details = {}
  // 快照不能放在应用代码目录内，内容接口会正确拒绝读取那里的文件。
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-public-snapshots-'))
  function executablePath(){
    const candidates=[process.env.READER_CLOUDFLARED,...String(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,process.platform==='win32'?'cloudflared.exe':'cloudflared')),'/opt/homebrew/bin/cloudflared','/usr/local/bin/cloudflared']
    return candidates.find(value=>value&&fs.existsSync(value)&&fs.statSync(value).isFile())
  }
  function status() { return { active: !!url, url, updated, busy, available:!!executablePath(), ...details } }
  function stop() {
    tunnel?.kill(); child?.kill(); proxy?.closeAllConnections(); proxy?.close()
    tunnel = child = proxy = undefined; url = ''; port = undefined
    if (current) fs.rmSync(current, { recursive: true, force: true }); current = undefined
    return status()
  }
  async function replace() {
    fs.mkdirSync(runtime, { recursive: true, mode: 0o700 })
    const root = fs.mkdtempSync(path.join(runtime, 'public-'))
    let next
    try {
      const counts = buildPublicSnapshot(repo, share, root)
      if (!counts.documents) throw Error('还没有公开文档，请先设置公开范围')
      next = fork(fileURLToPath(new URL('../serve.js', import.meta.url)), ['--guest'], {
        env: { ...process.env, DOCS_ROOT: root, PORT: '0', READER_PUBLIC_SNAPSHOT: '1', READER_PASSWORD: '', READER_TOKEN: '' },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc']
      })
      const nextPort = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('快照服务启动超时')), 10000)
        next.once('error', error => { clearTimeout(timer); reject(error) })
        next.once('exit', () => { clearTimeout(timer); reject(Error('快照服务启动失败')) })
        next.once('message', message => { clearTimeout(timer); message.port ? resolve(message.port) : reject(Error('快照端口无效')) })
      })
      const previous = child, previousRoot = current
      child = next; current = root; port = nextPort; details = counts; updated = Date.now()
      previous?.kill()
      if (previousRoot) fs.rmSync(previousRoot, { recursive: true, force: true })
    } catch (error) { next?.kill(); fs.rmSync(root, { recursive: true, force: true }); throw error }
  }
  async function control(action) {
    if (busy) throw Error('正在处理分享，请稍后')
    busy = true
    try {
      if (action === 'stop') return stop()
      if (action === 'update') { if (!url) throw Error('请先开启分享'); await replace(); return status() }
      if (action !== 'start') throw Error('无效的分享操作')
      if (url) return status()
      const executable = executablePath()
      if (!executable) throw Error('尚未安装 cloudflared，安装后即可开启临时分享')
      await replace()
      proxy = http.createServer((req, res) => {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); res.end('Read only'); return }
        const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: { accept: req.headers.accept || '*/*' } }, incoming => {
          res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res)
        })
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('Snapshot unavailable') })
        res.on('close', () => upstream.destroy()); upstream.end()
      })
      await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve) })
      tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + proxy.address().port], { stdio: ['ignore', 'ignore', 'pipe'] })
      url = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('公网连接超时，请检查网络后重试')), 35000)
        let output = ''
        tunnel.stderr.on('data', chunk => {
          output = (output + chunk).slice(-12000)
          const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
          if (match) { clearTimeout(timer); resolve(match[0] + '/onlyread/') }
        })
        tunnel.once('error', error => { clearTimeout(timer); reject(error) })
        tunnel.once('exit', () => { clearTimeout(timer); reject(Error('公网连接已结束')); stop() })
      })
      return status()
    } catch (error) { if (action === 'start') stop(); throw error }
    finally { busy = false }
  }
  process.once('exit', () => { tunnel?.kill(); child?.kill(); fs.rmSync(runtime, { recursive: true, force: true }) })
  return { status, control }
}
