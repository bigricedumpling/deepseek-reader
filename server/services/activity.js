import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { digest, fault } from '../storage/workspace.js'

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
  let details
  try { details = JSON.parse(raw || '{}') } catch { return {} }
  // Older Windows journals used backslashes. Nodes and aliases are keyed by slash-separated paths.
  for (const file of fileList(details)) {
    for (const key of ['path', 'from', 'to']) {
      if (typeof file[key] === 'string') file[key] = file[key].replaceAll('\\', '/')
    }
  }
  return details
}

function fileList(details) {
  return Array.isArray(details?.files) ? details.files : []
}

function isVersionPath(value) {
  return typeof value === 'string' && /(^|\/)\.reader\/versions\/[^/]+\.md$/i.test(value)
}

function docPathFrom(details, action) {
  const subject = details?.subject || {}
  const files = fileList(details)
  const ordered = []
  if (action === 'PATCH /doc' || action === 'PUT /move/doc') {
    /*
     * 改名/移动的 body 里只有旧路径，新路径在文件操作的 to 里。
     * 必须让 to 排在 subject.path 前面，否则列表会一直显示旧名字。
     */
    ordered.push(subject.to)
    for (const file of files) ordered.push(file.to, file.path, file.from)
    ordered.push(subject.path, subject.file)
  } else if (action === 'DELETE /doc') {
    ordered.push(subject.path, subject.file)
    for (const file of files) ordered.push(file.from, file.path, file.to)
  } else {
    ordered.push(subject.path, subject.file)
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
  if (actor === 'agent:local') return { kind: 'agent', id: 'local', name: '本机 Agent' }
  if (typeof actor === 'string' && actor.startsWith('agent:')) {
    const id = actor.slice('agent:'.length)
    const key = repo.db.prepare('SELECT name, revoked FROM credentials WHERE id=?').get(id)
    return { kind: 'agent', id, name: key?.name || '已撤销的 Agent' }
  }
  if (actor === 'owner') return { kind: 'owner', id: '', name: '你' }
  if (actor === 'guest') return { kind: 'guest', id: '', name: '访客' }
  return { kind: 'other', id: '', name: String(actor || '未知') }
}

// Both sides share content-addressed files with ordinary document history.
// An external editor can change the document immediately after the API returns.
function snapshotPath(node, revision) {
  return '.reader/versions/' + node + '/' + revision + '.md'
}

function writeSnapshot(repo, node, revision, content) {
  const relative = snapshotPath(node, revision)
  const file = path.join(repo.root, relative)
  if (!fs.existsSync(file)) repo.write(file, content)
  return relative
}

export function recordDocumentChange(repo, operation, node, before, after) {
  const afterRevision = digest(after)
  writeSnapshot(repo, node, afterRevision, after)
  repo.db.prepare('INSERT INTO activity_versions VALUES (?,?,?)').run(operation, node, afterRevision)
  if (before !== null) recordPreviousVersion(repo, node, before, operation)
  else pruneDocumentHistory(repo, node)
}

// One structural operation can update links in several documents.
export function recordPreviousVersion(repo, node, before, versionId = randomUUID()) {
  const revision = digest(before)
  const file = writeSnapshot(repo, node, revision, before)
  repo.db.prepare('INSERT INTO versions VALUES (?,?,?,?,?)').run(versionId, node, revision, file, Date.now())
  pruneDocumentHistory(repo, node)
}

function pruneDocumentHistory(repo, node) {
  // Imported history and creation receipts can age out on different writes.
  const candidates = new Map()
  const oldVersions = repo.db.prepare('SELECT id,path,revision FROM versions WHERE node=? ORDER BY at DESC,rowid DESC LIMIT -1 OFFSET 100').all(node)
  for (const version of oldVersions) {
    repo.db.prepare('DELETE FROM versions WHERE id=?').run(version.id)
    candidates.set(version.path, version.revision)
  }
  const oldReceipts = repo.db.prepare('SELECT operation,revision FROM activity_versions WHERE node=? ORDER BY rowid DESC LIMIT -1 OFFSET 100').all(node)
  for (const receipt of oldReceipts) {
    repo.db.prepare('DELETE FROM activity_versions WHERE operation=?').run(receipt.operation)
    candidates.set(snapshotPath(node, receipt.revision), receipt.revision)
  }
  for (const [file, revision] of candidates) {
    if (repo.db.prepare('SELECT 1 FROM versions WHERE node=? AND path=?').get(node, file)) continue
    if (file === snapshotPath(node, revision) && repo.db.prepare('SELECT 1 FROM activity_versions WHERE node=? AND revision=?').get(node, revision)) continue
    repo.remove(path.join(repo.root, file))
  }
}

function verifiedText(repo, node, revision) {
  if (!/^[a-f0-9-]{36}$/i.test(node) || !/^[a-f0-9]{64}$/.test(revision)) return null
  try {
    const text = fs.readFileSync(path.join(repo.root, snapshotPath(node, revision)), 'utf8')
    return digest(text) === revision ? text : null
  } catch { return null }
}

function currentNode(repo, node) {
  if (!node?.id) return node
  return repo.byId(node.id) || node
}

function item(repo, row) {
  const details = parse(row.details)
  const actor = actorInfo(repo, row.actor)
  const subject = details.subject || {}
  const node = resolveNode(repo, details, row.action)
  const current = currentNode(repo, node)
  /* 历史条目要显示“当时在哪”，而不是它后来被移到回收站后的路径。 */
  const historical = docPathFrom(details, row.action)
  const docPath = historical || current?.path || ''
  const available = !!current && !current.path.startsWith('.回收站/') && fs.existsSync(path.join(repo.root, current.path))
  return {
    id: row.id,
    at: row.at,
    action: row.action,
    actionLabel: labels[row.action] || row.action,
    actor: actor.name,
    actorKind: actor.kind,
    actorId: actor.id,
    docId: current?.id || String(subject.id || ''),
    path: docPath,
    currentPath: available ? current.path : '',
    name: docPath ? path.basename(docPath) : String(subject.name || ''),
    available,
    hasDiff: diffActions.has(row.action),
    reviewed: !!row.reviewedAt
  }
}

function diffFor(repo, row) {
  const details = parse(row.details)
  const node = resolveNode(repo, details, row.action)
  const current = currentNode(repo, node)
  const docPath = docPathFrom(details, row.action) || current?.path || ''
  const base = { id: row.id, action: row.action, actionLabel: labels[row.action] || row.action, path: docPath, name: docPath ? path.basename(docPath) : '' }

  if (!contentActions.has(row.action)) return { ...base, kind: 'meta', before: '', after: '' }
  if (row.action === 'DELETE /doc') return { ...base, kind: 'delete', before: '', after: '' }
  if (row.action === 'PATCH /doc') return { ...base, kind: 'rename', before: '', after: '' }
  if (row.action === 'PUT /move/doc') return { ...base, kind: 'move', before: '', after: '' }

  if (details.subject?.unchanged) return { ...base, kind: 'unchanged', before: '', after: '' }
  const unavailable = { ...base, kind: 'unavailable', before: '', after: '' }
  const receipt = repo.db.prepare('SELECT node,revision FROM activity_versions WHERE operation=?').get(row.id)
  if (!receipt) return unavailable
  const after = verifiedText(repo, receipt.node, receipt.revision)
  if (after === null) return unavailable
  if (row.action === 'POST /doc') return { ...base, kind: 'create', before: '', after, versionId: '' }
  const version = repo.db.prepare('SELECT revision FROM versions WHERE id=? AND node=?').get(row.id, receipt.node)
  const before = version ? verifiedText(repo, receipt.node, version.revision) : null
  return before === null ? unavailable : { ...base, kind: 'update', before, after, versionId: row.id }
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
