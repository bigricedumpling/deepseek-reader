import { readerRequest } from '../contracts/reader'

export interface ActivityItem {
  id: string
  at: number
  action: string
  actionLabel: string
  actor: string
  actorKind: 'agent' | 'owner' | 'guest' | 'other'
  actorId: string
  docId: string
  path: string
  name: string
  hasDiff: boolean
  reviewed: boolean
}

export interface ActivityResponse {
  items: ActivityItem[]
  unread: number
  total: number
  limit: number
  offset: number
}

export interface ActivityDiff {
  id: string
  action: string
  actionLabel: string
  kind: 'create' | 'update' | 'delete' | 'rename' | 'move' | 'meta'
  path: string
  name: string
  before: string
  after: string
  versionId?: string
}

export async function getActivity(options: { limit?: number; offset?: number; all?: boolean } = {}) {
  const query = new URLSearchParams()
  if (options.limit) query.set('limit', String(options.limit))
  if (options.offset) query.set('offset', String(options.offset))
  if (options.all) query.set('all', '1')
  const suffix = query.toString()
  return readerRequest<ActivityResponse>('/activity' + (suffix ? '?' + suffix : ''))
}

export async function getActivityDiff(id: string) {
  return readerRequest<ActivityDiff>('/activity/diff?id=' + encodeURIComponent(id))
}

export async function reviewActivity(body: { id?: string; all?: boolean; reviewed?: boolean }) {
  return readerRequest<{ id?: string; reviewed: number | boolean }>('/activity/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}
