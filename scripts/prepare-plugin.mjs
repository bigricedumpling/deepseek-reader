import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, 'plugins', 'reader-workspace', 'runtime')
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env: process.env })
if (build.status !== 0) process.exit(build.status || 1)
fs.rmSync(runtime, { recursive: true, force: true })
fs.mkdirSync(runtime, { recursive: true })
fs.cpSync(path.join(root, 'dist'), path.join(runtime, 'dist'), { recursive: true })
fs.cpSync(path.join(root, 'server'), path.join(runtime, 'server'), { recursive: true })
// kb.json describes this developer's online example libraries. A fresh local
// installation starts empty and stores its own libraries under DOCS_ROOT.
fs.rmSync(path.join(runtime, 'dist', 'kb.json'), { force: true })
fs.rmSync(path.join(runtime, 'dist', 'shots'), { recursive: true, force: true })
console.log('Reader runtime staged for the DSH plugin')
