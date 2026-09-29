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
    if(method==='PUT'&&url==='/api/doc'&&!body.revision){const doc=await request('GET','/api/doc?path='+encodeURIComponent(body.path),null,'owner');body={...body,revision:doc.json.data.revision}}
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

  const versionDir = path.join(root, '.reader', 'versions')
  fs.writeFileSync(versionDir, 'blocked')
  const noBackup = await request('PUT', '/api/doc', { path: 'sample.md', content: '# Replaced\n' }, 'owner')
  assert.equal(noBackup.json.ok, false, 'a failed backup must block the overwrite')
  assert.equal(fs.readFileSync(path.join(root, 'sample.md'), 'utf8'), '# Original\n')
  fs.unlinkSync(versionDir)
  assert.equal((await request('PUT', '/api/doc', { path: 'sample.md', content: '# Replaced\n' }, 'owner')).json.ok, true)
  assert.equal((await request('PUT', '/api/doc', { path: 'sample.md', content: '# Again\n' }, 'owner')).json.ok, true)
  assert.equal(fs.readdirSync(versionDir).length, 2, 'rapid saves must keep both previous versions')
  const oldName = '2026-01-01-00-00-00-000--0__sample.md'
  fs.writeFileSync(path.join(versionDir, oldName), '# Older format\n')
  for (let revision = 1; revision <= 3; revision++) {
    assert.equal((await request('PUT', '/api/doc', { path: 'sample.md', content: `# Sample ${revision}\n` }, 'owner')).json.ok, true)
  }
  assert.equal(fs.readdirSync(versionDir).length, 6, 'five indexed versions and the unrelated legacy file remain')
  assert.equal(fs.existsSync(path.join(versionDir, oldName)), true, 'unindexed legacy files must never be silently deleted')

  const longRel = '面试准备/业务面/业务面初步复习_10个需要提前准备的问答.md'
  assert.ok(Buffer.byteLength('2026-09-24-04-02-28-450--0__' + encodeURIComponent(longRel)) > 255,
    'the old backup filename must exceed the filesystem limit')
  const longFile = path.join(root, longRel)
  fs.mkdirSync(path.dirname(longFile), { recursive: true })
  fs.writeFileSync(longFile, '# Original long document\n')
  const existingVersions = new Set(fs.readdirSync(versionDir))
  for (let revision = 1; revision <= 6; revision++) {
    const saved = await request('PUT', '/api/doc', { path: longRel, content: `# Revision ${revision}\n` }, 'owner')
    assert.equal(saved.json.ok, true, `long document revision ${revision} must save`)
  }
  assert.equal(fs.readFileSync(longFile, 'utf8'), '# Revision 6\n')
  const longVersions = fs.readdirSync(versionDir).filter((name) => !existingVersions.has(name))
  assert.equal(longVersions.length, 6, 'all six previous versions remain below the 100-version limit')
  assert.ok(longVersions.every((name) => Buffer.byteLength(name) <= 255), 'backup filenames must stay below the filesystem limit')
  assert.deepEqual(longVersions.map((name) => fs.readFileSync(path.join(versionDir, name), 'utf8')).sort(),
    ['# Original long document\n',...[1, 2, 3, 4, 5].map((revision) => `# Revision ${revision}\n`)].sort())

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
