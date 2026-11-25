import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { digest, workspace } from '../server/storage/workspace.js'
import { resources } from '../server/services/resources.js'
import { workspaceImages, rewriteWorkspaceImages } from '../server/services/workspace-images.js'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-transfer-'))
process.env.DOCS_ROOT = root
process.env.READER_PASSWORD = 'test-only'
const { handleApi } = await import('../server/content-api.js')

function call(method, url, body, role = 'owner', headers = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { method, url: '/api' + url, headers: { 'content-type': 'application/json', ...headers }, socket: { remoteAddress: 'test' } })
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
  // Moving the referring note must not silently redirect it to a same-name note.
  const linkFixture = '[exact](notes.md#结论)\n\n[definition]: <notes.md#结论> "title"\n\n[cite][definition]\n\n`[literal](notes.md)`\n\n[web](https://example.test/notes.md)\n'
  for (const dir of ['Source', 'Target']) await ok('POST', '/doc', { dir, name: 'notes', content: dir })
  await ok('POST', '/doc', { dir: 'Source', name: 'links', content: linkFixture })
  const relocated = await ok('PUT', '/move/doc', { file: 'Source/links.md', dir: 'Target' })
  const relocatedText = (await ok('GET', '/doc?path=' + relocated.file)).content
  assert.equal(relocatedText, linkFixture.replaceAll('notes.md#结论', '../Source/notes.md#结论'))
  assert.equal((await ok('GET', '/doc?path=Source/notes.md')).content, 'Source')
  await ok('PUT', '/move/doc', { file: relocated.file, dir: 'Source', undo: { id: relocated.id, original: 'Source/links.md' } })
  assert.equal((await ok('GET', '/doc?path=Source/links.md')).content, linkFixture)
  const group = await ok('POST', '/category', {parent:'Source', name:'链接组'})
  const groupIndex = '[inside](./参照.md#结论)\n\n[outside](../notes.md)\n'
  await ok('POST', '/doc', {dir:group.path, name:'索引', content:groupIndex})
  await ok('POST', '/doc', {dir:group.path, name:'参照', content:'# 结论'})
  const groupMove = await ok('PUT', '/move/category', {path:group.path, toParent:'Target'})
  assert.equal((await ok('GET','/doc?path=' + encodeURIComponent(groupMove.path+'/索引.md'))).content,
    groupIndex.replace('../notes.md', '../../Source/notes.md'))
  // Moving the target updates genuine incoming links, even when its old name is reused.
  const previousSource = await ok('GET', '/doc?path=Source/links.md')
  const expectedTarget = await ok('GET', '/doc?path=Source/notes.md')
  const unrelated = '[external](https://example.org/notes.md)\n\n~~~md\n[example](notes.md)\n~~~\n'
  await ok('POST', '/doc', {dir:'Source', name:'unchanged', content:unrelated})
  const unchangedPath = path.join(root, 'Source/unchanged.md'), mtime = fs.statSync(unchangedPath).mtimeMs
  const targetMove = await ok('PUT', '/move/doc', {file:'Source/notes.md', dir:'Target'})
  assert(targetMove.updatedReferences.includes('Source/links.md'))
  assert(!targetMove.updatedReferences.includes('Source/unchanged.md'))
  assert.equal(fs.statSync(unchangedPath).mtimeMs, mtime)
  assert.equal(fs.readFileSync(unchangedPath,'utf8'), unrelated)
  const oldName = await ok('POST', '/doc', {dir:'Source', name:'notes', content:'different identity'})
  assert.notEqual(oldName.id, expectedTarget.id)
  const afterTargetMove = await ok('GET', '/doc?path=Source/links.md')
  const finalHref = '../' + targetMove.file.split('/').map(encodeURIComponent).join('/')
  assert.equal(afterTargetMove.content, linkFixture.replaceAll('notes.md#结论',finalHref+'#结论'))
  assert.equal((await ok('GET','/doc?path='+encodeURIComponent(targetMove.file))).id, expectedTarget.id)
  assert.equal((await call('PUT','/doc',{path:'Source/links.md',content:'simultaneous edit',revision:previousSource.revision})).status,409)
  const preceding = (await ok('GET','/history?path=Source/links.md')).items[0]
  assert.equal((await ok('GET','/history?path=Source/links.md&version='+preceding.id)).content, linkFixture)
  // A scoped structural write cannot rewrite notes in a different library.
  await ok('POST','/lib',{name:'Scope'})
  const scopedTarget = await ok('POST','/doc',{dir:'Scope',name:'source',content:'owned by Scope'})
  const outside = '[scoped](../Scope/source.md)\n'
  await ok('POST','/doc',{dir:'Source',name:'outside authorization',content:outside})
  const credential = await ok('POST','/agent-keys',{name:'scope test',scopes:['Scope'],write:true})
  const result = await call('PATCH','/doc',{path:scopedTarget.file,name:'renamed'},'guest',{'x-reader-agent':credential.token})
  assert.equal(result.ok,true)
  assert(!result.data.updatedReferences.includes('Source/outside authorization.md'))
  assert.equal(fs.readFileSync(path.join(root,'Source/outside authorization.md'),'utf8'),outside)
  // Undo must restore the exact source, including an original name that collided on move.
  const { file: originalPath } = await ok('POST', '/doc', { dir: 'Source', name: 'Trip' })
  await ok('POST', '/doc', { dir: 'Target', name: 'Trip' })
  const moved = await ok('PUT', '/move/doc', { file: originalPath, dir: 'Target' })
  assert.notEqual(path.basename(moved.file), path.basename(originalPath))
  const undoDoc = { file: moved.file, dir: 'Source', undo: { original: originalPath, id: moved.id } }
  assert.equal((await call('PUT', '/move/doc', { ...undoDoc, undo: { original: originalPath, id: 'stale' } })).status, 409)
  fs.writeFileSync(path.join(root, originalPath), 'a different file')
  assert.equal((await call('PUT', '/move/doc', undoDoc)).status, 409)
  assert.equal(fs.readFileSync(path.join(root, originalPath), 'utf8'), 'a different file')
  fs.unlinkSync(path.join(root, originalPath))
  const movedDoc = await ok('GET', '/doc?path=' + encodeURIComponent(moved.file))
  await ok('PUT', '/doc', { path: moved.file, revision: movedDoc.revision, content: 'edited after filing' })
  assert.equal((await ok('PUT', '/move/doc', undoDoc)).file, originalPath)
  assert.equal(fs.readFileSync(path.join(root, originalPath), 'utf8'), 'edited after filing')
  const category = await ok('POST', '/category', { parent: 'Source', name: 'Routes' })
  await ok('POST', '/doc', { dir: category.path, name: 'Map' })
  const movedFolder = await ok('PUT', '/move/category', { path: category.path, toParent: 'Target' })
  const undoFolder = { path: movedFolder.path, toParent: 'Source', undo: { original: category.path, id: movedFolder.id } }
  assert.equal((await ok('PUT', '/move/category', undoFolder)).path, category.path)
  assert.ok(fs.existsSync(path.join(root, category.path, 'Map.md')))
  // The sentinel appears only at destinations we expect to change.
  const fixture = [
    '---', 'image: "![front](./a.png)"', '---',
    '# Note', './a.png and [ordinary link](./a.png)',
    '![./a.png]({IMAGE} "./a.png") ![other](./a.png.bak)',
    '[![nested](<{IMAGE}>)](./a.png) and ![repeat]({IMAGE})',
    '![example][shared] [ordinary][shared]', '',
    '[shared]: ./a.png "title ./a.png"', '',
    '![escaped](<{SPACE}> "ok")',
    '~~~md', '![fenced](./a.png)', '~~~', '',
    '    ![indented](./a.png)', '',
    'Inline \x60![code](./a.png)\x60 and \\![escaped](./a.png)',
    '$![formula](./a.png)$ and ![remote](https://example.com/a.png)',
  ].join('\r\n')
  const source = fixture.replaceAll('{IMAGE}', './a.png').replace('{SPACE}', './a b.png')
  const spans = workspaceImages(source)
  const preview = rewriteWorkspaceImages(source, spans, reference =>
    ['./a.png', './a%20b.png'].includes(reference) ? 'data:image/png;base64,' + png : null)
  function expected(url) {
    return fixture.replaceAll('{IMAGE}', url).replace('{SPACE}', url)
      .replace('![example][shared]', '![example](' + url + ' "title ./a.png")')
  }
  assert.equal(preview, expected('data:image/png;base64,' + png))
  const bom = '\uFEFF![p](./a.png)'
  assert.equal(rewriteWorkspaceImages(bom, workspaceImages(bom), () => 'saved'), '\uFEFF![p](saved)')
  const blob = 'blob:example \x60![code](blob:example)\x60 ![a](blob:example) ![b](blob:example)'
  const lost = workspaceImages(blob, url => url.startsWith('blob:'))
  assert.equal(lost.length, 2)
  assert.equal(rewriteWorkspaceImages(blob, [lost[1]], () => 'restored'),
    'blob:example \x60![code](blob:example)\x60 ![a](blob:example) ![b](restored)')
  const collected = await ok('POST', '/import-workspace-doc', {
    dir: 'Source', name: 'Saved', content: source,
    reference: '/workspaces/one/note.md', workspace: '/workspaces/one',
    assets: ['./a.png', './a b.png'].map(reference => ({ reference, mime: 'image/png', base64: png }))
  })
  const sources = await ok('GET', '/sources?path=' + encodeURIComponent(collected.file))
  assert.equal(sources.sources[0].reference, '/workspaces/one/note.md')
  const original = fs.readFileSync(path.join(root, collected.file), 'utf8')
  const assetUrl = original.match(/\/api\/file\?asset=[a-f0-9]+/)[0]
  assert.equal(original, expected(assetUrl))
  assert.equal((await call('GET', '/doc?path=' + encodeURIComponent(collected.file), null, 'guest')).status, 403)
  const metadata = await ok('GET', '/metadata?path=' + encodeURIComponent(collected.file))
  const cover = {type:'artwork', artwork:'register', height:'small', position:65}
  const badCover = await call('PUT', '/metadata', { path: collected.file, revision: metadata.revision, meta: { cover: {...cover, artwork:'not-in-catalog'} } })
  assert.equal(badCover.status, 400)
  assert.equal(badCover.code, 'INVALID_METADATA')
  const changed = await ok('PUT', '/metadata', { path: collected.file, revision: metadata.revision, meta: { icon: '📘', cover } })
  assert.deepEqual(changed.meta.cover, cover)
  const duplicate = await ok('POST', '/copy/doc', { file: collected.file, dir: 'Target' })
  const copied = fs.readFileSync(path.join(root, duplicate.file), 'utf8')
  assert.notEqual(copied, original)
  assert.match(copied, /\/api\/file\?asset=/)
  const duplicateMeta = (await ok('GET', '/metadata?path=' + encodeURIComponent(duplicate.file))).meta
  assert.equal(duplicateMeta.icon, '📘')
  assert.deepEqual(duplicateMeta.cover, cover)
  assert.equal((await call('GET', '/doc?path=' + encodeURIComponent(duplicate.file), null, 'guest')).status, 403)
  await ok('POST', '/category', { parent: 'Source', name: 'Folder' })
  await ok('PUT', '/move/doc', { file: collected.file, dir: 'Source/Folder' })
  const copiedFolder = await ok('POST', '/copy/category', { path: 'Source/Folder', toParent: 'Target' })
  assert.deepEqual((await ok('GET', '/metadata?path=' + encodeURIComponent(copiedFolder.path + '/Saved.md'))).meta.cover, cover)
  assert.deepEqual((await ok('GET', '/metadata?path=Source/Folder/Saved.md')).meta.cover, cover)
  assert.equal(fs.existsSync(path.join(root, copiedFolder.path, 'Saved.md')), true)
  assert.equal(fs.existsSync(path.join(root, 'Source/Folder/Saved.md')), true)
  assert.equal((await call('GET', '/tree?lib=Target', null, 'guest')).status, 403)
  // Copy keeps asset ownership independent without editing literal examples.
  const copySource = (await ok('POST', '/doc', { dir: 'Source', name: 'Copy attachments' })).file
  const uploaded = await ok('POST', '/asset', { path: copySource, mime: 'image/png', base64: png })
  const legacyPath = 'Source/.配图/' + digest(copySource).slice(0, 16) + '-' + 'a'.repeat(64) + '.gif'
  fs.mkdirSync(path.dirname(path.join(root, legacyPath)), { recursive: true })
  fs.writeFileSync(path.join(root, legacyPath), Buffer.from('R0lGODlhAQABAIAAAAAAAP///w==', 'base64'))
  const legacyUrl = '/api/file?path=' + encodeURIComponent(legacyPath)
  const column = JSON.stringify({ version: 1, columns: ['escaped π ![pic]({NEW}) and literal ' + uploaded.url, '`![code](' + legacyUrl + ')`'] })
    .replace('π', '\\u03c0')
  const figure = '{"version":1,  "type": "figure", "src":"{OLD}", "caption":"' + uploaded.url + '"}'
  const template = [
    '---', 'example: ![front](' + uploaded.url + ')', '---', '',
    uploaded.url, '`' + legacyUrl + '`', '',
    '![image]({NEW} "title ' + uploaded.url + '") [download](<{OLD}>) ![ref][shared]', '',
    '[shared]: <{NEW}>', '',
    '<img alt="' + uploaded.url + '" src=\'{NEW}\'>', '',
    '<picture><source srcset="{NEW} 1x, {OLD} 2x"></picture>', '',
    '<pre><code><img src="' + uploaded.url + '"></code></pre>', '',
    '<code>![example](' + uploaded.url + ')</code>', '',
    '~~~html', '<img src="' + uploaded.url + '">', '~~~', '',
    '> ```reader-columns', '> ' + column, '> ```', '',
    '```reader-block', figure, '```', '',
    '~~~reader-block', '{"type":"example","version":1,"src":"' + legacyUrl + '"}', '~~~', '',
    '<!-- <img src="' + uploaded.url + '"> -->'
  ].join('\r\n')
  const input = template.replaceAll('{NEW}', uploaded.url).replaceAll('{OLD}', legacyUrl)
  const copyRead = await ok('GET', '/doc?path=' + encodeURIComponent(copySource))
  await ok('PUT', '/doc', { path: copySource, revision: copyRead.revision, content: input })
  const documentCopy = await ok('POST', '/copy/doc', { file: copySource, dir: 'Target' })
  const output = fs.readFileSync(path.join(root, documentCopy.file), 'utf8')
  const ids = output.match(/!\[image\]\((\/api\/file\?asset=[a-f0-9]{64}).*?\[download\]\(<(\/api\/file\?asset=[a-f0-9]{64})>/)
  assert.ok(ids, 'valid legacy and modern image references must be copied')
  assert.notEqual(ids[1], uploaded.url)
  assert.notEqual(ids[1], ids[2])
  assert.equal(output, template.replaceAll('{NEW}', ids[1]).replaceAll('{OLD}', ids[2]))
  assert.equal(fs.readFileSync(path.join(root, copySource), 'utf8'), input)
  const db = new DatabaseSync(path.join(root, '.reader', 'state.sqlite'), { readOnly: true })
  try {
    for (const [i, url] of ids.slice(1).entries()) {
      const asset = db.prepare('SELECT n.path AS owner, a.path AS file FROM assets a JOIN nodes n ON a.owner=n.id WHERE a.id=?').get(url.split('=').at(-1))
      assert.equal(asset.owner, documentCopy.file)
      assert.deepEqual(fs.readFileSync(path.join(root, asset.file)), i ? fs.readFileSync(path.join(root, legacyPath)) : Buffer.from(png, 'base64'))
    }
  } finally { db.close() }
  // Standalone HTML documents also keep their own assets and literal scripts.
  const htmlFile = 'Source/Web.html'
  const htmlRepo = workspace(root)
  fs.writeFileSync(path.join(root, htmlFile), '<!doctype html>')
  htmlRepo.node(htmlFile, 'h5')
  const htmlImage = resources(htmlRepo).upload(htmlFile, 'image/png', png)
  const htmlTemplate = '<!doctype html><img alt="' + htmlImage.url + '" src="{IMAGE}"><script>let sample = "' + htmlImage.url + '"</script>'
  fs.writeFileSync(path.join(root, htmlFile), htmlTemplate.replace('{IMAGE}', htmlImage.url))
  const htmlCopy = await ok('POST', '/copy/doc', { file: htmlFile, dir: 'Target' })
  const owner = htmlRepo.node(htmlCopy.file)
  const image = htmlRepo.db.prepare('SELECT id FROM assets WHERE owner=?').get(owner.id)
  assert.ok(image)
  assert.notEqual(image.id, htmlImage.id)
  assert.equal(fs.readFileSync(path.join(root, htmlCopy.file), 'utf8'), htmlTemplate.replace('{IMAGE}', '/api/file?asset=' + image.id))
  console.log('PASS: direct workspace import, source record, assets, private access, cross-library copy/move')
} finally {
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch (error) {
    // Windows can keep a handle on freshly written assets; cleanup should not fail the test.
    console.warn(`WARN: could not remove ${root}: ${error.code || error.message}`)
  }
}
