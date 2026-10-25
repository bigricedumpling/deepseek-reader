#!/usr/bin/env node
/**
 * 生成本地可安装的 DSH 插件包。
 *
 * 真正的打包动作交给 npm pack：plugin 的 prepack 会先构建前端、再把 dist 和
 * server 复制进 runtime，所以安装包里不会出现旧页面。产物放在 .dist-plugin/，
 * 不覆盖任何已发布版本。
 *
 *   npm run release:plugin
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = path.join(ROOT, 'plugins', 'reader-workspace')
const OUT = path.join(ROOT, '.dist-plugin')
const npmCli = process.env.npm_execpath

fs.mkdirSync(OUT, { recursive: true })
const args = ['pack', PLUGIN, '--pack-destination', OUT]
const pack = npmCli
  ? spawnSync(process.execPath, [npmCli, ...args], { cwd: ROOT, stdio: 'inherit', env: process.env })
  : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: ROOT, stdio: 'inherit', env: process.env })
if (pack.status !== 0) {
  console.error('插件打包失败，未生成安装包。')
  process.exit(pack.status || 1)
}

const artifact = fs.readdirSync(OUT)
  .filter(name => name.endsWith('.tgz'))
  .map(name => path.join(OUT, name))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
if (!artifact) {
  console.error('插件打包没有产出 .tgz')
  process.exit(1)
}
console.log(`插件安装包：${artifact}`)
console.log(`体积：${(fs.statSync(artifact).size / 1024 / 1024).toFixed(1)} MB`)
