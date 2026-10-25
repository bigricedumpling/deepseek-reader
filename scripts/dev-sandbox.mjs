#!/usr/bin/env node
/**
 * 开发沙箱：用源码起 dev server，但内容根指向一份独立的示例库。
 *
 * 目的只有一个：开发时永远不碰自用库。
 * 自用库在 ~/Library/Application Support/Reader/知识库，由安装版插件打开；
 * 这里固定用仓库里的 demo/ 复制到仓库外的 Reader Dev/示例库。
 *
 *   npm run dev:sandbox            # 首次从 demo 建沙箱，之后沿用
 *   npm run dev:sandbox -- --fresh # 丢掉沙箱重来（沙箱里的改动会没）
 *
 * 真实库里的文件不在这棵树下，改坏了也没关系。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO = path.join(ROOT, 'demo')
/*
 * 沙箱必须放在仓库外面。
 *
 * content-api 把「reader 仓库内」的文件当成阅读器自己的文件，会拒绝当文档打开；
 * 放在 repo/.sandbox 下会导致所有文档都读不出来。这里跟安装版一样按平台选数据目录，
 * 只是换了一个名字（Reader Dev），和自用库彻底分开。
 */
const SANDBOX_HOME = process.env.READER_SANDBOX_HOME || defaultSandboxHome()
const SANDBOX = path.join(SANDBOX_HOME, '示例库')
const fresh = process.argv.includes('--fresh')

function defaultSandboxHome() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Reader Dev')
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Reader Dev')
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'reader-dev')
}

if (!fs.existsSync(DEMO)) {
  console.error('找不到 demo/，没有可复制的示例库。')
  process.exit(1)
}

if (fresh) {
  fs.rmSync(SANDBOX, { recursive: true, force: true })
  console.log('已清空旧沙箱。')
}
if (fs.existsSync(SANDBOX)) {
  console.log(`沿用已有沙箱库：${SANDBOX}`)
} else {
  fs.mkdirSync(path.dirname(SANDBOX), { recursive: true })
  fs.cpSync(DEMO, SANDBOX, { recursive: true })
  console.log(`已从 demo/ 建沙箱库：${SANDBOX}`)
}

console.log('')
console.log('  开发实例的数据根，不是自用库。')
console.log('  自用库：~/Library/Application Support/Reader/知识库')
console.log('')

const env = { ...process.env, DOCS_ROOT: SANDBOX, READER_PROFILE: 'dev' }
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
/* 固定 8091 且禁掉端口漂移：8090 永远是自用库，开发实例绝不占用它 */
const child = spawn(npm, ['run', 'dev', '--', '--port', '8091', '--strictPort'], { cwd: ROOT, env, stdio: 'inherit' })

child.on('error', error => {
  console.error('启动 dev server 失败：' + error.message)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  process.exit(signal ? 0 : code ?? 0)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
