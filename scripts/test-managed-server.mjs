import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { stageServer } from './stage-server.mjs'
import path from 'node:path'
import http from 'node:http'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
const entry = process.env.READER_TEST_RUNTIME
  ? path.resolve(process.env.READER_TEST_RUNTIME, '..', 'managed-server.js')
  : fileURLToPath(new URL('../plugins/reader-workspace/managed-server.js', import.meta.url))
const { startManagedServer } = await import(pathToFileURL(entry).href)
import { readerDataDirectory } from '../plugins/reader-workspace/platform.js'
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-lifecycle-'))
const managers = []
const cliProcesses = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await delay(100) }
  throw Error('Service lifecycle timed out: '+JSON.stringify(managers.map(m=>m.status)))
}
const options = { dataDirectory: path.join(temporary, 'documents'), runtimeDirectory: path.join(temporary, 'runtime'), forceManaged: true }
function start() { const manager = startManagedServer(() => {}, options); managers.push(manager); return manager }
let blocker
try {
  assert.equal(readerDataDirectory('darwin', {}, '/Users/test'), '/Users/test/Library/Application Support/Reader/知识库')
  assert.equal(readerDataDirectory('win32', { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' }, 'C:\\Users\\test'), 'C:\\Users\\test\\AppData\\Roaming\\Reader\\知识库')
  assert.equal(readerDataDirectory('linux', { XDG_DATA_HOME: '/custom' }, '/home/test'), '/custom/Reader/知识库')
  if (process.env.READER_TEST_RUNTIME) {
    fs.cpSync(process.env.READER_TEST_RUNTIME, options.runtimeDirectory, { recursive: true })
  } else {
  fs.mkdirSync(path.join(options.runtimeDirectory, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(options.runtimeDirectory, 'dist', 'index.html'), '<html>Reader lifecycle fixture</html>')
  fs.writeFileSync(path.join(options.runtimeDirectory, 'package.json'), '{"type":"module"}')
  await stageServer(path.join(options.runtimeDirectory, 'server'))
  }
  fs.mkdirSync(options.dataDirectory, { recursive: true })
  fs.writeFileSync(path.join(options.dataDirectory, 'keep.md'), '# Keep me')
  const first = start()
  await until(() => first.status.state === 'ready')
  const url = first.status.url
  assert.equal((await (await fetch(url + 'api/instance')).json()).data.product, 'reader')
  // Run the same files an extracted plugin supplies, from a different working directory.
  for (const file of ['managed-server.js', 'brand.js', 'platform.js']) {
    fs.copyFileSync(path.join(path.dirname(entry), file), path.join(temporary, file))
  }
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"module"}')
  const caller = path.join(temporary, 'host working directory')
  fs.mkdirSync(caller)
  const standaloneData = path.join(temporary, 'standalone', '自己的资料')
  const unusedData = path.join(temporary, 'lower-priority')
  const fixtureHome = path.join(temporary, 'host-home')
  const redirectLegacy = path.join(temporary, 'isolated-loopback.mjs')
  // Simulate an existing 8090 backed by the first fixture, without contacting that port on the user's machine.
  fs.writeFileSync(redirectLegacy, `
    import os from 'node:os'
    os.homedir = () => process.env.TEST_CLI_HOME
    const original = globalThis.fetch
    globalThis.fetch = (input, options) => {
      const url = new URL(input)
      if (url.origin === 'http://127.0.0.1:8090') url.port = process.env.TEST_OTHER_PORT
      return original(url, options)
    }
  `)
  function launch(cliData, home = fixtureHome, existingPort = new URL(url).port) {
    const env = { ...process.env, TEST_CLI_HOME: home, XDG_DATA_HOME: home, APPDATA: home,
      DSH_READER_FORCE_MANAGED: '', TEST_OTHER_PORT: existingPort }
    if (cliData) {
      env.DOCS_ROOT = cliData
      env.DSH_READER_DATA_DIR = unusedData
    } else {
      delete env.DOCS_ROOT
      delete env.DSH_READER_DATA_DIR
    }
    const child = spawn(process.execPath, ['--import', pathToFileURL(redirectLegacy).href, path.join(temporary, 'managed-server.js')], {
      cwd: caller, env, stdio: ['ignore', 'pipe', 'pipe']
    })
    const run = { child, done: once(child, 'exit'), output: '', error: '' }
    child.stdout.on('data', chunk => { run.output += chunk })
    child.stderr.on('data', chunk => { run.error += chunk })
    cliProcesses.push(run)
    return run
  }
  const cleanHome = path.join(temporary, 'fresh installation')
  const cleanLaunch = launch(undefined, cleanHome, '0')
  await until(() => cleanLaunch.output.includes('http://') || cleanLaunch.child.exitCode !== null)
  const cleanUrl = cleanLaunch.output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0]
  assert.ok(cleanUrl, cleanLaunch.error)
  const cleanInstance = (await (await fetch(cleanUrl + 'api/instance')).json()).data
  assert.equal(cleanInstance.dataDirectory, readerDataDirectory(process.platform, { APPDATA: cleanHome, XDG_DATA_HOME: cleanHome }, cleanHome))
  cleanLaunch.child.kill('SIGTERM')
  await cleanLaunch.done
  const defaultLaunch = launch()
  await until(() => defaultLaunch.output.includes('http://127.0.0.1:8090/') || defaultLaunch.child.exitCode !== null)
  assert.ok(defaultLaunch.output.includes('http://127.0.0.1:8090/'), defaultLaunch.error)
  defaultLaunch.child.kill('SIGTERM')
  await defaultLaunch.done
  assert.equal((await fetch(url + 'api/instance')).status, 200)
  const cli = launch(standaloneData)
  await until(() => cli.output.includes('http://') || cli.child.exitCode !== null)
  const cliUrl = cli.output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0]
  assert.ok(cliUrl, cli.error)
  assert.notEqual(cliUrl, url)
  assert.equal((await (await fetch(cliUrl + 'api/instance')).json()).data.dataDirectory, standaloneData)
  assert.equal(fs.existsSync(unusedData), false)
  const observer = launch(standaloneData)
  await until(() => observer.output.includes(cliUrl) || observer.child.exitCode !== null)
  assert.ok(observer.output.includes(cliUrl), observer.error)
  observer.child.kill('SIGTERM')
  await observer.done
  assert.equal((await fetch(cliUrl + 'api/instance')).status, 200)
  cli.child.kill('SIGTERM')
  await cli.done
  await until(() => fetch(cliUrl + 'api/instance', { signal: AbortSignal.timeout(400) }).then(() => false, () => true))
  const pinnedData = path.join(temporary, 'other-pinned')
  const pinnedIdentity = createHash('sha256').update(pinnedData).digest('hex').slice(0, 24)
  const pinnedState = path.join(temporary, 'runtime', pinnedIdentity)
  fs.mkdirSync(pinnedState, { recursive: true })
  fs.writeFileSync(path.join(pinnedState, 'service.json'), JSON.stringify({ kind: 'existing', url }))
  const wrongLibrary = launch(pinnedData)
  await until(() => wrongLibrary.child.exitCode !== null)
  assert.equal(wrongLibrary.child.exitCode, 1)
  assert.match(wrongLibrary.error, /资料目录/)
  assert.equal(wrongLibrary.output, '')
  const second = start()
  await until(() => second.status.state === 'ready')
  assert.equal(second.status.url, url, 'two plugin consumers reuse one instance')
  second.stop()
  assert.equal((await fetch(url + 'api/instance')).status, 200, 'stopping a consumer must not kill another owner')
  first.stop()
  await until(() => !fs.readdirSync(path.join(temporary, 'runtime')).some(name => fs.existsSync(path.join(temporary, 'runtime', name, 'service.lock'))))
  const restarted = start()
  await until(() => restarted.status.state === 'ready')
  assert.equal(restarted.status.url, url, 'restart preserves browser origin')
  assert.equal(fs.readFileSync(path.join(options.dataDirectory, 'keep.md'), 'utf8'), '# Keep me')
  restarted.stop()
  await until(() => !fs.readdirSync(path.join(temporary, 'runtime')).some(name => fs.existsSync(path.join(temporary, 'runtime', name, 'service.lock'))))
  blocker = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"data":{"product":"other"}}') })
  await new Promise(resolve => blocker.listen(Number(new URL(url).port), '127.0.0.1', resolve))
  const blocked = start()
  await until(() => blocked.status.state === 'error')
  assert.match(blocked.status.error, /端口/)
  assert.equal(blocked.status.url, '', 'never substitute an unrelated service')
  console.log('PASS: platform paths, standalone CLI, directory selection, foreign binding refusal, real server startup, restart origin, shared ownership, port collision and file preservation')
} finally {
  for (const { child } of cliProcesses) {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
  await Promise.allSettled(cliProcesses.map(run => run.done))
  managers.forEach(manager => manager.stop())
  if (blocker) await new Promise(resolve => blocker.close(resolve))
  await delay(300)
  fs.rmSync(temporary, { recursive: true, force: true })
}
