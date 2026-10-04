import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { workspace } from '../server/storage/workspace.js'
import { createShare } from '../server/share.js'
import { resources } from '../server/services/resources.js'
import { buildPublicSnapshot, publicScope } from '../server/services/public-snapshot.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-public-'))
try {
  const source = workspace(path.join(root, 'source')), share = createShare(source.root), assets = resources(source)
  for (const dir of ['Public', 'Private']) fs.mkdirSync(path.join(source.root, dir))
  fs.writeFileSync(path.join(source.root, 'Public/doc.md'), '# Published')
  fs.writeFileSync(path.join(source.root, 'Public/hidden.md'), '# Secret')
  fs.writeFileSync(path.join(source.root, 'Private/doc.md'), '# Private')
  share.setShared('Public', true); share.setShared('Public/hidden.md', false)
  source.setJSON('libraries', { libs: [{ name: 'Public' }, { name: 'Private' }] })
  const publicNode = source.node('Public/doc.md'), privateNode = source.node('Private/doc.md')
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='
  const publicAsset = assets.upload('Public/doc.md', 'image/png', png), privateAsset = assets.upload('Private/doc.md', 'image/png', png)
  source.db.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?,?)').run('origin', publicNode.id, 'workspace-file', 'private-workspace', '/private/source.md', '', Date.now())
  const scope=publicScope(source,share)
  assert.deepEqual(scope,{documents:1,libraries:[{name:'Public',documents:['Public/doc.md']}]},'scope must exclude hidden and private documents')
  const destination = path.join(root, 'snapshot')
  const result = buildPublicSnapshot(source, share, destination)
  assert.equal(result.documents, 1)
  assert.equal(fs.existsSync(path.join(destination, 'Public/hidden.md')), false)
  assert.equal(fs.existsSync(path.join(destination, 'Private')), false)
  assert.equal(fs.existsSync(path.join(destination, publicAsset.path)), true)
  assert.equal(fs.existsSync(path.join(destination, privateAsset.path)), false)
  const db = new DatabaseSync(path.join(destination, '.reader/state.sqlite'))
  for (const table of ['sources', 'credentials', 'versions', 'workspace_previews']) assert.equal(db.prepare('SELECT count(*) AS n FROM ' + table).get().n, 0, table)
  assert.equal(db.prepare('SELECT id FROM nodes WHERE id=?').get(privateNode.id), undefined)
  const access = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='access'").get().value)
  assert.equal(access.locked.Public, true)
  fs.writeFileSync(path.join(source.root, 'Public/doc.md'), '# Later edit')
  assert.equal(fs.readFileSync(path.join(destination, 'Public/doc.md'), 'utf8'), '# Published')
  db.close();source.db.close()
  console.log('PASS: snapshot privacy, asset isolation, read-only permissions and independent content')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
