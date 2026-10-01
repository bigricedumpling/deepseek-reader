import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-plugin-'))
process.env.DOCS_ROOT = root
process.env.READER_PASSWORD = 'temporary-plugin-test'
const { handleApi } = await import('../server/content-api.js')
const { workspace } = await import('../server/storage/workspace.js')
const { callTool } = await import('../plugins/reader-workspace/scripts/reader.mjs')
const repo = workspace(root)

function owner(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { method, url, headers: { 'content-type': 'application/json' }, socket: { remoteAddress: 'test' } })
  return new Promise((resolve, reject) => {
    const chunks = []
    const res = new Writable({ write(chunk, _, done) { chunks.push(chunk); done() } })
    res.statusCode = 200
    res.setHeader = () => {}
    res.on('finish', () => resolve({ status: res.statusCode, ...JSON.parse(Buffer.concat(chunks).toString()) }))
    handleApi(req, res, { role: 'owner' }).catch(reject)
  })
}

try {
  assert.equal((await owner('POST', '/api/lib', { name: 'Course' })).ok, true)
  assert.equal((await owner('POST', '/api/lib', { name: 'Notes' })).ok, true)
  assert.equal((await owner('POST', '/api/lib', { name: 'Private' })).ok, true)
  const issued = await owner('POST', '/api/agent-keys', { name: 'plugin test', scopes: ['Course', 'Notes'], write: true })
  process.env.READER_TOKEN = issued.data.token
  process.env.READER_URL = 'http://127.0.0.1:8090'
  // Route the adapter's fetch through the real API handler; the sandbox need not bind a port.
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input)
    const req = Readable.from(init.body ? [Buffer.from(init.body)] : [])
    Object.assign(req, { method: init.method || 'GET', url: url.pathname + url.search, headers: init.headers || {}, socket: { remoteAddress: 'test' } })
    return new Promise((resolve, reject) => {
      const chunks = []
      const res = new Writable({ write(chunk, _, done) { chunks.push(chunk); done() } })
      res.statusCode = 200
      res.setHeader = () => {}
      res.on('finish', () => resolve({ status: res.statusCode, json: async () => JSON.parse(Buffer.concat(chunks).toString()) }))
      handleApi(req, res, { role: 'guest' }).catch(reject)
    })
  }

  const libraries = await callTool('reader_libraries')
  assert.deepEqual(libraries.data.libs.map(x => x.name), ['Course', 'Notes'])
  assert.equal((await callTool('reader_tree', { lib: 'Private' })).ok, false)
  assert.equal((await callTool('reader_create', { dir: 'Notes', name: 'Second workspace', content: '# Note\n', requestId: 'second-note' })).ok, true)

  const created = await callTool('reader_create', {
    dir: 'Course', name: 'Lesson', content: '# Lesson\n', requestId: 'create-lesson',
    source: { kind: 'conversation', workspace: 'Another project', reference: 'session:123' }
  })
  assert.equal(created.ok, true)
  assert.equal(created.data.id.length > 0, true)
  assert.match(created.data.url, /\/doc\/Course\/Lesson\?lib=Course$/)
  const read = await callTool('reader_read', { id: created.data.id })
  assert.equal(read.data.content, '# Lesson\n')
  assert.equal((await callTool('reader_sources', { id: created.data.id })).data.sources[0].workspace, 'Another project')
  assert.equal((await callTool('reader_update', { id: created.data.id, content: '# Edited\n', revision: read.data.revision, requestId: 'update-lesson' })).ok, true)
  assert.equal((await callTool('reader_update', { id: created.data.id, content: '# Stale\n', revision: read.data.revision, requestId: 'stale-update' })).code, 'CONFLICT')
  assert.equal((await callTool('reader_create', { dir: 'Private', name: 'Denied', content: '', requestId: 'denied' })).ok, false)
  assert.equal(fs.existsSync(path.join(root, 'Private', 'Denied.md')), false)
  console.log('PASS: plugin library scope, cross-workspace source, create/link/read/update/conflict')
} finally {
  repo.db.close()
  fs.rmSync(root, { recursive: true, force: true })
}
