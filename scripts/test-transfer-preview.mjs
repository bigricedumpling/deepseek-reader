import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-transfer-'))
process.env.DOCS_ROOT = root
process.env.READER_PASSWORD = 'test-only'
const { handleApi } = await import('../server/content-api.js')

function call(method, url, body, role = 'owner') {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { method, url: '/api' + url, headers: { 'content-type': 'application/json' }, socket: { remoteAddress: 'test' } })
  return new Promise((resolve, reject) => {
    const chunks = []
    const res = new Writable({ write(chunk, _, done) { chunks.push(chunk); done() } })
    res.statusCode = 200
    res.setHeader = () => {}
    res.on('finish', () => { try { resolve({ status: res.statusCode, ...JSON.parse(Buffer.concat(chunks).toString()) }) } catch (error) { reject(error) } })
    handleApi(req, res, { role }).catch(reject)
  })
}
const ok = async (...args) => { const result = await call(...args); assert.equal(result.ok, true, JSON.stringify(result)); return result.data }
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='

try {
  await ok('POST', '/lib', { name: 'Source' })
  await ok('POST', '/lib', { name: 'Target' })
  const collected = await ok('POST', '/import-workspace-doc', {
    dir: 'Source', name: 'Saved', content: '# Note\n![image](./a.png)',
    reference: '/workspaces/one/note.md', workspace: '/workspaces/one',
    assets: [{ reference: './a.png', mime: 'image/png', base64: png }]
  })
  const sources = await ok('GET', '/sources?path=' + encodeURIComponent(collected.file))
  assert.equal(sources.sources[0].reference, '/workspaces/one/note.md')
  const original = fs.readFileSync(path.join(root, collected.file), 'utf8')
  assert.match(original, /\/api\/file\?asset=/)
  assert.equal((await call('GET', '/doc?path=' + encodeURIComponent(collected.file), null, 'guest')).status, 403)
  const metadata = await ok('GET', '/metadata?path=' + encodeURIComponent(collected.file))
  await ok('PUT', '/metadata', { path: collected.file, revision: metadata.revision, meta: { icon: '📘', cover: { type: 'gradient' } } })
  const duplicate = await ok('POST', '/copy/doc', { file: collected.file, dir: 'Target' })
  const copied = fs.readFileSync(path.join(root, duplicate.file), 'utf8')
  assert.notEqual(copied, original)
  assert.match(copied, /\/api\/file\?asset=/)
  assert.equal((await ok('GET', '/metadata?path=' + encodeURIComponent(duplicate.file))).meta.icon, '📘')
  assert.equal((await call('GET', '/doc?path=' + encodeURIComponent(duplicate.file), null, 'guest')).status, 403)
  await ok('POST', '/category', { parent: 'Source', name: 'Folder' })
  await ok('PUT', '/move/doc', { file: collected.file, dir: 'Source/Folder' })
  const copiedFolder = await ok('POST', '/copy/category', { path: 'Source/Folder', toParent: 'Target' })
  assert.equal(fs.existsSync(path.join(root, copiedFolder.path, 'Saved.md')), true)
  assert.equal(fs.existsSync(path.join(root, 'Source/Folder/Saved.md')), true)
  assert.equal((await call('GET', '/tree?lib=Target', null, 'guest')).status, 403)
  console.log('PASS: direct workspace import, source record, assets, private access, cross-library copy/move')
} finally {
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch (error) {
    // Windows can keep a handle on freshly written assets; cleanup should not fail the test.
    console.warn(`WARN: could not remove ${root}: ${error.code || error.message}`)
  }
}
