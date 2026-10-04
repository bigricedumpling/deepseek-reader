import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, 'plugins', 'reader-workspace', 'runtime')
const build = spawnSync(process.execPath, [process.env.npm_execpath || 'node_modules/npm/bin/npm-cli.js', 'run', 'build'], { cwd: root, stdio: 'inherit', env: process.env })
if (build.status !== 0) process.exit(build.status || 1)
fs.rmSync(runtime, { recursive: true, force: true })
fs.mkdirSync(runtime, { recursive: true })
fs.cpSync(path.join(root, 'dist'), path.join(runtime, 'dist'), { recursive: true })
fs.cpSync(path.join(root, 'server'), path.join(runtime, 'server'), { recursive: true })
// Standalone website configuration is not part of the plugin. Local
// installations store their own libraries under DOCS_ROOT.
fs.rmSync(path.join(runtime, 'dist', 'kb.json'), { force: true })
fs.rmSync(path.join(runtime, 'dist', 'shots'), { recursive: true, force: true })
console.log('Reader runtime staged for the DSH plugin')
