import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-drawer-preview-'))
const root = path.join(temp, 'drawers')
process.env.DOCS_ROOT = root
process.env.READER_RUNTIME_DIR = path.join(temp, 'runtime')

function put(file, data) {
  const abs = path.join(root, file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, data)
  return abs
}

const paper = put('观察/行程/日记.md', [
  '---', 'title: 私有属性', '---', '# 河流的 **颜色**', '',
  '风吹过[桥边](https://example.test)的树。', '',
  '| 颜色 | 时间 |', '| --- | --- |', '| 粼白 | 上午 |', '',
  '![岸边](./岸边.png)', '', '> 水面很平。'
].join('\r\n'))
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64')
put('观察/行程/岸边.png', image)
put('草图/草图.pdf', '%PDF-1.7\n')
put('展览/整场展览.html', '<h1>HTML document</h1><script>test()</script>')
put('附件/图像.md', '# 图像\n')
put('属性/很长的属性.md', '+++\nkey="' + 's'.repeat(30000) + '"\n+++\n# 属性后的正文')
fs.mkdirSync(path.join(root, '空匣'))
const { handleApi, share } = await import('../server/content-api.js')
const { workspace } = await import('../server/storage/workspace.js')

async function request(method, url, body, role = 'owner') {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { method, url, headers: { 'content-type': 'application/json', host: 'localhost' } })
  let result
  await handleApi(req, { statusCode: 200, setHeader() {}, end(s) { result = JSON.parse(s) } }, { role })
  assert.equal(result.ok, true, url + ' ' + (result.error || ''))
  return result.data
}
async function previews() {
  const { libs } = await request('GET', '/api/libs?preview=1')
  return Object.fromEntries(libs.map(lib => [lib.name, lib.preview]))
}

try {
  const { url } = await request('POST', '/api/asset', { path: '附件/图像.md', mime: 'image/png', data: image.toString('base64') })
  put('附件/图像.md', '# 图像\n\n![附图](' + url + ')\n')
  let result = await previews()
  assert.deepEqual(result['观察'], { kind: 'markdown', title: '河流的 颜色', blocks: [
    { type: 'text', text: '风吹过桥边的树。' },
    { type: 'table', rows: [['颜色','时间'],['粼白','上午']] },
    { type: 'image', url: '/api/file?path=' + encodeURIComponent('观察/行程/岸边.png'), alt: '岸边' },
    { type: 'quote', text: '水面很平。' }
  ] })
  assert.equal(result['附件'].blocks[0].url, url)
  assert.deepEqual(result['空匣'], null)
  assert.deepEqual(result['草图'], { kind: 'pdf', title: '草图', blocks: [] })
  assert.deepEqual(result['展览'], { kind: 'html', title: '整场展览', blocks: [] })
  assert.deepEqual(result['属性'].blocks, [])

  share.setShared('观察', true)
  const ownerCompact = await request('GET', '/api/libs')
  const guest = await request('GET', '/api/libs?preview=1', null, 'guest')
  const agent = await request('GET', '/api/agent-libs?preview=1')
  assert.ok(guest.libs.some(lib => lib.name === '观察'))
  for (const list of [ownerCompact, guest, agent]) assert.ok(list.libs.every(lib => !('preview' in lib) && !('previewName' in lib)))

  const images = ['https://example.test/tracker.png', 'data:image/png;base64,AA', url, '../不存在.png', './链接.png']
  fs.writeFileSync(path.join(temp, 'elsewhere.png'), image)
  fs.symlinkSync(path.join(temp, 'elsewhere.png'), path.join(path.dirname(paper), '链接.png'))
  fs.writeFileSync(paper, ['# 已改过的标题', ...images.map(src => '![](' + src + ')'), '', '- 一份新的观察'].join('\n\n'))
  result = await previews()
  assert.equal(result['观察'].title, '已改过的标题')
  assert.deepEqual(result['观察'].blocks, [{ type: 'list', text: '一份新的观察' }])
  console.log('Drawer previews verified for real text, tables, images, file types, role, cache invalidation and bounded reads.')
} finally {
  workspace(root).db.close()
  fs.rmSync(temp, { recursive: true, force: true })
}
