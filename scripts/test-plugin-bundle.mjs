import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../plugins/reader-workspace/index.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'typocket-bundle-'))
const data = path.join(root, 'documents')
await fs.mkdir(data)
const unrelated = path.join(root, 'other-workspace')
await fs.mkdir(unrelated)
const endpoint = 'http://127.0.0.1:1/'
const envKeys = ['READER_URL', 'READER_TOKEN', 'DOCS_ROOT']
const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
const originalFetch = globalThis.fetch
const identity = createHash('sha256').update(data).digest('hex').slice(0, 24)
const execution = { agent: { session: {} }, callId: 'test-call', signal: new AbortController().signal }
let policy = { mode: 'read-only', workspaceRoot: root }
let decision = 'denied'
let writes = 0
const requests = []
const services = {
  sandboxPolicy: { resolve: () => policy },
  approval: { request: async info => { requests.push(info); return decision } },
}
function register() {
  const tools = new Map()
  apply({
    tools: { register: tool => tools.set(tool.name, tool) },
    effect() {},
    connection: { fetch: { register() {} } },
    get: key => services[key],
  })
  return tools
}
try {
  delete process.env.READER_TOKEN
  process.env.READER_URL = endpoint
  process.env.DOCS_ROOT = data
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    assert.equal(url.origin + '/', endpoint)
    if (url.pathname === '/api/instance') return Response.json({ ok: true, data: {
      product: 'reader', protocol: 1, identity, dataDirectory: data, capabilities: { localAgentWrites: true },
    } })
    if (url.pathname === '/api/me') return Response.json({ ok: true, data: { role: 'owner' } })
    if (url.pathname === '/api/agent-libs') return Response.json({ ok: true, data: { libs: [] } })
    if (url.pathname === '/api/tree') {
      assert.deepEqual(Object.fromEntries(url.searchParams), {lib:'test', limit:'1', offset:'1', revision:'listing'})
      return Response.json({ok:true, data:{files:[{path:'test/Report.pdf', id:'pdf'}], nextOffset:null}})
    }
    if (url.pathname === '/api/share-file') {
      assert.equal(init.method, 'GET')
      assert.equal(url.searchParams.get('path'), 'test/Report.pdf')
      assert.equal(url.searchParams.get('offset'), '24576')
      assert.equal(url.searchParams.get('limit'), '7')
      assert.equal(url.searchParams.get('revision'), 'r1')
      return Response.json({ok:true, data:{nextOffset:null}})
    }
    assert.equal(url.pathname, '/api/doc')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers['x-typocket-client'], 'local-agent')
    writes++
    return Response.json({ ok: true, data: { file: 'test/Example.md' } })
  }
  const tools = register()
  assert.equal(tools.size, 15)
  const shareFile = tools.get('reader_share_file')
  const listing = await tools.get('reader_tree').execute({lib:'test', limit:1, offset:1, revision:'listing'}, execution)
  assert.equal(listing.data.files[0].id, 'pdf')
  const page = {path:'test/Report.pdf', offset:24576, revision:'r1', limit:7}
  assert.equal((await shareFile.execute(page, execution)).data.nextOffset, null)
  const create = tools.get('reader_create')
  assert(create.parameters.required.includes('requestId'))
  assert.equal(create.parameters.additionalProperties, false)
  assert.equal(typeof create.output.render, 'function')
  const args = { dir: 'test', name: 'Example', content: '# Hi', requestId: 'test-create' }
  await assert.rejects(create.execute({ content: '# Hi', requestId: 'x' }, execution), /缺少参数：dir/)
  await assert.rejects(create.execute({ ...args, name: 1 }, execution), /参数.name无效/)

  assert.deepEqual((await tools.get('reader_libraries').execute({}, execution)).data.libs, [])
  await assert.rejects(create.execute(args, execution), /只读/)
  assert.equal(writes, 0)
  policy = { mode: 'workspace-write', workspaceRoot: unrelated }
  await assert.rejects(create.execute(args, execution), /未获 DSH 授权/)
  assert.equal(writes, 0)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].callId, execution.callId)
  assert.equal(requests[0].toolName, 'reader_create')
  assert.equal(requests[0].agent, execution.agent)

  decision = 'allowed-once'
  assert((await create.execute(args, execution)).ok)
  assert.equal(writes, 1)
  policy = { mode: 'workspace-write', workspaceRoot: root }
  assert((await create.execute(args, execution)).ok)
  assert.equal(writes, 2)
  assert.equal(requests.length, 2, 'in-workspace writes should not prompt')
  const headless = { ...execution, agent: undefined }
  await assert.rejects(create.execute(args, headless), /DSH Agent/)
  assert.equal(writes, 2)
  process.env.READER_TOKEN = 'fixture-only'
  assert.equal(register().size, 15)
  policy = { mode: 'read-only', workspaceRoot: root }
  await assert.rejects(create.execute(args, execution), /只读/)
  console.log('PASS: tokenless and scoped DSH tool discovery, session policies and per-call approval')
} finally {
  globalThis.fetch = originalFetch
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key]
    else process.env[key] = previous[key]
  }
  await fs.rm(root, { recursive: true, force: true })
}
