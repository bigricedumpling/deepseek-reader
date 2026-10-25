#!/usr/bin/env node
/**
 * 每日快照的 launchd 管理。默认每天 03:30 跑一次，保留 14 份。
 *
 *   npm run snapshot:install
 *   npm run snapshot:status
 *   npm run snapshot:uninstall
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const LABEL = 'com.quchengzang.reader.snapshot'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AGENT = path.join(os.homedir(), 'Library', 'LaunchAgents', LABEL + '.plist')
const DOMAIN = 'gui/' + process.getuid()
const TARGET = DOMAIN + '/' + LABEL
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
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(path.join(ROOT, 'scripts', 'snapshot-library.mjs'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${escapeXml(ROOT)}</string>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${escapeXml(path.join(os.homedir(), 'Library', 'Logs', 'reader-snapshot.log'))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(os.homedir(), 'Library', 'Logs', 'reader-snapshot-error.log'))}</string>
</dict></plist>
`

if (process.platform !== 'darwin') throw Error('每日快照的 launchd 管理目前只支持 macOS')

if (command === 'install') {
  const loaded = spawnSync('/bin/launchctl', ['print', TARGET], { encoding: 'utf8' }).status === 0
  if (loaded) run('bootout', TARGET)
  fs.mkdirSync(path.dirname(AGENT), { recursive: true })
  fs.writeFileSync(AGENT, plist)
  run('bootstrap', DOMAIN, AGENT)
  console.log('每日快照已启用：每天 03:30，保留 14 份')
  console.log('日志：~/Library/Logs/reader-snapshot.log')
} else if (command === 'uninstall') {
  const loaded = spawnSync('/bin/launchctl', ['print', TARGET], { encoding: 'utf8' }).status === 0
  if (loaded) run('bootout', TARGET)
  if (fs.existsSync(AGENT)) fs.unlinkSync(AGENT)
  console.log('每日快照已停用')
} else if (command === 'status') {
  const result = spawnSync('/bin/launchctl', ['print', TARGET], { encoding: 'utf8' })
  const state = result.stdout.match(/^\s*state = (.+)$/m)?.[1]
  console.log(result.status !== 0 ? '每日快照未注册' : state === 'running' ? '每日快照运行中' : '每日快照已注册')
} else {
  throw Error('用法：node scripts/snapshot-service.mjs install|status|uninstall')
}
