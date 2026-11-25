import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { callTool } from '../plugins/reader-workspace/scripts/reader.mjs'
import { workspace } from '../server/storage/workspace.js'
import { activityService } from '../server/services/activity.js'
import { diffLines } from '../src/utils/markdown-normalize.js'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-activity-'))
let timer
const child = spawn(process.execPath, [fileURLToPath(new URL('../server/serve.js', import.meta.url))], {
  env: { ...process.env, DOCS_ROOT: path.join(temporary, 'knowledge'), READER_RUNTIME_DIR: path.join(temporary, 'runtime'), PORT: '0' },
  stdio: ['ignore', 'ignore', 'pipe', 'ipc']
})

try {
  const url = await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('Server startup timeout')), 15000)
    child.once('error', reject)
    child.once('exit', () => reject(Error('Server exited')))
    child.on('message', message => { if (message.port) { clearTimeout(timer); resolve(`http://127.0.0.1:${message.port}/`) } })
  })
  async function owner(method, route, body, headers = {}) {
    const response = await fetch(url + 'api/' + route, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return response.json()
  }
  async function must(method, route, body, headers) {
    const result = await owner(method, route, body, headers)
    assert.equal(result.ok, true, result.error)
    return result.data
  }

  await must('POST', 'lib', { name: 'Research' })
  const key = await must('POST', 'agent-keys', { name: 'OpenCode Test', scopes: ['Research'], write: true, days: 1 })
  process.env.READER_URL = url
  process.env.READER_TOKEN = key.token

  const createRequest = { dir: 'Research', name: 'Activity', content: '# Activity\n\nfirst line', requestId: 'create-1' }
  const created = await callTool('reader_create', createRequest)
  assert.equal(created.ok, true, created.error)
  const read = await callTool('reader_read', { id: created.data.id })
  const updated = await callTool('reader_update', { id: created.data.id, revision: read.data.revision, content: '# Activity\n\nfirst line\n\nagent edit', requestId: 'update-1' })
  assert.equal(updated.ok, true, updated.error)
  const renamed = await callTool('reader_rename', { id: created.data.id, name: 'Activity renamed', requestId: 'rename-1' })
  assert.equal(renamed.ok, true, renamed.error)
  const meta = await callTool('reader_metadata', { id: created.data.id })
  const metaUpdated = await callTool('reader_set_metadata', { id: created.data.id, revision: meta.data.revision, meta: { icon: '📄' }, requestId: 'meta-1' })
  assert.equal(metaUpdated.ok, true, metaUpdated.error)

  // Lost replies can be retried after a rename, even when the original target was supplied by stable ID.
  const replayUpdate = await callTool('reader_update', { id: created.data.id, revision: read.data.revision, content: '# Activity\n\nfirst line\n\nagent edit', requestId: 'update-1' })
  assert.deepEqual(replayUpdate, updated)
  const replayRename = await callTool('reader_rename', { id: created.data.id, name: 'Activity renamed', requestId: 'rename-1' })
  assert.deepEqual(replayRename, renamed)
  const rejectedReuse = await callTool('reader_update', { id: created.data.id, revision: read.data.revision, content: 'different content', requestId: 'update-1' })
  assert.equal(rejectedReuse.code, 'IDEMPOTENCY_CONFLICT')

  const list = await must('GET', 'activity')
  assert.equal(list.unread, 4)
  assert.equal(list.items.length, 4)
  assert.equal(list.items[0].action, 'PUT /metadata')
  assert.equal(list.items[0].actionLabel, '页面设置')
  assert.equal(list.items[0].actor, 'OpenCode Test')
  assert.equal(list.items[0].docId, created.data.id)
  assert.equal(list.items[0].hasDiff, false)
  const updateItem = list.items.find(item => item.action === 'PUT /doc')
  assert.equal(updateItem.actionLabel, '修改')
  assert.equal(updateItem.hasDiff, true)
  assert.equal(updateItem.reviewed, false)
  assert.equal(updateItem.path, 'Research/Activity.md')
  assert.equal(updateItem.currentPath, 'Research/Activity renamed.md')
  const renameItem = list.items.find(item => item.action === 'PATCH /doc')
  assert.equal(renameItem.actionLabel, '重命名')
  assert.equal(renameItem.name, 'Activity renamed.md')
  assert.equal(renameItem.currentPath, 'Research/Activity renamed.md')
  const createItem = list.items.find(item => item.action === 'POST /doc')
  assert.equal(createItem.actionLabel, '新建')

  const updateDiff = await must('GET', 'activity/diff?id=' + encodeURIComponent(updateItem.id))
  assert.equal(updateDiff.kind, 'update')
  assert.equal(updateDiff.before, '# Activity\n\nfirst line')
  assert.equal(updateDiff.after, '# Activity\n\nfirst line\n\nagent edit')
  assert.equal(updateDiff.path, 'Research/Activity.md')
  // All lines in one insertion/deletion must remain visible in the source comparison.
  const frontmatter = '---\n作者: 编辑\n---\n'
  const prefixed = frontmatter + updateDiff.after
  const addedLines = diffLines(updateDiff.after, prefixed)
  assert.deepEqual(addedLines.map(line => [line.newLine, line.original, line.out]),
    [[1, null, '---'], [2, null, '作者: 编辑'], [3, null, '---']])
  assert.deepEqual(diffLines(prefixed, updateDiff.after).map(line => line.original),
    ['---', '作者: 编辑', '---'])
  const createDiff = await must('GET', 'activity/diff?id=' + encodeURIComponent(createItem.id))
  assert.equal(createDiff.kind, 'create')
  assert.equal(createDiff.before, '')
  assert.equal(createDiff.after, '# Activity\n\nfirst line')
  const metaDiff = await must('GET', 'activity/diff?id=' + encodeURIComponent(list.items[0].id))
  assert.equal(metaDiff.kind, 'meta')

  const pathOnDisk = path.join(temporary, 'knowledge', renameItem.currentPath)
  fs.writeFileSync(pathOnDisk, '# Edited outside Typocket')
  assert.deepEqual(await must('GET', 'activity/diff?id=' + updateItem.id), updateDiff)
  assert.deepEqual(await must('GET', 'activity/diff?id=' + createItem.id), createDiff)
  const copy = await must('POST', 'backups', { action: 'create' })
  const restored = await must('POST', 'backups', { action: 'restore', backupId: copy.id })
  const restoredRepo = workspace(restored.directory)
  try {
    assert.deepEqual(activityService(restoredRepo).diff(updateItem.id), updateDiff)
  } finally { restoredRepo.db.close() }

  // A real legacy operation has no immutable result to verify.
  const legacyDb = new DatabaseSync(path.join(temporary, 'knowledge', '.reader', 'state.sqlite'))
  try {
    legacyDb.prepare('INSERT INTO operations(id,action,actor,at,details) SELECT ?,action,actor,at,details FROM operations WHERE id=?')
      .run('previous-format-update', updateItem.id)
    assert.equal((await must('GET', 'activity/diff?id=previous-format-update')).kind, 'unavailable')
    legacyDb.prepare('DELETE FROM operations WHERE id=?').run('previous-format-update')
  } finally { legacyDb.close() }

  const auditBefore = await must('GET', 'audit')
  const reviewed = await must('POST', 'activity/review', { id: updateItem.id })
  assert.equal(reviewed.reviewed, true)
  const afterOne = await must('GET', 'activity')
  assert.equal(afterOne.unread, 3)
  assert.equal(afterOne.items.find(item => item.id === updateItem.id).reviewed, true)
  const auditAfter = await must('GET', 'audit')
  assert.equal(auditAfter.length, auditBefore.length, '标记已读不应写进操作记录')

  const all = await must('POST', 'activity/review', { all: true })
  assert.equal(all.reviewed >= 4, true)
  const afterAll = await must('GET', 'activity?limit=1')
  assert.equal(afterAll.unread, 0)
  assert.equal(afterAll.items.length, 1)

  const forbidden = await owner('GET', 'activity', null, { 'x-reader-agent': key.token })
  assert.equal(forbidden.ok, false)
  assert.equal(forbidden.code, 'FORBIDDEN')

  const older = await must('GET', 'activity?limit=2&offset=2&all=1')
  assert.equal(older.items.length, 2)

  /* 文档后来被删掉，历史条目仍要显示当时的路径，而不是回收站路径。 */
  await must('DELETE', 'doc', { path: 'Research/Activity renamed.md' })
  const afterDelete = await must('GET', 'activity')
  const historical = afterDelete.items.find(item => item.id === updateItem.id)
  assert.equal(historical.path, 'Research/Activity.md')
  assert.equal(historical.currentPath, '')
  assert.equal(historical.available, false)
  const renamedHistorical = afterDelete.items.find(item => item.id === renameItem.id)
  assert.equal(renamedHistorical.path, 'Research/Activity renamed.md')
  assert.equal(renamedHistorical.currentPath, '')
  assert.equal(renamedHistorical.available, false)
  const stillDiff = await must('GET', 'activity/diff?id=' + encodeURIComponent(updateItem.id))
  assert.equal(stillDiff.before, '# Activity\n\nfirst line')
  assert.equal(stillDiff.after, '# Activity\n\nfirst line\n\nagent edit')

  // Old Windows releases recorded file operations using native path separators.
  // Replay those records after a rename and deletion, as when restoring an old backup.
  const history = new DatabaseSync(path.join(temporary, 'knowledge', '.reader', 'state.sqlite'))
  try {
    // Old installations hashed only the resolved request body. Their successful replies remain replayable.
    const previousHash = createHash('sha256').update('POST /doc' + JSON.stringify(createRequest)).digest('hex')
    history.prepare('UPDATE retries SET fingerprint=? WHERE key=?').run(previousHash, 'agent:' + key.id + ':create-1')
    for (const id of [createItem.id, updateItem.id, renameItem.id]) {
      const row = history.prepare('SELECT details FROM operations WHERE id=?').get(id)
      const details = JSON.parse(row.details)
      for (const file of details.files) {
        for (const key of ['path', 'from', 'to']) {
          if (!file[key]) continue
          assert.ok(!file[key].includes('\\'), 'New operation paths must be portable')
          file[key] = file[key].replaceAll('/', '\\')
        }
      }
      // A clock change must not prevent resolving the exact version named by this operation.
      history.prepare('UPDATE operations SET details=?, at=0 WHERE id=?').run(JSON.stringify(details), id)
    }
  } finally {
    history.close()
  }
  const legacy = await must('GET', 'activity')
  for (const item of [createItem, updateItem, renameItem]) {
    const restored = legacy.items.find(entry => entry.id === item.id)
    assert.equal(restored.path, item.path)
    assert.equal(restored.name, item.name)
    assert.equal(restored.docId, created.data.id)
  }
  assert.deepEqual(await must('GET', 'activity/diff?id=' + createItem.id), createDiff)
  assert.deepEqual(await must('GET', 'activity/diff?id=' + updateItem.id), updateDiff)

  assert.deepEqual(await callTool('reader_create', createRequest), created)
  assert.equal((await must('GET', 'activity')).items.length, afterDelete.items.length)
  const rolling = await must('POST', 'doc', { dir: 'Research', name: 'Retention', content: 'start' }, { 'x-typocket-client': 'local-agent' })
  const firstReceipt = (await must('GET', 'activity')).items[0].id
  let revision = rolling.revision, oldest, latest
  for (let i = 1; i <= 101; i++) {
    const change = await must('PUT', 'doc', { path: rolling.file, revision, content: i % 2 ? 'reused' : 'even ' + i })
    revision = change.revision
    if (i === 1 || i === 101) {
      const id = (await must('GET', 'activity?limit=1&all=1')).items[0].id
      if (i === 1) oldest = id
      else latest = id
    }
  }
  assert.equal((await must('GET', 'activity/diff?id=' + firstReceipt)).kind, 'unavailable')
  assert.equal((await must('GET', 'activity/diff?id=' + oldest)).kind, 'unavailable')
  const retained = await must('GET', 'activity/diff?id=' + latest)
  assert.equal(retained.before, 'even 100')
  assert.equal(retained.after, 'reused')
  const historyItems = (await must('GET', 'history?id=' + rolling.id)).items
  assert.equal(historyItems.length, 100)
  const snaps = fs.readdirSync(path.join(temporary, 'knowledge/.reader/versions', rolling.id))
  assert.equal(snaps.length, 51, 'identical snapshots should share data and obsolete content must be collected')
  await must('PUT', 'doc', { path: rolling.file, revision, content: 'reused' })
  const noChange = (await must('GET', 'activity?limit=1&all=1')).items[0]
  assert.equal((await must('GET', 'activity/diff?id=' + noChange.id)).kind, 'unchanged')

  await must('DELETE', 'agent-keys', { id: key.id })
  const revokedReplay = await callTool('reader_create', createRequest)
  assert.equal(revokedReplay.code, 'UNAUTHORIZED')

  console.log('PASS: Agent activity inbox, exact before/after diff, metadata entry, read state, historical paths, owner-only access')
} finally {
  clearTimeout(timer)
  if (child.exitCode === null) {
    child.kill()
    await new Promise(resolve => child.once('exit', resolve))
  }
  fs.rmSync(temporary, { recursive: true, force: true })
}
