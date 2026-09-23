import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-readonly-'))
process.env.DOCS_ROOT = root
fs.writeFileSync(path.join(root, 'sample.md'), '# Original\n')

try {
  const { handleApi } = await import('../server/content-api.js')
  async function request(method, url, body, role = 'guest') {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
    req.method = method
    req.url = url
    req.headers = { 'content-type': 'application/json' }
    return new Promise((resolve, reject) => {
      const res = {
        statusCode: 200,
        setHeader() {},
        end(value) { resolve({ status: this.statusCode, json: JSON.parse(value) }) }
      }
      handleApi(req, res, { role }).catch(reject)
    })
  }

  for (const [method, url, body] of [
    ['PUT', '/api/doc', { path: 'sample.md', content: '# Replaced\n' }],
    ['PUT', '/api/order', { parent: '', names: ['sample.md'] }],
    ['POST', '/api/category', { parent: '', name: 'Unexpected' }]
  ]) {
    const result = await request(method, url, body)
    assert.equal(result.status, 403, `${url} must reject writes in onlyread mode`)
  }
  assert.equal(fs.readFileSync(path.join(root, 'sample.md'), 'utf8'), '# Original\n')
  assert.equal(fs.existsSync(path.join(root, '.顺序.json')), false)
  assert.equal(fs.existsSync(path.join(root, 'Unexpected')), false)

  const versionDir = path.join(root, '.版本')
  fs.writeFileSync(versionDir, 'blocked')
  const noBackup = await request('PUT', '/api/doc', { path: 'sample.md', content: '# Replaced\n' }, 'owner')
  assert.equal(noBackup.json.ok, false, 'a failed backup must block the overwrite')
  assert.equal(fs.readFileSync(path.join(root, 'sample.md'), 'utf8'), '# Original\n')
  fs.unlinkSync(versionDir)
  assert.equal((await request('PUT', '/api/doc', { path: 'sample.md', content: '# Replaced\n' }, 'owner')).json.ok, true)
  assert.equal((await request('PUT', '/api/doc', { path: 'sample.md', content: '# Again\n' }, 'owner')).json.ok, true)
  assert.equal(fs.readdirSync(versionDir).length, 2, 'rapid saves must keep both previous versions')

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-outside-'))
  try {
    fs.writeFileSync(path.join(outside, 'secret.md'), '# Outside\n')
    fs.symlinkSync(outside, path.join(root, 'link'))
    const escaped = await request('GET', '/api/doc?path=link%2Fsecret.md', null, 'owner')
    assert.equal(escaped.json.ok, false, 'a symbolic link must not escape the document root')
    const escapedTree = await request('GET', '/api/tree?lib=link', null, 'owner')
    assert.equal(escapedTree.json.ok, false, 'a symbolic link must not be browsed as a library')
    const parentTree = await request('GET', '/api/tree?lib=..', null, 'owner')
    assert.equal(parentTree.json.ok, false, 'parent traversal must not be browsed as a library')
  } finally {
    fs.rmSync(outside, { recursive: true, force: true })
  }
  console.log('只读写入、路径越界和覆盖前备份检查均通过')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
