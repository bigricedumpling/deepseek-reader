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
  await assert.rejects(store.resolveConflict('merge', 'manual merge latest', 'local merge latest'), /conflict/)
  assert.equal(store.conflict.local, 'manual merge latest')
  assert.equal(store.conflict.remote, 'remote three')
  assert.equal(disk.content, 'remote three')
  await store.resolveConflict('merge', 'final reviewed text', 'manual merge latest')
  assert.equal(disk.content, 'final reviewed text')
  assert.equal(store.isDirty, false)

  Object.assign(disk, { content: 'remote four', revision: 'r4' })
  store.updateContent('keep until confirmed')
  assert.equal(await store.save(), false)
  Object.assign(disk, { content: 'remote five', revision: 'r5' })
  await assert.rejects(store.resolveConflict('remote'), /再次更新/)
  assert.equal(store.currentRaw, 'keep until confirmed')
  assert.equal(store.conflict.remote, 'remote five')
  await store.resolveConflict('remote')
  assert.equal(store.currentRaw, 'remote five')
  console.log('PASS: latest input survives slow and queued saves, conflict copy, manual merge, and a second external edit')
} finally {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
}
