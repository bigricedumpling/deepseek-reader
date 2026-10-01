import { randomUUID } from 'node:crypto'
import { fault } from '../storage/workspace.js'

// 来源属于私人整理记录，不放进 Markdown 或可公开读取的页面元数据。
export function validateSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault('INVALID_SOURCE', '来源格式无效')
  const allowed = new Set(['kind', 'workspace', 'reference', 'note'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw fault('INVALID_SOURCE', '不支持的来源字段：' + key)
  const kind = value.kind
  if (!['conversation', 'workspace-file', 'import', 'manual'].includes(kind)) throw fault('INVALID_SOURCE', '来源类型无效')
  const out = { kind }
  for (const key of ['workspace', 'reference', 'note']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw fault('INVALID_SOURCE', '来源字段必须是文本：' + key)
    out[key] = (value[key] || '').trim()
  }
  if (out.workspace.length > 500 || out.reference.length > 2000 || out.note.length > 1000) throw fault('INVALID_SOURCE', '来源信息过长')
  return out
}

export function recordSource(repo, nodeId, value) {
  const source = validateSource(value)
  const id = randomUUID()
  repo.db.prepare('INSERT INTO sources (id,node,kind,workspace,reference,note,at) VALUES (?,?,?,?,?,?,?)')
    .run(id, nodeId, source.kind, source.workspace, source.reference, source.note, Date.now())
  return id
}
