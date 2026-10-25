import fs from 'node:fs'
import path from 'node:path'
import { fault } from '../storage/workspace.js'

/*
 * Agent 改动收件箱。
 *
 * 数据本来就存在：operations 记录谁在什么时候动了哪些文件，versions 保存每次写入前的全文。
 * 这里只做三件事：把操作翻译成人能读的条目、找回这次操作前后的正文、记录哪些已经看过。
 * 不复制正文，也不改现有的写入协议。
 */

const labels = {
  'POST /doc': '新建',
  'PUT /doc': '修改',
  'PATCH /doc': '重命名',
  'PUT /move/doc': '移动',
  'DELETE /doc': '删除',
  'PUT /metadata': '页面设置',
  'POST /sources': '来源',
  'POST /asset': '图片',
  'POST /copy/doc': '复制',
  'POST /copy/category': '复制',
  'POST /category': '新建文件夹',
  'PATCH /category': '重命名',
  'DELETE /category': '删除',
  'PUT /order': '排序',
  'PUT /access': '权限'
}

const contentActions = new Set(['POST /doc', 'PUT /doc', 'PATCH /doc', 'PUT /move/doc', 'DELETE /doc'])
const diffActions = new Set(['POST /doc', 'PUT /doc'])

function parse(raw) {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

function fileList(details) {
  return Array.isArray(details?.files) ? details.files : []
}

function isVersionPath(value) {
  return typeof value === 'string' && /(^|\/)\.reader\/versions\/[^/]+\.md$/i.test(value)
}

function versionIdFrom(details) {
  for (const file of fileList(details)) {
    for (const value of [file.path, file.from, file.to]) {
      if (!isVersionPath(value)) continue
      const id = path.basename(value, '.md')
      if (id) return id
    }
  }
  return ''
}

function docPathFrom(details, action) {
  const subject = details?.subject || {}
  const files = fileList(details)
  const ordered = []
  if (action === 'PATCH /doc' || action === 'PUT /move/doc') ordered.push(subject.to)
  if (subject.path) ordered.push(subject.path)
  if (subject.file) ordered.push(subject.file)
  if (action === 'DELETE /doc') {
    for (const file of files) ordered.push(file.from)
  } else {
    for (const file of files) ordered.push(file.to, file.path, file.from)
  }
  for (const value of ordered) {
    if (typeof value !== 'string' || !value || isVersionPath(value) || value.startsWith('.reader/')) continue
    if (/\.md$/i.test(value)) return value
  }
  return ordered.find(value => typeof value === 'string' && value && !path.extname(value)) || ''
}

function resolveNode(repo, details, action) {
  const subject = details?.subject || {}
  if (subject.id) {
    const byId = repo.byId(String(subject.id))
    if (byId) return byId
  }
  const docPath = docPathFrom(details, action)
  if (!docPath) return null
  const direct = repo.db.prepare('SELECT id FROM nodes WHERE path=?').get(docPath)
  if (direct) return repo.byId(direct.id)
  const alias = repo.db.prepare('SELECT id FROM aliases WHERE path=?').get(docPath)
  if (alias) return repo.byId(alias.id)
  return null
}

function actorInfo(repo, actor) {
  if (typeof actor === 'string' && actor.startsWith('agent:')) {
    const id = actor.slice('agent:'.length)
    const key = repo.db.prepare('SELECT name, revoked FROM credentials WHERE id=?').get(id)
    return { kind: 'agent', id, name: key?.name || '已撤销的 Agent' }
  }
  if (actor === 'owner') return { kind: 'owner', id: '', name: '你' }
  if (actor === 'guest') return { kind: 'guest', id: '', name: '访客' }
  return { kind: 'other', id: '', name: String(actor || '未知') }
}

function readVersion(repo, version) {
  if (!version?.path) return ''
  try { return fs.readFileSync(path.join(repo.root, version.path), 'utf8') } catch { return '' }
}

function currentNode(repo, node) {
  if (!node?.id) return node
  return repo.byId(node.id) || node
}

function currentContent(repo, node) {
  const current = currentNode(repo, node)
  if (!current?.path) return ''
  try { return fs.readFileSync(path.join(repo.root, current.path), 'utf8') } catch { return '' }
}

function versionFor(repo, details, node, at) {
  const id = versionIdFrom(details)
  if (id) {
    const row = repo.db.prepare('SELECT rowid AS seq, * FROM versions WHERE id=?').get(id)
    if (row) return row
  }
  if (!node?.id) return null
  return repo.db.prepare('SELECT rowid AS seq, * FROM versions WHERE node=? AND at<=? ORDER BY at DESC, rowid DESC LIMIT 1').get(node.id, at)
}

function item(repo, row) {
  const details = parse(row.details)
  const actor = actorInfo(repo, row.actor)
  const subject = details.subject || {}
  const node = resolveNode(repo, details, row.action)
  const current = currentNode(repo, node)
  const docPath = current?.path || docPathFrom(details, row.action)
  return {
    id: row.id,
    at: row.at,
    action: row.action,
    actionLabel: labels[row.action] || row.action,
    actor: actor.name,
    actorKind: actor.kind,
    actorId: actor.id,
    docId: current?.id || String(subject.id || ''),
    path: docPath || '',
    name: docPath ? path.basename(docPath) : String(subject.name || ''),
    hasDiff: diffActions.has(row.action),
    reviewed: !!row.reviewedAt
  }
}

function diffFor(repo, row) {
  const details = parse(row.details)
  const node = resolveNode(repo, details, row.action)
  const current = currentNode(repo, node)
  const docPath = current?.path || docPathFrom(details, row.action)
  const base = { id: row.id, action: row.action, actionLabel: labels[row.action] || row.action, path: docPath, name: docPath ? path.basename(docPath) : '' }

  if (!contentActions.has(row.action)) return { ...base, kind: 'meta', before: '', after: '' }
  if (row.action === 'DELETE /doc') return { ...base, kind: 'delete', before: '', after: '' }
  if (row.action === 'PATCH /doc') return { ...base, kind: 'rename', before: '', after: '' }
  if (row.action === 'PUT /move/doc') return { ...base, kind: 'move', before: '', after: '' }

  const version = versionFor(repo, details, node, row.at)
  if (row.action === 'POST /doc') {
    const first = node?.id
      ? repo.db.prepare('SELECT rowid AS seq, * FROM versions WHERE node=? ORDER BY rowid LIMIT 1').get(node.id)
      : null
    return {
      ...base,
      kind: 'create',
      before: '',
      after: first ? readVersion(repo, first) : currentContent(repo, node),
      versionId: ''
    }
  }

  if (!version) {
    return { ...base, kind: 'update', before: '', after: currentContent(repo, node), versionId: '' }
  }
  const next = repo.db.prepare('SELECT rowid AS seq, * FROM versions WHERE node=? AND rowid>? ORDER BY rowid LIMIT 1').get(version.node, version.seq)
  return {
    ...base,
    kind: 'update',
    before: readVersion(repo, version),
    after: next ? readVersion(repo, next) : currentContent(repo, node),
    versionId: version.id
  }
}

export function activityService(repo) {
  function list({ limit = 50, offset = 0, all = false } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50))
    const safeOffset = Math.max(0, Number(offset) || 0)
    const where = all ? '' : "WHERE o.actor LIKE 'agent:%'"
    const rows = repo.db.prepare(
      `SELECT o.*, r.reviewedAt FROM operations o LEFT JOIN operation_reviews r ON r.operation=o.id ${where} ORDER BY o.at DESC, o.rowid DESC LIMIT ? OFFSET ?`
    ).all(safeLimit, safeOffset)
    const total = repo.db.prepare(`SELECT COUNT(*) AS n FROM operations o ${where}`).get().n
    const unread = repo.db.prepare(
      "SELECT COUNT(*) AS n FROM operations o LEFT JOIN operation_reviews r ON r.operation=o.id WHERE o.actor LIKE 'agent:%' AND r.operation IS NULL"
    ).get().n
    return { items: rows.map(row => item(repo, row)), unread, total, limit: safeLimit, offset: safeOffset }
  }

  function diff(id) {
    const row = repo.db.prepare('SELECT * FROM operations WHERE id=?').get(String(id || ''))
    if (!row) throw fault('NOT_FOUND', '找不到这条改动', 404)
    return diffFor(repo, row)
  }

  function review(id, reviewed = true) {
    const operation = String(id || '')
    if (!operation) throw fault('INVALID_REQUEST', '缺少操作编号')
    if (!repo.db.prepare('SELECT id FROM operations WHERE id=?').get(operation)) throw fault('NOT_FOUND', '找不到这条改动', 404)
    if (reviewed) repo.db.prepare('INSERT OR REPLACE INTO operation_reviews VALUES (?,?)').run(operation, Date.now())
    else repo.db.prepare('DELETE FROM operation_reviews WHERE operation=?').run(operation)
    return { id: operation, reviewed: !!reviewed }
  }

  function reviewAll() {
    const rows = repo.db.prepare("SELECT id FROM operations WHERE actor LIKE 'agent:%'").all()
    const at = Date.now()
    for (const row of rows) repo.db.prepare('INSERT OR REPLACE INTO operation_reviews VALUES (?,?)').run(row.id, at)
    return { reviewed: rows.length }
  }

  return { list, diff, review, reviewAll }
}
