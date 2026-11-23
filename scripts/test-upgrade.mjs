import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPackageUpgrade } from './test-package-upgrade.mjs'

const baseline = process.argv[2] || process.env.READER_UPGRADE_BASELINE
if (!baseline) throw Error('Specify the previous release package or source directory via READER_UPGRADE_BASELINE')

if (fs.statSync(baseline).isFile()) {
  const repo = fileURLToPath(new URL('../', import.meta.url))
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'plugins/reader-workspace/package.json'), 'utf8'))
  const candidate = process.argv[3] || process.env.READER_UPGRADE_CANDIDATE || path.join(repo, manifest.name + '-' + manifest.version + '.tgz')
  await verifyPackageUpgrade(baseline, candidate, process.env.READER_UPGRADE_BASELINE_SHA256)
} else {
  await verifySourceUpgrade(baseline)
}

// Preserve the source-checkout migration check for contributors without two packages.
async function verifySourceUpgrade(previousSource) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-upgrade-'))
  const root = path.join(temporary, 'documents')
  const createWithPreviousSource = `
    import fs from 'node:fs'
    import path from 'node:path'
    import { workspace } from './server/storage/workspace.js'
    import { resources } from './server/services/resources.js'
    const root = process.env.DOCS_ROOT
    fs.mkdirSync(path.join(root, 'Notes'), { recursive: true })
    fs.writeFileSync(path.join(root, 'Notes/doc.md'), '# Before upgrade')
    const repo = workspace(root)
    resources(repo)
    const doc = repo.node('Notes/doc.md')
    repo.db.prepare('UPDATE nodes SET meta=? WHERE id=?').run(JSON.stringify({ icon: '📘', layout: 'wide' }), doc.id)
    repo.setJSON('columns', { 'Notes/doc.md': { a: [120, 240] } })
    console.log(JSON.stringify({ id: doc.id }))
    repo.db.close()
  `

  let repo
  try {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', createWithPreviousSource], {
      cwd: previousSource, env: { ...process.env, DOCS_ROOT: root }, encoding: 'utf8'
    })
    const previous = JSON.parse(result)
    process.env.DOCS_ROOT = root
    process.env.READER_RUNTIME_DIR = path.join(temporary, 'runtime')
    const { workspace } = await import('../server/storage/workspace.js')
    const { resources } = await import('../server/services/resources.js')
    const { backupService } = await import('../server/services/backups.js')
    repo = workspace(root)
    resources(repo)
    const doc = repo.node('Notes/doc.md')
    assert.equal(doc.id, previous.id)
    assert.deepEqual(doc.meta, { icon: '📘', layout: 'wide' })
    assert.deepEqual(repo.getJSON('columns', {})['Notes/doc.md'], { a: [120, 240] })
    assert.equal(fs.readFileSync(path.join(root, 'Notes/doc.md'), 'utf8'), '# Before upgrade')
    const backups = backupService(repo)
    const restored = await backups.restore(backups.create().id)
    assert.equal(fs.readFileSync(path.join(restored.directory, 'Notes/doc.md'), 'utf8'), '# Before upgrade')
    console.log('PASS: previous-version data opens with stable document IDs, content and page settings; new backup/restore preserves it')
  } finally {
    repo?.db.close()
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}
