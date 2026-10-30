/*
 * Start a clean Typocket demo instance for the landing page.
 *
 * The demo content lives in site/demo-kb, but the content server treats files
 * inside the repository as reader-internal. Copy the fixture to a temp root
 * first so the demo is self-contained without touching the real library.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.join(os.tmpdir(), 'typocket-landing-demo')
const source = path.resolve('site/demo-kb')

fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })
fs.cpSync(path.join(source, '研究'), path.join(root, '研究'), { recursive: true })

const child = spawn(process.execPath, ['server/serve.js'], {
  stdio: 'inherit',
  env: { ...process.env, DOCS_ROOT: root, PORT: process.env.PORT || '8093' }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', code => process.exit(code ?? 0))
