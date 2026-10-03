import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
const { startManagedServer } = await import(process.env.READER_TEST_RUNTIME
  ? pathToFileURL(path.resolve(process.env.READER_TEST_RUNTIME, '..', 'managed-server.js')).href
  : new URL('../plugins/reader-workspace/managed-server.js', import.meta.url).href)
import { readerDataDirectory } from '../plugins/reader-workspace/platform.js'
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-lifecycle-'))
const managers = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  for (let i = 0; i < 150; i++) { if (check()) return; await delay(100) }
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
  fs.cpSync(new URL('../server', import.meta.url), path.join(options.runtimeDirectory, 'server'), { recursive: true })
  }
  fs.mkdirSync(options.dataDirectory, { recursive: true })
  fs.writeFileSync(path.join(options.dataDirectory, 'keep.md'), '# Keep me')
  const first = start()
  await until(() => first.status.state === 'ready')
  const url = first.status.url
  assert.equal((await (await fetch(url + 'api/instance')).json()).data.product, 'reader')
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
  console.log('PASS: platform paths, real server startup, restart origin, shared ownership, port collision and file preservation')
} finally {
  managers.forEach(manager => manager.stop())
  if (blocker) await new Promise(resolve => blocker.close(resolve))
  await delay(300)
  fs.rmSync(temporary, { recursive: true, force: true })
}
