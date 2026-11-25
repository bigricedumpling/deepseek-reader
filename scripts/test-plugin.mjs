import assert from 'node:assert/strict'
import { fork, spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-stdio-'))
const docs = path.join(temp, 'documents')
const library = '项目 A'
fs.mkdirSync(path.join(docs, library), { recursive: true })
const env = { ...process.env, DOCS_ROOT: docs, PORT: '0', READER_RUNTIME_DIR: path.join(temp, 'runtime'),
  READER_PUBLIC_SNAPSHOT: '0', READER_REQUIRE_LOGIN: '0', READER_TOKEN: '', READER_URL: '' }
const processes = []
const exits = []

// Plugin managers can install via a directory link. Windows directory junctions work without elevation.
const installedPlugin = path.join(temp, 'installed plugin')
fs.symlinkSync(fileURLToPath(new URL('../plugins/reader-workspace/', import.meta.url)), installedPlugin, 'junction')

async function startServer(args = []) {
  const server = fork(new URL('../server/serve.js', import.meta.url), args, { env, cwd: temp, silent: true })
  processes.push(server)
  exits.push(once(server, 'exit'))
  server.stdout.resume()
  server.stderr.resume()
  const [{ port }] = await once(server, 'message', { signal: AbortSignal.timeout(10000) })
  return 'http://127.0.0.1:' + port
}

function startClient(base) {
  const bridge = path.join(installedPlugin, 'scripts', 'reader.mjs')
  const client = spawn(process.execPath, [bridge, '--stdio'], {
    cwd: temp, env: { ...env, READER_URL: base }, stdio: ['pipe', 'pipe', 'pipe']
  })
  processes.push(client)
  exits.push(once(client, 'exit'))
  client.stderr.resume()
  const lines = readline.createInterface({ input: client.stdout })
  let id = 0
  const send = message => client.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
  async function rpc(method, params) {
    const requestId = ++id
    const reply = once(lines, 'line', { signal: AbortSignal.timeout(6000) })
    send({ id: requestId, method, params })
    const [line] = await reply
    const response = JSON.parse(line)
    assert.equal(response.id, requestId)
    assert.equal(response.error, undefined)
    return response.result
  }
  async function call(name, args = {}) {
    const result = await rpc('tools/call', { name, arguments: args })
    const value = JSON.parse(result.content[0].text)
    assert.equal(result.isError, !value.ok)
    return value
  }
  return { rpc, send, call }
}

try {
  const base = await startServer()
  const { rpc, send, call } = startClient(base)
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' }
  })
  assert.equal(init.protocolVersion, '2025-06-18')
  assert.match(init.instructions, /requestId/)
  assert.match(init.instructions, /revision/)
  send({ method: 'notifications/initialized' })
  const list = await rpc('tools/list')
  assert.equal(list.tools.length, 14)
  assert(list.tools.find(tool => tool.name === 'reader_update').inputSchema.required.includes('revision'))
  assert((await call('reader_libraries')).data.libs.some(lib => lib.name === library))

  const create = { dir: library, name: '测试', content: '# 测试\n', requestId: 'mcp-create' }
  const first = await call('reader_create', create)
  assert.equal(first.ok, true, first.error)
  assert.equal((await call('reader_create', create)).data.id, first.data.id)
  const id = first.data.id
  assert.equal(new URL(first.data.url).searchParams.get('lib'), library)
  const read = await call('reader_read', { id })
  const content = '# 测试\n\n修改已保存。\n'
  const update = { id, revision: read.data.revision, content, requestId: 'mcp-update' }
  assert.equal((await call('reader_update', update)).ok, true)
  assert.equal((await call('reader_update', update)).ok, true)
  assert.equal((await call('reader_update', { ...update, requestId: 'stale', content: '旧稿' })).code, 'CONFLICT')
  assert.equal((await call('reader_read', { id })).data.content, content)
  assert.equal(fs.readFileSync(path.join(docs, library, '测试.md'), 'utf8'), content)
  const activity = await (await fetch(base + '/api/activity')).json()
  assert.equal(activity.data.items.length, 2)
  assert(activity.data.items.every(item => item.actorId === 'local' && item.actorKind === 'agent'))
  const tree = await call('reader_tree', { lib: library })
  assert(tree.data.nodes.length > 0)
  const results = await call('reader_search', { lib: library, q: '修改已保存' })
  assert(results.data.hits.some(hit => hit.id === id))
  const version = (await call('reader_history', { id })).data.items[0]
  assert.equal((await call('reader_history', { id, version: version.id })).data.content, create.content)
  const meta = await call('reader_metadata', { id })
  const settings = await call('reader_set_metadata', { id, meta: { description: '示例说明' },
    revision: meta.data.revision, requestId: 'mcp-meta' })
  assert.equal(settings.data.meta.description, '示例说明')
  assert((await call('reader_add_source', { id, source: { kind: 'manual', note: '隔离测试' }, requestId: 'mcp-source' })).ok)
  assert((await call('reader_sources', { id })).data.sources.some(source => source.note === '隔离测试'))
  const image = await call('reader_upload_image', { path: first.data.file, mime: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOHO6pEAAAAASUVORK5CYII=', requestId: 'mcp-image' })
  assert(image.data.url)
  const renamed = await call('reader_rename', { id, name: '已改名', requestId: 'mcp-rename' })
  const destination = library + '/归档'
  fs.mkdirSync(path.join(docs, destination))
  const moved = await call('reader_move', { file: renamed.data.file, dir: destination, requestId: 'mcp-move' })
  assert.equal(moved.data.file, destination + '/已改名.md')
  assert.equal((await call('reader_read', { id })).data.content, content)
  assert.equal((await call('reader_metadata', { id })).data.meta.description, '示例说明')
  const guestBase = await startServer(['--guest'])
  const guest = await startClient(guestBase).call('reader_create', { ...create, name: '访客', requestId: 'guest' })
  assert.equal(guest.ok, false)
  assert.equal(fs.existsSync(path.join(docs, library, '访客.md')), false)
  console.log('PASS: all 14 tools over stdio, stable ID after move, safe retries, revision conflict, attribution and guest refusal')
} finally {
  for (const child of processes) child.kill()
  await Promise.allSettled(exits)
  fs.rmSync(temp, { recursive: true, force: true })
}
