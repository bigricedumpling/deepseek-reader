import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export async function verifyPackageUpgrade(baseline, candidate, expectedDigest) {
  if (expectedDigest) {
    const digest = createHash('sha256').update(fs.readFileSync(baseline)).digest('hex')
    assert.equal(digest, expectedDigest, 'old package must match the published release asset')
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-package-upgrade-'))
  const data = path.join(temporary, 'documents')
  const runtimeState = path.join(temporary, 'runtime')
  const project = path.join(temporary, 'work')
  const source = path.join(project, 'example.md')
  const markdown = '# Upgrade fixture\n\n![Diagram](./figure.png)\n'
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
  let manager

  function unpack(archive, name) {
    const directory = path.join(temporary, name)
    fs.mkdirSync(directory)
    // Git Bash's tar treats a Windows drive letter in an archive argument as a remote host.
    const archiveFile = fs.openSync(archive, 'r')
    try {
      execFileSync('tar', ['-xzf', '-'], { cwd: directory, stdio: [archiveFile, 'ignore', 'pipe'] })
    } finally {
      fs.closeSync(archiveFile)
    }
    const plugin = path.join(directory, 'package')
    const manifest = JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'), 'utf8'))
    assert.equal(manifest.name, 'dsh-reader-workspace')
    return { plugin, version: manifest.version }
  }
  async function open(plugin) {
    const { startManagedServer } = await import(pathToFileURL(path.join(plugin, 'managed-server.js')).href)
    manager = startManagedServer(undefined, { forceManaged: true, dataDirectory: data })
    for (let i = 0; i < 200 && manager.status.state === 'starting'; i++) await sleep(100)
    assert.equal(manager.status.state, 'ready', manager.status.error || 'package server timed out')
    return manager.status.url
  }
  async function stop() {
    if (!manager) return
    manager.stop()
    manager = undefined
    // The managed server releases its own per-directory lock after the child exits.
    const locked = () => fs.existsSync(runtimeState) && fs.readdirSync(runtimeState)
      .some(name => fs.existsSync(path.join(runtimeState, name, 'service.lock')))
    for (let i = 0; i < 150 && locked(); i++) await sleep(100)
    assert(!locked(), 'previous runtime did not exit')
  }
  async function api(origin, method, route, body) {
    const response = await fetch(new URL('api/' + route, origin), {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    const result = await response.json()
    assert.ok(response.ok && result.ok, method + ' ' + route + ': ' + result.error)
    return result.data
  }

  try {
    const old = unpack(baseline, 'old')
    const next = unpack(candidate, 'next')
    assert.notEqual(old.version, next.version, 'upgrade requires different package versions')
    fs.mkdirSync(project)
    fs.writeFileSync(source, markdown)
    fs.writeFileSync(path.join(project, 'figure.png'), image)
    const oldUrl = await open(old.plugin)
    await api(oldUrl, 'POST', 'lib', { name: 'Notes' })
    const imported = await api(oldUrl, 'POST', 'import-workspace-doc', {
      dir: 'Notes', name: 'Example', content: markdown, reference: source, workspace: project,
      assets: [{ reference: './figure.png', mime: 'image/png', base64: image.toString('base64') }]
    })
    const file = imported.file
    const query = '?path=' + encodeURIComponent(file)
    const before = await api(oldUrl, 'GET', 'doc' + query)
    const metadata = await api(oldUrl, 'GET', 'metadata' + query)
    await api(oldUrl, 'PUT', 'metadata', { path: file, revision: metadata.revision, meta: { icon: '📘', layout: 'wide' } })
    await api(oldUrl, 'PUT', 'colw', { file, widths: [[120, 240]] })
    await stop()

    const url = await open(next.plugin)
    assert.equal(url, oldUrl, 'upgrade must retain the original browser origin')
    const doc = await api(url, 'GET', 'doc' + query)
    assert.equal(doc.id, imported.id)
    assert.equal(doc.revision, before.revision)
    assert.equal(doc.content, before.content)
    const meta = (await api(url, 'GET', 'metadata' + query)).meta
    assert.equal(meta.icon, '📘')
    assert.equal(meta.layout, 'wide')
    assert.deepEqual(await api(url, 'GET', 'colw?file=' + encodeURIComponent(file)), [[120, 240]])
    assert.equal((await api(url, 'GET', 'sources' + query)).sources[0].reference, source)
    const assetUrl = doc.content.match(/!\[Diagram\]\(([^)]+)\)/)?.[1]
    assert.match(assetUrl || '', /^\/api\/file\?asset=/)
    async function checkImage() {
      const response = await fetch(new URL(assetUrl, url))
      assert.equal(response.status, 200)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), image)
    }
    await checkImage()
    const edited = before.content + '\nEdited after upgrade.\n'
    await api(url, 'PUT', 'doc', { path: file, revision: doc.revision, content: edited })
    assert.equal((await api(url, 'GET', 'doc' + query)).content, edited)
    await api(url, 'DELETE', 'doc', { path: file })
    const { items } = await api(url, 'GET', 'trash')
    await api(url, 'POST', 'trash/restore', { trashId: items.find(item => item.original === file).id })
    const recovered = await api(url, 'GET', 'doc' + query)
    assert.equal(recovered.id, imported.id)
    assert.equal(recovered.content, edited)
    await checkImage()
    const backup = await api(url, 'POST', 'backups', { action: 'create' })
    const restored = await api(url, 'POST', 'backups', { action: 'restore', backupId: backup.id })
    assert.equal(fs.readFileSync(path.join(restored.directory, file), 'utf8'), edited)
    assert.equal(fs.readFileSync(source, 'utf8'), markdown)
    assert.deepEqual(fs.readFileSync(path.join(project, 'figure.png')), image)
    console.log(`PASS: packaged ${old.version} → ${next.version}, same browser origin, document ID and revision, settings, images, source, edit, trash and backup recovery`)
  } finally {
    await stop()
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 })
  }
}
