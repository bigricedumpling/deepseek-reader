import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-library-'))
process.env.DOCS_ROOT = root
const { handleApi } = await import('../server/content-api.js')

function request(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { method, url, headers: { 'content-type': 'application/json' }, socket: { remoteAddress: 'test' } })
  return new Promise((resolve) => handleApi(req, {
    statusCode: 200,
    setHeader() {},
    end(data) { resolve(JSON.parse(data)) }
  }, { role: 'owner' }))
}

try {
  const made = await request('POST', '/api/lib', { name: '课堂笔记' })
  assert.equal(made.ok, true)
  assert.equal(made.data.libs.filter((lib) => lib.name === '课堂笔记').length, 1)
  assert.equal(fs.statSync(path.join(root, '课堂笔记')).isDirectory(), true)
  const listed = await request('GET', '/api/libs')
  assert.equal(listed.data.libs.filter((lib) => lib.name === '课堂笔记').length, 1)
  const repeated = await request('POST', '/api/lib', { name: '课堂笔记' })
  assert.equal(repeated.ok, false)

  const {workspace}=await import('../server/storage/workspace.js')
  const repo=workspace(root)
  const registry = repo.getJSON('libraries',{})
  registry.libs.push({ id: 'duplicate', name: '课堂笔记', icon: '' })
  repo.setJSON('libraries',registry)
  const repaired = await request('GET', '/api/libs')
  assert.equal(repaired.data.libs.filter((lib) => lib.name === '课堂笔记').length, 1)
  assert.equal(repo.getJSON('libraries',{}).libs.filter((lib) => lib.name === '课堂笔记').length, 1)
  console.log('新建知识库、重复请求与旧注册表去重均通过')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
