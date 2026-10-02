import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUNTIME = path.join(HERE, 'runtime')
const DATA = process.env.DSH_READER_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Reader', '知识库')

export function startManagedServer(onChange = () => {}) {
  const status = { state: 'starting', url: '', error: '' }
  let child, timer, existingTimer, stopped = false, restarts = 0
  const publish = (state, url = '', error = '') => {
    Object.assign(status, { state, url, error })
    onChange({ ...status })
  }
  async function existingReader() {
    if (process.env.DSH_READER_FORCE_MANAGED === '1') return false
    try {
      const response = await fetch('http://127.0.0.1:8090/api/me', { signal: AbortSignal.timeout(800) })
      const data = await response.json()
      return response.ok && data?.ok === true && ['owner', 'guest'].includes(data?.data?.role)
    } catch { return false }
  }
  async function start() {
    if (stopped) return
    try {
      // Keep a pre-existing local Reader connected during an upgrade. New
      // installations have no service on 8090 and use the bundled runtime.
      if (await existingReader()) {
        if (stopped) return
        publish('ready', 'http://127.0.0.1:8090/')
        existingTimer = setInterval(async () => {
          if (!stopped && !await existingReader()) { clearInterval(existingTimer); start() }
        }, 10000)
        return
      }
      if (stopped) return
      if (!fs.existsSync(path.join(RUNTIME, 'dist', 'index.html'))) throw Error('安装包缺少 Reader 页面')
      if (!fs.existsSync(path.join(RUNTIME, 'server', 'serve.js'))) throw Error('安装包缺少 Reader 服务')
      fs.mkdirSync(DATA, { recursive: true })
      const runtimeData = path.join(path.dirname(DATA), 'runtime')
      fs.mkdirSync(runtimeData, { recursive: true })
      publish('starting')
      child = spawn(process.execPath, [path.join(RUNTIME, 'server', 'serve.js')], {
        cwd: RUNTIME,
        env: { ...process.env, PORT: '0', DIST_DIR: path.join(RUNTIME, 'dist'), DOCS_ROOT: DATA, READER_RUNTIME_DIR: runtimeData },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      })
      let errors = ''
      child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-2000) })
      child.on('message', message => {
        const port = Number(message?.port)
        if (port > 0 && port <= 65535) { restarts = 0; publish('ready', `http://127.0.0.1:${port}/`) }
      })
      child.on('error', error => publish('error', '', error.message))
      child.on('exit', (code, signal) => {
        child = undefined
        if (stopped) return
        publish('error', '', errors.trim() || `Reader 服务退出（${signal || code}）`)
        timer = setTimeout(start, Math.min(30000, 1000 * 2 ** Math.min(restarts++, 5)))
      })
    } catch (error) { publish('error', '', error.message) }
  }
  start()
  return { status, stop() { stopped = true; clearTimeout(timer); clearInterval(existingTimer); child?.disconnect(); child?.kill() } }
}
