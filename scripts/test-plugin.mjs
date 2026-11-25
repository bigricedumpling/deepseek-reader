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
const plugin = process.env.READER_TEST_PLUGIN || fileURLToPath(new URL('../plugins/reader-workspace/', import.meta.url))
const runtime = process.env.READER_TEST_RUNTIME || fileURLToPath(new URL('../', import.meta.url))
fs.symlinkSync(plugin, installedPlugin, 'junction')

async function startServer(args = []) {
  const server = fork(path.join(runtime, 'server/serve.js'), args, { env, cwd: temp, silent: true })
  processes.push(server)
  exits.push(once(server, 'exit'))
  server.stdout.resume()
  server.stderr.resume()
  const [{ port }] = await once(server, 'message', { signal: AbortSignal.timeout(10000) })
  return 'http://127.0.0.1:' + port
}

function startClient(base, token = '') {
  const bridge = path.join(installedPlugin, 'scripts', 'reader.mjs')
  const client = spawn(process.execPath, [bridge, '--stdio'], {
    cwd: temp, env: { ...env, READER_URL: base, READER_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe']
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

async function verifyMixedLibrarySharing(base, article, imageUrl, imageBytes) {
  const subdir = library + '/归档'
  const page = subdir + '/样例.html'
  const paper = subdir + '/白皮书.pdf'
  const figure = './图%20片.png'
  const basePage = subdir + '/相对基准.html'
  const baseImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4ouMOAALvATjNSkTtAAAAAElFTkSuQmCC', 'base64')
  const baseHtml = '<base href="./images/"><img src="' + figure + '">'
  const pdf = fs.readFileSync(new URL('../demo/产品白皮书.pdf', import.meta.url))
  const outsideImage = '../../未授权/外部.png'
  const html = Buffer.from('<!doctype html><img src="' + figure + '" alt="现场照片"><img src="' + outsideImage + '" alt="外库配图">\n')
  const markdown = Buffer.from([
    '# 测试', '', '![配图](' + imageUrl + ')', '', '![现场照片][figure]', '',
    '[figure]: ' + figure, '[FIGURE]: ./unused.png', ''
  ].join('\r\n'))
  const restrictedFile = '未授权/其他.md'
  fs.mkdirSync(path.join(docs, subdir), { recursive: true })
  fs.mkdirSync(path.join(docs, '未授权'))
  fs.writeFileSync(path.join(docs, restrictedFile), '隔离库中的资料。')
  fs.writeFileSync(path.join(docs, '未授权/外部.png'), imageBytes)
  fs.writeFileSync(path.join(docs, article), markdown)
  fs.writeFileSync(path.join(docs, paper), pdf)
  fs.writeFileSync(path.join(docs, page), html)
  fs.writeFileSync(path.join(docs, basePage), baseHtml)
  fs.mkdirSync(path.join(docs, subdir, 'images'))
  fs.writeFileSync(path.join(docs, subdir, 'images/图 片.png'), baseImage)
  fs.writeFileSync(path.join(docs, subdir, 'unused.png'), baseImage)
  fs.writeFileSync(path.join(docs, subdir, '图 片.png'), imageBytes)
  fs.writeFileSync(path.join(docs, subdir, '未引用.png'), imageBytes)

  const key = await fetch(base + '/api/agent-keys', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'分享测试', scopes:[library], write:false})
  }).then(response => response.json())
  assert(key.ok, key.error)
  const { call } = startClient(base, key.data.token)
  const tree = await call('reader_tree', {lib:library})
  assert.equal(tree.data.complete, true)
  const nested = tree.data.nodes.find(node => node.path === subdir)
  const nodes = [...tree.data.nodes, ...nested.children]
  const id = file => nodes.find(node => node.file === file).id
  const treePage = params => call('reader_tree', {lib:library, limit:1, ...params})
  const paged = []
  let listing = await treePage()
  assert(listing.ok, listing.error)
  const firstPage = listing.data
  while (true) {
    const { files, complete, nextOffset, revision } = listing.data
    assert.equal(files.length, 1)
    assert.equal(complete, true)
    assert(revision)
    assert.equal(revision, firstPage.revision)
    paged.push(...files.map(({path, id}) => ({path, id})))
    if (nextOffset === null) break
    assert.equal(nextOffset, paged.length)
    listing = await treePage({offset:nextOffset, revision})
    assert(listing.ok, listing.error)
  }
  assert.deepEqual(paged.map(file => file.path).sort(), [article, page, basePage, paper].sort())
  assert(paged.every(file => file.id === id(file.path)))
  fs.writeFileSync(path.join(docs, subdir, '新增.md'), '# 新增')
  assert.equal((await treePage({offset:firstPage.nextOffset, revision:firstPage.revision})).code, 'CONFLICT')
  const read = args => call('reader_share_file', args)

  async function verifyBytes(args, mime, bytes) {
    let offset = 0, revision
    const chunks = []
    do {
      const result = await read({...args, offset, ...(revision && {revision})})
      assert(result.ok, result.error)
      const part = result.data
      assert.equal(part.mime.split(';')[0], mime)
      assert.equal(part.offset, offset)
      assert.equal(part.size, bytes.length)
      assert(part.revision)
      if (revision) assert.equal(part.revision, revision)
      revision = part.revision
      const chunk = Buffer.from(part.base64, 'base64')
      if (args.limit) assert(chunk.length <= args.limit)
      chunks.push(chunk)
      offset += chunk.length
      if (offset === bytes.length) assert.equal(part.nextOffset, null)
      else assert(chunk.length > 0 && part.nextOffset === offset)
    } while (offset < bytes.length)
    assert(Buffer.concat(chunks).equals(bytes), 'Shared bytes differ for ' + args.path)
    return chunks.length
  }
  await verifyBytes({path:article, id:id(article)}, 'text/markdown', markdown)
  await verifyBytes({path:article, image:imageUrl}, 'image/png', imageBytes)
  assert(await verifyBytes({path:article, image:figure, limit:7}, 'image/png', imageBytes) > 1)
  assert.equal((await read({path:article, image:'./unused.png'})).code, 'FORBIDDEN')
  await verifyBytes({path:basePage, image:figure}, 'image/png', baseImage)
  fs.writeFileSync(path.join(docs, basePage), baseHtml.replace('./images/', 'https://example.invalid/'))
  assert.equal((await read({path:basePage, image:figure})).code, 'FORBIDDEN')
  await verifyBytes({path:page, id:id(page)}, 'text/html', html)
  await verifyBytes({path:page, image:figure}, 'image/png', imageBytes)
  assert(await verifyBytes({path:paper, id:id(paper)}, 'application/pdf', pdf) > 1)

  assert.equal((await read({path:page, id:id(paper)})).ok, false)
  assert.equal((await read({path:page, image:'./未引用.png'})).ok, false)
  assert.equal((await read({path:page, image:imageUrl})).ok, false)
  assert.equal((await read({path:page, image:outsideImage})).ok, false)
  assert.equal((await read({path:restrictedFile})).ok, false)
  const first = (await read({path:paper})).data
  assert(first.nextOffset > 0)
  assert.equal((await read({path:paper, offset:first.nextOffset})).ok, false)
  fs.appendFileSync(path.join(docs, paper), '\n')
  assert.equal((await read({path:paper, offset:first.nextOffset, revision:first.revision})).ok, false)

  console.log('PASS: scoped stdio shares exact Markdown, HTML, PDF and image bytes; mismatches and changed files are refused')
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
  assert(init.capabilities.prompts)
  const { prompts } = await rpc('prompts/list')
  assert(prompts.some(prompt => prompt.name === 'share_snapshot'))
  const list = await rpc('tools/list')
  assert.equal(list.tools.length, 15)
  assert.equal(list.tools.find(tool => tool.name === 'reader_share_file').annotations.readOnlyHint, true)
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
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOHO6pEAAAAASUVORK5CYII='
  const image = await call('reader_upload_image', { path: first.data.file, mime: 'image/png',
    data: png, requestId: 'mcp-image' })
  assert(image.data.url)
  const renamed = await call('reader_rename', { id, name: '已改名', requestId: 'mcp-rename' })
  const destination = library + '/归档'
  fs.mkdirSync(path.join(docs, destination))
  const moved = await call('reader_move', { file: renamed.data.file, dir: destination, requestId: 'mcp-move' })
  assert.equal(moved.data.file, destination + '/已改名.md')
  assert.equal((await call('reader_read', { id })).data.content, content)
  assert.equal((await call('reader_metadata', { id })).data.meta.description, '示例说明')
  await verifyMixedLibrarySharing(base, moved.data.file, image.data.url, Buffer.from(png, 'base64'))
  for (const target of [library, moved.data.file]) {
    const visibility = await fetch(base + '/api/access', {
      method:'PUT', headers:{'content-type':'application/json'},
      body:JSON.stringify({path:target, shared:true})
    }).then(response => response.json())
    assert(visibility.ok, visibility.error)
  }
  const guestBase = await startServer(['--guest'])
  const query = new URLSearchParams({path:moved.data.file})
  assert((await (await fetch(guestBase + '/api/doc?' + query)).json()).ok, 'fixture must be readable by a guest')
  assert.equal((await (await fetch(guestBase + '/api/share-file?' + query)).json()).ok, false)
  const guestClient = startClient(guestBase)
  assert.equal((await guestClient.call('reader_share_file', {path:moved.data.file})).ok, false)
  const guest = await guestClient.call('reader_create', { ...create, name: '访客', requestId: 'guest' })
  assert.equal(guest.ok, false)
  assert.equal(fs.existsSync(path.join(docs, library, '访客.md')), false)
  for (const args of [{scope:'library', target:library}, {scope:'document', target:library + '/摘录.md', id:'sample-id'}]) {
    const { messages } = await rpc('prompts/get', {name:'share_snapshot', arguments:args})
    assert.equal(messages[0].role, 'user')
    assert(messages[0].content.text.includes('reader_share_file'))
    assert(messages[0].content.text.includes(JSON.stringify(args.target)))
    assert.equal(messages[0].content.text.includes('sample-id'), args.scope === 'document')
  }
  console.log('PASS: all 15 tools over stdio, stable ID after move, safe retries, revision conflict, attribution and guest refusal')
} finally {
  for (const child of processes) child.kill()
  await Promise.allSettled(exits)
  fs.rmSync(temp, { recursive: true, force: true })
}
