import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { workspace } from '../server/storage/workspace.js'
import { createShare } from '../server/share.js'
import { publicSession } from '../server/services/public-session.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-session-'))
const fake = path.join(root, 'cloudflared')
const addressFile = path.join(root, 'address')
fs.writeFileSync(fake, '#!/bin/sh\nfor value do case "$value" in http://127.0.0.1:*) printf "%s" "$value" > "$READER_TEST_ADDRESS";; esac; done\necho "https://reader-test.trycloudflare.com" >&2\nexec sleep 30\n', { mode: 0o700 })
process.env.READER_CLOUDFLARED = fake
process.env.READER_TEST_ADDRESS = addressFile
const source = workspace(path.join(root, 'source'))
const share = createShare(source.root)
let session
try {
  fs.mkdirSync(path.join(source.root, 'Public'))
  fs.writeFileSync(path.join(source.root, 'Public/doc.md'), '# First\n')
  source.node('Public/doc.md')
  source.setJSON('libraries', { libs: [{ name: 'Public' }] })
  share.setShared('Public', true)
  session = publicSession(source, share)
  const started = await session.control('start')
  assert.equal(started.active, true)
  assert.match(started.url, /^https:\/\/reader-test\.trycloudflare\.com\/onlyread\/$/)
  const address = fs.readFileSync(addressFile, 'utf8')
  const page = await fetch(address + '/onlyread/')
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<div id="app"><\/div>/)
  const read = async () => {
    const res = await fetch(address + '/api/doc?path=Public%2Fdoc.md')
    return { status: res.status, data: await res.json() }
  }
  const first = await read()
  assert.equal(first.status, 200, JSON.stringify(first.data))
  assert.match(JSON.stringify(first.data), /First/)
  const write = await fetch(address + '/api/doc', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'Public/doc.md', content: '# Changed' }) })
  assert.equal(write.status, 403)
  fs.writeFileSync(path.join(source.root, 'Public/doc.md'), '# Second\n')
  assert.match(JSON.stringify((await read()).data), /First/)
  await session.control('update')
  assert.match(JSON.stringify((await read()).data), /Second/)
  assert.equal((await session.control('stop')).active, false)
  console.log('PASS: temporary share start, read-only proxy, snapshot update and stop')
} finally {
  session?.control('stop').catch(() => {})
  source.db.close()
  fs.rmSync(root, { recursive: true, force: true })
}
