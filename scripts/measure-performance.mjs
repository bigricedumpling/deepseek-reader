import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const count = Number(process.argv[2] || 300)
const samples = 20
assert(Number.isInteger(count) && count > 0 && count <= 10000, 'Supply a document count between 1 and 10000')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-perf-'))
const root = path.join(temp, 'docs')
const docs = path.join(root, 'Bench')
fs.mkdirSync(docs, { recursive: true })
const basic = 'Research notes for human and Agent.\n'.repeat(500)
for (let i = 0; i < count; i++) fs.writeFileSync(path.join(docs, i + '.md'), '# Document ' + i + '\n' + basic)
const long = '# Long document\n' + Array.from({ length: 10000 }, (_, i) => 'Paragraph ' + i + ': research, review, collect and find again.\n').join('\n')
fs.writeFileSync(path.join(docs, 'long.md'), long)
const start = performance.now()
const server = fork(fileURLToPath(new URL('../server/serve.js', import.meta.url)), [], {
  env: { ...process.env, DOCS_ROOT: root, READER_RUNTIME_DIR: path.join(temp, 'runtime'), PORT: '0' }, silent: true,
})
try {
  const [{ port }] = await once(server, 'message', { signal: AbortSignal.timeout(45000) })
  const metrics = { node: process.version, platform: process.platform, documents: count + 1, samples,
    textBytes: fs.readdirSync(docs).reduce((n, file) => n + fs.statSync(path.join(docs, file)).size, 0),
    startupMs: Math.round(performance.now() - start) }
  async function read(route) {
    const response = await fetch('http://127.0.0.1:' + port + '/api/' + route)
    const result = await response.json()
    assert(result.ok, result.error)
  }
  const checks = {
    tree: () => read('tree?lib=Bench'), long: () => read('doc?path=Bench/long.md'),
    searchMiss: () => read('search?lib=Bench&q=not-in-any-document'),
    eightReads: () => Promise.all(Array.from({ length: Math.min(count, 8) }, (_, i) => read('doc?path=Bench/' + i + '.md'))),
  }
  for (const [name, run] of Object.entries(checks)) {
    const times = []
    for (let i = 0; i <= samples; i++) {
      const t = performance.now()
      await run()
      times.push(performance.now() - t)
    }
    const first = times.shift()
    times.sort((a, b) => a - b)
    metrics[name] = { firstMs: Math.round(first), p50Ms: Math.round(times[9]), p95Ms: Math.round(times[18]) }
  }
  console.log(JSON.stringify(metrics, null, 2))
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit')
    server.kill()
    await stopped
  }
  fs.rmSync(temp, { recursive: true, force: true })
}
