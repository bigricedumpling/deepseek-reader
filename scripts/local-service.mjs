import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const label = 'com.quchengzang.reader.local'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const agentPath = path.join(os.homedir(), 'Library', 'LaunchAgents', label + '.plist')
const domain = 'gui/' + process.getuid()
const target = domain + '/' + label
const command = process.argv[2] || 'status'
const escapeXml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])

function run(...args) {
  const result = spawnSync('/bin/launchctl', args, { encoding: 'utf8' })
  if (result.status !== 0) throw Error((result.stderr || result.stdout || 'launchctl 操作失败').trim())
  return result.stdout.trim()
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${escapeXml(process.execPath)}</string><string>${escapeXml(path.join(root, 'server', 'serve.js'))}</string></array>
  <key>WorkingDirectory</key><string>${escapeXml(root)}</string>
  <key>EnvironmentVariables</key><dict><key>PORT</key><string>8090</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${escapeXml(path.join(os.homedir(), 'Library', 'Logs', 'reader-local.log'))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(os.homedir(), 'Library', 'Logs', 'reader-local-error.log'))}</string>
</dict></plist>
`

if (process.platform !== 'darwin') throw Error('本机常驻服务目前只支持 macOS')
if (command === 'print') {
  process.stdout.write(plist)
} else if (command === 'status') {
  const result = spawnSync('/bin/launchctl', ['print', target], { encoding: 'utf8' })
  const state = result.stdout.match(/^\s*state = (.+)$/m)?.[1]
  console.log(result.status !== 0 ? '阅读器本机服务未注册' : state === 'running' ? '阅读器本机服务运行中' : '阅读器本机服务已注册但未运行')
} else if (command === 'install') {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) throw Error('请先执行 npm run build')
  const loaded = spawnSync('/bin/launchctl', ['print', target], { encoding: 'utf8' }).status === 0
  if (loaded) run('bootout', target)
  const occupied = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:8090', '-sTCP:LISTEN'], { encoding: 'utf8' })
  if (occupied.status === 0) throw Error('8090 已被其他服务占用，请先停止当前服务再安装常驻版')
  fs.mkdirSync(path.dirname(agentPath), { recursive: true })
  fs.writeFileSync(agentPath, plist)
  run('bootstrap', domain, agentPath)
  console.log('阅读器本机服务已启用：http://127.0.0.1:8090/')
} else if (command === 'uninstall') {
  const loaded = spawnSync('/bin/launchctl', ['print', target], { encoding: 'utf8' }).status === 0
  if (loaded) run('bootout', target)
  if (fs.existsSync(agentPath)) fs.unlinkSync(agentPath)
  console.log('阅读器本机服务已停用')
} else {
  throw Error('用法：node scripts/local-service.mjs install|status|uninstall|print')
}
