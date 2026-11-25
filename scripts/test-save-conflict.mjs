import './test-merge-document.mjs'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { createPinia, setActivePinia } from 'pinia'

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-conflict-'))
const vite = await createServer({
  configFile: false, cacheDir, optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }
})
try {
  globalThis.window = {}
  globalThis.location = new URL('http://localhost/doc/L/Note')
  const file = 'L/Note.md'
  const disk = { content: 'original', revision: 'r0' }
  const copies = []
  let writes = 0
  let holdPut
  function delaySave() {
    const reached = Promise.withResolvers()
    const release = Promise.withResolvers()
    holdPut = () => { reached.resolve(); return release.promise }
    return { reached: reached.promise, release: release.resolve }
  }
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input, location)
    const body = options.body && JSON.parse(options.body)
    if (url.pathname === '/api/tree') return Response.json({ ok: true, data: { nodes: [{ type: 'doc', file }] } })
    assert.equal(url.pathname, '/api/doc')
    if (!options.method || options.method === 'GET') return Response.json({ ok: true, data: disk })
    if (options.method === 'POST') {
      copies.push(body.content)
      return Response.json({ ok: true, data: { file: 'L/Copy.md' } })
    }
    assert.equal(options.method, 'PUT')
    writes++
    if (holdPut) { const wait = holdPut; holdPut = null; await wait() }
    if (body.revision !== disk.revision) {
      return Response.json({ ok: false, code: 'CONFLICT', error: 'conflict', details: disk }, { status: 409 })
    }
    disk.content = body.content
    disk.revision += '+'
    return Response.json({ ok: true, data: { revision: disk.revision } })
  }

  setActivePinia(createPinia())
  const { useDocsStore } = await vite.ssrLoadModule('/src/stores/docs.js')
  const store = useDocsStore()
  store.currentPath = file
  await store.loadDoc(file)
  store.updateContent('request snapshot')
  const slow = delaySave()
  const save = store.save()
  await slow.reached
  const queued = store.save()
  Object.assign(disk, { content: 'remote one', revision: 'r1' })
  store.updateContent('latest typing')
  slow.release()
  assert.equal(await save, false)
  assert.equal(await queued, false)
  assert.equal(store.conflict.local, 'latest typing')
  assert.equal(await store.saveBeforeNavigation(), false)
  store.updateContent('latest before copying')
  await store.resolveConflict('copy')
  assert.deepEqual(copies, ['latest before copying'])
  assert.equal(store.currentRaw, 'remote one')

  Object.assign(disk, { content: 'remote two', revision: 'r2' })
  store.updateContent('local merge')
  assert.equal(await store.save(), false)
  store.updateContent('local merge latest')
  await assert.rejects(store.resolveConflict('merge', 'based on old input', 'local merge'), /有更新/)
  Object.assign(disk, { content: 'remote three', revision: 'r3' })
  const dialog = store.conflict
  await assert.rejects(store.resolveConflict('merge', 'manual merge latest', 'local merge latest'), /同一处/)
  assert.equal(store.conflict, dialog)
  assert.equal(store.conflict.draft, 'manual merge latest')
  assert.equal(store.conflict.local, 'local merge latest')
  assert.equal(store.conflict.remote, 'remote three')
  assert.equal(disk.content, 'remote three')
  await store.resolveConflict('merge', 'final reviewed text', 'local merge latest')
  assert.equal(disk.content, 'final reviewed text')
  assert.equal(store.isDirty, false)

  Object.assign(disk, { content: 'remote four', revision: 'r4' })
  store.updateContent('keep until confirmed')
  assert.equal(await store.save(), false)
  Object.assign(disk, { content: 'remote five', revision: 'r5' })
  const beforeDiscard = writes
  await store.resolveConflict('remote')
  assert.equal(writes, beforeDiscard)
  assert.equal(store.currentRaw, 'remote five')
  assert.equal(store.conflict, null)

  const base = '# Heading\n\nFirst paragraph\n\nLast paragraph\n'
  Object.assign(disk, { content: base, revision: 'r6' })
  await store.loadDoc(file, { force: true })
  const local = base.replace('First paragraph', 'Typed')
  const remote = base.replace('Last paragraph', 'Agent')
  Object.assign(disk, { content: remote, revision: 'r7' })
  store.updateContent(local)
  // Editor notifications can lag behind typing when a write is in flight.
  globalThis.window.dispatchEvent = () => {
    store.updateContent(local.replace('Typed', 'Typed more'))
    return true
  }
  assert.equal(await store.save(), true)
  delete globalThis.window.dispatchEvent
  assert.equal(store.conflict, null)
  assert.equal(store.currentRaw, remote.replace('First paragraph', 'Typed more'))
  assert.equal(disk.content, store.currentRaw)
  assert.equal(store.isDirty, false)

  // A remote save with the same body is already complete.
  store.updateContent(base)
  Object.assign(disk, { content: base, revision: 'r8' })
  const beforeIdentical = writes
  assert.equal(await store.save(), true)
  assert.equal(writes, beforeIdentical + 1)

  const mine = base.replace('First paragraph', 'Mine')
  const theirs = base.replace('First paragraph', 'Theirs')
  store.updateContent(mine)
  Object.assign(disk, { content: theirs, revision: 'r9' })
  assert.equal(await store.save(), false)
  const combined = theirs.replace('Theirs', 'Both')
  Object.assign(disk, { content: theirs.replace('Last paragraph', 'New paragraph'), revision: 'r10' })
  await store.resolveConflict('merge', combined, mine)
  assert.equal(store.conflict, null)
  assert.equal(disk.content, combined.replace('Last paragraph', 'New paragraph'))
  assert.equal(store.currentRaw, disk.content)
  assert.equal(store.isDirty, false)
  const nextBase = disk.content
  const changedLocally = nextBase.replace('Both', 'My next edit')
  const changedExternally = nextBase.replace('Both', 'Agent next edit')
  store.updateContent(changedLocally)
  Object.assign(disk, { content: changedExternally, revision: 'r11' })
  assert.equal(await store.save(), false)
  const pending = delaySave()
  const agreed = nextBase.replace('Both', 'Agreed')
  const savingDraft = store.resolveConflict('merge', agreed, changedLocally)
  await pending.reached
  store.updateContent(changedLocally.replace('New paragraph', 'Typed during save'))
  pending.release()
  await savingDraft
  assert.equal(store.conflict, null)
  assert.equal(disk.content, agreed.replace('New paragraph', 'Typed during save'))
  assert.equal(store.currentRaw, disk.content)
  assert.equal(store.isDirty, false)
  console.log('PASS: independent edits and matching saves settle automatically; overlapping edits retain one dialog, the latest typing and the hand-edited draft')
} finally {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
}
