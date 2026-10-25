#!/usr/bin/env node
/**
 * 每日快照。
 *
 * 文档与资源用 rsync 硬链接做增量：没变的文件直接链到上一份，
 * 只占很少空间；文档写入本身是 atomicWrite（临时文件 + rename），
 * 所以旧快照里的硬链接不会被后续编辑改掉。
 * SQLite 单独用 .backup 取一致副本，不和运行中的 WAL 抢文件。
 *
 *   npm run snapshot
 *   READER_SNAPSHOT_KEEP=30 npm run snapshot
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SOURCE = path.resolve(process.env.DOCS_ROOT || path.join(os.homedir(), 'Library', 'Application Support', 'Reader', '知识库'))
const BASE = path.resolve(process.env.READER_SNAPSHOT_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Reader备份', 'snapshots'))
const KEEP = Math.max(1, Number(process.env.READER_SNAPSHOT_KEEP) || 14)
const now = new Date()
const pad = value => String(value).padStart(2, '0')
const STAMP = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
const DEST = path.join(BASE, STAMP)

if (!fs.existsSync(path.join(SOURCE, '.reader', 'state.sqlite'))) {
  console.error(`找不到知识库：${SOURCE}`)
  process.exit(1)
}

function snapshots() {
  if (!fs.existsSync(BASE)) return []
  return fs.readdirSync(BASE).filter(name => /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(name)).sort()
}

fs.mkdirSync(DEST, { recursive: true })
const previous = snapshots().filter(name => path.join(BASE, name) !== DEST).at(-1)

/* 文件树：硬链接到上一份，省空间也省时间 */
const rsyncArgs = [
  '-a',
  '--exclude', 'state.sqlite',
  '--exclude', 'state.sqlite-wal',
  '--exclude', 'state.sqlite-shm',
]
if (previous) rsyncArgs.push('--link-dest', path.join(BASE, previous))
rsyncArgs.push(SOURCE + '/', DEST + '/')
const rsync = spawnSync('rsync', rsyncArgs, { encoding: 'utf8' })
if (rsync.status !== 0) {
  fs.rmSync(DEST, { recursive: true, force: true })
  console.error('rsync 失败：' + (rsync.stderr || rsync.stdout || '未知错误').trim())
  process.exit(1)
}

/* 数据库：使用 SQLite 自己的在线备份，得到一致副本 */
fs.mkdirSync(path.join(DEST, '.reader'), { recursive: true })
const db = spawnSync('sqlite3', [path.join(SOURCE, '.reader', 'state.sqlite'), `.backup '${path.join(DEST, '.reader', 'state.sqlite')}'`], { encoding: 'utf8' })
if (db.status !== 0) {
  fs.rmSync(DEST, { recursive: true, force: true })
  console.error('数据库备份失败：' + (db.stderr || '未知错误').trim())
  process.exit(1)
}

const docs = spawnSync('sqlite3', [path.join(DEST, '.reader', 'state.sqlite'), "select count(*) from nodes where kind='doc';"], { encoding: 'utf8' }).stdout.trim()

/* 只保留最近 N 份 */
const all = snapshots()
for (const name of all.slice(0, Math.max(0, all.length - KEEP))) {
  fs.rmSync(path.join(BASE, name), { recursive: true, force: true })
  console.log('已清理旧快照：' + name)
}

console.log(`快照完成：${DEST}`)
console.log(`文档记录 ${docs} 条，保留 ${Math.min(all.length, KEEP)} 份`)
