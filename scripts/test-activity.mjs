import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { callTool } from '../plugins/reader-workspace/scripts/reader.mjs'

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

  const created = await callTool('reader_create', { dir: 'Research', name: 'Activity', content: '# Activity\n\nfirst line', requestId: 'create-1' })
  assert.equal(created.ok, true, created.error)
  const read = await callTool('reader_read', { id: created.data.id })
  const updated = await callTool('reader_update', { id: created.data.id, revision: read.data.revision, content: '# Activity\n\nfirst line\n\nagent edit', requestId: 'update-1' })
  assert.equal(updated.ok, true, updated.error)
  const renamed = await callTool('reader_rename', { id: created.data.id, name: 'Activity renamed', requestId: 'rename-1' })
  assert.equal(renamed.ok, true, renamed.error)
  const meta = await callTool('reader_metadata', { id: created.data.id })
  const metaUpdated = await callTool('reader_set_metadata', { id: created.data.id, revision: meta.data.revision, meta: { icon: '📄' }, requestId: 'meta-1' })
  assert.equal(metaUpdated.ok, true, metaUpdated.error)

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
  const renameItem = list.items.find(item => item.action === 'PATCH /doc')
  assert.equal(renameItem.actionLabel, '重命名')
  assert.equal(renameItem.name, 'Activity renamed.md')
  const createItem = list.items.find(item => item.action === 'POST /doc')
  assert.equal(createItem.actionLabel, '新建')

  const updateDiff = await must('GET', 'activity/diff?id=' + encodeURIComponent(updateItem.id))
  assert.equal(updateDiff.kind, 'update')
  assert.equal(updateDiff.before, '# Activity\n\nfirst line')
  assert.equal(updateDiff.after, '# Activity\n\nfirst line\n\nagent edit')
  assert.equal(updateDiff.path, 'Research/Activity renamed.md')
  const createDiff = await must('GET', 'activity/diff?id=' + encodeURIComponent(createItem.id))
  assert.equal(createDiff.kind, 'create')
  assert.equal(createDiff.before, '')
  assert.equal(createDiff.after, '# Activity\n\nfirst line')
  const metaDiff = await must('GET', 'activity/diff?id=' + encodeURIComponent(list.items[0].id))
  assert.equal(metaDiff.kind, 'meta')

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

  console.log('PASS: Agent activity inbox, exact before/after diff, metadata entry, read state, owner-only access')
} finally {
  clearTimeout(timer)
  if (child.exitCode === null) {
    child.kill()
    await new Promise(resolve => child.once('exit', resolve))
  }
  fs.rmSync(temporary, { recursive: true, force: true })
}
