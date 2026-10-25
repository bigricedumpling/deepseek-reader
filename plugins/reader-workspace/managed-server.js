import { BRAND_NAME } from './brand.js'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readerDataDirectory } from './platform.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const readJSON = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }

/** Stable origin per data directory; never silently substitute another library. */
export function startManagedServer(onChange = () => {}, options = {}) {
  const data = path.resolve(options.dataDirectory || readerDataDirectory())
  const runtime = options.runtimeDirectory || path.join(HERE, 'runtime')
  const identity = createHash('sha256').update(data).digest('hex').slice(0, 24)
  const runtimeData = path.join(path.dirname(data), 'runtime', identity)
  const bindingFile = path.join(runtimeData, 'service.json')
  const lockFile = path.join(runtimeData, 'service.lock')
  const status = { state: 'starting', url: '', error: '', dataDirectory: data }
  let child, timer, startupTimer, stopped = false, ownsLock = false, failures = 0
  const publish = (state, url = '', error = '') => {
    Object.assign(status, { state, url, error }); onChange({ ...status })
  }
  const later = delay => { clearTimeout(timer); if (!stopped) timer = setTimeout(start, delay) }
  function unlock() {
    if (ownsLock && readJSON(lockFile)?.pid === process.pid) fs.rmSync(lockFile, { force: true })
    ownsLock = false
  }
  function bind(value) {
    const temporary = bindingFile + '.' + process.pid + '.tmp'
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 })
    fs.renameSync(temporary, bindingFile)
  }
  async function probe(url, legacy = false) {
    try {
      const response = await fetch(new URL(legacy ? 'api/me' : 'api/instance', url), { signal: AbortSignal.timeout(1000) })
      const result = await response.json()
      return response.ok && result.ok && (legacy ? ['owner', 'guest'].includes(result.data?.role)
        : result.data?.product === 'reader' && result.data?.protocol === 1 && result.data?.identity === identity)
    } catch { return false }
  }
  async function start() {
    if (stopped || child) return
    try {
      fs.mkdirSync(runtimeData, { recursive: true, mode: 0o700 })
      let binding = readJSON(bindingFile)
      if (!binding && fs.existsSync(bindingFile)) throw Error(`${BRAND_NAME} 服务记录无法读取，已保留原文件；请修复记录后重试`)
      // Pin legacy connections. Disconnection must not open a different empty library.
      if (!binding && !options.forceManaged && process.env.DSH_READER_FORCE_MANAGED !== '1'
        && await probe('http://127.0.0.1:8090/', true)) {
        binding = { kind: 'existing', url: 'http://127.0.0.1:8090/' }; bind(binding)
      }
      if (stopped) return
      if (binding?.kind === 'existing') {
        status.dataDirectory = ''
        const connected = await probe(binding.url, true)
        publish(connected ? 'ready' : 'error', binding.url, connected ? ''
          : `已连接的 ${BRAND_NAME} 暂不可用。请启动原服务，或在插件设置中更换连接；原抽屉未迁移。`)
        later(10000); return
      }
      if (binding && (binding.kind !== 'managed' || binding.identity !== identity)) throw Error(`${BRAND_NAME} 服务记录与当前抽屉不匹配，已停止自动连接`)
      const port = Number(binding?.port || 0)
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error(`${BRAND_NAME} 端口记录无效，请检查服务配置`)
      const url = port ? `http://127.0.0.1:${port}/` : ''
      if (url && await probe(url)) { publish('ready', url); later(4000); return }
      if (stopped) return
      try {
        const fd = fs.openSync(lockFile, 'wx', 0o600)
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.closeSync(fd); ownsLock = true
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        const owner = readJSON(lockFile)
        if (owner?.pid && !alive(owner.pid)) fs.rmSync(lockFile, { force: true })
        else if (!owner && Date.now() - fs.statSync(lockFile).mtimeMs > 15000) fs.rmSync(lockFile, { force: true })
        publish('starting', '', `正在等待另一个 ${BRAND_NAME} 实例`); later(1000); return
      }
      if (!fs.existsSync(path.join(runtime, 'dist', 'index.html'))) throw Error(`安装包缺少 ${BRAND_NAME} 页面，请重新安装插件`)
      if (!fs.existsSync(path.join(runtime, 'server', 'serve.js'))) throw Error(`安装包缺少 ${BRAND_NAME} 服务，请重新安装插件`)
      fs.mkdirSync(data, { recursive: true })
      publish('starting')
      child = spawn(process.execPath, [path.join(runtime, 'server', 'serve.js')], {
        cwd: runtime,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), DIST_DIR: path.join(runtime, 'dist'), DOCS_ROOT: data, READER_RUNTIME_DIR: runtimeData },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc']
      })
      let errors = '', ready = false
      startupTimer = setTimeout(() => { errors = `${BRAND_NAME} 启动超时，请重试或查看插件连接设置`; child?.kill() }, 15000)
      child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-2000) })
      child.on('message', message => {
        const actualPort = Number(message?.port)
        if (!Number.isInteger(actualPort) || actualPort < 1 || actualPort > 65535 || stopped) return
        try {
          bind({ kind: 'managed', port: actualPort, identity })
          clearTimeout(startupTimer); ready = true
          publish('ready', `http://127.0.0.1:${actualPort}/`)
        } catch (error) { errors = error.message; child?.kill() }
      })
      let ended = false
      const finish = () => {
        if (ended) return
        ended = true
        clearTimeout(startupTimer); child = undefined; unlock()
        if (stopped) return
        const occupied = errors.includes('EADDRINUSE')
        publish('error', '', occupied ? `${BRAND_NAME} 原端口被其他程序占用。请关闭占用程序后重试；未切换数据目录或端口。` : errors.trim() || `${BRAND_NAME} 服务已停止，正在重试`)
        failures++
        later(occupied || failures > 3 ? 30000 : ready ? 1000 : 2000 * failures)
      }
      child.on('error', error => { errors = error.message; finish() })
      child.on('exit', finish)
    } catch (error) { unlock(); publish('error', '', error.message) }
  }
  start()
  return {
    status,
    stop() {
      stopped = true; clearTimeout(timer); clearTimeout(startupTimer)
      if (child) { if (child.connected) child.disconnect(); child.kill() }
      else unlock()
    }
  }
}
