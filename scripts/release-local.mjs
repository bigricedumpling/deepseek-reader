#!/usr/bin/env node
/**
 * 本地发布：语法检查 → 构建 → 重启常驻服务 → 健康检查。
 *
 * 自用实例跑的是仓库里的 dist/ 和 server/，所以“发布”不是 git push，
 * 而是把当前这份代码安全地交给 8090。任何一步失败都不会重启服务，
 * 避免把坏代码推给正在用的自己。
 *
 *   npm run release:local
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 8090
const LABEL = 'com.quchengzang.reader.local'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return entry.name.endsWith('.js') ? [full] : []
  })
}

/* 1. 语法检查：构建能过不代表 server 能启动 */
const failures = []
for (const file of walk(path.join(ROOT, 'server'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) failures.push(`${path.relative(ROOT, file)}\n${(result.stderr || '').trim()}`)
}
if (failures.length) {
  console.error('服务端语法检查失败，未构建、未重启：\n\n' + failures.join('\n\n'))
  process.exit(1)
}
console.log('服务端语法检查通过。')

/* 2. 构建 */
const build = spawnSync(npm, ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
if (build.status !== 0) {
  console.error('构建失败，服务保持原样。')
  process.exit(build.status || 1)
}

/* 3. 重启常驻服务 */
if (process.platform === 'darwin') {
  const target = `gui/${process.getuid()}/${LABEL}`
  const loaded = spawnSync('launchctl', ['print', target], { stdio: 'ignore' }).status === 0
  if (loaded) {
    const kick = spawnSync('launchctl', ['kickstart', '-k', target], { stdio: 'inherit' })
    if (kick.status !== 0) {
      console.error('重启常驻服务失败：launchctl kickstart 返回 ' + kick.status)
      process.exit(1)
    }
    console.log('常驻服务已重启。')
  } else {
    console.log('常驻服务未安装，跳过重启。需要常驻请运行：npm run service:install')
  }
} else {
  console.log('非 macOS，跳过 launchd 重启；请手动重启服务。')
}

/* 4. 健康检查：确认 8090 真的在提供新版本 */
let lastError = ''
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const instance = await (await fetch(`http://127.0.0.1:${PORT}/api/instance`, { signal: AbortSignal.timeout(800) })).json()
    if (instance.ok) {
      const libs = await (await fetch(`http://127.0.0.1:${PORT}/api/libs`, { signal: AbortSignal.timeout(800) })).json()
      const list = libs.data?.libs || []
      console.log(`已就绪：${instance.data.name}，${list.length} 个抽屉，${list.reduce((sum, lib) => sum + lib.docs, 0)} 篇文档`)
      process.exit(0)
    }
    lastError = instance.error || '服务返回失败'
  } catch (error) {
    lastError = error.message
  }
  await new Promise(resolve => setTimeout(resolve, 500))
}
console.error(`服务没有在 20 秒内就绪：${lastError}`)
process.exit(1)
