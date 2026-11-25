import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { librarySearch } from '../server/services/library-search.js'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-library-search-'))
const root = path.join(temp, 'docs')
process.env.DOCS_ROOT = root
process.env.READER_RUNTIME_DIR = path.join(temp, 'runtime')
fs.mkdirSync(root)
const { handleApi } = await import('../server/content-api.js')
const { workspace } = await import('../server/storage/workspace.js')

function write(name, content) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}
async function search(q, offset = 0, role = 'owner', ctx = {}) {
  const req = Object.assign(Readable.from([]), { method: 'GET', url: '/api/search?' + new URLSearchParams({ view: 'documents', q, offset }) ,
    headers: { host: '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } })
  let result
  await handleApi(req, { setHeader() {}, end(data) { result = JSON.parse(data) } }, { role, ...ctx })
  return result
}
const fence = (name, content) => '~~~' + name + '\n' + JSON.stringify(content) + '\n~~~'
try {
  const blocks = ['# 报告', '', '使用*强调*或 **加粗**，参阅[描述](https://hidden.example/source)，版本 A &amp; B。', '<https://example.org/source>',
    '<div>实验<span>材料</span><script>不应出现的词</script></div>',
    fence('reader-block', { version: 1, type: 'callout', content: '**显微**镜结果', id: '不应出现的词' }),
    fence('reader-columns', { version: 1, columns: ['第一栏', '第二栏，相同词相同词'] }),
    fence('reader-block', { version: 1, type:'card', title:'进展报告', description:'参阅*该*页', id:'不应出现的词' }),
    fence('reader-block', { version: 1, type:'figure', caption:'实验图片题注', src:'不应出现的词' })]
  write('未打开的库/目录/混合内容.md', '+++\n元数据 = "不应出现的词"\n+++\n' + blocks.join('\n\n'))
  write('隐藏/.reader/内部.md', '不应出现的词')
  write('隐藏/node_modules/依赖.md', '不应出现的词')
  write('隐藏/资源.txt', '不应出现的词')
  write('未打开的库/目录/字面量.md', '````markdown\n~~~\n## **代码标记**\n~~~\n````\n')
  for (const term of ['使用强调或', '或 加粗', '版本 A & B', 'https://example.org/source', '实验材料',
    '显微镜结果', '第二栏，相同词', '参阅该页', '进展报告', '实验图片题注', '## **代码标记**']) {
    const result = await search(term)
    assert(result.ok && result.data.hits.length === 1, term + ': ' + JSON.stringify(result))
    assert(result.data.hits[0].text.includes(term))
  }
  for (const term of ['不应出现的词', 'hidden.example', '"version":']) assert.deepEqual((await search(term)).data.hits, [])
  assert.equal((await search('显微', 0, 'guest')).code, 'FORBIDDEN')
  assert.equal((await search('显微', 0, 'owner', { agentScopes: ['其他库'] })).code, 'FORBIDDEN')

  for (let i = 0; i < 54; i++) write('多结果/' + i + '.md', '甲页乙页 甲页乙页')
  const [a, b] = await Promise.all([search('甲页'), search('乙页')])
  assert.equal(a.data.hits.length, 50)
  assert.equal(a.data.truncated, true)
  assert.deepEqual(a.data.hits.map(x => x.file), b.data.hits.map(x => x.file))
  const rest = (await search('甲页', 50)).data
  assert.equal(rest.truncated, false)
  assert.equal(new Set([...a.data.hits, ...rest.hits].map(x => x.file)).size, 54)
  write('多结果/0.md', '更新后外部可见')
  assert.equal((await search('更新后外部可见')).data.hits[0].file, '多结果/0.md')
  const ignore = librarySearch({ root }, name => path.join(root, name), dir => path.basename(dir) === '未打开的库')
  assert.equal((await ignore(new URL('http://localhost/?q=显微'),{ role:'owner' })).data.hits.length, 0)
  console.log('PASS: full-library search, on-disk discovery, visible Markdown, nested layouts, sharing boundaries, concurrent paging and external updates')
} finally {
  workspace(root).db.close()
  fs.rmSync(temp, { recursive: true, force: true })
}
