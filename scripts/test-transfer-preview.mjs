import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-transfer-'))
process.env.DOCS_ROOT = root
process.env.READER_PASSWORD = 'test-only'
const { handleApi } = await import('../server/content-api.js')
const { workspace } = await import('../server/storage/workspace.js')
const repo = workspace(root)

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
  const preview = await ok('POST', '/workspace-preview', {
    reference: '/workspaces/one/note.md', title: 'note.md', content: '# Note\n![image](./a.png)',
    assets: [{ reference: './a.png', mime: 'image/png', base64: png }]
  })
  await ok('POST', '/workspace-preview', {
    reference: '/workspaces/one/note.md', title: 'note.md', content: '# Note revised\n![image](./a.png)',
    assets: [{ reference: './a.png', mime: 'image/png', base64: png }]
  })
  assert.equal((await ok('GET', '/workspace-previews')).length, 1)
  assert.match((await ok('GET', '/workspace-preview?id=' + preview.id)).content, /workspace-preview-asset/)
  assert.equal((await call('GET', '/workspace-preview?id=' + preview.id, null, 'guest')).status, 403)
  await ok('PUT', '/workspace-preview/archive', { id: preview.id, archived: true })
  assert.equal((await ok('GET', '/workspace-previews')).length, 0)
  assert.equal((await ok('GET', '/workspace-previews?archived=1')).length, 1)
  await ok('PUT', '/workspace-preview/archive', { id: preview.id, archived: false })
  const collected = await ok('POST', '/collect-workspace-preview', { id: preview.id, dir: 'Source', name: 'Saved' })
  assert.equal((await ok('GET', '/workspace-previews')).length, 1)
  assert.match((await ok('GET', '/workspace-preview?id=' + preview.id)).content, /workspace-preview-asset/)
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
  const archived = repo.db.prepare('INSERT INTO workspace_previews (id,reference,title,content,updated,incomplete,archived) VALUES (?,?,?,?,?,0,1)')
  for (let i = 0; i < 500; i++) archived.run(String(i).padStart(32, '0'), '/archived/' + i + '.md', 'Archived', '', 0)
  await ok('POST', '/workspace-preview', { reference: '/workspaces/two/new.md', title: 'new.md', content: '# New' })
  console.log('PASS: temporary preview, deduplication, private collection, assets, cross-library copy/move')
} finally {
  repo.db.close()
  fs.rmSync(root, { recursive: true, force: true })
}
